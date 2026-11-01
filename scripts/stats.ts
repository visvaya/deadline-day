/**
 * Pure statistical helpers for scripts/balance.ts. Split out because the
 * whole balance conclusion rests on quantiles being right - a silent
 * off-by-one in percentile indexing would misreport the measurement without
 * failing anything.
 */

import { at } from "../src/logic/invariant";

export const quantile = (values: readonly number[], p: number): number => {
  if (values.length === 0) throw new Error("quantile of an empty array");
  if (p < 0 || p > 1) throw new Error(`quantile p must be in [0, 1], got ${p}`);
  const sorted = [...values].sort((a, b) => a - b);
  const idx = p * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const lowerValue = at(sorted, lower, "quantile lower");
  if (lower === upper) return lowerValue;
  const frac = idx - lower;
  return lowerValue * (1 - frac) + at(sorted, upper, "quantile upper") * frac;
};

export const median = (values: readonly number[]): number => quantile(values, 0.5);

export const mean = (values: readonly number[]): number => {
  if (values.length === 0) throw new Error("mean of an empty array");
  return values.reduce((a, b) => a + b, 0) / values.length;
};

/** Sample standard deviation (Bessel corrected). A one-value sample has no
 * observed spread, so it reports zero rather than dividing by zero. */
export const sampleStandardDeviation = (values: readonly number[]): number => {
  if (values.length === 0) throw new Error("standard deviation of an empty array");
  if (values.length === 1) return 0;
  const average = mean(values);
  const squaredDeviations = values.reduce((sum, value) => sum + (value - average) ** 2, 0);
  return Math.sqrt(squaredDeviations / (values.length - 1));
};

/** Standard error of the sample mean. */
export const standardError = (values: readonly number[]): number =>
  sampleStandardDeviation(values) / Math.sqrt(values.length);

/** Wilson score interval for a binomial proportion. Unlike plug-in SE it
 * remains informative when a small sample contains zero or only successes. */
export const wilsonInterval = (
  successes: number,
  total: number,
  z = 1.96
): { lower: number; upper: number } => {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || total <= 0) {
    throw new Error("Wilson interval needs non-negative integer successes and positive total");
  }
  if (successes < 0 || successes > total) {
    throw new Error("Wilson interval successes must be between zero and total");
  }
  const proportion = successes / total;
  const zSquared = z ** 2;
  const denominator = 1 + zSquared / total;
  const centre = proportion + zSquared / (2 * total);
  const margin =
    z * Math.sqrt((proportion * (1 - proportion)) / total + zSquared / (4 * total ** 2));
  return {
    lower: Math.max(0, (centre - margin) / denominator),
    upper: Math.min(1, (centre + margin) / denominator),
  };
};

export const min = (values: readonly number[]): number => {
  if (values.length === 0) throw new Error("min of an empty array");
  return values.reduce((a, b) => Math.min(a, b), at(values, 0, "min seed"));
};

export const max = (values: readonly number[]): number => {
  if (values.length === 0) throw new Error("max of an empty array");
  return values.reduce((a, b) => Math.max(a, b), at(values, 0, "max seed"));
};

/** Percentage of `total` that `count` represents. 0 if total is 0. */
export const percent = (count: number, total: number): number =>
  total === 0 ? 0 : (count / total) * 100;

export type Summary = {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
};

export const summarize = (values: readonly number[]): Summary => ({
  min: min(values),
  p25: quantile(values, 0.25),
  median: median(values),
  p75: quantile(values, 0.75),
  max: max(values),
  mean: mean(values),
});

/** Counts each value's occurrences. Keys are the values seen, not assumed up front. */
export const distribution = (values: readonly string[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
};

export type PairedComparison = {
  medianDiff: number;
  winRate: number;
};

/**
 * Paired comparison of `b` against `a` over matching seeds: b[i] - a[i] for
 * each pair. Positive medianDiff / high winRate means `b` beats `a`.
 */
export const pairedComparison = (a: readonly number[], b: readonly number[]): PairedComparison => {
  if (a.length !== b.length) {
    throw new Error(`paired arrays must have equal length, got ${a.length} and ${b.length}`);
  }
  if (a.length === 0) throw new Error("paired comparison of empty arrays");
  const diffs = a.map((v, i) => at(b, i, "paired value") - v);
  const wins = diffs.filter((d) => d > 0).length;
  return { medianDiff: median(diffs), winRate: percent(wins, diffs.length) };
};

const averageRanks = (values: readonly number[]): number[] => {
  const indexed = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  let start = 0;
  while (start < indexed.length) {
    let end = start + 1;
    const startValue = at(indexed, start, "rank group start").value;
    while (end < indexed.length && at(indexed, end, "rank group end").value === startValue) {
      end += 1;
    }
    // Ranks are one-based. The tied group occupies start+1 through end.
    const averageRank = (start + 1 + end) / 2;
    for (const entry of indexed.slice(start, end)) ranks[entry.index] = averageRank;
    start = end;
  }
  return ranks;
};

/** Spearman correlation with average ranks for ties. */
export const spearmanRankCorrelation = (a: readonly number[], b: readonly number[]): number => {
  if (a.length !== b.length) {
    throw new Error(`rank arrays must have equal length, got ${a.length} and ${b.length}`);
  }
  if (a.length < 2) throw new Error("rank correlation needs at least two observations");
  const ranksA = averageRanks(a);
  const ranksB = averageRanks(b);
  const meanA = mean(ranksA);
  const meanB = mean(ranksB);
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (const [index, rankA] of ranksA.entries()) {
    const deltaA = rankA - meanA;
    const deltaB = at(ranksB, index, "rank B") - meanB;
    covariance += deltaA * deltaB;
    varianceA += deltaA ** 2;
    varianceB += deltaB ** 2;
  }
  if (varianceA === 0 || varianceB === 0) {
    throw new Error("rank correlation is undefined for a constant array");
  }
  return covariance / Math.sqrt(varianceA * varianceB);
};
