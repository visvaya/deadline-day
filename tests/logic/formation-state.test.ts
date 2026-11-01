import { expect, test } from "vitest";

import { FORMACJE } from "../../src/data/positions";
import { initialState } from "../../src/logic/game-state";
import { gameReducer } from "../../src/logic/game-reducer";
import { formationOf } from "../../src/logic/squad";
import { testClub, testManager } from "./fixtures";

const started = (seed: number) =>
  gameReducer(initialState(), {
    type: "START_CAREER",
    clubId: testClub.clubId,
    manager: testManager,
    seed,
  });

test("a career picks one formation and keeps it", () => {
  const state = started(1234);
  expect(Object.keys(FORMACJE)).toContain(state.formacja);
});

test("the squad only ever holds positions from that formation", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const state = started(seed);
    const allowed = new Set(formationOf(state).pozycje.map((slot) => slot.kod));
    expect(
      state.kadra.every((z) => allowed.has(z.poz)),
      `seed ${seed}`
    ).toBe(true);
  }
});

test("different seeds reach different formations", () => {
  // Not a distribution test - just proof the draw is live rather than
  // hard-coded to one shape.
  const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => started(s).formacja));
  expect(seen.size).toBeGreaterThan(1);
});

test("the squad carries every position the formation needs", () => {
  for (const seed of [7, 8, 9]) {
    const state = started(seed);
    for (const slot of formationOf(state).pozycje) {
      expect(state.kadra.filter((z) => z.poz === slot.kod).length, `seed ${seed} ${slot.kod}`).toBe(
        slot.kadra
      );
    }
  }
});
