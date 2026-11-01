import { expect, test } from "vitest";

import { expectedPlace, expectedSeasonPoints } from "../../src/logic/expected-points";
import type { MatchRating } from "../../src/logic/match";

const EVEN: MatchRating = { attack: 1, defence: 1 };
const STRONG: MatchRating = { attack: 1.3, defence: 1.2 };
const WEAK: MatchRating = { attack: 0.8, defence: 0.85 };
const field = (n: number, rating: MatchRating): MatchRating[] =>
  Array.from({ length: n }, () => rating);

test("an average club in an average league lands near the mathematical middle", () => {
  // 34 matches, 306 league matches producing between 612 and 918 points for
  // eighteen clubs: an average club sits near 918/18 = 51 at the very top of
  // that range and 612/18 = 34 at the bottom.
  const points = expectedSeasonPoints(EVEN, field(17, EVEN));
  expect(points).toBeGreaterThan(34);
  expect(points).toBeLessThan(56);
});

test("an even club's season expectation agrees with an independently enumerated Poisson result", () => {
  // Independent 0..60 goal enumeration for lambdas 1.4837535761717686 and
  // 1.1531763545376446 gives 46.621632071047124 points across seventeen
  // home-away pairs. Both lambdas moved on 2026-08-28 with the calibration
  // window; the enumeration is what makes this a check rather than a copy of
  // the engine's own arithmetic.
  expect(expectedSeasonPoints(EVEN, field(17, EVEN))).toBeCloseTo(46.621632071047124, 2);
});

test("a stronger club expects more points than a weaker one in the same league", () => {
  const opponents = field(17, EVEN);
  expect(expectedSeasonPoints(STRONG, opponents)).toBeGreaterThan(
    expectedSeasonPoints(WEAK, opponents)
  );
});

test("the function is pure - the same input always gives the same number", () => {
  expect(expectedSeasonPoints(STRONG, field(17, EVEN))).toBe(
    expectedSeasonPoints(STRONG, field(17, EVEN))
  );
});

test("the best club in the league expects first place, the worst expects last", () => {
  const opponents = [...field(16, EVEN), WEAK];
  expect(expectedPlace(STRONG, opponents)).toBe(1);
  expect(expectedPlace(WEAK, [...field(16, EVEN), STRONG])).toBe(18);
});

test("place is bounded by the size of the league", () => {
  const opponents = field(17, EVEN);
  const place = expectedPlace(EVEN, opponents);
  expect(place).toBeGreaterThanOrEqual(1);
  expect(place).toBeLessThanOrEqual(18);
});

test("the ranking agrees with the reference per-club computation", () => {
  const league: MatchRating[] = Array.from({ length: 18 }, (_, i) => ({
    attack: 0.85 + i * 0.02,
    defence: 0.87 + i * 0.015,
  }));

  // Rank every club by the reference implementation, then check expectedPlace
  // reports the same position for each. This is what stops the shared-fixture
  // optimisation from drifting away from the straightforward sum.
  const reference = league.map((club, i) =>
    expectedSeasonPoints(
      club,
      league.filter((_other, j) => j !== i)
    )
  );

  league.forEach((club, i) => {
    const expected = 1 + reference.filter((points, j) => j !== i && points > reference[i]!).length;
    expect(
      expectedPlace(
        club,
        league.filter((_other, j) => j !== i)
      )
    ).toBe(expected);
  });
});
