import { describe, expect, it } from "vitest";

import {
  buildGrid,
  resampleRhoFromCurves,
  separableBlockBootstrap,
  type SeasonCurves,
} from "../../../scripts/rho/dixon-coles-blocks";
import {
  doubleRoundRobin,
  evenlySpreadTruth,
  simulateLeague,
} from "../../../scripts/rho/dixon-coles-simulate";
import { blockBootstrap, conservativePercentileInterval } from "../../../scripts/rho/audit-core";

/** A parabola per season, minimised at a chosen rho, so the argmin the code
 * should find is known in closed form rather than eyeballed. */
const parabolaCurves = (grid: readonly number[], minima: readonly number[]): SeasonCurves => ({
  grid,
  values: minima.map((centre) => grid.map((rho) => (rho - centre) ** 2)),
  failures: 0,
  outsideDomain: 0,
});

const grid = buildGrid(-0.25, 0.18, 121);

describe("resampling off season curves", () => {
  it("finds a weighted argmin far more precisely than the grid step", () => {
    // Two parabolas with weights 3 and 7 minimise at the weighted mean.
    const curves = parabolaCurves(grid, [-0.1, -0.02]);
    const estimate = resampleRhoFromCurves(curves, [3, 7]);
    const step = grid[1]! - grid[0]!;
    expect(estimate).not.toBeNull();
    expect(estimate?.rho).toBeCloseTo((3 * -0.1 + 7 * -0.02) / 10, 9);
    expect(Math.abs((estimate?.rho ?? 0) - -0.044)).toBeLessThan(step / 100);
    expect(estimate?.atEdge).toBe(false);
  });

  it("skips a season of weight zero instead of multiplying it by zero", () => {
    // The unweighted season carries Infinity across the whole grid. In IEEE
    // 754 `0 * Infinity` is NaN, and a NaN loses every comparison in an
    // argmin scan, so multiplying through would move the answer silently
    // rather than stopping anything.
    const curves: SeasonCurves = {
      grid,
      values: [grid.map((rho) => (rho + 0.06) ** 2), grid.map(() => Number.POSITIVE_INFINITY)],
      failures: 0,
      outsideDomain: 0,
    };
    const estimate = resampleRhoFromCurves(curves, [2, 0]);
    expect(estimate?.rho).toBeCloseTo(-0.06, 9);
    expect(Number.isNaN(estimate?.rho ?? Number.NaN)).toBe(false);
  });

  it("does not extrapolate when the minimum sits on the edge of the grid", () => {
    // Monotone decreasing across the whole grid: the argmin is the last
    // point and there is no right neighbour to fit a parabola through.
    const curves: SeasonCurves = {
      grid,
      values: [grid.map((rho) => -rho)],
      failures: 0,
      outsideDomain: 0,
    };
    const estimate = resampleRhoFromCurves(curves, [1]);
    expect(estimate?.rho).toBe(grid[grid.length - 1]);
    expect(estimate?.atEdge).toBe(true);
    expect(estimate?.coarse).toBe(false);
    // Never outside the range the curves were actually evaluated on.
    expect(estimate?.rho).toBeLessThanOrEqual(grid[grid.length - 1]!);
  });

  it("treats a grid point no fit reached as unusable, not as infinity", () => {
    // A null is a failed optimisation. Reading it as +Infinity would assert
    // the model is undefined there and would repeat that assertion in every
    // resample containing the season - the amplification the design has to
    // avoid.
    const values = grid.map((rho) => (rho + 0.05) ** 2) as (number | null)[];
    const minimumIndex = values.indexOf(Math.min(...(values as number[])));
    values[minimumIndex] = null;
    const curves: SeasonCurves = { grid, values: [values], failures: 1, outsideDomain: 0 };
    const estimate = resampleRhoFromCurves(curves, [1]);
    // Coarse, not censored, and the difference decides the study. A hole next
    // to the argmin means no parabola, so the raw grid point stands and is
    // accurate to half a step - measured, just less precisely. An edge means
    // the minimum may lie beyond anything evaluated, which is not measured at
    // all. Calling this one an edge would let a handful of numerical hiccups
    // be counted as failures, and at 2000 replications ten failures return an
    // infinite interval and settle the verdict without the data.
    expect(estimate).not.toBeNull();
    expect(estimate?.coarse).toBe(true);
    expect(estimate?.atEdge).toBe(false);
    expect(Math.abs((estimate?.rho ?? 0) - -0.05)).toBeLessThan(2 * (grid[1]! - grid[0]!));
  });

  it("reports nothing rather than something when no grid point is usable", () => {
    const curves: SeasonCurves = {
      grid,
      values: [grid.map(() => null)],
      failures: grid.length,
      outsideDomain: 0,
    };
    expect(resampleRhoFromCurves(curves, [1])).toBeNull();
  });
});

describe("grid construction", () => {
  it("spans the requested range with evenly spaced points", () => {
    const small = buildGrid(-0.2, 0.1, 4);
    expect(small).toEqual([-0.2, -0.1, 0, 0.1].map((value) => expect.closeTo(value, 12)));
  });

  it("refuses a grid too short to interpolate on, or inverted", () => {
    expect(() => buildGrid(-0.2, 0.1, 2)).toThrow(/at least three/);
    expect(() => buildGrid(0.1, -0.2, 121)).toThrow(/lower < upper/);
  });
});

describe("separable path against the direct one", () => {
  it("agrees with the direct implementation resample by resample", () => {
    // Both production paths, not the fast one against a re-implementation
    // of the slow one in the test. They draw from blockResample with the
    // same base seed, so replicate k sees identical block weights on both
    // sides - paired, not merely similarly distributed.
    //
    // Small synthetic league so this can live in pnpm verify. The same
    // check at full scale, over 200 paired resamples on the pinned window,
    // gave a largest gap of 2.4e-6 and interval ends within 1.1e-6, both
    // under the golden section's own 1e-5 tolerance. That is the bar that
    // matters: a bootstrap distribution belonging to a different estimator
    // would not be an interval around the point estimate at all.
    const fixtures = doubleRoundRobin(4, 8);
    const league = simulateLeague(0x2f, evenlySpreadTruth(4, 8, -0.07), fixtures);
    const window = {
      seasons: ["a", "b", "c", "d"],
      matches: league,
      clubs: [[], [], [], []] as string[][],
    };
    const direct = blockBootstrap(window, 6, 0x600);
    const separable = separableBlockBootstrap(window, 6, 0x600, grid);

    expect(direct.failures).toBe(0);
    expect(separable.failures).toBe(0);
    expect(separable.values).toHaveLength(direct.values.length);
    const worst = Math.max(
      ...separable.values.map((value, index) => Math.abs(value - direct.values[index]!))
    );
    expect(worst).toBeLessThan(1e-4);
  }, 30_000); // 5 s default, which this test crossed under parallel load. // Six full profile fits on the direct path. Named rather than left to the
});

describe("censoring at the edge of the grid", () => {
  it("counts an edge minimum as a failure instead of banking its value", () => {
    // A grid that cannot contain the minimum: the league is generated at
    // rho = -0.07 and the grid starts at 0.10, so every resample's argmin
    // lands on the lower edge. Those are censored observations - the true
    // minimum is at that value or beyond, and beyond is where nobody looked -
    // and they belong exactly in the tails a 99% interval is made of.
    const fixtures = doubleRoundRobin(3, 8);
    const league = simulateLeague(0x3c, evenlySpreadTruth(3, 8, -0.07), fixtures);
    const window = {
      seasons: ["a", "b", "c"],
      matches: league,
      clubs: [[], [], []] as string[][],
    };
    const narrow = buildGrid(0.1, 0.14, 3);
    const run = separableBlockBootstrap(window, 12, 0x700, narrow);

    // Every resample is accounted for exactly once: banked or failed.
    expect(run.values.length + run.failures).toBe(run.requested);
    // The censoring path is exercised - some argmin did pin to an edge.
    expect(run.edgeMinima).toBeGreaterThan(0);
    // And none of those edge values was banked. This is the whole fix: before
    // it, an argmin at the edge went into the distribution as though it were
    // measured, and edge values sit exactly where a 99% interval's tails are.
    for (const value of run.values) {
      expect(value).not.toBe(narrow[0]);
      expect(value).not.toBe(narrow[narrow.length - 1]);
    }

    // With that many censored resamples the conservative interval says it
    // knows nothing, rather than reporting a tight one built from a handful
    // of survivors.
    const interval = conservativePercentileInterval(run, 0.99);
    expect(interval.estimable).toBe(false);
    expect(interval.lower).toBe(Number.NEGATIVE_INFINITY);
    expect(interval.upper).toBe(Number.POSITIVE_INFINITY);
  });
});
