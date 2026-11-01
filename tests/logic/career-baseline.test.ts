import { describe, expect, it } from "vitest";

import { CAREER_HANDICAP_ANCHORS } from "../../src/data/career-handicap-anchors";
import { initialEuropeanBerth } from "../../src/data/european-berths-2026";
import { CLUBS } from "../../src/data/clubs";
import { advantageScoreFor } from "../../src/logic/club-projection";
import { initialClubProjection } from "../../src/logic/league-projection";
import {
  buildCareerBaseline,
  legacyHandicapFor,
  tenureHandicapFor,
} from "../../src/logic/career-baseline";

const [latwy, sredni, trudny] = CAREER_HANDICAP_ANCHORS;

describe("tenureHandicapFor / legacyHandicapFor", () => {
  it("pin all three anchor pairs exactly", () => {
    expect(tenureHandicapFor(latwy!.advantageScore)).toBe(0);
    expect(legacyHandicapFor(latwy!.advantageScore)).toBe(0);
    expect(tenureHandicapFor(sredni!.advantageScore)).toBe(55);
    expect(legacyHandicapFor(sredni!.advantageScore)).toBe(85);
    expect(tenureHandicapFor(trudny!.advantageScore)).toBe(110);
    expect(legacyHandicapFor(trudny!.advantageScore)).toBe(130);
  });

  it("is monotonic: a higher advantageScore never gives a higher handicap", () => {
    const samples = [
      10,
      latwy!.advantageScore,
      2,
      sredni!.advantageScore,
      0,
      trudny!.advantageScore,
      -10,
    ];
    for (let i = 1; i < samples.length; i += 1) {
      const higherScore = Math.max(samples[i - 1]!, samples[i]!);
      const lowerScore = Math.min(samples[i - 1]!, samples[i]!);
      expect(tenureHandicapFor(higherScore)).toBeLessThanOrEqual(tenureHandicapFor(lowerScore));
      expect(legacyHandicapFor(higherScore)).toBeLessThanOrEqual(legacyHandicapFor(lowerScore));
    }
  });

  it("interpolates linearly at the midpoint of the latwy-sredni segment", () => {
    const midpoint = (latwy!.advantageScore + sredni!.advantageScore) / 2;
    expect(tenureHandicapFor(midpoint)).toBeCloseTo((0 + 55) / 2, 10);
    expect(legacyHandicapFor(midpoint)).toBeCloseTo((0 + 85) / 2, 10);
  });

  it("interpolates linearly at the midpoint of the sredni-trudny segment", () => {
    const midpoint = (sredni!.advantageScore + trudny!.advantageScore) / 2;
    expect(tenureHandicapFor(midpoint)).toBeCloseTo((55 + 110) / 2, 10);
    expect(legacyHandicapFor(midpoint)).toBeCloseTo((85 + 130) / 2, 10);
  });

  it("is constant above the strongest anchor", () => {
    expect(tenureHandicapFor(latwy!.advantageScore + 100)).toBe(0);
    expect(legacyHandicapFor(latwy!.advantageScore + 100)).toBe(0);
  });

  it("is constant below the weakest anchor", () => {
    expect(tenureHandicapFor(trudny!.advantageScore - 100)).toBe(110);
    expect(legacyHandicapFor(trudny!.advantageScore - 100)).toBe(130);
  });
});

describe("buildCareerBaseline", () => {
  it("pins the club, its points, both handicaps and its cup - and no expected place", () => {
    for (const club of CLUBS) {
      const baseline = buildCareerBaseline(club.clubId);
      expect(baseline.clubId).toBe(club.clubId);
      expect(baseline.baselineExpectedSeasonPoints).toBe(
        initialClubProjection(club.clubId).expectedSeasonPoints
      );
      const score = advantageScoreFor(club.clubId);
      expect(baseline.advantageScore).toBe(score);
      expect(baseline.tenureHandicap).toBe(tenureHandicapFor(score));
      expect(baseline.legacyHandicap).toBe(legacyHandicapFor(score));
      expect(baseline.initialEuropeanCup).toBe(initialEuropeanBerth(club.clubId)?.cup ?? null);
      expect(baseline).not.toHaveProperty("baselineExpectedPlace");
      expect(baseline).not.toHaveProperty("expectedPlace");
    }
  });

  it("is deterministic across repeated calls for the same club", () => {
    for (const club of CLUBS) {
      expect(buildCareerBaseline(club.clubId)).toEqual(buildCareerBaseline(club.clubId));
    }
  });
});
