import { beforeAll, expect, test } from "vitest";

import { FORMACJE } from "../../src/data/positions";
import { CLUBS } from "../../src/data/clubs";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { clubRating } from "../../src/logic/league-ratings";
import { autoAdvance, simulateGame } from "../../src/logic/simulate";
import { alwaysPass } from "../../src/logic/simulate-policies";
import { createRng } from "../../src/logic/rng";
import { createSquadFromFormation, formationOf, startingXi } from "../../src/logic/squad";
import type { GameState } from "../../src/data/types";
import { testManager } from "./fixtures";

// Three clubs standing in for the old latwy/sredni/trudny spread - one
// strong, one mid-table, one weak - so tests written against three levels
// keep exercising a similar range of career shapes.
const LEVELS = ["lech-poznan", "gornik-zabrze", "wieczysta-krakow"] as const;
const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88];

const started = (clubId: string, seed: number) =>
  gameReducer(gameReducer(initialState(), { type: "START_GAME", manager: testManager }), {
    type: "START_CAREER",
    clubId,
    manager: testManager,
    seed,
  });

/** Careers walked step by step. Deliberately few: each is thousands of
 * dispatches, and these tests are about shape, which does not need volume. */
const WALKED_SEEDS = [11, 22, 33];

/** Phases where the squad is a record of what happened rather than a team
 * that has to take the field. */
const handedOver = (state: GameState): boolean =>
  state.faza === "werdykt" || state.faza === "final";

/** Every invariant that can only be seen mid-career, one list each. */
const strays: string[] = [];
const emptied: string[] = [];
const shortXi: string[] = [];

/**
 * Walks nine careers one dispatch at a time and checks all three invariants
 * as it goes.
 *
 * Deliberately streams rather than collecting the states: retaining them was
 * twenty-seven thousand full game states and ran the heap out of memory. It
 * is also one walk rather than one per test, because a career is thousands
 * of dispatches and doing it three times blew the per-test time limit.
 *
 * Mid-career is the point. simulateGame only hands back where a career
 * ended, which is how the first round of invariants missed ageSquad never
 * getting a formation: a squad can be perfect on day one, drift out of shape
 * at the first season boundary, and look fine again by the final screen.
 */
beforeAll(() => {
  for (const id of LEVELS) {
    for (const seed of WALKED_SEEDS) {
      let state = started(id, seed);
      const formation = formationOf(state);
      const allowed = new Set(formation.pozycje.map((slot) => slot.kod));

      for (let step = 0; state.faza !== "final" && step < 5000; step += 1) {
        const where = `${id}/${seed} step ${step} (${state.faza})`;

        if (state.formacja !== formation.id) {
          strays.push(`${where}: formation changed to ${state.formacja}`);
        }
        for (const player of state.kadra) {
          if (!allowed.has(player.poz)) strays.push(`${where}: stray ${player.poz}`);
        }
        if (!handedOver(state)) {
          for (const slot of formation.pozycje) {
            if (!state.kadra.some((z) => z.poz === slot.kod)) {
              emptied.push(`${where}: nobody at ${slot.kod}`);
            }
          }
          const xi = startingXi(state.kadra, formation).length;
          if (xi < 9 || xi > 11) shortXi.push(`${where}: ${xi} players`);
        }

        const next = state.karta
          ? gameReducer(state, { type: "DECIDE", choice: "pass" })
          : autoAdvance(state);
        if (!next) break;
        state = next;
      }
    }
  }
}, 120_000);

test("a fresh career always fields a full eleven", () => {
  for (const id of LEVELS) {
    for (const seed of SEEDS) {
      const state = started(id, seed);
      expect(startingXi(state.kadra, formationOf(state)), `${id}/${seed}`).toHaveLength(11);
    }
  }
});

test("the squad carries every position the formation needs, at its depth", () => {
  for (const id of LEVELS) {
    for (const seed of SEEDS) {
      const state = started(id, seed);
      for (const slot of formationOf(state).pozycje) {
        expect(
          state.kadra.filter((z) => z.poz === slot.kod).length,
          `${id}/${seed} ${slot.kod}`
        ).toBe(slot.kadra);
      }
    }
  }
});

test("no card in a whole career offers a position the formation lacks", () => {
  // Reads the trace rather than driving the reducer: every decision event
  // carries the offered position, so this covers the market, PANIC, the
  // academy and the epilogue in one pass.
  for (const id of LEVELS) {
    for (const seed of SEEDS.slice(0, 4)) {
      const result = simulateGame({ seed, clubId: id, policy: alwaysPass });
      const allowed = new Set(formationOf(result.state).pozycje.map((slot) => slot.kod));
      for (const event of result.events) {
        if (event.type !== "decision") continue;
        expect(allowed.has(event.poz as never), `${id}/${seed} offered ${event.poz}`).toBe(true);
      }
    }
  }
});

test("a whole career runs to the legacy screen", () => {
  // The broadest net here: a position code leaking anywhere surfaces as a
  // crash, or as a career that never reaches the final screen.
  for (const id of LEVELS) {
    for (const seed of SEEDS) {
      const result = simulateGame({ seed, clubId: id, policy: alwaysPass });
      expect(result.state.faza, `${id}/${seed}`).toBe("final");
      expect(result.state.finalne, `${id}/${seed}`).not.toBeNull();
    }
  }
});

test("the formation never changes mid-career", () => {
  const first = started("gornik-zabrze", 99).formacja;
  const result = simulateGame({ seed: 99, clubId: "gornik-zabrze", policy: alwaysPass });
  expect(result.state.formacja).toBe(first);
});

test("the squad keeps its shape at every step, not only on day one", () => {
  // Season ends age the squad, retire players and refill from the academy;
  // the epilogue does it three more times without the player watching. Each
  // of those is a place where a stray position code could creep in or the
  // formation drift, and none of it shows in the final state alone. This is
  // the gap that let ageSquad run without a formation until 2026-08-17.
  expect(strays.slice(0, 5)).toEqual([]);
});

test("no position ever empties out, at any point in a career", () => {
  // This one IS absolute, and fillEmptyPositions is what guarantees it: an
  // empty position would mean a tile with nobody in it and a rating computed
  // as if that part of the pitch did not exist.
  expect(emptied.slice(0, 5)).toEqual([]);
});

test("the eleven can go short, but never collapses", () => {
  // Deliberately NOT an assertion that eleven can always be fielded, because
  // that is not what the game guarantees. A position carries xi + 1 players,
  // so two retirements in one season at the same position leave it a man
  // short - measured at 19% of careers, bottoming out at nine. That is a
  // hole in the squad the player is meant to go and fill, and the squad
  // screen already renders the empty slot.
  //
  // What is pinned here is the floor. A career dropping below nine would
  // mean something is eating the squad rather than thinning it.
  expect(shortXi.slice(0, 5)).toEqual([]);
});

test("every playable club can be built into a squad", () => {
  // Walks all eighteen clubs directly, rather than relying on whichever one
  // is chosen in a given test's `started()` call to exercise them all.
  for (const club of CLUBS) {
    const rating = clubRating(club);
    for (const formation of Object.values(FORMACJE)) {
      const kadra = createSquadFromFormation(createRng(1), formation, rating);
      expect(startingXi(kadra, formation), `${club.shortName}/${formation.id}`).toHaveLength(11);
    }
  }
});

// Starts 300 careers and timed out at the 5 s default under full-suite load.
test("every formation is reachable", () => {
  const seen = new Set<string>();
  for (let seed = 0; seed < 300; seed += 1) seen.add(started("gornik-zabrze", seed).formacja);
  expect(seen.size, `only saw ${[...seen].join(", ")}`).toBe(Object.keys(FORMACJE).length);
}, 30_000);
