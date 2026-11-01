import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CLUBS } from "../../src/data/clubs";
import { initialClubProjection, initialLeagueProjection } from "../../src/logic/league-projection";

describe("initialLeagueProjection", () => {
  it("has exactly the eighteen canonical clubs, each once", () => {
    const projection = initialLeagueProjection();
    expect(projection).toHaveLength(18);
    const ids = projection.map((row) => row.clubId);
    expect(new Set(ids).size).toBe(18);
    expect([...ids].sort()).toEqual([...CLUBS.map((club) => club.clubId)].sort());
  });

  it("assigns every place 1..18 exactly once", () => {
    const places = initialLeagueProjection()
      .map((row) => row.expectedPlace)
      .sort((a, b) => a - b);
    expect(places).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  });

  it("gives every club positive, finite expected points", () => {
    for (const row of initialLeagueProjection()) {
      expect(Number.isFinite(row.expectedSeasonPoints), row.clubId).toBe(true);
      expect(row.expectedSeasonPoints, row.clubId).toBeGreaterThan(0);
    }
  });

  it("returns the same table by reference on repeated calls", () => {
    expect(initialLeagueProjection()).toBe(initialLeagueProjection());
  });

  it("is deterministic across independent calls", () => {
    expect(initialLeagueProjection()).toEqual(initialLeagueProjection());
  });
});

describe("initialClubProjection", () => {
  it("selects the same row initialLeagueProjection carries for that club", () => {
    for (const club of CLUBS) {
      expect(initialClubProjection(club.clubId)).toEqual(
        initialLeagueProjection().find((row) => row.clubId === club.clubId)
      );
    }
  });

  it("throws for an unknown club id", () => {
    expect(() => initialClubProjection("nieistniejacy-klub")).toThrow();
  });
});

describe("no RNG import", () => {
  it("league-projection.ts never imports the rng module", () => {
    const source = readFileSync(
      new URL("../../src/logic/league-projection.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toMatch(/from ["'].*\/rng["']/);
    expect(source).not.toMatch(/Math\.random/);
  });
});
