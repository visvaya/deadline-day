import { describe, expect, test } from "vitest";

import { CLUBS, clubById } from "../../src/data/clubs";
import { FORMACJE } from "../../src/data/positions";
import type { FormationId, GameState } from "../../src/data/types";
import { buildCareerBaseline } from "../../src/logic/career-baseline";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { pick, createRng } from "../../src/logic/rng";
import { testClub, testManager } from "./fixtures";

/**
 * Task 6A: the reducer's club-first START_CAREER, replacing the old
 * CHOOSE_DIFFICULTY draw.
 */

const otherManager = { firstName: "Zofia", lastName: "Wiśniewska" };

const startGame = (state: GameState, manager = testManager): GameState =>
  gameReducer(state, { type: "START_GAME", manager });

const startCareer = (
  state: GameState,
  clubId: string,
  seed: number,
  manager = testManager
): GameState => gameReducer(state, { type: "START_CAREER", clubId, manager, seed });

describe("START_GAME", () => {
  test("normalises and stores the manager, then moves to wybor", () => {
    const started = startGame(initialState(), {
      firstName: "  Jan   Maria  ",
      lastName: "Kowalski",
    });
    expect(started.faza).toBe("wybor");
    expect(started.manager).toEqual({ firstName: "Jan Maria", lastName: "Kowalski" });
  });

  test("a malformed manager is refused - the same state comes back", () => {
    const base = initialState();
    const rejected = startGame(base, { firstName: "", lastName: "Kowalski" });
    expect(rejected).toBe(base);
  });
});

describe("START_CAREER", () => {
  test("builds a career from the chosen club, not a drawn one", () => {
    const started = startCareer(startGame(initialState()), testClub.clubId, 1);
    expect(started.club).toEqual(testClub);
    expect(started.faza).toBe("przeglad");
  });

  test("freezes the career baseline from the club alone", () => {
    const started = startCareer(startGame(initialState()), testClub.clubId, 1);
    expect(started.careerBaseline).toEqual(buildCareerBaseline(testClub.clubId));
  });

  test("an unknown club id is refused - the same state comes back", () => {
    const base = startGame(initialState());
    const rejected = startCareer(base, "fc-nieistniejacy", 1);
    expect(rejected).toBe(base);
  });

  test("a malformed manager is refused even with a valid club", () => {
    const base = startGame(initialState());
    const rejected = startCareer(base, testClub.clubId, 1, { firstName: "", lastName: "X" });
    expect(rejected).toBe(base);
  });

  test("is deterministic: same club, seed and manager reproduce the same career", () => {
    const a = startCareer(startGame(initialState()), testClub.clubId, 42);
    const b = startCareer(startGame(initialState()), testClub.clubId, 42);
    expect(a).toEqual(b);
  });

  test("two different managers produce an identical trace - the manager never reaches it", () => {
    const withJan = startCareer(
      startGame(initialState(), testManager),
      testClub.clubId,
      7,
      testManager
    );
    const withZofia = startCareer(
      startGame(initialState(), otherManager),
      testClub.clubId,
      7,
      otherManager
    );
    expect(withZofia.trace).toEqual(withJan.trace);
    expect(withZofia.kadra).toEqual(withJan.kadra);
    expect(withZofia.rngState).toBe(withJan.rngState);
    // The two careers do differ - in the one field a trace must never carry.
    expect(withZofia.manager).not.toEqual(withJan.manager);
  });

  test("the formation is the career's first draw - no club draw precedes it", () => {
    for (const seed of [1, 2, 3, 0x5eed0001]) {
      const started = startCareer(startGame(initialState()), testClub.clubId, seed);
      const rng = createRng(seed);
      const expectedFormation = pick(rng, Object.keys(FORMACJE) as FormationId[]);
      expect(started.formacja).toBe(expectedFormation);
    }
  });

  test("state.akcje records no start-of-career token, only later decisions", () => {
    const started = startCareer(startGame(initialState()), testClub.clubId, 1);
    expect(started.akcje).toEqual([]);
  });

  test("the trace's start line names the club, not a difficulty level", () => {
    const started = startCareer(startGame(initialState()), testClub.clubId, 1);
    const startEvent = started.trace[0];
    expect(startEvent!.type).toBe("start");
    if (startEvent!.type !== "start") return;
    expect(startEvent.clubId).toBe(testClub.clubId);
    expect(startEvent.club).toBe(testClub.shortName);
    expect("poziom" in startEvent).toBe(false);
  });

  test("GameState no longer carries poziom or klub", () => {
    const started = startCareer(startGame(initialState()), testClub.clubId, 1);
    expect("poziom" in started).toBe(false);
    expect("klub" in started).toBe(false);
  });

  test("CareerBaseline carries no baselineExpectedPlace", () => {
    const baseline = buildCareerBaseline(testClub.clubId);
    expect("baselineExpectedPlace" in baseline).toBe(false);
  });

  test("every one of the eighteen clubs can start a career", () => {
    for (const club of CLUBS) {
      const started = startCareer(startGame(initialState()), club.clubId, 1);
      expect(started.club?.clubId).toBe(club.clubId);
      expect(started.faza).toBe("przeglad");
    }
  });
});

describe("PLAY_AGAIN", () => {
  test("keeps the club, the manager and an equal baseline, with a new seed", () => {
    const started = startCareer(startGame(initialState()), testClub.clubId, 1);
    const again = gameReducer(started, { type: "PLAY_AGAIN", seed: 999 });
    expect(again.club).toEqual(started.club);
    expect(again.manager).toEqual(started.manager);
    expect(again.careerBaseline).toEqual(started.careerBaseline);
    expect(again.seed).toBe(999);
  });

  test("does nothing before any club has been chosen", () => {
    const base = startGame(initialState());
    expect(gameReducer(base, { type: "PLAY_AGAIN", seed: 1 })).toBe(base);
  });
});

describe("CONFIRM_RESTART", () => {
  test("returns to wybor, keeps the manager, clears the club and the baseline", () => {
    const started = startCareer(startGame(initialState()), testClub.clubId, 1);
    const restarted = gameReducer(started, { type: "CONFIRM_RESTART" });
    expect(restarted.faza).toBe("wybor");
    expect(restarted.manager).toEqual(started.manager);
    expect(restarted.club).toBeNull();
    expect(restarted.careerBaseline).toBeNull();
  });
});

describe("resolveClubById used by START_CAREER", () => {
  test("resolves every club id in the catalogue", () => {
    for (const club of CLUBS) {
      expect(clubById(club.clubId)).toEqual(club);
    }
  });
});
