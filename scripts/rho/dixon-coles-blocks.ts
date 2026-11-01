/**
 * Separable block bootstrap.
 *
 * The season blocks of a resample share no parameter except rho - attack,
 * defence and the home effect are all per season, and blockResample gives a
 * season drawn twice two independent blocks. So the profiled likelihood
 * separates:
 *
 *   min_theta sum_s sum_{j=1..w_s} L_s(theta_{s,j}, rho)
 *     = sum_s w_s * min_theta_s L_s(theta_s, rho)
 *
 * which means one curve per season, computed once, answers every resample:
 * each is a weighted sum of the same ten curves. That turns 2000 full fits
 * into ten curves plus arithmetic.
 *
 * The identity is exact, not approximate - it is pinned by a test in
 * tests/scripts/rho-audit-core.test.ts, on two DIFFERENT seasons, because a
 * duplicated season would satisfy it even if the blocks wrongly shared
 * parameters.
 *
 * What is NOT exact is reading the argmin off a grid instead of running the
 * golden section, and that difference is measured rather than assumed: the
 * bootstrap distribution has to be the distribution of the SAME estimator the
 * point estimate came from, or the interval is not built around that number.
 */
import {
  buildLayout,
  feasibleRhoRange,
  fitAtRho,
  type DcLayout,
  type DcMatch,
} from "./dixon-coles";
import { createRng } from "../../src/logic/rng";
import { blockResample, type BootstrapRun, type RhoWindow } from "./audit-core";
import type { ProgressSink } from "./progress";
import { at } from "../../src/logic/invariant";

/** Where a season's profiled likelihood was evaluated, and what came back.
 * A null is a grid point whose fit failed after retries - never silently an
 * infinity, which would assert the model is undefined there and would then be
 * repeated in every resample containing that season. */
export type SeasonCurves = {
  grid: readonly number[];
  /** [season][gridIndex]; null where no fit was obtained. */
  values: readonly (readonly (number | null)[])[];
  /** Grid points where the optimiser failed although the rho was admissible.
   * A numerical problem, and the only one of the two worth alarming about. */
  failures: number;
  /**
   * Grid points a season's own rates do not admit at all.
   *
   * Measured on the pinned window: three, all in 2023/24, whose feasible
   * range stops at -0.2368 while the shared grid reaches -0.25. Calling
   * those optimiser failures - as an earlier version did - mislabels the
   * model's own boundary as a numerical accident, which is the conflation
   * this study has had to unpick twice already.
   */
  outsideDomain: number;
};

/**
 * The grid every block bootstrap in this study uses.
 *
 * Wider than the profile's own bracket of [-0.2, 0.15], because a resample
 * built from ten copies of the two most extreme seasons can minimise outside
 * the range the observed data does. 121 points was enough for parabolic
 * refinement to match the golden section to 2.4e-6; doubling it changed
 * nothing but the cost.
 */
export const buildGrid = (lower: number, upper: number, points: number): number[] => {
  if (points < 3) throw new Error("a grid needs at least three points to interpolate on");
  if (!(lower < upper)) throw new Error(`grid needs lower < upper, got ${lower} and ${upper}`);
  const grid: number[] = [];
  for (let k = 0; k < points; k += 1) grid.push(lower + ((upper - lower) * k) / (points - 1));
  return grid;
};

/** Fixed so the curves are reproducible from one number, like everything
 * else in this study. */
const CURVE_SEED = 0x1d3c0de + 3_000_000;

const seasonSlices = (window: RhoWindow): DcMatch[][] => {
  const slices: DcMatch[][] = Array.from({ length: window.seasons.length }, () => []);
  for (const match of window.matches) {
    at(slices, match.season, "season slice").push({ ...match, season: 0 });
  }
  return slices;
};

/**
 * One profiled curve per season, over the shared grid.
 *
 * Built OUTWARD FROM RHO NEAR ZERO, not left to right. The old order attacked
 * the most extreme rho first, from a cold start, and unsurprisingly that is
 * where every failure landed: three grid points on the pinned window, all at
 * the far left. Starting where fitAtRho is best conditioned and chaining
 * outwards in both directions puts the hardest points last and gives them the
 * best available start.
 *
 * Retries use fresh random starts, because that is the policy
 * docs/decisions/rho-estimator-method.md states and the block bootstrap now
 * runs through here rather than through fitWithRetries. A deterministic
 * shrink of the same failing start is neither fresh nor random.
 */
const buildSeasonCurves = (window: RhoWindow, grid: readonly number[]): SeasonCurves => {
  const slices = seasonSlices(window);
  let failures = 0;
  let outsideDomain = 0;
  const centre = grid.reduce(
    (best, rho, index) => (Math.abs(rho) < Math.abs(at(grid, best, "grid centre")) ? index : best),
    0
  );
  const values = slices.map((matches, season) => {
    const layout: DcLayout = buildLayout(matches);
    const rng = createRng(CURVE_SEED + season * 7919);
    const curve = new Array<number | null>(grid.length).fill(null);

    const evaluate = (index: number, warm: Float64Array): Float64Array | null => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const start =
          attempt === 0
            ? warm
            : Float64Array.from({ length: layout.dim }, () => (rng.next() - 0.5) * 0.6);
        try {
          const fit = fitAtRho(layout, matches, start, at(grid, index, "grid rho"));
          curve[index] = fit.negativeLogLikelihood;
          return fit.params;
        } catch {
          // Next attempt starts somewhere else entirely.
        }
      }
      failures += 1;
      return null;
    };

    let warm: Float64Array = new Float64Array(layout.dim);
    const fromCentre = evaluate(centre, warm);
    if (fromCentre) warm = fromCentre;
    // The season's own admissible range, read off its rho = 0 optimum. A grid
    // point outside it is not a fit waiting to be found; the shared grid is
    // simply wider than this season allows.
    const admissible = feasibleRhoRange(layout, matches, fromCentre ?? warm);
    let rightward = warm;
    for (let index = centre + 1; index < grid.length; index += 1) {
      if (at(grid, index, "grid rho") >= admissible.upper) {
        outsideDomain += 1;
        continue;
      }
      rightward = evaluate(index, rightward) ?? rightward;
    }
    let leftward = warm;
    for (let index = centre - 1; index >= 0; index -= 1) {
      if (at(grid, index, "grid rho") <= admissible.lower) {
        outsideDomain += 1;
        continue;
      }
      leftward = evaluate(index, leftward) ?? leftward;
    }
    return curve;
  });
  return { grid, values, failures, outsideDomain };
};

export type ResampleEstimate = {
  rho: number;
  /**
   * The argmin sat on the first or last grid point: the true minimum is there
   * OR BEYOND, and beyond is outside the range anyone evaluated. A censored
   * observation, not a measured one.
   */
  atEdge: boolean;
  /**
   * The argmin was usable but a neighbour was not, so no parabola could be
   * fitted and the raw grid point stands. Accurate to half a grid step rather
   * than to 1e-6 - coarse, but measured. Emphatically NOT the same thing as
   * atEdge, and conflating them let a handful of numerical hiccups void the
   * whole interval: at 2000 replications and 99% the tail is 9.995 wide, so
   * ten of anything counted as a failure returns two infinite ends, an
   * infinite envelope, and verdict B decided without the data.
   */
  coarse: boolean;
};

/**
 * Argmin of a resample's profiled curve, refined by parabolic interpolation.
 *
 * Zero-weight seasons are SKIPPED rather than multiplied by zero. In IEEE 754
 * `0 * Infinity` is NaN, and a NaN loses every comparison in an argmin scan,
 * so a season that was not drawn at all could have moved the answer without
 * stopping anything.
 */
export const resampleRhoFromCurves = (
  curves: SeasonCurves,
  weights: readonly number[]
): ResampleEstimate | null => {
  const totals: (number | null)[] = curves.grid.map((_, index) => {
    let sum = 0;
    for (const [season, weight] of weights.entries()) {
      if (weight === 0) continue;
      const value = at(at(curves.values, season, "season curve"), index, "curve value");
      if (value === null) return null;
      sum += weight * value;
    }
    return sum;
  });

  let best = -1;
  let middle = 0;
  for (const [index, value] of totals.entries()) {
    if (value === null) continue;
    if (best < 0 || value < middle) {
      best = index;
      middle = value;
    }
  }
  if (best < 0) return null;

  const bestRho = at(curves.grid, best, "grid rho");
  if (best === 0 || best === totals.length - 1) {
    return { rho: bestRho, atEdge: true, coarse: false };
  }
  const left = at(totals, best - 1, "left total");
  const right = at(totals, best + 1, "right total");
  if (left === null || right === null) {
    return { rho: bestRho, atEdge: false, coarse: true };
  }
  const curvature = left - 2 * middle + right;
  if (!(curvature > 0)) return { rho: bestRho, atEdge: false, coarse: true };
  const step = at(curves.grid, 1, "grid step") - at(curves.grid, 0, "grid step");
  const shift = (0.5 * (left - right)) / curvature;
  return { rho: bestRho + shift * step, atEdge: false, coarse: false };
};

/**
 * The block bootstrap, run off the season curves.
 *
 * Draws the same resamples as the direct implementation - both call
 * blockResample with the same seeds - so the two can be compared pair by pair
 * on identical block weights rather than merely on similar distributions.
 */
export const separableBlockBootstrap = (
  window: RhoWindow,
  replications: number,
  baseSeed: number,
  grid: readonly number[],
  onProgress?: ProgressSink
): BootstrapRun & {
  curveFailures: number;
  curvesOutsideDomain: number;
  edgeMinima: number;
  coarseMinima: number;
} => {
  const curves = buildSeasonCurves(window, grid);
  const values: number[] = [];
  let failures = 0;
  let edgeMinima = 0;
  let coarseMinima = 0;
  for (let replicate = 0; replicate < replications; replicate += 1) {
    const { weights } = blockResample(window, baseSeed + replicate);
    const estimate = resampleRhoFromCurves(curves, weights);
    if (!estimate) {
      failures += 1;
      onProgress?.(replicate + 1, replications);
      continue;
    }
    onProgress?.(replicate + 1, replications);
    if (estimate.coarse) coarseMinima += 1;
    if (estimate.atEdge) {
      // Censored, not measured. An argmin sitting on the edge of the grid or
      // against a point no fit reached means the true minimum is at that
      // value OR beyond it, and beyond is the direction nobody looked. Such
      // resamples land precisely in the tails a 99% interval is made of, so
      // admitting them as ordinary values would let unseen extremes narrow
      // the interval that decides verdict A against B. Counted as failures
      // instead, which widens the conservative interval by exactly the
      // amount of information that is missing.
      edgeMinima += 1;
      failures += 1;
      continue;
    }
    values.push(estimate.rho);
  }
  return {
    values,
    failures,
    requested: replications,
    curveFailures: curves.failures,
    curvesOutsideDomain: curves.outsideDomain,
    edgeMinima,
    coarseMinima,
  };
};

/**
 * The grid every block bootstrap in this study uses. Wider than the profile's
 * own bracket of [-0.2, 0.15], because a resample built from ten copies of
 * the two most extreme seasons can minimise outside the range the observed
 * data reaches, and reading an argmin off the edge of a grid is the failure
 * this design must not make quietly.
 */
export const BLOCK_GRID: readonly number[] = buildGrid(-0.25, 0.18, 121);
