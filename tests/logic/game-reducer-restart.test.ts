import { expect, test } from "vitest";

import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { testClub, testManager } from "./fixtures";

/**
 * applyChooseDifficulty builds the new state with `...base`, so every field
 * it does not name explicitly survives PLAY_AGAIN. The membership and the
 * relegation flag are exactly the kind that would: a second career would
 * start from the league the first one left behind, already relegated.
 */
test("a new career starts from a fresh league, not the last one's", () => {
  let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
  state = gameReducer(state, {
    type: "START_CAREER",
    clubId: testClub.clubId,
    manager: testManager,
    seed: 1,
  });

  // Dirty the membership the way a played tenure would.
  const dirty = {
    ...state,
    relegated: true,
    membership: {
      clubs: state.membership.clubs.map((c) => ({ ...c, swaps: 3, tier: "pool" as const })),
    },
  };

  const again = gameReducer(dirty, { type: "PLAY_AGAIN", seed: 2 });

  expect(again.relegated).toBe(false);
  expect(again.membership.clubs.every((c) => c.swaps === 0)).toBe(true);
  expect(again.membership.clubs.filter((c) => c.tier === "league")).toHaveLength(18);
});
