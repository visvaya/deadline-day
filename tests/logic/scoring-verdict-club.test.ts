import { describe, expect, test } from "vitest";
import { PROGI_WERDYKTU } from "../../src/data/balance";
import { clubById } from "../../src/data/clubs";
import type { SeasonHistoryEntry } from "../../src/data/types";
import { createRng } from "../../src/logic/rng";
import { computeVerdict } from "../../src/logic/scoring";

/** One season's points land the score between the lower-table and the
 * top-club thresholds, with no trophies, cash or relegation - so the
 * verdict is always KLUB Z CZOŁÓWKI. */
const TOP_CLUB_HISTORY: readonly SeasonHistoryEntry[] = [
  { sezon: 1, pkt: PROGI_WERDYKTU[1]!, miejsce: 5, puchar: false, mistrz: false, spadek: false },
];

const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1);

const topClubVerdict = (seed: number, clubId: string) =>
  computeVerdict(createRng(seed), TOP_CLUB_HISTORY, 0, 0, clubId);

describe("KLUB Z CZOŁÓWKI never names the player's own club", () => {
  test.each(["legia-warszawa", "lech-poznan", "rakow-czestochowa"])("%s", (clubId) => {
    const ownName = clubById(clubId).shortName;
    const openings = new Set<string>();
    for (const seed of SEEDS) {
      const verdict = topClubVerdict(seed, clubId);
      expect(verdict.tytul).toBe("KLUB Z CZOŁÓWKI");
      expect(verdict.opis.startsWith(`${ownName} `)).toBe(false);
      openings.add(verdict.opis.split(" wykupuje")[0]!);
    }
    // The other two top clubs both still come calling.
    expect(openings.size).toBe(2);
  });

  test("a club outside the three still draws from all three", () => {
    const openings = new Set(
      SEEDS.map((seed) => topClubVerdict(seed, "gornik-zabrze").opis.split(" wykupuje")[0]!)
    );
    expect([...openings].sort()).toEqual(["Lech", "Legia", "Raków"]);
  });

  test("draws exactly one number, whichever club the player runs", () => {
    for (const clubId of ["legia-warszawa", "gornik-zabrze"]) {
      const rng = createRng(7);
      computeVerdict(rng, TOP_CLUB_HISTORY, 0, 0, clubId);
      const reference = createRng(7);
      reference.next();
      expect(rng.next()).toBe(reference.next());
    }
  });
});

test("addresses the player in lower case mid-sentence, as the design system requires", () => {
  // docs/decisions/design-system.md, "Język": the game is not correspondence,
  // so the courtesy capital ("Cię") never appears after the first word.
  const verdict = topClubVerdict(1, "gornik-zabrze");
  expect(verdict.opis).toMatch(/ wykupuje cię z kontraktu\.$/);
});
