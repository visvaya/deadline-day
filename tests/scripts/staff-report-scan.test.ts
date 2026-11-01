/**
 * Controls for the scanner itself. Nothing here measures the game - these
 * tests measure whether the instrument can tell a leak from no leak at all,
 * which is the only reason to trust the numbers it prints.
 */
import { describe, expect, test } from "vitest";

import {
  A1_CEILING,
  careerLeakBudget,
  comparePairedBatches,
  formatRawCsv,
  guaranteeCoverage,
  leakScan,
  parseRawCsv,
  scheduleContexts,
  schedulePoints,
  usefulnessScan,
  worstSchedulePoint,
} from "../../scripts/staff-report-scan";
import type { PositionCode } from "../../src/data/types";

const COHORT = {
  ovr: 62,
  wiek: 18,
  poz: "ŚP" as PositionCode,
  players: 2_000,
  batches: 4,
  seed: 0xce11_0001,
} as const;

describe("staff report scan", () => {
  test("a signal blind to the player separates no ceilings", () => {
    // Control. If the reported level ignores sufit, the extreme signal
    // terciles must hold players of the same average ceiling. Anything here
    // means the scan itself is broken.
    const separation = leakScan({ ...COHORT, reads: 4, signal: (_player, rng) => rng.next() });

    expect(Math.abs(separation.value)).toBeLessThan(3 * separation.standardError);
  });

  test("a signal that IS the ceiling separates a lot", () => {
    const separation = leakScan({ ...COHORT, reads: 1, signal: (player) => player.sufit });

    expect(separation.value).toBeGreaterThan(10);
  });

  test("usefulness rises with confidence", () => {
    // A report that says "high" must be right more often than one that says
    // "low", or the confidence label means nothing.
    const scan = usefulnessScan({ ...COHORT, seasons: 5 });

    expect(scan.accuracyByConfidence.high).toBeGreaterThan(scan.accuracyByConfidence.medium);
    expect(scan.accuracyByConfidence.medium).toBeGreaterThan(scan.accuracyByConfidence.low);
  });

  test("A1 cannot invent a fifth distinguishable read", () => {
    expect(scheduleContexts("a1", 10)).toHaveLength(A1_CEILING);
    expect(scheduleContexts("a2", 10)).toHaveLength(10);
    expect(scheduleContexts("a3", 5)).toHaveLength(5);
  });

  test("the tenure gate reports coverage per years-to-peak", () => {
    const coverage = guaranteeCoverage(COHORT);

    expect(coverage.byYearsToPeak.length).toBeGreaterThan(0);
    for (const row of coverage.byYearsToPeak) {
      expect(row.years).toBeGreaterThanOrEqual(2);
      expect(row.share).toBeGreaterThanOrEqual(0);
      expect(row.share).toBeLessThanOrEqual(1);
    }
  });

  test("the before/after gate pairs raw rows by batch, schedule and reads", () => {
    const before = [
      { batchSeed: 11, schedule: "a2", reads: 10, separation: 6.2, accuracy: 0.48 },
      { batchSeed: 22, schedule: "a2", reads: 10, separation: 6.0, accuracy: 0.5 },
    ] as const;
    const after = [
      { batchSeed: 11, schedule: "a2", reads: 10, separation: 5.2, accuracy: 0.49 },
      { batchSeed: 22, schedule: "a2", reads: 10, separation: 5.4, accuracy: 0.52 },
    ] as const;

    expect(comparePairedBatches(before, after).separation.meanDelta).toBeCloseTo(-0.8);
    expect(() => comparePairedBatches(before, after.slice(1))).toThrow(/missing pair/i);
  });

  test("the raw dump round-trips", () => {
    const rows = [
      { batchSeed: 11, schedule: "a1", reads: 4, separation: 3.125, accuracy: 0.481 },
      { batchSeed: 22, schedule: "a3", reads: 5, separation: 4.5, accuracy: 0.5 },
    ];

    expect(parseRawCsv(formatRawCsv(rows))).toEqual(rows);
  });
});

/**
 * The budget table compares two numbers, and they have to be the same KIND of
 * number. They were not: the budget averaged the batches at a point, while the
 * "highest point now" column picked the single largest batch row - so on one
 * run A2@10 printed as 11.09 in the measurement table and 11.23 in the budget
 * table. A one-cohort maximum is not the point the budget was set on.
 */
describe("budget aggregation", () => {
  const rows = [
    // A2@10: batch means 10 and 12, so the point is 11 - and no batch is 11.
    { batchSeed: 1, schedule: "a2", reads: 10, separation: 10, accuracy: 0.5 },
    { batchSeed: 2, schedule: "a2", reads: 10, separation: 12, accuracy: 0.5 },
    // A2@4 is a lower point, so it must not be the one reported.
    { batchSeed: 1, schedule: "a2", reads: 4, separation: 3, accuracy: 0.5 },
    { batchSeed: 2, schedule: "a2", reads: 4, separation: 5, accuracy: 0.5 },
    { batchSeed: 1, schedule: "a3", reads: 5, separation: 14, accuracy: 0.5 },
    { batchSeed: 2, schedule: "a3", reads: 5, separation: 14, accuracy: 0.5 },
  ];

  test("a point is the mean over batches, not the luckiest cohort", () => {
    const a2 = schedulePoints(rows).get("a2")!;
    const tenReads = a2.find((point) => point.reads === 10)!;

    expect(tenReads.mean).toBe(11);
    expect(tenReads.batches).toBe(2);
    // The largest single row was 12. Reporting that would overstate the point
    // by a whole OVR on this data.
    expect(tenReads.mean).not.toBe(12);
  });

  test("the worst point is the highest MEAN, over every reads count", () => {
    const worst = worstSchedulePoint(schedulePoints(rows).get("a2")!);

    expect(worst.reads).toBe(10);
    expect(worst.mean).toBe(11);
  });

  test("the budget is that same point plus two standard errors", () => {
    const points = schedulePoints(rows).get("a2")!;
    const worst = worstSchedulePoint(points);
    const budget = careerLeakBudget(rows).get("a2")!;

    // Same aggregation on both sides of the inequality the gate checks - that
    // is the whole point of this test.
    expect(budget).toBeCloseTo(worst.mean + 2 * worst.standardError, 10);
    expect(budget).toBeGreaterThan(worst.mean);
  });

  test("a schedule with no spread gets a budget equal to its point", () => {
    const a3 = worstSchedulePoint(schedulePoints(rows).get("a3")!);

    expect(a3.mean).toBe(14);
    expect(careerLeakBudget(rows).get("a3")).toBe(14);
  });
});
