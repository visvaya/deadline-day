import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { CLUBS } from "../../src/data/clubs";
import { FIRST_DIVISION } from "../../src/data/first-division";
import { FOREIGN_CLUBS } from "../../src/data/foreign-clubs";

describe("FOREIGN_CLUBS", () => {
  test("twenty-four clubs split 12 / 8 / 4", () => {
    const count = (tier: string) => FOREIGN_CLUBS.filter((c) => c.tier === tier).length;
    expect(FOREIGN_CLUBS.length).toBe(24);
    expect([count("wysoki"), count("bardzo wysoki"), count("legendarny")]).toEqual([12, 8, 4]);
  });

  test("a club outside its top flight is never above wysoki", () => {
    for (const club of FOREIGN_CLUBS.filter((c) => !c.topFlight)) {
      expect(club.tier, club.clubId).toBe("wysoki");
    }
  });

  test("every record is estimated and carries a rationale", () => {
    for (const club of FOREIGN_CLUBS) {
      expect(club.provenance).toBe("estimated");
      expect(club.rationale.length, club.clubId).toBeGreaterThan(20);
    }
  });

  test("sixty ids, domestic and foreign together, are unique", () => {
    const ids = [
      ...CLUBS.map((c) => c.clubId),
      ...FIRST_DIVISION.map((c) => c.clubId),
      ...FOREIGN_CLUBS.map((c) => c.clubId),
    ];
    expect(ids.length).toBe(60);
    expect(new Set(ids).size).toBe(60);
  });

  test("the source note has a row for every club", () => {
    const note = readFileSync(
      join(process.cwd(), "docs", "decisions", "foreign-buyer-tiers.md"),
      "utf8"
    );
    for (const club of FOREIGN_CLUBS) {
      expect(note.includes(`\`${club.clubId}\``), club.clubId).toBe(true);
    }
  });
});
