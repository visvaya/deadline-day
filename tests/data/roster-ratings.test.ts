import { expect, test } from "vitest";

import { CLUBS } from "../../src/data/clubs";
import { FIRST_DIVISION } from "../../src/data/first-division";
import { TEAM_RATINGS } from "../../src/data/team-ratings";

const rated = new Set(TEAM_RATINGS.clubs.map((club) => club.krotko));
const clubShortNames = CLUBS.map((club) => club.shortName);

/**
 * The match engine needs an attack/defence pair for every club that appears
 * in a league table, so the roster and the snapshot must name exactly the
 * same eighteen clubs. This is the invariant phase 3b builds on: without it
 * some clubs would need a rating invented out of nothing.
 */
test("every club has a rating in the snapshot", () => {
  expect(clubShortNames.filter((club) => !rated.has(club))).toEqual([]);
});

test("every rated club is one of ours, so the snapshot carries no dead entries", () => {
  const clubs = new Set(clubShortNames);
  expect(TEAM_RATINGS.clubs.map((club) => club.krotko).filter((club) => !clubs.has(club))).toEqual(
    []
  );
});

test("every playable club is one of ours and has a rating", () => {
  const clubs = new Set(clubShortNames);
  for (const klub of CLUBS) {
    expect(clubs.has(klub.shortName)).toBe(true);
    expect(rated.has(klub.shortName)).toBe(true);
  }
});

/**
 * The fourth direction, closed 2026-08-21: every rated club is playable too.
 * Since Task 6 every club a player can choose is exactly `CLUBS`, so this is
 * now the same claim as "every rated club is one of ours" above - kept as a
 * separate test because it reads the club catalogue directly rather than
 * through the earlier test's short-name set.
 */
test("every rated club can also be managed", () => {
  const playable = new Set(CLUBS.map((klub) => klub.shortName));
  const unplayable = TEAM_RATINGS.clubs
    .map((club) => club.krotko)
    .filter((club) => !playable.has(club))
    .sort();
  expect(unplayable).toEqual([]);
});

/**
 * The table shows abbreviations at 360 px, and the pool puts three different
 * Pogons in reach of one table: Szczecin from the top flight, Grodzisk and
 * Siedlce from below. "Wisla K."/"Wisla P." is the pattern to follow.
 */
test("every club in the league and the pool has a distinct short name", () => {
  const all = [
    ...TEAM_RATINGS.clubs.map((c) => c.krotko),
    ...FIRST_DIVISION.map((c) => c.shortName),
  ];
  expect(all.filter((k, i) => all.indexOf(k) !== i)).toEqual([]);
});

test("the pool holds eighteen clubs, none already in the league", () => {
  expect(FIRST_DIVISION).toHaveLength(18);
  const inLeague = new Set(TEAM_RATINGS.clubs.map((c) => c.nazwa));
  expect(FIRST_DIVISION.filter((c) => inLeague.has(c.name))).toEqual([]);
});

test("no pool club is stronger than the weakest league club", () => {
  const weakestLeague = Math.min(...TEAM_RATINGS.clubs.map((c) => Math.sqrt(c.attack * c.defence)));
  expect(Math.max(...FIRST_DIVISION.map((c) => c.strength))).toBeLessThanOrEqual(
    weakestLeague + 1e-9
  );
});
