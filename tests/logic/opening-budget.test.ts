import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACTIVE_BACKER_PERCENTILE,
  BOARD_REINVESTMENT_RATE,
  INITIAL_BUDGET_SHARE,
  MAX_BUDGET_SHARE,
  MIN_INITIAL_BUDGET,
  STRONG_BACKER_PERCENTILE,
  USEFUL_UPGRADE_OVR_DELTA,
} from "../../src/data/balance";
import { CLUBS, clubIdForShortName } from "../../src/data/clubs";
import { financeProfileFor } from "../../src/data/club-finance-profiles";
import { scaledRecurringRevenue } from "../../src/logic/finance-scale";
import {
  backerSupportFloor,
  openingBudget,
  openingBudgetComponentsForClub,
  structuralPurchasingPower,
  structuralPurchasingPowerFrom,
} from "../../src/logic/opening-budget";
import { representativeUsefulPurchaseCost } from "../../src/logic/opening-budget-model";

/**
 * The adapter is where the decided numbers meet the manifest, so these tests
 * ask two different kinds of question: whether the arithmetic is the maximum
 * it claims to be, and whether the percentile is taken of the league rather
 * than of a convenient subset of it.
 *
 * The final table of all eighteen budgets is pinned too, since the atomic
 * activation of 2026-09-12: it is the one artefact that shows at a glance
 * which component decides each club, and a change to any of the five decided
 * numbers moves it.
 */

describe("openingBudget", () => {
  it("is positive, finite and deterministic for every club", () => {
    for (const club of CLUBS) {
      const value = openingBudget(club.clubId);
      expect(Number.isFinite(value), club.clubId).toBe(true);
      expect(value, club.clubId).toBeGreaterThan(0);
      expect(openingBudget(club.clubId), club.clubId).toBe(value);
    }
  });

  it("is the maximum of its four components", () => {
    for (const club of CLUBS) {
      const c = openingBudgetComponentsForClub(club.clubId);
      const candidates = [c.absoluteFloor, c.shareBudget, c.usefulPurchaseCost];
      if (c.backerSupportFloor !== null) candidates.push(c.backerSupportFloor);
      expect(c.initialBudget, club.clubId).toBe(Math.max(...candidates));
      expect(openingBudget(club.clubId), club.clubId).toBe(c.initialBudget);
    }
  });

  it("reports each component from its own source", () => {
    for (const club of CLUBS) {
      const c = openingBudgetComponentsForClub(club.clubId);
      expect(c.absoluteFloor).toBe(MIN_INITIAL_BUDGET);
      expect(c.shareBudget, club.clubId).toBeCloseTo(
        scaledRecurringRevenue(club.clubId) * INITIAL_BUDGET_SHARE,
        12
      );
      // Taken from the model, never recomputed here: a second copy of the
      // cost arithmetic is exactly what the model exists to prevent.
      expect(c.usefulPurchaseCost, club.clubId).toBe(
        representativeUsefulPurchaseCost(club.clubId, USEFUL_UPGRADE_OVR_DELTA)
      );
    }
  });

  it("names every binding component, not just one of them", () => {
    for (const club of CLUBS) {
      const c = openingBudgetComponentsForClub(club.clubId);
      expect(c.binding.length, club.clubId).toBeGreaterThan(0);
      for (const name of c.binding) {
        const value =
          name === "absoluteFloor"
            ? c.absoluteFloor
            : name === "shareBudget"
              ? c.shareBudget
              : name === "usefulPurchaseCost"
                ? c.usefulPurchaseCost
                : c.backerSupportFloor;
        expect(value, `${club.clubId}/${name}`).not.toBeNull();
        expect(Math.abs((value as number) - c.initialBudget)).toBeLessThanOrEqual(1e-12);
      }
    }
  });
});

describe("the decided constants", () => {
  it("carry the five values of 2026-09-12", () => {
    // Pinned against the decision document, not against whatever the code
    // happens to say: these are the numbers a product owner chose, and a
    // silent edit to any of them is a different game.
    expect(INITIAL_BUDGET_SHARE).toBe(0.2);
    expect(USEFUL_UPGRADE_OVR_DELTA).toBe(2);
    expect(STRONG_BACKER_PERCENTILE).toBe(0.95);
    expect(ACTIVE_BACKER_PERCENTILE).toBe(0.8);
  });

  it("keep the two backer levels apart and inside the percentile domain", () => {
    for (const p of [STRONG_BACKER_PERCENTILE, ACTIVE_BACKER_PERCENTILE]) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(STRONG_BACKER_PERCENTILE).toBeGreaterThan(ACTIVE_BACKER_PERCENTILE);
  });
});

describe("backerSupportFloor", () => {
  it("is null exactly for the clubs the manifest does not back", () => {
    for (const club of CLUBS) {
      const documented = financeProfileFor(club.clubId).backerBudgetPercentile !== undefined;
      expect(backerSupportFloor(club.clubId) === null, club.clubId).toBe(!documented);
    }
  });

  it("is a percentile of all eighteen share budgets, not of the rest of them", () => {
    const backed = CLUBS.filter(
      (club) => financeProfileFor(club.clubId).backerBudgetPercentile !== undefined
    );
    expect(backed.length).toBeGreaterThan(0);

    const all = CLUBS.map(
      (club) => scaledRecurringRevenue(club.clubId) * INITIAL_BUDGET_SHARE
    ).sort((a, b) => a - b);

    for (const club of backed) {
      const p = financeProfileFor(club.clubId).backerBudgetPercentile as number;
      const position = (all.length - 1) * p;
      const lo = Math.floor(position);
      const hi = Math.ceil(position);
      const expected = lo === hi ? all[lo] : all[lo]! + (position - lo) * (all[hi]! - all[lo]!);
      expect(backerSupportFloor(club.clubId), club.clubId).toBeCloseTo(expected!, 12);

      // The same percentile over the seventeen OTHER clubs is a different
      // number, which is what makes the eighteen-club claim testable rather
      // than decorative.
      const others = CLUBS.filter((other) => other.clubId !== club.clubId)
        .map((other) => scaledRecurringRevenue(other.clubId) * INITIAL_BUDGET_SHARE)
        .sort((a, b) => a - b);
      expect(others).toHaveLength(17);
      const otherPosition = (others.length - 1) * p;
      const otherLo = Math.floor(otherPosition);
      const otherHi = Math.ceil(otherPosition);
      const withoutSelf =
        otherLo === otherHi
          ? others[otherLo]
          : others[otherLo]! + (otherPosition - otherLo) * (others[otherHi]! - others[otherLo]!);
      expect(withoutSelf, club.clubId).not.toBeCloseTo(expected!, 9);
    }
  });

  it("never feeds its own result back into the sample it is taken from", () => {
    // Eighteen share budgets, each a plain product of revenue and the share:
    // if the exception had been folded in, one of them would equal a floor
    // instead.
    const shares = CLUBS.map((club) => scaledRecurringRevenue(club.clubId) * INITIAL_BUDGET_SHARE);
    expect(shares).toHaveLength(18);
    for (const club of CLUBS) {
      const c = openingBudgetComponentsForClub(club.clubId);
      expect(shares, club.clubId).toContain(c.shareBudget);
    }
  });
});

describe("the share ceiling bounds the share and nothing else", () => {
  it("keeps the production share under the ceiling", () => {
    expect(INITIAL_BUDGET_SHARE).toBeLessThanOrEqual(MAX_BUDGET_SHARE);
    for (const club of CLUBS) {
      const c = openingBudgetComponentsForClub(club.clubId);
      expect(c.shareBudget, club.clubId).toBeLessThanOrEqual(
        scaledRecurringRevenue(club.clubId) * MAX_BUDGET_SHARE + 1e-12
      );
    }
  });

  it("lets the other components exceed it, and says so rather than clamping", () => {
    const above = CLUBS.filter(
      (club) =>
        openingBudget(club.clubId) > scaledRecurringRevenue(club.clubId) * MAX_BUDGET_SHARE + 1e-12
    );
    // Those clubs exist, and every one of them is above the ceiling through a
    // named exception - never through the share.
    expect(above.length).toBeGreaterThan(0);
    for (const club of above) {
      const c = openingBudgetComponentsForClub(club.clubId);
      expect(c.binding, club.clubId).not.toContain("shareBudget");
    }
  });

  it("reads no second share constant", () => {
    const source = readFileSync("src/logic/opening-budget.ts", "utf8");
    expect(source).not.toMatch(/MIN_BUDGET_SHARE/);
    expect(source).not.toMatch(/Math\.random/);
  });
});

describe("structuralPurchasingPower", () => {
  it("is the structural opening budget plus the board's share of the forecast", () => {
    for (const club of CLUBS) {
      const c = openingBudgetComponentsForClub(club.clubId);
      for (const projected of [-2.5, 0, 1.25, 8]) {
        const structuralOpeningBudget = Math.max(
          c.shareBudget,
          c.backerSupportFloor ?? Number.NEGATIVE_INFINITY
        );
        expect(
          structuralPurchasingPower({
            clubId: club.clubId,
            projectedOperatingBalanceWithoutTransfersAndCups: projected,
          }),
          club.clubId
        ).toBeCloseTo(structuralOpeningBudget + projected * BOARD_REINVESTMENT_RATE, 12);
      }
    }
  });

  it("ignores the playability floor and the cost of an upgrade", () => {
    // The three inputs are the whole of the answer. Anything that made the
    // cost of a useful upgrade visible here would let a handicap read squad
    // quality a second time, through the finances.
    const input = {
      shareBudget: 0.4,
      backerSupportFloor: null,
      projectedOperatingBalanceWithoutTransfersAndCups: 1,
    };
    expect(structuralPurchasingPowerFrom(input)).toBeCloseTo(0.4 + BOARD_REINVESTMENT_RATE, 12);
    // Far below the absolute floor, and it stays there: this quantity is not
    // the budget the club is handed.
    expect(structuralPurchasingPowerFrom(input)).toBeLessThan(MIN_INITIAL_BUDGET);
    for (const club of CLUBS) {
      const c = openingBudgetComponentsForClub(club.clubId);
      const structural = structuralPurchasingPower({
        clubId: club.clubId,
        projectedOperatingBalanceWithoutTransfersAndCups: 0,
      });
      if (c.binding.includes("usefulPurchaseCost") || c.binding.includes("absoluteFloor")) {
        expect(structural, club.clubId).toBeLessThan(c.initialBudget);
      }
    }
  });

  it("lets a backer floor raise it, and ignores one below the share", () => {
    const raised = structuralPurchasingPowerFrom({
      shareBudget: 0.4,
      backerSupportFloor: 1.2,
      projectedOperatingBalanceWithoutTransfersAndCups: 0,
    });
    expect(raised).toBeCloseTo(1.2, 12);
    const idle = structuralPurchasingPowerFrom({
      shareBudget: 0.4,
      backerSupportFloor: 0.1,
      projectedOperatingBalanceWithoutTransfersAndCups: 0,
    });
    expect(idle).toBeCloseTo(0.4, 12);
  });

  it("moves by the board's share when the forecast moves, and by nothing else", () => {
    const base = {
      shareBudget: 0.9,
      backerSupportFloor: null,
      projectedOperatingBalanceWithoutTransfersAndCups: 0,
    };
    const delta = 3.4;
    expect(
      structuralPurchasingPowerFrom({
        ...base,
        projectedOperatingBalanceWithoutTransfersAndCups: delta,
      }) - structuralPurchasingPowerFrom(base)
    ).toBeCloseTo(delta * BOARD_REINVESTMENT_RATE, 12);
  });
});

/**
 * What the activated adapter is allowed to reach, now that the atomic
 * activation of 2026-09-12 has wired it in.
 *
 * The gate used to say "tests only". It now says the opposite thing in the
 * one direction that still matters: `opening-budget.ts` must not import
 * `finance.ts`, because `finance.ts` imports the adapter. The pair is a cycle
 * the moment that edge appears, and a cycle in ESM is an `undefined` at
 * module-initialisation time rather than an error - so it would surface as a
 * budget of NaN somewhere far away from its cause.
 */
describe("the adapter is wired in, and stays a leaf below finance", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  it("does not import finance.ts, which imports it", () => {
    const source = readFileSync("src/logic/opening-budget.ts", "utf8");
    expect(source).not.toMatch(/from "\.\/finance"/);
    // It reads the shared leaf instead, which is what the split exists for.
    expect(source).toMatch(/from "\.\/finance-scale"/);
  });

  it("is what the reducer hands the player on day one", () => {
    const reducer = readFileSync("src/logic/game-reducer.ts", "utf8");
    expect(reducer).toMatch(/openingBudget\(clubId\)/);
  });

  it("leaves exactly one budget arithmetic in the tree", () => {
    // `initialClubBudget` survives as a name. If a second body grew back
    // under it, two budgets would exist and nothing would say which one the
    // game handed out.
    const finance = readFileSync("src/logic/finance.ts", "utf8");
    expect(finance).toMatch(/initialClubBudget = \(clubId: string\): number => openingBudget/);
    expect(finance).not.toMatch(/MIN_INITIAL_BUDGET/);

    const sources = [...walk("src")].filter((file) => /\.(ts|tsx)$/.test(file));
    const withFormula = sources
      .map((file) => file.replace(/\\/g, "/"))
      .filter((file) => /representativeUsefulPurchaseCost/.test(readFileSync(file, "utf8")));
    // One file, and it is the parametric model. The adapter reaches the cost
    // through `openingBudgetComponents`, never by naming the formula itself.
    expect(withFormula.sort()).toEqual(["src/logic/opening-budget-model.ts"]);
  });
});

describe("the activated table of eighteen", () => {
  it("binds the absolute floor for exactly five clubs, and names them", () => {
    const onFloor = CLUBS.filter((club) =>
      openingBudgetComponentsForClub(club.clubId).binding.includes("absoluteFloor")
    ).map((club) => club.shortName);
    // The decision of 2026-09-12 chose delta 2 partly for this: nine clubs sat
    // on the emergency floor at delta 1.
    expect(onFloor.sort()).toEqual(["Motor", "Piast", "Radomiak", "Wisła K.", "Śląsk"].sort());
  });

  it("lets Wieczysta's backer floor bind and leaves Widzew's and Korona's idle", () => {
    const wieczysta = openingBudgetComponentsForClub(clubIdForShortName("Wieczysta"));
    expect(wieczysta.binding).toEqual(["backerSupportFloor"]);

    // Present but not binding, on both. Widzew's expensive squad makes an
    // upgrade cost more than the floor, and Korona's is below the same cost -
    // which is the intended shape, not a failure of the percentile.
    for (const shortName of ["Widzew", "Korona"]) {
      const c = openingBudgetComponentsForClub(clubIdForShortName(shortName));
      expect(c.backerSupportFloor, shortName).not.toBeNull();
      expect(c.binding, shortName).toEqual(["usefulPurchaseCost"]);
      expect(c.initialBudget, shortName).toBeGreaterThan(c.backerSupportFloor as number);
    }
  });

  it("pins every club's budget and the component that decides it", () => {
    const table = CLUBS.map((club) => {
      const c = openingBudgetComponentsForClub(club.clubId);
      return `${club.shortName} ${c.initialBudget.toFixed(4)} ${c.binding.join("+")}`;
    }).sort();
    expect(table).toEqual(
      [
        "Legia 1.8671 shareBudget",
        "Lech 1.7478 usefulPurchaseCost",
        "Widzew 1.5333 usefulPurchaseCost",
        "Wieczysta 1.3847 backerSupportFloor",
        "Cracovia 1.3435 usefulPurchaseCost",
        "Górnik 1.1760 usefulPurchaseCost",
        "Raków 1.0285 usefulPurchaseCost",
        "Wisła P. 0.8990 usefulPurchaseCost",
        "Pogoń 0.8810 shareBudget",
        "Jagiellonia 0.7855 usefulPurchaseCost",
        "Korona 0.7855 usefulPurchaseCost",
        "Zagłębie 0.7855 usefulPurchaseCost",
        "GKS 0.7855 usefulPurchaseCost",
        "Śląsk 0.7500 absoluteFloor",
        "Piast 0.7500 absoluteFloor",
        "Radomiak 0.7500 absoluteFloor",
        "Motor 0.7500 absoluteFloor",
        "Wisła K. 0.7500 absoluteFloor",
      ].sort()
    );
  });
});
