import { describe, expect, test } from "vitest";

import { CLUBS, clubById, clubByShortName, ratingForClubId } from "../../src/data/clubs";
import { FIRST_DIVISION } from "../../src/data/first-division";
import { TEAM_RATINGS } from "../../src/data/team-ratings";

const DIFFICULTY_WORDS = ["łatwy", "średni", "trudny"];

/**
 * CLUBS is the canonical starting-league catalogue - the stable join key,
 * and the promise that adding it changed nothing about the pools it is
 * checked against.
 */

describe("CLUBS", () => {
  test("holds exactly eighteen unique clubId and eighteen unique shortName", () => {
    expect(CLUBS).toHaveLength(18);
    expect(new Set(CLUBS.map((club) => club.clubId)).size).toBe(18);
    expect(new Set(CLUBS.map((club) => club.shortName)).size).toBe(18);
  });

  test("matches the rating snapshot one-to-one, in both directions", () => {
    const clubNames = CLUBS.map((club) => club.shortName).sort();
    const ratedNames = TEAM_RATINGS.clubs.map((rating) => rating.krotko).sort();
    expect(clubNames).toEqual(ratedNames);
  });

  test("clubById resolves exactly one record and throws on a miss", () => {
    for (const club of CLUBS) {
      expect(clubById(club.clubId)).toEqual(club);
    }
    expect(() => clubById("barcelona")).toThrow(/Unknown or ambiguous club/);
  });

  test("clubByShortName resolves exactly one record and throws on a miss", () => {
    for (const club of CLUBS) {
      expect(clubByShortName(club.shortName)).toEqual(club);
    }
    expect(() => clubByShortName("Barcelona")).toThrow(/Unknown or ambiguous club/);
  });

  test("ratingForClubId resolves through the id, not through a copy", () => {
    expect(ratingForClubId("lech-poznan")).toEqual(
      TEAM_RATINGS.clubs.find((r) => r.krotko === "Lech")
    );
    for (const club of CLUBS) {
      expect(ratingForClubId(club.clubId).krotko).toBe(club.shortName);
    }
  });

  test("an unknown id throws rather than resolving to nothing", () => {
    expect(() => ratingForClubId("barcelona")).toThrow(/Unknown or ambiguous club/);
  });

  test("every character is one non-empty sentence, 70-125 code points, free of difficulty labels", () => {
    for (const club of CLUBS) {
      expect(club.character.length, club.clubId).toBeGreaterThan(0);
      expect(club.character.trim(), club.clubId).toBe(club.character);

      const codePointCount = Array.from(club.character).length;
      expect(
        codePointCount,
        `${club.clubId}: ${codePointCount} code points`
      ).toBeGreaterThanOrEqual(70);
      expect(codePointCount, `${club.clubId}: ${codePointCount} code points`).toBeLessThanOrEqual(
        125
      );

      // One sentence: exactly one closing punctuation mark, at the very end.
      const terminalMarks = club.character.match(/[.!?]/g) ?? [];
      expect(terminalMarks.length, club.clubId).toBe(1);
      expect(/[.!?]$/.test(club.character), club.clubId).toBe(true);

      for (const word of DIFFICULTY_WORDS) {
        expect(club.character.toLowerCase(), club.clubId).not.toContain(word);
      }
    }
  });

  // startingMembership's league order is pinned in
  // tests/logic/initial-league-membership.test.ts.
});

describe("FIRST_DIVISION", () => {
  test("still holds eighteen clubs, in the same order and at the same strength", () => {
    expect(FIRST_DIVISION).toHaveLength(18);
    expect(FIRST_DIVISION.map((c) => c.shortName)).toEqual([
      "Polonia W.",
      "Ruch",
      "Arka",
      "Miedź",
      "ŁKS",
      "Nieciecza",
      "Polonia B.",
      "Podbeskidzie",
      "Odra",
      "Pogoń G.",
      "Stal M.",
      "Puszcza",
      "Chrobry",
      "Warta",
      "Unia",
      "Lechia",
      "Stal R.",
      "Pogoń S.",
    ]);
    // Sorted descending, the invariant the promotion weighting rests on.
    const strengths = FIRST_DIVISION.map((c) => c.strength);
    expect([...strengths].sort((a, b) => b - a)).toEqual(strengths);
  });

  test("every club carries an id", () => {
    for (const club of FIRST_DIVISION) {
      expect(club.clubId, club.name).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("identity across both pools", () => {
  const all = [...CLUBS, ...FIRST_DIVISION];

  test("ids are unique", () => {
    const ids = all.map((club) => club.clubId);
    expect(ids).toHaveLength(36);
    expect(new Set(ids).size).toBe(36);
  });

  test("short names are unique", () => {
    const names = all.map((club) => club.shortName);
    expect(new Set(names).size).toBe(36);
  });

  test("no id is a slug the code could have generated differently", () => {
    // ŁKS Łódź and LKS Nieciecza are the pair a naive slugifier would have
    // to keep apart; they are written out, so they simply are.
    const ids = new Set(all.map((club) => club.clubId));
    expect(ids.has("lks-lodz")).toBe(true);
    expect(ids.has("lks-nieciecza")).toBe(true);
  });
});
