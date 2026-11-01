import type { EuropeanCup, Formation, FormationId, Player, PositionCode } from "../data/types";
import {
  POSITION_WEIGHTS,
  RATING_OVR_REFERENCE,
  RATING_OVR_SCALE,
  SQUAD_BENCH_BUFFER,
} from "../data/balance";
import { FORMACJE } from "../data/positions";
import { benchWeight } from "./european-cups";
import type { MatchRating } from "./match";
import { createPlayer, createStartingSquadPlayer } from "./player";
import { type Rng } from "./rng";
import { formationTargetOvr } from "./squad-targets";
import { sideAdjustment } from "./player-impact";
import { at } from "./invariant";

/** The formation a career is being played in. Stored as an id so the save
 * file carries a short, versionable string rather than a copy of the whole
 * layout. */
export const formationOf = (state: { formacja: FormationId }): Formation =>
  FORMACJE[state.formacja];

/**
 * Who plays first, and who stays when a position is over capacity.
 *
 * Until 2026-08-27 the answer was the array order of `kadra` - the starting
 * squad in generation order, then signings in purchase order. Stable sort,
 * deterministic, and completely invisible to the player: two identical
 * centre-backs, and the one appended first played.
 *
 * Age first, because at equal ability the younger player is the better bet:
 * he gets the shirt, and the older player is the first eviction candidate.
 * Playing status feeds the season form modifier, which feeds ovr. Then the
 * name, then the id, so the comparator is total: names are drawn from pools
 * and can collide outright.
 *
 * Ovr, age and name are visible. Id is not: it is admitted only as a stable
 * fallback when two players are otherwise indistinguishable. Read it
 * lexically; never call selectAnalystProfile or derive a hidden signal here.
 * Playing time drives development, so sufit must never enter this order.
 */
export const bySquadPriority = (a: Player, b: Player): number =>
  b.ovr - a.ovr ||
  a.wiek - b.wiek ||
  // Locale pinned, not defaulted - the same decision, and the same reason, as
  // sortStandings in league.ts.
  a.nazwa.localeCompare(b.nazwa, "pl") ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Mirrors prototype's wybierzXI.
 *
 * The formation is required, never optional. It used to default to the
 * prototype's eight position codes, which meant a caller who forgot it got a
 * plausible-looking wrong answer rather than an error: a modern squad shares
 * only a handful of codes with that list, so the eleven came back with about
 * five players in it. Four callers did forget, and the player's own club
 * spent a while being rated off a fifth of a team.
 */
export const startingXi = (squad: readonly Player[], formation: Formation): Player[] => {
  const xi: Player[] = [];
  formation.pozycje.forEach((slot) => {
    const atPosition = squad.filter((player) => player.poz === slot.kod).sort(bySquadPriority);
    for (let i = 0; i < slot.xi; i += 1) {
      const player = atPosition[i];
      if (player) xi.push(player);
    }
  });
  return xi;
};

/**
 * What signing this player would cost the squad at his position.
 *
 * `evictsExisting` names the player who would leave, so the caller can show
 * him before the decision rather than announce him after it.
 * `rejectsIncoming` means the new player would himself rank last - the offer
 * is useless and must never reach the screen.
 *
 * Pure: sorts a local copy, never the caller's squad.
 */
export type AcquisitionCapacityOutcome =
  | { kind: "fits" }
  | { kind: "evictsExisting"; player: Player }
  | { kind: "rejectsIncoming" };

export const acquisitionCapacityOutcome = (
  squad: readonly Player[],
  incoming: Player,
  formation: Formation
): AcquisitionCapacityOutcome => {
  const slot = formation.pozycje.find((candidate) => candidate.kod === incoming.poz);
  if (!slot) throw new Error(`squad depth: ${incoming.poz} is not in formation ${formation.id}`);
  const onPosition = [...squad.filter((player) => player.poz === incoming.poz), incoming];
  if (onPosition.length <= slot.kadra + SQUAD_BENCH_BUFFER) return { kind: "fits" };
  const ranked = onPosition.sort(bySquadPriority);
  const last = at(ranked, ranked.length - 1, "last player at the position");
  return last.id === incoming.id
    ? { kind: "rejectsIncoming" }
    : { kind: "evictsExisting", player: last };
};

export type SquadSlot =
  | Player
  | { id: string; poz: PositionCode; ovr: null; wiek: null; nazwa: string; brak: true };

/** Mirrors prototype's xiWKolejnosci. */
export const xiInOrder = (kadra: readonly Player[], formation: Formation): SquadSlot[] => {
  const xi = startingXi(kadra, formation);
  const uzyte = new Set<string>();
  return formation.kolejnoscXi.map((kod, i) => {
    const z = xi.find((p) => p.poz === kod && !uzyte.has(p.id));
    if (z) {
      uzyte.add(z.id);
      return z;
    }
    return {
      id: `pusty-${kod}-${i}`,
      poz: kod,
      ovr: null,
      wiek: null,
      nazwa: "–",
      brak: true as const,
    };
  });
};

/** Mirrors prototype's rezerwowi. */
export const substitutes = (squad: readonly Player[], formation: Formation): Player[] => {
  const xi = new Set(startingXi(squad, formation).map((player) => player.id));
  return squad.filter((player) => !xi.has(player.id)).sort(bySquadPriority);
};

/**
 * Mirrors prototype's silaKadry but without signed-player impact.
 * Used for analyst context where domain correction should not feed back.
 * No rng - pure aggregate.
 */
export const baseSquadStrength = (
  kadra: readonly Player[],
  cup: EuropeanCup | null,
  formation: Formation
): number => {
  const xi = startingXi(kadra, formation);
  const sr = xi.length ? xi.reduce((s, z) => s + z.ovr, 0) / xi.length : 50;
  const l = substitutes(kadra, formation).slice(0, 6);
  const srL = l.length ? l.reduce((s, z) => s + z.ovr, 0) / l.length : sr - 10;
  const weight = benchWeight(cup);
  return sr * weight.xi + srL * weight.bench;
};

/**
 * Mirrors prototype's silaKadry with signed-player domain impact.
 * Incorporates the hidden impact of signed players on club attack/defence,
 * weighted by their participation (XI vs bench) and position domain.
 * No rng - pure aggregate.
 */
export const squadStrength = (
  kadra: readonly Player[],
  cup: EuropeanCup | null,
  formation: Formation
): number => {
  const base = baseSquadStrength(kadra, cup, formation);

  const xi = startingXi(kadra, formation);
  const bench = substitutes(kadra, formation).slice(0, 6);
  const weight = benchWeight(cup);

  // Aggregate impact adjustments
  const xiAttackAdj = sideAdjustment(xi, "attack");
  const xiDefenceAdj = sideAdjustment(xi, "defence");
  const benchAttackAdj = sideAdjustment(bench, "attack");
  const benchDefenceAdj = sideAdjustment(bench, "defence");

  // Average the two sides (per-side half-sum), then weight by XI/bench participation
  const avgXiAdj = (xiAttackAdj + xiDefenceAdj) / 2;
  const avgBenchAdj = (benchAttackAdj + benchDefenceAdj) / 2;
  const totalAdj = avgXiAdj * weight.xi + avgBenchAdj * weight.bench;

  return base + totalAdj;
};

/**
 * Fills any position left with zero players - after a sale, a refused
 * contract extension, or end-of-season retirement - with one academy
 * debutant. Called immediately wherever the squad shrinks, not once per
 * season. Draw order follows the formation's own position order.
 */
export const fillEmptyPositions = (
  rng: Rng,
  kadra: readonly Player[],
  clubStrength: number | undefined,
  formation: Formation
): { kadra: Player[]; debiutanci: Player[] } => {
  let nowa = [...kadra];
  const debiutanci: Player[] = [];
  formation.pozycje.forEach((t) => {
    if (nowa.some((z) => z.poz === t.kod)) return;
    const debiutant = createPlayer(rng, "akademia", t.kod, clubStrength);
    nowa = [...nowa, debiutant];
    debiutanci.push(debiutant);
  });
  return { kadra: nowa, debiutanci };
};

/**
 * A starting squad built from the club's own attack/defence pair rather than
 * from a single hand-written `sila`. Each position is filled around the ovr
 * that formationTargetOvr says this club must average there, so a side with
 * a strong attack and a weak defence comes out visibly lopsided instead of
 * uniformly mediocre.
 *
 * Deliberately does NOT weaken a handful of starters the way createSquad
 * does. That randomised handicap existed to make a club worse than its
 * `sila` suggested; the club's weakness now lives in its rating, and
 * applying both would count it twice - about ten percent of the rating on
 * the hard level, which is more than the gap between neighbouring clubs.
 *
 * The eleven's bonus is centred on zero (unlike createSquad's -4..+6, which
 * averages +1): the target IS the intended mean, so an off-centre spread
 * would systematically miss the club it was solved for.
 */
export const createSquadFromFormation = (
  rng: Rng,
  formation: Formation,
  rating: MatchRating
): Player[] => {
  const targets = formationTargetOvr(formation, rating);
  const kadra: Player[] = [];
  for (const slot of formation.pozycje) {
    const target = targets.get(slot.kod);
    if (target === undefined) {
      throw new Error(`createSquadFromFormation: ${formation.id} has no target for ${slot.kod}`);
    }
    for (let i = 0; i < slot.kadra; i += 1) {
      kadra.push(createStartingSquadPlayer(rng, slot.kod, target, i < slot.xi));
    }
  }
  return kadra;
};

/** Weighted mean of a group of players on one side of the pitch. Returns
 * null when nobody carries any weight there, so the caller can fall back
 * rather than divide by zero. */
const weightedOvr = (players: readonly Player[], side: "attack" | "defence"): number | null => {
  let total = 0;
  let weight = 0;
  for (const player of players) {
    const w = POSITION_WEIGHTS[player.poz][side];
    total += player.ovr * w;
    weight += w;
  }
  return weight > 0 ? total / weight : null;
};

const toRating = (ovr: number): number => Math.exp((ovr - RATING_OVR_REFERENCE) / RATING_OVR_SCALE);

/**
 * The squad's attack and defence on the external model's scale, built from
 * the same automatic XI and bench weighting as squadStrength - so "playing
 * in Europe rewards depth" keeps working unchanged.
 *
 * Incorporates signed-player domain impact via sideAdjustment for each side.
 *
 * Reads OVR plus the ceiling-independent marketEdge of players signed by the
 * user. Never sufit: these ratings drive the visible goals column.
 */
export const squadRatings = (
  kadra: readonly Player[],
  cup: EuropeanCup | null,
  formation: Formation
): MatchRating => {
  const xi = startingXi(kadra, formation);
  const bench = substitutes(kadra, formation).slice(0, 6);
  const weight = benchWeight(cup);

  const side = (which: "attack" | "defence"): number => {
    const xiOvr = weightedOvr(xi, which) ?? 50;
    const benchOvr = weightedOvr(bench, which) ?? xiOvr - 10;

    // Apply signed-player impact adjustments
    const xiAdj = sideAdjustment(xi, which);
    const benchAdj = sideAdjustment(bench, which);

    const weightedRaw = xiOvr * weight.xi + benchOvr * weight.bench;
    const weightedAdj = xiAdj * weight.xi + benchAdj * weight.bench;

    return toRating(weightedRaw + weightedAdj);
  };

  return { attack: side("attack"), defence: side("defence") };
};
