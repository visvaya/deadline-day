import { expect, test } from "vitest";

import { CLUBS } from "../../src/data/clubs";
import { startingMembership } from "../../src/logic/league-membership";

/**
 * Order matters more than it looks: game-reducer shuffles this list to build
 * the fixture order, and Fisher-Yates over a differently ordered array
 * consumes the same draws but produces a different schedule. CLUBS is now
 * the source `startingMembership` builds from, so the starting eighteen must
 * follow CLUBS's order exactly - not TEAM_RATINGS's, which is sorted by
 * rating and differs from CLUBS from the second entry on.
 */
test("the starting league follows CLUBS's order", () => {
  const inLeague = startingMembership().clubs.filter((c) => c.tier === "league");
  expect(inLeague.map((c) => c.shortName)).toEqual(CLUBS.map((c) => c.shortName));
});

/**
 * `startingMembership()` is called fresh at the start of every reducer
 * dispatch (the state only carries `rngState`), so two calls must be equal
 * in value but never share the arrays or club objects a caller might
 * mutate - immutability the reducer relies on throughout.
 */
test("two calls return equal memberships that share no arrays or club objects", () => {
  const a = startingMembership();
  const b = startingMembership();

  expect(a).toEqual(b);
  expect(a.clubs).not.toBe(b.clubs);
  expect(a.clubs[0]).not.toBe(b.clubs[0]);
});
