import type { Action, Policy } from "./simulate";
import type { Offer, Player } from "../data/types";
import { bySquadPriority, formationOf } from "./squad";
import { at } from "./invariant";

// SPRZEDAZ banks cash, PRZEDLUZENIE's cena is a wage ask (not a cash cost) -
// the UI's own canTake treats both the same way (offer-window-screen.tsx),
// so the balance simulator's "bierz" must match or a low-cash policy would
// wrongly degrade an affordable extension to "pas".
const canAfford = (card: { typ: string; cena: number }, kasa: number): boolean =>
  card.typ === "SPRZEDAZ" || card.typ === "PRZEDLUZENIE" || card.cena <= kasa;

// "bierz" is only ever rendered enabled when the player can afford the card.
// Every named policy below is wrapped in this so a raw "bierz" choice never
// throws on a disabled control - it degrades to "pas" instead.
const guarded =
  (policy: Policy): Policy =>
  (ctx) => {
    const action = policy(ctx);
    return action === "bierz" && !canAfford(ctx.card, ctx.state.kasa) ? "pas" : action;
  };

export const alwaysPass: Policy = () => "pas";
export const alwaysHaggle: Policy = () => "targ";
export const alwaysTake: Policy = guarded(() => "bierz");

export const cycle = (actions: Action[], offset = 0): Policy =>
  guarded(({ index }) => at(actions, (index + offset) % actions.length, "cycle policy action"));

export const youngOnly: Policy = guarded(({ card }) =>
  card.zawodnik.wiek <= 23 ? "bierz" : "pas"
);

// readyOnly (>= 27) mixes "gotowy" (24-28, flat ovr until 30) and "weteran"
// (30-34, ovr already declining) into one bucket. It is load-bearing for the
// "sami-gotowi" golden scenario and must not change. primeOnly/veteranOnly
// below split it into the two disjoint age bands createPlayer actually
// draws from, for balance measurement only.
export const readyOnly: Policy = guarded(({ card }) =>
  card.zawodnik.wiek >= 27 ? "bierz" : "pas"
);

export const primeOnly: Policy = guarded(({ card }) =>
  card.zawodnik.wiek >= 24 && card.zawodnik.wiek <= 29 ? "bierz" : "pas"
);

export const veteranOnly: Policy = guarded(({ card }) =>
  card.zawodnik.wiek >= 30 ? "bierz" : "pas"
);

export const stallThenTake: Policy = guarded(({ state }) =>
  state.przeciagniecia < 3 ? "czas" : "bierz"
);

/** Age filter that only ever buys: "pas" on SPRZEDAZ regardless of age, so the
 * policy never sells its own squad out from under itself. Also "pas" on
 * PRZEDLUZENIE - it isn't a purchase either. The plain youngOnly/primeOnly/veteranOnly above
 * answer "bierz" on both card types too, which means they sell/extend
 * players in their own target band, a methodological caveat for any
 * age-policy comparison. */
const buyOnlyAged = (min: number, max: number): Policy =>
  guarded(({ card }) =>
    card.typ !== "SPRZEDAZ" &&
    card.typ !== "PRZEDLUZENIE" &&
    card.zawodnik.wiek >= min &&
    card.zawodnik.wiek <= max
      ? "bierz"
      : "pas"
  );

export const youngOnlyBuy: Policy = buyOnlyAged(0, 23);
export const primeOnlyBuy: Policy = buyOnlyAged(24, 29);
export const veteranOnlyBuy: Policy = buyOnlyAged(30, Infinity);

/**
 * Sell-decision experiment: identical to youngOnlyBuy in every respect
 * except the answer to SPRZEDAZ. Run against youngOnlyBuy on the same seeds,
 * the pair isolates the causal effect of selling from the confounding that
 * makes an observational regression useless here - a game with a valuable
 * squad is also a game with good decisions everywhere else, so the raw
 * correlation between squad value and legacy overstates the effect.
 * Measurement instrument, never a golden scenario.
 */
export const youngBuySellAlways: Policy = guarded(({ card }) =>
  card.typ === "SPRZEDAZ" ||
  (card.typ !== "PRZEDLUZENIE" && card.zawodnik.wiek >= 0 && card.zawodnik.wiek <= 23)
    ? "bierz"
    : "pas"
);

/** The only policy that reasons about squad depth: it extends its own
 * players, sells only surplus, and buys only into a thinning position.
 * Exists because every other policy filters by age or price and therefore
 * bleeds squad size under the post-2026-08-12 academy rules. Measurement instrument,
 * never a golden scenario. SPRZEDAZ only when held > design + 1; KUPNO at
 * held <= design to balance squad depth with cash management. */
export const depthFirst: Policy = guarded(({ card, state }) => {
  const design = formationOf(state).pozycje.find((t) => t.kod === card.zawodnik.poz)?.kadra ?? 2;
  const held = state.kadra.filter((z) => z.poz === card.zawodnik.poz).length;
  if (card.typ === "PRZEDLUZENIE") return "bierz";
  if (card.typ === "SPRZEDAZ") return held > design + 1 ? "bierz" : "pas";
  return held <= design ? "bierz" : "pas";
});

/**
 * Buys on the analyst report, controlling for what the player's OVR already
 * implies. Measurement instrument for the reward on a data-driven read, not a
 * golden scenario.
 *
 * The edge, not the raw percentile, is the whole point. A percentile is
 * derived from OVR, so "buy when the report reads high" would mostly buy high
 * OVR and the comparison against a blind buyer would measure nothing but that.
 * Subtracting what OVR alone predicts leaves the part the report actually
 * adds - the hidden marketEdge. This policy measures a playable data-driven
 * strategy; it is not by itself a causal measurement of the impact multiplier.
 */
const analystEdge = (card: Offer): number => {
  const expected = Math.min(99, Math.max(3, Math.round((card.zawodnik.ovr - 56) * 4)));
  const mean =
    (card.analystReport.metrics[0].percentile + card.analystReport.metrics[1].percentile) / 2;
  return mean - expected;
};

const isPurchase = (card: Offer): boolean => card.typ !== "SPRZEDAZ" && card.typ !== "PRZEDLUZENIE";

/** Buys a purchase card only when both metrics read above what OVR predicts. */
export const analystEdgeBuy: Policy = guarded(({ card }) =>
  isPurchase(card) && analystEdge(card) >= 8 ? "bierz" : "pas"
);

/** How many of the best squad players count as stars. A measurement
 * definition, not a balance constant: it only selects which SPRZEDAZ cards the
 * star-sale experiment answers differently. */
export const OWN_STAR_RANK = 3;

/** A player we signed who ranks in the top OWN_STAR_RANK of the current squad
 * by bySquadPriority. Visible inputs only (moj, ovr, age, name, id) - never the
 * ceiling or any staff or analyst read. */
export const isOwnStar = (squad: readonly Player[], player: Player): boolean =>
  squad.some((candidate) => candidate.id === player.id && candidate.moj) &&
  [...squad]
    .sort(bySquadPriority)
    .slice(0, OWN_STAR_RANK)
    .some((candidate) => candidate.id === player.id);

/**
 * Star-sale experiment: identical to youngOnlyBuy except that it accepts a
 * SPRZEDAZ card for one of its own stars. Run against youngOnlyBuy on the same
 * seeds, the pair measures whether keeping or selling a developed star leads
 * to different but comparable outcomes (spec 4, chapter 12.2). Measurement
 * instrument, never a golden scenario.
 */
export const youngBuySellStars: Policy = guarded(({ card, state, index }) => {
  if (card.typ === "SPRZEDAZ") return isOwnStar(state.kadra, card.zawodnik) ? "bierz" : "pas";
  return youngOnlyBuy({ card, state, index });
});
