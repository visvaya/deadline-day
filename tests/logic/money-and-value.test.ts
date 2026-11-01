import { describe, expect, test } from "vitest";

import {
  AGE_PROFILES,
  AGE_PROFILE_DEFAULT,
  LEAGUE_PRIZE_RATE,
  MARKET_VALUE_MAX,
  MIN_MARKET_VALUE,
  MONEY_SCALE_PLN_PER_GAME_MILLION,
  WAGE_AT_PIVOT,
  WAGE_AT_PIVOT_PLN,
  WAGE_PIVOT_OVR,
  WAGE_SLOPE,
} from "../../src/data/balance";
import { LEAGUE_MERIT_POOL_PLN } from "../../src/data/club-finance-profiles";
import type { PositionCode } from "../../src/data/types";
import { ageOvrShift, marketValue } from "../../src/logic/player";
import { baseWage, playerWage } from "../../src/logic/wages";

/**
 * The activated money family, checked against the two measurements it comes
 * from rather than against the rounded figures their reports print for
 * reading. Everything here is a property of the constants, so a retune shows
 * up as a failing expectation instead of a quiet change of scale.
 */

const POSITIONS = Object.keys(AGE_PROFILES) as PositionCode[];

describe("the wage family holds together", () => {
  test("the whole family follows from the money scale", () => {
    // WAGE_AT_PIVOT is a game-money quantity derived from a PLN level, not a
    // number typed in. Written the other way round here so that changing the
    // scale without recomputing the level fails loudly.
    expect(WAGE_AT_PIVOT * MONEY_SCALE_PLN_PER_GAME_MILLION).toBeCloseTo(WAGE_AT_PIVOT_PLN, 6);
    expect(LEAGUE_PRIZE_RATE * 171 * MONEY_SCALE_PLN_PER_GAME_MILLION).toBeCloseTo(
      LEAGUE_MERIT_POOL_PLN,
      6
    );
  });

  test("the pivot is pinned at 70 and pays the fitted level there", () => {
    expect(WAGE_PIVOT_OVR).toBe(70);
    expect(WAGE_SLOPE).toBe(12);
    expect(baseWage(WAGE_PIVOT_OVR)).toBeCloseTo(WAGE_AT_PIVOT, 12);
  });

  test("the wage rises with ovr and with nothing else", () => {
    for (let ovr = 40; ovr < 95; ovr += 1) {
      expect(baseWage(ovr + 1)).toBeGreaterThan(baseWage(ovr));
    }
    // baseWage takes an ovr and returns a number: there is no club, no
    // ceiling and no staff report it could read. Pinned as a signature check
    // so a later parameter cannot smuggle one in.
    expect(baseWage.length).toBe(1);
  });

  test("the multiplier is the only thing separating a player from the curve", () => {
    const player = { ovr: 74, mnoznikPlacy: 1.5 } as Parameters<typeof playerWage>[0];
    expect(playerWage(player)).toBeCloseTo(baseWage(74) * 1.5, 12);
  });
});

describe("marketValue - the four price anchors", () => {
  /** The fitted values from docs/decisions/value-curve-fit-2026-09-07.md,
   * which is the source of these numbers rather than the spec's prose. */
  const ANCHORS = [
    { ovr: 70, age: 25, target: 0.73, fitted: 0.782239604884118 },
    { ovr: 78, age: 26, target: 2.51, fitted: 2.150925040460117 },
    { ovr: 85, age: 24, target: 5.45, fitted: 5.236001323763272 },
    { ovr: 90, age: 22, target: 7.75, fitted: 8.554 },
  ] as const;

  test("hits the fitted anchors on a default-profile position", () => {
    // LO carries AGE_PROFILE_DEFAULT's peak band (24/29), so the anchors -
    // which are defined for that profile - apply to it unshifted.
    expect(AGE_PROFILES.LO.peakStart).toBe(AGE_PROFILE_DEFAULT.peakStart);
    expect(AGE_PROFILES.LO.peakEnd).toBe(AGE_PROFILE_DEFAULT.peakEnd);
    for (const anchor of ANCHORS) {
      expect(marketValue(anchor.ovr, anchor.age, "LO")).toBeCloseTo(anchor.fitted, 3);
    }
  });

  test("the top anchor stays under the 9.0 ceiling the spec sets", () => {
    expect(marketValue(90, 22, "LO")).toBeLessThan(9);
  });

  test("errors against the spec's targets stay inside the fitted tolerances", () => {
    const errors = ANCHORS.map(
      (a) => Math.abs(marketValue(a.ovr, a.age, "LO") - a.target) / a.target
    );
    const sorted = [...errors].sort((x, y) => x - y);
    expect((sorted[1]! + sorted[2]!) / 2).toBeLessThanOrEqual(0.15);
    expect(Math.max(...errors)).toBeLessThanOrEqual(0.25);
  });
});

describe("marketValue - age is measured from the position's own peak", () => {
  test("the age ratios land in the spec's bands for every position", () => {
    for (const pos of POSITIONS) {
      const profile = AGE_PROFILES[pos];
      const reference = marketValue(70, profile.peakStart, pos);
      const ratio = (age: number): number => marketValue(70, age, pos) / reference;

      expect(ratio(profile.peakStart - 5)).toBeGreaterThanOrEqual(1.9);
      expect(ratio(profile.peakStart - 5)).toBeLessThanOrEqual(2.3);
      expect(ratio(profile.peakEnd)).toBeGreaterThanOrEqual(0.55);
      expect(ratio(profile.peakEnd)).toBeLessThanOrEqual(0.7);
      expect(ratio(profile.peakEnd + 3)).toBeGreaterThanOrEqual(0.28);
      expect(ratio(profile.peakEnd + 3)).toBeLessThanOrEqual(0.4);
      expect(ratio(profile.peakEnd + 6)).toBeGreaterThanOrEqual(0.12);
      expect(ratio(profile.peakEnd + 6)).toBeLessThanOrEqual(0.2);
    }
  });

  test("a keeper at his peak is not charged a winger's decline", () => {
    // The whole point of 5.1a: at 30 a keeper (peak 26-33) is inside his
    // band while a winger (peak 23-28) is two years past his.
    expect(marketValue(75, 30, "BR")).toBeGreaterThan(marketValue(75, 30, "LS"));
  });

  test("two positions differ only through their peak band", () => {
    // LO and PO carry identical profiles, so no positional premium can hide
    // in the function.
    expect(AGE_PROFILES.LO).toEqual(AGE_PROFILES.PO);
    for (let age = 16; age <= 38; age += 1) {
      expect(marketValue(72, age, "LO")).toBe(marketValue(72, age, "PO"));
    }
  });
});

describe("ageOvrShift - shape of the curve", () => {
  test("is zero at peakStart, by normalisation", () => {
    for (const pos of POSITIONS) {
      expect(ageOvrShift(AGE_PROFILES[pos].peakStart, pos)).toBeCloseTo(0, 12);
    }
  });

  test("falls strictly from peakStart to peakEnd + 6", () => {
    for (const pos of POSITIONS) {
      const profile = AGE_PROFILES[pos];
      for (let age = profile.peakStart; age < profile.peakEnd + 6; age += 0.5) {
        expect(ageOvrShift(age + 0.5, pos)).toBeLessThan(ageOvrShift(age, pos));
      }
    }
  });

  test("is flat beyond the outermost anchors", () => {
    for (const pos of POSITIONS) {
      const profile = AGE_PROFILES[pos];
      const young = ageOvrShift(profile.peakStart - 5, pos);
      const old = ageOvrShift(profile.peakEnd + 6, pos);
      expect(ageOvrShift(profile.peakStart - 9, pos)).toBe(young);
      expect(ageOvrShift(15, pos)).toBe(young);
      expect(ageOvrShift(profile.peakEnd + 9, pos)).toBe(old);
      expect(ageOvrShift(45, pos)).toBe(old);
    }
  });

  test("is continuous: no birthday is a cliff", () => {
    for (const pos of POSITIONS) {
      for (let age = 15; age <= 40; age += 0.25) {
        const step = Math.abs(ageOvrShift(age + 0.25, pos) - ageOvrShift(age, pos));
        // A quarter year can never move the shift by a whole ovr point.
        expect(step).toBeLessThan(1);
      }
    }
  });
});

describe("marketValue - bounds", () => {
  test("never leaves the floor-to-vmax band", () => {
    // Swept over every position, ovr and age, but reduced to two numbers
    // before asserting: 27 300 points times two expects apiece is slow enough
    // to time the test out under load, and says nothing more than the extremes
    // do.
    let lowest = Number.POSITIVE_INFINITY;
    let highest = Number.NEGATIVE_INFINITY;
    for (const pos of POSITIONS) {
      for (let ovr = 30; ovr <= 99; ovr += 1) {
        for (let age = 15; age <= 40; age += 1) {
          const value = marketValue(ovr, age, pos);
          if (value < lowest) lowest = value;
          if (value > highest) highest = value;
        }
      }
    }
    expect(lowest).toBeGreaterThanOrEqual(MIN_MARKET_VALUE);
    expect(highest).toBeLessThanOrEqual(MARKET_VALUE_MAX);
    // The sweep has to actually reach both ends, or the bounds above would
    // hold vacuously.
    expect(lowest).toBe(MIN_MARKET_VALUE);
    expect(highest).toBeGreaterThan(MARKET_VALUE_MAX * 0.5);
  });

  test("rises with ovr at every age", () => {
    for (const pos of POSITIONS) {
      for (let age = 16; age <= 38; age += 2) {
        for (let ovr = 55; ovr < 95; ovr += 1) {
          const lower = marketValue(ovr, age, pos);
          const higher = marketValue(ovr + 1, age, pos);
          // Strictly, except where both sit on the floor - a 55-ovr veteran
          // six years past his peak is worthless at either rating, and the
          // clamp is what says so.
          if (higher === MIN_MARKET_VALUE) expect(lower).toBe(MIN_MARKET_VALUE);
          else expect(higher).toBeGreaterThan(lower);
        }
      }
    }
  });

  test("loses at most a fifth of its value in any single year", () => {
    for (const pos of POSITIONS) {
      const profile = AGE_PROFILES[pos];
      for (let age = profile.peakStart - 5; age < profile.peakEnd + 6; age += 1) {
        for (const ovr of [55, 70, 85, 95]) {
          const before = marketValue(ovr, age, pos);
          const after = marketValue(ovr, age + 1, pos);
          expect(after / before).toBeGreaterThanOrEqual(0.8);
        }
      }
    }
  });

  test("reaches the floor for a worthless veteran", () => {
    expect(marketValue(30, 38, "LS")).toBe(MIN_MARKET_VALUE);
  });
});
