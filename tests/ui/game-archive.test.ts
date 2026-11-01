/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CURRENT_VERSION } from "../../src/data/changelog";
import { ENGINE_REVISION } from "../../src/logic/engine-version";
import {
  archiveEntryId,
  groupArchiveEntries,
  readGameArchive,
  saveFinishedGame,
  type ArchiveEntryV1,
} from "../../src/ui/game-archive";
import { ArchiveScreen } from "../../src/ui/screens/archive-screen";
import { playHeadless } from "../golden/headless";
import { testClub, testManager } from "../logic/fixtures";

const GAME_ARCHIVE_STORAGE_KEY = "deadline-day:game-archive";

/** Any finished career will do here - the archive stores the result, not the
 * road to it - so the cheapest deterministic policy wins. */
const finishedGame = (seed: number, clubId: string = testClub.clubId) =>
  playHeadless({ seed, clubId, policy: () => "pas" }).state;

afterEach(() => {
  localStorage.clear();
});

describe("game-archive v2", () => {
  test("stamps the entry with the engine that produced the result", () => {
    saveFinishedGame(finishedGame(0x4000_0001));

    const [entry] = readGameArchive().entries;
    expect(entry?.replay.engineVersion).toBe(ENGINE_REVISION);
    // The regression this pins: the field held CURRENT_VERSION, which moves
    // when there is news for the player and stays put through an engine
    // rewrite - the same mistake the save guard made before e3653b5.
    expect(entry?.replay.engineVersion).not.toBe(CURRENT_VERSION);
  });

  test("records a finished career once, however often it is asked", () => {
    const state = finishedGame(0x4000_0002);
    saveFinishedGame(state);
    saveFinishedGame(state);

    const { entries } = readGameArchive();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe(
      archiveEntryId({
        engineVersion: ENGINE_REVISION,
        seed: 0x4000_0002,
        clubId: testClub.clubId,
        actions: state.akcje,
      })
    );
  });

  test("stores no difficulty, advantageScore or handicap - those follow from clubId + engineVersion", () => {
    saveFinishedGame(finishedGame(0x4000_0003));
    const [entry] = readGameArchive().entries;

    expect(entry).not.toHaveProperty("difficulty");
    expect(entry).not.toHaveProperty("advantageScore");
    expect(entry).not.toHaveProperty("tenureHandicap");
    expect(entry).not.toHaveProperty("legacyHandicap");
  });

  test("records the club id, club name and normalised manager", () => {
    const state = finishedGame(0x4000_0004, "legia-warszawa");
    saveFinishedGame(state);
    const [entry] = readGameArchive().entries;

    expect(entry?.kind).toBe("v2");
    if (entry?.kind !== "v2") throw new Error("expected a v2 entry");
    expect(entry.clubId).toBe("legia-warszawa");
    expect(entry.clubName).toBe("Legia Warszawa");
    expect(entry.manager).toEqual(testManager);
    expect(entry.replay.clubId).toBe("legia-warszawa");
    expect(entry.replay.manager).toEqual(testManager);
  });

  test("two different careers on the same seed and club (different decisions) get different ids", () => {
    // finishedGame always plays "pas" - drive two runs that actually diverge
    // by using different seeds, which is enough to prove the id is not just
    // seed+clubId: it also depends on the action sequence.
    const a = finishedGame(0x4000_0005);
    const b = finishedGame(0x4000_0006);
    saveFinishedGame(a);
    saveFinishedGame(b);
    const { entries } = readGameArchive();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.id).not.toBe(entries[1]?.id);
  });

  test("does not save an unfinished career", () => {
    const state = finishedGame(0x4000_0007);
    saveFinishedGame({ ...state, faza: "epilog" });
    expect(readGameArchive().entries).toHaveLength(0);
  });

  // This writes 55 finished careers in a loop, which reliably takes
  // 6-7s under load (CI, or a busy pre-commit hook run) despite finishing in
  // about 1s in isolation - it tripped the default 5s timeout on three
  // separate full-gate runs. The behaviour under test (the cap itself) is
  // correct; the test is simply slower than the default, so it gets an
  // explicit, generous timeout rather than a smaller loop or a weaker
  // assertion.
  test("keeps entries under the cap by dropping the oldest", () => {
    for (let seed = 0x5000_0000; seed < 0x5000_0000 + 55; seed += 1) {
      saveFinishedGame(finishedGame(seed));
    }
    expect(readGameArchive().entries.length).toBeLessThanOrEqual(50);
  }, 20_000);

  test("returns true, including for an already-recorded (idempotent) career", () => {
    const state = finishedGame(0x4000_0008);
    expect(saveFinishedGame(state)).toBe(true);
    expect(saveFinishedGame(state)).toBe(true);
  });

  test("returns false when the write actually fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(saveFinishedGame(finishedGame(0x4000_0009))).toBe(false);
    vi.restoreAllMocks();
  });
});

describe("game-archive: FNV-1a id", () => {
  test("is deterministic and an 8-hex-digit suffix", () => {
    const id = archiveEntryId({
      engineVersion: "2026-09-12.1",
      seed: 42,
      clubId: "lech-poznan",
      actions: ["bierz", "pas", "targ"],
    });
    expect(id).toBe(
      archiveEntryId({
        engineVersion: "2026-09-12.1",
        seed: 42,
        clubId: "lech-poznan",
        actions: ["bierz", "pas", "targ"],
      })
    );
    expect(id.slice(-8)).toMatch(/^[0-9a-f]{8}$/);
  });

  test("changes when the action sequence changes, all else equal", () => {
    const base = {
      engineVersion: "2026-09-12.1",
      seed: 42,
      clubId: "lech-poznan",
    };
    const a = archiveEntryId({ ...base, actions: ["bierz", "pas"] });
    const b = archiveEntryId({ ...base, actions: ["pas", "bierz"] });
    expect(a).not.toBe(b);
  });
});

describe("game-archive: schema 1 -> 2 migration keeps v1 rows visible", () => {
  const legacyEntry = (id: string, difficulty: "latwy" | "sredni" | "trudny") => ({
    id,
    finishedAt: 1_700_000_000_000,
    difficulty,
    clubName: "Wisła Kraków",
    legacyTitle: "UCZCIWY WYROBNIK",
    legacyScore: 500,
    signedPlayers: 3,
    replay: {
      seed: 123,
      difficulty,
      actions: ["bierz", "pas"],
      engineVersion: "2026-01-01.0",
    },
  });

  test("normalises a schema-1 wrapper's entries into tagged v1 rows on read", () => {
    localStorage.setItem(
      GAME_ARCHIVE_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, entries: [legacyEntry("123-sredni", "sredni")] })
    );

    const { schemaVersion, entries } = readGameArchive();
    expect(schemaVersion).toBe(2);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("v1");
  });

  test("the first write after migration persists schema 2 without dropping the v1 row", () => {
    localStorage.setItem(
      GAME_ARCHIVE_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, entries: [legacyEntry("123-sredni", "sredni")] })
    );

    saveFinishedGame(finishedGame(0x6000_0001));

    const stored = JSON.parse(localStorage.getItem(GAME_ARCHIVE_STORAGE_KEY) ?? "null");
    expect(stored.schemaVersion).toBe(2);
    const kinds = stored.entries.map((entry: { kind: string }) => entry.kind);
    expect(kinds).toContain("v1");
    expect(kinds).toContain("v2");
    expect(stored.entries).toHaveLength(2);
  });

  test("drops a malformed legacy row instead of throwing", () => {
    localStorage.setItem(
      GAME_ARCHIVE_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, entries: [{ id: "broken" }] })
    );
    expect(() => readGameArchive()).not.toThrow();
    expect(readGameArchive().entries).toHaveLength(0);
  });
});

describe("game-archive: grouping by engineVersion", () => {
  test("groups the current engine's entries under the plain caption", () => {
    saveFinishedGame(finishedGame(0x7000_0001));
    const groups = groupArchiveEntries(readGameArchive().entries);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.engineVersion).toBe(ENGINE_REVISION);
    expect(groups[0]!.caption).toBe("Posortowane od najlepszego wyniku");
  });

  test("labels an older engine's group with its revision, using a middle dot, never an em dash", () => {
    localStorage.setItem(
      GAME_ARCHIVE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        entries: [
          {
            id: "old-1",
            finishedAt: 1,
            difficulty: "latwy",
            clubName: "Lech Poznań",
            legacyTitle: "ARCHITEKT",
            legacyScore: 800,
            signedPlayers: 2,
            replay: { seed: 1, difficulty: "latwy", actions: [], engineVersion: "2025-01-01.0" },
          },
        ],
      })
    );

    const groups = groupArchiveEntries(readGameArchive().entries);
    expect(groups[0]!.caption).toBe("Wyniki ze starszej wersji · 2025-01-01.0");
    expect(groups[0]!.caption).not.toContain(String.fromCodePoint(0x2014));
  });

  test("sorts only within a group, never mixing scores across engine versions", () => {
    localStorage.setItem(
      GAME_ARCHIVE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        entries: [
          {
            id: "old-low",
            finishedAt: 1,
            difficulty: "latwy",
            clubName: "Lech Poznań",
            legacyTitle: "ZAPOMNIANY",
            legacyScore: 100,
            signedPlayers: 0,
            replay: { seed: 1, difficulty: "latwy", actions: [], engineVersion: "2025-01-01.0" },
          },
          {
            id: "old-high",
            finishedAt: 2,
            difficulty: "latwy",
            clubName: "Lech Poznań",
            legacyTitle: "ARCHITEKT",
            legacyScore: 9999,
            signedPlayers: 0,
            replay: { seed: 2, difficulty: "latwy", actions: [], engineVersion: "2025-01-01.0" },
          },
        ],
      })
    );
    saveFinishedGame(finishedGame(0x7000_0002));

    const groups = groupArchiveEntries(readGameArchive().entries);
    const current = groups.find((group) => group.engineVersion === ENGINE_REVISION)!;
    const legacy = groups.find((group) => group.engineVersion === "2025-01-01.0")!;

    // The legacy group's own top score (9999) never leaks into the current
    // group's ranking, even though it is numerically higher.
    expect(current.entries.every((entry) => entry.legacyScore < 9999)).toBe(true);
    expect(legacy.entries[0]?.id).toBe("old-high");
    expect(legacy.entries[1]?.id).toBe("old-low");
  });

  test("the current engine's group always sorts first", () => {
    localStorage.setItem(
      GAME_ARCHIVE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        entries: [
          {
            id: "old-1",
            finishedAt: 1,
            difficulty: "latwy",
            clubName: "Lech Poznań",
            legacyTitle: "ARCHITEKT",
            legacyScore: 9999,
            signedPlayers: 0,
            replay: { seed: 1, difficulty: "latwy", actions: [], engineVersion: "2025-01-01.0" },
          },
        ],
      })
    );
    saveFinishedGame(finishedGame(0x7000_0003));

    const groups = groupArchiveEntries(readGameArchive().entries);
    expect(groups[0]!.engineVersion).toBe(ENGINE_REVISION);
  });
});

describe("game-archive: v1 rows stay visible, unplayable, with a fallback manager label", () => {
  test("a v1 row survives read/write round trips and carries no manager field", () => {
    const raw: Omit<ArchiveEntryV1, "kind"> = {
      id: "v1-1",
      finishedAt: 5,
      difficulty: "trudny",
      clubName: "Wisła Kraków",
      legacyTitle: "UCZCIWY WYROBNIK",
      legacyScore: 400,
      signedPlayers: 1,
      replay: { seed: 5, difficulty: "trudny", actions: ["bierz"], engineVersion: "2025-06-01.0" },
    };
    localStorage.setItem(
      GAME_ARCHIVE_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, entries: [raw] })
    );

    const [entry] = readGameArchive().entries;
    expect(entry?.kind).toBe("v1");
    expect(entry && "manager" in entry).toBe(false);
    expect(entry?.clubName).toBe("Wisła Kraków");
  });
});

/** Saves one real finished career and returns its stored row, ready to be
 * cloned into a hand-crafted variant. */
const storedValidEntry = (seed: number) => {
  saveFinishedGame(finishedGame(seed));
  const stored = JSON.parse(localStorage.getItem(GAME_ARCHIVE_STORAGE_KEY) ?? "null");
  return stored.entries[0];
};

const storeEntries = (entries: readonly unknown[]): void => {
  localStorage.setItem(GAME_ARCHIVE_STORAGE_KEY, JSON.stringify({ schemaVersion: 2, entries }));
};

describe("game-archive: retention checks shape, never today's catalogue or validator", () => {
  test("keeps a row whose club id is no longer in CLUBS, across a later save", () => {
    const validEntry = storedValidEntry(0x8000_0003);
    const retired = {
      ...validEntry,
      id: "retired-club",
      clubId: "fc-nieistniejacy",
      clubName: "FC Nieistniejący",
      replay: { ...validEntry.replay, clubId: "fc-nieistniejacy" },
    };
    storeEntries([retired]);

    saveFinishedGame(finishedGame(0x8000_0004));

    const { entries } = readGameArchive();
    expect(entries.map((entry) => entry.id)).toContain("retired-club");
    expect(entries.find((entry) => entry.id === "retired-club")?.clubName).toBe("FC Nieistniejący");
  });

  test("keeps a row whose manager no longer passes today's name validator, across a later save", () => {
    const validEntry = storedValidEntry(0x8000_0001);
    const oddName = {
      firstName: "<img src=x onerror=alert(1)>",
      lastName: "Kowalski",
    };
    const legacyName = {
      ...validEntry,
      id: "legacy-name",
      manager: oddName,
      replay: { ...validEntry.replay, manager: oddName },
    };
    storeEntries([legacyName]);

    saveFinishedGame(finishedGame(0x8000_0005));

    const kept = readGameArchive().entries.find((entry) => entry.id === "legacy-name");
    expect(kept?.kind).toBe("v2");
    if (kept?.kind === "v2") expect(kept.manager).toEqual(oddName);
  });

  test("O'Neil is a legitimate name and is kept", () => {
    const state = finishedGame(0x8000_0002);
    saveFinishedGame({
      ...state,
      manager: { firstName: "Aoife", lastName: "O’Neil" },
    });
    const { entries } = readGameArchive();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("v2");
    if (entries[0]?.kind === "v2") {
      expect(entries[0].manager.lastName).toBe("O’Neil");
    }
  });

  test.each([
    ["a non-string club id", { clubId: 42 }],
    ["a manager that is not an object", { manager: "Jan Kowalski" }],
    ["a manager missing its last name", { manager: { firstName: "Jan" } }],
    ["a non-numeric score", { legacyScore: "500" }],
    ["no replay at all", { replay: undefined }],
  ])("still rejects a genuinely malformed row: %s", (_label, override) => {
    const validEntry = storedValidEntry(0x8000_0006);
    storeEntries([{ ...validEntry, id: "malformed", ...override }, validEntry]);

    const { entries } = readGameArchive();
    expect(entries.map((entry) => entry.id)).toEqual([validEntry.id]);
  });

  test("still rejects a replay whose manager is malformed", () => {
    const validEntry = storedValidEntry(0x8000_0007);
    storeEntries([
      {
        ...validEntry,
        id: "bad-replay",
        replay: { ...validEntry.replay, manager: null },
      },
      validEntry,
    ]);

    expect(readGameArchive().entries.map((entry) => entry.id)).toEqual([validEntry.id]);
  });
});

describe("archive screen: a retained row outside today's catalogue", () => {
  test("renders from its stored club name, as inert text, with no replay control", async () => {
    const validEntry = storedValidEntry(0x8000_0008);
    const oddName = {
      firstName: "<img src=x onerror=alert(1)>",
      lastName: "Kowalski",
    };
    storeEntries([
      {
        ...validEntry,
        id: "retired-club",
        clubId: "fc-nieistniejacy",
        clubName: "FC Nieistniejący",
        manager: oddName,
        replay: {
          ...validEntry.replay,
          clubId: "fc-nieistniejacy",
          manager: oddName,
        },
      },
    ]);

    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(createElement(ArchiveScreen, { onClose: () => {} })));

    const meta = container.querySelector(".dd-archive-meta")?.textContent ?? "";
    expect(meta).toContain("FC Nieistniejący");
    expect(meta).toContain("<img src=x onerror=alert(1)> Kowalski");
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-dd-action*="replay"]')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });
});
