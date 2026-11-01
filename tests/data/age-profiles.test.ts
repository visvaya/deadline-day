import { expect, test } from "vitest";

import { AGE_PROFILES } from "../../src/data/balance";
import type { PositionCode } from "../../src/data/types";

const RETIREMENT_AGE = 35;

const CODES: PositionCode[] = [
  "BR",
  "LO",
  "ŚO",
  "PO",
  "CLS",
  "CPS",
  "ŚPD",
  "ŚP",
  "LP",
  "PP",
  "ŚPO",
  "LS",
  "PS",
  "CN",
  "N",
  "POM",
  "ŚN",
];

test("every position code has an aging profile", () => {
  for (const code of CODES) expect(AGE_PROFILES[code], code).toBeDefined();
});

test("every profile peaks before it declines and declines before retirement", () => {
  for (const code of CODES) {
    const profile = AGE_PROFILES[code];
    expect(profile.peakStart, code).toBeLessThan(profile.peakEnd);
    expect(profile.peakEnd, code).toBeLessThan(RETIREMENT_AGE);
  }
});

/**
 * balance.ts sets these from a CAREER DECLINE BUDGET spread over the years
 * left before the age-35 cap, not from a per-year rate - getting that
 * backwards is the trap the first draft of the development model fell into,
 * where a winger hit 48 ovr at 34 while a keeper sat at 73. The total follows
 * the arithmetic series n*base + accel*n(n-1)/2, so it is checkable here.
 */
test("no career loses less than three or more than twenty-two ovr to age", () => {
  for (const code of CODES) {
    const { peakEnd, declineBase, declineAccel } = AGE_PROFILES[code];
    const years = RETIREMENT_AGE - peakEnd;
    const total = years * declineBase + (declineAccel * years * (years - 1)) / 2;
    expect(total, `${code}: ${total.toFixed(1)}`).toBeGreaterThanOrEqual(3);
    expect(total, `${code}: ${total.toFixed(1)}`).toBeLessThanOrEqual(22);
  }
});

test("the codes that replace an older one inherit a comparable career", () => {
  // ŚP replaces POM outright, so its curve must not quietly differ.
  expect(AGE_PROFILES["ŚP"]).toEqual(AGE_PROFILES.POM);
  // N replaces ŚN outright, so it must be identical, not merely similar.
  // A rename that quietly moved a curve would change behaviour while
  // reading like a rename in the diff.
  expect(AGE_PROFILES.N).toEqual(AGE_PROFILES["ŚN"]);
  // CN plays with his back to goal and leans on positioning, not pace, so
  // unlike N it ages past ŚN rather than sharing its curve.
  expect(AGE_PROFILES.CN.peakEnd).toBeGreaterThan(AGE_PROFILES["ŚN"].peakEnd);
});
