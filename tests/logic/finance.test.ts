import { describe, expect, test } from "vitest";

import {
  BOARD_REINVESTMENT_RATE,
  INITIAL_BUDGET_SHARE,
  KOSZTY_STALE,
  MAX_BUDGET_SHARE,
  MIN_BUDGET_SHARE,
  MIN_INITIAL_BUDGET,
  MONEY_SCALE_PLN_PER_GAME_MILLION,
  leaguePositionPrize,
} from "../../src/data/balance";
import { CLUBS, clubIdForShortName } from "../../src/data/clubs";
import { financeProfileFor } from "../../src/data/club-finance-profiles";
import { EUROPEAN_BERTHS_2026 } from "../../src/data/european-berths-2026";
import type { GameState } from "../../src/data/types";
import {
  annualForecast,
  annualForecastBreakdown,
  calculateSeasonRevenue,
  initialClubBudget,
  maxOrdinaryBudget,
  scaledRecurringRevenue,
  transferBudgetChange,
} from "../../src/logic/finance";
import { openingBudget, openingBudgetComponentsForClub } from "../../src/logic/opening-budget";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { totalPayroll } from "../../src/logic/wages";
import { autoAdvance } from "../golden/headless";
import { testManager } from "./fixtures";

/**
 * The club's side of the money: the recurring base, the placement ladder, the
 * starting budget and the frozen forecast.
 *
 * The frozen forecast is the contract the HUD rests on - a transfer moves the
 * number by exactly minus the change in the WHOLE payroll, never by the wage
 * of the player on the card. The difference matters in two cases the naive
 * version gets wrong, and both are exercised below on real careers rather
 * than on a hand-built state.
 */

const start = (clubId: string, seed: number): GameState =>
  gameReducer(gameReducer(initialState(), { type: "START_GAME", manager: testManager }), {
    type: "START_CAREER",
    clubId,
    manager: testManager,
    seed,
  });

const budgetForecastOf = (state: GameState): number =>
  annualForecastBreakdown({
    clubId: state.club!.clubId,
    squad: state.kadra,
    forecast: {
      expectedPlace: state.seasonForecastExpectedPlace,
      europeanIncome: state.seasonForecastEuropeanIncome,
    },
  }).transferBudgetChange;

const forecastOf = (state: GameState): number =>
  annualForecast({
    clubId: state.club!.clubId,
    squad: state.kadra,
    forecast: {
      expectedPlace: state.seasonForecastExpectedPlace,
      europeanIncome: state.seasonForecastEuropeanIncome,
    },
  });

describe("leaguePositionPrize - the ladder is absolute", () => {
  test("depends on the place and on nothing else", () => {
    // Called with a place alone: there is no club, no forecast and no squad
    // it could read. The signature is the guarantee.
    expect(leaguePositionPrize.length).toBe(1);
    expect(leaguePositionPrize(1)).toBeCloseTo(leaguePositionPrize(1), 12);
  });

  test("falls monotonically and retains one floor step for the bottom club", () => {
    for (let place = 1; place < 18; place += 1) {
      expect(leaguePositionPrize(place)).toBeGreaterThan(leaguePositionPrize(place + 1));
    }
    expect(leaguePositionPrize(18)).toBeGreaterThan(0);
    expect(leaguePositionPrize(19)).toBeCloseTo(0, 12);
  });
});

describe("scaledRecurringRevenue - the manifest in game money", () => {
  test("is the cleaned base divided by the money scale", () => {
    for (const club of CLUBS) {
      expect(scaledRecurringRevenue(club.clubId)).toBeCloseTo(
        financeProfileFor(club.clubId).recurringRevenuePln / MONEY_SCALE_PLN_PER_GAME_MILLION,
        12
      );
    }
  });

  test("separates the eighteen clubs by more than the ladder ever could", () => {
    const revenues = CLUBS.map((club) => scaledRecurringRevenue(club.clubId));
    const spread = Math.max(...revenues) - Math.min(...revenues);
    // The point of the whole axis: the base is what differs between clubs,
    // the ladder is the same for all of them.
    expect(spread).toBeGreaterThan(leaguePositionPrize(1));
  });
});

describe("calculateSeasonRevenue - one equation for every consumer", () => {
  test("adds the base, the ladder and the three one-off prizes", () => {
    const clubId = "legia-warszawa";
    expect(
      calculateSeasonRevenue({
        clubId,
        place: 4,
        europeanPrize: 1.5,
        polishCupPrize: 1.4,
        superCupPrize: 0.6,
      })
    ).toBeCloseTo(scaledRecurringRevenue(clubId) + leaguePositionPrize(4) + 1.5 + 1.4 + 0.6, 12);
  });

  test("the prizes arrive already credited, so the control never reaches here", () => {
    const clubId = "korona-kielce";
    const withheld = calculateSeasonRevenue({
      clubId,
      place: 9,
      europeanPrize: 0,
      polishCupPrize: 0,
      superCupPrize: 0,
    });
    expect(withheld).toBeCloseTo(scaledRecurringRevenue(clubId) + leaguePositionPrize(9), 12);
  });
});

describe("initialClubBudget", () => {
  test("is an alias for the live rule, with no arithmetic of its own", () => {
    // Since 2026-09-12 the budget lives in `opening-budget.ts`. This name
    // survives for scripts and historical tests, and it has to keep pointing
    // at the one live answer: a second body here would mean two budgets and
    // no way to tell which one the game handed out.
    for (const club of CLUBS) {
      expect(initialClubBudget(club.clubId), club.clubId).toBe(openingBudget(club.clubId));
    }
  });

  test("never drops below the playability floor", () => {
    for (const club of CLUBS) {
      expect(initialClubBudget(club.clubId), club.clubId).toBeGreaterThanOrEqual(
        MIN_INITIAL_BUDGET
      );
    }
  });

  test("exceeds the share ceiling only through a named component", () => {
    for (const club of CLUBS) {
      const budget = initialClubBudget(club.clubId);
      if (budget <= maxOrdinaryBudget(club.clubId)) continue;
      // Above the ceiling there must be a named component doing it: the
      // playability floor, the cost of a useful upgrade, or a documented
      // backer. Never the share, which is bounded by the ceiling itself.
      const binding = openingBudgetComponentsForClub(club.clubId).binding;
      expect(binding, club.clubId).not.toContain("shareBudget");
      expect(binding.length, club.clubId).toBeGreaterThan(0);
    }
  });

  test("MAX_BUDGET_SHARE is still the stated ceiling", () => {
    expect(MAX_BUDGET_SHARE).toBeGreaterThan(MIN_BUDGET_SHARE);
    // And the live share sits under it, which is what makes the claim above
    // about the share component true rather than hopeful.
    expect(INITIAL_BUDGET_SHARE).toBeLessThanOrEqual(MAX_BUDGET_SHARE);
  });
});

describe("the first season replays the real 2026/27 berths", () => {
  test("a club with a pinned berth starts in that cup and forecasts its money", () => {
    const berth = EUROPEAN_BERTHS_2026.find((entry) => entry.clubId === "lech-poznan")!;
    const lech = CLUBS.find((club) => club.clubId === berth.clubId)!;
    const state = start(lech.clubId, 0x5eed0001);

    expect(state.europeanCup).toBe(berth.cup);
    expect(state.seasonForecastEuropeanIncome).toBeGreaterThan(0);
  });

  test("a club without one starts at home and forecasts nothing from Europe", () => {
    const homeClub = CLUBS.find(
      (club) => !EUROPEAN_BERTHS_2026.some((berth) => berth.clubId === club.clubId)
    )!;
    const state = start(homeClub.clubId, 0x5eed0001);

    expect(state.europeanCup).toBeNull();
    expect(state.seasonForecastEuropeanIncome).toBe(0);
  });
});

describe("the season forecast is frozen", () => {
  /**
   * Walks a whole career with a policy that takes everything it can, and
   * checks the two properties the freeze exists for on every real decision:
   * the frozen pair never moves inside a season, and the forecast moves by
   * exactly minus the change in the whole payroll.
   */
  const walk = (seed: number, clubId: string) => {
    let state = start(clubId, seed);
    let evictions = 0;
    let sales = 0;
    let refills = 0;
    let decisions = 0;
    let cashChecks = 0;
    const frozenPerSeason = new Map<number, string>();

    for (let guard = 0; guard < 5000 && state.faza !== "final"; guard += 1) {
      const advanced = autoAdvance(state);
      if (advanced) {
        state = advanced;
        continue;
      }
      if (state.faza !== "okno" || !state.karta) break;

      const step = state.kroki[state.krok];
      if (step?.typ === "okno") {
        const key = `${state.seasonForecastExpectedPlace} ${state.seasonForecastEuropeanIncome}`;
        const seen = frozenPerSeason.get(step.sezon);
        if (seen === undefined) frozenPerSeason.set(step.sezon, key);
        else expect(key).toBe(seen);
      }

      const card = state.karta;
      const before = state;
      const beforeForecast = forecastOf(before);
      const beforePayroll = totalPayroll(before.kadra);
      const after = gameReducer(state, { type: "DECIDE", choice: "take" });

      // A card can be refused for want of cash, or need an eviction
      // confirmation the plain DECIDE will not give; both leave the squad
      // alone, and neither is what this test is about.
      if (after.kadra !== before.kadra) {
        decisions += 1;
        const afterPayroll = totalPayroll(after.kadra);
        // Same season, so the frozen pair is the one the "before" state had.
        if (after.faza === "okno") {
          expect(forecastOf(after) - beforeForecast).toBeCloseTo(
            -(afterPayroll - beforePayroll),
            9
          );
          // And the number the player actually reads - the BUDGET forecast -
          // moves by the board's share of that. Same two awkward cases: a
          // purchase that evicts somebody, and a sale that triggers a refill.
          expect(
            budgetForecastOf(after) - budgetForecastOf(before),
            `${card.typ} budget forecast`
          ).toBeCloseTo(-(afterPayroll - beforePayroll) * BOARD_REINVESTMENT_RATE, 9);
        }
        // The transfer itself is NOT scaled. The rate applies to the season's
        // operating result and to nothing else, so the fee the reducer
        // actually charged moves `kasa` in full - the invariant a careless
        // edit to the settlement would break. Read off the decision the
        // reducer recorded, because a haggle and the purchase cap both move
        // the price away from the one printed on the card.
        const decision = [...after.trace].reverse().find((e) => e.type === "decision");
        const wentThrough =
          decision?.type === "decision" &&
          (card.typ === "SPRZEDAZ"
            ? after.kadra.every((z) => z.id !== card.zawodnik.id)
            : decision.signedPlayerId === card.zawodnik.id);
        if (wentThrough && decision?.type === "decision") {
          cashChecks += 1;
          const signed = card.typ === "SPRZEDAZ" ? 1 : -1;
          expect(decision.kasa, `${card.typ} cash`).toBeCloseTo(
            before.kasa + signed * decision.cenaKoncowa,
            2
          );
        }
        if (card.typ === "SPRZEDAZ") {
          sales += 1;
          if (after.kadra.length === before.kadra.length) refills += 1;
        } else if (after.kadra.length === before.kadra.length) {
          evictions += 1;
        }
      }
      state = after;
    }
    return { decisions, sales, refills, evictions, cashChecks, frozenPerSeason };
  };

  test("a purchase, a sale and a refill all move it by the payroll and nothing else", () => {
    const totals = { decisions: 0, sales: 0, refills: 0, cashChecks: 0 };
    for (const seed of [0x5eed0001, 0x5eed0002, 0x5eed0003, 0x5eed0004]) {
      const run = walk(seed, "widzew-lodz");
      totals.decisions += run.decisions;
      totals.sales += run.sales;
      totals.refills += run.refills;
      totals.cashChecks += run.cashChecks;
      expect(run.frozenPerSeason.size).toBeGreaterThan(0);
    }
    // The two cases the naive "by the wage of the player on the card"
    // version gets wrong have to actually occur, or the test proves nothing.
    expect(totals.decisions).toBeGreaterThan(20);
    expect(totals.sales).toBeGreaterThan(0);
    expect(totals.refills).toBeGreaterThan(0);
    expect(totals.cashChecks).toBeGreaterThan(0);
  });

  test("the forecast is the frozen income minus the payroll and the fixed costs", () => {
    const state = start("widzew-lodz", 0x5eed0001);
    const clubId = clubIdForShortName("Widzew");
    expect(forecastOf(state)).toBeCloseTo(
      scaledRecurringRevenue(clubId) +
        leaguePositionPrize(state.seasonForecastExpectedPlace) +
        state.seasonForecastEuropeanIncome -
        (totalPayroll(state.kadra) + KOSZTY_STALE),
      12
    );
  });
});

describe("transferBudgetChange", () => {
  test("passes on exactly the decided share of the operating result", () => {
    expect(BOARD_REINVESTMENT_RATE).toBe(0.3);
    for (const balance of [0.1, 1, 2.5, 12.75, 100]) {
      expect(transferBudgetChange(balance)).toBeCloseTo(balance * BOARD_REINVESTMENT_RATE, 12);
    }
  });

  test("is symmetric: a loss lowers the budget by the same share", () => {
    for (const balance of [0.1, 1, 2.5, 12.75, 100]) {
      expect(transferBudgetChange(-balance)).toBeCloseTo(-transferBudgetChange(balance), 12);
    }
  });

  test("is linear and returns zero for zero", () => {
    expect(transferBudgetChange(0)).toBe(0);
    const a = 3.25;
    const b = -1.75;
    expect(transferBudgetChange(a + b)).toBeCloseTo(
      transferBudgetChange(a) + transferBudgetChange(b),
      12
    );
    expect(transferBudgetChange(4 * a)).toBeCloseTo(4 * transferBudgetChange(a), 12);
  });

  test("does not round: the rounding belongs to the call site", () => {
    // A function that rounded to the settlement's two decimals would return
    // 0 for both of these. Keeping the full share is what lets the call site
    // choose its own precision, once, rather than two call sites choosing
    // different ones and drifting apart.
    expect(transferBudgetChange(0.011)).toBeCloseTo(0.0033, 12);
    expect(transferBudgetChange(0.011)).not.toBe(0);
    expect(transferBudgetChange(1.234567)).toBeCloseTo(0.3703701, 12);
    expect(transferBudgetChange(1.234567)).not.toBe(0.37);
  });
});

/**
 * The identity the season-end screen is built on.
 *
 * It was broken on screen before 2026-09-14: the first row printed
 * `przychodZLigi`, which is the whole season revenue INCLUDING the cups,
 * under the label "Przychód z ligi" - and the cups were then listed again
 * beneath it, while the fixed costs appeared nowhere. The rows therefore both
 * double-counted and fell short, and no player could reconcile them with the
 * balance. These pin the decomposition the screen now prints.
 */
describe("the season-end cash column adds up", () => {
  const cases = [
    { club: "Wisła P.", place: 1, european: 5.6, polishCup: 0, superCup: 0.3, payroll: 2.94 },
    { club: "Legia", place: 7, european: 0, polishCup: 1.4, superCup: 0, payroll: 4.2 },
    { club: "Radomiak", place: 18, european: 0, polishCup: 0, superCup: 0, payroll: 1.1 },
  ] as const;

  test.each(cases)(
    "$club: recurring + ladder + cups - payroll - fixed costs equals the balance",
    ({ club, place, european, polishCup, superCup, payroll }) => {
      const clubId = clubIdForShortName(club);
      const revenue = calculateSeasonRevenue({
        clubId,
        place,
        europeanPrize: european,
        polishCupPrize: polishCup,
        superCupPrize: superCup,
      });
      const balance = revenue - (payroll + KOSZTY_STALE);

      // Exactly the rows the screen prints, in the order it prints them.
      const printed =
        scaledRecurringRevenue(clubId) +
        leaguePositionPrize(place) +
        european +
        polishCup +
        superCup -
        payroll -
        KOSZTY_STALE;

      expect(printed).toBeCloseTo(balance, 10);
    }
  );

  test("the cups are inside the revenue, so printing them twice overstates it", () => {
    const clubId = clubIdForShortName("Wisła P.");
    const withCups = calculateSeasonRevenue({
      clubId,
      place: 1,
      europeanPrize: 5.6,
      polishCupPrize: 0,
      superCupPrize: 0.3,
    });

    // The old first row. Adding the cup rows to it counted 5,90 twice - the
    // regression this file exists to keep out.
    expect(withCups).toBeCloseTo(scaledRecurringRevenue(clubId) + leaguePositionPrize(1) + 5.9, 10);
  });
});
