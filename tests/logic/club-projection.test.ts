import { describe, expect, it } from "vitest";

import { CLUBS, ratingForClubId } from "../../src/data/clubs";
import { initialEuropeanBerth } from "../../src/data/european-berths-2026";
import {
  KOSZTY_STALE,
  INITIAL_BUDGET_SHARE,
  USEFUL_UPGRADE_OVR_DELTA,
  leaguePositionPrize,
} from "../../src/data/balance";
import { europeanExpectedIncome } from "../../src/logic/european-cups";
import { scaledRecurringRevenue, transferBudgetChange } from "../../src/logic/finance-scale";
import { clubOvr } from "../../src/logic/league-ratings";
import { expectedSquadPayroll } from "../../src/logic/squad-cost";
import { initialClubProjection } from "../../src/logic/league-projection";
import { openingBudgetComponents } from "../../src/logic/opening-budget-model";
import {
  structuralPurchasingPower,
  structuralPurchasingPowerFrom,
} from "../../src/logic/opening-budget";
import { tenureHandicapFor, legacyHandicapFor } from "../../src/logic/career-baseline";
import {
  advantageScoreFor,
  projectedSeasonBalance,
  projectedTransferBudgetChange,
  projectedTransferBudgetChangeWithCups,
  projectedWageShare,
} from "../../src/logic/club-projection";

const BOARD_REINVESTMENT_RATE = 0.3;

describe("projectedSeasonBalance", () => {
  it("reproduces revenue - payroll - KOSZTY_STALE for every club", () => {
    for (const club of CLUBS) {
      const projection = initialClubProjection(club.clubId);
      const revenue =
        scaledRecurringRevenue(club.clubId) + leaguePositionPrize(projection.expectedPlace);
      const payroll = expectedSquadPayroll(ratingForClubId(club.clubId));
      expect(projectedSeasonBalance(club.clubId), club.clubId).toBeCloseTo(
        revenue - payroll - KOSZTY_STALE,
        10
      );
    }
  });
});

describe("projectedTransferBudgetChange", () => {
  it("is the season balance times BOARD_REINVESTMENT_RATE", () => {
    for (const club of CLUBS) {
      expect(projectedTransferBudgetChange(club.clubId), club.clubId).toBeCloseTo(
        projectedSeasonBalance(club.clubId) * BOARD_REINVESTMENT_RATE,
        10
      );
    }
  });
});

describe("projectedWageShare", () => {
  it("is expected payroll over projected revenue", () => {
    for (const club of CLUBS) {
      const projection = initialClubProjection(club.clubId);
      const revenue =
        scaledRecurringRevenue(club.clubId) + leaguePositionPrize(projection.expectedPlace);
      const payroll = expectedSquadPayroll(ratingForClubId(club.clubId));
      expect(projectedWageShare(club.clubId), club.clubId).toBeCloseTo(payroll / revenue, 10);
    }
  });
});

describe("advantageScoreFor", () => {
  it("is finite and deterministic for every club", () => {
    for (const club of CLUBS) {
      const score = advantageScoreFor(club.clubId);
      expect(Number.isFinite(score), club.clubId).toBe(true);
      expect(advantageScoreFor(club.clubId), club.clubId).toBe(score);
    }
  });

  it("is the sum of the sport and finance z-scores against the full league", () => {
    const points = CLUBS.map((club) => initialClubProjection(club.clubId).expectedSeasonPoints);
    const purchasingPowers = CLUBS.map((club) =>
      structuralPurchasingPower({
        clubId: club.clubId,
        projectedOperatingBalanceWithoutTransfersAndCups: projectedSeasonBalance(club.clubId),
      })
    );
    const quantile = (sorted: readonly number[], p: number): number => {
      const position = (sorted.length - 1) * p;
      const lo = Math.floor(position);
      const hi = Math.ceil(position);
      return lo === hi ? sorted[lo]! : sorted[lo]! + (position - lo) * (sorted[hi]! - sorted[lo]!);
    };
    const stats = (values: readonly number[]): { median: number; iqr: number } => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        median: quantile(sorted, 0.5),
        iqr: quantile(sorted, 0.75) - quantile(sorted, 0.25),
      };
    };
    const sportStats = stats(points);
    const financeStats = stats(purchasingPowers);

    CLUBS.forEach((club, index) => {
      const sportZ =
        sportStats.iqr === 0 ? 0 : (points[index]! - sportStats.median) / sportStats.iqr;
      const financeZ =
        financeStats.iqr === 0
          ? 0
          : (purchasingPowers[index]! - financeStats.median) / financeStats.iqr;
      expect(advantageScoreFor(club.clubId), club.clubId).toBeCloseTo(sportZ + financeZ, 10);
    });
  });

  it("gives two clubs of equal revenue and backing the same structural purchasing power even though their squads differ, while their opening budgets differ", () => {
    // Lech's rating is the strongest in the league, Wisła Płock's the
    // weakest, so pricing them under an IDENTICAL synthetic revenue and
    // backing isolates the one thing that can still differ: the cost of a
    // useful upgrade, which is a function of the club's own squad quality.
    // structuralPurchasingPower must not see that difference; openingBudget
    // must.
    const shared = {
      scaledRecurringRevenue: 2,
      budgetShare: INITIAL_BUDGET_SHARE,
      usefulUpgradeOvrDelta: USEFUL_UPGRADE_OVR_DELTA,
      backerSupportFloor: null,
    } as const;
    const strong = openingBudgetComponents({ clubId: "lech-poznan", ...shared });
    const weak = openingBudgetComponents({ clubId: "wisla-plock", ...shared });

    // Sanity check: the two clubs' squads really do price differently.
    expect(strong.usefulPurchaseCost).not.toBeCloseTo(weak.usefulPurchaseCost, 2);

    const strongStructural = structuralPurchasingPowerFrom({
      shareBudget: strong.shareBudget,
      backerSupportFloor: strong.backerSupportFloor,
      projectedOperatingBalanceWithoutTransfersAndCups: 0,
    });
    const weakStructural = structuralPurchasingPowerFrom({
      shareBudget: weak.shareBudget,
      backerSupportFloor: weak.backerSupportFloor,
      projectedOperatingBalanceWithoutTransfersAndCups: 0,
    });
    expect(strongStructural).toBeCloseTo(weakStructural, 12);
    expect(strong.initialBudget).not.toBeCloseTo(weak.initialBudget, 2);
  });
});

describe("projectedTransferBudgetChangeWithCups", () => {
  const BERTH_CLUB_IDS = [
    "lech-poznan",
    "gornik-zabrze",
    "jagiellonia-bialystok",
    "rakow-czestochowa",
    "gks-katowice",
  ];

  it("equals the cup-free change plus the board's share of expected cup income, for every club with a season-1 berth", () => {
    for (const clubId of BERTH_CLUB_IDS) {
      const berth = initialEuropeanBerth(clubId)!;
      const strength = clubOvr(ratingForClubId(clubId));
      const cupIncome = europeanExpectedIncome(berth.cup, strength);
      const expected = projectedTransferBudgetChange(clubId) + transferBudgetChange(cupIncome);
      expect(projectedTransferBudgetChangeWithCups(clubId), clubId).toBeCloseTo(expected, 10);
      // The board's share is applied through the exact same helper the
      // cup-free figure uses - never a second, ad hoc multiplication by
      // BOARD_REINVESTMENT_RATE.
      expect(transferBudgetChange(cupIncome)).toBeCloseTo(cupIncome * BOARD_REINVESTMENT_RATE, 10);
    }
  });

  it("equals the cup-free projectedTransferBudgetChange for every club without a season-1 berth", () => {
    for (const club of CLUBS) {
      if (BERTH_CLUB_IDS.includes(club.clubId)) continue;
      expect(initialEuropeanBerth(club.clubId)).toBeNull();
      expect(projectedTransferBudgetChangeWithCups(club.clubId), club.clubId).toBeCloseTo(
        projectedTransferBudgetChange(club.clubId),
        12
      );
    }
  });

  it("matches the task's own worked example for Lech: +1.83 with cups, +0.78 without", () => {
    const withCups = projectedTransferBudgetChangeWithCups("lech-poznan");
    const cupFree = projectedTransferBudgetChange("lech-poznan");
    expect(withCups).toBeGreaterThan(cupFree);
    expect(Number(withCups.toFixed(2))).toBeCloseTo(1.83, 2);
    expect(Number(cupFree.toFixed(2))).toBeCloseTo(0.78, 2);
  });

  it("never feeds projectedSeasonBalance, structuralPurchasingPower or advantageScoreFor - the handicap path stays on the cup-free figure", () => {
    // Pinned regression values for the handicap path, computed independently
    // of anything this change touches. If this change (or a future one)
    // silently folds cup income into the handicap path, these numbers move.
    const cases: readonly [string, number, number, number, number, number][] = [
      ["lech-poznan", 2.591349235224176, 2.0769566839406375, 4.374655560325331, 0, 0],
      ["gks-katowice", -0.874703849431185, 0.0782876909174478, -0.8978966178267735, 110, 130],
      ["wisla-plock", -1.692763723126088, -0.3208146650949353, -1.725408540847744, 110, 130],
    ];
    for (const [clubId, balance, spp, adv, tenure, legacy] of cases) {
      expect(projectedSeasonBalance(clubId), clubId).toBeCloseTo(balance, 6);
      const structural = structuralPurchasingPower({
        clubId,
        projectedOperatingBalanceWithoutTransfersAndCups: projectedSeasonBalance(clubId),
      });
      expect(structural, clubId).toBeCloseTo(spp, 6);
      const score = advantageScoreFor(clubId);
      expect(score, clubId).toBeCloseTo(adv, 6);
      expect(tenureHandicapFor(score), clubId).toBeCloseTo(tenure, 6);
      expect(legacyHandicapFor(score), clubId).toBeCloseTo(legacy, 6);
    }
  });
});
