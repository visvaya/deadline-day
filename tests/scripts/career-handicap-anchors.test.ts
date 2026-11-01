import { describe, expect, it } from "vitest";

import {
  buildCareerHandicapAnchors,
  renderCareerHandicapAnchorsFile,
  type ClubAdvantageInputs,
} from "../../scripts/career-handicap-anchors";

/**
 * A small, hand-built fixture rather than the real eighteen-club economy:
 * three pools of two clubs each, with round numbers chosen so the median and
 * IQR of each pool are easy to verify by hand.
 */
const FIXTURE_POOLS = {
  latwy: ["strong-a", "strong-b"],
  sredni: ["mid-a", "mid-b"],
  trudny: ["weak-a", "weak-b"],
} as const;

const FIXTURE_INPUTS: Record<string, ClubAdvantageInputs> = {
  "strong-a": { advantageScore: 4, expectedSeasonPoints: 60, structuralPurchasingPower: 3 },
  "strong-b": { advantageScore: 6, expectedSeasonPoints: 64, structuralPurchasingPower: 5 },
  "mid-a": { advantageScore: 0, expectedSeasonPoints: 45, structuralPurchasingPower: 1 },
  "mid-b": { advantageScore: 1, expectedSeasonPoints: 47, structuralPurchasingPower: 1.4 },
  "weak-a": { advantageScore: -3, expectedSeasonPoints: 38, structuralPurchasingPower: -0.5 },
  "weak-b": { advantageScore: -5, expectedSeasonPoints: 35, structuralPurchasingPower: -0.9 },
};

const fixtureClubInputs = (clubId: string): ClubAdvantageInputs => {
  const found = FIXTURE_INPUTS[clubId];
  if (!found) throw new Error(`fixtureClubInputs: unknown club id "${clubId}"`);
  return found;
};

describe("buildCareerHandicapAnchors", () => {
  it("computes the median advantageScore, points and purchasing power per pool", () => {
    const anchors = buildCareerHandicapAnchors({
      pools: FIXTURE_POOLS,
      clubInputs: fixtureClubInputs,
    });
    const latwy = anchors.find((row) => row.pool === "latwy")!;
    expect(latwy.advantageScore).toBe(5); // median(4, 6)
    expect(latwy.advantageScoreIqr).toBe(1); // (6-4)/2 spread on a 2-point sample
    expect(latwy.pointsMedian).toBe(62);
    expect(latwy.purchasingPowerMedian).toBe(4);
    expect(latwy.clubCount).toBe(2);

    const sredni = anchors.find((row) => row.pool === "sredni")!;
    expect(sredni.advantageScore).toBe(0.5);
    expect(sredni.pointsMedian).toBe(46);

    const trudny = anchors.find((row) => row.pool === "trudny")!;
    expect(trudny.advantageScore).toBe(-4);
    expect(trudny.pointsMedian).toBe(36.5);
  });

  it("preserves the frozen handicap levels, never recomputing them", () => {
    const anchors = buildCareerHandicapAnchors({
      pools: FIXTURE_POOLS,
      clubInputs: fixtureClubInputs,
    });
    expect(anchors.find((row) => row.pool === "latwy")).toMatchObject({
      tenureHandicap: 0,
      legacyHandicap: 0,
    });
    expect(anchors.find((row) => row.pool === "sredni")).toMatchObject({
      tenureHandicap: 55,
      legacyHandicap: 85,
    });
    expect(anchors.find((row) => row.pool === "trudny")).toMatchObject({
      tenureHandicap: 110,
      legacyHandicap: 130,
    });
  });

  it("orders the anchors from the greatest advantage to the least", () => {
    const anchors = buildCareerHandicapAnchors({
      pools: FIXTURE_POOLS,
      clubInputs: fixtureClubInputs,
    });
    expect(anchors.map((row) => row.pool)).toEqual(["latwy", "sredni", "trudny"]);
    for (let i = 1; i < anchors.length; i += 1) {
      expect(anchors[i - 1]!.advantageScore).toBeGreaterThan(anchors[i]!.advantageScore);
    }
  });

  it("throws when a pool names a club the input has never heard of", () => {
    const brokenPools = { ...FIXTURE_POOLS, trudny: ["weak-a", "nonexistent-club"] };
    expect(() =>
      buildCareerHandicapAnchors({ pools: brokenPools, clubInputs: fixtureClubInputs })
    ).toThrow(/unknown club id/);
  });

  it("throws when a pool is empty", () => {
    const brokenPools = { ...FIXTURE_POOLS, sredni: [] };
    expect(() =>
      buildCareerHandicapAnchors({ pools: brokenPools, clubInputs: fixtureClubInputs })
    ).toThrow(/no clubs/);
  });
});

describe("renderCareerHandicapAnchorsFile", () => {
  it("is byte-for-byte deterministic across repeated renders of the same anchors", () => {
    const anchors = buildCareerHandicapAnchors({
      pools: FIXTURE_POOLS,
      clubInputs: fixtureClubInputs,
    });
    const first = renderCareerHandicapAnchorsFile({ anchors, sourceSha256: "deadbeef" });
    const second = renderCareerHandicapAnchorsFile({ anchors, sourceSha256: "deadbeef" });
    expect(first).toBe(second);
  });

  it("carries the source SHA-256 and every anchor's full-precision fields", () => {
    const anchors = buildCareerHandicapAnchors({
      pools: FIXTURE_POOLS,
      clubInputs: fixtureClubInputs,
    });
    const rendered = renderCareerHandicapAnchorsFile({ anchors, sourceSha256: "abc123" });
    expect(rendered).toContain("CAREER_HANDICAP_ANCHORS_SOURCE_SHA256 =");
    expect(rendered).toContain('"abc123"');
    expect(rendered).toContain("tenureHandicap: 0");
    expect(rendered).toContain("tenureHandicap: 55");
    expect(rendered).toContain("tenureHandicap: 110");
    expect(rendered).toContain("advantageScore: 5");
    expect(rendered).toContain("advantageScore: 0.5");
    expect(rendered).toContain("advantageScore: -4");
    expect(rendered).toMatch(/preserved across the club-choice redesign/);
  });

  it("is parseable TypeScript with the expected exported shape", () => {
    const anchors = buildCareerHandicapAnchors({
      pools: FIXTURE_POOLS,
      clubInputs: fixtureClubInputs,
    });
    const rendered = renderCareerHandicapAnchorsFile({ anchors, sourceSha256: "abc123" });
    expect(rendered).toContain("export type CareerHandicapPool");
    expect(rendered).toContain("export const CAREER_HANDICAP_ANCHORS:");
    expect(rendered.trim().endsWith("];")).toBe(true);
  });
});
