/**
 * @vitest-environment jsdom
 */
/**
 * The club's report memory, as the reducer actually writes it.
 *
 * The rule itself lives in tests/logic/staff-confidence-rule.test.ts. What is
 * pinned here is the part only the reducer can get wrong: WHEN an entry is
 * written, which season it belongs to, and that none of it depends on whether
 * anybody opened a drawer.
 */
import { expect, test } from "vitest";

import type { GameState, Player } from "../../src/data/types";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { createStaffAssessment } from "../../src/logic/staff-assessment";
import { testClub, testManager } from "./fixtures";
import { createSquadReports, squadPlayingTime } from "../../src/logic/squad-reports";
import { formationOf } from "../../src/logic/squad";
import { autoAdvance } from "../golden/headless";
import { wasMeasured } from "../../src/ui/components/player-tile-utils";

const start = (seed: number): GameState => {
  const begun = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
  return gameReducer(begun, {
    type: "START_CAREER",
    clubId: testClub.clubId,
    manager: testManager,
    seed,
  });
};

const advanceUntil = (
  state: GameState,
  predicate: (_s: GameState) => boolean,
  onOffer: (_s: GameState) => "take" | "pass" = () => "pass"
): GameState => {
  let current = state;
  for (let guard = 0; guard < 5000; guard += 1) {
    if (predicate(current)) return current;
    const advanced = autoAdvance(current);
    if (advanced) {
      current = advanced;
      continue;
    }
    if (current.faza === "okno" && current.karta) {
      current = gameReducer(current, { type: "DECIDE", choice: onOffer(current) });
      continue;
    }
    throw new Error(`Stuck in phase "${current.faza}"`);
  }
  throw new Error("Exceeded step guard");
};

const seasonOf = (state: GameState): number => {
  const step = state.kroki[state.krok];
  return "sezon" in step! ? step.sezon : 0;
};

test("the starting squad is remembered from season one", () => {
  const state = start(0x5711_0001);

  expect(Object.keys(state.staffMemory)).toHaveLength(state.kadra.length);
  for (const player of state.kadra) {
    const memo = state.staffMemory[player.id];
    expect(memo!.season).toBe(1);
    expect(memo!.seasonsObserved).toBe(1);
  }
});

test("a bought player is remembered from the season he arrived, with the card's verdict", () => {
  // The scout's verdict on the offer card IS what the club now remembers -
  // inherited verbatim, so the coach cannot contradict it a moment later.
  let state = start(0x5711_0002);
  let signed: { player: Player; season: number; card: GameState["karta"] } | null = null;

  for (let guard = 0; guard < 500 && signed === null; guard += 1) {
    const advanced = autoAdvance(state);
    if (advanced) {
      state = advanced;
      continue;
    }
    if (state.faza !== "okno" || !state.karta) throw new Error(`Stuck in "${state.faza}"`);
    const card = state.karta;
    const season = seasonOf(state);
    const before = state.kadra.length;
    const buying = card.typ === "KUPNO" || card.typ === "PANIC";
    state = gameReducer(state, { type: "DECIDE", choice: buying ? "take" : "pass" });
    if (buying && state.kadra.length > before) {
      signed = { player: card.zawodnik, season, card };
    }
  }

  expect(signed).not.toBeNull();
  const memo = state.staffMemory[signed!.player.id];
  expect(memo!.season).toBe(signed!.season);
  expect(memo!.seasonsObserved).toBe(1);
  expect(memo!.outlook).toBe(signed!.card!.staffAssessment.outlook);
  expect(memo!.confidence).toBe(signed!.card!.staffAssessment.confidence);
});

test("the memo refreshes once per season and drops whoever left", () => {
  const first = start(0x5711_0003);
  const before = new Set(first.kadra.map((player) => player.id));

  const afterSeason = advanceUntil(first, (s) => s.faza === "koniecSezonu");

  // The map matches the squad exactly - no ghosts of retired or sold players,
  // and no player without an entry.
  expect(new Set(Object.keys(afterSeason.staffMemory))).toEqual(
    new Set(afterSeason.kadra.map((player) => player.id))
  );
  // Refreshed for the season AHEAD, after development, not the one ending.
  for (const player of afterSeason.kadra) {
    expect(afterSeason.staffMemory[player.id]!.season).toBe(seasonOf(afterSeason) + 1);
  }
  // Everyone who survived has been watched for two seasons now; the academy
  // debutants stamped at the end of this season have exactly one entry, and it
  // is their first.
  for (const player of afterSeason.kadra) {
    const memo = afterSeason.staffMemory[player.id];
    expect(memo!.seasonsObserved).toBe(before.has(player.id) ? 2 : 1);
  }
});

const passiveStep = (state: GameState): GameState | null =>
  autoAdvance(state) ??
  (state.faza === "okno" && state.karta
    ? gameReducer(state, { type: "DECIDE", choice: "pass" })
    : null);

/**
 * A season end that is guaranteed to call up an academy debutant.
 *
 * Debutants appear only when a position is left empty, which a passive career
 * almost never does on its own - a test waiting for one passed without
 * checking anything. So the state one dispatch before the settlement has one
 * whole position removed, and the settlement has to refill it.
 */
const seasonEndWithDebutant = (seed: number): { before: GameState; after: GameState } => {
  let current = start(seed);
  for (let guard = 0; guard < 5000; guard += 1) {
    const next = passiveStep(current);
    if (next === null) throw new Error(`Stuck in phase "${current.faza}"`);
    if (next.faza === "koniecSezonu") {
      const emptied = formationOf(current).pozycje[0]!.kod;
      const before = { ...current, kadra: current.kadra.filter((p) => p.poz !== emptied) };
      const after = passiveStep(before);
      if (after?.faza !== "koniecSezonu")
        throw new Error("The emptied state missed the season end");
      return { before, after };
    }
    current = next;
  }
  throw new Error("Exceeded step guard");
};

const debutantsOf = ({ before, after }: { before: GameState; after: GameState }): Player[] => {
  const known = new Set(before.kadra.map((player) => player.id));
  return after.kadra.filter((player) => !known.has(player.id));
};

test("an academy debutant is remembered from the season the player will see him", () => {
  // fillEmptyPositions runs at the end of a season, but nobody will see the
  // debutant's report until the next one - so the memo belongs to the season
  // ahead, the same season his wKlubieOd names.
  const seasonEnd = seasonEndWithDebutant(0x5711_0004);
  const debutants = debutantsOf(seasonEnd);

  expect(debutants.length).toBeGreaterThan(0);
  for (const player of debutants) {
    expect(seasonEnd.after.staffMemory[player.id]!.season).toBe(player.wKlubieOd);
  }
});

test("a season-end academy debutant joins the season ahead, his contract does not move", () => {
  // He was not in the squad when development ran, so the delta screens must
  // read him as unmeasured ("?"), not as measured and unchanged ("0"). Only
  // wKlubieOd moves: kontraktOd gates PRZEDLUZENIE, so it keeps the season
  // that ended and the engine (and every golden trace) stays as it was.
  const seasonEnd = seasonEndWithDebutant(0x5711_0004);
  const ended = seasonEnd.after.ovrChange.season;
  const debutants = debutantsOf(seasonEnd);

  expect(ended).toBe(1);
  expect(debutants.length).toBeGreaterThan(0);
  for (const player of debutants) {
    expect(player.wKlubieOd).toBe(ended + 1);
    expect(player.kontraktOd).toBe(ended);
    expect(wasMeasured(player.wKlubieOd, ended)).toBe(false);
  }
});

test("confidence never falls across a whole career", () => {
  const LADDER = { low: 0, medium: 1, high: 2 } as const;
  let state = start(0x5711_0005);
  const seen = new Map<string, number>();

  for (let guard = 0; guard < 3000 && state.faza !== "final"; guard += 1) {
    for (const [id, memo] of Object.entries(state.staffMemory)) {
      const previous = seen.get(id);
      if (previous !== undefined) {
        expect(LADDER[memo.confidence], `${id} fell`).toBeGreaterThanOrEqual(previous);
      }
      seen.set(id, LADDER[memo.confidence]);
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
    throw new Error(`Stuck in "${state.faza}"`);
  }
  expect(seen.size).toBeGreaterThan(0);
});

test("one player in one season gets one verdict, whichever screen asks", () => {
  const state = advanceUntil(start(0x5711_0006), (s) => s.faza === "okno" && s.karta !== null);
  const formation = formationOf(state);
  const playingTime = squadPlayingTime(state.kadra, formation);
  const period = { season: seasonOf(state), window: "summer" } as const;

  for (const player of state.kadra) {
    const memo = state.staffMemory[player.id] ?? null;
    const fromDrawer = createSquadReports(
      player,
      period,
      68,
      playingTime.get(player.id)!,
      memo
    ).staffAssessment;
    const fromCard = createStaffAssessment(player, period, "coach", memo);

    expect(fromCard.outlook).toBe(fromDrawer.outlook);
    expect(fromCard.confidence).toBe(fromDrawer.confidence);
  }
});

test("reading a report changes nothing, so looking cannot alter the career", () => {
  // Two identical runs, one of which reads every player's report at every
  // window. The reports are pure and the memory is written by the reducer, so
  // the two must end byte-identical.
  const run = (peek: boolean): GameState => {
    let state = start(0x5711_0007);
    for (let guard = 0; guard < 3000 && state.faza !== "final"; guard += 1) {
      if (peek && state.faza === "okno") {
        const formation = formationOf(state);
        const playingTime = squadPlayingTime(state.kadra, formation);
        for (const player of state.kadra) {
          createSquadReports(
            player,
            { season: seasonOf(state), window: "summer" },
            68,
            playingTime.get(player.id)!,
            state.staffMemory[player.id] ?? null
          );
        }
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
      throw new Error(`Stuck in "${state.faza}"`);
    }
    return state;
  };

  expect(run(true).staffMemory).toEqual(run(false).staffMemory);
});
