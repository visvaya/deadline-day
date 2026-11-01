/**
 * Dixon-Coles estimator for the rho study (method:
 * docs/decisions/rho-estimator-method.md).
 *
 * Answers one question: does the dependence between the two sides' goals
 * survive once each club's own attack and defence are controlled for? The
 * aggregate draw excess cannot answer it, because a mixture of heterogeneous
 * Poissons produces a draw excess with no dependence at all.
 *
 * Method, convergence floor and budget are settled in
 * docs/decisions/rho-estimator-method.md - read that before changing any
 * constant here. In particular the strong-Wolfe line search is not a
 * refinement: Armijo alone stalls this problem's convergence tail.
 *
 * This module never reads the pinned CSV and never prints. It takes matches
 * and returns numbers, so the same code fits real data, bootstrap replicates
 * and synthetic power datasets.
 */

import { at } from "../../src/logic/invariant";

/** One fixture, with clubs already mapped to per-season indices. */
export type DcMatch = {
  season: number;
  home: number;
  away: number;
  homeGoals: number;
  awayGoals: number;
};

/**
 * Where each parameter lives in the flat vector: per season an attack block
 * and a defence block, then one home effect per season. Rho is not in here -
 * it is profiled from outside, which is what makes the confidence interval a
 * by-product of the fit rather than a second pass.
 */
export type DcLayout = {
  seasons: number;
  clubsPerSeason: readonly number[];
  atkOffset: readonly number[];
  defOffset: readonly number[];
  homeOffset: number;
  dim: number;
};

export const buildLayout = (matches: readonly DcMatch[]): DcLayout => {
  if (matches.length === 0) throw new Error("cannot build a layout from zero matches");
  const seasons = Math.max(...matches.map((m) => m.season)) + 1;
  const clubsPerSeason = new Array<number>(seasons).fill(0);
  for (const m of matches) {
    if (m.season < 0 || !Number.isInteger(m.season)) {
      throw new Error(`season index must be a non-negative integer, got ${m.season}`);
    }
    clubsPerSeason[m.season] = Math.max(clubsPerSeason[m.season]!, m.home + 1, m.away + 1);
  }
  const atkOffset: number[] = [];
  const defOffset: number[] = [];
  let cursor = 0;
  for (const [s, clubs] of clubsPerSeason.entries()) {
    if (clubs < 2) throw new Error(`season ${s} holds fewer than two clubs`);
    atkOffset.push(cursor);
    cursor += clubs;
    defOffset.push(cursor);
    cursor += clubs;
  }
  return {
    seasons,
    clubsPerSeason,
    atkOffset,
    defOffset,
    homeOffset: cursor,
    dim: cursor + seasons,
  };
};

/**
 * The low-score correction factor. Written out rather than table-driven so
 * that the four cases and their derivatives sit next to each other and a
 * mismatch between them is visible on one screen.
 */
export const tau = (
  homeGoals: number,
  awayGoals: number,
  lambda: number,
  mu: number,
  rho: number
): number => {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambda * mu * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambda * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + mu * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
};

/**
 * The four low-score constraints of one match, written as the inequalities
 * they are: 1 - lambda*mu*rho, 1 + lambda*rho, 1 + mu*rho and 1 - rho all
 * strictly positive. Strictly, because tau exactly zero is a probability of
 * zero for a scoreline the model says can happen, and its logarithm is not
 * finite either.
 */
const lowScoresStayPositive = (lambda: number, mu: number, rho: number): boolean =>
  1 - lambda * mu * rho > 0 && 1 + lambda * rho > 0 && 1 + mu * rho > 0 && 1 - rho > 0;

/**
 * Widest rho the data admit: every one of the four low scores must keep a
 * positive probability in EVERY match, not just in the one that happened.
 * Anything outside makes the likelihood stop being a distribution.
 */
export const feasibleRhoRange = (
  layout: DcLayout,
  matches: readonly DcMatch[],
  params: Float64Array
): { lower: number; upper: number } => {
  const centred = centre(layout, params);
  let lower = Number.NEGATIVE_INFINITY;
  let upper = 1;
  for (const m of matches) {
    const { lambda, mu } = rates(layout, centred, m);
    lower = Math.max(lower, -1 / lambda, -1 / mu);
    upper = Math.min(upper, 1 / (lambda * mu));
  }
  return { lower, upper };
};

const centre = (layout: DcLayout, raw: Float64Array): Float64Array => {
  const out = Float64Array.from(raw);
  for (let s = 0; s < layout.seasons; s += 1) {
    const off = layout.atkOffset[s]!;
    const n = layout.clubsPerSeason[s]!;
    let sum = 0;
    for (let k = 0; k < n; k += 1) sum += raw[off + k]!;
    const shift = sum / n;
    for (let k = 0; k < n; k += 1) out[off + k] = raw[off + k]! - shift;
  }
  return out;
};

const rates = (
  layout: DcLayout,
  centred: Float64Array,
  m: DcMatch
): { lambda: number; mu: number } => {
  const atk = layout.atkOffset[m.season]!;
  const def = layout.defOffset[m.season]!;
  return {
    lambda: Math.exp(
      centred[atk + m.home]! + centred[def + m.away]! + centred[layout.homeOffset + m.season]!
    ),
    mu: Math.exp(centred[atk + m.away]! + centred[def + m.home]!),
  };
};

/** Attack and defence for one club-season, on the identified (centred) scale. */
export const clubStrengths = (
  layout: DcLayout,
  params: Float64Array,
  season: number,
  club: number
): { attack: number; defence: number } => {
  const centred = centre(layout, params);
  return {
    attack: centred[layout.atkOffset[season]! + club]!,
    defence: centred[layout.defOffset[season]! + club]!,
  };
};

/** Home effect of one season, in log goals. */
export const homeEffect = (layout: DcLayout, params: Float64Array, season: number): number =>
  params[layout.homeOffset + season]!;

/**
 * Negative log-likelihood up to the constant log(x! y!), with the analytic
 * gradient when `grad` is supplied. Returns +Infinity where tau is not
 * positive, which the line search reads as a step that went too far.
 *
 * The sum-to-zero constraint per season is enforced by centring INSIDE this
 * function, so the caller optimises a free vector and the null direction
 * carries no gradient. A single global constraint would leave one direction
 * of freedom per season and the optimum would stop being reproducible.
 *
 * Positivity is checked for ALL FOUR low scores of every match, not only for
 * the one that happened - chapter 3 of the plan requires exactly that, and
 * for a reason: a point where tau(0,0) is negative assigns a negative
 * probability to a scoreline that merely did not occur, and the likelihood
 * stops being a distribution. Checking the observed cell alone accepted such
 * points silently, which is how lambda = mu = 3 with rho = 0.2 and an
 * observed 2:2 came back finite instead of infinite.
 *
 * feasibleRhoRange is not a substitute: it is evaluated once, at one set of
 * parameters, while lambda and mu move throughout the fit.
 */
export const negativeLogLikelihood = (
  layout: DcLayout,
  matches: readonly DcMatch[],
  raw: Float64Array,
  rho: number,
  grad: Float64Array | null = null
): number => {
  const centred = centre(layout, raw);
  if (grad) grad.fill(0);
  let total = 0;
  for (const m of matches) {
    const { lambda, mu } = rates(layout, centred, m);
    if (rho !== 0 && !lowScoresStayPositive(lambda, mu, rho)) {
      return Number.POSITIVE_INFINITY;
    }
    const factor = tau(m.homeGoals, m.awayGoals, lambda, mu, rho);
    if (!(factor > 0)) return Number.POSITIVE_INFINITY;
    total +=
      lambda + mu - m.homeGoals * Math.log(lambda) - m.awayGoals * Math.log(mu) - Math.log(factor);
    if (!grad) continue;
    let dTauLambda = 0;
    let dTauMu = 0;
    if (m.homeGoals === 0 && m.awayGoals === 0) {
      dTauLambda = -mu * rho;
      dTauMu = -lambda * rho;
    } else if (m.homeGoals === 0 && m.awayGoals === 1) {
      dTauLambda = rho;
    } else if (m.homeGoals === 1 && m.awayGoals === 0) {
      dTauMu = rho;
    }
    const dLambda = (1 - m.homeGoals / lambda - dTauLambda / factor) * lambda;
    const dMu = (1 - m.awayGoals / mu - dTauMu / factor) * mu;
    const atk = layout.atkOffset[m.season]!;
    const def = layout.defOffset[m.season]!;
    grad[atk + m.home]! += dLambda;
    grad[def + m.away]! += dLambda;
    grad[layout.homeOffset + m.season]! += dLambda;
    grad[atk + m.away]! += dMu;
    grad[def + m.home]! += dMu;
  }
  if (grad) {
    // Chain through the centring map: d/draw_k = d/dcentred_k - season mean.
    for (let s = 0; s < layout.seasons; s += 1) {
      const off = layout.atkOffset[s]!;
      const n = layout.clubsPerSeason[s]!;
      let sum = 0;
      for (let k = 0; k < n; k += 1) sum += grad[off + k]!;
      const shift = sum / n;
      for (let k = 0; k < n; k += 1) grad[off + k]! -= shift;
    }
  }
  return total;
};

/**
 * Convergence floor, measured on the pinned window in
 * docs/decisions/rho-estimator-method.md: 1e-6 is unreachable there, 1e-5 is
 * reached in 48 iterations.
 *
 * Scaled by match count rather than fixed, because every gradient component
 * is a sum over matches and so is its rounding error. A hard 1e-5 made the
 * estimator throw on a four-times-larger league while the answer was fine -
 * an absolute threshold measured on one dataset size is not a threshold.
 */
const REFERENCE_MATCHES = 2944;
const gradientTolerance = (matchCount: number): number =>
  1e-5 * Math.max(1, matchCount / REFERENCE_MATCHES);

/** A failed line search is not the same as a bad answer - two of five random
 * starts reported one after already agreeing to 2e-11. Anything this flat is
 * accepted; anything worse throws. */
const acceptableGradient = (matchCount: number): number => 10 * gradientTolerance(matchCount);

export type DcFit = {
  params: Float64Array;
  negativeLogLikelihood: number;
  iterations: number;
  gradientNorm: number;
};

const gradientNorm = (grad: Float64Array): number => {
  let worst = 0;
  for (const component of grad) worst = Math.max(worst, Math.abs(component));
  return worst;
};

/**
 * L-BFGS with a strong-Wolfe line search (c1 = 1e-4, c2 = 0.9). The curvature
 * condition is load-bearing: with Armijo alone the (s, y) pairs degrade and
 * the tail of the convergence stalls at a gradient norm around 1e-3.
 */
export const fitAtRho = (
  layout: DcLayout,
  matches: readonly DcMatch[],
  start: Float64Array,
  rho: number,
  maxIterations = 3000
): DcFit => {
  const n = layout.dim;
  const x = Float64Array.from(start);
  const g = new Float64Array(n);
  let f = negativeLogLikelihood(layout, matches, x, rho, g);
  if (!Number.isFinite(f)) throw new Error(`start point is infeasible at rho=${rho}`);
  const tolerance = gradientTolerance(matches.length);
  const acceptable = acceptableGradient(matches.length);
  const memory = 10;
  const sHistory: Float64Array[] = [];
  const yHistory: Float64Array[] = [];
  const inverseCurvature: number[] = [];
  const direction = new Float64Array(n);
  const alpha = new Float64Array(memory);
  const trial = new Float64Array(n);
  const gTrial = new Float64Array(n);

  const probeStep = (step: number): { value: number; slope: number } => {
    for (let k = 0; k < n; k += 1) trial[k] = x[k]! + step * direction[k]!;
    const value = negativeLogLikelihood(layout, matches, trial, rho, gTrial);
    if (!Number.isFinite(value)) return { value: Number.POSITIVE_INFINITY, slope: Number.NaN };
    let slope = 0;
    for (let k = 0; k < n; k += 1) slope += gTrial[k]! * direction[k]!;
    return { value, slope };
  };

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const norm = gradientNorm(g);
    if (norm < tolerance) {
      return { params: x, negativeLogLikelihood: f, iterations: iteration, gradientNorm: norm };
    }

    direction.set(g);
    for (let h = sHistory.length - 1; h >= 0; h -= 1) {
      const sH = at(sHistory, h, "L-BFGS s history");
      const yH = at(yHistory, h, "L-BFGS y history");
      let dot = 0;
      for (let k = 0; k < n; k += 1) dot += sH[k]! * direction[k]!;
      const alphaH = inverseCurvature[h]! * dot;
      alpha[h] = alphaH;
      for (let k = 0; k < n; k += 1) {
        direction[k] = direction[k]! - alphaH * yH[k]!;
      }
    }
    if (sHistory.length > 0) {
      const last = sHistory.length - 1;
      const sLast = at(sHistory, last, "L-BFGS s history");
      const yLast = at(yHistory, last, "L-BFGS y history");
      let sy = 0;
      let yy = 0;
      for (let k = 0; k < n; k += 1) {
        sy += sLast[k]! * yLast[k]!;
        yy += yLast[k]! * yLast[k]!;
      }
      const scale = sy / yy;
      for (let k = 0; k < n; k += 1) direction[k] = direction[k]! * scale;
    }
    for (const [h, sH] of sHistory.entries()) {
      const yH = at(yHistory, h, "L-BFGS y history");
      let dot = 0;
      for (let k = 0; k < n; k += 1) dot += yH[k]! * direction[k]!;
      const beta = inverseCurvature[h]! * dot;
      const weight = alpha[h]! - beta;
      for (let k = 0; k < n; k += 1) {
        direction[k] = direction[k]! + weight * sH[k]!;
      }
    }
    for (let k = 0; k < n; k += 1) direction[k] = -direction[k]!;

    let slope0 = 0;
    for (let k = 0; k < n; k += 1) slope0 += g[k]! * direction[k]!;
    if (!(slope0 < 0)) {
      sHistory.length = 0;
      yHistory.length = 0;
      inverseCurvature.length = 0;
      slope0 = 0;
      for (let k = 0; k < n; k += 1) {
        const gk = g[k]!;
        direction[k] = -gk;
        slope0 -= gk * gk;
      }
    }

    const step = wolfeStep(probeStep, f, slope0, sHistory.length === 0);
    if (step === null) {
      // A curvature history built near the optimum can point somewhere the
      // line search cannot follow. Drop it and retry from steepest descent
      // once; only a failure with no history left is a real failure.
      if (sHistory.length > 0) {
        sHistory.length = 0;
        yHistory.length = 0;
        inverseCurvature.length = 0;
        continue;
      }
      if (norm < acceptable) {
        return { params: x, negativeLogLikelihood: f, iterations: iteration, gradientNorm: norm };
      }
      throw new Error(
        `line search failed at rho=${rho} with gradient norm ${norm.toExponential(2)}`
      );
    }

    const s = new Float64Array(n);
    const y = new Float64Array(n);
    let sy = 0;
    for (let k = 0; k < n; k += 1) {
      const sk = trial[k]! - x[k]!;
      const yk = gTrial[k]! - g[k]!;
      s[k] = sk;
      y[k] = yk;
      sy += sk * yk;
    }
    x.set(trial);
    g.set(gTrial);
    f = step.value;
    if (sy > 1e-14) {
      sHistory.push(s);
      yHistory.push(y);
      inverseCurvature.push(1 / sy);
      if (sHistory.length > memory) {
        sHistory.shift();
        yHistory.shift();
        inverseCurvature.shift();
      }
    }
  }
  const finalNorm = gradientNorm(g);
  if (finalNorm < acceptable) {
    return {
      params: x,
      negativeLogLikelihood: f,
      iterations: maxIterations,
      gradientNorm: finalNorm,
    };
  }
  throw new Error(`no convergence at rho=${rho} after ${maxIterations} iterations`);
};

type LineProbe = (_step: number) => { value: number; slope: number };

/**
 * Bracket-and-zoom strong-Wolfe search. Returns null when no acceptable step
 * exists, which the caller turns into either an accepted flat point or an
 * error - never into a silent continuation.
 */
const wolfeStep = (
  probe: LineProbe,
  f0: number,
  slope0: number,
  coldStart: boolean
): { value: number } | null => {
  const c1 = 1e-4;
  const c2 = 0.9;
  let previousStep = 0;
  let previousValue = f0;
  let step = coldStart ? Math.min(1, 1 / Math.sqrt(-slope0)) : 1;
  let low = 0;
  let high = 0;
  let lowValue = f0;
  let bracketed = false;
  let accepted: number | null = null;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const point = probe(step);
    const failsDescent = !Number.isFinite(point.value) || point.value > f0 + c1 * step * slope0;
    if (failsDescent || (attempt > 0 && point.value >= previousValue)) {
      low = previousStep;
      high = step;
      lowValue = previousValue;
      bracketed = true;
      break;
    }
    if (Math.abs(point.slope) <= -c2 * slope0) {
      accepted = step;
      break;
    }
    if (point.slope >= 0) {
      low = step;
      high = previousStep;
      lowValue = point.value;
      bracketed = true;
      break;
    }
    previousStep = step;
    previousValue = point.value;
    step *= 2;
  }

  if (accepted === null && bracketed) {
    for (let zoom = 0; zoom < 50; zoom += 1) {
      const middle = 0.5 * (low + high);
      const point = probe(middle);
      if (
        !Number.isFinite(point.value) ||
        point.value > f0 + c1 * middle * slope0 ||
        point.value >= lowValue
      ) {
        high = middle;
      } else if (Math.abs(point.slope) <= -c2 * slope0) {
        accepted = middle;
        break;
      } else {
        if (point.slope * (high - low) >= 0) high = low;
        low = middle;
        lowValue = point.value;
      }
      if (Math.abs(high - low) < 1e-17) {
        accepted = low > 0 ? low : null;
        break;
      }
    }
    if (accepted === null && low > 0) accepted = low;
  }
  if (accepted === null || accepted <= 0) return null;
  const settled = probe(accepted);
  return Number.isFinite(settled.value) ? { value: settled.value } : null;
};
