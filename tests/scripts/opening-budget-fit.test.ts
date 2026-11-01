import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makeTestTempDir } from "../temp-dir";
import { KOSZTY_STALE } from "../../src/data/balance";
import { FIT_CLUB_IDS, shortNameForClubId } from "../../scripts/opening-budget-fit-core";
import { main } from "../../scripts/opening-budget-fit";
import {
  BOARD_REINVESTMENT_RATES,
  BUDGET_SHARES,
  assertPairedInputs,
  buildGrid,
  candidateCash,
  candidateKey,
  careerIncomes,
  paretoFront,
  parseCareerDump,
  type VariantResult,
} from "../../scripts/opening-budget-fit-scan";
import { parseSeasonDump, type SeasonRow } from "../../scripts/finance-activation-report-core";
import { NO_DRAW_VERDICT } from "../../scripts/rng-control-snapshot";

/**
 * The scan's arithmetic and its CLI, on a fixture small enough to read.
 *
 * The eighteen clubs are not negotiable - the percentile is a property of the
 * whole league - so the fixture is eighteen clubs with two careers each rather
 * than a handful of rows.
 */

const SEASON_HEADER = [
  "dumpSchemaVersion",
  "engineVersion",
  "incomeMode",
  "clubShortName",
  "policyName",
  "seed",
  "season",
  "initialBudget",
  "preseasonForecastBalanceWithoutTransfersAndCups",
  "actualBalanceWithoutTransfersAndCups",
  "scaledRecurringRevenue",
  "leaguePositionPrize",
  "totalPayroll",
  "fixedCosts",
  "scalableNetPln",
  "cashAtHandover",
  "europeanPrizeIncome",
  "polishCupPrizeIncome",
  "superCupPrizeIncome",
  "creditedCupIncome",
  "rngDrawCount",
];

const CAREER_HEADER = [
  "polityka",
  "seed",
  "clubShortName",
  "incomeMode",
  "dumpSchemaVersion",
  "sezonyRozegrane",
  "rngDrawCount",
  "werdykt",
];

/** Two careers per club: one that ran its five seasons, one relegation cut
 * short after three. Both shapes have to work. */
const CAREERS = [
  { seed: 1, seasons: 5 },
  { seed: 2, seasons: 3 },
];

/** A balance that differs per club and per season, so an aggregate that
 * accidentally collapsed them would not come out right by luck. */
const balanceOf = (clubIndex: number, season: number): number =>
  Number((0.5 + clubIndex * 0.05 - season * 0.1).toFixed(4));

const cupsOf = (clubIndex: number, season: number, credited: boolean): number =>
  credited ? Number(((clubIndex % 3) * 0.1 + season * 0.05).toFixed(4)) : 0;

/** Each season's tally rises by a fixed amount, identical in both runs: the
 * tenure is the same football either way. */
const seasonDraws = (seed: number, season: number): number => 1000 + seed * 10 + season;

type FixtureOptions = {
  readonly credited: boolean;
  readonly verdictOf?: (_clubIndex: number, _seed: number) => string;
  readonly finalDrawsOf?: (_clubIndex: number, _seed: number) => number;
  readonly seasonDrawsOf?: (_seed: number, _season: number) => number;
};

const seasonDump = (options: FixtureOptions): string => {
  const rows = [SEASON_HEADER.join(",")];
  FIT_CLUB_IDS.forEach((clubId, clubIndex) => {
    for (const career of CAREERS) {
      for (let season = 1; season <= career.seasons; season += 1) {
        const cups = cupsOf(clubIndex, season, options.credited);
        rows.push(
          [
            4,
            "2026-09-12.1",
            options.credited ? "normal" : "finance-control",
            shortNameForClubId(clubId),
            "alwaysPass",
            career.seed,
            season,
            1,
            balanceOf(clubIndex, season),
            balanceOf(clubIndex, season),
            5,
            0.2,
            3,
            KOSZTY_STALE,
            1_000_000,
            season === career.seasons ? 2 : "",
            cups,
            0,
            0,
            cups,
            (options.seasonDrawsOf ?? seasonDraws)(career.seed, season),
          ].join(",")
        );
      }
    }
  });
  return rows.join("\n");
};

const careerDump = (options: FixtureOptions): string => {
  const rows = [CAREER_HEADER.join(",")];
  FIT_CLUB_IDS.forEach((clubId, clubIndex) => {
    for (const career of CAREERS) {
      rows.push(
        [
          "alwaysPass",
          career.seed,
          shortNameForClubId(clubId),
          options.credited ? "normal" : "finance-control",
          4,
          career.seasons,
          options.finalDrawsOf?.(clubIndex, career.seed) ?? 9000 + career.seed,
          options.verdictOf?.(clubIndex, career.seed) ?? "KLUB Z CZOŁÓWKI",
        ].join(",")
      );
    }
  });
  return rows.join("\n");
};

const parsed = (options: FixtureOptions) => ({
  seasons: parseSeasonDump(seasonDump(options), {
    incomeMode: options.credited ? "normal" : "finance-control",
  }),
  careers: parseCareerDump(careerDump(options), {
    incomeMode: options.credited ? "normal" : "finance-control",
  }),
});

const pairOf = (
  control: FixtureOptions = { credited: false },
  active: FixtureOptions = { credited: true }
) => {
  const c = parsed(control);
  const a = parsed(active);
  return {
    controlSeasons: c.seasons,
    activeSeasons: a.seasons,
    controlCareers: c.careers,
    activeCareers: a.careers,
  };
};

describe("the grid", () => {
  it("is the full product of the five axes, and exactly 2184 points", () => {
    const grid = buildGrid();
    expect(BUDGET_SHARES).toHaveLength(13);
    expect(BOARD_REINVESTMENT_RATES).toHaveLength(14);
    expect(BOARD_REINVESTMENT_RATES[BOARD_REINVESTMENT_RATES.length - 1]).toBe(1);
    expect(grid).toHaveLength(2184);
    expect(new Set(grid.map(candidateKey)).size).toBe(2184);
  });

  it("puts the axis points exactly on the grid, without float drift", () => {
    // 0.18 + 4 * 0.01 accumulated is 0.22000000000000003, which is a different
    // number from 0.22 in a JSON a later plan has to read.
    expect(BUDGET_SHARES).toContain(0.22);
    expect(BUDGET_SHARES[BUDGET_SHARES.length - 1]).toBe(0.3);
    expect(BOARD_REINVESTMENT_RATES).toContain(0.55);
  });

  it("lists variants in a stable order", () => {
    expect(buildGrid().map(candidateKey)).toEqual(buildGrid().map(candidateKey));
  });
});

describe("the paired-input gate", () => {
  it("accepts a well-formed pair and reports no RNG divergence", () => {
    const pairing = assertPairedInputs(pairOf());
    expect(pairing.totalCareers).toBe(FIT_CLUB_IDS.length * CAREERS.length);
    expect(pairing.finalTallyDiffers).toBe(0);
    expect(pairing.verdictBoundaryCrossed).toBe(0);
  });

  it("blocks on any RNG difference inside the tenure, even when the verdict also differs", () => {
    // The asymmetry the whole gate turns on. A difference before the verdict
    // means the two runs played different football, and no explanation saves
    // it - not even one that would legally excuse a final-tally difference.
    const pair = pairOf(
      { credited: false },
      {
        credited: true,
        seasonDrawsOf: (seed, season) => seasonDraws(seed, season) + (season === 2 ? 1 : 0),
        verdictOf: () => NO_DRAW_VERDICT,
        finalDrawsOf: (_clubIndex, seed) => 9000 + seed + 1,
      }
    );
    expect(() => assertPairedInputs(pair)).toThrow(/consumed 1012 and 1013 draws/);
  });

  it("allows a final-tally difference only where the no-draw verdict branch was crossed", () => {
    const crossed = pairOf(
      { credited: false },
      {
        credited: true,
        verdictOf: (clubIndex) => (clubIndex === 0 ? NO_DRAW_VERDICT : "KLUB Z CZOŁÓWKI"),
        finalDrawsOf: (clubIndex, seed) => 9000 + seed + (clubIndex === 0 ? 7 : 0),
      }
    );
    const pairing = assertPairedInputs(crossed);
    expect(pairing.finalTallyDiffers).toBe(CAREERS.length);
    expect(pairing.verdictBoundaryCrossed).toBe(CAREERS.length);
  });

  it("blocks an unattributed final-tally difference", () => {
    const unattributed = pairOf(
      { credited: false },
      { credited: true, finalDrawsOf: (_clubIndex, seed) => 9000 + seed + 5 }
    );
    expect(() => assertPairedInputs(unattributed)).toThrow(/unattributed/);
  });

  it("blocks a season whose operating balance moved", () => {
    const pair = pairOf();
    const broken = {
      ...pair,
      activeSeasons: pair.activeSeasons.map((row, i) =>
        i === 0 ? { ...row, actualBalanceWithoutTransfersAndCups: 99 } : row
      ),
    };
    expect(() => assertPairedInputs(broken)).toThrow(/actualBalanceWithoutTransfersAndCups/);
  });

  it("blocks a non-cup financial mismatch even when the net balance happens to match", () => {
    const pair = pairOf();
    const broken = {
      ...pair,
      activeSeasons: pair.activeSeasons.map((row, i) =>
        i === 0 ? { ...row, totalPayroll: row.totalPayroll + 1 } : row
      ),
    };
    expect(() => assertPairedInputs(broken)).toThrow(/totalPayroll/);
  });

  it("blocks dumps that are not exclusively the passive alwaysPass policy", () => {
    const pair = pairOf();
    const broken = {
      ...pair,
      controlSeasons: pair.controlSeasons.map((row, i) =>
        i === 0 ? { ...row, policyName: "alwaysBuyYoung" } : row
      ),
      activeSeasons: pair.activeSeasons.map((row, i) =>
        i === 0 ? { ...row, policyName: "alwaysBuyYoung" } : row
      ),
    };
    expect(() => assertPairedInputs(broken)).toThrow(/alwaysPass/);
  });

  it("blocks a season dump that does not contain every season declared by the raw career", () => {
    const pair = pairOf();
    const missingLastSeason = (row: SeasonRow): boolean =>
      row.clubShortName === "Legia" && row.seed === 1 && row.season === 5;
    const broken = {
      ...pair,
      controlSeasons: pair.controlSeasons.filter((row) => !missingLastSeason(row)),
      activeSeasons: pair.activeSeasons.filter((row) => !missingLastSeason(row)),
    };
    expect(() => assertPairedInputs(broken)).toThrow(
      /declares 5 seasons but the season dump has 4/
    );
  });

  it("blocks season dumps produced by different engine revisions", () => {
    const pair = pairOf();
    const broken = {
      ...pair,
      activeSeasons: pair.activeSeasons.map((row, i) =>
        i === 0 ? { ...row, engineVersion: "different-engine" } : row
      ),
    };
    expect(() => assertPairedInputs(broken)).toThrow(/engineVersion/);
  });

  it("blocks a controlled run that credited cup money", () => {
    expect(() => assertPairedInputs(pairOf({ credited: true }, { credited: true }))).toThrow(
      /the controlled run credited/
    );
  });

  it("blocks a club missing from one run", () => {
    const pair = pairOf();
    const dropped = {
      ...pair,
      activeSeasons: pair.activeSeasons.filter((row) => row.clubShortName !== "Legia"),
    };
    expect(() => assertPairedInputs(dropped)).toThrow(/no rows for club "Legia"/);
  });
});

describe("candidateCash", () => {
  it("is budget plus the rate times the real income of the seasons played", () => {
    const incomes = careerIncomes(parsed({ credited: true }).seasons);
    const career = incomes.find((c) => c.seasonsPlayed === 5);
    expect(career).toBeDefined();
    const byHand =
      10 + 0.5 * career!.seasonIncome.slice(0, 5).reduce((sum, value) => sum + value, 0);
    expect(candidateCash(career!, 10, 0.5, 5)).toBeCloseTo(byHand, 12);
    // A rate of zero leaves the budget exactly as handed over.
    expect(candidateCash(career!, 10, 0, 5)).toBe(10);
  });

  it("carries the cups, now that they are measured", () => {
    const withCups = careerIncomes(parsed({ credited: true }).seasons);
    const withoutCups = careerIncomes(parsed({ credited: false }).seasons);
    const a = withCups.find((c) => c.clubShortName === "Lech" && c.seed === 1)!;
    const b = withoutCups.find((c) => c.clubShortName === "Lech" && c.seed === 1)!;
    expect(candidateCash(a, 1, 1, 5)).toBeGreaterThan(candidateCash(b, 1, 1, 5));
  });

  it("refuses to read more seasons than the career played", () => {
    const short = careerIncomes(parsed({ credited: true }).seasons).find(
      (c) => c.seasonsPlayed === 3
    )!;
    expect(() => candidateCash(short, 1, 0.5, 5)).toThrow(/played 3 seasons/);
  });
});

describe("paretoFront", () => {
  const variantOf = (
    key: string,
    delta: number,
    negative: number,
    p95: number,
    iqr: number
  ): VariantResult =>
    ({
      key,
      aggregate: {
        totalBudgetDeltaVsCurrent: delta,
        clubsNegativeMedianCashAfterSeason5: negative,
        pooledP95CashAfterSeason5: p95,
        iqrBudget: iqr,
      },
    }) as unknown as VariantResult;

  it("drops a variant that is worse or equal on every axis", () => {
    const best = variantOf("best", 1, 0, 1, 9);
    const worse = variantOf("worse", 2, 1, 2, 8);
    expect(paretoFront([best, worse]).map((v) => v.key)).toEqual(["best"]);
  });

  it("keeps variants that trade one axis for another", () => {
    const cheap = variantOf("cheap", 1, 0, 1, 1);
    const spread = variantOf("spread", 5, 0, 1, 9);
    expect(
      paretoFront([cheap, spread])
        .map((v) => v.key)
        .sort()
    ).toEqual(["cheap", "spread"]);
  });

  it("keeps an exact duplicate: equal on every axis is not dominated", () => {
    const a = variantOf("a", 1, 0, 1, 1);
    const b = variantOf("b", 1, 0, 1, 1);
    expect(paretoFront([a, b])).toHaveLength(2);
  });
});

describe("the CLI", () => {
  const writeFixture = (): {
    dir: string;
    args: string[];
    mdPath: string;
    jsonPath: string;
  } => {
    const dir = makeTestTempDir("dd-opening-budget-fit");
    const controlSeasons = join(dir, "control-seasons.csv");
    const activeSeasons = join(dir, "active-seasons.csv");
    const controlRaw = join(dir, "control-raw.csv");
    const activeRaw = join(dir, "active-raw.csv");
    const baseline = join(dir, "baseline.json");
    const mdPath = join(dir, "report.md");
    const jsonPath = join(dir, "report.json");

    writeFileSync(controlSeasons, seasonDump({ credited: false }), "utf8");
    writeFileSync(activeSeasons, seasonDump({ credited: true }), "utf8");
    writeFileSync(controlRaw, careerDump({ credited: false }), "utf8");
    writeFileSync(activeRaw, careerDump({ credited: true }), "utf8");

    // The drift control compares against a pinned baseline; the fixture pins
    // its own, built from the very medians it wrote.
    const controlRows = parseSeasonDump(seasonDump({ credited: false }), {
      incomeMode: "finance-control",
    });
    const byClub = new Map<string, number[]>();
    for (const row of controlRows) {
      const list = byClub.get(row.clubShortName);
      if (list) list.push(row.actualBalanceWithoutTransfersAndCups);
      else byClub.set(row.clubShortName, [row.actualBalanceWithoutTransfersAndCups]);
    }
    writeFileSync(
      baseline,
      JSON.stringify({
        metrics: {
          ladderShares: [...byClub.entries()].map(([clubShortName, values]) => {
            const sorted = [...values].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return {
              clubShortName,
              medianSeasonBalance:
                sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1]! + sorted[mid]!) / 2,
            };
          }),
        },
      }),
      "utf8"
    );

    return {
      dir,
      mdPath,
      jsonPath,
      args: [
        "--control-seasons",
        controlSeasons,
        "--active-seasons",
        activeSeasons,
        "--control-raw",
        controlRaw,
        "--active-raw",
        activeRaw,
        "--baseline",
        baseline,
        "--md",
        mdPath,
        "--json",
        jsonPath,
      ],
    };
  };

  it(
    "writes a report and a JSON, and nothing outside the paths it was given",
    { timeout: 60_000 },
    () => {
      const fixture = writeFixture();
      const before = new Set(readdirSync(fixture.dir));
      expect(main(fixture.args)).toBe(0);
      const after = readdirSync(fixture.dir);
      for (const entry of after) {
        if (before.has(entry)) continue;
        expect(["report.md", "report.json"]).toContain(entry);
      }

      const markdown = readFileSync(fixture.mdPath, "utf8");
      expect(markdown).toContain("DECISION REQUIRED");
      expect(markdown).toContain("passive always-pass estimate");
      expect(markdown).toContain("baseline.json");
      expect(markdown).toContain("mediana bilansu bez pucharów");
      expect(markdown).toContain("mediana pucharów w S1");
      expect(markdown).toContain("mediana pucharów w karierze");
      expect(markdown).toContain("Przebieg stopy: zachowawczy");
      expect(markdown).toContain("Przebieg stopy: środkowy");
      expect(markdown).toContain("Przebieg stopy: hojny");
      expect(markdown).toContain("proxy wkładu do dziedzictwa przy przekazaniu");
      expect(markdown).toContain("Nie mierzy gotówki końcowej po epilogu");
      // Exactly five questions, no sixth hidden dial.
      expect(markdown).toContain("## Pięć pytań do właściciela produktu");
      expect(markdown).toMatch(/^5\. \*\*percentyl `active`\*\*/m);
      expect(markdown).not.toMatch(/^6\./m);
    }
  );

  // Two full scans of the 2184-point grid, so it needs more than the default
  // five seconds. The grid size is the plan's, not a knob to turn down.
  it("produces the same bytes on two runs", { timeout: 60_000 }, () => {
    const first = writeFixture();
    expect(main(first.args)).toBe(0);
    const second = writeFixture();
    expect(main(second.args)).toBe(0);

    // No path normalisation: the outputs record input FILENAMES, not the
    // directories the files happened to sit in, so two runs from two different
    // temp directories must already be byte-identical.
    const digest = (path: string): string =>
      createHash("sha256").update(readFileSync(path)).digest("hex");

    expect(digest(first.jsonPath)).toBe(digest(second.jsonPath));
    expect(digest(first.mdPath)).toBe(digest(second.mdPath));
  });

  it("writes no absolute path into the artefacts", { timeout: 60_000 }, () => {
    // Both files are committed. A scratch directory outside the repo would put
    // somebody's home directory into the history - the leak the repo's own
    // pre-commit hook blocks in source files.
    const fixture = writeFixture();
    expect(main(fixture.args)).toBe(0);
    for (const path of [fixture.mdPath, fixture.jsonPath]) {
      const text = readFileSync(path, "utf8");
      expect(text).not.toContain(fixture.dir);
      expect(text).not.toMatch(/[A-Za-z]:[\\/]Users[\\/]/);
      expect(text).not.toMatch(/\/home\/[a-z]/);
      // The filenames themselves do survive, beside their hashes.
      expect(text).toContain("control-seasons.csv");
    }
  });

  it("keeps full precision in the JSON", { timeout: 60_000 }, () => {
    const fixture = writeFixture();
    expect(main(fixture.args)).toBe(0);
    const json = JSON.parse(readFileSync(fixture.jsonPath, "utf8")) as {
      status: string;
      gridSize: number;
      paretoFront: string[];
      rateSweeps: { label: string; variants: string[] }[];
      variants: {
        key: string;
        clubs: { initialBudget: number }[] | null;
        aggregate: { iqrBudget: number };
      }[];
    };
    expect(json.status).toBe("DECISION REQUIRED");
    expect(json.gridSize).toBe(2184);
    expect(json.variants).toHaveLength(2184);

    // The club rows are carried for the front and the named slices; every
    // other variant keeps its aggregate and drops the eighteen rows, which is
    // what keeps the artefact a file somebody can open. Null, not an empty
    // array: "not carried" and "no clubs" are different statements.
    const detailed = json.variants.filter((v) => v.clubs !== null);
    expect(detailed.length).toBeGreaterThanOrEqual(json.paretoFront.length);
    expect(detailed.length).toBeLessThan(json.variants.length);
    for (const key of json.paretoFront) {
      expect(json.variants.find((v) => v.key === key)?.clubs).not.toBeNull();
    }
    expect(json.rateSweeps.map((sweep) => sweep.label)).toEqual([
      "zachowawczy",
      "środkowy",
      "hojny",
    ]);
    for (const sweep of json.rateSweeps) {
      expect(sweep.variants).toHaveLength(BOARD_REINVESTMENT_RATES.length);
      for (const key of sweep.variants) {
        expect(json.variants.find((v) => v.key === key)?.clubs).not.toBeNull();
      }
    }

    // A rounded budget would be a second, disagreeing copy of the report.
    const budgets = detailed.flatMap((v) => (v.clubs ?? []).map((c) => c.initialBudget));
    expect(budgets.some((value) => String(value).replace(/^\d+\./, "").length > 6)).toBe(true);
    // The aggregates are kept at full precision for every variant, front or not.
    expect(
      json.variants.some((v) => String(v.aggregate.iqrBudget).replace(/^\d+\./, "").length > 6)
    ).toBe(true);
  });

  it("refuses a missing required flag", () => {
    expect(() => main(["--md", "x.md"])).toThrow(/--control-seasons is required/);
  });

  it("prints help without writing anything", () => {
    expect(main(["--help"])).toBe(0);
  });
});
