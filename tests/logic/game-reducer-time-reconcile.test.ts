import { expect, test } from "vitest";

import type { GameState, Offer } from "../../src/data/types";
import { CZAS_BAZOWY } from "../../src/data/balance";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { makeTestPlayer, quietMarket, testCareerBaseline, testClub } from "./fixtures";

/**
 * RECONCILE_TIME closes the loophole where locking the screen would freeze
 * `czas` (a suspended setInterval never ticks) - src/ui/app.tsx dispatches it
 * with the real elapsed seconds on resume, and the reducer must treat that
 * exactly like TICK's own expiry branch, just for an arbitrary span.
 */

const makeOffer = (): Offer => ({
  typ: "KUPNO",
  zawodnik: makeTestPlayer("target", { wiek: 24 }),
  cena: 1.0,
  sourceClub: null,
  buyer: null,
  staffAssessment: {
    source: "scout",
    focus: "potential",
    outlook: "leagueLevel",
    confidence: "medium",
    isFirstObservation: true,
  },
  analystReport: {
    metrics: [
      { metricId: "goalsPreventedPer90", percentile: 50, value: 0 },
      { metricId: "positioningErrorAverage", percentile: 50, value: 2.06 },
    ],
    minutes: 900,
    sampleTier: "medium",
    period: { season: 1, window: "summer" },
    contextTier: "mid",
  },
});

const openOfferState = (overrides: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  faza: "okno",
  club: testClub,
  careerBaseline: testCareerBaseline,
  kadra: [],
  kasa: 100,
  rynek: quietMarket,
  ruchy: 1,
  karta: makeOffer(),
  czas: CZAS_BAZOWY,
  maxCzas: CZAS_BAZOWY,
  timerWl: true,
  rngState: 1,
  ...overrides,
});

test("subtracts elapsed seconds from czas without resolving the card", () => {
  const before = openOfferState({ czas: 10 });
  const after = gameReducer(before, { type: "RECONCILE_TIME", elapsedSeconds: 4 });

  expect(after.czas).toBe(6);
  expect(after.karta).toEqual(before.karta);
  expect(after.faza).toBe("okno");
});

test("auto-passes the open card once elapsed seconds reach or exceed czas", () => {
  const before = openOfferState({ czas: 5, kadra: [] });
  const after = gameReducer(before, { type: "RECONCILE_TIME", elapsedSeconds: 5 });

  // Same resolution path as a manual pass / TICK expiry: the window had only
  // one move left, so the reducer moves straight past the exhausted window,
  // same as it would for a manual "pas" click on the same fixture.
  const viaManualPass = gameReducer(before, { type: "DECIDE", choice: "pass" });
  expect(after.faza).toBe(viaManualPass.faza);
  expect(after.akcje.at(-1)).toBe("PAS");
  const lastDecision = [...after.trace].reverse().find((e) => e.type === "decision");
  expect(lastDecision?.type === "decision" && lastDecision.wynik).toBe("OK");
});

test("a very long absence still only resolves the single open card", () => {
  const before = openOfferState({ czas: 8 });
  const after = gameReducer(before, { type: "RECONCILE_TIME", elapsedSeconds: 3600 });

  expect(after.akcje.filter((token) => token === "PAS")).toHaveLength(1);
});

test("is a no-op outside an open, timed offer", () => {
  const notInWindow: GameState = { ...openOfferState(), faza: "przeglad", karta: null };
  const timerOff = openOfferState({ timerWl: false });
  const noCard = openOfferState({ karta: null, faza: "przeglad" });

  expect(gameReducer(notInWindow, { type: "RECONCILE_TIME", elapsedSeconds: 5 })).toBe(notInWindow);
  expect(gameReducer(timerOff, { type: "RECONCILE_TIME", elapsedSeconds: 5 })).toBe(timerOff);
  expect(gameReducer(noCard, { type: "RECONCILE_TIME", elapsedSeconds: 5 })).toBe(noCard);
});

test("is a no-op for zero or negative elapsed seconds", () => {
  const state = openOfferState({ czas: 10 });

  expect(gameReducer(state, { type: "RECONCILE_TIME", elapsedSeconds: 0 })).toBe(state);
  expect(gameReducer(state, { type: "RECONCILE_TIME", elapsedSeconds: -3 })).toBe(state);
});
