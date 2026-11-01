import { describe, expect, test } from "vitest";

import {
  distribution,
  max,
  mean,
  median,
  min,
  pairedComparison,
  percent,
  quantile,
  sampleStandardDeviation,
  standardError,
  spearmanRankCorrelation,
  summarize,
  wilsonInterval,
} from "../../scripts/stats";

describe("quantile", () => {
  test("median of an odd-length array is the middle value", () => {
    expect(quantile([1, 3, 2], 0.5)).toBe(2);
  });

  test("median of an even-length array interpolates the two middle values", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  test("p0 is the minimum and p1 is the maximum", () => {
    const values = [5, 1, 9, 3];
    expect(quantile(values, 0)).toBe(1);
    expect(quantile(values, 1)).toBe(9);
  });

  test("does not mutate the input array", () => {
    const values = [3, 1, 2];
    quantile(values, 0.5);
    expect(values).toEqual([3, 1, 2]);
  });

  test("throws on an empty array", () => {
    expect(() => quantile([], 0.5)).toThrow();
  });

  test("throws on p outside [0, 1]", () => {
    expect(() => quantile([1, 2], 1.5)).toThrow();
  });

  test("matches a known percentile by hand for a 5-element set", () => {
    // sorted: [10, 20, 30, 40, 50], p25 index = 0.25 * 4 = 1 -> 20
    expect(quantile([50, 10, 30, 20, 40], 0.25)).toBe(20);
  });
});

describe("median/mean/min/max", () => {
  test("median matches quantile(0.5)", () => {
    expect(median([4, 1, 7, 2])).toBe(quantile([4, 1, 7, 2], 0.5));
  });

  test("mean of a known set", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  test("min and max of a known set", () => {
    expect(min([3, -1, 4, 1, 5])).toBe(-1);
    expect(max([3, -1, 4, 1, 5])).toBe(5);
  });
});

describe("percent", () => {
  test("computes a normal ratio", () => {
    expect(percent(3, 12)).toBe(25);
  });

  test("returns 0 for a zero total instead of NaN", () => {
    expect(percent(0, 0)).toBe(0);
  });
});

describe("summarize", () => {
  test("returns all six figures consistent with the individual helpers", () => {
    const values = [10, 20, 30, 40, 50];
    const s = summarize(values);
    expect(s.min).toBe(10);
    expect(s.max).toBe(50);
    expect(s.median).toBe(30);
    expect(s.mean).toBe(30);
    expect(s.p25).toBe(quantile(values, 0.25));
    expect(s.p75).toBe(quantile(values, 0.75));
  });
});

describe("distribution", () => {
  test("counts occurrences without assuming the category set up front", () => {
    expect(distribution(["a", "b", "a", "c", "a"])).toEqual({ a: 3, b: 1, c: 1 });
  });

  test("returns an empty object for an empty array", () => {
    expect(distribution([])).toEqual({});
  });
});

describe("pairedComparison", () => {
  test("positive medianDiff and winRate when b consistently beats a", () => {
    const a = [10, 20, 30];
    const b = [15, 25, 35];
    const result = pairedComparison(a, b);
    expect(result.medianDiff).toBe(5);
    expect(result.winRate).toBe(100);
  });

  test("negative medianDiff and 0 winRate when b consistently loses to a", () => {
    const a = [10, 20, 30];
    const b = [5, 15, 25];
    const result = pairedComparison(a, b);
    expect(result.medianDiff).toBe(-5);
    expect(result.winRate).toBe(0);
  });

  test("mixed results give a partial win rate", () => {
    const a = [10, 10, 10, 10];
    const b = [20, 5, 20, 5];
    const result = pairedComparison(a, b);
    expect(result.winRate).toBe(50);
  });

  test("throws on mismatched lengths", () => {
    expect(() => pairedComparison([1, 2], [1])).toThrow();
  });

  test("throws on empty arrays", () => {
    expect(() => pairedComparison([], [])).toThrow();
  });
});

describe("uncertainty helpers", () => {
  test("uses sample standard deviation and the corresponding standard error", () => {
    expect(sampleStandardDeviation([1, 2, 3])).toBe(1);
    expect(standardError([1, 2, 3])).toBeCloseTo(1 / Math.sqrt(3), 12);
  });

  test("reports zero spread for a one-value sample", () => {
    expect(sampleStandardDeviation([7])).toBe(0);
    expect(standardError([7])).toBe(0);
  });

  test("Wilson interval keeps zero-event samples visibly uncertain", () => {
    const zSquared = 1.96 ** 2;
    expect(wilsonInterval(0, 5).upper).toBeCloseTo(zSquared / (5 + zSquared), 12);
    expect(wilsonInterval(0, 15).upper).toBeCloseTo(zSquared / (15 + zSquared), 12);
    expect(wilsonInterval(5, 5).lower).toBeCloseTo(1 - zSquared / (5 + zSquared), 12);
  });
});

describe("spearmanRankCorrelation", () => {
  test("is minus one for exactly reversed ranks", () => {
    expect(spearmanRankCorrelation([1, 2, 3, 4], [4, 3, 2, 1])).toBe(-1);
  });

  test("uses average ranks for ties", () => {
    expect(spearmanRankCorrelation([1, 1, 2], [1, 2, 3])).toBeCloseTo(Math.sqrt(3) / 2, 12);
  });

  test("rejects arrays that cannot define a correlation", () => {
    expect(() => spearmanRankCorrelation([1], [1])).toThrow(/two/i);
    expect(() => spearmanRankCorrelation([1, 2], [1])).toThrow(/equal length/i);
    expect(() => spearmanRankCorrelation([1, 1], [2, 2])).toThrow(/constant/i);
  });
});
