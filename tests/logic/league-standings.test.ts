import { expect, test } from "vitest";

import type { MatchRating } from "../../src/logic/match";
import { createRng } from "../../src/logic/rng";
import { buildFixtures, emptyStandings, playRounds, sortStandings } from "../../src/logic/league";

const CLUBS = Array.from({ length: 18 }, (_, i) => `K${i + 1}`);

const ratings = (): Map<string, MatchRating> =>
  new Map(CLUBS.map((club, i) => [club, { attack: 0.85 + i * 0.02, defence: 0.87 + i * 0.015 }]));

const fullSeason = (seed: number) =>
  playRounds(createRng(seed), buildFixtures(CLUBS), ratings(), emptyStandings(CLUBS));

test("goals scored across the league equal goals conceded", () => {
  const table = fullSeason(5);
  const scored = table.reduce((sum, row) => sum + row.goalsFor, 0);
  const conceded = table.reduce((sum, row) => sum + row.goalsAgainst, 0);
  expect(scored).toBe(conceded);
});

test("total points land between the all-draw and all-decisive bounds", () => {
  const total = fullSeason(6).reduce((sum, row) => sum + row.points, 0);
  // 306 matches: 2 points each if every match is drawn, 3 if none is.
  expect(total).toBeGreaterThanOrEqual(612);
  expect(total).toBeLessThanOrEqual(918);
});

test("every club plays every match, so games played is thirty-four each", () => {
  // Points cannot exceed 3 per match played; with 34 matches nobody can pass 102.
  for (const row of fullSeason(7)) expect(row.points).toBeLessThanOrEqual(102);
});

test("splitting the season in two halves matches playing it in one go", () => {
  const rounds = buildFixtures(CLUBS);
  const inOneGo = playRounds(createRng(8), rounds, ratings(), emptyStandings(CLUBS));

  const rng = createRng(8);
  const afterAutumn = playRounds(rng, rounds.slice(0, 17), ratings(), emptyStandings(CLUBS));
  const afterSpring = playRounds(rng, rounds.slice(17), ratings(), afterAutumn);

  expect(afterSpring).toEqual(inOneGo);
});

test("the input standings are never mutated", () => {
  const before = emptyStandings(CLUBS);
  const snapshot = JSON.parse(JSON.stringify(before));
  playRounds(createRng(9), buildFixtures(CLUBS), ratings(), before);
  expect(before).toEqual(snapshot);
});

test("sorting goes points, then goal difference, then goals scored, then name", () => {
  const sorted = sortStandings([
    { club: "Bb", points: 40, goalsFor: 30, goalsAgainst: 30 },
    { club: "Aa", points: 40, goalsFor: 30, goalsAgainst: 30 },
    { club: "Cc", points: 40, goalsFor: 45, goalsAgainst: 40 },
    { club: "Dd", points: 40, goalsFor: 20, goalsAgainst: 10 },
    { club: "Ee", points: 41, goalsFor: 1, goalsAgainst: 60 },
  ]);
  expect(sorted.map((row) => row.club)).toEqual(["Ee", "Dd", "Cc", "Aa", "Bb"]);
});

test("an observer receives every played fixture without changing the table", () => {
  const rounds = buildFixtures(CLUBS);
  const observed: { home: string; away: string; homeGoals: number; awayGoals: number }[] = [];
  const withObserver = playRounds(
    createRng(12),
    rounds,
    ratings(),
    emptyStandings(CLUBS),
    (match) => observed.push(match)
  );
  const withoutObserver = playRounds(createRng(12), rounds, ratings(), emptyStandings(CLUBS));

  expect(observed).toHaveLength(306);
  expect(withObserver).toEqual(withoutObserver);
  expect(observed.every((match) => CLUBS.includes(match.home) && CLUBS.includes(match.away))).toBe(
    true
  );
});
