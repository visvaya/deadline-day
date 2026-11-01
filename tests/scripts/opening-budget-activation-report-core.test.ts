import { describe, expect, it } from "vitest";

import { BOARD_REINVESTMENT_RATE } from "../../src/data/balance";
import { DUMP_SCHEMA_VERSION } from "../../scripts/balance-metrics";
import {
  CASH_DRIFT_TOLERANCE,
  EXPECTED_FLOOR_CLUBS,
  MONEY_SCALE_TOLERANCE,
  NO_DRAW_VERDICT,
  ACCEPTED_DUMP_SCHEMAS,
  attributeRng,
  cashAtHandoverPerCareer,
  cashDrift,
  legacyMultiplierCandidate,
  legacyUnit,
  medianOfClubMedians,
  moneyScaleGate,
  parseCareerDump,
  parseSeasonDump,
  perClubMedians,
  playability,
  pooledMedian,
  type CareerRow,
  type SeasonRow,
  type SnapshotCareer,
} from "../../scripts/opening-budget-activation-report-core";

/**
 * The report is only as honest as its refusals, so most of what is checked
 * here is what the parsers reject: a dump that lost a club, a career counted
 * twice, a schema the tool does not own. A median taken from any of those
 * would still look like a number.
 */

/** The schema most fixtures below are built at. Not `ACCEPTED_DUMP_SCHEMAS[0]`:
 * that would make the fixtures track the accepted set instead of pinning a
 * concrete row shape, which is the opposite of what a fixture is for. */
const DEFAULT_DUMP_SCHEMA = 4;

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
  "cashAtHandover",
  "creditedCupIncome",
  "rngDrawCount",
].join(",");

type SeasonOverrides = Partial<Record<string, string | number>>;

const seasonLine = (overrides: SeasonOverrides = {}): string => {
  const base: Record<string, string | number> = {
    dumpSchemaVersion: DEFAULT_DUMP_SCHEMA,
    engineVersion: "2026-09-12.1",
    incomeMode: "finance-control",
    clubShortName: "Legia",
    policyName: "alwaysPass",
    seed: 1,
    season: 1,
    initialBudget: 1.5,
    preseasonForecastBalanceWithoutTransfersAndCups: 2,
    actualBalanceWithoutTransfersAndCups: 2,
    scaledRecurringRevenue: 9,
    leaguePositionPrize: 0.3,
    totalPayroll: 2.4,
    fixedCosts: 1.1,
    cashAtHandover: "",
    creditedCupIncome: 0,
    rngDrawCount: 100,
    ...overrides,
  };
  return SEASON_HEADER.split(",")
    .map((column) => String(base[column]))
    .join(",");
};

const CAREER_HEADER = [
  "polityka",
  "seed",
  "kasa",
  "wartoscKadryMoj",
  "clubShortName",
  "incomeMode",
  "dumpSchemaVersion",
  "rngDrawCount",
  "werdykt",
  "sezonyRozegrane",
  "pktA",
  "trofea",
  "sezonyLM",
  "sezonyLE",
  "sezonyLK",
  "handoverSeason",
  "spadkiKadencja",
  "pierwszySpadekSezon",
].join(",");

const careerLine = (overrides: SeasonOverrides = {}): string => {
  const base: Record<string, string | number> = {
    polityka: "alwaysPass",
    seed: 1,
    kasa: 3,
    wartoscKadryMoj: 1.2,
    clubShortName: "Legia",
    incomeMode: "finance-control",
    dumpSchemaVersion: DEFAULT_DUMP_SCHEMA,
    rngDrawCount: 200,
    werdykt: "KLUB Z CZOŁÓWKI",
    sezonyRozegrane: 1,
    pktA: 250,
    trofea: 1,
    sezonyLM: 0,
    sezonyLE: 0,
    sezonyLK: 0,
    handoverSeason: 5,
    spadkiKadencja: 0,
    pierwszySpadekSezon: 0,
    ...overrides,
  };
  return CAREER_HEADER.split(",")
    .map((column) => String(base[column]))
    .join(",");
};

const oneClubExpectation = {
  incomeMode: "finance-control",
  clubs: ["legia-warszawa"],
  policies: ["alwaysPass"],
  runsPerCell: 1,
};

describe("the matrix is keyed by club id", () => {
  // ACTIVE_CLUBS (the CLI's default matrix) holds clubIds ("lech-poznan"),
  // while the dump's own `clubShortName` column holds a display name
  // ("Lech"). Before this fix the matrix check compared the two directly,
  // so even the audit's own pinned schema-4 artefacts could not be read.
  it("matches a dump row's short name against an expected club id", () => {
    const rows = parseCareerDump(
      [CAREER_HEADER, careerLine({ clubShortName: "Lech" })].join("\n"),
      { ...oneClubExpectation, clubs: ["lech-poznan"] }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.clubShortName).toBe("Lech");
  });

  it("throws on a short name the club roster does not know", () => {
    expect(() =>
      parseCareerDump([CAREER_HEADER, careerLine({ clubShortName: "Nieznany" })].join("\n"), {
        ...oneClubExpectation,
        clubs: ["lech-poznan"],
      })
    ).toThrow(/Unknown or ambiguous club short name "Nieznany"/);
  });

  it("matches a season dump row's short name against an expected club id", () => {
    const rows = parseSeasonDump(
      [SEASON_HEADER, seasonLine({ clubShortName: "Lech" })].join("\n"),
      { ...oneClubExpectation, clubs: ["lech-poznan"] }
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.clubShortName).toBe("Lech");
  });
});

describe("the pinned schema", () => {
  it("accepts exactly schema 4 and schema 5", () => {
    expect(ACCEPTED_DUMP_SCHEMAS).toEqual([4, 5]);
  });

  // Schema 4 is the audit's own committed artefacts (2026-09-12 activation
  // dumps), never regenerated. Schema 5 was added 2026-09-24 for the spec 4
  // control measurement, which needs this audit to read a fresh
  // `pnpm balance` run: the clubId migration of the career dump dropped `poziom` for `clubId` in
  // the career dump, but every column this audit reads is unchanged in
  // meaning between the two schemas.
  it("acknowledges the live schema is one of the accepted ones, so the next bump is reported rather than silently absorbed", () => {
    expect(ACCEPTED_DUMP_SCHEMAS).toContain(DUMP_SCHEMA_VERSION);
  });

  it("still rejects a schema outside the accepted set", () => {
    expect(() =>
      parseCareerDump(
        [CAREER_HEADER, careerLine({ dumpSchemaVersion: 3 })].join("\n"),
        oneClubExpectation
      )
    ).toThrow(/dump schema 3 is not one of 4, 5/);
    expect(() =>
      parseCareerDump(
        [CAREER_HEADER, careerLine({ dumpSchemaVersion: 6 })].join("\n"),
        oneClubExpectation
      )
    ).toThrow(/dump schema 6 is not one of 4, 5/);
  });
});

describe("parseSeasonDump", () => {
  it("reads a well-formed dump", () => {
    const rows = parseSeasonDump(
      [SEASON_HEADER, seasonLine({ cashAtHandover: 4.2 })].join("\n"),
      oneClubExpectation
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cashAtHandover).toBe(4.2);
    expect(rows[0]!.creditedCupIncome).toBe(0);
  });

  it("leaves an empty handover cell as null rather than zero", () => {
    const rows = parseSeasonDump([SEASON_HEADER, seasonLine()].join("\n"), oneClubExpectation);
    expect(rows[0]!.cashAtHandover).toBeNull();
  });

  it("refuses a schema it does not own", () => {
    expect(() =>
      parseSeasonDump(
        [SEASON_HEADER, seasonLine({ dumpSchemaVersion: 3 })].join("\n"),
        oneClubExpectation
      )
    ).toThrow(/dump schema 3 is not one of 4, 5/);
    expect(() =>
      parseSeasonDump(
        [SEASON_HEADER, seasonLine({ dumpSchemaVersion: 6 })].join("\n"),
        oneClubExpectation
      )
    ).toThrow(/dump schema 6 is not one of 4, 5/);
  });

  it("reads a schema-5 season row", () => {
    const rows = parseSeasonDump(
      [SEASON_HEADER, seasonLine({ dumpSchemaVersion: 5 })].join("\n"),
      oneClubExpectation
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dumpSchemaVersion).toBe(5);
  });

  it("refuses a season dump mixing schema 4 and schema 5 rows", () => {
    expect(() =>
      parseSeasonDump(
        [
          SEASON_HEADER,
          seasonLine({ seed: 1, dumpSchemaVersion: 4 }),
          seasonLine({ seed: 2, dumpSchemaVersion: 5 }),
        ].join("\n"),
        { ...oneClubExpectation, runsPerCell: 2 }
      )
    ).toThrow(/mixes dump schemas: 4, 5/);
  });

  it("refuses a mixed economy", () => {
    expect(() =>
      parseSeasonDump(
        [SEASON_HEADER, seasonLine({ incomeMode: "normal" })].join("\n"),
        oneClubExpectation
      )
    ).toThrow(/incomeMode/);
  });

  it("refuses a duplicated season", () => {
    expect(() =>
      parseSeasonDump([SEASON_HEADER, seasonLine(), seasonLine()].join("\n"), oneClubExpectation)
    ).toThrow(/duplicate season/);
  });

  it("refuses a dump that lost a club", () => {
    expect(() =>
      parseSeasonDump([SEASON_HEADER, seasonLine()].join("\n"), {
        ...oneClubExpectation,
        clubs: ["legia-warszawa", "lech-poznan"],
      })
    ).toThrow(/no rows for lech-poznan/);
  });

  it("refuses a cell with the wrong number of seeds", () => {
    expect(() =>
      parseSeasonDump([SEASON_HEADER, seasonLine()].join("\n"), {
        ...oneClubExpectation,
        runsPerCell: 2,
      })
    ).toThrow(/has 1 seeds, expected 2/);
  });

  it("refuses a dump that mixes engine versions", () => {
    expect(() =>
      parseSeasonDump(
        [
          SEASON_HEADER,
          seasonLine({ seed: 1 }),
          seasonLine({ seed: 2, engineVersion: "2026-09-10.1" }),
        ].join("\n"),
        { ...oneClubExpectation, runsPerCell: 2 }
      )
    ).toThrow(/mixes engine versions/);
  });

  it("refuses a missing column rather than reading it as empty", () => {
    const header = SEASON_HEADER.replace(",creditedCupIncome", "");
    expect(() => parseSeasonDump([header, seasonLine()].join("\n"), oneClubExpectation)).toThrow(
      /missing the "creditedCupIncome" column/
    );
  });
});

describe("parseCareerDump", () => {
  it("derives the verdict draw class from the title", () => {
    const rows = parseCareerDump([CAREER_HEADER, careerLine()].join("\n"), oneClubExpectation);
    expect(rows[0]!.verdictDraws).toBe(1);
    const none = parseCareerDump(
      [CAREER_HEADER, careerLine({ werdykt: NO_DRAW_VERDICT })].join("\n"),
      oneClubExpectation
    );
    expect(none[0]!.verdictDraws).toBe(0);
  });

  it("refuses a duplicated career and a missing verdict", () => {
    expect(() =>
      parseCareerDump([CAREER_HEADER, careerLine(), careerLine()].join("\n"), oneClubExpectation)
    ).toThrow(/duplicate career/);
    expect(() =>
      parseCareerDump([CAREER_HEADER, careerLine({ werdykt: "" })].join("\n"), oneClubExpectation)
    ).toThrow(/missing verdict/);
  });

  it("refuses a policy outside the expected set", () => {
    expect(() =>
      parseCareerDump([CAREER_HEADER, careerLine({ polityka: "mixed" })].join("\n"), {
        ...oneClubExpectation,
      })
    ).toThrow(/policy "mixed"/);
  });

  it("reads a schema-5 career row", () => {
    const rows = parseCareerDump(
      [CAREER_HEADER, careerLine({ dumpSchemaVersion: 5 })].join("\n"),
      oneClubExpectation
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kasa).toBe(3);
  });

  it("refuses a career dump mixing schema 4 and schema 5 rows", () => {
    expect(() =>
      parseCareerDump(
        [
          CAREER_HEADER,
          careerLine({ seed: 1, dumpSchemaVersion: 4 }),
          careerLine({ seed: 2, dumpSchemaVersion: 5 }),
        ].join("\n"),
        { ...oneClubExpectation, runsPerCell: 2 }
      )
    ).toThrow(/mixes dump schemas: 4, 5/);
  });
});

describe("aggregates", () => {
  it("weights clubs equally, unlike the pooled median", () => {
    const rows = [
      { club: "A", value: 10 },
      { club: "B", value: 0 },
      { club: "B", value: 0 },
      { club: "B", value: 0 },
    ];
    expect(pooledMedian(rows.map((row) => row.value))).toBe(0);
    expect(
      medianOfClubMedians(
        rows,
        (row) => row.club,
        (row) => row.value
      )
    ).toBe(5);
  });

  it("reports a median per club, sorted by name", () => {
    const rows = [
      { club: "Lech", value: 2 },
      { club: "Legia", value: 4 },
      { club: "Legia", value: 6 },
    ];
    expect(
      perClubMedians(
        rows,
        (row) => row.club,
        (row) => row.value
      )
    ).toEqual([
      { clubShortName: "Lech", value: 2 },
      { clubShortName: "Legia", value: 5 },
    ]);
  });
});

describe("cashAtHandoverPerCareer", () => {
  const build = (rows: readonly Partial<SeasonRow>[]): SeasonRow[] =>
    rows.map((row) => ({
      dumpSchemaVersion: DEFAULT_DUMP_SCHEMA,
      engineVersion: "2026-09-12.1",
      incomeMode: "finance-control",
      clubShortName: "Legia",
      policyName: "alwaysPass",
      seed: 1,
      season: 1,
      initialBudget: 1,
      preseasonForecastBalanceWithoutTransfersAndCups: 0,
      actualBalanceWithoutTransfersAndCups: 0,
      scaledRecurringRevenue: 9,
      leaguePositionPrize: 0,
      totalPayroll: 0,
      fixedCosts: 0,
      cashAtHandover: null,
      creditedCupIncome: 0,
      rngDrawCount: 0,
      ...row,
    }));

  it("takes the figure off the season the engine wrote it on, however short the tenure", () => {
    const cut = cashAtHandoverPerCareer(
      build([{ season: 1 }, { season: 2, cashAtHandover: 1.75 }])
    );
    expect(cut).toHaveLength(1);
    expect(cut[0]!.cash).toBe(1.75);
  });

  it("refuses a career with no handover, rather than imputing one", () => {
    expect(() => cashAtHandoverPerCareer(build([{ season: 1 }]))).toThrow(/has no handover cash/);
  });

  it("refuses two handover figures for one career", () => {
    expect(() =>
      cashAtHandoverPerCareer(
        build([
          { season: 1, cashAtHandover: 1 },
          { season: 2, cashAtHandover: 2 },
        ])
      )
    ).toThrow(/more than one season/);
  });
});

describe("gates", () => {
  const season = (overrides: Partial<SeasonRow>): SeasonRow => ({
    dumpSchemaVersion: DEFAULT_DUMP_SCHEMA,
    engineVersion: "2026-09-12.1",
    incomeMode: "finance-control",
    clubShortName: "Legia",
    policyName: "alwaysPass",
    seed: 1,
    season: 1,
    initialBudget: 1,
    preseasonForecastBalanceWithoutTransfersAndCups: 0,
    actualBalanceWithoutTransfersAndCups: 0,
    scaledRecurringRevenue: 9,
    leaguePositionPrize: 0,
    totalPayroll: 0,
    fixedCosts: 0,
    cashAtHandover: null,
    creditedCupIncome: 0,
    rngDrawCount: 0,
    ...overrides,
  });

  it("passes the money scale at zero and fails it beyond the tolerance", () => {
    expect(moneyScaleGate([season({})]).withinTolerance).toBe(true);
    expect(
      moneyScaleGate([
        season({ actualBalanceWithoutTransfersAndCups: MONEY_SCALE_TOLERANCE + 0.01 }),
      ]).withinTolerance
    ).toBe(false);
  });

  it("measures cash drift against the board's SHARE of the forecast, not the raw forecast", () => {
    // A career that banked exactly the share has zero drift; measured against
    // the raw forecast it would look like a 7 mln hole, which is the whole
    // reason this version of the residual exists.
    const rows = [
      season({
        season: 1,
        initialBudget: 1,
        preseasonForecastBalanceWithoutTransfersAndCups: 10,
      }),
      season({
        season: 2,
        initialBudget: 1,
        preseasonForecastBalanceWithoutTransfersAndCups: 10,
        cashAtHandover: 1 + 20 * BOARD_REINVESTMENT_RATE,
      }),
    ];
    const drift = cashDrift(rows);
    expect(drift).toHaveLength(1);
    expect(drift[0]!.medianResidual).toBeCloseTo(0, 12);
    expect(drift[0]!.withinTolerance).toBe(true);

    const againstRaw = cashDrift(rows, 1);
    expect(Math.abs(againstRaw[0]!.medianResidual)).toBeGreaterThan(CASH_DRIFT_TOLERANCE);
  });

  it("asks playability of every club", () => {
    const rows = playability([
      { clubShortName: "Legia", budget: 2, cost: 1 },
      { clubShortName: "Piast", budget: 0.5, cost: 1 },
    ]);
    expect(rows.map((row) => row.affordable)).toEqual([false, true]);
    expect(rows[0]!.clubShortName).toBe("Piast");
  });

  it("compares both sides at the precision money is settled at", () => {
    // The real case: the formula gives 1.5333, the reducer rounds the budget
    // to 1.53, and the club is not one grosz short of anything.
    const rounded = playability([
      { clubShortName: "Widzew", budget: 1.53, cost: 1.533332185420262 },
    ]);
    expect(rounded[0]!.affordable).toBe(true);

    // A club that is genuinely short still fails.
    const short = playability([{ clubShortName: "Piast", budget: 0.75, cost: 0.79 }]);
    expect(short[0]!.affordable).toBe(false);
  });

  it("expects the floor to bind for five clubs", () => {
    expect(EXPECTED_FLOOR_CLUBS).toBe(5);
  });
});

describe("legacy units", () => {
  it("is a unit conversion: the historical product is preserved", () => {
    const candidate = legacyMultiplierCandidate(16.55, 0.84);
    expect(candidate * 0.84).toBeCloseTo(16.55, 12);
    const unit = legacyUnit("kasa", 16.55, 0.84, candidate);
    expect(unit.relativeError).toBeCloseTo(0, 12);
    expect(unit.withinTolerance).toBe(true);
  });

  it("blocks rather than dividing by a median that has no conversion", () => {
    expect(() => legacyMultiplierCandidate(16.55, 0)).toThrow(/no sensible unit conversion/);
    expect(() => legacyMultiplierCandidate(16.55, -1)).toThrow(/no sensible unit conversion/);
    expect(() => legacyUnit("kasa", 16.55, Number.NaN, 5)).toThrow(/no sensible unit conversion/);
  });

  it("fails a multiplier that no longer reproduces the product", () => {
    expect(legacyUnit("kasa", 16.55, 3.31, 5).withinTolerance).toBe(true);
    expect(legacyUnit("kasa", 16.55, 0.84, 5).withinTolerance).toBe(false);
  });
});

describe("attributeRng", () => {
  const snapshotCareer = (overrides: Partial<SnapshotCareer> = {}): SnapshotCareer => ({
    sezonyRozegrane: 2,
    pktA: 250,
    trofea: 1,
    sezonyLM: 0,
    sezonyLE: 0,
    sezonyLK: 0,
    handoverSeason: 5,
    spadkiKadencja: 0,
    pierwszySpadekSezon: 0,
    werdykt: "KLUB Z CZOŁÓWKI",
    verdictDraws: 1,
    rngDrawCount: 200,
    seasons: [
      {
        season: 1,
        actualBalanceWithoutTransfersAndCups: 2,
        creditedCupIncome: 0,
        rngDrawCount: 90,
      },
      {
        season: 2,
        actualBalanceWithoutTransfersAndCups: 3,
        creditedCupIncome: 0,
        rngDrawCount: 190,
      },
    ],
    ...overrides,
  });

  const after = (overrides: Partial<CareerRow> = {}): CareerRow => ({
    clubShortName: "Legia",
    policyName: "alwaysPass",
    seed: 1,
    incomeMode: "finance-control",
    kasa: 3,
    wartoscKadryMoj: 1.2,
    werdykt: "KLUB Z CZOŁÓWKI",
    verdictDraws: 1,
    rngDrawCount: 200,
    sezonyRozegrane: 2,
    pktA: 250,
    trofea: 1,
    sezonyLM: 0,
    sezonyLE: 0,
    sezonyLK: 0,
    handoverSeason: 5,
    spadkiKadencja: 0,
    pierwszySpadekSezon: 0,
    ...overrides,
  });

  const seasonsFor = (rows: readonly Partial<SeasonRow>[]): Map<string, SeasonRow[]> =>
    new Map([
      [
        "Legia\0alwaysPass\x001",
        rows.map((row, i) => ({
          dumpSchemaVersion: DEFAULT_DUMP_SCHEMA,
          engineVersion: "2026-09-12.1",
          incomeMode: "finance-control",
          clubShortName: "Legia",
          policyName: "alwaysPass",
          seed: 1,
          season: i + 1,
          initialBudget: 1,
          preseasonForecastBalanceWithoutTransfersAndCups: 0,
          actualBalanceWithoutTransfersAndCups: i === 0 ? 2 : 3,
          scaledRecurringRevenue: 9,
          leaguePositionPrize: 0,
          totalPayroll: 0,
          fixedCosts: 0,
          cashAtHandover: null,
          creditedCupIncome: 0,
          rngDrawCount: i === 0 ? 90 : 190,
          ...row,
        })),
      ],
    ]);

  const defaultSeasons = seasonsFor([{}, {}]);

  it("attributes nothing when everything matches", () => {
    const result = attributeRng(() => snapshotCareer(), 1, [after()], defaultSeasons);
    expect(result.allAttributed).toBe(true);
    expect(result.identicalDraws).toBe(1);
    expect(result.identicalPrelude).toBe(1);
    expect(result.unexplainedDrawCount).toBe(0);
  });

  it("catches a seed the snapshot does not have", () => {
    const result = attributeRng(() => undefined, 1, [after({ seed: 999 })], defaultSeasons);
    expect(result.missingBefore).toBe(1);
    expect(result.allAttributed).toBe(false);
  });

  it("allows a moved draw tally only after a changed verdict class", () => {
    const allowed = attributeRng(
      () => snapshotCareer({ werdykt: NO_DRAW_VERDICT, verdictDraws: 0, rngDrawCount: 199 }),
      1,
      [after()],
      defaultSeasons
    );
    expect(allowed.explainedByVerdictClass).toBe(1);
    expect(allowed.changedVerdictTitle).toBe(1);
    expect(allowed.changedVerdictClass).toBe(1);
    expect(allowed.allAttributed).toBe(true);

    const refused = attributeRng(
      () => snapshotCareer({ rngDrawCount: 199 }),
      1,
      [after()],
      defaultSeasons
    );
    expect(refused.unexplainedDrawCount).toBe(1);
    expect(refused.allAttributed).toBe(false);
  });

  it("treats the epilogue's trophy component as downstream of the verdict", () => {
    // `trofea` in the raw dump counts the EPILOGUE's cups and titles too, so
    // a changed verdict class legitimately moves it. Classifying it as a
    // pre-verdict field would report the epilogue's own consequence as an
    // unexplained reordering of the tenure.
    const allowed = attributeRng(
      () =>
        snapshotCareer({
          trofea: 15,
          werdykt: NO_DRAW_VERDICT,
          verdictDraws: 0,
          rngDrawCount: 199,
        }),
      1,
      [after({ trofea: 40 })],
      defaultSeasons
    );
    expect(allowed.changedTrofea).toBe(1);
    expect(allowed.unexplainedTrofea).toEqual([]);
    expect(allowed.identicalPrelude).toBe(1);
    expect(allowed.allAttributed).toBe(true);

    // Moving without a changed class is still a failure: nothing else in the
    // activation may reorder a career the control run never bought into.
    const refused = attributeRng(
      () => snapshotCareer({ trofea: 15 }),
      1,
      [after({ trofea: 40 })],
      defaultSeasons
    );
    expect(refused.unexplainedTrofea).toEqual(["Legia/1"]);
    expect(refused.unexplainedTrofeaCount).toBe(1);
    expect(refused.allAttributed).toBe(false);
  });

  it("refuses a changed pre-verdict field even when the tally agrees", () => {
    const result = attributeRng(() => snapshotCareer({ pktA: 251 }), 1, [after()], defaultSeasons);
    expect(result.identicalDraws).toBe(1);
    expect(result.changedPrelude).toEqual(["Legia/1"]);
    expect(result.changedPreludeCount).toBe(1);
    expect(result.allAttributed).toBe(false);
  });

  it("catches a missing season and a different season count", () => {
    const result = attributeRng(
      () => snapshotCareer(),
      1,
      [after()],
      seasonsFor([{}]) // one season against the snapshot's two
    );
    expect(result.seasonCountMismatch).toEqual(["Legia/1"]);
    expect(result.seasonCountMismatchCount).toBe(1);
    expect(result.allAttributed).toBe(false);
  });

  it("catches a changed balance under an unchanged counter", () => {
    const result = attributeRng(
      () => snapshotCareer(),
      1,
      [after()],
      seasonsFor([{ actualBalanceWithoutTransfersAndCups: 2.5 }, {}])
    );
    expect(result.seasonBalanceMismatch).toEqual(["Legia/1@1"]);
    expect(result.seasonBalanceMismatchCount).toBe(1);
    expect(result.seasonDrawMismatch).toEqual([]);
    expect(result.allAttributed).toBe(false);
  });

  it("catches a changed cup receipt and a changed seasonal draw tally", () => {
    const cup = attributeRng(
      () => snapshotCareer(),
      1,
      [after()],
      seasonsFor([{ creditedCupIncome: 1.4 }, {}])
    );
    expect(cup.seasonBalanceMismatch).toEqual(["Legia/1@1"]);

    const draws = attributeRng(
      () => snapshotCareer(),
      1,
      [after()],
      seasonsFor([{ rngDrawCount: 91 }, {}])
    );
    expect(draws.seasonDrawMismatch).toEqual(["Legia/1@1"]);
    expect(draws.seasonDrawMismatchCount).toBe(1);
    expect(draws.allAttributed).toBe(false);
  });
});
