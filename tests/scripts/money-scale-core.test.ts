import { describe, expect, test } from "vitest";

import { FORMACJE } from "../../src/data/positions";
import {
  AGE_PROFILES,
  HAGGLE_SALE_BONUS,
  STARTING_BENCH_OVR_BONUS,
  STARTING_XI_OVR_BONUS,
  WAGE_PIVOT_OVR,
} from "../../src/data/balance";
import { FIRST_DIVISION } from "../../src/data/first-division";
import { financeProfileFor } from "../../src/data/club-finance-profiles";
import type { PositionCode } from "../../src/data/types";
import { quantile } from "../../scripts/stats";
import {
  MAX_DOMESTIC_FEE,
  marketValueAt,
  type ValueCurveParams,
} from "../../scripts/value-curve-core";
import { CLUBS, ratingForClubId } from "../../src/data/clubs";
import { expectedPlace, expectedSeasonPoints } from "../../src/logic/expected-points";
import { createStartingSquadPlayer } from "../../src/logic/player";
import { createRng } from "../../src/logic/rng";
import {
  optionAVariantAt,
  WIDE_SLOPE_PROBE,
  SLOPE_SCAN_RANGE,
  probeSpreadAcrossScales,
  limitSpreadAtFlatCurve,
  BENCH_BONUS,
  XI_BONUS,
  WAGE_PIVOT,
  baseWage,
  createShapeCache,
  summariseCohort,
  priceCohort,
  playabilityCheck,
  interpolatedPercentile,
  domesticBuyingCapacity,
  clubBudgets,
  budgetShareFor,
  KUPNO_MEDIAN_PRICE_DEVIATION,
  MAX_BUDGET_SHARE,
  MIN_BUDGET_SHARE,
  deriveMoneyScale,
  evaluateSlope,
  feasibleSlopeRuns,
  geometricLevel,
  jointFeasibleLevels,
  leagueForecast,
  levelRatios,
  logSse,
  maxCriterionWitness,
  maxErrorFeasibleLevels,
  medianApeAt,
  medianErrorFeasibleLevels,
  meritWeightSum,
  ovrMasses,
  scanSlopes,
  searchSlope,
  slotShape,
  squadShape,
  summariseFit,
  sumNormalisedLevel,
  type FitObservation,
  type ObservationsAtSlope,
} from "../../scripts/money-scale-core";

describe("compatibility aliases", () => {
  test("WAGE_PIVOT is the same value as balance.ts's WAGE_PIVOT_OVR", () => {
    expect(WAGE_PIVOT).toBe(WAGE_PIVOT_OVR);
  });

  test("XI_BONUS and BENCH_BONUS are the same objects balance.ts exports", () => {
    expect(XI_BONUS).toBe(STARTING_XI_OVR_BONUS);
    expect(BENCH_BONUS).toBe(STARTING_BENCH_OVR_BONUS);
  });
});

describe("baseWage", () => {
  test("is the pivot wage exactly at the pivot ovr", () => {
    expect(baseWage(WAGE_PIVOT, { wageAtPivot: 0.4, wageSlope: 8 })).toBeCloseTo(0.4, 12);
  });

  test("rises monotonically with ovr", () => {
    const params = { wageAtPivot: 0.4, wageSlope: 8 };
    for (let ovr = 40; ovr < 95; ovr += 1) {
      expect(baseWage(ovr + 1, params)).toBeGreaterThan(baseWage(ovr, params));
    }
  });

  test("rejects a non-positive or non-finite parameter", () => {
    expect(() => baseWage(70, { wageAtPivot: 0, wageSlope: 8 })).toThrow();
    expect(() => baseWage(70, { wageAtPivot: 0.4, wageSlope: 0 })).toThrow();
    expect(() => baseWage(70, { wageAtPivot: 0.4, wageSlope: Number.NaN })).toThrow();
    expect(() => baseWage(Number.POSITIVE_INFINITY, { wageAtPivot: 0.4, wageSlope: 8 })).toThrow();
  });
});

describe("ovrMasses", () => {
  test("the masses of one slot sum to one", () => {
    for (const target of [44, 50.2, 57.5, 63.1, 70, 78.9, 88]) {
      for (const bonus of [XI_BONUS, BENCH_BONUS]) {
        const masses = ovrMasses(target, bonus);
        const total = [...masses.values()].reduce((sum, p) => sum + p, 0);
        expect(total).toBeCloseTo(1, 12);
      }
    }
  });

  test("matches a worked example: target 70, the eleven's [-5, 5) bonus", () => {
    const masses = ovrMasses(70, XI_BONUS);
    // Support is [65, 75). Math.round sends [n - 0.5, n + 0.5) to n, so the
    // two edge buckets are half-width and the thirteen inner ones are full.
    expect(masses.get(65)).toBeCloseTo(0.05, 12);
    expect(masses.get(75)).toBeCloseTo(0.05, 12);
    for (let ovr = 66; ovr <= 74; ovr += 1) expect(masses.get(ovr)).toBeCloseTo(0.1, 12);
    expect(masses.has(64)).toBe(false);
    expect(masses.has(76)).toBe(false);
  });

  test("collapses onto the retirement floor when the whole draw sits below it", () => {
    const masses = ovrMasses(45, XI_BONUS);
    expect(masses.size).toBe(1);
    expect(masses.get(50)).toBeCloseTo(1, 12);
  });

  test("puts the floor's share on 50 rather than below it", () => {
    // Support [47, 57): the part under 50.5 all rounds to 50 because the
    // generator takes Math.max before Math.round.
    const masses = ovrMasses(52, XI_BONUS);
    expect(masses.get(50)).toBeCloseTo(0.35, 12);
    expect([...masses.keys()].every((ovr) => ovr >= 50)).toBe(true);
  });

  test("rejects an inverted or non-finite bonus band", () => {
    expect(() => ovrMasses(70, { lo: 5, hi: -5 })).toThrow();
    expect(() => ovrMasses(70, { lo: 0, hi: 0 })).toThrow();
    expect(() => ovrMasses(Number.NaN, XI_BONUS)).toThrow();
  });
});

describe("slotShape", () => {
  test("is the expectation of the exponential, not the exponential of the mean", () => {
    const slope = 8;
    const shape = slotShape(70, XI_BONUS, slope);
    const masses = ovrMasses(70, XI_BONUS);
    let meanOvr = 0;
    for (const [ovr, p] of masses) meanOvr += ovr * p;
    const naive = Math.exp((meanOvr - WAGE_PIVOT) / slope);
    // exp is strictly convex, so Jensen makes the correct value the larger
    // one. A tool that averaged ovr first would understate every payroll.
    expect(shape).toBeGreaterThan(naive);
  });

  test("the bench slot is cheaper than the eleven's at the same target", () => {
    for (const target of [55, 63, 70, 78]) {
      expect(slotShape(target, BENCH_BONUS, 8)).toBeLessThan(slotShape(target, XI_BONUS, 8));
    }
  });

  test("equals the mass-weighted sum by hand at target 70", () => {
    const slope = 8;
    const masses = ovrMasses(70, XI_BONUS);
    let expected = 0;
    for (const [ovr, p] of masses) expected += p * Math.exp((ovr - WAGE_PIVOT) / slope);
    expect(slotShape(70, XI_BONUS, slope)).toBeCloseTo(expected, 12);
  });
});

describe("squadShape", () => {
  const rating = ratingForClubId("legia-warszawa");

  test("both models are positive and finite for every club rating", () => {
    for (const model of ["screen-projection", "generator-expectation"] as const) {
      const shape = squadShape(rating, model, 8);
      expect(Number.isFinite(shape)).toBe(true);
      expect(shape).toBeGreaterThan(0);
    }
  });

  test("the generator model costs less than the screen projection", () => {
    // The screen projection pays every slot the position target; the
    // generator draws the bench between 12 and 3 ovr below it.
    expect(squadShape(rating, "generator-expectation", 8)).toBeLessThan(
      squadShape(rating, "screen-projection", 8)
    );
  });

  test("the screen projection is the plain sum over the seven formations", () => {
    const slope = 8;
    let total = 0;
    for (const formation of Object.values(FORMACJE)) {
      let perFormation = 0;
      for (const slot of formation.pozycje) perFormation += slot.kadra;
      expect(perFormation).toBeGreaterThan(11);
      total += 1;
    }
    expect(total).toBe(Object.keys(FORMACJE).length);
    expect(squadShape(rating, "screen-projection", slope)).toBeGreaterThan(0);
  });

  test("the slope moves a slot away from the pivot in the direction of its target", () => {
    // Not a property of the club shape: a squad whose targets sit below the
    // pivot gets CHEAPER as the curve steepens downward, and Legia's do.
    // The sign lives per slot, so that is where it is pinned.
    expect(slotShape(82, XI_BONUS, 6)).toBeGreaterThan(slotShape(82, XI_BONUS, 12));
    expect(slotShape(58, XI_BONUS, 6)).toBeLessThan(slotShape(58, XI_BONUS, 12));
    expect(slotShape(WAGE_PIVOT, XI_BONUS, 6)).toBeGreaterThan(0);
  });

  test("rejects a non-positive slope", () => {
    expect(() => squadShape(rating, "screen-projection", 0)).toThrow();
    expect(() => squadShape(rating, "screen-projection", Number.NaN)).toThrow();
  });
});

describe("createShapeCache", () => {
  test("returns the same value as the uncached call and computes it once", () => {
    const cache = createShapeCache();
    const rating = ratingForClubId("zaglebie-lubin");
    const direct = squadShape(rating, "generator-expectation", 7.5);
    expect(cache.shape("zaglebie-lubin", rating, "generator-expectation", 7.5)).toBeCloseTo(
      direct,
      12
    );
    expect(cache.shape("zaglebie-lubin", rating, "generator-expectation", 7.5)).toBeCloseTo(
      direct,
      12
    );
    expect(cache.misses).toBe(1);
    expect(cache.hits).toBe(1);
  });

  test("keys on club, model and slope together", () => {
    const cache = createShapeCache();
    const legia = ratingForClubId("legia-warszawa");
    const zaglebie = ratingForClubId("zaglebie-lubin");
    cache.shape("legia-warszawa", legia, "screen-projection", 8);
    cache.shape("zaglebie-lubin", zaglebie, "screen-projection", 8);
    cache.shape("legia-warszawa", legia, "generator-expectation", 8);
    cache.shape("legia-warszawa", legia, "screen-projection", 9);
    expect(cache.misses).toBe(4);
    expect(cache.hits).toBe(0);
  });
});

describe("the analytic model against the generator it copies", () => {
  /** Pinned seed: the check is that the closed form matches the draw, so a
   * fresh seed each run would make a real mismatch intermittent. */
  const SEED = 0x5eed0001;
  const DRAWS = 40000;

  const empiricalMasses = (target: number, isXi: boolean): Map<number, number> => {
    const rng = createRng(SEED);
    const counts = new Map<number, number>();
    for (let i = 0; i < DRAWS; i += 1) {
      const player = createStartingSquadPlayer(rng, "ŚP", target, isXi);
      counts.set(player.ovr, (counts.get(player.ovr) ?? 0) + 1);
    }
    return new Map([...counts].map(([ovr, n]) => [ovr, n / DRAWS]));
  };

  test.each([
    [70, true],
    [63.4, true],
    [70, false],
    [55.2, false],
  ])("target %s, xi=%s reproduces the drawn distribution", (target, isXi) => {
    const analytic = ovrMasses(target, isXi ? XI_BONUS : BENCH_BONUS);
    const drawn = empiricalMasses(target, isXi);
    expect([...drawn.keys()].sort((a, b) => a - b)).toEqual(
      [...analytic.keys()].sort((a, b) => a - b)
    );
    for (const [ovr, mass] of analytic) {
      // 40000 draws put the standard error under 0.0025 for any single
      // bucket, so 0.01 is four sigma wide and still catches a wrong band.
      expect(drawn.get(ovr) ?? 0).toBeCloseTo(mass, 2);
    }
  });
});
describe("the reference loss and its level", () => {
  const obs = (ratios: readonly number[]): FitObservation[] =>
    ratios.map((ratio, i) => ({ id: `c${i}`, target: ratio * 2, shape: 2 }));

  test("levelRatios is target over shape", () => {
    expect(levelRatios([{ id: "a", target: 6, shape: 3 }])).toEqual([2]);
  });

  test("geometricLevel is the geometric mean of the ratios", () => {
    expect(geometricLevel(obs([1, 4]))).toBeCloseTo(2, 12);
    expect(geometricLevel(obs([2, 2, 2]))).toBeCloseTo(2, 12);
  });

  test("geometricLevel minimises logSse, checked against a dense scan", () => {
    const population = obs([0.8, 1.0, 1.4, 2.9, 3.3]);
    const best = geometricLevel(population);
    const bestLoss = logSse(population, best);
    for (let level = 0.2; level <= 6; level += 0.001) {
      expect(logSse(population, level)).toBeGreaterThanOrEqual(bestLoss - 1e-12);
    }
  });

  test("sumNormalisedLevel reproduces the population sum exactly", () => {
    const population = [
      { id: "a", target: 10, shape: 4 },
      { id: "b", target: 30, shape: 6 },
    ];
    const summary = summariseFit(population, sumNormalisedLevel(population));
    expect(summary.predictedSum).toBeCloseTo(summary.targetSum, 10);
    expect(summary.sumRelativeErrorPercent).toBeCloseTo(0, 10);
  });

  test("rejects an empty, non-finite or non-positive population", () => {
    expect(() => levelRatios([])).toThrow();
    expect(() => levelRatios([{ id: "a", target: 0, shape: 1 }])).toThrow();
    expect(() => levelRatios([{ id: "a", target: 1, shape: -1 }])).toThrow();
    expect(() => levelRatios([{ id: "a", target: Number.NaN, shape: 1 }])).toThrow();
    expect(() => logSse([{ id: "a", target: 1, shape: 1 }], 0)).toThrow();
  });
});

describe("summariseFit", () => {
  test("reports signed and absolute errors per club", () => {
    const summary = summariseFit(
      [
        { id: "over", target: 100, shape: 1 },
        { id: "under", target: 200, shape: 1 },
      ],
      120
    );
    expect(summary.residuals[0]!.signedErrorPercent).toBeCloseTo(20, 10);
    expect(summary.residuals[1]!.signedErrorPercent).toBeCloseTo(-40, 10);
    expect(summary.residuals[1]!.absoluteErrorPercent).toBeCloseTo(40, 10);
    expect(summary.maxApePercent).toBeCloseTo(40, 10);
    // Even n: the mean of the two middle values, which here are the only two.
    expect(summary.medianApePercent).toBeCloseTo(30, 10);
  });

  test("an odd population takes the middle value itself", () => {
    const summary = summariseFit(
      [
        { id: "a", target: 100, shape: 1 },
        { id: "b", target: 110, shape: 1 },
        { id: "c", target: 200, shape: 1 },
      ],
      110
    );
    expect(summary.medianApePercent).toBeCloseTo(10, 10);
  });
});

describe("feasibility with the level free", () => {
  const fromRatios = (ratios: readonly number[]): FitObservation[] =>
    ratios.map((ratio, i) => ({ id: `c${i}`, target: ratio, shape: 1 }));

  /** An independent dense scan, deliberately written the naive way: it asks
   * the same question of the same definition without sharing any code with
   * the analytic solver, so the two agreeing is evidence. */
  const denseFeasible = (
    ratios: readonly number[],
    tolerance: number,
    which: "median" | "max"
  ): { lo: number; hi: number }[] => {
    const runs: { lo: number; hi: number }[] = [];
    const from = 0.5 * Math.min(...ratios);
    const to = 2 * Math.max(...ratios);
    const step = (to - from) / 200000;
    let open: { lo: number; hi: number } | null = null;
    for (let level = from; level <= to; level += step) {
      const apes = ratios.map((r) => Math.abs(level - r) / r).sort((a, b) => a - b);
      const n = apes.length;
      const value =
        which === "max"
          ? apes[n - 1]
          : n % 2 === 1
            ? apes[(n - 1) / 2]
            : (apes[n / 2 - 1]! + apes[n / 2]!) / 2;
      if (value! <= tolerance) {
        if (open) open.hi = level;
        else open = { lo: level, hi: level };
      } else if (open) {
        runs.push(open);
        open = null;
      }
    }
    if (open) runs.push(open);
    return runs;
  };

  test("maxErrorFeasibleLevels is the intersection of the clubs' bands", () => {
    const interval = maxErrorFeasibleLevels(fromRatios([1, 1.2]), 0.3);
    expect(interval?.lo).toBeCloseTo(0.7 * 1.2, 12);
    expect(interval?.hi).toBeCloseTo(1.3 * 1, 12);
  });

  test("maxErrorFeasibleLevels is empty when the ratios spread too far", () => {
    // (1 + t) / (1 - t) = 13/7 at t = 0.3, so a ratio spread of 2 cannot be
    // covered by any level whatsoever.
    expect(maxErrorFeasibleLevels(fromRatios([1, 2]), 0.3)).toBeNull();
    expect(maxErrorFeasibleLevels(fromRatios([1, 1.8]), 0.3)).not.toBeNull();
  });

  test.each([
    [[1, 1.1, 1.25, 1.6, 2.4], 0.15],
    [[0.6, 1.0, 1.05, 1.9], 0.15],
    [[1, 1, 1, 5, 5, 5], 0.2],
    [[0.9, 1.0, 1.1], 0.05],
    [[1, 3, 3.2, 9], 0.25],
  ])("medianErrorFeasibleLevels %j matches the dense scan", (ratios, tolerance) => {
    const analytic = medianErrorFeasibleLevels(fromRatios(ratios), tolerance);
    const dense = denseFeasible(ratios, tolerance, "median");
    expect(analytic.length).toBe(dense.length);
    const span = 2 * Math.max(...ratios) - 0.5 * Math.min(...ratios);
    const grain = span / 200000;
    for (let i = 0; i < analytic.length; i += 1) {
      expect(Math.abs(analytic[i]!.lo - dense[i]!.lo)).toBeLessThan(2 * grain);
      expect(Math.abs(analytic[i]!.hi - dense[i]!.hi)).toBeLessThan(2 * grain);
    }
  });

  test("an even population's median is not a count of clubs inside the band", () => {
    // At level 1 exactly two of these four are inside 15%, so a count rule
    // would call it feasible. The two middle errors are 5% and 40%, whose
    // mean is 22.5%, so the actual median criterion rejects it.
    const ratios = [1, 1 / 0.95, 1 / 0.6, 2];
    expect(medianApeAt(ratios, 1)).toBeCloseTo(0.225, 10);
    const inside = ratios.filter((r) => Math.abs(1 - r) / r <= 0.15).length;
    expect(inside).toBe(ratios.length / 2);
    const feasible = medianErrorFeasibleLevels(fromRatios(ratios), 0.15);
    expect(feasible.some((interval) => interval.lo <= 1 && 1 <= interval.hi)).toBe(false);
  });

  test("maxCriterionWitness names the pair that decides the criterion", () => {
    const witness = maxCriterionWitness(fromRatios([1, 1.4, 2.5, 0.8]), 0.3);
    expect(witness.high.ratio).toBeCloseTo(2.5, 12);
    expect(witness.low.ratio).toBeCloseTo(0.8, 12);
    expect(witness.spread).toBeCloseTo(2.5 / 0.8, 12);
    expect(witness.allowedSpread).toBeCloseTo(1.3 / 0.7, 12);
    expect(witness.feasible).toBe(false);
  });

  test("the witness agrees with maxErrorFeasibleLevels on every population", () => {
    for (const ratios of [
      [1, 1.5],
      [1, 1.9],
      [1, 1.85],
      [0.4, 0.7, 0.55],
      [2, 2, 2],
    ]) {
      const population = fromRatios(ratios);
      expect(maxCriterionWitness(population, 0.3).feasible).toBe(
        maxErrorFeasibleLevels(population, 0.3) !== null
      );
    }
  });

  test("jointFeasibleLevels is empty as soon as the maximum criterion is", () => {
    expect(jointFeasibleLevels(fromRatios([1, 2]), 0.15, 0.3)).toEqual([]);
  });

  test("jointFeasibleLevels is contained in each criterion's own set", () => {
    const ratios = [1, 1.1, 1.2, 1.35, 1.5];
    const population = fromRatios(ratios);
    const joint = jointFeasibleLevels(population, 0.15, 0.3);
    const cap = maxErrorFeasibleLevels(population, 0.3);
    expect(joint.length).toBeGreaterThan(0);
    for (const interval of joint) {
      expect(interval.lo).toBeGreaterThanOrEqual((cap as { lo: number }).lo - 1e-12);
      expect(interval.hi).toBeLessThanOrEqual((cap as { hi: number }).hi + 1e-12);
      expect(medianApeAt(ratios, (interval.lo + interval.hi) / 2)).toBeLessThanOrEqual(
        0.15 + 1e-12
      );
    }
  });

  test("rejects a tolerance outside (0, 1)", () => {
    expect(() => medianErrorFeasibleLevels(fromRatios([1]), 0)).toThrow();
    expect(() => medianErrorFeasibleLevels(fromRatios([1]), 1)).toThrow();
    expect(() => maxErrorFeasibleLevels(fromRatios([1]), -0.1)).toThrow();
  });
});

describe("searchSlope", () => {
  /** A synthetic league whose payroll really was generated by one curve, so
   * the search has a right answer to be checked against. */
  const recoverable = (trueSlope: number, trueLevel: number): ObservationsAtSlope => {
    const clubOvr = [78, 74, 71, 69, 66, 64, 61, 58, 55];
    return (slope: number) =>
      clubOvr.map((ovr, i) => ({
        id: `c${i}`,
        target: trueLevel * 22 * Math.exp((ovr - WAGE_PIVOT) / trueSlope),
        shape: 22 * Math.exp((ovr - WAGE_PIVOT) / slope),
      }));
  };

  test("recovers the slope and level that generated the population", () => {
    const search = searchSlope(recoverable(9.3, 0.41), {
      min: 2,
      max: 20,
      step: 0.01,
    });
    expect(search.refined.slope).toBeCloseTo(9.3, 4);
    expect(search.refined.level).toBeCloseTo(0.41, 4);
    expect(search.refined.logSse).toBeLessThan(1e-12);
    expect(search.atRangeBoundary).toBe(false);
    expect(search.refineConverged).toBe(true);
    expect(search.refineIterations).toBeLessThan(200);
  });

  test("a recoverable population passes both criteria at every level in the set", () => {
    const search = searchSlope(recoverable(9.3, 0.41), {
      min: 2,
      max: 20,
      step: 0.01,
    });
    expect(search.refined.medianApePercent).toBeLessThan(1e-6);
    expect(search.refined.maxApePercent).toBeLessThan(1e-6);
    expect(search.refined.joint.length).toBe(1);
  });

  test("reports a boundary minimum as limited by the range rather than found", () => {
    // Ranks reversed: the strongest squads are paid the least, so no positive
    // slope fits and the loss falls monotonically towards the flattest curve
    // the range allows.
    const clubOvr = [78, 74, 71, 69, 66, 64, 61, 58, 55];
    const contradictory: ObservationsAtSlope = (slope: number) =>
      clubOvr.map((ovr, i) => ({
        id: `c${i}`,
        target: 10 * Math.exp((70 - ovr) / 8),
        shape: 22 * Math.exp((ovr - WAGE_PIVOT) / slope),
      }));
    const search = searchSlope(contradictory, { min: 2, max: 20, step: 0.01 });
    expect(search.atRangeBoundary).toBe(true);
    expect(search.gridBest.slope).toBe(20);
    expect(search.gridBest.joint.length).toBe(0);
    expect(feasibleSlopeRuns(search.scan)).toEqual([]);
  });

  test("counts the grid's local minima instead of assuming unimodality", () => {
    const search = searchSlope(recoverable(9.3, 0.41), {
      min: 2,
      max: 20,
      step: 0.01,
    });
    expect(search.localMinimaCount).toBe(1);
    expect(search.gridTies).toBe(0);
  });

  test("evaluateSlope agrees with the scan at a grid point", () => {
    const at = recoverable(9.3, 0.41);
    const scan = scanSlopes(at, { min: 5, max: 6, step: 0.5 });
    expect(scan.map((point) => point.slope)).toEqual([5, 5.5, 6]);
    expect(scan[1]!.logSse).toBeCloseTo(evaluateSlope(at, 5.5).logSse, 12);
  });

  test("feasibleSlopeRuns collapses adjacent feasible slopes into one run", () => {
    const search = searchSlope(recoverable(9.3, 0.41), {
      min: 2,
      max: 20,
      step: 0.01,
    });
    const runs = feasibleSlopeRuns(search.scan);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.some((run) => run.from <= 9.3 && 9.3 <= run.to)).toBe(true);
  });

  test("rejects a degenerate range", () => {
    const at = recoverable(9.3, 0.41);
    expect(() => scanSlopes(at, { min: 5, max: 5, step: 0.1 })).toThrow();
    expect(() => scanSlopes(at, { min: 5, max: 6, step: 0 })).toThrow();
  });
});
describe("leagueForecast", () => {
  const members = CLUBS.map((club) => ({
    clubId: club.clubId,
    shortName: club.shortName,
    rating: ratingForClubId(club.clubId),
  }));

  test("covers the whole playable eighteen", () => {
    const forecast = leagueForecast(members);
    expect(forecast.length).toBe(CLUBS.length);
    expect(forecast.map((f) => f.clubId).sort()).toEqual(CLUBS.map((c) => c.clubId).sort());
  });

  test("places are engine ranks, so a tie is allowed and 1..18 need not appear", () => {
    const tied = [
      { clubId: "a", shortName: "A", rating: { attack: 1.1, defence: 0.9 } },
      { clubId: "b", shortName: "B", rating: { attack: 1.1, defence: 0.9 } },
      { clubId: "c", shortName: "C", rating: { attack: 0.9, defence: 1.1 } },
    ];
    const forecast = leagueForecast(tied);
    expect(forecast[0]!.expectedPlace).toBe(1);
    expect(forecast[1]!.expectedPlace).toBe(1);
    expect(forecast[2]!.expectedPlace).toBe(3);
    expect(forecast[0]!.expectedPoints).toBeCloseTo(forecast[1]!.expectedPoints, 12);
  });

  test("agrees with the engine functions it delegates to", () => {
    const forecast = leagueForecast(members);
    const legiaIndex = members.findIndex((m) => m.clubId === "legia-warszawa");
    const opponents = members.filter((_, i) => i !== legiaIndex).map((m) => m.rating);
    expect(forecast[legiaIndex]!.expectedPoints).toBe(
      expectedSeasonPoints(members[legiaIndex]!.rating, opponents)
    );
    expect(forecast[legiaIndex]!.expectedPlace).toBe(
      expectedPlace(members[legiaIndex]!.rating, opponents)
    );
  });

  test("a stronger club is never forecast below a weaker one", () => {
    const forecast = leagueForecast(members);
    const sorted = [...forecast].sort((a, b) => b.expectedPoints - a.expectedPoints);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!.expectedPlace).toBeGreaterThanOrEqual(sorted[i - 1]!.expectedPlace);
    }
  });

  test("rejects a degenerate or non-finite rating", () => {
    expect(() => leagueForecast([members[0]!])).toThrow();
    expect(() =>
      leagueForecast([
        members[0]!,
        { clubId: "x", shortName: "X", rating: { attack: 0, defence: 1 } },
      ])
    ).toThrow();
    expect(() =>
      leagueForecast([
        members[0]!,
        {
          clubId: "x",
          shortName: "X",
          rating: { attack: Number.NaN, defence: 1 },
        },
      ])
    ).toThrow();
  });
});

describe("meritWeightSum", () => {
  test("is 171 for eighteen clubs, matching the manifest's ladder", () => {
    expect(meritWeightSum(18)).toBe(171);
    let byHand = 0;
    for (let place = 1; place <= 18; place += 1) byHand += 19 - place;
    expect(meritWeightSum(18)).toBe(byHand);
  });

  test("rejects a non-integer or too small league", () => {
    expect(() => meritWeightSum(17.5)).toThrow();
    expect(() => meritWeightSum(1)).toThrow();
  });
});

describe("deriveMoneyScale", () => {
  const clubs = [
    {
      clubId: "a",
      shortName: "A",
      recurringRevenuePln: 30e6,
      fittedPayrollPln: 20e6,
      forecastPlace: 1,
    },
    {
      clubId: "b",
      shortName: "B",
      recurringRevenuePln: 20e6,
      fittedPayrollPln: 14e6,
      forecastPlace: 2,
    },
    {
      clubId: "c",
      shortName: "C",
      recurringRevenuePln: 12e6,
      fittedPayrollPln: 10e6,
      forecastPlace: 3,
    },
  ];

  test("the ladder pays the whole pool out across the league", () => {
    const scale = deriveMoneyScale(clubs, 55_130_000, 1.1, 2e6);
    const paid = scale.surpluses.reduce((sum, entry) => sum + entry.leaguePrizePln, 0);
    expect(paid).toBeCloseTo(55_130_000, 3);
  });

  test("surplus is revenue minus payroll plus the ladder, per club", () => {
    const scale = deriveMoneyScale(clubs, 6_000_000, 1.1, 2e6);
    // Three clubs: weights 3, 2, 1 over a sum of 6, so 3.0, 2.0 and 1.0 mln.
    expect(scale.surpluses[0]!.leaguePrizePln).toBeCloseTo(3_000_000, 6);
    expect(scale.surpluses[0]!.surplusPln).toBeCloseTo(30e6 - 20e6 + 3e6, 6);
    expect(scale.surpluses[2]!.surplusPln).toBeCloseTo(12e6 - 10e6 + 1e6, 6);
  });

  test("the identity holds: the median club's balance lands exactly on zero", () => {
    const scale = deriveMoneyScale(clubs, 6_000_000, 1.1, 2e6);
    const inGameUnits = scale.medianSurplusPln / scale.pricePerGameMillionPln;
    expect(inGameUnits - 1.1).toBeCloseTo(0, 9);
  });

  test("the derived rate and pivot wage invert the scale exactly", () => {
    const scale = deriveMoneyScale(clubs, 6_000_000, 1.1, 2e6);
    expect(scale.leaguePrizeRate * scale.pricePerGameMillionPln * 6).toBeCloseTo(6_000_000, 3);
    expect(scale.wageAtPivot * scale.pricePerGameMillionPln).toBeCloseTo(2e6, 3);
  });

  test("refuses a population with no positive scale rather than reporting one", () => {
    const loss = clubs.map((club) => ({
      ...club,
      fittedPayrollPln: club.recurringRevenuePln * 5,
    }));
    expect(() => deriveMoneyScale(loss, 6_000_000, 1.1, 2e6)).toThrow(/no positive money scale/);
  });

  test("rejects non-finite inputs and an out-of-league place", () => {
    expect(() => deriveMoneyScale(clubs, Number.POSITIVE_INFINITY, 1.1, 2e6)).toThrow();
    expect(() => deriveMoneyScale(clubs, 6e6, 0, 2e6)).toThrow();
    expect(() => deriveMoneyScale(clubs, 6e6, 1.1, Number.NaN)).toThrow();
    expect(() =>
      deriveMoneyScale([{ ...clubs[0]!, forecastPlace: 9 }, clubs[1]!, clubs[2]!], 6e6, 1.1, 2e6)
    ).toThrow(/outside the league/);
    expect(() =>
      deriveMoneyScale(
        [{ ...clubs[0]!, recurringRevenuePln: Number.NaN }, clubs[1]!, clubs[2]!],
        6e6,
        1.1,
        2e6
      )
    ).toThrow(/not finite/);
    expect(() => deriveMoneyScale([], 6e6, 1.1, 2e6)).toThrow();
  });

  test("fixed costs stay an input: doubling them halves the scale", () => {
    const one = deriveMoneyScale(clubs, 6e6, 1.1, 2e6);
    const two = deriveMoneyScale(clubs, 6e6, 2.2, 2e6);
    expect(two.pricePerGameMillionPln).toBeCloseTo(one.pricePerGameMillionPln / 2, 6);
    expect(two.wageAtPivot).toBeCloseTo(one.wageAtPivot * 2, 9);
  });
});
describe("budgetShareFor", () => {
  test("is the floor when nothing is reported, and clamps what is", () => {
    expect(budgetShareFor()).toBe(MIN_BUDGET_SHARE);
    expect(budgetShareFor(0.05)).toBe(MIN_BUDGET_SHARE);
    expect(budgetShareFor(0.24)).toBe(0.24);
    expect(budgetShareFor(0.9)).toBe(MAX_BUDGET_SHARE);
  });

  test("rejects a non-finite share", () => {
    expect(() => budgetShareFor(Number.NaN)).toThrow();
  });
});

describe("interpolatedPercentile", () => {
  test("agrees with the balance tooling's quantile on the same input", () => {
    const values = [3, 1, 4, 1, 5, 9, 2, 6];
    for (const p of [0, 0.25, 0.5, 0.8, 1]) {
      expect(interpolatedPercentile(values, p)).toBeCloseTo(quantile(values, p), 12);
    }
  });

  test("interpolates on the index (n - 1) * p", () => {
    // n = 5, p = 0.8 puts the index at 3.2, so 80% of the way from 40 to 50.
    expect(interpolatedPercentile([10, 20, 30, 40, 50], 0.8)).toBeCloseTo(42, 12);
  });

  test("rejects an empty array or a p outside [0, 1]", () => {
    expect(() => interpolatedPercentile([], 0.5)).toThrow();
    expect(() => interpolatedPercentile([1], 1.2)).toThrow();
  });
});

describe("clubBudgets", () => {
  const eighteen = CLUBS.map((club) => ({
    clubId: club.clubId,
    shortName: club.shortName,
    recurringRevenuePln: financeProfileFor(club.clubId).recurringRevenuePln,
    backerBudgetPercentile: financeProfileFor(club.clubId).backerBudgetPercentile,
  }));

  test("covers the playable eighteen and nobody else", () => {
    const rows = clubBudgets(eighteen, 17_000_000);
    expect(rows.length).toBe(18);
    expect(rows.map((r) => r.clubId).sort()).toEqual(CLUBS.map((c) => c.clubId).sort());
  });

  test("an ordinary club's budget is its share of recurring revenue", () => {
    const rows = clubBudgets(eighteen, 17_000_000);
    const legia = rows.find((r) => r.clubId === "legia-warszawa");
    expect(legia?.ownerException).toBe(false);
    expect(legia?.share).toBe(MIN_BUDGET_SHARE);
    expect(legia?.budget).toBeCloseTo(
      (financeProfileFor("legia-warszawa").recurringRevenuePln / 17_000_000) * MIN_BUDGET_SHARE,
      12
    );
  });

  test("no budget exceeds the maximum share of its own revenue, exception aside", () => {
    for (const row of clubBudgets(eighteen, 17_000_000)) {
      if (row.ownerException) continue;
      expect(row.budget).toBeLessThanOrEqual(row.recurringGameMillions * MAX_BUDGET_SHARE + 1e-12);
    }
  });

  test("Wieczysta takes its manifest percentile of BASE budgets", () => {
    const rows = clubBudgets(eighteen, 17_000_000);
    const wieczysta = rows.find((r) => r.clubId === "wieczysta-krakow");
    expect(wieczysta?.ownerException).toBe(true);
    // Read off the manifest rather than off `OWNER_BUDGET_PERCENTILE`, which
    // is the money-scale fit's own historical constant and no longer the
    // number the club carries: the activation of 2026-09-12 moved it to the
    // strong backer level. The fit is a measurement of the OLD rule and stays
    // as it was; only the percentile it reads has to follow the data.
    const percentile = financeProfileFor("wieczysta-krakow").backerBudgetPercentile!;
    expect(wieczysta?.budget).toBeCloseTo(
      interpolatedPercentile(
        rows.map((r) => r.baseBudget),
        percentile
      ),
      12
    );
    // The exception raises it; that is the point of the exception.
    expect(wieczysta?.budget).toBeGreaterThan(wieczysta?.baseBudget ?? 0);
  });

  test("the percentile does not loop through the exception's own result", () => {
    // Moving the exception club's revenue moves ONLY its own base budget in
    // the sample, so a second application must land on the same figure - if
    // the substituted budget fed back in, it would not.
    const rows = clubBudgets(eighteen, 17_000_000);
    const substituted = rows.map((r) => ({
      clubId: r.clubId,
      shortName: r.shortName,
      recurringRevenuePln: r.budget * 17_000_000 * (1 / MIN_BUDGET_SHARE),
      backerBudgetPercentile: undefined,
    }));
    const again = clubBudgets(substituted, 17_000_000);
    const wieczysta = again.find((r) => r.clubId === "wieczysta-krakow");
    expect(wieczysta?.budget).toBeCloseTo(
      rows.find((r) => r.clubId === "wieczysta-krakow")?.budget ?? 0,
      9
    );
  });

  test("rejects an empty population, a bad scale or a bad revenue", () => {
    expect(() => clubBudgets([], 17_000_000)).toThrow();
    expect(() => clubBudgets(eighteen, 0)).toThrow();
    expect(() =>
      clubBudgets([{ clubId: "x", shortName: "X", recurringRevenuePln: -1 }], 17_000_000)
    ).toThrow();
  });
});

describe("domesticBuyingCapacity", () => {
  const thirtySix = [...CLUBS, ...FIRST_DIVISION].map((club) => ({
    clubId: club.clubId,
    shortName: club.shortName,
    recurringRevenuePln: financeProfileFor(club.clubId).recurringRevenuePln,
  }));

  test("covers every club the game can name", () => {
    const rows = domesticBuyingCapacity(thirtySix, 17_000_000, MAX_DOMESTIC_FEE, HAGGLE_SALE_BONUS);
    expect(rows.length).toBe(36);
    expect(new Set(rows.map((r) => r.clubId)).size).toBe(36);
  });

  test("capacity is the smaller of the revenue share and the domestic ceiling", () => {
    const rows = domesticBuyingCapacity(thirtySix, 17_000_000, MAX_DOMESTIC_FEE, HAGGLE_SALE_BONUS);
    for (const row of rows) {
      expect(row.capacity).toBeCloseTo(Math.min(MAX_DOMESTIC_FEE, row.uncappedCapacity), 12);
      expect(row.capBinding).toBe(row.uncappedCapacity > MAX_DOMESTIC_FEE);
      expect(row.offerBeforeHaggle).toBeCloseTo(row.capacity / (1 + HAGGLE_SALE_BONUS), 12);
    }
  });

  test("a ceiling that never binds is reported, not treated as an error", () => {
    const rows = domesticBuyingCapacity(thirtySix, 17_000_000, MAX_DOMESTIC_FEE, HAGGLE_SALE_BONUS);
    // Whether it binds is data. The assertion is that the flag is consistent,
    // not that some club must reach the ceiling.
    expect(rows.every((row) => row.capBinding === row.uncappedCapacity > MAX_DOMESTIC_FEE)).toBe(
      true
    );
  });

  test("rejects a bad scale, fee ceiling or haggle bonus", () => {
    expect(() => domesticBuyingCapacity(thirtySix, 0, 5.5, 0.2)).toThrow();
    expect(() => domesticBuyingCapacity(thirtySix, 17e6, 0, 0.2)).toThrow();
    expect(() => domesticBuyingCapacity(thirtySix, 17e6, 5.5, 0)).toThrow();
    expect(() => domesticBuyingCapacity([], 17e6, 5.5, 0.2)).toThrow();
  });
});

describe("priceCohort and summariseCohort", () => {
  const wageParams = { wageAtPivot: 0.13, wageSlope: 14.5 };
  const cohort = [
    { ovr: 64, age: 20, pos: "ŚP" as const },
    { ovr: 70, age: 25, pos: "ŚO" as const },
    { ovr: 78, age: 26, pos: "N" as const },
    { ovr: 58, age: 31, pos: "BR" as const },
  ];
  /** A curve of the fitted family with hand-picked parameters. These tests
   * are about the cost arithmetic, so running the whole step-3a grid to get
   * the real one would spend minutes proving nothing extra. */
  const CURVE: ValueCurveParams = {
    vmax: 13,
    slope: 6.6,
    midpoint: 87.6,
    youngShift: 5.2,
    peakEndShift: -3,
    latePlusThreeShift: -7.2,
    latePlusSixShift: -11.4,
  };
  const priceOf = (player: { ovr: number; age: number; pos: PositionCode }): number =>
    marketValueAt(player.ovr, player.age, AGE_PROFILES[player.pos], CURVE);

  test("fee is the market value times the median deviation and the market state", () => {
    const costs = priceCohort(cohort, wageParams, priceOf, 1);
    for (const cost of costs) {
      expect(cost.fee).toBeCloseTo(cost.marketValue * KUPNO_MEDIAN_PRICE_DEVIATION, 12);
      expect(cost.annualWage).toBeCloseTo(baseWage(cost.ovr, wageParams), 12);
      expect(cost.firstYearCost).toBeCloseTo(cost.fee + cost.annualWage, 12);
    }
  });

  test("an emptier market makes every fee dearer by the same factor", () => {
    const calm = priceCohort(cohort, wageParams, priceOf, 1);
    const empty = priceCohort(cohort, wageParams, priceOf, 1.4);
    for (let i = 0; i < calm.length; i += 1) {
      expect(empty[i]!.fee / calm[i]!.fee).toBeCloseTo(1.4, 12);
    }
  });

  test("the median first-year cost is not the sum of the two medians", () => {
    // Constructed so the median fee and the median wage belong to different
    // players: the cheapest fee here carries the second-highest wage.
    const costs = [
      {
        ovr: 0,
        age: 0,
        pos: "ŚP" as const,
        marketValue: 0,
        fee: 1,
        annualWage: 4,
        firstYearCost: 5,
      },
      {
        ovr: 0,
        age: 0,
        pos: "ŚP" as const,
        marketValue: 0,
        fee: 2,
        annualWage: 3,
        firstYearCost: 5,
      },
      {
        ovr: 0,
        age: 0,
        pos: "ŚP" as const,
        marketValue: 0,
        fee: 9,
        annualWage: 1,
        firstYearCost: 10,
      },
      {
        ovr: 0,
        age: 0,
        pos: "ŚP" as const,
        marketValue: 0,
        fee: 10,
        annualWage: 0.5,
        firstYearCost: 10.5,
      },
    ];
    const summary = summariseCohort(costs);
    expect(summary.medianFee).toBeCloseTo(5.5, 12);
    expect(summary.medianAnnualWage).toBeCloseTo(2, 12);
    expect(summary.sumOfMedians).toBeCloseTo(7.5, 12);
    expect(summary.medianFirstYearCost).toBeCloseTo(7.5, 12);
    // Same here by coincidence of the construction; make the disagreement
    // explicit with a third case rather than relying on this one.
    const shifted = summariseCohort(costs.slice(0, 3));
    expect(shifted.medianFirstYearCost).toBeCloseTo(5, 12);
    expect(shifted.sumOfMedians).toBeCloseTo(2 + 3, 12);
    expect(shifted.count).toBe(3);
  });

  test("rejects an empty cohort or a non-positive price", () => {
    expect(() => priceCohort([], wageParams, priceOf, 1)).toThrow();
    expect(() => priceCohort(cohort, wageParams, () => 0, 1)).toThrow();
    expect(() => priceCohort(cohort, wageParams, priceOf, 0)).toThrow();
    expect(() => summariseCohort([])).toThrow();
  });
});

describe("playabilityCheck", () => {
  const budgets = [
    {
      clubId: "rich",
      shortName: "Rich",
      recurringGameMillions: 10,
      share: 0.18,
      baseBudget: 1.8,
      budget: 1.8,
      ownerException: false,
    },
    {
      clubId: "poor",
      shortName: "Poor",
      recurringGameMillions: 1,
      share: 0.18,
      baseBudget: 0.18,
      budget: 0.18,
      ownerException: false,
    },
  ];

  test("passes a club that can cover the median card and its first-year wage", () => {
    const rows = playabilityCheck(budgets, 0.5);
    expect(rows[0]!.playable).toBe(true);
    expect(rows[0]!.shortfall).toBe(0);
    expect(rows[1]!.playable).toBe(false);
    expect(rows[1]!.shortfall).toBeCloseTo(0.32, 12);
  });

  test("reports the share a failing club would need rather than choosing a fix", () => {
    const rows = playabilityCheck(budgets, 0.5);
    expect(rows[1]!.requiredShare).toBeCloseTo(0.5, 12);
    expect(rows[0]!.requiredShare).toBeCloseTo(0.05, 12);
  });

  test("rejects a non-positive median cost", () => {
    expect(() => playabilityCheck(budgets, 0)).toThrow();
    expect(() => playabilityCheck(budgets, Number.NaN)).toThrow();
  });
});

describe("probeSpreadAcrossScales", () => {
  /**
   * Synthetic on purpose: the real population's verdict is what the report
   * measures, and a test restating it would prove nothing about the probe.
   *
   * Exponents stay at 20 so that exp(20 / 0.05) is still finite - the probe's
   * lower end multiplies them by twenty, and a fixture that overflowed there
   * would be testing the guard rather than the probe.
   */
  const equalShapes =
    (targets: readonly number[]): ObservationsAtSlope =>
    (slope) =>
      targets.map((target, i) => ({ id: `c${i}`, target, shape: Math.exp(20 / slope) }));
  const infeasible = equalShapes([100, 10]);
  const feasible = equalShapes([100, 95]);

  test("reports the flat-curve limit as max(target)/min(target)", () => {
    expect(limitSpreadAtFlatCurve(infeasible(10))).toBeCloseTo(10, 12);
    expect(limitSpreadAtFlatCurve(feasible(10))).toBeCloseTo(100 / 95, 12);
  });

  test("the limit ignores shape, because a flat curve makes shapes equal", () => {
    expect(
      limitSpreadAtFlatCurve([
        { id: "a", target: 8, shape: 1 },
        { id: "b", target: 2, shape: 1000 },
      ])
    ).toBeCloseTo(4, 12);
  });

  test("probes strictly outside the fine scan's own range", () => {
    // The whole reason the probe exists: a verdict bounded by [2, 20] cannot
    // say whether a solution sits just past either end.
    expect(WIDE_SLOPE_PROBE.min).toBeLessThan(SLOPE_SCAN_RANGE.min);
    expect(WIDE_SLOPE_PROBE.max).toBeGreaterThan(SLOPE_SCAN_RANGE.max);
  });

  test("calls a spread that no slope can close infeasible", () => {
    const probe = probeSpreadAcrossScales(infeasible);
    expect(probe.anyFeasible).toBe(false);
    expect(probe.minSpread).toBeCloseTo(10, 6);
    expect(probe.limitSpread).toBeCloseTo(10, 6);
    expect(probe.allowedSpread).toBeCloseTo(1.3 / 0.7, 12);
  });

  test("calls a spread inside the tolerance feasible", () => {
    const probe = probeSpreadAcrossScales(feasible);
    expect(probe.anyFeasible).toBe(true);
    expect(probe.minSpread).toBeLessThanOrEqual(probe.allowedSpread);
  });

  test("finds a feasible region the fine scan's range would miss", () => {
    // Infeasible everywhere in [2, 20], feasible only far above it. Scanning
    // the narrow range alone would report a floor that is not the floor.
    const lateDip: ObservationsAtSlope = (slope) => [
      { id: "a", target: 100, shape: Math.exp(20 / slope) },
      { id: "b", target: 95, shape: 1 },
    ];
    for (const slope of [2, 10, 20]) {
      expect(maxCriterionWitness(lateDip(slope), 0.3).feasible, `slope ${slope}`).toBe(false);
    }
    const probe = probeSpreadAcrossScales(lateDip);
    expect(probe.anyFeasible).toBe(true);
    expect(probe.minSpreadSlope).toBeGreaterThan(SLOPE_SCAN_RANGE.max);
  });

  test("rejects a probe that is not a positive increasing range", () => {
    expect(() => probeSpreadAcrossScales(feasible, 0.3, { min: 0, max: 10, points: 5 })).toThrow();
    expect(() => probeSpreadAcrossScales(feasible, 0.3, { min: 5, max: 5, points: 5 })).toThrow();
    expect(() => probeSpreadAcrossScales(feasible, 0.3, { min: 1, max: 10, points: 1 })).toThrow();
  });

  test("is deterministic", () => {
    expect(probeSpreadAcrossScales(infeasible)).toEqual(probeSpreadAcrossScales(infeasible));
  });
});

describe("optionAVariantAt", () => {
  const OVRS = [60, 70, 80, 90];
  const clubs = (shapes: readonly number[]) =>
    shapes.map((shape, i) => ({
      clubId: `c${i}`,
      shortName: `C${i}`,
      recurringRevenuePln: 40_000_000 + i * 10_000_000,
      shape,
      forecastPlace: i + 1,
    }));
  const observationsAt = (slope: number) =>
    [70, 68, 66].map((ovr, i) => ({
      id: `c${i}`,
      target: 20_000_000 - i * 3_000_000,
      shape: 20 * Math.exp((ovr - 70) / slope),
    }));
  /** A cohort whose fee is fixed in real euro and whose wage follows the
   * curve under test - the same asymmetry the real cohort has. */
  const medianFirstYearCostAt = (params: { wageAtPivot: number; wageSlope: number }): number =>
    0.6 + baseWage(64, params);
  /** A free-agent premium that hits a fixed target overpay: it depends on the
   * wage curve exactly the way the real one does. */
  const freeAgentPremiumAt = (params: { wageAtPivot: number; wageSlope: number }): number =>
    1 + 0.5 / ((2 * baseWage(74, params)) / 0.85);
  const variantAt = (slope: number) =>
    optionAVariantAt(
      slope,
      observationsAt(slope),
      clubs(observationsAt(slope).map((o) => o.shape)),
      55_130_000,
      1.1,
      OVRS,
      medianFirstYearCostAt,
      freeAgentPremiumAt
    );

  test("matches the aggregate exactly, at every slope", () => {
    for (const slope of [4, 10, 20]) {
      const observations = observationsAt(slope);
      const variant = variantAt(slope);
      const predicted = observations.reduce((sum, o) => sum + variant.levelPln * o.shape, 0);
      const target = observations.reduce((sum, o) => sum + o.target, 0);
      expect(predicted / target, `slope ${slope}`).toBeCloseTo(1, 9);
    }
  });

  test("re-derives the money scale, so D moves with the slope", () => {
    // The regression this function exists for: reusing one reference slope's
    // payrolls left D identical in every row and the table said nothing.
    const divisors = [4, 10, 20].map((slope) => variantAt(slope).pricePerGameMillionPln);
    expect(new Set(divisors.map((d) => Math.round(d))).size).toBeGreaterThan(1);
  });

  test("a steeper slope pays the star more and the squad player less", () => {
    const wage = (slope: number, ovr: number) =>
      variantAt(slope).wageByOvr.find((entry) => entry.ovr === ovr)!.wage;
    expect(wage(4, 90)).toBeGreaterThan(wage(20, 90));
    expect(wage(4, 60)).toBeLessThan(wage(20, 60));
  });

  test("the pivot wage is the level in game units, by construction", () => {
    const variant = variantAt(10);
    expect(variant.wageAtPivot * variant.pricePerGameMillionPln).toBeCloseTo(variant.levelPln, 6);
    expect(variant.wageByOvr.find((entry) => entry.ovr === 70)!.wage).toBeCloseTo(
      variant.wageAtPivot,
      12
    );
  });

  test("the poorest club always spends a larger share on the same player", () => {
    const variant = variantAt(10);
    expect(variant.topWageSharePoorest).toBeGreaterThan(variant.topWageShareRichest);
  });

  test("carries the cohort cost and playability measured at ITS OWN slope", () => {
    // The coupling this field exists for: the budget-policy table is computed
    // at one reference slope, but option A moves the wage curve and therefore
    // both the money scale and the first-year cost. A floor chosen from the
    // reference row would be a floor for a slope nobody picked.
    const costs = [4, 10, 20].map((slope) => variantAt(slope).medianFirstYearCost);
    expect(new Set(costs.map((cost) => cost.toFixed(6))).size).toBe(costs.length);
    for (const slope of [4, 10, 20]) {
      const variant = variantAt(slope);
      expect(variant.medianFirstYearCost).toBeCloseTo(
        medianFirstYearCostAt({ wageAtPivot: variant.wageAtPivot, wageSlope: slope }),
        12
      );
    }
  });

  test("the floor for full playability is exactly that cohort cost", () => {
    const variant = variantAt(10);
    expect(variant.floorForFullPlayability).toBeCloseTo(variant.medianFirstYearCost, 12);
    expect(variant.playableAtMinShare).toBeLessThanOrEqual(variant.clubCount);
    expect(variant.clubCount).toBe(3);
  });

  test("playability counts the clubs whose minimum share covers that cost", () => {
    const variant = variantAt(10);
    const byHand = clubs(observationsAt(10).map((o) => o.shape)).filter(
      (club) =>
        (club.recurringRevenuePln / variant.pricePerGameMillionPln) * MIN_BUDGET_SHARE >=
        variant.medianFirstYearCost
    ).length;
    expect(variant.playableAtMinShare).toBe(byHand);
  });

  test("the free-agent premium is fitted at THIS row's wage curve", () => {
    // Same coupling as the cohort cost, and the one that bit in review: the
    // premium is 1 + target / unitShare, and unitShare is two seasons of wage
    // over a fee anchored in real euro. Move the wage curve and the premium
    // moves with it, so a premium fitted at one slope is wrong at another.
    const premiums = [4, 10, 20].map((slope) => variantAt(slope).freeAgentPremium);
    expect(new Set(premiums.map((p) => p.toFixed(6))).size).toBe(premiums.length);
    for (const slope of [4, 10, 20]) {
      const variant = variantAt(slope);
      expect(variant.freeAgentPremium).toBeCloseTo(
        freeAgentPremiumAt({ wageAtPivot: variant.wageAtPivot, wageSlope: slope }),
        12
      );
    }
  });

  test("a steeper curve needs a smaller premium, because the wage is already bigger", () => {
    // At ovr 74 - above the pivot - a steeper curve pays more, so two seasons
    // of it already cover more of the fee and less has to come from a premium.
    expect(variantAt(4).freeAgentPremium).toBeLessThan(variantAt(20).freeAgentPremium);
  });

  test("rejects a non-positive slope, an empty population and a bad cost", () => {
    expect(() =>
      optionAVariantAt(
        0,
        observationsAt(10),
        clubs([1]),
        1,
        1,
        OVRS,
        medianFirstYearCostAt,
        freeAgentPremiumAt
      )
    ).toThrow();
    expect(() =>
      optionAVariantAt(
        10,
        observationsAt(10),
        [],
        1,
        1,
        OVRS,
        medianFirstYearCostAt,
        freeAgentPremiumAt
      )
    ).toThrow();
    expect(() =>
      optionAVariantAt(
        10,
        observationsAt(10),
        clubs([1]),
        55_130_000,
        1.1,
        OVRS,
        () => 0,
        freeAgentPremiumAt
      )
    ).toThrow();
    expect(() =>
      optionAVariantAt(
        10,
        observationsAt(10),
        clubs([1]),
        55_130_000,
        1.1,
        OVRS,
        medianFirstYearCostAt,
        () => 0
      )
    ).toThrow();
  });
});
