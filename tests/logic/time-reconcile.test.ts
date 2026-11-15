import { describe, expect, test } from "vitest";

import type { GameState } from "../../src/data/types";
import { elapsedWholeSeconds, wouldExpire } from "../../src/logic/time-reconcile";

const offerOpen = (overrides: Partial<GameState>): GameState =>
  ({
    faza: "okno",
    timerWl: true,
    karta: {},
    czas: 10,
    ...overrides,
  }) as GameState;

describe("elapsedWholeSeconds", () => {
  test("counts only whole seconds between two clock readings", () => {
    expect(elapsedWholeSeconds(1_000, 1_999)).toBe(0);
    expect(elapsedWholeSeconds(1_000, 2_000)).toBe(1);
    expect(elapsedWholeSeconds(1_000, 13_500)).toBe(12);
  });

  test("a clock that went backwards yields a negative count, which callers ignore", () => {
    expect(elapsedWholeSeconds(5_000, 3_000)).toBe(-2);
  });
});

describe("wouldExpire", () => {
  test("an open, timed offer expires once the elapsed time reaches what is left", () => {
    expect(wouldExpire(offerOpen({ czas: 10 }), 9)).toBe(false);
    expect(wouldExpire(offerOpen({ czas: 10 }), 10)).toBe(true);
  });

  test("nothing expires without elapsed time, a timer, an open offer or the window phase", () => {
    expect(wouldExpire(offerOpen({ czas: 0 }), 0)).toBe(false);
    expect(wouldExpire(offerOpen({ timerWl: false }), 60)).toBe(false);
    expect(wouldExpire(offerOpen({ karta: null }), 60)).toBe(false);
    expect(wouldExpire(offerOpen({ faza: "przeglad" }), 60)).toBe(false);
  });
});
