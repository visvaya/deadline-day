import type { Formation, Player, PositionCode } from "../../data/types";
import { pluralPl } from "../../logic/format";
import { startingXi, substitutes } from "../../logic/squad";

/**
 * The two things worth knowing about a position before opening anything: how
 * many bodies are on it, and whether it is in good shape.
 *
 * Shared by the offer card's preview block and the reports drawer, so the
 * same position cannot be described one way on the card and another in the
 * drawer that opens from it.
 *
 * Visible OVR only, so neither opens a channel of its own.
 */

export type PositionQuality = "dobra" | "średnia" | "słaba";

/**
 * Counts, and nothing else - arithmetic anyone can check against the tiles.
 *
 * The block used to lead with a judgement ("słabszy punkt kadry") which never
 * said what it was measuring against, so the reader could not tell whether it
 * meant weak in the league, weak for us, or weak for this offer. The
 * judgement now has a line of its own.
 */
export const positionDepth = (starterCount: number, benchCount: number): string =>
  [
    pluralPl(starterCount, ["podstawowy", "podstawowych", "podstawowych"]),
    pluralPl(benchCount, ["zmiennik", "zmienników", "zmienników"]),
  ].join(" · ");

/**
 * Whether the position is in good shape, in one word.
 *
 * Two factors, scored 0-2 each, because a position fails in two different
 * ways and one number would hide which:
 *
 * - the starter, against the mean of our own XI. Not against the league: the
 *   question is whether this slot drags the team down relative to the rest of
 *   it, which is the thing the player can act on.
 * - the cover behind him - how many, and how far the drop-off. European
 *   football raises what counts as enough, because squadRatings weights the
 *   bench more heavily when there is a campaign to play (see benchWeight).
 */
export const positionQuality = (
  squad: readonly Player[],
  formation: Formation,
  position: PositionCode,
  inEurope: boolean
): PositionQuality => {
  const xi = startingXi(squad, formation);
  const onPosition = xi.filter((player) => player.poz === position);
  const bench = substitutes(squad, formation).filter((player) => player.poz === position);
  const starterOvr = onPosition.length ? Math.max(...onPosition.map((p) => p.ovr)) : null;

  const average = xi.length ? xi.reduce((total, p) => total + p.ovr, 0) / xi.length : 0;
  const starterPoints =
    starterOvr === null ? 0 : starterOvr - average >= 2 ? 2 : starterOvr - average >= -3 ? 1 : 0;

  // Cover wanted scales with how many slots the formation puts on this
  // position. Flat until 2026-09-03, which read two ways at once: three
  // centre-backs in 5-3-2 with a single reserve scored full marks, while one
  // goalkeeper with two scored the same - one is thin cover for three slots,
  // the other is a third keeper nobody needs.
  //
  // Sub-linear on purpose. One reserve per slot is not how squads are built:
  // a back three carries four or five centre-backs, not six. Halving keeps
  // today's answer exactly for every single-slot position (1, or 2 in
  // Europe) and only moves the multi-slot ones, which is where the fault was.
  //
  // FormationSlot.kadra is not the source, though it looks like one: def()
  // sets it to xi + 1 for every position, so it carries the same flatness
  // this fixes. Changing that would resize generated squads and belongs to
  // whoever wants per-position squad sizes.
  const slots = formation.pozycje.find((slot) => slot.kod === position)?.xi ?? 1;
  const wanted = Math.ceil(slots / 2) + (inEurope ? 1 : 0);
  const best = bench.length ? Math.max(...bench.map((p) => p.ovr)) : null;
  const dropOff = starterOvr !== null && best !== null ? starterOvr - best : Infinity;
  const depthPoints = bench.length === 0 ? 0 : bench.length < wanted || dropOff > 10 ? 1 : 2;

  const total = starterPoints + depthPoints;
  return total >= 3 ? "dobra" : total >= 2 ? "średnia" : "słaba";
};
