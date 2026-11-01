import type { Formation, Player } from "../data/types";
import type { AgeProfile } from "../data/balance";
import {
  AGE_GROWTH_MIN,
  AGE_GROWTH_MAX,
  AGE_DECLINE_JITTER,
  AGE_OVR_FLOOR,
  RETIREMENT_OVR,
  AGE_PROFILES,
  FORM_UP_ODDS,
  FORM_ROTATION_SLOTS,
  FORM_PENALTY_FLOOR,
} from "../data/balance";
import { rand, type Rng } from "./rng";
import { startingXi, substitutes } from "./squad";

/**
 * Replaces the three hard age thresholds with a smooth, accelerating curve.
 * Draws exactly one random value per player per season unconditionally in all
 * branches (growth, plateau, decline) - see the note below.
 * Draw order is part of the golden contract.
 */
export const develop = (rng: Rng, z: Player, profile: AgeProfile): Player => {
  const n = { ...z };
  if (n.wiek < profile.peakStart) {
    // One draw in every branch, unconditionally - see the note below.
    const growth = rand(rng, AGE_GROWTH_MIN, AGE_GROWTH_MAX);
    const luka = n.sufit - n.ovr;
    if (luka > 0) n.ovr = Math.round(n.ovr + luka * growth);
  } else if (n.wiek <= profile.peakEnd) {
    // The plateau is flat: age neither raises nor lowers ovr here. The draw
    // is consumed and discarded so that every branch costs exactly one
    // value - otherwise the stream would depend on the squad's age profile
    // and every golden diff would become guesswork.
    //
    // Until 2026-08-14 this branch rolled randInt(0, 1) and crept toward the
    // ceiling, which put "+1" arrows on thirty-two-year-olds. Variation
    // during the plateau now comes from the season form modifier alone -
    // playing time and club results - which moves ovr by at most one and
    // clamps at the ceiling.
    rng.next();
  } else {
    const lat = n.wiek - profile.peakEnd;
    const ubytek =
      (profile.declineBase + profile.declineAccel * (lat - 1)) *
      rand(rng, 1 - AGE_DECLINE_JITTER, 1 + AGE_DECLINE_JITTER);
    n.ovr = Math.max(AGE_OVR_FLOOR, Math.round(n.ovr - ubytek));
  }
  n.wiek += 1;
  return n;
};

/**
 * RNG-stream note (mentioned in commit message for Task 9's retrace):
 * Today's growth branch draws rand() CONDITIONALLY (wrapped in if (luka > 0)),
 * so a young player already at their ceiling draws nothing. The new
 * implementation draws UNCONDITIONALLY in every branch (growth, plateau,
 * decline), always exactly one rand/randInt call per player per season
 * regardless of squad state. This is a deliberate simplification for
 * deterministic reasoning about the RNG stream, but it is itself a separate
 * reason golden traces will differ beyond the curve shape changing.
 */

export type SeasonForm = { overperformed: boolean };

/**
 * Season form applied on top of the age curve, at every age. Reads only
 * public quantities (playing status follows from visible ovr, age and name
 * via startingXi and substitutes; id only breaks a complete visible tie),
 * club form from the table: sufit never enters, so this cannot leak the
 * hidden ceiling.
 *
 * Draws from rng UNCONDITIONALLY, even on branches that ignore the roll, so
 * the number of draws per player per season is fixed at one regardless of
 * squad state. A conditional draw would make the stream depend on squad
 * composition and turn every golden diff into guesswork.
 */
export const formAdjustment = (rng: Rng, played: boolean, overperformed: boolean): number => {
  const roll = rng.next();
  if (played && overperformed) return roll < FORM_UP_ODDS ? 1 : 0;
  if (!played && !overperformed) return -1;
  return 0;
};

/**
 * Mirrors prototype's starzenieKadry :101-113, but no longer replaces a
 * retiree 1:1 - a position only gets a fresh academy debutant if it ends
 * the season completely empty, via squad.ts's fillEmptyPositions.
 * Players who declined a
 * PRZEDLUZENIE card (wygasa) leave first, before develop() runs - they
 * don't age, they just go. Squad size after that filter drives
 * the number of develop() draws - one per remaining player, in array order.
 * Do not reorder.
 */
export const ageSquad = (
  rng: Rng,
  kadra: readonly Player[],
  form: SeasonForm,
  formation: Formation
): { kadra: Player[]; emeryci: Player[]; odeszli: Player[] } => {
  const odeszli = kadra.filter((z) => z.wygasa);
  const remaining = kadra.filter((z) => !z.wygasa);
  const emeryci: Player[] = [];

  // Compute "played" set once per season, before the per-player loop. Built
  // from `remaining`, not `kadra`: a player leaving via wygasa this season
  // must not occupy an XI/rotation slot in this calculation - that slot
  // belongs to whoever is actually staying, not to someone who is already
  // gone and will never be evaluated by the loop below.
  //
  // The formation is required, not optional: without it this picks the five
  // players a modern squad happens to share with the prototype's eight
  // codes, and everyone else is marked as not having played - which hands
  // two thirds of the squad a form penalty they did not earn.
  const played = new Set([
    ...startingXi(remaining, formation).map((z) => z.id),
    ...substitutes(remaining, formation)
      .slice(0, FORM_ROTATION_SLOTS)
      .map((z) => z.id),
  ]);

  const nowa = remaining
    .map((z) => {
      const aged = develop(rng, z, AGE_PROFILES[z.poz]);
      // Apply form adjustment on top of age-based development
      const formAdj = formAdjustment(rng, played.has(z.id), form.overperformed);
      // Each clamp applies only in its own direction, per formAdj's sign -
      // never both, and never when form is neutral. Applying either clamp
      // unconditionally (as an earlier version of this line did) was a
      // three-part bug: (1) Math.max(FLOOR, ...) on the whole composite
      // would rescue a player who had already declined below FORM_PENALTY_
      // FLOOR from age alone, silently disabling ability-based retirement
      // for everyone; (2) that same rescue could push ovr above sufit when
      // sufit happened to sit below the floor, breaking the "never raise
      // ovr past ceiling" invariant from develop(); (3) Math.min(sufit, ...)
      // firing even when formAdj was 0 could still pull an organically-
      // above-sufit veteran down an extra point on a season where form did
      // nothing at all. Splitting by sign, and only flooring a penalty when
      // the player started at or above the floor, fixes all three: a
      // neutral season never touches ovr; a bonus only ever clamps against
      // sufit; a penalty only protects players who haven't already crossed
      // the floor via age decline alone - once age has put someone below
      // it, retirement is already decided and form has nothing left to
      // guard.
      const withForm =
        formAdj > 0
          ? Math.min(aged.sufit, aged.ovr + formAdj)
          : formAdj < 0
            ? aged.ovr >= FORM_PENALTY_FLOOR
              ? Math.max(FORM_PENALTY_FLOOR, aged.ovr + formAdj)
              : aged.ovr + formAdj
            : aged.ovr;
      return { player: { ...aged, ovr: withForm }, ovrLastPlayed: z.ovr };
    })
    .filter(({ player, ovrLastPlayed }) => {
      if (player.wiek > 35 || player.ovr < RETIREMENT_OVR) {
        // Retire him with the rating he carried through the season he
        // actually played, not the one left after the decline that ended
        // his career. Ability-based retirement triggers below RETIREMENT_OVR, so
        // reporting the post-decline value meant every such farewell read
        // "OVR 46" - true, but describing a season nobody saw him play.
        emeryci.push({ ...player, ovr: ovrLastPlayed });
        return false;
      }
      return true;
    })
    .map(({ player }) => player);
  return { kadra: nowa, emeryci, odeszli };
};
