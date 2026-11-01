/**
 * The leak and the usefulness the rising-confidence rule is allowed to have.
 *
 * The `pnpm audit:staff-reports` measurement of 2026-08-26 showed the
 * numbers once; this test keeps them. Every bound is set on a measured value
 * with margin AND on the right side of what the same measurement gave BEFORE
 * the change - otherwise it would happily pass a silent return to the old
 * behaviour.
 *
 * One place that is impossible: A2@10 rose (10.05 -> 11.24), because the
 * guaranteed `high` channel is deliberately stronger there. No upper bound can
 * separate old from new at that point, so the regression guard for A2 sits on
 * the cohort WITHOUT the guarantee, which fell from 10.05 to 3.05.
 *
 * Deliberately a smaller cohort than the report's 20000 x 5 - the values track
 * it to within a tenth of an OVR, and this has to run inside `pnpm test`.
 */
import { describe, expect, test } from "vitest";

import {
  guaranteeCoverage,
  leakScan,
  leakScanByCohort,
  usefulnessScan,
} from "../../scripts/staff-report-scan";
import type { PositionCode } from "../../src/data/types";

const COHORT = {
  ovr: 62,
  wiek: 18,
  poz: "ŚP" as PositionCode,
  players: 3_000,
  batches: 3,
  seed: 0x11ee_0007,
} as const;

describe("what a staff report may reveal", () => {
  test("A1 - repeat entries inside one season add nothing at all", () => {
    // Four distinguishable window x source combinations existed and each was
    // an independent draw; they are now one report, so the separation at four
    // reads must equal the separation at one EXACTLY, not merely be close.
    const one = leakScan({ ...COHORT, schedule: "a1", reads: 1 });
    const four = leakScan({ ...COHORT, schedule: "a1", reads: 4 });

    expect(four.value).toBe(one.value);
    // Before the change: 3.74 at one read, 7.12 at four.
    expect(four.value).toBeLessThan(3.0);
  });

  test("A2 - the second window of a season adds nothing, later seasons still do", () => {
    const summerOnly = leakScanByCohort({ ...COHORT, schedule: "a2", reads: 1 });
    const bothWindows = leakScanByCohort({ ...COHORT, schedule: "a2", reads: 2 });
    const fiveSeasons = leakScanByCohort({ ...COHORT, schedule: "a2", reads: 10 });

    expect(bothWindows.all.value).toBe(summerOnly.all.value);
    // Before: 5.33 at two reads. The whole point of the rule.
    expect(bothWindows.all.value).toBeLessThan(3.0);

    // Ten reads is five annual reports now, not ten observations - and the
    // expectation is that it lands near five, never near one. What it may not
    // do is grow for the ordinary noisy report: before the change the whole
    // population sat at 10.05 here.
    expect(fiveSeasons.plain.value).toBeLessThan(4.0);
    expect(fiveSeasons.all.value).toBeGreaterThan(fiveSeasons.plain.value);

    // The accepted overrun, recorded rather than hidden: A2's budget from the
    // baseline run is 10.107 and the whole population now sits above it,
    // entirely because of the guaranteed channel. Product owner's call,
    // 2026-08-26.
    expect(fiveSeasons.all.value).toBeLessThan(12.0);
  });

  test("A3 - the real longitudinal run stays inside its baseline budget", () => {
    // A3's own budget from the baseline run is 14.910 (its highest point plus
    // two standard errors). One budget taken from A2 never bounded this
    // schedule: it was already at 14.83 before anything changed.
    const career = leakScanByCohort({ ...COHORT, schedule: "a3", reads: 10 });

    expect(career.all.value).toBeLessThan(14.91);
    // And the ordinary report inside it fell by half: 14.83 -> 7.93.
    expect(career.plain.value).toBeLessThan(9.0);
  });
});

describe("how useful a staff report has to stay", () => {
  const scan = usefulnessScan({ ...COHORT, seasons: 5 });

  test("accuracy did not fall - it rose", () => {
    // Season 5 was 65.8% before the change.
    expect(scan.accuracyBySeason[4]).toBeGreaterThan(0.78);
    expect(scan.accuracyOverall).toBeGreaterThan(0.55); // was 47.5%
  });

  test("the badly wrong reports did not become more common", () => {
    // Off by two bands or more: 11.7% before.
    expect(scan.twoBandErrorRate).toBeLessThan(0.11);
    expect(scan.meanBandError).toBeLessThan(0.6); // was 0.654
  });

  test("a guaranteed high names the right band every single time", () => {
    // Not "more often" - exactly. That is what the guarantee means, and it is
    // the price the new channel pays for revealing more.
    expect(scan.byKind.guaranteedHigh.reports).toBeGreaterThan(10_000);
    expect(scan.byKind.guaranteedHigh.accuracy).toBe(1);
  });

  test("inside the ungaranteed cohort, medium still beats low", () => {
    expect(scan.plainAccuracyByConfidence.medium).toBeGreaterThan(
      scan.plainAccuracyByConfidence.low
    );
  });

  test("no current report inflates those figures", () => {
    // `current` reads visible OVR and is right by construction, so it is
    // measured as its own control rather than blended in. This cohort is
    // eighteen-year-olds over five seasons, so it produces none at all - and
    // if that ever changes, the accuracy numbers above stop meaning what they
    // say here.
    expect(scan.byKind.current.reports).toBe(0);
  });
});

describe("the tenure reward is reachable", () => {
  const coverage = guaranteeCoverage({ ...COHORT, players: 1_500 });

  test("a third season of observation is worth having", () => {
    expect(coverage.overall).toBeGreaterThan(0.2);
  });

  test.each([2, 3, 4, 5, 6, 7])("%i years from the peak, the gate can still open", (years) => {
    const bucket = coverage.byYearsToPeak.find((row) => row.years === years);
    expect(bucket?.players ?? 0).toBeGreaterThan(1_000);
    expect(bucket!.share).toBeGreaterThan(0.1);
  });
});
