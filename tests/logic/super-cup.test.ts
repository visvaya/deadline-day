import { expect, test } from "vitest";

import type { LeagueStanding } from "../../src/data/types";
import type { MatchRating } from "../../src/logic/match";
import { createRng } from "../../src/logic/rng";
import { resolveSuperCup } from "../../src/logic/super-cup";

const table = (names: readonly string[]): LeagueStanding[] =>
  names.map((club, i) => ({ club, points: 70 - i, goalsFor: 60 - i, goalsAgainst: 20 + i }));

const ratings = (names: readonly string[]): Map<string, MatchRating> =>
  new Map(names.map((club) => [club, { attack: 1, defence: 1 }]));

const NAMES = ["Lech", "Legia", "Raków", "Pogoń"];

test("no match and no draw when the player's club is in neither role", () => {
  const rng = createRng(5);
  const before = rng.state();
  expect(resolveSuperCup(rng, table(NAMES), "Legia", "Pogoń", ratings(NAMES))).toBeNull();
  expect(rng.state()).toBe(before);
});

test("the champion faces the cup winner", () => {
  const result = resolveSuperCup(createRng(21), table(NAMES), "Raków", "Lech", ratings(NAMES));
  expect(result?.opponent).toBe("Raków");
});

test("a club that won both faces the runner-up instead of itself", () => {
  const result = resolveSuperCup(createRng(21), table(NAMES), "Lech", "Lech", ratings(NAMES));
  expect(result?.opponent).toBe("Legia");
});

test("the cup winner sees the champion as its opponent", () => {
  const result = resolveSuperCup(createRng(21), table(NAMES), "Raków", "Raków", ratings(NAMES));
  expect(result?.opponent).toBe("Lech");
});

test("a far stronger club wins far more often than it loses", () => {
  const strong = new Map<string, MatchRating>([
    ["Lech", { attack: 1.5, defence: 1.4 }],
    ["Legia", { attack: 0.7, defence: 0.7 }],
  ]);
  const rng = createRng(0x5eed_0001);
  let won = 0;
  for (let i = 0; i < 2000; i += 1) {
    if (resolveSuperCup(rng, table(["Lech", "Legia"]), "Legia", "Lech", strong)?.won) won += 1;
  }
  expect(won).toBeGreaterThan(1400);
});

test("the same seed replays the same result", () => {
  expect(resolveSuperCup(createRng(9), table(NAMES), "Raków", "Lech", ratings(NAMES))).toEqual(
    resolveSuperCup(createRng(9), table(NAMES), "Raków", "Lech", ratings(NAMES))
  );
});
