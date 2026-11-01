import { expect, test } from "vitest";

import type { GameState } from "../../src/data/types";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { formationOf } from "../../src/logic/squad";
import { autoAdvance } from "../golden/headless";
import { testManager } from "./fixtures";

/**
 * Proves the phase-2 extraction's Q1-Q4 quirks are fixed: a transfer made on
 * the last move of a window must survive into the round it precedes, not get
 * silently overwritten by that round's own kadra recompute.
 *
 * Deliberately does not use tests/golden/headless.ts - that plays a full
 * game to `final`, but this needs the state *before* the last decision of a
 * winter window, so a decision made in the test itself is the one under
 * scrutiny.
 */

const reachLastWinterMove = (seed: number, clubId: string): GameState => {
  let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
  state = gameReducer(state, { type: "START_CAREER", clubId, manager: testManager, seed });

  for (let guard = 0; guard < 3000; guard += 1) {
    const step = state.kroki[state.krok];
    if (
      state.faza === "okno" &&
      step?.typ === "okno" &&
      step.tura === "zima" &&
      state.ruchy === 1
    ) {
      if (!state.karta) throw new Error("Reached the target move with no open offer");
      return state;
    }
    const advanced = autoAdvance(state);
    if (advanced) {
      state = advanced;
      continue;
    }
    if (state.faza === "okno" && state.karta) {
      state = gameReducer(state, { type: "DECIDE", choice: "pass" });
      continue;
    }
    throw new Error(`Stuck in phase "${state.faza}" while seeking the last winter move`);
  }
  throw new Error("Exceeded step guard while seeking the last winter move");
};

test("a purchase on a winter window's last move survives into the following season", () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    const reached = reachLastWinterMove(seed, "gornik-zabrze");
    const karta = reached.karta!;
    if (karta.typ !== "KUPNO" || karta.cena > reached.kasa) continue;

    const def = formationOf(reached).pozycje.find((t) => t.kod === karta.zawodnik.poz)!;
    const posCount = reached.kadra.filter((z) => z.poz === karta.zawodnik.poz).length;
    if (posCount > def.kadra) continue; // would trigger the roster-eviction branch, not under test here

    const after = gameReducer(reached, { type: "DECIDE", choice: "take" });

    expect(after.faza).toBe("koniecSezonu");
    expect(after.kadra.some((z) => z.id === karta.zawodnik.id)).toBe(true);
    // Season-end processing (retirements, academy refills) runs in the same
    // dispatch as this decision, so the squad can gain or lose more players
    // than just this purchase - only a scenario where the purchase is the
    // sole change proves the thing under test (Q1-Q4: the purchase survives
    // into the following season rather than being silently overwritten).
    if (after.kadra.length !== reached.kadra.length + 1) continue;
    return;
  }
  throw new Error(
    "No seed in range produced an affordable, evictable-free KUPNO on a winter last move"
  );
});

test("a sale on a winter window's last move removes the player and banks the cash", () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    const reached = reachLastWinterMove(seed, "gornik-zabrze");
    const karta = reached.karta!;
    if (karta.typ !== "SPRZEDAZ") continue;

    const after = gameReducer(reached, { type: "DECIDE", choice: "take" });

    expect(after.faza).toBe("koniecSezonu");
    expect(after.kadra.every((z) => z.id !== karta.zawodnik.id)).toBe(true);
    // Season-end processing (retirements, academy refills) runs in the same
    // dispatch as this decision, so the squad can gain or lose more players
    // than just this sale - only a scenario where the sale is the sole
    // change proves the thing under test (the sale survives into the
    // following season rather than being silently overwritten).
    if (after.kadra.length !== reached.kadra.length - 1) continue;

    const lastDecision = [...after.trace].reverse().find((e) => e.type === "decision");
    expect(lastDecision).toBeTruthy();
    // To the cent, not to the bit: the reducer rounds cash to two decimals
    // and the sum here does not, so an exact comparison holds only while
    // both sides happen to land on a representable number.
    expect((lastDecision as { kasa: number }).kasa).toBeCloseTo(reached.kasa + karta.cena, 2);
    return;
  }
  throw new Error("No seed in range produced a SPRZEDAZ card on a winter last move");
});
