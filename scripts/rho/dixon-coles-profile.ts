/**
 * Profiling layer over the Dixon-Coles fit: the point estimate of rho, the
 * likelihood-ratio statistic against rho = 0, and the profile-likelihood
 * interval.
 *
 * Separate from dixon-coles.ts because that module answers "what is the fit
 * at THIS rho" and this one answers "which rho, and how sure". Keeping them
 * apart is what makes rho one-dimensional from the optimiser's point of view,
 * which is in turn what makes the profile curve free.
 *
 * Nothing here reads a file or prints.
 */
import { createRng, type Rng } from "../../src/logic/rng";
import {
  buildLayout,
  feasibleRhoRange,
  fitAtRho,
  type DcLayout,
  type DcMatch,
} from "./dixon-coles";

/** Chi-square(1) quantiles, the only two levels this study asks for. */
const CHI_SQUARE_1 = { 0.95: 3.841458820694124, 0.99: 6.634896601021214 } as const;

export type ProfileFit = {
  layout: DcLayout;
  rho: number;
  /** Negative log-likelihood at the profiled optimum. */
  minimum: number;
  /** Negative log-likelihood with rho pinned to zero. */
  nullMinimum: number;
  /**
   * The CONSTRAINED maximum-likelihood parameters, fitted with rho pinned to
   * zero. Not the same thing as `params` with rho set to zero afterwards, and
   * the difference is what a parametric bootstrap under H0 has to draw from:
   * on the pinned window the two differ by 0.15 in negative log-likelihood
   * and by up to 0.039 in a single rate.
   */
  nullParams: Float64Array;
  /** 2 * (nullMinimum - minimum). Its null distribution comes from the
   * parametric bootstrap, never from asymptotic chi-square. */
  likelihoodRatio: number;
  params: Float64Array;
  /** Largest gap between the five starts' optima. Above 1e-6 is an error,
   * not a curiosity - see docs/decisions/rho-estimator-method.md. */
  startSpread: number;
  /** Widest rho the fitted rates admit before tau goes non-positive. */
  feasible: { lower: number; upper: number };
  /** Rho values the search visited where no fit exists. Not an error: the
   * feasible range is computed once, at one set of parameters, and the rates
   * move during the fit, so the true boundary is a little tighter than the
   * bracket. Reported so it can never be invisible. */
  searchFailures: number;
};

/**
 * The profiled negative log-likelihood at one rho, or null when no fit was
 * obtained.
 *
 * It returns null rather than infinity, and that distinction is the whole
 * point. An earlier version mapped a failed optimisation to +Infinity, which
 * says "this rho is mathematically inadmissible" - and that claim is simply
 * false here. Feasibility is a property of a PARAMETER POINT, not of rho: for
 * any rho below one, driving every rate towards zero keeps all four low
 * scores positive, so a feasible point always exists. What failed was the
 * optimiser, and dressing that up as a boundary of the model let a numerical
 * problem masquerade as a mathematical fact.
 *
 * Callers decide what a null means where they sit. Inside the bracket it is a
 * failure and propagates; at the far end of an interval search it means the
 * search cannot see past that point, which is what `truncated` records.
 */
const profiledMinimum = (
  layout: DcLayout,
  matches: readonly DcMatch[],
  start: Float64Array,
  rho: number
): { value: number; params: Float64Array } | null => {
  try {
    const fit = fitAtRho(layout, matches, start, rho);
    return { value: fit.negativeLogLikelihood, params: fit.params };
  } catch {
    return null;
  }
};

export type ProfileOptions = {
  /** Random starts for the rho = 0 anchor fit. One means "trust `start`". */
  starts?: number;
  /** Warm start, used verbatim when `starts` is one. */
  start?: Float64Array;
  seed?: number;
  /** Outer bracket for rho. Clipped to what the fitted rates admit. */
  bracket?: { lower: number; upper: number };
};

/** Declared in docs/decisions/rho-estimator-method.md so the whole study's
 * seeds derive from one number. */
const BASE_SEED = 0x1d3c0de;

const randomStart = (rng: Rng, dim: number): Float64Array => {
  const start = new Float64Array(dim);
  for (let k = 0; k < dim; k += 1) start[k] = (rng.next() - 0.5) * 0.6;
  return start;
};

const GOLDEN = (Math.sqrt(5) - 1) / 2;

/**
 * Golden-section minimisation of the profiled negative log-likelihood.
 * Golden section rather than a derivative method because each evaluation is
 * itself an optimisation: a sloppy inner fit makes a numeric derivative of
 * the outer curve noise, while golden section only needs the ordering.
 */
const minimiseProfile = (
  evaluate: (_rho: number) => number,
  lower: number,
  upper: number,
  tolerance: number
): { rho: number; value: number } => {
  let low = lower;
  let high = upper;
  let c = high - GOLDEN * (high - low);
  let d = low + GOLDEN * (high - low);
  let fc = evaluate(c);
  let fd = evaluate(d);
  while (high - low > tolerance) {
    if (fc < fd) {
      high = d;
      d = c;
      fd = fc;
      c = high - GOLDEN * (high - low);
      fc = evaluate(c);
    } else {
      low = c;
      c = d;
      fc = fd;
      d = low + GOLDEN * (high - low);
      fd = evaluate(d);
    }
  }
  return fc < fd ? { rho: c, value: fc } : { rho: d, value: fd };
};

export const fitProfile = (
  matches: readonly DcMatch[],
  options: ProfileOptions = {}
): ProfileFit => {
  const layout = buildLayout(matches);
  const starts = options.starts ?? 5;
  const rng = createRng(options.seed ?? BASE_SEED);

  let best = options.start
    ? fitAtRho(layout, matches, options.start, 0)
    : fitAtRho(layout, matches, new Float64Array(layout.dim), 0);
  let worst = best.negativeLogLikelihood;
  for (let attempt = 1; attempt < starts; attempt += 1) {
    const candidate = fitAtRho(layout, matches, randomStart(rng, layout.dim), 0);
    worst = Math.max(worst, candidate.negativeLogLikelihood);
    if (candidate.negativeLogLikelihood < best.negativeLogLikelihood) best = candidate;
  }
  const startSpread = worst - best.negativeLogLikelihood;
  const nullMinimum = best.negativeLogLikelihood;

  const admissible = feasibleRhoRange(layout, matches, best.params);
  const bracket = options.bracket ?? { lower: -0.2, upper: 0.15 };
  // A hair inside the admissible range: on the boundary tau is exactly zero
  // and the likelihood is not defined there.
  const lower = Math.max(bracket.lower, admissible.lower * 0.98);
  const upper = Math.min(bracket.upper, admissible.upper * 0.98);
  if (!(lower < upper)) throw new Error("the fitted rates admit no rho bracket to search");

  let guess: Float64Array = Float64Array.from(best.params);
  let searchFailures = 0;
  const evaluate = (rho: number): number => {
    const step = profiledMinimum(layout, matches, guess, rho);
    if (!step) {
      // Inside the bracket a failure is a failure. Swallowing it as infinity
      // would push the golden section away from a rho it simply could not
      // evaluate, and silently move the estimate.
      searchFailures += 1;
      throw new Error(`no fit at rho=${rho} while profiling`);
    }
    guess = step.params;
    return step.value;
  };
  const optimum = minimiseProfile(evaluate, lower, upper, 1e-5);
  const atOptimum = fitAtRho(layout, matches, guess, optimum.rho);

  return {
    layout,
    rho: optimum.rho,
    minimum: atOptimum.negativeLogLikelihood,
    nullMinimum,
    nullParams: best.params,
    likelihoodRatio: 2 * (nullMinimum - atOptimum.negativeLogLikelihood),
    params: atOptimum.params,
    startSpread,
    feasible: admissible,
    searchFailures,
  };
};

/**
 * Profile-likelihood interval: every rho whose profiled deviance sits within
 * the chi-square(1) quantile of the optimum. Solved by bisection on each
 * side, because the profile curve is smooth but its derivative is not cheap.
 *
 * Reported alongside a block bootstrap, never instead of it - the plan makes
 * the conservative envelope of the two decide verdict A against B.
 */
export const profileInterval = (
  matches: readonly DcMatch[],
  fit: ProfileFit,
  level: 0.95 | 0.99 = 0.99
): { lower: number; upper: number; truncated: boolean; failures: number } => {
  const threshold = fit.minimum + CHI_SQUARE_1[level] / 2;
  const bound = (direction: -1 | 1): { value: number; truncated: boolean; failures: number } => {
    const limit = direction < 0 ? fit.feasible.lower * 0.98 : fit.feasible.upper * 0.98;
    let inside = fit.rho;
    let outside = limit;
    let failures = 0;
    // Chained warm start. Probing every rho from the optimum at rho-hat means
    // the start gets worse the further out the search walks, so failures are
    // likeliest exactly at the ends of the interval - the two numbers this
    // function exists to produce. Each success hands its parameters to the
    // next probe instead.
    let guess: Float64Array = fit.params;
    const value = (rho: number): number | null => {
      const step = profiledMinimum(fit.layout, matches, guess, rho);
      if (!step) {
        failures += 1;
        return null;
      }
      guess = step.params;
      return step.value;
    };

    // Two different unknowns, and collapsing them was the bug this replaced.
    // A rho whose fit fails tells us nothing about its deviance, so treating
    // it as "inside" and returning it as the bound reported an interval
    // reaching all the way out to a rho the search could not even evaluate.
    // Instead: walk inward until a fit exists, and only then decide.
    let outerUsable = outside;
    let outerValue = value(outerUsable);
    for (let retreat = 0; outerValue === null && retreat < 20; retreat += 1) {
      outerUsable = fit.rho + 0.7 * (outerUsable - fit.rho);
      outerValue = value(outerUsable);
    }
    // Nothing between the estimate and the limit could be fitted at all.
    if (outerValue === null) return { value: fit.rho, truncated: true, failures };
    // The deviance never rises past the threshold within reach, so the
    // interval runs at least this far and the search cannot see further.
    if (outerValue < threshold) return { value: outerUsable, truncated: true, failures };

    outside = outerUsable;
    for (let step = 0; step < 60 && Math.abs(outside - inside) > 1e-6; step += 1) {
      const middle = 0.5 * (inside + outside);
      const deviance = value(middle);
      // A failure strictly between two fittable points is a numerical one,
      // not a boundary; retreating inward keeps the bound conservative.
      if (deviance === null || deviance < threshold) inside = middle;
      else outside = middle;
    }
    return { value: 0.5 * (inside + outside), truncated: false, failures };
  };
  const low = bound(-1);
  const high = bound(1);
  return {
    lower: low.value,
    upper: high.value,
    truncated: low.truncated || high.truncated,
    // Counted, because an uncounted failure here moves an interval end with
    // nothing in the report to say so. fitProfile already counts its own.
    failures: low.failures + high.failures,
  };
};

/** Deviance of a fixed rho against the profiled optimum. The power run uses
 * it to ask whether the true rho falls inside the interval without paying
 * for a second profile. */
export const devianceAt = (matches: readonly DcMatch[], fit: ProfileFit, rho: number): number =>
  2 * (fitAtRho(fit.layout, matches, fit.params, rho).negativeLogLikelihood - fit.minimum);
