import { readFileSync } from "node:fs";

import { CLUBS, clubIdForShortName } from "../src/data/clubs";
import { DILEMMA_COLUMNS, DILEMMA_SCHEMA_VERSION } from "./dilemma-observations";
import { POLICIES } from "./balance-cli";
import { parseCsvLine } from "./csv";
import type { DilemmaRow, RawSeedRow } from "./spec4-control-dilemmas-core";
import type { ControlSeasonRow, RawTitleRow, SigningRow } from "./spec4-control-finance-core";
import { at, recordAt } from "../src/logic/invariant";

/**
 * All I/O for the spec 4 control report that is not rendering: reading the
 * four dumps by header name and validating them against each other, before
 * any of the seven sections are computed.
 *
 * Split from spec4-control-report.ts (the CLI) so that file can stay under
 * the plan's per-file line budget with the CLI, markdown and JSON rendering
 * alone. The per-row mapping functions (`toRawRow`, `toDilemmaRow`,
 * `toSigningRow`, `toSeasonRow`) are exported and pure - each takes a plain
 * `Row` object, not a file path - so a malformed value can be checked
 * without writing a CSV fixture to disk.
 */

export const NORMAL_INCOME_MODE = "normal";
export const CONTROL_INCOME_MODE = "finance-control";
export const CONTROL_POLICY = "alwaysPass";
export const DEFAULT_RUNS_PER_CELL = 1000;
export const ALL_CLUB_IDS: readonly string[] = CLUBS.map((club) => club.clubId).sort();
export const ALL_POLICY_NAMES: readonly string[] = Object.keys(POLICIES).sort();

// --------------------------------------------------------------------------
// CSV reading: by header name only, never positional.
// --------------------------------------------------------------------------

export type Row = Record<string, string>;

export const readCsv = (path: string, required: readonly string[]): Row[] => {
  const lines = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) throw new Error(`${path}: empty file, no header row`);
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  for (const column of required) {
    if (!header.includes(column)) throw new Error(`${path} is missing the "${column}" column`);
  }
  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    const row: Row = {};
    header.forEach((column, index) => {
      row[column] = fields[index] ?? "";
    });
    return row;
  });
};

/** A text column that `readCsv` guarantees is present. */
const text = (row: Row, column: string): string => recordAt(row, column, "dump column");

export const num = (row: Row, column: string): number => {
  const raw = row[column];
  const value = Number(raw);
  if (raw === "" || raw === undefined || !Number.isFinite(value)) {
    throw new Error(`"${column}" is not a finite number ("${raw}")`);
  }
  return value;
};

// --------------------------------------------------------------------------
// Per-dump row mapping
// --------------------------------------------------------------------------

export type RawRow = RawSeedRow & RawTitleRow & { policyName: string; incomeMode: string };

export const RAW_COLUMNS = [
  "clubId",
  "polityka",
  "seed",
  "dziedzictwo",
  "kasa",
  "tytul",
  "incomeMode",
];

export const toRawRow = (row: Row): RawRow => ({
  clubId: text(row, "clubId"),
  polityka: text(row, "polityka"),
  policyName: text(row, "polityka"),
  seed: num(row, "seed"),
  dziedzictwo: num(row, "dziedzictwo"),
  kasa: num(row, "kasa"),
  tytul: text(row, "tytul"),
  incomeMode: text(row, "incomeMode"),
});

export const parseRawDump = (path: string): RawRow[] => readCsv(path, RAW_COLUMNS).map(toRawRow);

/** Fields of a dilemma row that are not plain numbers - every other column
 * of DILEMMA_COLUMNS is numeric, so this is the only exception list needed
 * to read the dump generically without retyping every column name. */
const DILEMMA_TEXT_FIELDS = new Set(["engineVersion", "incomeMode", "clubId", "policyName"]);

export const toDilemmaRow = (row: Row): DilemmaRow => {
  const parsed: Record<string, string | number> = {};
  for (const column of DILEMMA_COLUMNS) {
    parsed[column] = DILEMMA_TEXT_FIELDS.has(column) ? text(row, column) : num(row, column);
  }
  return parsed as unknown as DilemmaRow;
};

export const parseDilemmaDump = (path: string): DilemmaRow[] =>
  readCsv(path, DILEMMA_COLUMNS).map(toDilemmaRow);

export const SIGNING_COLUMNS = [
  "clubShortName",
  "policyName",
  "seed",
  "offerType",
  "annualWage",
  "seasonsOnPayroll",
  "wageCostToHandover",
];

export type ParsedSigning = SigningRow & { seed: number };

export const toSigningRow = (row: Row): ParsedSigning => {
  const offerType = text(row, "offerType");
  if (offerType !== "KUPNO" && offerType !== "PANIC" && offerType !== "WOLNY") {
    throw new Error(`signings dump: unknown offerType "${offerType}"`);
  }
  return {
    clubId: clubIdForShortName(text(row, "clubShortName")),
    policyName: text(row, "policyName"),
    seed: num(row, "seed"),
    offerType,
    annualWage: num(row, "annualWage"),
    seasonsOnPayroll: num(row, "seasonsOnPayroll"),
    wageCostToHandover: num(row, "wageCostToHandover"),
  };
};

export const parseSigningsDump = (path: string): ParsedSigning[] =>
  readCsv(path, SIGNING_COLUMNS).map(toSigningRow);

export const SEASON_COLUMNS = [
  "dumpSchemaVersion",
  "incomeMode",
  "clubShortName",
  "policyName",
  "seed",
  "season",
  "actualBalanceWithoutTransfersAndCups",
  "initialBudget",
  "cashAtHandover",
];

export type ParsedSeason = ControlSeasonRow & { incomeMode: string; season: number };

/**
 * `cashAtHandover` is the one column with a legitimate empty value (every
 * season but the handover leaves it blank), so it is the one column read
 * outside `num`'s "always required" contract - but a NON-EMPTY value still
 * goes through `num`, so a malformed one throws exactly like every other
 * numeric column instead of silently becoming `NaN`.
 */
export const toSeasonRow = (row: Row): ParsedSeason => ({
  clubId: clubIdForShortName(text(row, "clubShortName")),
  policyName: text(row, "policyName"),
  seed: num(row, "seed"),
  season: num(row, "season"),
  actualBalanceWithoutTransfersAndCups: num(row, "actualBalanceWithoutTransfersAndCups"),
  initialBudget: num(row, "initialBudget"),
  cashAtHandover: text(row, "cashAtHandover") === "" ? null : num(row, "cashAtHandover"),
  incomeMode: text(row, "incomeMode"),
});

export const parseSeasonsDump = (path: string): ParsedSeason[] =>
  readCsv(path, SEASON_COLUMNS).map(toSeasonRow);

// --------------------------------------------------------------------------
// Validation: schemas, income modes, uniqueness, completeness, orphans.
// --------------------------------------------------------------------------

export type MatrixExpectation = {
  clubs: readonly string[];
  policies: readonly string[];
  seeds: number;
};

export const careerKey = (clubId: string, policyName: string, seed: number): string =>
  `${clubId}\0${policyName}\0${seed}`;

const seasonKey = (row: {
  clubId: string;
  policyName: string;
  seed: number;
  season: number;
}): string => `${careerKey(row.clubId, row.policyName, row.seed)}\0${row.season}`;

/** A complete rectangle: every (club, policy) cell has exactly `seeds`
 * distinct seeds - not merely a row count, which a duplicated seed could
 * satisfy while quietly under-covering another. */
export const assertMatrix = (
  keys: readonly { club: string; policy: string; seed: number }[],
  expected: MatrixExpectation,
  what: string
): void => {
  const cells = new Map<string, Set<number>>();
  for (const key of keys) {
    const cellKey = `${key.club}\0${key.policy}`;
    const seeds = cells.get(cellKey) ?? new Set<number>();
    seeds.add(key.seed);
    cells.set(cellKey, seeds);
  }
  for (const club of expected.clubs) {
    for (const policy of expected.policies) {
      const seeds = cells.get(`${club}\0${policy}`);
      if (seeds === undefined) throw new Error(`${what}: no rows for ${club} / ${policy}`);
      if (seeds.size !== expected.seeds) {
        throw new Error(
          `${what}: ${club} / ${policy} has ${seeds.size} seeds, expected ${expected.seeds}`
        );
      }
    }
  }
};

export const assertNoDuplicates = (
  rows: readonly { clubId: string; policyName: string; seed: number }[],
  what: string
): void => {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = careerKey(row.clubId, row.policyName, row.seed);
    if (seen.has(key)) throw new Error(`${what}: duplicate career (${key})`);
    seen.add(key);
  }
};

/** Catches a season dump that recorded the same (club, policy, seed, season)
 * more than once - a duplicate that `assertMatrix`'s distinct-seed count
 * cannot see, since both rows share the same seed, and that would otherwise
 * silently inflate `rawResultVsBudget`'s summed raw result for that career. */
export const assertUniqueSeasonRows = (
  seasons: readonly { clubId: string; policyName: string; seed: number; season: number }[]
): void => {
  const seen = new Set<string>();
  for (const row of seasons) {
    const key = seasonKey(row);
    if (seen.has(key)) throw new Error(`control seasons dump: duplicate season row (${key})`);
    seen.add(key);
  }
};

/** Distinct values in UTF-16 code unit order, the order a bare sort() gives strings. */
export const distinctSorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

const rectangleExpectation = <T>(
  rows: readonly T[],
  club: (_row: T) => string,
  policy: (_row: T) => string,
  seed: (_row: T) => number,
  smoke: boolean,
  fullPolicies: readonly string[]
): MatrixExpectation =>
  smoke
    ? {
        clubs: distinctSorted(rows.map(club)),
        policies: distinctSorted(rows.map(policy)),
        seeds: new Set(rows.map(seed)).size,
      }
    : { clubs: ALL_CLUB_IDS, policies: fullPolicies, seeds: DEFAULT_RUNS_PER_CELL };

export const validateInputs = (
  raw: readonly RawRow[],
  dilemmas: readonly DilemmaRow[],
  signings: readonly ParsedSigning[],
  seasons: readonly ParsedSeason[],
  smoke: boolean
): void => {
  if (raw.length === 0) throw new Error("raw dump has no rows");
  if (dilemmas.length === 0) throw new Error("dilemma dump has no rows");
  if (seasons.length === 0) throw new Error("control seasons dump has no rows");

  for (const row of raw) {
    if (row.incomeMode !== NORMAL_INCOME_MODE) {
      throw new Error(`raw dump: incomeMode "${row.incomeMode}" is not "${NORMAL_INCOME_MODE}"`);
    }
  }
  for (const row of dilemmas) {
    if (row.dilemmaSchemaVersion !== DILEMMA_SCHEMA_VERSION) {
      throw new Error(
        `dilemma dump: schema ${row.dilemmaSchemaVersion} is not ${DILEMMA_SCHEMA_VERSION}`
      );
    }
    if (row.incomeMode !== NORMAL_INCOME_MODE) {
      throw new Error(
        `dilemma dump: incomeMode "${row.incomeMode}" is not "${NORMAL_INCOME_MODE}"`
      );
    }
  }
  for (const row of seasons) {
    if (row.incomeMode !== CONTROL_INCOME_MODE) {
      throw new Error(
        `control seasons dump: incomeMode "${row.incomeMode}" is not "${CONTROL_INCOME_MODE}"`
      );
    }
  }

  assertNoDuplicates(raw, "raw dump");
  assertNoDuplicates(dilemmas, "dilemma dump");
  assertUniqueSeasonRows(seasons);

  const rawKeyFields = raw.map((row) => ({
    club: row.clubId,
    policy: row.policyName,
    seed: row.seed,
  }));
  const dilemmaKeyFields = dilemmas.map((row) => ({
    club: row.clubId,
    policy: row.policyName,
    seed: row.seed,
  }));
  const rawExpectation = rectangleExpectation(
    raw,
    (row) => row.clubId,
    (row) => row.policyName,
    (row) => row.seed,
    smoke,
    ALL_POLICY_NAMES
  );
  assertMatrix(rawKeyFields, rawExpectation, "raw dump");
  assertMatrix(dilemmaKeyFields, rawExpectation, "dilemma dump");

  const rawKeys = new Set(raw.map((row) => careerKey(row.clubId, row.policyName, row.seed)));
  const dilemmaKeys = new Set(
    dilemmas.map((row) => careerKey(row.clubId, row.policyName, row.seed))
  );
  if (rawKeys.size !== dilemmaKeys.size || [...rawKeys].some((key) => !dilemmaKeys.has(key))) {
    throw new Error("raw dump and dilemma dump do not carry the same set of careers");
  }

  for (const signing of signings) {
    const key = careerKey(signing.clubId, signing.policyName, signing.seed);
    if (!rawKeys.has(key)) throw new Error(`signings dump has an orphan signing for career ${key}`);
  }

  const seasonExpectation = rectangleExpectation(
    seasons,
    (row) => row.clubId,
    (row) => row.policyName,
    (row) => row.seed,
    smoke,
    [CONTROL_POLICY]
  );
  assertMatrix(
    seasons.map((row) => ({ club: row.clubId, policy: row.policyName, seed: row.seed })),
    seasonExpectation,
    "control seasons dump"
  );

  const handoversByCareer = new Map<string, number>();
  for (const row of seasons) {
    if (row.cashAtHandover === null) continue;
    const key = careerKey(row.clubId, row.policyName, row.seed);
    handoversByCareer.set(key, (handoversByCareer.get(key) ?? 0) + 1);
  }
  for (const key of distinctSorted(
    seasons.map((row) => careerKey(row.clubId, row.policyName, row.seed))
  )) {
    const handovers = handoversByCareer.get(key) ?? 0;
    if (handovers !== 1) {
      throw new Error(
        `control seasons dump: career ${key} has ${handovers} handover seasons, expected exactly one (orphan)`
      );
    }
  }
};
