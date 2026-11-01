/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import { clubById } from "../../src/data/clubs";
import type { GameState } from "../../src/data/types";
import { buildCareerBaseline } from "../../src/logic/career-baseline";
import { ENGINE_REVISION } from "../../src/logic/engine-version";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import {
  GAME_SAVE_STORAGE_KEY,
  clearGameSave,
  inspectGameSave,
  isResumable,
  readGameSave,
  writeGameSave,
} from "../../src/ui/game-save";
import { writeStoredJson } from "../../src/ui/local-storage";
import { autoAdvance } from "../golden/headless";
import { testClub, testManager } from "../logic/fixtures";

/**
 * Task 6B: schema 13 (club/manager/careerBaseline, no `poziom`/`klub`), bumped
 * to schema 14 by the buyer-capacity plan's Task 1 (LeagueClub.clubId), and to
 * schema 15 by Task 7 (Offer.buyer, checked by isActiveCard), and to schema 16
 * when Offer.tekst was dropped and passed-on offers began to carry their fee.
 * Also carries
 * the non-destructive `inspectGameSave` contract. Uses the real reducer
 * (START_GAME -> START_CAREER) rather than a hand-built fixture, so a
 * change to what the reducer actually produces cannot silently drift away
 * from what this file assumes it produces.
 */

const startGame = (state: GameState, manager = testManager): GameState =>
  gameReducer(state, { type: "START_GAME", manager });

const startCareer = (clubId: string = testClub.clubId, seed = 1): GameState =>
  gameReducer(startGame(initialState()), {
    type: "START_CAREER",
    clubId,
    manager: testManager,
    seed,
  });

/** Reaches the first open offer card, the shape most representative of an
 * interrupted mid-window career. */
const reachOpenOffer = (seed: number, clubId: string = testClub.clubId): GameState =>
  gameReducer(startCareer(clubId, seed), { type: "OPEN_OFFERS" });

const storeRaw = (value: unknown): void =>
  localStorage.setItem(GAME_SAVE_STORAGE_KEY, JSON.stringify(value));

const storeCurrent = (state: unknown, overrides: Record<string, unknown> = {}): void =>
  storeRaw({
    schemaVersion: 16,
    engineVersion: ENGINE_REVISION,
    savedAt: Date.now(),
    state,
    ...overrides,
  });

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("game-save schema 16", () => {
  test("round-trips an in-progress career", () => {
    const state = reachOpenOffer(0x3000_0001);
    expect(isResumable(state)).toBe(true);

    const before = Date.now();
    writeGameSave(state);
    const restored = readGameSave();

    expect(restored?.state).toEqual(state);
    expect(restored?.schemaVersion).toBe(16);
    expect(restored?.engineVersion).toBe(ENGINE_REVISION);
    expect(restored?.savedAt).toBeGreaterThanOrEqual(before);
  });

  test("resuming a save continues the same RNG stream, not a fresh one", () => {
    const state = reachOpenOffer(0x3000_0022);
    writeGameSave(state);
    const restored = readGameSave();
    expect(restored?.state.rngDrawCount).toBe(state.rngDrawCount);

    const uninterrupted = gameReducer(state, { type: "DECIDE", choice: "pass" });
    const resumed = gameReducer(restored!.state, { type: "DECIDE", choice: "pass" });
    expect(resumed.rngDrawCount).toBe(uninterrupted.rngDrawCount);
    expect(resumed.rngState).toBe(uninterrupted.rngState);
    expect(resumed.kadra).toEqual(uninterrupted.kadra);
  });

  test("keeps the legacy screen, which the archive does not hold", () => {
    const state = { ...reachOpenOffer(1), faza: "final" as const };
    expect(isResumable(state)).toBe(true);

    writeGameSave(state);
    expect(readGameSave()?.state.faza).toBe("final");
  });

  test("rejects a career that has not started (start/wybor)", () => {
    const state = startGame(initialState());
    expect(isResumable(state)).toBe(false);
    storeCurrent(state);
    expect(readGameSave()).toBeNull();
  });

  test("stays under half a megabyte for a late-game career", () => {
    const state = reachOpenOffer(0x3000_0002);
    writeGameSave(state);

    const raw = localStorage.getItem(GAME_SAVE_STORAGE_KEY) ?? "";
    expect(raw.length).toBeLessThan(512 * 1024);
  });

  test("clearGameSave removes the stored entry", () => {
    writeGameSave(reachOpenOffer(1));
    clearGameSave();
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();
  });

  test("does not throw when localStorage.setItem fails, and returns false instead", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    let result: boolean | undefined;
    expect(() => {
      result = writeGameSave(reachOpenOffer(1));
    }).not.toThrow();
    expect(result).toBe(false);
  });

  test("writeGameSave returns true when the write actually lands", () => {
    expect(writeGameSave(reachOpenOffer(1))).toBe(true);
  });
});

describe("local-storage writeStoredJson", () => {
  afterEach(() => vi.restoreAllMocks());

  test("returns true when setItem succeeds", () => {
    expect(writeStoredJson("deadline-day:test-key", { hello: "world" })).toBe(true);
    localStorage.removeItem("deadline-day:test-key");
  });

  test("returns false when Storage.prototype.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(writeStoredJson("deadline-day:test-key", { hello: "world" })).toBe(false);
  });
});

describe("game-save: schemas 7-12 are refused, not migrated", () => {
  test("rejects schema 12 - the shape schema 13 replaced, not extended", () => {
    const state = reachOpenOffer(1);
    // A schema-12 save simply has no club/manager/careerBaseline at all; the
    // closest honest stand-in is the current state with those three fields
    // stripped, exactly what an old save actually looked like.
    const asV12: Record<string, unknown> = { ...state };
    delete asV12.club;
    delete asV12.manager;
    delete asV12.careerBaseline;
    storeRaw({
      schemaVersion: 12,
      engineVersion: ENGINE_REVISION,
      savedAt: Date.now(),
      state: asV12,
    });

    expect(readGameSave()).toBeNull();
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();
  });

  test.each([7, 8, 9, 10, 11, 15])("rejects schema %i outright", (schemaVersion) => {
    storeRaw({
      schemaVersion,
      engineVersion: ENGINE_REVISION,
      savedAt: Date.now(),
      state: reachOpenOffer(1),
    });
    expect(readGameSave()).toBeNull();
  });
});

describe("game-save schema 16: guard rejections", () => {
  test("rejects malformed JSON", () => {
    localStorage.setItem(GAME_SAVE_STORAGE_KEY, "not-json");
    expect(readGameSave()).toBeNull();
  });

  test("rejects a save missing savedAt", () => {
    storeRaw({ schemaVersion: 16, engineVersion: ENGINE_REVISION, state: reachOpenOffer(1) });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a mismatched engine version", () => {
    storeCurrent(reachOpenOffer(1), { engineVersion: "2020-01-01.0" });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a state missing a required field", () => {
    const state: Partial<GameState> = { ...reachOpenOffer(1) };
    delete state.krok;
    storeCurrent(state);
    expect(readGameSave()).toBeNull();
  });

  test("rejects a save whose league membership is missing or broken", () => {
    const state = reachOpenOffer(1);

    const withoutMembership: Partial<GameState> = { ...state };
    delete withoutMembership.membership;
    storeCurrent(withoutMembership);
    expect(readGameSave()).toBeNull();

    storeCurrent({ ...state, membership: { clubs: [{}] } });
    expect(readGameSave()).toBeNull();

    storeCurrent({ ...state, membership: { clubs: state.membership.clubs.slice(1) } });
    expect(readGameSave()).toBeNull();
  });

  const validSavedState = () => reachOpenOffer(1);
  const readBack = (state: unknown) => {
    storeCurrent(state);
    return readGameSave();
  };

  test("a membership with a duplicate clubId is discarded", () => {
    const state = validSavedState();
    const clubs = [...state.membership.clubs];
    clubs[1] = { ...clubs[1]!, clubId: clubs[0]!.clubId };
    expect(readBack({ ...state, membership: { clubs } })).toBeNull();
  });

  test("a membership with an unknown clubId is discarded", () => {
    const state = validSavedState();
    const clubs = state.membership.clubs.map((c, i) =>
      i === 0 ? { ...c, clubId: "nie-istnieje" } : c
    );
    expect(readBack({ ...state, membership: { clubs } })).toBeNull();
  });

  test("a membership without the player's club is discarded", () => {
    const state = validSavedState();
    const own = state.club!.clubId;
    const stranger = state.membership.clubs.find((c) => c.clubId !== own && c.tier === "pool")!;
    const clubs = state.membership.clubs.map((c) =>
      c.clubId === own ? { ...c, clubId: stranger.clubId } : c
    );
    expect(readBack({ ...state, membership: { clubs } })).toBeNull();
  });

  test.each([
    ["missing", undefined],
    ["fractional", 12.5],
    ["negative", -1],
    ["NaN", Number.NaN],
    ["not a number", "412"],
  ])("rejects a save whose draw tally is %s", (_label, rngDrawCount) => {
    const state = reachOpenOffer(0x3000_0021);
    const broken: Record<string, unknown> = { ...state };
    if (rngDrawCount === undefined) delete broken.rngDrawCount;
    else broken.rngDrawCount = rngDrawCount;
    storeCurrent(broken);
    expect(readGameSave()).toBeNull();
  });

  test.each([
    ["a missing expected place", "seasonForecastExpectedPlace", undefined],
    ["an infinite expected place", "seasonForecastExpectedPlace", Number.POSITIVE_INFINITY],
    ["a missing european income", "seasonForecastEuropeanIncome", undefined],
    ["a NaN european income", "seasonForecastEuropeanIncome", Number.NaN],
  ])("rejects a save with %s", (_label, field, value) => {
    const state = reachOpenOffer(0x3000_0031);
    const broken: Record<string, unknown> = { ...state };
    if (value === undefined) delete broken[field];
    else broken[field] = value;
    storeCurrent(broken);
    expect(readGameSave()).toBeNull();
  });

  test("rejects a club record that does not equal the current clubById()", () => {
    const state = reachOpenOffer(1);
    storeCurrent({ ...state, club: { ...state.club, name: "Fikcyjny Klub" } });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a club record carrying an extra (e.g. legacy budget) field", () => {
    const state = reachOpenOffer(1);
    storeCurrent({ ...state, club: { ...state.club, budzet: 1.5 } });
    expect(readGameSave()).toBeNull();
  });

  test("rejects an unknown club id", () => {
    const state = reachOpenOffer(1);
    storeCurrent({
      ...state,
      club: { clubId: "fc-nieistniejacy", name: "X", shortName: "X", character: "X" },
    });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a top-level state carrying the old `poziom` field", () => {
    const state = reachOpenOffer(1);
    storeCurrent({ ...state, poziom: { id: "sredni" } });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a top-level state carrying the old `budzet` field", () => {
    const state = reachOpenOffer(1);
    storeCurrent({ ...state, budzet: 3 });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a manager that is not already normalised", () => {
    const state = reachOpenOffer(1);
    storeCurrent({ ...state, manager: { firstName: "  Jan  ", lastName: "Kowalski" } });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a manager whose name would fail validation entirely", () => {
    const state = reachOpenOffer(1);
    storeCurrent({ ...state, manager: { firstName: "<img onerror=x>", lastName: "Kowalski" } });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a careerBaseline whose clubId disagrees with the club's", () => {
    const state = reachOpenOffer(1, "gornik-zabrze");
    const otherBaseline = buildCareerBaseline("legia-warszawa");
    storeCurrent({ ...state, careerBaseline: otherBaseline });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a careerBaseline with a hand-edited (non-finite) handicap", () => {
    const state = reachOpenOffer(1);
    storeCurrent({
      ...state,
      careerBaseline: { ...state.careerBaseline, tenureHandicap: Number.NaN },
    });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a careerBaseline that merely looks plausible but disagrees with buildCareerBaseline", () => {
    // Finite, right shape, right clubId - but a hand-edited handicap the
    // engine would never actually produce for this club.
    const state = reachOpenOffer(1);
    const tampered = {
      ...state.careerBaseline!,
      tenureHandicap: state.careerBaseline!.tenureHandicap + 1,
    };
    storeCurrent({ ...state, careerBaseline: tampered });
    expect(readGameSave()).toBeNull();
  });

  test("accepts every field of careerBaseline exactly as buildCareerBaseline produces it", () => {
    // The positive control for the two tests above: an untouched save round-trips.
    const state = reachOpenOffer(1, "lech-poznan");
    expect(state.careerBaseline).toEqual(buildCareerBaseline("lech-poznan"));
    writeGameSave(state);
    expect(readGameSave()?.state).toEqual(state);
  });

  test("rejects a broken staff memory map the same way schema 12 did", () => {
    const state = reachOpenOffer(1);
    storeCurrent({ ...state, staffMemory: { p1: { season: "3", outlook: "unknown" } } });
    expect(readGameSave()).toBeNull();
  });

  test("rejects an unknown saved analyst metric instead of throwing during normalization", () => {
    const state = reachOpenOffer(0x3000_0011);
    expect(state.karta).not.toBeNull();
    const malformed = {
      ...state,
      karta: {
        ...state.karta!,
        analystReport: {
          ...state.karta!.analystReport,
          metrics: [
            { metricId: "removedMetric", percentile: 79, value: 1.5 },
            state.karta!.analystReport.metrics[1],
          ],
        },
      },
    };
    storeCurrent(malformed);
    expect(() => readGameSave()).not.toThrow();
    expect(readGameSave()).toBeNull();
  });

  test("rejects a saved analyst percentile outside the generator's 3-99 range", () => {
    const state = reachOpenOffer(0x3000_0013);
    expect(state.karta).not.toBeNull();
    const malformed = {
      ...state,
      karta: {
        ...state.karta!,
        analystReport: {
          ...state.karta!.analystReport,
          metrics: [
            { ...state.karta!.analystReport.metrics[0], percentile: 100 },
            state.karta!.analystReport.metrics[1],
          ],
        },
      },
    };
    storeCurrent(malformed);
    expect(readGameSave()).toBeNull();
  });
});

describe("game-save schema 16: the active card names a buyer exactly for SPRZEDAZ", () => {
  const domesticBuyer = { clubId: "legia-warszawa", name: "Legia", origin: "domestic" as const };

  test("rejects an active SPRZEDAZ card with no buyer", () => {
    const state = reachOpenOffer(1);
    expect(state.karta).not.toBeNull();
    storeCurrent({ ...state, karta: { ...state.karta!, typ: "SPRZEDAZ", buyer: null } });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a KUPNO card carrying a buyer", () => {
    const state = reachOpenOffer(1);
    expect(state.karta).not.toBeNull();
    storeCurrent({
      ...state,
      karta: { ...state.karta!, typ: "KUPNO", buyer: domesticBuyer },
    });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a SPRZEDAZ card whose buyer.origin is neither domestic nor foreign", () => {
    const state = reachOpenOffer(1);
    expect(state.karta).not.toBeNull();
    storeCurrent({
      ...state,
      karta: {
        ...state.karta!,
        typ: "SPRZEDAZ",
        buyer: { ...domesticBuyer, origin: "neutral" },
      },
    });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a domestic buyer whose clubId is not in the membership", () => {
    const state = reachOpenOffer(1);
    expect(state.karta).not.toBeNull();
    storeCurrent({
      ...state,
      karta: {
        ...state.karta!,
        typ: "SPRZEDAZ",
        buyer: { ...domesticBuyer, clubId: "not-a-real-club" },
      },
    });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a domestic buyer whose name does not match its clubId's membership entry", () => {
    const state = reachOpenOffer(1);
    expect(state.karta).not.toBeNull();
    storeCurrent({
      ...state,
      karta: {
        ...state.karta!,
        typ: "SPRZEDAZ",
        buyer: { ...domesticBuyer, name: "Lech" },
      },
    });
    expect(readGameSave()).toBeNull();
  });

  test("rejects a domestic buyer that is the player's own club", () => {
    const state = reachOpenOffer(1);
    expect(state.karta).not.toBeNull();
    storeCurrent({
      ...state,
      karta: {
        ...state.karta!,
        typ: "SPRZEDAZ",
        buyer: { clubId: testClub.clubId, name: testClub.shortName, origin: "domestic" as const },
      },
    });
    expect(readGameSave()).toBeNull();
  });

  test("accepts a well-formed SPRZEDAZ card and its buyer", () => {
    const state = reachOpenOffer(1);
    expect(state.karta).not.toBeNull();
    const withBuyer = { ...state.karta!, typ: "SPRZEDAZ" as const, buyer: domesticBuyer };
    storeCurrent({ ...state, karta: withBuyer });
    expect(readGameSave()?.state.karta).toEqual(withBuyer);
  });
});

describe("inspectGameSave: non-destructive contract", () => {
  test("returns empty for a missing key without writing anything", () => {
    expect(inspectGameSave()).toEqual({ kind: "empty" });
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();
  });

  test("returns discarded for malformed JSON and does NOT clear storage", () => {
    localStorage.setItem(GAME_SAVE_STORAGE_KEY, "not-json");
    expect(inspectGameSave()).toEqual({ kind: "discarded" });
    // The point of the contract: a render-time call must not destroy the
    // entry before the caller has shown the "could not resume" message.
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).not.toBeNull();
  });

  test("returns discarded for a save that fails the schema-14 guard, without clearing", () => {
    storeCurrent({ ...reachOpenOffer(1), club: null });
    expect(inspectGameSave()).toEqual({ kind: "discarded" });
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).not.toBeNull();
  });

  test("returns loaded for a valid save, still without mutating storage", () => {
    const state = reachOpenOffer(1);
    writeGameSave(state);
    const before = localStorage.getItem(GAME_SAVE_STORAGE_KEY);

    const result = inspectGameSave();

    expect(result.kind).toBe("loaded");
    expect(result.kind === "loaded" && result.save.state).toEqual(state);
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe(before);
  });

  test("calling it twice in a row (StrictMode's double-invoked initializer) is stable and non-destructive", () => {
    localStorage.setItem(GAME_SAVE_STORAGE_KEY, "not-json");
    const first = inspectGameSave();
    const second = inspectGameSave();

    expect(first).toEqual({ kind: "discarded" });
    expect(second).toEqual({ kind: "discarded" });
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).not.toBeNull();
  });

  test("readGameSave (the destructive wrapper) still clears a discarded entry", () => {
    storeCurrent({ ...reachOpenOffer(1), club: null });
    expect(readGameSave()).toBeNull();
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();
  });
});

describe("inspectGameSave: the ?reset parameter", () => {
  const withSearch = (search: string, run: () => void): void => {
    const original = window.location.search;
    Object.defineProperty(window, "location", {
      // jsdom keeps Location's attributes on the instance, so the spread copies
      // them into the plain stand-in this test wants.
      // oxlint-disable-next-line typescript/no-misused-spread -- plain stand-in, see above.
      value: { ...window.location, search },
      writable: true,
    });
    try {
      run();
    } finally {
      Object.defineProperty(window, "location", {
        // oxlint-disable-next-line typescript/no-misused-spread -- same plain stand-in as above.
        value: { ...window.location, search: original },
        writable: true,
      });
    }
  };

  test("?reset clears an existing save and returns empty, not discarded", () => {
    writeGameSave(reachOpenOffer(1));
    withSearch("?reset", () => {
      expect(inspectGameSave()).toEqual({ kind: "empty" });
      expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();
    });
  });

  test("readGameSave clears the save when the URL asks for a reset", () => {
    writeGameSave(reachOpenOffer(1));
    withSearch("?reset", () => {
      expect(readGameSave()).toBeNull();
      expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();
    });
  });

  test("?preset=1 is NOT mistaken for a reset - exact param match, not a substring", () => {
    const state = reachOpenOffer(1);
    writeGameSave(state);
    withSearch("?preset=1", () => {
      const result = inspectGameSave();
      expect(result.kind).toBe("loaded");
      expect(result.kind === "loaded" && result.save.state).toEqual(state);
      expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).not.toBeNull();
    });
  });

  test("a bare ?reset among other params still resets", () => {
    writeGameSave(reachOpenOffer(1));
    withSearch("?foo=1&reset&bar=2", () => {
      expect(inspectGameSave()).toEqual({ kind: "empty" });
      expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();
    });
  });
});

describe("game-save: autoAdvance-driven career keeps resuming correctly", () => {
  test("a career advanced deep into the schedule still round-trips", () => {
    let state = reachOpenOffer(0x3000_0099);
    for (let guard = 0; guard < 200 && state.faza !== "final"; guard += 1) {
      const advanced = autoAdvance(state);
      if (advanced) {
        state = advanced;
        continue;
      }
      if (state.faza === "okno" && state.karta) {
        state = gameReducer(state, { type: "DECIDE", choice: "pass" });
        continue;
      }
      break;
    }
    writeGameSave(state);
    expect(readGameSave()?.state).toEqual(state);
  });
});

test("clubById sanity: fixtures assume every club id used above resolves", () => {
  expect(clubById("lech-poznan").clubId).toBe("lech-poznan");
  expect(clubById("gornik-zabrze").clubId).toBe("gornik-zabrze");
});
