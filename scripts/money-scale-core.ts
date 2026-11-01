import {
  STARTING_BENCH_OVR_BONUS,
  STARTING_XI_OVR_BONUS,
  WAGE_PIVOT_OVR,
} from "../src/data/balance";
import type { PositionCode } from "../src/data/types";
import { expectedPlace, expectedSeasonPoints } from "../src/logic/expected-points";
import type { MatchRating } from "../src/logic/match";
import {
  ovrMasses,
  slotShape,
  squadShape,
  SQUAD_MODEL_IDS,
  type BonusBand,
  type SquadModelId,
} from "../src/logic/squad-cost";
import { at } from "../src/logic/invariant";

export { ovrMasses, slotShape, squadShape, SQUAD_MODEL_IDS };
export type { BonusBand, SquadModelId };

/**
 * The money-scale study of the spec's chapters 3 to 5, computed outside the
 * game and never read by it.
 *
 * Everything here is analytic. The squad the game draws is random, but the
 * quantity the wage fit needs is an expectation over that draw, and an
 * expectation of a bounded piecewise-uniform variable has a closed form. A
 * sampled version would have made every reported figure depend on a seed and
 * would have hidden a systematic error inside its own Monte Carlo noise.
 */

/**
 * Alias of `WAGE_PIVOT_OVR`. Pinned by the spec's chapter 4 and deliberately
 * not fitted: with a free base the pair (base, pivot) is unidentifiable,
 * because only the product `base * exp(-pivot / slope)` enters the curve.
 *
 * Kept as a separate exported name for the existing CLI and tests; the pivot
 * itself has exactly one definition, in `src/data/balance.ts`.
 */
export const WAGE_PIVOT = WAGE_PIVOT_OVR;

export type WageParams = {
  /** Annual wage, in the game's millions of euro, of an ovr-70 player. */
  readonly wageAtPivot: number;
  readonly wageSlope: number;
};

const assertFiniteOvr = (ovr: number): void => {
  if (!Number.isFinite(ovr)) throw new Error(`ovr must be finite, got ${ovr}`);
};

export const assertWageParams = (params: WageParams): void => {
  if (!Number.isFinite(params.wageAtPivot) || params.wageAtPivot <= 0) {
    throw new Error(`wageAtPivot must be finite and positive, got ${params.wageAtPivot}`);
  }
  if (!Number.isFinite(params.wageSlope) || params.wageSlope <= 0) {
    throw new Error(`wageSlope must be finite and positive, got ${params.wageSlope}`);
  }
};

export const baseWage = (ovr: number, params: WageParams): number => {
  assertFiniteOvr(ovr);
  assertWageParams(params);
  return params.wageAtPivot * Math.exp((ovr - WAGE_PIVOT) / params.wageSlope);
};

/**
 * Compatibility aliases for the bands `createStartingSquadPlayer` draws its
 * bonus from. Moved to `src/data/balance.ts` (as `STARTING_XI_OVR_BONUS` and
 * `STARTING_BENCH_OVR_BONUS`) on 2026-09-14 so the generator and this fit
 * read one source; these two names stay importable under their old spelling
 * for the existing CLI and tests.
 */
export const XI_BONUS: BonusBand = STARTING_XI_OVR_BONUS;
export const BENCH_BONUS: BonusBand = STARTING_BENCH_OVR_BONUS;

/**
 * One run's memo of squad shapes.
 *
 * The slope scan evaluates the same club at the same slope once per consumer,
 * and each evaluation walks seven formations and up to twenty-two slots. The
 * cache is per run rather than module-level on purpose: a module-level map
 * would leak between tests and make one test's timing depend on another's.
 */
export const createShapeCache = () => {
  const values = new Map<string, number>();
  let hits = 0;
  let misses = 0;
  return {
    shape: (clubId: string, rating: MatchRating, model: SquadModelId, slope: number): number => {
      const key = `${model}\0${clubId}\0${slope}`;
      const cached = values.get(key);
      if (cached !== undefined) {
        hits += 1;
        return cached;
      }
      misses += 1;
      const value = squadShape(rating, model, slope);
      values.set(key, value);
      return value;
    },
    get hits() {
      return hits;
    },
    get misses() {
      return misses;
    },
  };
};

/** Inferred from the factory rather than declared beside it: a hand-written
 * function type would restate four parameter names that nothing reads. */
export type ShapeCache = ReturnType<typeof createShapeCache>;
/**
 * One club as the wage fit sees it: what its payroll should be, and what one
 * unit of `wageAtPivot` buys there. Deliberately not the club record - the
 * fit is a property of these two numbers and nothing else, so the search can
 * be tested on a synthetic population with known parameters.
 */
export type FitObservation = {
  readonly id: string;
  /** The club's target payroll, in whatever unit the caller works in. */
  readonly target: number;
  /** `payroll / wageAtPivot` for this club at the slope under test. */
  readonly shape: number;
};

const assertObservations = (observations: readonly FitObservation[]): void => {
  if (observations.length === 0) throw new Error("empty fit population");
  for (const o of observations) {
    if (!Number.isFinite(o.target) || o.target <= 0) {
      throw new Error(`${o.id}: target must be finite and positive, got ${o.target}`);
    }
    if (!Number.isFinite(o.shape) || o.shape <= 0) {
      throw new Error(`${o.id}: shape must be finite and positive, got ${o.shape}`);
    }
  }
};

/**
 * The level at which each club would be hit exactly.
 *
 * Every quantity the fit asks about is a function of these ratios alone: the
 * error at level L is `|L - r| / r`, so the level search never has to look at
 * targets and shapes again.
 */
export const levelRatios = (observations: readonly FitObservation[]): number[] => {
  assertObservations(observations);
  return observations.map((o) => o.target / o.shape);
};

/**
 * The REFERENCE loss: sum of squared log residuals, every club weighted
 * equally. Named rather than called "the" loss, because it is not the median
 * absolute percentage error the spec's acceptance criteria use - minimising
 * one does not minimise the other, and conflating them is how a fit comes to
 * claim a criterion it never optimised.
 */
export const logSse = (observations: readonly FitObservation[], level: number): number => {
  assertObservations(observations);
  if (!Number.isFinite(level) || level <= 0) {
    throw new Error(`level must be finite and positive, got ${level}`);
  }
  return levelRatios(observations).reduce(
    (sum, ratio) => sum + (Math.log(level) - Math.log(ratio)) ** 2,
    0
  );
};

/** The level minimising `logSse` at fixed shapes: the geometric mean of the
 * ratios, which is exact rather than searched. */
export const geometricLevel = (observations: readonly FitObservation[]): number => {
  const ratios = levelRatios(observations);
  const meanLog = ratios.reduce((sum, r) => sum + Math.log(r), 0) / ratios.length;
  return Math.exp(meanLog);
};

/**
 * Diagnostic A of the plan: the level that makes the population's payroll sum
 * come out exactly right.
 *
 * It is a diagnostic and not a candidate estimator, because it identifies
 * nothing on its own - for ANY slope this level reproduces the sum exactly,
 * so "the sum matches" is evidence about neither slope nor curve shape.
 */
export const sumNormalisedLevel = (observations: readonly FitObservation[]): number => {
  assertObservations(observations);
  const targetSum = observations.reduce((sum, o) => sum + o.target, 0);
  const shapeSum = observations.reduce((sum, o) => sum + o.shape, 0);
  return targetSum / shapeSum;
};

/**
 * The activation's wage slope, decided by the product owner on 2026-09-09:
 * option A, slope 12,
 * chosen as the middle of a flat region rather than as a minimum of anything.
 */
export const ACTIVATION_WAGE_SLOPE = 12;

/** One club as the wage population knows it, before the fit reduces it to a
 * target and a shape. Structural, not the club record: the fit is a property
 * of these four fields alone. */
export type WageMember = {
  readonly clubId: string;
  readonly shortName: string;
  readonly rating: MatchRating;
  readonly targetPayrollPln: number;
};

/**
 * Turns a wage population into the fit's observations at any slope.
 *
 * Shared rather than private to the report because the activation reads the
 * same aggregate: `WAGE_AT_PIVOT_PLN` is option A's level, and option A's
 * level is `sumNormalisedLevel` of exactly these observations. Two copies of
 * this mapping would let the constant burnt into `src/data/balance.ts` drift
 * from the table it was justified by, silently.
 */
export const observationsFor = (
  members: readonly WageMember[],
  model: SquadModelId,
  cache: ShapeCache
): ObservationsAtSlope => {
  return (slope: number) =>
    members.map((member) => ({
      id: member.shortName,
      target: member.targetPayrollPln,
      shape: cache.shape(member.clubId, member.rating, model, slope),
    }));
};

/**
 * `WAGE_AT_PIVOT_PLN` at full precision: the level that reproduces the
 * population's total payroll exactly at this slope.
 *
 * The option-A table prints it rounded for reading. Rounding is fine for
 * reading and wrong for arithmetic - the activation divides this by the money
 * scale to get `WAGE_AT_PIVOT`, and a level rebuilt from `0.1625 x D` is not
 * the level the table was computed from.
 */
export const wageLevelPlnAt = (
  members: readonly WageMember[],
  model: SquadModelId,
  cache: ShapeCache,
  slope: number
): number => sumNormalisedLevel(observationsFor(members, model, cache)(slope));

export type ClubResidual = {
  readonly id: string;
  readonly target: number;
  readonly predicted: number;
  readonly signedErrorPercent: number;
  readonly absoluteErrorPercent: number;
};

export type FitSummary = {
  readonly level: number;
  readonly residuals: readonly ClubResidual[];
  readonly medianApePercent: number;
  readonly maxApePercent: number;
  readonly targetSum: number;
  readonly predictedSum: number;
  readonly sumRelativeErrorPercent: number;
  readonly logSse: number;
};

const medianOf = (sorted: readonly number[]): number => {
  const n = sorted.length;
  // Even n takes the MEAN of the two middle values. Treating the median as
  // "how many clubs sit inside the band" would be a different, looser
  // criterion, and the two disagree on real populations.
  return n % 2 === 1
    ? at(sorted, (n - 1) / 2, "middle value")
    : (at(sorted, n / 2 - 1, "lower middle value") + at(sorted, n / 2, "upper middle value")) / 2;
};

export const summariseFit = (
  observations: readonly FitObservation[],
  level: number
): FitSummary => {
  assertObservations(observations);
  const residuals = observations.map((o) => {
    const predicted = level * o.shape;
    const signed = (predicted - o.target) / o.target;
    return {
      id: o.id,
      target: o.target,
      predicted,
      signedErrorPercent: signed * 100,
      absoluteErrorPercent: Math.abs(signed) * 100,
    };
  });
  const sortedApe = residuals.map((r) => r.absoluteErrorPercent).sort((a, b) => a - b);
  const targetSum = observations.reduce((sum, o) => sum + o.target, 0);
  const predictedSum = residuals.reduce((sum, r) => sum + r.predicted, 0);
  return {
    level,
    residuals,
    medianApePercent: medianOf(sortedApe),
    maxApePercent: at(sortedApe, sortedApe.length - 1, "largest APE"),
    targetSum,
    predictedSum,
    sumRelativeErrorPercent: ((predictedSum - targetSum) / targetSum) * 100,
    logSse: logSse(observations, level),
  };
};

export type LevelInterval = { readonly lo: number; readonly hi: number };

/**
 * Levels at which NO club exceeds the tolerance.
 *
 * Each club admits `[(1 - t) r, (1 + t) r]`, so the answer is one interval:
 * the intersection of all of them. Empty when the ratios spread further than
 * `(1 + t) / (1 - t)`, which is a property of the population and the slope,
 * not of the level - no level rescues it.
 */
export const maxErrorFeasibleLevels = (
  observations: readonly FitObservation[],
  tolerance: number
): LevelInterval | null => {
  if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance >= 1) {
    throw new Error(`tolerance must be in (0, 1), got ${tolerance}`);
  }
  const ratios = levelRatios(observations);
  const lo = Math.max(...ratios.map((r) => (1 - tolerance) * r));
  const hi = Math.min(...ratios.map((r) => (1 + tolerance) * r));
  return lo <= hi ? { lo, hi } : null;
};

export type MaxCriterionWitness = {
  readonly high: { readonly id: string; readonly ratio: number };
  readonly low: { readonly id: string; readonly ratio: number };
  readonly spread: number;
  /** `(1 + t) / (1 - t)`, the widest spread any single level can cover. */
  readonly allowedSpread: number;
  readonly feasible: boolean;
};

/**
 * The two clubs that decide the maximum criterion, and by how much.
 *
 * This is the analytic form of the answer rather than a search result: a
 * level within `t` of both ends needs `max(r) / min(r) <= (1 + t) / (1 - t)`,
 * so when the spread exceeds that, these two clubs alone rule out EVERY
 * level, and naming them says why. The report prints the pair, so a reader
 * can check the claim against two rows of the manifest instead of trusting
 * a sweep.
 */
export const maxCriterionWitness = (
  observations: readonly FitObservation[],
  tolerance: number
): MaxCriterionWitness => {
  if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance >= 1) {
    throw new Error(`tolerance must be in (0, 1), got ${tolerance}`);
  }
  const ratios = levelRatios(observations);
  let highIndex = 0;
  let lowIndex = 0;
  let high = at(ratios, 0, "first level ratio");
  let low = high;
  for (const [i, ratio] of ratios.entries()) {
    if (ratio > high) {
      highIndex = i;
      high = ratio;
    }
    if (ratio < low) {
      lowIndex = i;
      low = ratio;
    }
  }
  const spread = high / low;
  const allowedSpread = (1 + tolerance) / (1 - tolerance);
  return {
    high: { id: at(observations, highIndex, "highest-ratio observation").id, ratio: high },
    low: { id: at(observations, lowIndex, "lowest-ratio observation").id, ratio: low },
    spread,
    allowedSpread,
    feasible: spread <= allowedSpread,
  };
};

export const medianApeAt = (ratios: readonly number[], level: number): number =>
  medianOf(ratios.map((r) => Math.abs(level - r) / r).sort((a, b) => a - b));

/** Where the ordering of two clubs' absolute errors can change: their
 * harmonic mean, the only positive level at which `|L - a|/a = |L - b|/b`
 * with the two sides on opposite arms of their V. */
const orderChangePoints = (ratios: readonly number[]): number[] => {
  const points: number[] = [];
  for (const [i, a] of ratios.entries()) {
    points.push(a);
    for (const b of ratios.slice(i + 1)) {
      points.push((2 * a * b) / (a + b));
    }
  }
  return points;
};

const MAX_SEGMENT_DEPTH = 24;
const LINEARITY_EPSILON = 1e-12;

/** Feasible sub-interval of one segment on which the median is linear, found
 * by solving that line. Subdivides instead of trusting the assumption when
 * the midpoint disagrees with it. */
const feasibleOnSegment = (
  ratios: readonly number[],
  a: number,
  b: number,
  tolerance: number,
  depth: number
): LevelInterval[] => {
  const fa = medianApeAt(ratios, a);
  const fb = medianApeAt(ratios, b);
  const mid = (a + b) / 2;
  const fMid = medianApeAt(ratios, mid);
  const linearMid = (fa + fb) / 2;
  if (depth < MAX_SEGMENT_DEPTH && Math.abs(fMid - linearMid) > LINEARITY_EPSILON) {
    return [
      ...feasibleOnSegment(ratios, a, mid, tolerance, depth + 1),
      ...feasibleOnSegment(ratios, mid, b, tolerance, depth + 1),
    ];
  }
  const insideA = fa <= tolerance;
  const insideB = fb <= tolerance;
  if (insideA && insideB) return [{ lo: a, hi: b }];
  if (!insideA && !insideB) return [];
  const span = b - a;
  if (insideA) return [{ lo: a, hi: a + ((tolerance - fa) / (fb - fa)) * span }];
  return [{ lo: a + ((fa - tolerance) / (fa - fb)) * span, hi: b }];
};

const mergeIntervals = (intervals: readonly LevelInterval[]): LevelInterval[] => {
  const sorted = [...intervals]
    .filter((interval) => interval.hi >= interval.lo)
    .sort((x, y) => x.lo - y.lo);
  const merged: LevelInterval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.lo <= last.hi) {
      if (interval.hi > last.hi) merged[merged.length - 1] = { lo: last.lo, hi: interval.hi };
    } else {
      merged.push(interval);
    }
  }
  return merged;
};

/**
 * Levels at which the MEDIAN absolute percentage error stays inside the
 * tolerance. A union of intervals, not one interval: each club's error is a
 * V in the level, so their median rises, falls and rises again.
 *
 * Outside `[(1 - t) min r, (1 + t) max r]` every club is already outside the
 * band, so the search is bounded exactly rather than by a guessed range.
 */
export const medianErrorFeasibleLevels = (
  observations: readonly FitObservation[],
  tolerance: number
): LevelInterval[] => {
  if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance >= 1) {
    throw new Error(`tolerance must be in (0, 1), got ${tolerance}`);
  }
  const ratios = levelRatios(observations);
  const lower = (1 - tolerance) * Math.min(...ratios);
  const upper = (1 + tolerance) * Math.max(...ratios);
  const points = [lower, upper, ...orderChangePoints(ratios)]
    .filter((point) => point >= lower && point <= upper)
    .sort((x, y) => x - y);
  const found: LevelInterval[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const previous = at(points, i - 1, "segment start");
    const current = at(points, i, "segment end");
    if (current <= previous) continue;
    found.push(...feasibleOnSegment(ratios, previous, current, tolerance, 0));
  }
  return mergeIntervals(found);
};

/** Levels satisfying BOTH criteria at once, with the level free. Checking
 * them one at a time at a single level would answer a different question. */
export const jointFeasibleLevels = (
  observations: readonly FitObservation[],
  medianTolerance: number,
  maxTolerance: number
): LevelInterval[] => {
  const cap = maxErrorFeasibleLevels(observations, maxTolerance);
  if (!cap) return [];
  const intervals = medianErrorFeasibleLevels(observations, medianTolerance);
  return mergeIntervals(
    intervals
      .map((interval) => ({
        lo: Math.max(interval.lo, cap.lo),
        hi: Math.min(interval.hi, cap.hi),
      }))
      .filter((interval) => interval.hi >= interval.lo)
  );
};
/** The slope grid the plan fixes. Wide on purpose: the point is to show
 * where the feasible region is and is not, so a range narrowed to the
 * expected answer would prove nothing. */
export type SlopeRange = { readonly min: number; readonly max: number; readonly step: number };

export const SLOPE_SCAN_RANGE: SlopeRange = { min: 2, max: 20, step: 0.01 };

/** Acceptance tolerances from the spec's chapter 4, as fractions. */
export type WageCriteria = {
  readonly medianTolerance: number;
  readonly maxTolerance: number;
};

export const WAGE_CRITERIA: WageCriteria = { medianTolerance: 0.15, maxTolerance: 0.3 };

/** How the caller turns a slope into a population. Injected so the search
 * takes the squad model as data and can be exercised on a synthetic
 * population whose parameters are known in advance. */
// The underscore is for the linter, which cannot tell a name in a type
// position from an unused argument; the parameter is the slope.
export type ObservationsAtSlope = (_slope: number) => readonly FitObservation[];

export type SlopeScanPoint = {
  readonly slope: number;
  /** Level minimising the reference loss at this slope. */
  readonly level: number;
  readonly logSse: number;
  readonly medianApePercent: number;
  readonly maxApePercent: number;
  /** Levels meeting BOTH criteria at this slope, with the level free. Empty
   * means no level rescues this slope, not that this level is wrong. */
  readonly joint: readonly LevelInterval[];
  /** Which two clubs bound the maximum criterion here, and by how much. */
  readonly maxWitness: MaxCriterionWitness;
};

const roundToGrid = (value: number, step: number): number => {
  const inverse = Math.round(1 / step);
  return Math.round(value * inverse) / inverse;
};

export const evaluateSlope = (
  observationsAt: ObservationsAtSlope,
  slope: number,
  criteria: WageCriteria = WAGE_CRITERIA
): SlopeScanPoint => {
  const observations = observationsAt(slope);
  const level = geometricLevel(observations);
  const summary = summariseFit(observations, level);
  return {
    slope,
    level,
    logSse: summary.logSse,
    medianApePercent: summary.medianApePercent,
    maxApePercent: summary.maxApePercent,
    joint: jointFeasibleLevels(observations, criteria.medianTolerance, criteria.maxTolerance),
    maxWitness: maxCriterionWitness(observations, criteria.maxTolerance),
  };
};

/**
 * A log-spaced probe far outside SLOPE_SCAN_RANGE, used to decide whether the
 * fine scan's verdict is a property of the data or of the range chosen.
 *
 * Log-spaced because the shape function reacts to a slope's ORDER of
 * magnitude, not to its absolute size: the interesting behaviour between 0.05
 * and 10000 lives in the exponent, and a linear grid would spend every point
 * in the flat tail.
 */
export const WIDE_SLOPE_PROBE = { min: 0.05, max: 10_000, points: 600 } as const;

export type SpreadProbe = {
  /** Smallest spread found anywhere on the probe, and where. */
  readonly minSpread: number;
  readonly minSpreadSlope: number;
  /** Spread as the slope grows without bound. See limitSpreadAtFlatCurve. */
  readonly limitSpread: number;
  readonly allowedSpread: number;
  /** True when some probed slope, or the limit, admits a level for every club. */
  readonly anyFeasible: boolean;
};

/**
 * The spread a perfectly flat curve would leave: max(target) / min(target).
 *
 * As the slope grows, every exp((ovr - pivot) / slope) tends to 1, so a club's
 * shape tends to its squad size - the same number for every club, since the
 * formations and their squad sizes do not depend on the club. The ratios then
 * differ only through the targets, and no level can straddle a spread the
 * targets alone already impose.
 *
 * This is the one bound on the spread that holds without reference to any
 * particular slope, which is why it is computed rather than scanned for.
 */
export const limitSpreadAtFlatCurve = (observations: readonly FitObservation[]): number => {
  assertObservations(observations);
  const targets = observations.map((o) => o.target);
  return Math.max(...targets) / Math.min(...targets);
};

/**
 * Probes the spread across orders of magnitude and reports whether the max
 * criterion is reachable anywhere.
 *
 * Answers a question the fine scan cannot: "no solution in [2, 20]" leaves
 * open whether a solution sits just outside. It stays a probe, not a proof -
 * a probe plus the flat-curve limit is what turns a range-bounded finding into
 * a usable one.
 */
export const probeSpreadAcrossScales = (
  observationsAt: ObservationsAtSlope,
  tolerance: number = WAGE_CRITERIA.maxTolerance,
  probe: { min: number; max: number; points: number } = WIDE_SLOPE_PROBE
): SpreadProbe => {
  if (!(probe.min > 0) || !(probe.max > probe.min) || probe.points < 2) {
    throw new Error("probe must span a positive, increasing range with at least two points");
  }
  let minSpread = Infinity;
  let minSpreadSlope = probe.min;
  for (let i = 0; i < probe.points; i += 1) {
    const slope = probe.min * Math.pow(probe.max / probe.min, i / (probe.points - 1));
    const { spread } = maxCriterionWitness(observationsAt(slope), tolerance);
    if (spread < minSpread) {
      minSpread = spread;
      minSpreadSlope = slope;
    }
  }
  const limitSpread = limitSpreadAtFlatCurve(observationsAt(probe.max));
  const allowedSpread = (1 + tolerance) / (1 - tolerance);
  return {
    minSpread,
    minSpreadSlope,
    limitSpread,
    allowedSpread,
    anyFeasible: Math.min(minSpread, limitSpread) <= allowedSpread,
  };
};

export const scanSlopes = (
  observationsAt: ObservationsAtSlope,
  range: SlopeRange = SLOPE_SCAN_RANGE,
  criteria: WageCriteria = WAGE_CRITERIA
): SlopeScanPoint[] => {
  if (!(range.step > 0) || !(range.max > range.min)) {
    throw new Error("slope range must be non-empty with a positive step");
  }
  const points: SlopeScanPoint[] = [];
  const steps = Math.round((range.max - range.min) / range.step);
  for (let i = 0; i <= steps; i += 1) {
    points.push(
      evaluateSlope(observationsAt, roundToGrid(range.min + i * range.step, range.step), criteria)
    );
  }
  return points;
};

/** Golden-section refinement, bounded and deterministic. */
const GOLDEN_RATIO_INVERSE = (Math.sqrt(5) - 1) / 2;
const REFINE_TOLERANCE = 1e-6;
const MAX_REFINE_ITERATIONS = 200;

export type SlopeSearch = {
  readonly scan: readonly SlopeScanPoint[];
  /** Best point ON THE GRID, before refinement. */
  readonly gridBest: SlopeScanPoint;
  /** Interior grid points that are local minima of the reference loss. More
   * than one means the loss is not unimodal and the refinement below is
   * local, so the report must say so rather than call the result global. */
  readonly localMinimaCount: number;
  /** Grid points tied with the best one, to the last representable digit. */
  readonly gridTies: number;
  /** True when the grid minimum sits on an end of the declared range. Then
   * the answer is limited by the range, not found inside it. */
  readonly atRangeBoundary: boolean;
  readonly refined: SlopeScanPoint;
  readonly refineIterations: number;
  readonly refineBracket: { readonly lo: number; readonly hi: number };
  readonly refineConverged: boolean;
};

export const searchSlope = (
  observationsAt: ObservationsAtSlope,
  range: SlopeRange = SLOPE_SCAN_RANGE,
  criteria: WageCriteria = WAGE_CRITERIA
): SlopeSearch => {
  const scan = scanSlopes(observationsAt, range, criteria);
  let bestIndex = 0;
  let gridBest = at(scan, 0, "first slope scan point");
  for (const [i, point] of scan.entries()) {
    if (point.logSse < gridBest.logSse) {
      bestIndex = i;
      gridBest = point;
    }
  }
  const gridTies = scan.filter((point) => point.logSse === gridBest.logSse).length - 1;

  let localMinimaCount = 0;
  for (let i = 1; i < scan.length - 1; i += 1) {
    const here = at(scan, i, "slope scan point").logSse;
    if (
      here < at(scan, i - 1, "slope scan point").logSse &&
      here <= at(scan, i + 1, "slope scan point").logSse
    ) {
      localMinimaCount += 1;
    }
  }

  const atRangeBoundary = bestIndex === 0 || bestIndex === scan.length - 1;
  const lo = at(scan, Math.max(0, bestIndex - 1), "lower bracket").slope;
  const hi = at(scan, Math.min(scan.length - 1, bestIndex + 1), "upper bracket").slope;

  let a = lo;
  let b = hi;
  let c = b - GOLDEN_RATIO_INVERSE * (b - a);
  let d = a + GOLDEN_RATIO_INVERSE * (b - a);
  let lossC = evaluateSlope(observationsAt, c, criteria).logSse;
  let lossD = evaluateSlope(observationsAt, d, criteria).logSse;
  let iterations = 0;
  while (b - a > REFINE_TOLERANCE && iterations < MAX_REFINE_ITERATIONS) {
    if (lossC < lossD) {
      b = d;
      d = c;
      lossD = lossC;
      c = b - GOLDEN_RATIO_INVERSE * (b - a);
      lossC = evaluateSlope(observationsAt, c, criteria).logSse;
    } else {
      a = c;
      c = d;
      lossC = lossD;
      d = a + GOLDEN_RATIO_INVERSE * (b - a);
      lossD = evaluateSlope(observationsAt, d, criteria).logSse;
    }
    iterations += 1;
  }
  const refinedSlope = (a + b) / 2;
  const refined = evaluateSlope(observationsAt, refinedSlope, criteria);
  // The bracket is only as good as the grid it came from: if the grid minimum
  // is on an end, the refinement searched a one-sided interval.
  return {
    scan,
    gridBest,
    localMinimaCount,
    gridTies,
    atRangeBoundary,
    refined: refined.logSse <= gridBest.logSse ? refined : gridBest,
    refineIterations: iterations,
    refineBracket: { lo, hi },
    refineConverged: b - a <= REFINE_TOLERANCE,
  };
};

/** Contiguous runs of slopes that meet both criteria at some level. Reported
 * as the feasible set inside the SCANNED range; the absence of one is a
 * statement about that range, never about all positive slopes. */
export const feasibleSlopeRuns = (
  scan: readonly SlopeScanPoint[]
): { readonly from: number; readonly to: number }[] => {
  const runs: { from: number; to: number }[] = [];
  let open: { from: number; to: number } | null = null;
  for (const point of scan) {
    if (point.joint.length > 0) {
      if (open) open.to = point.slope;
      else open = { from: point.slope, to: point.slope };
    } else if (open) {
      runs.push(open);
      open = null;
    }
  }
  if (open) runs.push(open);
  return runs;
};
/**
 * Where each club is expected to finish, from the engine's own closed form.
 *
 * `expectedPlace` ranks every club against the same field, so a tie leaves
 * two clubs on the same place and the result is NOT a permutation of 1..18.
 * That is the engine's semantics and it is kept: inventing a tiebreak here
 * would make the ladder pay a club something the game never would.
 */
export type LeagueMember = {
  readonly clubId: string;
  readonly shortName: string;
  readonly rating: MatchRating;
};

export type ClubForecast = {
  readonly clubId: string;
  readonly shortName: string;
  readonly expectedPoints: number;
  readonly expectedPlace: number;
};

export const leagueForecast = (members: readonly LeagueMember[]): ClubForecast[] => {
  if (members.length < 2) throw new Error("a league forecast needs at least two clubs");
  for (const member of members) {
    if (
      !Number.isFinite(member.rating.attack) ||
      !Number.isFinite(member.rating.defence) ||
      member.rating.attack <= 0 ||
      member.rating.defence <= 0
    ) {
      throw new Error(`${member.clubId}: rating must be finite and positive`);
    }
  }
  return members.map((member, index) => {
    const opponents = members.filter((_, other) => other !== index).map((other) => other.rating);
    return {
      clubId: member.clubId,
      shortName: member.shortName,
      expectedPoints: expectedSeasonPoints(member.rating, opponents),
      expectedPlace: expectedPlace(member.rating, opponents),
    };
  });
};

/** The ladder's weights, `18 + 17 + ... + 1`, computed rather than pinned so
 * a change to the league's size cannot leave a stale divisor behind. */
export const meritWeightSum = (clubCount: number): number => {
  if (!Number.isInteger(clubCount) || clubCount < 2) {
    throw new Error(`clubCount must be an integer of at least two, got ${clubCount}`);
  }
  return (clubCount * (clubCount + 1)) / 2;
};

export type ScaleClub = {
  readonly clubId: string;
  readonly shortName: string;
  readonly recurringRevenuePln: number;
  readonly fittedPayrollPln: number;
  readonly forecastPlace: number;
};

export type ClubSurplus = {
  readonly clubId: string;
  readonly shortName: string;
  readonly recurringRevenuePln: number;
  readonly fittedPayrollPln: number;
  readonly leaguePrizePln: number;
  readonly surplusPln: number;
};

export type MoneyScaleCandidate = {
  readonly surpluses: readonly ClubSurplus[];
  readonly medianSurplusPln: number;
  /** D: PLN behind one million euro as the game shows it. NOT an exchange
   * rate - transfer prices are already anchored in real millions of euro and
   * cross into the game's unit one to one. */
  readonly pricePerGameMillionPln: number;
  /** LEAGUE_PRIZE_RATE: game millions per place of the ladder. */
  readonly leaguePrizeRate: number;
  /** WAGE_AT_PIVOT: annual wage of an ovr-70 player, in game millions. */
  readonly wageAtPivot: number;
};

/**
 * The candidate money scale that makes the MEDIAN club's season balance come
 * out at zero, once its fixed costs are paid.
 *
 * A starting approximation and nothing more. The spec's chapter 12.2 asks a
 * different question - the median of clubs' median balances over full
 * finance-control careers - and development, relegation and league turnover
 * do not disappear because this identity was solved. Step 4 has to measure
 * it on full dumps and may have to move the scale.
 */
export const deriveMoneyScale = (
  clubs: readonly ScaleClub[],
  poolPln: number,
  fixedCostsGameUnits: number,
  levelPln: number
): MoneyScaleCandidate => {
  if (clubs.length === 0) throw new Error("empty money-scale population");
  if (!Number.isFinite(poolPln) || poolPln <= 0) {
    throw new Error(`pool must be finite and positive, got ${poolPln}`);
  }
  if (!Number.isFinite(fixedCostsGameUnits) || fixedCostsGameUnits <= 0) {
    throw new Error(`fixed costs must be finite and positive, got ${fixedCostsGameUnits}`);
  }
  if (!Number.isFinite(levelPln) || levelPln <= 0) {
    throw new Error(`level must be finite and positive, got ${levelPln}`);
  }
  const weightSum = meritWeightSum(clubs.length);
  const surpluses = clubs.map((club) => {
    for (const [name, value] of [
      ["recurringRevenuePln", club.recurringRevenuePln],
      ["fittedPayrollPln", club.fittedPayrollPln],
      ["forecastPlace", club.forecastPlace],
    ] as const) {
      if (!Number.isFinite(value)) throw new Error(`${club.clubId}: ${name} is not finite`);
    }
    if (club.forecastPlace < 1 || club.forecastPlace > clubs.length) {
      throw new Error(`${club.clubId}: forecast place ${club.forecastPlace} is outside the league`);
    }
    const leaguePrizePln = (poolPln * (clubs.length + 1 - club.forecastPlace)) / weightSum;
    return {
      clubId: club.clubId,
      shortName: club.shortName,
      recurringRevenuePln: club.recurringRevenuePln,
      fittedPayrollPln: club.fittedPayrollPln,
      leaguePrizePln,
      surplusPln: club.recurringRevenuePln - club.fittedPayrollPln + leaguePrizePln,
    };
  });

  const sorted = surpluses.map((entry) => entry.surplusPln).sort((a, b) => a - b);
  const medianSurplusPln = medianOf(sorted);
  const pricePerGameMillionPln = medianSurplusPln / fixedCostsGameUnits;
  if (!Number.isFinite(pricePerGameMillionPln) || pricePerGameMillionPln <= 0) {
    throw new Error(
      `no positive money scale: median surplus ${medianSurplusPln.toFixed(0)} PLN over ` +
        `${fixedCostsGameUnits} of fixed costs gives ${pricePerGameMillionPln}`
    );
  }
  return {
    surpluses,
    medianSurplusPln,
    pricePerGameMillionPln,
    leaguePrizeRate: poolPln / (weightSum * pricePerGameMillionPln),
    wageAtPivot: levelPln / pricePerGameMillionPln,
  };
};
/** A club as the option-A table needs it: revenue, its squad shape AT THE
 * SLOPE UNDER TEST, and the place its ladder money is computed from. */
export type OptionAClub = {
  readonly clubId: string;
  readonly shortName: string;
  readonly recurringRevenuePln: number;
  readonly shape: number;
  readonly forecastPlace: number;
};

export type OptionAPoint = {
  readonly slope: number;
  readonly levelPln: number;
  readonly pricePerGameMillionPln: number;
  readonly wageAtPivot: number;
  readonly wageByOvr: readonly { readonly ovr: number; readonly wage: number }[];
  readonly topWageShareRichest: number;
  readonly topWageSharePoorest: number;
  readonly medianApePercent: number;
  readonly maxApePercent: number;
  /**
   * Median first-year cost of a KUPNO card under THIS row's wage curve.
   *
   * Present because the budget-policy table is computed once, at the
   * reference fit, while option A moves the wage curve and with it both the
   * money scale and this cost. A floor read off the reference row would be a
   * floor for a slope nobody chose.
   */
  readonly medianFirstYearCost: number;
  /** Clubs that can afford it on MIN_BUDGET_SHARE alone, out of clubCount. */
  readonly playableAtMinShare: number;
  readonly clubCount: number;
  /** Absolute floor that makes every club afford it: the cost itself. */
  readonly floorForFullPlayability: number;
  /**
   * `WOLNY_WAGE_PREMIUM` fitted against THIS row's wage curve.
   *
   * Carried for the same reason as the cost above, and the trap is sharper:
   * the premium is `1 + target / unitShare` and `unitShare` is two seasons of
   * wage over a fee anchored in real euro, so it moves whenever the curve
   * does. Shipping a premium fitted at one slope alongside another slope puts
   * the overpay outside the spec's 0.40-0.60 band, which disqualifies a run
   * just as much from above as from below.
   */
  readonly freeAgentPremium: number;
};

/**
 * One row of the option-A table: the level is set by matching the aggregate,
 * and everything else follows from it.
 *
 * The payroll is rebuilt from each club's shape at THIS slope rather than
 * taken from a prepared ScaleClub. A version that reused payrolls fitted at
 * one reference slope produced an identical money scale in every row - a table
 * that looked measured and said nothing.
 */
export const optionAVariantAt = (
  slope: number,
  observations: readonly FitObservation[],
  clubs: readonly OptionAClub[],
  poolPln: number,
  fixedCostsGameUnits: number,
  probeOvrs: readonly number[],
  /** Required, never defaulted: a row without its own cohort cost would
   * silently inherit the reference slope's, which is the whole error this
   * field exists to prevent. Same lesson as `formation` in squad.ts. */
  medianFirstYearCostAt: (_params: WageParams) => number,
  /** Required for the same reason as the cost callback above. */
  freeAgentPremiumAt: (_params: WageParams) => number
): OptionAPoint => {
  if (!Number.isFinite(slope) || slope <= 0) {
    throw new Error(`slope must be finite and positive, got ${slope}`);
  }
  if (clubs.length === 0) throw new Error("empty option-A population");
  const levelPln = sumNormalisedLevel(observations);
  const scale = deriveMoneyScale(
    clubs.map((club) => ({
      clubId: club.clubId,
      shortName: club.shortName,
      recurringRevenuePln: club.recurringRevenuePln,
      fittedPayrollPln: levelPln * club.shape,
      forecastPlace: club.forecastPlace,
    })),
    poolPln,
    fixedCostsGameUnits,
    levelPln
  );
  const summary = summariseFit(observations, levelPln);
  const wageAtPivot = levelPln / scale.pricePerGameMillionPln;
  const wageAt = (ovr: number): number => wageAtPivot * Math.exp((ovr - WAGE_PIVOT) / slope);
  const revenues = clubs.map((club) => club.recurringRevenuePln / scale.pricePerGameMillionPln);
  const rowParams: WageParams = { wageAtPivot, wageSlope: slope };
  const medianFirstYearCost = medianFirstYearCostAt(rowParams);
  if (!Number.isFinite(medianFirstYearCost) || medianFirstYearCost <= 0) {
    throw new Error(
      `median first-year cost must be finite and positive, got ${medianFirstYearCost}`
    );
  }
  const freeAgentPremium = freeAgentPremiumAt(rowParams);
  if (!Number.isFinite(freeAgentPremium) || freeAgentPremium <= 1) {
    throw new Error(`free-agent premium must be finite and above 1, got ${freeAgentPremium}`);
  }
  return {
    slope,
    levelPln,
    pricePerGameMillionPln: scale.pricePerGameMillionPln,
    wageAtPivot,
    wageByOvr: probeOvrs.map((ovr) => ({ ovr, wage: wageAt(ovr) })),
    topWageShareRichest: wageAt(90) / Math.max(...revenues),
    topWageSharePoorest: wageAt(90) / Math.min(...revenues),
    medianApePercent: summary.medianApePercent,
    maxApePercent: summary.maxApePercent,
    medianFirstYearCost,
    playableAtMinShare: revenues.filter(
      (revenue) => revenue * MIN_BUDGET_SHARE >= medianFirstYearCost
    ).length,
    clubCount: clubs.length,
    floorForFullPlayability: medianFirstYearCost,
    freeAgentPremium,
  };
};

/**
 * Budgets, buying power and the one question the spec's chapter 3.5 asks of
 * them: can every club actually buy something.
 *
 * Both shares below are the spec's ASSUMPTIONS, not manifest data. No report
 * publishes a per-club budget share, so the adapter here supplies the floor
 * for every club rather than a field being added to the manifest to carry a
 * number nobody measured.
 */
export const MIN_BUDGET_SHARE = 0.18;
export const MAX_BUDGET_SHARE = 0.3;

/** Wieczysta's owner support reaches the game once, as a starting budget at
 * this percentile of the league - never as a hidden yearly injection. */
export const OWNER_BUDGET_PERCENTILE = 0.8;

/** Share of recurring revenue a club can put behind a single transfer fee. */
export const DOMESTIC_CAPACITY_SHARE = 0.2;

export const budgetShareFor = (reportedShare?: number): number => {
  if (reportedShare === undefined) return MIN_BUDGET_SHARE;
  if (!Number.isFinite(reportedShare)) {
    throw new Error(`budget share must be finite, got ${reportedShare}`);
  }
  return Math.min(MAX_BUDGET_SHARE, Math.max(MIN_BUDGET_SHARE, reportedShare));
};

/**
 * Percentile by linear interpolation on the index `(n - 1) * p`, the same
 * definition scripts/stats.ts uses. Restated here rather than imported so
 * this module stays free of the balance tooling; the test pins the two
 * against each other.
 */
export const interpolatedPercentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) throw new Error("percentile of an empty array");
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`percentile p must be in [0, 1]`);
  const sorted = [...values].sort((a, b) => a - b);
  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = at(sorted, lower, "percentile lower");
  if (lower === upper) return lowerValue;
  return lowerValue * (upper - index) + at(sorted, upper, "percentile upper") * (index - lower);
};

export type BudgetClub = {
  readonly clubId: string;
  readonly shortName: string;
  readonly recurringRevenuePln: number;
  /** Present only for a club whose budget is an owner exception. */
  readonly backerBudgetPercentile?: number;
  /** Reported budget share, when one exists. None does today. */
  readonly reportedBudgetShare?: number;
};

export type BudgetRow = {
  readonly clubId: string;
  readonly shortName: string;
  readonly recurringGameMillions: number;
  readonly share: number;
  /** Budget from the share alone, before any owner exception. */
  readonly baseBudget: number;
  readonly budget: number;
  readonly ownerException: boolean;
};

/**
 * Starting budgets for the playable eighteen.
 *
 * The owner exception is applied in a second pass over budgets computed in
 * the first: the percentile is a property of the league as the share defines
 * it, so feeding the exception's own result back into the sample it is taken
 * from would let the exception move its own target.
 */
export const clubBudgets = (
  clubs: readonly BudgetClub[],
  pricePerGameMillionPln: number
): BudgetRow[] => {
  if (clubs.length === 0) throw new Error("empty budget population");
  if (!Number.isFinite(pricePerGameMillionPln) || pricePerGameMillionPln <= 0) {
    throw new Error(`money scale must be finite and positive, got ${pricePerGameMillionPln}`);
  }
  const base = clubs.map((club) => {
    if (!Number.isFinite(club.recurringRevenuePln) || club.recurringRevenuePln <= 0) {
      throw new Error(`${club.clubId}: recurring revenue must be finite and positive`);
    }
    const share = budgetShareFor(club.reportedBudgetShare);
    const recurringGameMillions = club.recurringRevenuePln / pricePerGameMillionPln;
    return {
      club,
      share,
      recurringGameMillions,
      baseBudget: recurringGameMillions * share,
    };
  });
  return base.map((entry) => {
    const percentile = entry.club.backerBudgetPercentile;
    const budget =
      percentile === undefined
        ? entry.baseBudget
        : interpolatedPercentile(
            base.map((other) => other.baseBudget),
            percentile
          );
    return {
      clubId: entry.club.clubId,
      shortName: entry.club.shortName,
      recurringGameMillions: entry.recurringGameMillions,
      share: entry.share,
      baseBudget: entry.baseBudget,
      budget,
      ownerException: percentile !== undefined,
    };
  });
};

export type BuyingCapacityRow = {
  readonly clubId: string;
  readonly shortName: string;
  readonly uncappedCapacity: number;
  readonly capacity: number;
  /** What the club may offer before a successful haggle adds its bonus. */
  readonly offerBeforeHaggle: number;
  /** True when MAX_DOMESTIC_FEE, not the club's revenue, decided the answer. */
  readonly capBinding: boolean;
};

/**
 * What each of the thirty-six clubs the game can name may pay for a player.
 *
 * The ceiling is reported as binding or not rather than treated as an error:
 * a cap that never binds is a diagnostic about the cap, and it is never a
 * reason to raise anybody's revenue.
 */
export const domesticBuyingCapacity = (
  clubs: readonly {
    clubId: string;
    shortName: string;
    recurringRevenuePln: number;
  }[],
  pricePerGameMillionPln: number,
  maxDomesticFee: number,
  haggleSaleBonus: number
): BuyingCapacityRow[] => {
  if (clubs.length === 0) throw new Error("empty buyer population");
  if (!Number.isFinite(pricePerGameMillionPln) || pricePerGameMillionPln <= 0) {
    throw new Error(`money scale must be finite and positive, got ${pricePerGameMillionPln}`);
  }
  if (!Number.isFinite(maxDomesticFee) || maxDomesticFee <= 0) {
    throw new Error(`max domestic fee must be finite and positive, got ${maxDomesticFee}`);
  }
  if (!Number.isFinite(haggleSaleBonus) || haggleSaleBonus <= 0) {
    throw new Error(`haggle bonus must be finite and positive, got ${haggleSaleBonus}`);
  }
  return clubs.map((club) => {
    if (!Number.isFinite(club.recurringRevenuePln) || club.recurringRevenuePln <= 0) {
      throw new Error(`${club.clubId}: recurring revenue must be finite and positive`);
    }
    const uncapped = (club.recurringRevenuePln / pricePerGameMillionPln) * DOMESTIC_CAPACITY_SHARE;
    const capacity = Math.min(maxDomesticFee, uncapped);
    return {
      clubId: club.clubId,
      shortName: club.shortName,
      uncappedCapacity: uncapped,
      capacity,
      offerBeforeHaggle: capacity / (1 + haggleSaleBonus),
      capBinding: uncapped > maxDomesticFee,
    };
  });
};

/**
 * Median of `U(0.9, 1.5)`, the deviation a KUPNO card multiplies the market
 * value by. Stated as an assumption because it is: the fee on a card is a
 * draw, and the reference cost below uses its median rather than pretending
 * the market value IS the fee.
 */
export const KUPNO_MEDIAN_PRICE_DEVIATION = 1.2;

export type CohortPlayer = {
  readonly ovr: number;
  readonly age: number;
  readonly pos: PositionCode;
};

export type CohortCost = {
  readonly ovr: number;
  readonly age: number;
  readonly pos: PositionCode;
  readonly marketValue: number;
  readonly fee: number;
  readonly annualWage: number;
  /** The quantity the playability question is actually about. */
  readonly firstYearCost: number;
};

/**
 * What a cohort of players would cost under the fitted curves.
 *
 * Fee and wage are added PER PLAYER before any median is taken. A median fee
 * plus a median wage would be the cost of a player who need not exist, and
 * the two medians are attained by different players whenever ovr and age
 * pull the fee and the wage in different directions.
 */
export const priceCohort = (
  cohort: readonly CohortPlayer[],
  wageParams: WageParams,
  priceOf: (_player: CohortPlayer) => number,
  marketMultiplier: number,
  priceDeviation: number = KUPNO_MEDIAN_PRICE_DEVIATION
): CohortCost[] => {
  if (cohort.length === 0) throw new Error("empty cohort");
  if (!Number.isFinite(marketMultiplier) || marketMultiplier <= 0) {
    throw new Error(`market multiplier must be finite and positive, got ${marketMultiplier}`);
  }
  if (!Number.isFinite(priceDeviation) || priceDeviation <= 0) {
    throw new Error(`price deviation must be finite and positive, got ${priceDeviation}`);
  }
  return cohort.map((player) => {
    const marketValue = priceOf(player);
    if (!Number.isFinite(marketValue) || marketValue <= 0) {
      throw new Error(`cohort price must be finite and positive, got ${marketValue}`);
    }
    const fee = marketValue * priceDeviation * marketMultiplier;
    const annualWage = baseWage(player.ovr, wageParams);
    return {
      ovr: player.ovr,
      age: player.age,
      pos: player.pos,
      marketValue,
      fee,
      annualWage,
      firstYearCost: fee + annualWage,
    };
  });
};

export type CohortSummary = {
  readonly count: number;
  readonly medianFee: number;
  readonly medianAnnualWage: number;
  /** Median of the per-player sum, never the sum of the two medians above. */
  readonly medianFirstYearCost: number;
  /** The same quantity computed the wrong way, kept so the report can show
   * how far apart the two are instead of asserting they are close. */
  readonly sumOfMedians: number;
};

export const summariseCohort = (costs: readonly CohortCost[]): CohortSummary => {
  if (costs.length === 0) throw new Error("empty cohort");
  const sortedBy = (pick: (_cost: CohortCost) => number): number[] =>
    costs.map(pick).sort((a, b) => a - b);
  const medianFee = medianOf(sortedBy((cost) => cost.fee));
  const medianAnnualWage = medianOf(sortedBy((cost) => cost.annualWage));
  return {
    count: costs.length,
    medianFee,
    medianAnnualWage,
    medianFirstYearCost: medianOf(sortedBy((cost) => cost.firstYearCost)),
    sumOfMedians: medianFee + medianAnnualWage,
  };
};

export type PlayabilityRow = {
  readonly clubId: string;
  readonly shortName: string;
  readonly budget: number;
  readonly medianFirstYearCost: number;
  readonly playable: boolean;
  /** Share of recurring revenue this club would need for one median card. */
  readonly requiredShare: number;
  /** How much budget it is short of, in game millions. Zero when playable. */
  readonly shortfall: number;
};

/**
 * The spec's chapter 3.5 check: can this club buy one median KUPNO card and
 * pay its wage for a season.
 *
 * Reports what a failing club would need instead of choosing a remedy. The
 * required share and the absolute shortfall are two different fixes - a
 * higher percentage of revenue, or a floor under the budget - and picking
 * between them is the product owner's call, not the tool's.
 */
export const playabilityCheck = (
  budgets: readonly BudgetRow[],
  medianFirstYearCost: number
): PlayabilityRow[] => {
  if (!Number.isFinite(medianFirstYearCost) || medianFirstYearCost <= 0) {
    throw new Error(`median cost must be finite and positive, got ${medianFirstYearCost}`);
  }
  return budgets.map((row) => ({
    clubId: row.clubId,
    shortName: row.shortName,
    budget: row.budget,
    medianFirstYearCost,
    playable: row.budget >= medianFirstYearCost,
    requiredShare: medianFirstYearCost / row.recurringGameMillions,
    shortfall: Math.max(0, medianFirstYearCost - row.budget),
  }));
};
