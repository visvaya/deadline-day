import { expect, test } from "vitest";

import type { GameState, LeagueStanding } from "../../src/data/types";
import { RELEGATED_COUNT } from "../../src/data/balance";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { autoAdvance } from "../../src/logic/simulate";
import { formationOf, startingXi } from "../../src/logic/squad";
import { testClub, testManager } from "./fixtures";

/** Half-season and end-of-season snapshot of one club's league position. */
type Snapshot = {
  polowa: readonly LeagueStanding[];
  koniec: readonly LeagueStanding[];
  xiOvrPolowa: number;
  xiOvrKoniec: number;
  miejscePolowa: number;
  miejsceKoniec: number;
};

const xiOvr = (state: GameState): number => {
  const xi = startingXi(state.kadra, formationOf(state));
  return xi.reduce((sum, p) => sum + p.ovr, 0) / xi.length;
};

const positionOf = (tabela: readonly LeagueStanding[], klub: string): number =>
  tabela.findIndex((row) => row.club === klub) + 1;

/**
 * Plays the first season of a career, passing on every card, and records the
 * league table at the half-way point and at the end.
 *
 * Passing keeps the squad the game dealt, which is what makes the two OVR
 * readings comparable: whatever moves between the snapshots is development
 * and retirement, not shopping.
 */
const playFirstSeason = (seed: number, boost = 0): Snapshot => {
  let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
  state = gameReducer(state, {
    type: "START_CAREER",
    clubId: testClub.clubId,
    manager: testManager,
    seed,
  });
  if (boost !== 0) {
    state = {
      ...state,
      kadra: state.kadra.map((p) => ({ ...p, ovr: Math.min(99, p.ovr + boost) })),
    };
  }
  const klub = state.club!.shortName;

  let polowa: readonly LeagueStanding[] = [];
  let xiOvrPolowa = 0;
  let guard = 0;
  while (state.faza !== "final") {
    guard += 1;
    if (guard > 5000) throw new Error("season driver exceeded its step guard");

    if (state.faza === "polSezonu" && polowa.length === 0) {
      polowa = state.tabela!;
      xiOvrPolowa = xiOvr(state);
    }
    if (state.faza === "koniecSezonu" && polowa.length > 0) {
      return {
        polowa,
        koniec: state.tabela!,
        xiOvrPolowa,
        xiOvrKoniec: xiOvr(state),
        miejscePolowa: positionOf(polowa, klub),
        miejsceKoniec: positionOf(state.tabela!, klub),
      };
    }

    const advanced = autoAdvance(state);
    if (advanced) {
      state = advanced;
      continue;
    }
    state = gameReducer(state, { type: "DECIDE", choice: "pass" });
  }
  throw new Error("the first season never reached its end");
};

/**
 * The half-way table is the same table, halfway through - not a separate
 * draw that the spring quietly replaces.
 *
 * Worth pinning because the two are computed in the same branch of
 * symulujRunde and it would be easy to reset the standings at the spring
 * round: the game would still look right season by season, and the player's
 * autumn would simply stop counting.
 */
test("the final table continues the half-way table rather than replacing it", () => {
  for (const seed of [0x11_11, 0x22_22, 0x33_33, 0x44_44]) {
    const { polowa, koniec } = playFirstSeason(seed);

    expect(polowa).toHaveLength(koniec.length);
    expect([...polowa.map((r) => r.club)].sort()).toEqual([...koniec.map((r) => r.club)].sort());

    for (const half of polowa) {
      const full = koniec.find((row) => row.club === half.club)!;
      expect(full.points).toBeGreaterThanOrEqual(half.points);
      // Seventeen matches left, so nobody can add more than 51 points, and
      // goals only ever accumulate.
      expect(full.points - half.points).toBeLessThanOrEqual(51);
      expect(full.goalsFor).toBeGreaterThanOrEqual(half.goalsFor);
      expect(full.goalsAgainst).toBeGreaterThanOrEqual(half.goalsAgainst);
    }
  }
});

/**
 * The match engine reads the squad, not the club's name.
 *
 * leagueRatings rates the player's club off startingXi, so lifting every
 * rating by eight has to move the club up the table. This is the check that
 * would catch a rating pipeline that silently fell back to the snapshot -
 * exactly what the missing-formation bug did in August, when the club was
 * rated off five players and nothing complained.
 */
test("a better squad finishes higher - the engine reads ovr", () => {
  const seeds = [0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58];
  let base = 0;
  let boosted = 0;
  for (const seed of seeds) {
    base += playFirstSeason(seed).miejsceKoniec;
    boosted += playFirstSeason(seed, 8).miejsceKoniec;
  }

  expect(boosted / seeds.length).toBeLessThan(base / seeds.length - 1);
}, 60000);

/**
 * Relegation sits at the bottom of the ovr range and Europe at the top, in
 * both halves of the season.
 *
 * Measured rather than asserted tightly: the point is the ordering and the
 * fact that it is already visible at the half-way stage, not the exact gap.
 */
test("relegation and Europe separate by squad ovr, at the half-way point as well as the end", () => {
  const relegated: number[] = [];
  const european: number[] = [];
  const halfRelegated: number[] = [];
  const halfEuropean: number[] = [];

  for (let seed = 0x900; seed < 0x900 + 24; seed += 1) {
    const snap = playFirstSeason(seed);
    const dropFrom = snap.koniec.length - RELEGATED_COUNT + 1;

    if (snap.miejsceKoniec >= dropFrom) relegated.push(snap.xiOvrKoniec);
    if (snap.miejsceKoniec <= 4) european.push(snap.xiOvrKoniec);
    if (snap.miejscePolowa >= dropFrom) halfRelegated.push(snap.xiOvrPolowa);
    if (snap.miejscePolowa <= 4) halfEuropean.push(snap.xiOvrPolowa);
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  expect(relegated.length).toBeGreaterThan(0);
  expect(european.length).toBeGreaterThan(0);
  expect(mean(european)).toBeGreaterThan(mean(relegated));
  if (halfRelegated.length > 0 && halfEuropean.length > 0) {
    expect(mean(halfEuropean)).toBeGreaterThan(mean(halfRelegated));
  }
}, 60000);
