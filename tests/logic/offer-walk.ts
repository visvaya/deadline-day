import { gameReducer, reportPeriod } from "../../src/logic/game-reducer";
import type { GameState, Offer, ReportPeriod } from "../../src/data/types";
import { initialState } from "../../src/logic/game-state";
import { autoAdvance } from "../golden/headless";
import { testClub, testManager } from "./fixtures";

// Game-walking helpers shared by several test files. They live outside any
// *.test.ts file on purpose: importing from a test file registers that file's
// tests in the importer too, so they ran once per importer.

/**
 * Drives a full game through the pure reducer, calling `onOffer` with each
 * card as it's drawn and choosing `choice` for every decision. Shared by the
 * offer tests so each one only states what it's checking, not how to walk
 * the game loop.
 */
export const driveGame = (seed: number, onOffer: (_state: GameState) => "take" | "pass"): void => {
  let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
  state = gameReducer(state, {
    type: "START_CAREER",
    clubId: testClub.clubId,
    manager: testManager,
    seed,
  });

  for (let guard = 0; guard < 3000 && state.faza !== "final"; guard += 1) {
    const advanced = autoAdvance(state);
    if (advanced) {
      state = advanced;
      continue;
    }
    if (state.faza === "okno" && state.karta) {
      const choice = onOffer(state);
      state = gameReducer(state, { type: "DECIDE", choice });
      continue;
    }
    throw new Error(`Stuck in phase "${state.faza}"`);
  }
};

/** An offer as it was drawn, plus the period it was drawn in - the report
 * generators need both, and reading the period back off a finished card is
 * not possible.
 *
 * Deliberately collected by walking real games rather than by hand-building
 * an OfferReportContext: the context is exactly the thing these tests are
 * checking the reducer fills in correctly. */
export type SeenOffer = Offer & { period: ReportPeriod };

/** Cards drawn by walking successive careers, passing on everything, until
 * `count` of them exist. A career is thirty cards, so this is a handful of
 * games rather than a sweep. */
export const rollManyOffers = (count: number, firstSeed = 0x600_0000): SeenOffer[] => {
  const seen: SeenOffer[] = [];
  for (let seed = firstSeed; seen.length < count && seed < firstSeed + 200; seed += 1) {
    driveGame(seed, (state) => {
      seen.push({ ...state.karta!, period: reportPeriod(state) });
      return "pass";
    });
  }
  if (seen.length < count) throw new Error(`rollManyOffers: only drew ${seen.length}`);
  return seen;
};
