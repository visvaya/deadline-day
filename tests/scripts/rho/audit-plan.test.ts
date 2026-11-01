import { describe, expect, it } from "vitest";

import { planRun, reportStatus, type RunOptions } from "../../../scripts/rho/audit-core";
import { ALL_SEASONS, CALIBRATION_WINDOW } from "../../../scripts/match-engine-audit-reference";

const options = (overrides: Partial<RunOptions> = {}): RunOptions => ({
  lrtReplications: 5000,
  blockReplications: 2000,
  seedShift: 0,
  ...overrides,
});

describe("run plan", () => {
  it("gives the main window the ten seasons and the sensitivity window nine", () => {
    const [main, sensitivity] = planRun(options());
    expect(main!.seasons).toEqual(ALL_SEASONS);
    expect(sensitivity!.seasons).toEqual(CALIBRATION_WINDOW);
    expect(sensitivity!.seasons).not.toContain("2020/21");
  });

  it("moves BOTH windows when --seed moves, not only the sensitivity one", () => {
    // The bug this test exists for: the main ten-season bootstrap was given a
    // hard-coded offset of zero, so two runs with different seeds differed
    // only in the half nobody reads first. Parsing the flag was never the
    // problem - where the parsed value went was.
    const zero = planRun(options());
    const shifted = planRun(options({ seedShift: 7 }));
    expect(shifted[0]!.seedOffset).toBe(zero[0]!.seedOffset + 7);
    expect(shifted[1]!.seedOffset).toBe(zero[1]!.seedOffset + 7);
  });

  it("keeps the two windows' seed ranges apart", () => {
    const [main, sensitivity] = planRun(options({ seedShift: 3 }));
    expect(sensitivity!.seedOffset - main!.seedOffset).toBeGreaterThan(100_000);
  });

  it("caps the sensitivity window's replications without raising them", () => {
    const heavy = planRun(options({ lrtReplications: 20000, blockReplications: 9000 }));
    expect(heavy[1]!.lrtReplications).toBe(2000);
    expect(heavy[1]!.blockReplications).toBe(2000);
    const light = planRun(options({ lrtReplications: 40, blockReplications: 30 }));
    expect(light[1]!.lrtReplications).toBe(40);
    expect(light[1]!.blockReplications).toBe(30);
  });
});

describe("report status", () => {
  const decisive = { lower: 0.0002, upper: 0.0002 };
  // In the escalation band but decided: 0.012 is above 0.01 at both ends.
  const inBand = { lower: 0.012, upper: 0.012 };

  it("calls a run below the binding counts a smoke run whatever its p-value", () => {
    // Two replications that happen to miss the escalation band used to
    // produce a report stamped final.
    expect(reportStatus(decisive, options({ lrtReplications: 2, blockReplications: 2 }))).toBe(
      "smoke"
    );
    expect(reportStatus(decisive, options({ blockReplications: 1999 }))).toBe("smoke");
    expect(reportStatus(decisive, options({ lrtReplications: 4999 }))).toBe("smoke");
  });

  it("owes one escalation when p lands in the band, and only one", () => {
    expect(reportStatus(inBand, options())).toBe("escalation-owed");
    // The repeat at 20000 decides; it does not owe a third.
    expect(reportStatus(inBand, options({ lrtReplications: 20000 }))).toBe("final");
  });

  it("is inconclusive when failures straddle the threshold at the full count", () => {
    // A bracketed p containing 0.01 has not said which side it is on. Below
    // the escalation count the one repeat exists for exactly that; at or
    // above it there is no further run, so the honest label is inconclusive.
    // Protocol change of 2026-09-01: no third attempt in either direction.
    const straddling = { lower: 0.009, upper: 0.011 };
    expect(reportStatus(straddling, options({ lrtReplications: 20000 }))).toBe("inconclusive");
    expect(reportStatus(straddling, options())).toBe("escalation-owed");
    // A point p exactly at the threshold is decided, not straddling: the rule
    // is p < 0.01, so 0.01 itself fails the test rather than confusing it.
    expect(reportStatus({ lower: 0.01, upper: 0.01 }, options({ lrtReplications: 20000 }))).toBe(
      "final"
    );
  });

  it("is final when the counts hold and p is clear of the band", () => {
    expect(reportStatus(decisive, options())).toBe("final");
    expect(reportStatus({ lower: 0.4, upper: 0.4 }, options())).toBe("final");
  });

  it("owes an escalation when the p interval merely touches the band", () => {
    // A bracketed p straddling the band is not clear of it, and a run that
    // cannot tell which side it is on has not decided anything.
    expect(reportStatus({ lower: 0.001, upper: 0.006 }, options())).toBe("escalation-owed");
  });
});
