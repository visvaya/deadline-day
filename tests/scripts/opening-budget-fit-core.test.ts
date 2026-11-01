import { describe, expect, it } from "vitest";

import { MIN_INITIAL_BUDGET } from "../../src/data/balance";
import { CLUBS } from "../../src/data/clubs";
import { representativeUsefulPurchaseCost } from "../../src/logic/opening-budget-model";
import {
  BACKER_SUPPORT_TIERS,
  FIT_CLUB_IDS,
  backerSupportFloorFor,
  backerSupportTier,
  candidateShareBudgets,
  quantile,
  bindingComponents,
  clubOpeningBudget,
  shortNameForClubId,
  type OpeningBudgetCandidate,
} from "../../scripts/opening-budget-fit-core";

const candidate = (over: Partial<OpeningBudgetCandidate> = {}): OpeningBudgetCandidate => ({
  budgetShare: 0.18,
  usefulUpgradeOvrDelta: 0,
  boardReinvestmentRate: 0.5,
  strongBackerPercentile: 0.9,
  activeBackerPercentile: 0.75,
  ...over,
});

describe("the fit's club domain", () => {
  it("is all eighteen clubs, in the order CLUBS declares them", () => {
    expect(FIT_CLUB_IDS).toEqual(CLUBS.map((club) => club.clubId));
    expect(FIT_CLUB_IDS).toHaveLength(18);
  });

  it("names a club by its short name, and throws on an id it does not know", () => {
    expect(shortNameForClubId("wisla-krakow")).toBe("Wisła K.");
    expect(() => shortNameForClubId("nie-ma")).toThrow(/Unknown club id/);
  });
});

describe("clubOpeningBudget", () => {
  it("takes the cost from the model rather than restating it", () => {
    for (const clubId of FIT_CLUB_IDS) {
      const out = clubOpeningBudget({ clubId, candidate: candidate(), backerSupportFloor: null });
      expect(out.usefulPurchaseCost, clubId).toBe(representativeUsefulPurchaseCost(clubId, 0));
      expect(out.absoluteFloor).toBe(MIN_INITIAL_BUDGET);
      expect(out.initialBudget, clubId).toBe(
        Math.max(out.absoluteFloor, out.shareBudget, out.usefulPurchaseCost)
      );
    }
  });

  it("carries the delta through to the cost", () => {
    const flat = clubOpeningBudget({
      clubId: "legia-warszawa",
      candidate: candidate({ usefulUpgradeOvrDelta: 0 }),
      backerSupportFloor: null,
    });
    const raised = clubOpeningBudget({
      clubId: "legia-warszawa",
      candidate: candidate({ usefulUpgradeOvrDelta: 2 }),
      backerSupportFloor: null,
    });
    expect(raised.usefulPurchaseCost).toBeGreaterThan(flat.usefulPurchaseCost);
  });

  it("keeps a backer floor that does not bind visible in the row", () => {
    const out = clubOpeningBudget({
      clubId: "legia-warszawa",
      candidate: candidate(),
      backerSupportFloor: 0.1,
    });
    expect(out.backerSupportFloor).toBe(0.1);
    expect(out.initialBudget).toBeGreaterThan(0.1);
    expect(bindingComponents(out)).not.toContain("backerSupportFloor");
  });
});

describe("bindingComponents", () => {
  it("reports every component that reaches the maximum, not just one", () => {
    const tied = clubOpeningBudget({
      clubId: "wisla-plock",
      candidate: candidate(),
      backerSupportFloor: MIN_INITIAL_BUDGET,
    });
    expect(tied.initialBudget).toBe(MIN_INITIAL_BUDGET);
    expect([...bindingComponents(tied)].sort()).toEqual(["absoluteFloor", "backerSupportFloor"]);
  });

  it("never reports a null backer floor", () => {
    for (const clubId of FIT_CLUB_IDS) {
      const out = clubOpeningBudget({ clubId, candidate: candidate(), backerSupportFloor: null });
      expect(bindingComponents(out), clubId).not.toContain("backerSupportFloor");
      expect(bindingComponents(out).length, clubId).toBeGreaterThan(0);
    }
  });
});

describe("backer-support tiers", () => {
  it("covers all eighteen clubs and nothing else", () => {
    expect(Object.keys(BACKER_SUPPORT_TIERS).sort()).toEqual([...FIT_CLUB_IDS].sort());
  });

  it("is exactly the four clubs the source document admits", () => {
    // docs/decisions/club-owner-finance-context-2026-09-11.md. Widzew and
    // Wieczysta are `strong`, Korona `active`, Motor the documented
    // `restrained` control. A recapitalisation for liquidity, a rescue from
    // insolvency, a change of owner and a sponsorship already inside recurring
    // revenue are none of them grounds for a floor.
    const byTier = (tier: string): string[] =>
      FIT_CLUB_IDS.filter((clubId) => backerSupportTier(clubId) === tier).sort();
    expect(byTier("strong")).toEqual(["widzew-lodz", "wieczysta-krakow"]);
    expect(byTier("active")).toEqual(["korona-kielce"]);
    expect(byTier("restrained")).toEqual(["motor-lublin"]);
    expect(byTier("none")).toHaveLength(14);
  });

  it("keeps restrained and none apart even though both give null", () => {
    const cand = candidate();
    expect(backerSupportTier("motor-lublin")).toBe("restrained");
    expect(backerSupportTier("slask-wroclaw")).toBe("none");
    expect(backerSupportFloorFor("motor-lublin", cand)).toBeNull();
    expect(backerSupportFloorFor("slask-wroclaw", cand)).toBeNull();
  });

  it("throws on a club it has no tier for", () => {
    expect(() => backerSupportTier("nie-ma")).toThrow(/No backer-support tier/);
  });
});

describe("candidateShareBudgets and quantile", () => {
  it("returns all eighteen shares, ascending", () => {
    const sorted = candidateShareBudgets(0.18);
    expect(sorted).toHaveLength(18);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]).toBeGreaterThanOrEqual(sorted[i - 1]!);
    }
  });

  it("interpolates rather than rounding onto a neighbour", () => {
    // (n-1)*p = 17 * 0.75 = 12.75, so the answer must sit three quarters of
    // the way between the 13th and 14th club - never on either of them.
    const sorted = candidateShareBudgets(0.18);
    const q = quantile(sorted, 0.75);
    expect(q).toBeGreaterThan(sorted[12]!);
    expect(q).toBeLessThan(sorted[13]!);
    expect(q).toBeCloseTo(sorted[12]! + 0.75 * (sorted[13]! - sorted[12]!), 12);
  });

  it("lands on a club exactly when the position is an integer", () => {
    const sorted = candidateShareBudgets(0.18);
    // 17 * 0.5 = 8.5 is not integral; 17 * 1 = 17 is.
    expect(quantile(sorted, 1)).toBe(sorted[17]);
    expect(quantile(sorted, 0)).toBe(sorted[0]);
  });

  it("scales with the share, because every share budget does", () => {
    for (const p of [0.75, 0.8, 0.9, 0.95]) {
      expect(quantile(candidateShareBudgets(0.36), p)).toBeCloseTo(
        2 * quantile(candidateShareBudgets(0.18), p),
        12
      );
    }
  });

  it("rejects an empty sample and a percentile outside [0, 1]", () => {
    expect(() => quantile([], 0.5)).toThrow(/empty/);
    expect(() => quantile([1, 2], 1.5)).toThrow(/out of range/);
    expect(() => quantile([1, 2], Number.NaN)).toThrow(/out of range/);
  });
});

describe("backerSupportFloorFor", () => {
  it("pins the floor of both tiers at the baseline share", () => {
    const cand = candidate({ budgetShare: 0.18 });
    expect(backerSupportFloorFor("widzew-lodz", cand)).toBeCloseTo(0.905899138098, 11);
    expect(backerSupportFloorFor("wieczysta-krakow", cand)).toBeCloseTo(0.905899138098, 11);
    expect(backerSupportFloorFor("korona-kielce", cand)).toBeCloseTo(0.621955011994, 11);
  });

  it("reads the strong percentile for strong and the active one for active", () => {
    const low = candidate({ strongBackerPercentile: 0.9, activeBackerPercentile: 0.75 });
    const high = candidate({ strongBackerPercentile: 0.95, activeBackerPercentile: 0.8 });
    expect(backerSupportFloorFor("widzew-lodz", high)).toBeGreaterThan(
      backerSupportFloorFor("widzew-lodz", low) ?? 0
    );
    expect(backerSupportFloorFor("korona-kielce", high)).toBeGreaterThan(
      backerSupportFloorFor("korona-kielce", low) ?? 0
    );
    // The active tier never outranks the strong one at any combination the
    // grid allows.
    for (const cand of [low, high]) {
      expect(backerSupportFloorFor("korona-kielce", cand)).toBeLessThan(
        backerSupportFloorFor("widzew-lodz", cand) ?? 0
      );
    }
  });

  it("is null for every club that is not strong or active", () => {
    const cand = candidate();
    for (const clubId of FIT_CLUB_IDS) {
      const tier = backerSupportTier(clubId);
      const floor = backerSupportFloorFor(clubId, cand);
      if (tier === "strong" || tier === "active") expect(floor, clubId).not.toBeNull();
      else expect(floor, clubId).toBeNull();
    }
  });
});
