import { PINNED_DUMP_SCHEMA } from "../../scripts/opening-budget-activation-report-core";

/**
 * The two dump shapes the opening-budget tools read, as CSV text a test can
 * build by hand.
 *
 * Shared by the snapshot tests and the report tests because both have to
 * write rows in EXACTLY the column order the parsers expect - two copies
 * would let one drift and leave the other testing a header the engine never
 * writes.
 */

export const SEASON_HEADER = [
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

export const CAREER_HEADER = [
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

export type CellOverrides = Record<string, string | number>;

const line = (header: string, values: CellOverrides): string =>
  header
    .split(",")
    .map((column) => String(values[column] ?? ""))
    .join(",");

/** One season row of a controlled `alwaysPass` run, with every cell
 * overridable. The defaults are a plausible Legia season one. */
export const seasonRow = (overrides: CellOverrides = {}): string =>
  line(SEASON_HEADER, {
    dumpSchemaVersion: PINNED_DUMP_SCHEMA,
    engineVersion: "2026-09-12.1",
    incomeMode: "finance-control",
    clubShortName: "Legia",
    policyName: "alwaysPass",
    seed: 7,
    season: 1,
    initialBudget: 1.87,
    preseasonForecastBalanceWithoutTransfersAndCups: 6,
    actualBalanceWithoutTransfersAndCups: 6.1,
    scaledRecurringRevenue: 9.34,
    leaguePositionPrize: 0.3,
    totalPayroll: 2.43,
    fixedCosts: 1.1,
    cashAtHandover: "",
    creditedCupIncome: 0,
    rngDrawCount: 1737,
    ...overrides,
  });

/** One career row of the same run. */
export const careerRow = (overrides: CellOverrides = {}): string =>
  line(CAREER_HEADER, {
    polityka: "alwaysPass",
    seed: 7,
    kasa: 0.92,
    wartoscKadryMoj: 0,
    clubShortName: "Legia",
    incomeMode: "finance-control",
    dumpSchemaVersion: PINNED_DUMP_SCHEMA,
    rngDrawCount: 12461,
    werdykt: "KLUB Z CZOŁÓWKI",
    sezonyRozegrane: 2,
    pktA: 255,
    trofea: 3,
    sezonyLM: 1,
    sezonyLE: 0,
    sezonyLK: 0,
    handoverSeason: 5,
    spadkiKadencja: 0,
    pierwszySpadekSezon: 0,
    ...overrides,
  });
