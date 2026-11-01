import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { UECL_CROSS_CHECKS, UECL_SOURCES } from "../../scripts/data/uecl-sources";
import { COHORT_COLUMNS, clubProfiles, toCsv, type CohortRow } from "../../scripts/uecl/dataset";
import {
  anchorText,
  articleKey,
  articleKeys,
  associationCode,
  section,
  text,
} from "../../scripts/uecl/html";
import {
  bandOf,
  clusterBootstrap,
  isClosestObservable,
  oneSeasonPerClub,
  parseCohortCsv,
  rateOf,
  repeatedClubs,
} from "../../scripts/uecl/report-core";

const COHORT = parseCohortCsv(readFileSync("scripts/data/uecl-q2-cohort.csv", "utf8"));

const row = (over: Partial<CohortRow> = {}): CohortRow => ({
  season: "2024-25",
  format: "leaguePhase36",
  club: "Klub",
  articleKey: "Klub",
  association: "POL",
  associationRank: 12,
  associationCoefficient: 40,
  domesticBasis: "4th",
  seeded: true,
  clubCoefficient: 10,
  entryNote: null,
  reachedLeaguePhase: false,
  ...over,
});

describe("integralność przypiętego zbioru", () => {
  test("obejmuje wszystkie zadeklarowane sezony i nic ponadto", () => {
    const seasons = [...new Set(COHORT.map((entry) => entry.season))].sort();
    expect(seasons).toEqual(UECL_SOURCES.map((source) => source.season).sort());
  });

  test("każdy sezon niesie kilkadziesiąt obserwacji", () => {
    for (const source of UECL_SOURCES) {
      const rows = COHORT.filter((entry) => entry.season === source.season);
      expect(rows.length).toBeGreaterThanOrEqual(40);
      expect(rows.length).toBeLessThanOrEqual(70);
    }
  });

  /** Two clubs of one association cannot be the same club, and one club
   * cannot appear twice in one season's cohort - either would double-count an
   * observation into the rate. */
  test("klub występuje w sezonie najwyżej raz", () => {
    for (const source of UECL_SOURCES) {
      const keys = COHORT.filter((entry) => entry.season === source.season).map(
        (entry) => entry.articleKey
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  test("format zgadza się z manifestem", () => {
    for (const source of UECL_SOURCES) {
      const formats = new Set(
        COHORT.filter((entry) => entry.season === source.season).map((entry) => entry.format)
      );
      expect([...formats]).toEqual([source.format]);
    }
  });

  test("każdy wiersz ma związek, a prawie każdy rangę i rozstawienie", () => {
    for (const entry of COHORT) {
      expect(entry.association).toMatch(/^[A-Z]{3}$/);
    }
    const missingRank = COHORT.filter((entry) => entry.associationRank === null);
    const missingSeeding = COHORT.filter((entry) => entry.seeded === null);
    expect(missingRank).toEqual([]);
    // One 2025/26 club replaced another after the draw and so is absent from
    // the seeding table; more than a couple would mean the parser is losing
    // rows rather than the source being incomplete.
    expect(missingSeeding.length).toBeLessThanOrEqual(2);
  });

  test("Polska jest w kohorcie i jej wiersze zgadzają się ze znanymi faktami", () => {
    const polish = COHORT.filter((entry) => entry.association === "POL");
    expect(polish.length).toBeGreaterThanOrEqual(10);
    const legia = polish.find(
      (entry) => entry.season === "2024-25" && entry.club.startsWith("Legia")
    );
    expect(legia?.reachedLeaguePhase).toBe(true);
    const slask = polish.find((entry) => entry.season === "2024-25" && entry.club.includes("sk"));
    expect(slask?.reachedLeaguePhase).toBe(false);
  });

  test("kontrole UEFA z manifestu dotyczą sezonów, które faktycznie mamy", () => {
    for (const check of UECL_CROSS_CHECKS) {
      expect(UECL_SOURCES.map((source) => source.season)).toContain(check.season);
      expect(check.url).toMatch(/^https:\/\/www\.uefa\.com\//);
    }
  });

  test("źródła wtórne są oznaczone i mają przypiętą rewizję", () => {
    for (const source of UECL_SOURCES) {
      for (const page of [source.qualifying, source.competition]) {
        expect(page.tier).toBe("secondary");
        expect(page.revision).toBeGreaterThan(0);
        expect(page.url).toMatch(/^https:\/\//);
      }
    }
  });
});

describe("czytnik CSV", () => {
  test("przechodzi w obie strony", () => {
    const sample = [row(), row({ club: "Inny", articleKey: "Inny", seeded: false })];
    expect(parseCohortCsv(`${toCsv(sample)}\n`)).toEqual(sample);
  });

  /** The bug this pins: `seeded` read back as the string "1" made every
   * `=== true` test fail silently and collapsed the seeding breakdown from a
   * hundred and sixty-five rows to one. */
  test("kolumny logiczne wracają jako wartości logiczne, a puste jako null", () => {
    const parsed = parseCohortCsv(`${toCsv([row({ seeded: null })])}\n`);
    expect(parsed[0]!.seeded).toBeNull();
    expect(parseCohortCsv(`${toCsv([row({ seeded: false })])}\n`)[0]!.seeded).toBe(false);
    expect(typeof parseCohortCsv(`${toCsv([row()])}\n`)[0]!.reachedLeaguePhase).toBe("boolean");
  });

  test("odrzuca plik bez kolumny i wiersz o złej liczbie pól", () => {
    const good = toCsv([row()]);
    const withoutColumn = good.replace("seeded,", "");
    expect(() => parseCohortCsv(withoutColumn)).toThrow(/missing column/);
    expect(() => parseCohortCsv(`${good}\n1,2,3`)).toThrow(/fields, expected/);
  });

  test("nagłówek pokrywa się z kolumnami zapisu", () => {
    expect(toCsv([]).split("\n")[0]!.split(",")).toEqual([...COHORT_COLUMNS]);
  });
});

describe("statystyka", () => {
  test("udział i przedział Wilsona", () => {
    const rate = rateOf("x", [row({ reachedLeaguePhase: true }), row(), row(), row()])!;
    expect(rate.n).toBe(4);
    expect(rate.advanced).toBe(1);
    expect(rate.share).toBeCloseTo(0.25, 12);
    expect(rate.wilsonLower).toBeLessThan(0.25);
    expect(rate.wilsonUpper).toBeGreaterThan(0.25);
    expect(rateOf("pusty", [])).toBeNull();
  });

  /** The point of clustering: an interval that ignores it is tighter than the
   * evidence supports. With every cluster identical the bootstrap has nothing
   * to resample and must collapse to a point. */
  test("bootstrap klastrowy zwęża się do punktu, gdy klastry są identyczne", () => {
    const rows = ["a", "b", "c", "d"].flatMap((season) => [
      row({ season, reachedLeaguePhase: true }),
      row({ season, club: "Drugi", articleKey: "Drugi" }),
    ]);
    const result = clusterBootstrap(rows, "sezon", (entry) => entry.season, 500, 1);
    expect(result.clusters).toBe(4);
    expect(result.mean).toBeCloseTo(0.5, 12);
    expect(result.upper - result.lower).toBeCloseTo(0, 12);
  });

  test("bootstrap odmawia pracy na jednym klastrze", () => {
    expect(() => clusterBootstrap([row()], "sezon", (entry) => entry.season, 10, 1)).toThrow(
      /at least two/
    );
  });

  test("bootstrap jest deterministyczny wobec ziarna", () => {
    const first = clusterBootstrap(COHORT, "związek", (entry) => entry.association, 200, 7);
    const second = clusterBootstrap(COHORT, "związek", (entry) => entry.association, 200, 7);
    expect(second).toEqual(first);
  });

  test("jedna edycja na klub zatrzymuje najwcześniejszy sezon", () => {
    const kept = oneSeasonPerClub([
      row({ season: "2026-27" }),
      row({ season: "2024-25" }),
      row({ club: "Inny", articleKey: "Inny", season: "2025-26" }),
    ]);
    expect(kept).toHaveLength(2);
    expect(kept.find((entry) => entry.articleKey === "Klub")!.season).toBe("2024-25");
    expect(repeatedClubs(kept)).toEqual([]);
  });

  test("pasma rang i najbliższa strukturalnie obserwowalna kohorta", () => {
    expect(bandOf(12)).toBe("10-15");
    expect(bandOf(1)).toBe("1-9");
    expect(bandOf(null)).toBeNull();
    expect(isClosestObservable(row({ associationRank: 12 }))).toBe(true);
    expect(isClosestObservable(row({ associationRank: 24 }))).toBe(false);
    expect(isClosestObservable(row({ associationRank: null }))).toBe(false);
  });
});

describe("lista klubów", () => {
  test("deduplikuje kluby i sumuje występy oraz awanse", () => {
    const profiles = clubProfiles([
      row({ season: "2024-25", clubCoefficient: 10, reachedLeaguePhase: true }),
      row({ season: "2025-26", clubCoefficient: 8 }),
      row({ club: "Inny", articleKey: "Inny", clubCoefficient: 30 }),
    ]);
    expect(profiles).toHaveLength(2);
    // Sorted by peak coefficient, so the stronger club comes first.
    expect(profiles[0]!.club).toBe("Inny");
    const klub = profiles.find((profile) => profile.articleKey === "Klub")!;
    expect(klub.appearances).toBe(2);
    expect(klub.advanced).toBe(1);
    expect(klub.peakCoefficient).toBe(10);
    expect(klub.latestCoefficient).toBe(8);
    expect(klub.latestSeason).toBe("2025-26");
  });

  test("realny zbiór daje kilkaset klubów z dodatnimi współczynnikami", () => {
    const profiles = clubProfiles(COHORT);
    expect(profiles.length).toBeGreaterThan(150);
    for (const profile of profiles) {
      expect(profile.association).toMatch(/^[A-Z]{3}$/);
      if (profile.peakCoefficient !== null) expect(profile.peakCoefficient).toBeGreaterThan(0);
    }
  });
});

describe("pomocniki HTML", () => {
  const cell =
    '<td><span class="flagicon" data-mw=\'{"parts":[{"template":{"target":{"wt":"fbaicon"},"params":{"1":{"wt":"DEN"}}}}]}\'><img src="x.png"/></span>' +
    '<a href="https://en.wikipedia.org/wiki/F.C._Copenhagen" title="F.C. Copenhagen">Copenhagen</a> ' +
    '<a href="https://en.wikipedia.org/wiki/SK_Brann" title="SK Brann">Brann</a></td>';

  test("czyta klucz artykułu, nazwę, związek i wszystkie linki", () => {
    expect(articleKey(cell)).toBe("F.C._Copenhagen");
    expect(anchorText(cell)).toBe("Copenhagen");
    expect(associationCode(cell)).toBe("DEN");
    expect(articleKeys(cell)).toEqual(["F.C._Copenhagen", "SK_Brann"]);
    expect(text(cell)).toBe("Copenhagen Brann");
  });

  /** Loud on a page that changed shape, rather than quietly returning
   * nothing - a silent empty section would become a silently wrong rate. */
  test("brak sekcji jest błędem, nie pustką", () => {
    expect(() => section("<p>nic</p>", "Brak", "Teams")).toThrow(/not found/);
    expect(() => section('<h2 id="Teams">x</h2>', "Teams", "Brak")).toThrow(/not found/);
  });
});
