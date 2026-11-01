import { describe, expect, test } from "vitest";

import type { GameState } from "../../src/data/types";
import { PUCHAR_POLSKI_PREMIA, SUPERPUCHAR_PREMIA } from "../../src/data/balance";
import { transferBudgetChange } from "../../src/logic/finance";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { creditedIncome } from "../../src/logic/income-mode";
import { createRng } from "../../src/logic/rng";
import { runEpilogue } from "../../src/logic/epilogue";
import { formationOf } from "../../src/logic/squad";
import { autoAdvance } from "../golden/headless";
import { testClub, testManager } from "./fixtures";

/**
 * The measurement variant that switches off the three one-off income streams
 * (Polish Cup, Super Cup, european campaign) and the money a sale brings in,
 * leaving the recurring league revenue and every sporting consequence in
 * place. It exists so a baseline can separate "what the club earns by being
 * a club" from "what it earned by winning a draw", and it is opt-in per
 * dispatch - nothing in a normal game can reach it.
 */

const playToVerdict = (seed: number, options?: Parameters<typeof gameReducer>[2]) => {
  let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
  state = gameReducer(
    state,
    { type: "START_CAREER", clubId: testClub.clubId, manager: testManager, seed },
    options
  );
  for (let guard = 0; guard < 5000 && state.faza !== "final"; guard += 1) {
    if (state.faza === "przeglad") {
      state = gameReducer(state, { type: "OPEN_OFFERS" }, options);
    } else if (state.faza === "okno" && state.karta) {
      state = gameReducer(state, { type: "DECIDE", choice: "pass" }, options);
    } else if (state.faza === "werdykt") {
      state = gameReducer(state, { type: "RUN_EPILOGUE" }, options);
    } else {
      state = gameReducer(state, { type: "ADVANCE" }, options);
    }
  }
  return state;
};

describe("creditedIncome", () => {
  test.each([0, 0.3, 1.4, 5.6])("keeps %s in normal mode", (amount) => {
    expect(creditedIncome(amount, "normal")).toBe(amount);
  });

  test.each([0, 0.3, 1.4, 5.6])("zeroes %s under finance control", (amount) => {
    expect(creditedIncome(amount, "finance-control")).toBe(0);
  });
});

describe("the reducer's default is the normal game", () => {
  test("omitting options is the same as asking for normal explicitly", () => {
    const implicit = playToVerdict(0x5eed0001);
    const explicit = playToVerdict(0x5eed0001, { incomeMode: "normal" });
    expect(explicit.finalne).toEqual(implicit.finalne);
    expect(explicit.kasa).toBe(implicit.kasa);
    expect(explicit.rngDrawCount).toBe(implicit.rngDrawCount);
  });
});

describe("season settlement under finance control", () => {
  /**
   * The state sitting one ADVANCE away from a spring round that settles a
   * season with at least one one-off bonus.
   *
   * Compared from ONE state rather than by replaying two careers: withholding
   * money changes the cash a club has, which changes the offers it is shown,
   * so two careers of the same seed legitimately diverge. A single settlement
   * dispatched twice from the identical state is the only comparison that
   * isolates the money.
   */
  /** The season summary type is not exported; derived from the state so the
   * test cannot drift from it. */
  type SettledSeason = NonNullable<GameState["wynikSezonu"]>;

  const beforeRewardedSeason = (): { state: GameState; outcome: SettledSeason } => {
    for (let seed = 1; seed <= 400; seed += 1) {
      let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
      state = gameReducer(state, {
        type: "START_CAREER",
        clubId: testClub.clubId,
        manager: testManager,
        seed,
      });
      for (let guard = 0; guard < 3000; guard += 1) {
        const step = state.kroki[state.krok];
        // The last winter card: passing on it runs the spring round and
        // settles the season in the very same dispatch.
        if (
          state.faza === "okno" &&
          state.karta &&
          step?.typ === "okno" &&
          step.tura === "zima" &&
          state.ruchy === 1
        ) {
          const settled = gameReducer(state, { type: "DECIDE", choice: "pass" });
          const outcome = settled.wynikSezonu;
          if (
            outcome &&
            outcome.sezon === step.sezon &&
            outcome.polishCupIncome + outcome.superCupIncome + outcome.europeanIncome > 0
          ) {
            return { state, outcome };
          }
        }
        const advanced = autoAdvance(state);
        if (advanced) {
          state = advanced;
          continue;
        }
        if (state.faza !== "okno" || !state.karta) break;
        state = gameReducer(state, { type: "DECIDE", choice: "pass" });
      }
    }
    throw new Error("no seed in range settled a season with a one-off bonus");
  };

  test("the three bonuses are credited as zero but the trophies stay", () => {
    const { state, outcome: before } = beforeRewardedSeason();
    const controlled = gameReducer(
      state,
      { type: "DECIDE", choice: "pass" },
      { incomeMode: "finance-control" }
    );
    const after = controlled.wynikSezonu!;

    // Same sporting season: same table, same trophies, same campaign.
    expect(after.miejsce).toBe(before.miejsce);
    expect(after.pkt).toBe(before.pkt);
    expect(after.puchar).toBe(before.puchar);
    expect(after.mistrz).toBe(before.mistrz);
    expect(after.europeanRun).toEqual(before.europeanRun);
    expect(after.superCup).toEqual(before.superCup);
    expect(after.europeanCup).toBe(before.europeanCup);

    // But the money is gone, and the balance says so.
    expect(after.polishCupIncome).toBe(0);
    expect(after.superCupIncome).toBe(0);
    expect(after.europeanIncome).toBe(0);
    const removed = before.polishCupIncome + before.superCupIncome + before.europeanIncome;
    expect(removed).toBeGreaterThan(0);
    expect(before.bilans - after.bilans).toBeCloseTo(removed, 6);

    const normal = gameReducer(state, { type: "DECIDE", choice: "pass" });
    // The cash moves by the board's SHARE of the withheld prizes, not by the
    // prizes themselves: `bilans` above is still the full result, and only a
    // share of it reaches the budget. Tolerance is one rounding step (0.01):
    // both sides round their own sum to two decimals independently, and
    // `zaokr(a + x) - zaokr(a + y)` can differ from `zaokr(x - y)` by exactly
    // that much when the unrounded sum sits near a rounding boundary - a
    // property of rounding, not a mismatch in the underlying arithmetic.
    expect(
      Math.abs(controlled.kasa - (normal.kasa - transferBudgetChange(removed)))
    ).toBeLessThanOrEqual(0.01 + 1e-9);
    // And the settlement drew exactly the same values along the way.
    expect(controlled.rngDrawCount).toBe(normal.rngDrawCount);
    expect(controlled.rngState).toBe(normal.rngState);
  });
});

describe("sales and purchases", () => {
  const sellState = (seed: number): GameState | null => {
    let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
    state = gameReducer(state, {
      type: "START_CAREER",
      clubId: testClub.clubId,
      manager: testManager,
      seed,
    });
    for (let guard = 0; guard < 3000; guard += 1) {
      const advanced = autoAdvance(state);
      if (advanced) {
        state = advanced;
        continue;
      }
      if (state.faza !== "okno" || !state.karta) return null;
      if (state.karta.typ === "SPRZEDAZ" && state.ruchy > 1) return state;
      state = gameReducer(state, { type: "DECIDE", choice: "pass" });
    }
    return null;
  };

  test("a sale still removes the player but banks nothing", () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const state = sellState(seed);
      if (!state) continue;
      const sold = state.karta!.zawodnik;
      const normal = gameReducer(state, { type: "DECIDE", choice: "take" });
      const controlled = gameReducer(
        state,
        { type: "DECIDE", choice: "take" },
        { incomeMode: "finance-control" }
      );
      expect(normal.kadra.some((z) => z.id === sold.id)).toBe(false);
      expect(controlled.kadra.some((z) => z.id === sold.id)).toBe(false);
      expect(normal.kasa).toBeGreaterThan(state.kasa);
      expect(controlled.kasa).toBe(state.kasa);
      return;
    }
    throw new Error("no seed in range produced a SPRZEDAZ card mid-window");
  });

  test("a purchase still costs money under finance control", () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
      state = gameReducer(state, {
        type: "START_CAREER",
        clubId: testClub.clubId,
        manager: testManager,
        seed,
      });
      state = gameReducer(state, { type: "OPEN_OFFERS" });
      const karta = state.karta!;
      if (karta.typ !== "KUPNO" || karta.cena <= 0 || karta.cena > state.kasa) continue;
      const controlled = gameReducer(
        state,
        { type: "DECIDE", choice: "take" },
        { incomeMode: "finance-control" }
      );
      if (!controlled.kadra.some((z) => z.id === karta.zawodnik.id)) continue;
      expect(controlled.kasa).toBeLessThan(state.kasa);
      return;
    }
    throw new Error("no seed in range produced an affordable KUPNO on the first card");
  });
});

describe("the epilogue is controlled too", () => {
  /** A tenure that reached the verdict without going down: a relegated club
   * has no epilogue to play, so it cannot answer this question. */
  const playedToVerdict = (): GameState => {
    for (let seed = 1; seed <= 400; seed += 1) {
      let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
      state = gameReducer(state, {
        type: "START_CAREER",
        clubId: testClub.clubId,
        manager: testManager,
        seed,
      });
      for (let guard = 0; guard < 3000 && state.faza !== "werdykt"; guard += 1) {
        const advanced = autoAdvance(state);
        if (advanced) {
          state = advanced;
          continue;
        }
        if (state.faza !== "okno" || !state.karta) break;
        state = gameReducer(state, { type: "DECIDE", choice: "pass" });
      }
      if (state.faza === "werdykt" && !state.relegated) return state;
    }
    throw new Error("no seed in range reached the verdict without relegation");
  };

  test("every epilogue season withholds its three bonuses", () => {
    const played = playedToVerdict();
    expect(played.werdykt).not.toBeNull();
    const input = {
      kadra: played.kadra,
      kasa: played.kasa,
      europeanCup: played.europeanCup,
      club: played.club!,
      formacja: formationOf(played),
      historia: played.historia,
      odrzuceni: played.odrzuceni,
      legacyHandicap: played.careerBaseline!.legacyHandicap,
      membership: played.membership,
    };
    const normal = runEpilogue(createRng(played.rngState), input);
    const controlled = runEpilogue(createRng(played.rngState), {
      ...input,
      incomeMode: "finance-control" as const,
    });

    // Same seasons played, same pages, same league - only the cash differs.
    expect(controlled.pages.map((p) => p.miejsce)).toEqual(normal.pages.map((p) => p.miejsce));
    expect(controlled.pages.map((p) => p.pkt)).toEqual(normal.pages.map((p) => p.pkt));
    expect(controlled.membership).toEqual(normal.membership);
    // The verdict, the final legacy and the breakdown are all computed from
    // the controlled cash, not from the uncontrolled one.
    expect(controlled.legacy.breakdown!.kasa).toBe(controlled.legacy.kasa);

    // The fixture has to have something to withhold, or the test proves
    // nothing at all - three epilogue seasons in the league always draw at
    // least one of the three bonuses somewhere.
    expect(normal.legacy.kasa).toBeGreaterThan(controlled.legacy.kasa);
    expect(PUCHAR_POLSKI_PREMIA + SUPERPUCHAR_PREMIA).toBeGreaterThan(0);
  });
});

test("a relegated tenure settles from the controlled cash", () => {
  // runFinale draws nothing and plays no season, so there is nothing in it
  // to control - what has to hold is that the cash it inherits is already
  // the controlled one, and that the legacy is computed from that.
  for (let seed = 1; seed <= 400; seed += 1) {
    let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
    state = gameReducer(
      state,
      { type: "START_CAREER", clubId: "wieczysta-krakow", manager: testManager, seed },
      { incomeMode: "finance-control" }
    );
    for (let guard = 0; guard < 3000 && state.faza !== "final"; guard += 1) {
      const advanced = autoAdvance(state, { incomeMode: "finance-control" });
      if (advanced) {
        state = advanced;
        continue;
      }
      if (state.faza !== "okno" || !state.karta) break;
      state = gameReducer(
        state,
        { type: "DECIDE", choice: "pass" },
        { incomeMode: "finance-control" }
      );
    }
    if (!state.relegated || state.faza !== "final") continue;
    expect(state.epilog).toHaveLength(0);
    expect(state.finalne!.kasa).toBe(state.kasa);
    expect(state.finalne!.breakdown!.kasa).toBe(state.kasa);
    return;
  }
  throw new Error("no seed in range ended a hard tenure in relegation");
});
