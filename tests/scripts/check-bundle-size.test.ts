import { expect, test } from "vitest";

import { findBundleSizeProblems } from "../../scripts/check-bundle-size.mjs";

const BUDGETS = { jsGzipBytesBudget: 100, cssGzipBytesBudget: 10 };

test("sizes under budget report no problems", () => {
  expect(findBundleSizeProblems({ jsGzipBytes: 99, cssGzipBytes: 9 }, BUDGETS)).toEqual([]);
});

test("JS over budget is reported", () => {
  const problems = findBundleSizeProblems({ jsGzipBytes: 101, cssGzipBytes: 9 }, BUDGETS);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/^JS bundle gzip size/);
});

test("CSS over budget is reported", () => {
  const problems = findBundleSizeProblems({ jsGzipBytes: 99, cssGzipBytes: 11 }, BUDGETS);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/^CSS bundle gzip size/);
});

test("both over budget report both", () => {
  const problems = findBundleSizeProblems({ jsGzipBytes: 101, cssGzipBytes: 11 }, BUDGETS);
  expect(problems).toHaveLength(2);
});
