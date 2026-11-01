import { expect, test } from "vitest";

import { TEAM_RATINGS } from "../../src/data/team-ratings";

/** The snapshot is generated, so this guards the shape a refresh must keep,
 * not the values themselves. A refresh that breaks any of these is a
 * refresh that must not be committed. */
test("the ratings snapshot holds one plausible entry per Ekstraklasa club", () => {
  expect(TEAM_RATINGS.clubs).toHaveLength(18);
  expect(new Set(TEAM_RATINGS.clubs.map((club) => club.krotko)).size).toBe(18);
  expect(TEAM_RATINGS.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  for (const club of TEAM_RATINGS.clubs) {
    expect(club.krotko.length).toBeGreaterThan(0);
    expect(club.nazwa.length).toBeGreaterThan(0);
    // The model normalises the league average to 1.00; anything outside this
    // window means the parser latched onto the wrong column.
    expect(club.attack).toBeGreaterThan(0.5);
    expect(club.attack).toBeLessThan(2);
    expect(club.defence).toBeGreaterThan(0.5);
    expect(club.defence).toBeLessThan(2);
  }
});
