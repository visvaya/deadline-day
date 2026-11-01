import { describe, expect, test } from "vitest";

import type { GameState } from "../../src/data/types";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { createRng } from "../../src/logic/rng";
import { acquisitionCapacityOutcome, formationOf } from "../../src/logic/squad";
import { autoAdvance } from "../golden/headless";
import { makeTestPlayer, testClub, testManager } from "./fixtures";

/**
 * Values pinned from the generator AS IT STOOD before `draws()` was added,
 * captured by running the old Mulberry32 body standalone. Two instances of
 * the new code agreeing with each other would prove nothing about the old
 * stream - only a frozen literal can do that, and the golden traces depend
 * on this stream being untouched.
 */
const LEGACY_STREAM: ReadonlyArray<{
  seed: number;
  values: readonly number[];
  state: number;
}> = [
  {
    seed: 0,
    values: [
      0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111,
      0.46732782293111086, 0.5450490827206522, 0.6152513844426721, 0.6489853798411787,
    ],
    state: 1767624616,
  },
  {
    seed: 123,
    values: [
      0.7872516233474016, 0.1785435655619949, 0.49531551403924823, 0.23136196262203157,
      0.375791602069512, 0.8333538440056145, 0.8636805524583906, 0.9290936258621514,
    ],
    state: 1767624739,
  },
  {
    seed: 0xffffffff,
    values: [
      0.8964226141106337, 0.189478256739676, 0.7156526781618595, 0.9440599093213677,
      0.8452364315744489, 0.5391399988438934, 0.6804977387655526, 0.4755720964167267,
    ],
    state: 1767624615,
  },
];

describe("the draw counter leaves the stream alone", () => {
  test.each(LEGACY_STREAM)(
    "seed $seed still produces the pinned values",
    ({ seed, values, state }) => {
      const rng = createRng(seed);
      expect(Array.from(values, () => rng.next())).toEqual(values);
      expect(rng.state()).toBe(state);
    }
  );
});

describe("draws()", () => {
  test("starts at zero", () => {
    expect(createRng(7).draws()).toBe(0);
  });

  test("counts exactly one per next()", () => {
    const rng = createRng(7);
    for (let i = 1; i <= 25; i += 1) {
      rng.next();
      expect(rng.draws()).toBe(i);
    }
  });

  test("reading draws() or state() draws nothing", () => {
    const rng = createRng(7);
    rng.next();
    rng.state();
    rng.draws();
    rng.state();
    expect(rng.draws()).toBe(1);
    // And the stream is exactly where the single draw left it: the second
    // value of a fresh generator, not a third one.
    const reference = createRng(7);
    reference.next();
    expect(rng.next()).toBe(reference.next());
  });

  test("a resumed instance counts its own draws, not the ones before it", () => {
    const source = createRng(4242);
    for (let i = 0; i < 17; i += 1) source.next();
    expect(source.draws()).toBe(17);

    const resumed = createRng(source.state());
    expect(resumed.draws()).toBe(0);
    resumed.next();
    resumed.next();
    expect(resumed.draws()).toBe(2);
    expect(source.draws()).toBe(17);
  });
});

/**
 * The counter carried in GameState. Mulberry32's word advances by a fixed
 * constant per draw, so `state` after n draws from w is w + n * 0x6d2b79f5
 * (mod 2^32): replaying the recorded number of draws from the previous
 * `rngState` must land exactly on the new one. That makes the assertion
 * below a real check of the count, not a restatement of the reducer.
 */
const advanceState = (from: number, draws: number): number => {
  const rng = createRng(from);
  for (let i = 0; i < draws; i += 1) rng.next();
  return rng.state();
};

const expectCounterMatchesStream = (base: GameState, next: GameState): void => {
  const delta = next.rngDrawCount - base.rngDrawCount;
  expect(Number.isSafeInteger(delta)).toBe(true);
  expect(delta).toBeGreaterThanOrEqual(0);
  expect(advanceState(base.rngState, delta)).toBe(next.rngState);
};

const started = (seed: number, clubId: string = testClub.clubId): GameState => {
  const state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
  return gameReducer(state, { type: "START_CAREER", clubId, manager: testManager, seed });
};

describe("rngDrawCount in GameState", () => {
  test("initialState starts at zero", () => {
    expect(initialState().rngDrawCount).toBe(0);
  });

  test("the start counts every draw, the market roll included", () => {
    const state = started(0x5eed0001);
    expect(state.rngDrawCount).toBeGreaterThan(0);
    // Counted from the seed, not from whatever came before: a fresh career
    // resets the counter rather than continuing the previous one.
    expect(advanceState(state.seed!, state.rngDrawCount)).toBe(state.rngState);
  });

  test("a second career resets rather than accumulates", () => {
    const first = started(0x5eed0001);
    let played = gameReducer(first, { type: "OPEN_OFFERS" });
    played = gameReducer(played, { type: "DECIDE", choice: "pass" });
    expect(played.rngDrawCount).toBeGreaterThan(first.rngDrawCount);

    const again = gameReducer(played, { type: "PLAY_AGAIN", seed: 0x5eed0002 });
    expect(advanceState(again.seed!, again.rngDrawCount)).toBe(again.rngState);
    expect(again.rngDrawCount).toBeLessThan(played.rngDrawCount + first.rngDrawCount);
  });

  test("two drawing dispatches in a row accumulate exactly once each", () => {
    const start = started(0x5eed0001);
    const opened = gameReducer(start, { type: "OPEN_OFFERS" });
    expectCounterMatchesStream(start, opened);
    const decided = gameReducer(opened, { type: "DECIDE", choice: "pass" });
    expectCounterMatchesStream(opened, decided);
    // And cumulatively, all the way back to the seed.
    expect(advanceState(start.seed!, decided.rngDrawCount)).toBe(decided.rngState);
  });

  test("actions that draw nothing leave the counter alone", () => {
    const start = started(0x5eed0001);
    const opened = gameReducer(start, { type: "OPEN_OFFERS" });
    for (const action of [
      { type: "STALL" } as const,
      { type: "TOGGLE_TIMER" } as const,
      { type: "ASK_RESTART" } as const,
    ]) {
      const next = gameReducer(opened, action);
      expect(next.rngDrawCount).toBe(opened.rngDrawCount);
      expect(next.rngState).toBe(opened.rngState);
    }
  });

  test("a timeout pass counts its draws like a deliberate one", () => {
    const opened = gameReducer(started(0x5eed0001), { type: "OPEN_OFFERS" });
    const expiring: GameState = { ...opened, czas: 1, timerWl: true };
    const ticked = gameReducer(expiring, { type: "TICK" });
    // The expiry passes on the card and deals the next one, so the phase is
    // still "okno"; what proves the pass happened is the decision event.
    expect(ticked.decisionIndex).toBe(expiring.decisionIndex + 1);
    expect(ticked.rngDrawCount).toBeGreaterThan(expiring.rngDrawCount);
    expectCounterMatchesStream(expiring, ticked);
  });

  test("the counter tracks the stream through a whole career", () => {
    let state = started(0x5eed0007);
    let guard = 0;
    const seen = new Set<string>();
    while (state.faza !== "final") {
      guard += 1;
      if (guard > 5000) throw new Error("career did not finish");
      const before = state;
      const advanced = autoAdvance(state);
      if (advanced) {
        seen.add(before.faza);
        state = advanced;
      } else if (state.faza === "okno" && state.karta) {
        state = gameReducer(state, { type: "DECIDE", choice: "pass" });
        seen.add("okno");
      } else {
        throw new Error(`stuck in ${state.faza}`);
      }
      expectCounterMatchesStream(before, state);
    }
    // ADVANCE (rounds and epilogue pages), OPEN_OFFERS and RUN_EPILOGUE all
    // went through the assertion above, not just the card decisions.
    expect(seen.has("przeglad")).toBe(true);
    expect(seen.has("koniecSezonu") || seen.has("polSezonu")).toBe(true);
    expect(seen.has("werdykt")).toBe(true);
  });

  test("a squad-eviction confirmation counts its draws", () => {
    // Built by hand rather than hunted for across seeds: 4-3-3 holds two
    // keepers plus a four-deep bench, so a seventh forces the cut.
    const opened = gameReducer(started(0x5eed0001), { type: "OPEN_OFFERS" });
    const keepers = Array.from({ length: 6 }, (_, i) =>
      makeTestPlayer(`keeper${i}`, { poz: "BR", ovr: 50 + i, wiek: 26 })
    );
    const incoming = makeTestPlayer("incoming", { poz: "BR", ovr: 70, wiek: 24 });
    const state: GameState = {
      ...opened,
      kadra: keepers,
      kasa: 100,
      karta: { ...opened.karta!, typ: "WOLNY", zawodnik: incoming, cena: 0 },
    };
    const outcome = acquisitionCapacityOutcome(state.kadra, incoming, formationOf(state));
    expect(outcome.kind).toBe("evictsExisting");

    const next = gameReducer(state, {
      type: "CONFIRM_SQUAD_EVICTION",
      choice: "take",
      offerPlayerId: incoming.id,
      evictedPlayerId: outcome.kind === "evictsExisting" ? outcome.player.id : "",
    });
    expect(next).not.toBe(state);
    expect(next.rngDrawCount).toBeGreaterThan(state.rngDrawCount);
    expectCounterMatchesStream(state, next);
  });
});
