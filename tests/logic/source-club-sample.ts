import type { PlayerType } from "../../src/data/types";
import { createPlayer } from "../../src/logic/player";
import { createRng } from "../../src/logic/rng";

// Shared by offer-source-club.test.ts and its statistical sibling.

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const variance = (xs: number[]) => {
  const m = mean(xs);
  return mean(xs.map((x) => (x - m) ** 2));
};

/** Players from one source club. `seedOffset` decides whether two samples
 * share their draws: 0 for both gives a paired comparison, a large offset
 * gives independent ones.
 *
 * 200 000 is not excess for the cell sweep: it needs 3 000 observations per
 * (ovr, age) cell before its standard error drops under 0.2, and the cells
 * are spread over five ages and a dozen ratings. The cheaper tests below
 * pass a smaller count - createPlayer is cheap, but not free at six million
 * calls. */
export const sample = (
  sourceClubOvr: number,
  typ: PlayerType = "gotowy",
  seedOffset = 0,
  count = 200_000
) =>
  Array.from({ length: count }, (_, i) =>
    createPlayer(createRng((i + seedOffset) * 7919 + 13), typ, "ŚP", undefined, sourceClubOvr)
  );
