import { describe, expect, test } from "vitest";

import { CLUBS } from "../../src/data/clubs";
import { EUROPEAN_BERTHS_2026, initialEuropeanBerth } from "../../src/data/european-berths-2026";
import type { EuropeanEntryPath } from "../../src/data/european-berths-2026";

/**
 * The real 2026/27 layout, pinned exactly. It is a snapshot of a season that
 * happened, not output of the allocator - so the test states it in full
 * rather than deriving it, which would only prove the allocator agrees with
 * itself.
 */

describe("EUROPEAN_BERTHS_2026", () => {
  test("is the five clubs Poland actually sent, on their actual paths", () => {
    expect(EUROPEAN_BERTHS_2026).toEqual([
      { clubId: "lech-poznan", cup: "LM", path: "champions" },
      { clubId: "gornik-zabrze", cup: "LM", path: "league" },
      { clubId: "jagiellonia-bialystok", cup: "LE", path: "league" },
      { clubId: "rakow-czestochowa", cup: "LK", path: "league" },
      { clubId: "gks-katowice", cup: "LK", path: "league" },
    ]);
  });

  test("every club id exists, and none is listed twice", () => {
    const known = new Set(CLUBS.map((club) => club.clubId));
    for (const berth of EUROPEAN_BERTHS_2026) {
      expect(known.has(berth.clubId), berth.clubId).toBe(true);
    }
    expect(new Set(EUROPEAN_BERTHS_2026.map((b) => b.clubId)).size).toBe(5);
  });

  test("the other thirteen clubs start at home", () => {
    const entered = new Set(EUROPEAN_BERTHS_2026.map((b) => b.clubId));
    const athome = CLUBS.filter((club) => !entered.has(club.clubId));
    expect(athome).toHaveLength(13);
    for (const club of athome) {
      expect(initialEuropeanBerth(club.clubId), club.clubId).toBeNull();
    }
  });

  test("the lookup returns the record itself, path included", () => {
    expect(initialEuropeanBerth("gornik-zabrze")).toEqual({
      clubId: "gornik-zabrze",
      cup: "LM",
      path: "league",
    });
    expect(initialEuropeanBerth("barcelona")).toBeNull();
  });

  test("exactly one club takes the champions' path", () => {
    // A path, not a qualifying round: the champion enters one bracket and
    // everyone else the other, whatever round each of them starts at.
    const paths: readonly EuropeanEntryPath[] = EUROPEAN_BERTHS_2026.map((b) => b.path);
    expect(paths.filter((p) => p === "champions")).toHaveLength(1);
    expect(paths.filter((p) => p === "league")).toHaveLength(4);
  });

  test("differs from the allocator's own layout, on purpose", () => {
    // assignEuropeanSpots in src/logic/european-cups.ts hands out
    // LM, LM, LE, LE, LK - the NEXT cycle. The first season is a different
    // cycle and legitimately differs; pinned here so that quietly aligning
    // the two would fail rather than look like a tidy-up.
    expect(EUROPEAN_BERTHS_2026.map((b) => b.cup)).toEqual(["LM", "LM", "LE", "LK", "LK"]);
  });
});
