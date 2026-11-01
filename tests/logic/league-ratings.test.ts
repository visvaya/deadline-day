import { expect, test } from "vitest";

import { FORMACJE } from "../../src/data/positions";
import { TEAM_RATINGS } from "../../src/data/team-ratings";
import { createRng } from "../../src/logic/rng";
import { createSquadFromFormation, squadRatings, startingXi } from "../../src/logic/squad";
import { leagueRatings } from "../../src/logic/league-ratings";
import { currentRating, startingMembership } from "../../src/logic/league-membership";

const FORMACJA = FORMACJE["4-3-3"];
const squad = () =>
  createSquadFromFormation(createRng(0x1234_5678), FORMACJA, { attack: 1.05, defence: 0.95 });

/** Rivals come from the membership now, not straight from the snapshot, so a
 * club that has bounced between the tiers is rated at what it is today. */
test("a rival is rated by currentRating, not by its base pair", () => {
  const membership = startingMembership();
  const legia = membership.clubs.find((c) => c.shortName === "Legia")!;
  legia.swaps = 2;

  const ratings = leagueRatings(squad(), null, "Lech", FORMACJA, membership);
  expect(ratings.get("Legia")).toEqual(currentRating(legia));
  expect(ratings.get("Legia")!.attack).toBeCloseTo(1.02 * 0.9975, 6);
});

test("the full league has an entry for every club including the player's", () => {
  const ratings = leagueRatings(squad(), null, "Lech", FORMACJA, startingMembership());
  expect(ratings.size).toBe(TEAM_RATINGS.clubs.length);
  expect(ratings.has("Lech")).toBe(true);
});

test("the player's club is rated from the squad, not from the snapshot", () => {
  const kadra = squad();
  const ratings = leagueRatings(kadra, null, "Lech", FORMACJA, startingMembership());
  expect(ratings.get("Lech")).toEqual(squadRatings(kadra, null, FORMACJA));
  expect(ratings.get("Lech")).not.toEqual({ attack: 1.24, defence: 1.16 });
});

test("an unknown club name throws instead of silently producing a short league", () => {
  expect(() =>
    leagueRatings(squad(), null, "Nie Istnieje", FORMACJA, startingMembership())
  ).toThrow(/Nie Istnieje/);
});

test("the club is rated off a full eleven, whatever the formation", () => {
  // Until 2026-08-17 the formation was optional and startingXi fell back to
  // the prototype's eight position codes, finding only the handful a modern
  // squad shares with them and rating the club off part of a team - which
  // understated Lech by 8% in the league table.
  //
  // The fallback is gone and the argument is required, so that particular
  // mistake is now a compile error rather than a plausible wrong number.
  // What is left worth checking is the positive half: whatever formation a
  // career draws, every one of them can field a full eleven.
  for (const formation of Object.values(FORMACJE)) {
    const kadra = createSquadFromFormation(createRng(7), formation, {
      attack: 1.05,
      defence: 0.95,
    });
    expect(startingXi(kadra, formation), formation.id).toHaveLength(11);
  }
});
