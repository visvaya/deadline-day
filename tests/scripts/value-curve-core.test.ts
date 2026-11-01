import { expect, test } from "vitest";

import { AGE_PROFILE_DEFAULT, HAGGLE_SALE_BONUS } from "../../src/data/balance";
import { RYNEK_OPIS } from "../../src/data/market-states";
import {
  ageOvrShift,
  AGE_RATIO_BANDS,
  bestFit,
  canonicalExamples,
  DEFAULT_PROFILE,
  feasibleJointSets,
  feasibleKnees,
  feasibleSets,
  FOREIGN_TIERS,
  marketValueAt,
  MAX_DOMESTIC_FEE,
  MAX_UNHAGGLED_FOREIGN_FEE,
  PRICE_ANCHORS,
  qualifiedSpread,
  softCapForeignOffer,
  spreadPasses,
  topAnchorSpread,
  SEARCH_RANGE,
  VALIDATION_PROFILES,
  violations,
  type ValueCurveParams,
} from "../../scripts/value-curve-core";

const params: ValueCurveParams = {
  vmax: 13,
  slope: 6.6,
  midpoint: 87.6,
  youngShift: 5.2,
  peakEndShift: -3,
  latePlusThreeShift: -7.2,
  latePlusSixShift: -11.4,
};

test("the shift is zero at peakStart by definition", () => {
  expect(ageOvrShift(AGE_PROFILE_DEFAULT.peakStart, AGE_PROFILE_DEFAULT, params)).toBeCloseTo(0, 9);
});

test("the shift is flat outside the outermost anchors", () => {
  const young = ageOvrShift(AGE_PROFILE_DEFAULT.peakStart - 5, AGE_PROFILE_DEFAULT, params);
  expect(ageOvrShift(AGE_PROFILE_DEFAULT.peakStart - 9, AGE_PROFILE_DEFAULT, params)).toBeCloseTo(
    young,
    9
  );
  const old = ageOvrShift(AGE_PROFILE_DEFAULT.peakEnd + 6, AGE_PROFILE_DEFAULT, params);
  expect(ageOvrShift(AGE_PROFILE_DEFAULT.peakEnd + 12, AGE_PROFILE_DEFAULT, params)).toBeCloseTo(
    old,
    9
  );
});

// Three decimals against the values the parameters actually produce, not two
// against their display rounding. The 90/22 case sits 0.00492 from 8.63 and
// toBeCloseTo(8.63, 2) admits strictly less than 0.005 - a margin of seven
// hundred-thousandths, which any reordering of the interpolation could flip.
// A test that fails for a reason nobody can see is worse than no test.
test("the four price anchors land where the spec says", () => {
  expect(marketValueAt(70, 25, AGE_PROFILE_DEFAULT, params)).toBeCloseTo(0.776, 3);
  expect(marketValueAt(78, 26, AGE_PROFILE_DEFAULT, params)).toBeCloseTo(2.118, 3);
  expect(marketValueAt(85, 24, AGE_PROFILE_DEFAULT, params)).toBeCloseTo(5.236, 3);
  expect(marketValueAt(90, 22, AGE_PROFILE_DEFAULT, params)).toBeCloseTo(8.625, 3);
});

test("a goalkeeper at thirty is worth more than a winger at thirty", () => {
  const keeper = { peakStart: 26, peakEnd: 33, declineBase: 1.2, declineAccel: 0.6 };
  const winger = { peakStart: 23, peakEnd: 28, declineBase: 1.2, declineAccel: 0.59 };
  expect(marketValueAt(75, 30, keeper, params)).toBeGreaterThan(
    marketValueAt(75, 30, winger, params)
  );
});

test("the worked feasible set from the spec violates nothing", () => {
  expect(violations(params)).toEqual([]);
});

test("a flat prime band is rejected, not silently accepted", () => {
  expect(violations({ ...params, peakEndShift: 0 })).toContainEqual(
    expect.stringContaining("strictly decreasing")
  );
});

test("a yearly drop past twenty per cent is rejected", () => {
  expect(violations({ ...params, latePlusSixShift: -20 })).toContainEqual(
    expect.stringContaining("yearly drop")
  );
});

test("a youth premium below the band is rejected", () => {
  expect(violations({ ...params, youngShift: 0.5 })).toContainEqual(
    expect.stringContaining("19/peakStart")
  );
});

test("the market floor does not violate strictly decreasing age shift", () => {
  expect(marketValueAt(55, 31, DEFAULT_PROFILE, params)).toBe(0.05);
  expect(marketValueAt(55, 32, DEFAULT_PROFILE, params)).toBe(0.05);
  expect(ageOvrShift(32, DEFAULT_PROFILE, params)).toBeLessThan(
    ageOvrShift(31, DEFAULT_PROFILE, params)
  );
  expect(violations(params)).toEqual([]);
});

test("the yearly bound also covers the young band", () => {
  expect(violations({ ...params, youngShift: 10 })).toContainEqual(
    expect.stringContaining("yearly drop")
  );
});

test.each([NaN, Infinity, 0, -1])("invalid slope %s is rejected", (slope) => {
  expect(violations({ ...params, slope }).length).toBeGreaterThan(0);
});

// The dense sweep is ~60k points across every position profile. Asserting
// each one through expect() costs more than computing it, and under coverage
// instrumentation that alone blew the default timeout - so collect the
// offending points and assert once. A failure still names where it happened.
test("shape invariants hold across positions, including floor crossings", () => {
  const failures: string[] = [];
  for (const profile of VALIDATION_PROFILES) {
    for (const age of [
      profile.peakStart - 5,
      profile.peakStart,
      profile.peakEnd,
      profile.peakEnd + 3,
      profile.peakEnd + 6,
    ]) {
      const left = ageOvrShift(age - 1e-8, profile, params);
      const right = ageOvrShift(age + 1e-8, profile, params);
      if (Math.abs(left - right) > 1e-6) {
        failures.push(`shift jumps at age ${age} for peak ${profile.peakStart}`);
      }
    }
    for (let age = profile.peakStart - 5; age <= profile.peakEnd + 6; age += 1) {
      for (let ovr = 0; ovr <= 99; ovr += 1) {
        const value = marketValueAt(ovr, age, profile, params);
        const where = `ovr ${ovr}, age ${age}, peak ${profile.peakStart}`;
        if (value < 0.05) failures.push(`below the floor at ${where}`);
        if (value > params.vmax) failures.push(`above vmax at ${where}`);
        if (marketValueAt(ovr + 1, age, profile, params) < value) {
          failures.push(`not increasing in ovr at ${where}`);
        }
        if (marketValueAt(ovr, age + 1, profile, params) < value * 0.8) {
          failures.push(`yearly drop past 20% at ${where}`);
        }
      }
    }
  }
  expect(failures).toEqual([]);
});

test("the declared search range contains at least one feasible set", () => {
  const found = feasibleSets(SEARCH_RANGE);
  expect(found.length).toBeGreaterThan(0);
  for (const candidate of found) expect(violations(candidate)).toEqual([]);
});

test("the soft cap is identity below the knee and continuous at it", () => {
  expect(softCapForeignOffer(4, 6)).toBeCloseTo(4, 9);
  expect(softCapForeignOffer(6, 6)).toBeCloseTo(6, 9);
  expect(softCapForeignOffer(6.0001, 6)).toBeGreaterThan(6);
  expect(softCapForeignOffer(6.0001, 6)).toBeLessThan(6.001);
});

test("no raw fee ever reaches the unhaggled ceiling", () => {
  expect(softCapForeignOffer(1e6, 6)).toBeLessThan(11 / 1.2);
});

test("the top anchor keeps a spread of at least 0.15 after qualification", () => {
  expect(topAnchorSpread(params, 6).spread).toBeGreaterThanOrEqual(0.15);
});

test("the feasible knee band starts at the domestic ceiling", () => {
  const knees = feasibleKnees(params);
  expect(knees.length).toBeGreaterThan(0);
  expect(Math.min(...knees)).toBeGreaterThanOrEqual(5.5);
  expect(Math.max(...knees)).toBeLessThan(11 / 1.2);
});

test("qualification includes an interior affordability boundary", () => {
  const spread = qualifiedSpread(5, 6, 1.4);
  // Very-high tier qualifies at deviation 0.9, but not at 1.1.
  // Its highest admissible offer is exactly 9 / 1.2, not its low endpoint.
  expect(spread.tiers.find((tier) => tier.name === "very-high")?.high).toBeCloseTo(7.5, 9);
});

test("two tiers require five percent, one tier requires visible 0.15", () => {
  const single = topAnchorSpread(params, 6);
  expect(single.tiers).toHaveLength(1);
  expect(spreadPasses(single)).toBe(true);
  expect(spreadPasses({ ...single, visibleSpread: 0.14 })).toBe(false);
  const multi = qualifiedSpread(5, 6, 1.4);
  expect(multi.tiers.length).toBeGreaterThanOrEqual(2);
  expect(spreadPasses({ ...multi, relative: 0.049, visibleSpread: 0.2 })).toBe(false);
});

// The fit is only worth as much as the constants it was measured against.
// Both of these move the qualified spread, so a silent edit to either must
// invalidate the pinned result rather than quietly reshape it.
test("the fit pins the transfer constants it was measured against", () => {
  expect(HAGGLE_SALE_BONUS).toBe(0.2);
  expect(RYNEK_OPIS.pusty.mnoznikCeny).toBe(1.4);
  expect(MAX_UNHAGGLED_FOREIGN_FEE).toBeCloseTo(11 / 1.2, 12);
  expect(MAX_DOMESTIC_FEE).toBe(5.5);
});

// The messages come from the game's own kernel now that the fee ceilings are
// activated: this tool is a scanning wrapper around it, not a second
// implementation. They name which argument was wrong rather than saying that
// one of two was.
test.each([NaN, Infinity, -1])("the soft cap rejects the raw fee %s", (rawFee) => {
  expect(() => softCapForeignOffer(rawFee, 6)).toThrow(/raw fee/);
});

test.each([NaN, Infinity, 5.49])("the soft cap rejects the knee %s", (knee) => {
  expect(() => softCapForeignOffer(6, knee)).toThrow(/knee/);
});

test("the soft cap rejects a knee at or above the unhaggled ceiling", () => {
  expect(() => softCapForeignOffer(6, MAX_UNHAGGLED_FOREIGN_FEE)).toThrow(/cap/);
});

test.each([NaN, 0, -1])("the qualified spread rejects the base %s", (base) => {
  expect(() => qualifiedSpread(base, 6, 1.4)).toThrow("invalid offer factors");
});

test("the qualified spread rejects a market multiplier that is not positive", () => {
  expect(() => qualifiedSpread(5, 6, 0)).toThrow("invalid offer factors");
  expect(() => qualifiedSpread(5, 6, NaN)).toThrow("invalid offer factors");
});

// The legendary tier's ceiling IS the unhaggled asymptote and the soft cap
// stays strictly below it, so the richest buyer can always afford whatever
// the cap produces. The "no qualified foreign tier" guard in the core is
// therefore defensive against a future tier retune, not a reachable branch -
// asserting the reachable half is the honest test.
test("the richest tier qualifies even at the top of the curve", () => {
  const spread = qualifiedSpread(params.vmax, 9.1, 1.4);
  expect(spread.tiers.map((tier) => tier.name)).toEqual(["legendary"]);
  expect(spread.high).toBeLessThan(MAX_UNHAGGLED_FOREIGN_FEE);
});

test("the soft cap keeps its first derivative continuous at the knee", () => {
  const h = 1e-6;
  const below = (softCapForeignOffer(6, 6) - softCapForeignOffer(6 - h, 6)) / h;
  const above = (softCapForeignOffer(6 + h, 6) - softCapForeignOffer(6, 6)) / h;
  expect(below).toBeCloseTo(1, 6);
  expect(above).toBeCloseTo(1, 5);
});

test("a full successful haggle stays inside every qualified tier's ceiling", () => {
  const spread = qualifiedSpread(5, 6, 1.4);
  for (const tier of spread.tiers) {
    const ceiling = FOREIGN_TIERS.find((entry) => entry.name === tier.name)?.maxSpend;
    expect(ceiling).toBeDefined();
    expect(tier.high * (1 + HAGGLE_SALE_BONUS)).toBeLessThanOrEqual((ceiling as number) + 1e-9);
  }
});

// Compute this once per test file, not in every assertion or report section.
const jointSets = feasibleJointSets(SEARCH_RANGE);

test("the best fit is feasible and reproducible", () => {
  expect(jointSets.length).toBeGreaterThan(0);
  const first = bestFit(jointSets);
  const second = bestFit(jointSets);
  expect(violations(first.params)).toEqual([]);
  expect(feasibleKnees(first.params)).toContain(first.knee);
  expect(second).toEqual(first);
});

test("a curve without an admissible knee cannot win the fit", () => {
  const result = bestFit([
    { params, knees: [] },
    { params, knees: [6] },
  ]);
  expect(result.knee).toBe(6);
  expect(() => bestFit([{ params, knees: [] }])).toThrow("no jointly feasible");
});

test("selection minimises relative squared anchor errors on the joint grid", () => {
  const loss = (candidate: ValueCurveParams) =>
    PRICE_ANCHORS.reduce((sum, anchor) => {
      const error =
        (marketValueAt(anchor.ovr, anchor.age, DEFAULT_PROFILE, candidate) - anchor.target) /
        anchor.target;
      return sum + error * error;
    }, 0);
  const fit = bestFit(jointSets);
  expect(loss(fit.params)).toBe(Math.min(...jointSets.map((candidate) => loss(candidate.params))));
  expect(bestFit([{ params, knees: [6.25, 5.75] }]).knee).toBe(5.75);
  expect(bestFit([{ params, knees: [5.75, 6, 6.25] }]).knee).toBe(6);
});

test("the canonical examples come from the fitted parameters", () => {
  const fit = bestFit(jointSets);
  const examples = canonicalExamples(fit.params, fit.knee);
  expect(examples.topAnchorBase).toBeCloseTo(marketValueAt(90, 22, DEFAULT_PROFILE, fit.params), 9);
  expect(examples.afterHaggleHigh).toBeLessThan(11);
});

test("every example the report quotes is a finite number", () => {
  const fit = bestFit(jointSets);
  const examples = canonicalExamples(fit.params, fit.knee);
  for (const [key, value] of Object.entries(examples)) {
    expect(typeof value, key).toBe("number");
    expect(Number.isFinite(value), key).toBe(true);
  }
  for (const band of AGE_RATIO_BANDS) {
    expect(Object.keys(examples)).toContain(band.label);
  }
});
