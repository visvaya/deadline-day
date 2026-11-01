import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AGE_PROFILES, MIN_INITIAL_BUDGET, PURCHASE_PRICE_CAP } from "../../src/data/balance";
import { CLUBS, ratingForClubId } from "../../src/data/clubs";
import { FORMACJE } from "../../src/data/positions";
import { scaledRecurringRevenue } from "../../src/logic/finance";
import {
  KUPNO_MEDIAN_PRICE_MULTIPLIER,
  NEUTRAL_MARKET_PRICE_MULTIPLIER,
  OPENING_BUDGET_CLUB_IDS,
  openingBudgetComponents,
  representativeUsefulPurchaseCost,
  usefulPurchaseSlotCosts,
} from "../../src/logic/opening-budget-model";
import { marketValue } from "../../src/logic/player";
import { formationTargetOvr } from "../../src/logic/squad-targets";
import { baseWage } from "../../src/logic/wages";

const DELTAS = [0, 1, 2] as const;

describe("representativeUsefulPurchaseCost", () => {
  it("is positive and finite for every club and every delta", () => {
    for (const club of CLUBS) {
      for (const delta of DELTAS) {
        const cost = representativeUsefulPurchaseCost(club.clubId, delta);
        expect(Number.isFinite(cost), `${club.clubId} d=${delta}`).toBe(true);
        expect(cost, `${club.clubId} d=${delta}`).toBeGreaterThan(0);
      }
    }
  });

  it("is deterministic - the same call twice gives the same bits", () => {
    for (const club of CLUBS) {
      for (const delta of DELTAS) {
        expect(representativeUsefulPurchaseCost(club.clubId, delta)).toBe(
          representativeUsefulPurchaseCost(club.clubId, delta)
        );
      }
    }
  });

  it("never falls as the useful upgrade gets bigger", () => {
    for (const club of CLUBS) {
      const [d0, d1, d2] = DELTAS.map((d) => representativeUsefulPurchaseCost(club.clubId, d));
      expect(d1, club.clubId).toBeGreaterThanOrEqual(d0!);
      expect(d2, club.clubId).toBeGreaterThanOrEqual(d1!);
    }
  });

  it("prices the eleven of all seven formations, bench excluded", () => {
    // Seven formations, eleven starters each. A bench slot sneaking in would
    // show up here before it showed up as a quietly cheaper median.
    for (const club of CLUBS) {
      expect(usefulPurchaseSlotCosts(club.clubId, 0), club.clubId).toHaveLength(7 * 11);
    }
  });

  it("throws on a club it does not know", () => {
    expect(() => representativeUsefulPurchaseCost("nie-ma-takiego-klubu", 0)).toThrow();
  });

  /**
   * Pinned outputs, all eighteen clubs at delta 0. Recomputing these is a
   * deliberate act: any change to the value curve, the wage curve, the age
   * profiles, the formation catalogue or the club ratings moves them, and each
   * of those is a decision that has to be argued for in a commit rather than
   * absorbed by a test that only checks the shape.
   */
  it("pins the measured cost of every club", () => {
    const expected: Record<string, number> = {
      "legia-warszawa": 1.175975721315,
      "lech-poznan": 1.343498583603,
      "rakow-czestochowa": 0.785476413694,
      "jagiellonia-bialystok": 0.599221252353,
      "pogon-szczecin": 0.599221252353,
      "gornik-zabrze": 0.899011753965,
      cracovia: 1.028520126994,
      "widzew-lodz": 1.175975721315,
      "slask-wroclaw": 0.267036397985,
      "piast-gliwice": 0.305243452148,
      "radomiak-radom": 0.233748282391,
      "korona-kielce": 0.599221252353,
      "motor-lublin": 0.457149731899,
      "zaglebie-lubin": 0.599221252353,
      "wisla-krakow": 0.305243452148,
      "wieczysta-krakow": 0.305243452148,
      "gks-katowice": 0.599221252353,
      "wisla-plock": 0.68609776002,
    };
    expect(Object.keys(expected).sort()).toEqual([...OPENING_BUDGET_CLUB_IDS].sort());
    for (const [clubId, value] of Object.entries(expected)) {
      expect(representativeUsefulPurchaseCost(clubId, 0), clubId).toBeCloseTo(value, 11);
    }
  });

  it("pins one slot computed by hand", () => {
    // Legia, 4-3-3, the goalkeeper. The target is the number formationTargetOvr
    // solves for; everything after it is the model's own arithmetic restated
    // here as literals.
    const target = formationTargetOvr(FORMACJE["4-3-3"], ratingForClubId("legia-warszawa")).get(
      "BR"
    );
    expect(target).toBeCloseTo(71.48593553168665, 10);
    expect(Math.round(target ?? 0)).toBe(71);
    expect(AGE_PROFILES.BR.peakStart).toBe(26);

    const byHand = marketValue(71, 26, "BR") * 1.2 + baseWage(71);
    expect(byHand).toBeCloseTo(1.343498583603, 11);
    // The sample the median is taken of really contains this slot.
    expect(
      usefulPurchaseSlotCosts("legia-warszawa", 0).some((cost) => Math.abs(cost - byHand) < 1e-12)
    ).toBe(true);
  });
});

describe("the price multiplier is the card's median, not the cash cap", () => {
  it("is the midpoint of the uniform KUPNO draw", () => {
    // offers.ts draws rand(rng, 0.9, 1.5); uniform, so median = midpoint.
    expect(KUPNO_MEDIAN_PRICE_MULTIPLIER).toBeCloseTo((0.9 + 1.5) / 2, 12);
    // The neutral market's own multiplier (`spokoj`) leaves the fee alone.
    expect(NEUTRAL_MARKET_PRICE_MULTIPLIER).toBe(1);
  });

  it("differs from PURCHASE_PRICE_CAP, so the substitution cannot pass unnoticed", () => {
    // PURCHASE_PRICE_CAP is a function of the cash the club already holds, so
    // using it here would size the budget from the budget - and spec 5 removes
    // the cap outright. The two numbers are close enough that swapping them
    // would look like a rounding choice rather than a change of definition.
    expect(PURCHASE_PRICE_CAP).not.toBe(KUPNO_MEDIAN_PRICE_MULTIPLIER);
    expect(PURCHASE_PRICE_CAP).toBeGreaterThan(KUPNO_MEDIAN_PRICE_MULTIPLIER);

    // Rebuild one pinned slot with the cap in place of the card's median. The
    // fee moves while the wage stays fixed; scaling the combined cost would
    // incorrectly scale the wage as well and would not prove the claim.
    const ovr = 71;
    const age = AGE_PROFILES.BR.peakStart;
    const withCardMedian =
      marketValue(ovr, age, "BR") * KUPNO_MEDIAN_PRICE_MULTIPLIER + baseWage(ovr);
    const withCashCap = marketValue(ovr, age, "BR") * PURCHASE_PRICE_CAP + baseWage(ovr);
    expect(withCashCap).toBeGreaterThan(withCardMedian);
  });

  it("reads no RNG", () => {
    const source = readFileSync("src/logic/opening-budget-model.ts", "utf8");
    expect(source).not.toMatch(/from "\.\/rng"/);
    expect(source).not.toMatch(/\bcreatePlayer\b/);
    expect(source).not.toMatch(/\bgenerateOffer\b/);
    expect(source).not.toMatch(/Math\.random/);
  });
});

describe("openingBudgetComponents", () => {
  const base = { budgetShare: 0.18, usefulUpgradeOvrDelta: 0 as const, backerSupportFloor: null };
  const forClub = (clubId: string) => ({
    ...base,
    clubId,
    scaledRecurringRevenue: scaledRecurringRevenue(clubId),
  });

  it("reports the share budget as revenue times the share", () => {
    for (const club of CLUBS) {
      const out = openingBudgetComponents(forClub(club.clubId));
      expect(out.shareBudget, club.clubId).toBeCloseTo(
        scaledRecurringRevenue(club.clubId) * 0.18,
        12
      );
      expect(out.absoluteFloor).toBe(MIN_INITIAL_BUDGET);
      expect(out.usefulPurchaseCost, club.clubId).toBe(
        representativeUsefulPurchaseCost(club.clubId, 0)
      );
    }
  });

  it("takes the maximum of the components that exist", () => {
    for (const club of CLUBS) {
      const out = openingBudgetComponents(forClub(club.clubId));
      expect(out.initialBudget, club.clubId).toBe(
        Math.max(out.absoluteFloor, out.shareBudget, out.usefulPurchaseCost)
      );
      expect(out.backerSupportFloor).toBeNull();
    }
  });

  it("lets a backer floor bind, and ignores one that is too small to", () => {
    const binding = openingBudgetComponents({
      ...forClub("wisla-plock"),
      backerSupportFloor: 99,
    });
    expect(binding.initialBudget).toBe(99);

    const idle = openingBudgetComponents({
      ...forClub("legia-warszawa"),
      backerSupportFloor: 0.01,
    });
    // Present but not binding - the case the report has to name explicitly
    // rather than round away.
    expect(idle.backerSupportFloor).toBe(0.01);
    expect(idle.initialBudget).toBeGreaterThan(0.01);
  });

  it("is never below the absolute floor", () => {
    for (const club of CLUBS) {
      for (const delta of DELTAS) {
        const out = openingBudgetComponents({
          ...forClub(club.clubId),
          usefulUpgradeOvrDelta: delta,
        });
        expect(out.initialBudget, club.clubId).toBeGreaterThanOrEqual(MIN_INITIAL_BUDGET);
      }
    }
  });

  it("rejects a share that is not a positive number, and a non-finite floor", () => {
    expect(() => openingBudgetComponents({ ...forClub("legia-warszawa"), budgetShare: 0 })).toThrow(
      /positive/
    );
    expect(() =>
      openingBudgetComponents({ ...forClub("legia-warszawa"), budgetShare: Number.NaN })
    ).toThrow(/positive/);
    expect(() =>
      openingBudgetComponents({
        ...forClub("legia-warszawa"),
        backerSupportFloor: Number.POSITIVE_INFINITY,
      })
    ).toThrow(/finite/);
  });

  it("rejects a revenue that is not a positive number", () => {
    // The revenue is an argument now, so a caller that forgot to scale it -
    // or handed over zloty by mistake - has to fail loudly rather than price
    // a budget off a nonsense base.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        openingBudgetComponents({ ...forClub("legia-warszawa"), scaledRecurringRevenue: bad })
      ).toThrow(/scaledRecurringRevenue must be positive/);
    }
  });

  it("takes its revenue from the argument, not from the club id", () => {
    const doubled = openingBudgetComponents({
      ...forClub("legia-warszawa"),
      scaledRecurringRevenue: scaledRecurringRevenue("legia-warszawa") * 2,
    });
    expect(doubled.shareBudget).toBeCloseTo(
      scaledRecurringRevenue("legia-warszawa") * 2 * 0.18,
      12
    );
  });
});

/**
 * The activation gate, narrowed on 2026-09-12.
 *
 * The five numbers now have a decision behind them, so the parametric model
 * gained one runtime importer: `src/logic/opening-budget.ts`, the adapter
 * that composes it with club data. Everything else is still barred - an
 * import from the reducer, `finance.ts` or the UI would mean a second copy of
 * the formula had grown around the one place it is meant to live. Whether the
 * ADAPTER is wired into the game is a separate question, pinned by
 * `tests/logic/opening-budget.test.ts`.
 */
describe("nothing in the runtime consumes the model yet", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  it("is imported only by its adapter, tests and the fit script", () => {
    const files = [...walk("src"), ...walk("scripts"), ...walk("tests")].filter((file) =>
      /\.(ts|tsx|mjs)$/.test(file)
    );
    const importers = files
      .map((file) => file.replace(/\\/g, "/"))
      .filter((file) => file !== "src/logic/opening-budget-model.ts")
      .filter((file) => /opening-budget-model/.test(readFileSync(file, "utf8")));

    expect(importers.length).toBeGreaterThan(0);
    for (const importer of importers) {
      expect(
        importer.startsWith("tests/") ||
          importer.startsWith("scripts/opening-budget-") ||
          importer === "src/logic/opening-budget.ts",
        `${importer} must reach the opening-budget model through its adapter`
      ).toBe(true);
    }
  });
});
