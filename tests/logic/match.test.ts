import { expect, test } from "vitest";

import { createRng } from "../../src/logic/rng";
import { expectedGoals, simulateMatch } from "../../src/logic/match";

const EVEN = { attack: 1, defence: 1 };
const STRONG = { attack: 1.4, defence: 1.3 };
const WEAK = { attack: 0.8, defence: 0.85 };

test("the same seed replays the same score", () => {
  expect(simulateMatch(createRng(3), EVEN, EVEN)).toEqual(simulateMatch(createRng(3), EVEN, EVEN));
});

test("home advantage shows up over a large sample of even matches", () => {
  const rng = createRng(0x5eed_0001);
  let home = 0;
  let away = 0;
  for (let i = 0; i < 20_000; i += 1) {
    const result = simulateMatch(rng, EVEN, EVEN);
    home += result.homeGoals;
    away += result.awayGoals;
  }
  expect(home).toBeGreaterThan(away);
});

test("a strong side outscores a weak one over a large sample", () => {
  const rng = createRng(17);
  let strong = 0;
  let weak = 0;
  for (let i = 0; i < 20_000; i += 1) {
    // Strong plays AWAY here, so the result cannot be explained by home advantage.
    const result = simulateMatch(rng, WEAK, STRONG);
    weak += result.homeGoals;
    strong += result.awayGoals;
  }
  expect(strong).toBeGreaterThan(weak);
});

test("average goals per match sit in the range the constants were tuned for", () => {
  const rng = createRng(99);
  let goals = 0;
  const matches = 50_000;
  for (let i = 0; i < matches; i += 1) {
    const result = simulateMatch(rng, EVEN, EVEN);
    goals += result.homeGoals + result.awayGoals;
  }
  const perMatch = goals / matches;
  expect(perMatch).toBeGreaterThan(2.5);
  expect(perMatch).toBeLessThan(2.8);
});

test("expected goals expose the exact lambdas sampled by simulateMatch", () => {
  expect(expectedGoals(EVEN, EVEN)).toEqual({
    home: 1.4837535761717686,
    away: 1.1531763545376446,
  });
});
