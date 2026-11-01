import { BOARD_REINVESTMENT_RATE } from "../src/data/balance";
import { clubIdForShortName } from "../src/data/clubs";
import { parseCsvLine } from "./csv";
import { LEGACY_TOLERANCE, legacyUnit, type LegacyUnit } from "./finance-activation-report-core";
import { median } from "./stats";
import { at } from "../src/logic/invariant";

/**
 * The arithmetic of the opening-budget activation report, with no file
 * reading in it.
 *
 * Split from the CLI so the measurement can be checked on rows built by hand.
 * Nothing here re-simulates and nothing re-derives a balance from other
 * columns: a recomputation would agree with the engine by construction and
 * would therefore check nothing.
 *
 * Deliberately NOT an extension of `finance-activation-report-core.ts`. That
 * tool and its 2026-09-10 note are a dated artefact that must keep reading
 * its pinned schema-3 files; this one requires schema 4 and asks different
 * questions. Sharing a parser would have made one of the two lie.
 */

export const REPORT_SCHEMA_VERSION = 1;

/**
 * The schemas this report accepts, oldest first. Schema-3 compatibility
 * belongs to the older tool, which still owns its own pinned artefacts.
 *
 * A LITERAL ARRAY, not derived from `DUMP_SCHEMA_VERSION`. This is a dated
 * audit with committed artefacts: tracking the live constant would let the
 * next bump silently redefine what it accepts, and the `summary.json` it
 * validated would stop being reproducible without anyone noticing. Same
 * reasoning and pattern as `ACCEPTED_DUMP_SCHEMA_VERSIONS` in
 * `balance-metrics.ts`, which pins its own set for exactly this reason.
 *
 * 4 is the audit's own committed artefacts (2026-09-12 activation dumps),
 * never regenerated. 5 was added 2026-09-24 for the spec 4 control
 * measurement, which needs this audit to read a fresh `pnpm balance` run:
 * the clubId migration of the career dump dropped `poziom` for `clubId` as its join
 * column, but every column this report reads kept its meaning across that
 * change. A dump may not mix the two: every row of one parsed dump must carry
 * the same schema. The pinned-schema test below fails if the live schema ever
 * moves past this set, so a further divergence is reported rather than
 * absorbed.
 */
export const ACCEPTED_DUMP_SCHEMAS: readonly number[] = [4, 5];

/**
 * The schema the audit's own committed artefacts (2026-09-12 activation
 * dumps and RNG snapshot) are written at. Used only by fixtures and the
 * snapshot builder to pin a concrete row shape - never for validation, which
 * reads `ACCEPTED_DUMP_SCHEMAS` instead.
 */
export const PINNED_DUMP_SCHEMA = 4;

/** The four clubs the manifest documents a backer for, whether or not the
 * floor actually binds for them. Reported by name because "present but not
 * binding" is a fact the report has to state rather than round away. */
export const BACKED_CLUBS = ["Widzew", "Wieczysta", "Korona", "Motor"] as const;

/** The five clubs that replay a real 2026/27 berth in season one. The
 * reinvestment rate changes their budget more than anyone else's, because
 * European prize money is part of the operating balance it takes a share of. */
export const EUROPEAN_STARTER_CLUBS = ["Lech", "Górnik", "Jagiellonia", "Raków", "GKS"] as const;

/** The verdict branch that returns before touching the generator. Its class
 * is what lets a changed draw tally be attributed rather than merely seen. */
export const NO_DRAW_VERDICT = "ROZWIĄZANIE KONTRAKTU";

const finite = (raw: string, field: string, index: number, kind: string): number => {
  const value = Number(raw);
  if (raw === "" || !Number.isFinite(value)) {
    throw new Error(`${kind} row ${index}: ${field} is not a finite number ("${raw}")`);
  }
  return value;
};

// --------------------------------------------------------------------------
// Season dump
// --------------------------------------------------------------------------

export type SeasonRow = {
  readonly dumpSchemaVersion: number;
  readonly engineVersion: string;
  readonly incomeMode: string;
  readonly clubShortName: string;
  readonly policyName: string;
  readonly seed: number;
  readonly season: number;
  readonly initialBudget: number;
  readonly preseasonForecastBalanceWithoutTransfersAndCups: number;
  readonly actualBalanceWithoutTransfersAndCups: number;
  readonly scaledRecurringRevenue: number;
  readonly leaguePositionPrize: number;
  readonly totalPayroll: number;
  readonly fixedCosts: number;
  readonly cashAtHandover: number | null;
  readonly creditedCupIncome: number;
  readonly rngDrawCount: number;
};

const SEASON_COLUMNS = [
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
] as const;

export type DumpExpectation = {
  readonly incomeMode: string;
  /** Canonical club ids (`legia-warszawa`), never the dump's display name.
   * `assertMatrix` resolves each row's `clubShortName` to an id with
   * `clubIdForShortName` before checking membership, since a dump's own
   * column is a presentation-only short name from schema 5 on. */
  readonly clubs: readonly string[];
  readonly policies: readonly string[];
  readonly runsPerCell: number;
};

/**
 * Reads a season dump and refuses every shape that would make an aggregate
 * lie: a wrong schema, a mixed economy, a career counted twice, a club
 * missing from the matrix.
 */
export const parseSeasonDump = (csv: string, expected: DumpExpectation): SeasonRow[] => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) throw new Error("season dump is empty: no header row");
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  for (const column of SEASON_COLUMNS) {
    if (!header.includes(column)) throw new Error(`season dump is missing the "${column}" column`);
  }
  const rows: SeasonRow[] = [];
  const seen = new Set<string>();
  const schemasSeen = new Set<number>();
  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(at(lines, i, "CSV line"));
    const cell = (column: string): string => fields[header.indexOf(column)] ?? "";
    const schema = finite(cell("dumpSchemaVersion"), "dumpSchemaVersion", i, "season");
    if (!ACCEPTED_DUMP_SCHEMAS.includes(schema)) {
      throw new Error(
        `season row ${i}: dump schema ${schema} is not one of ${ACCEPTED_DUMP_SCHEMAS.join(", ")}`
      );
    }
    schemasSeen.add(schema);
    if (cell("incomeMode") !== expected.incomeMode) {
      throw new Error(
        `season row ${i}: incomeMode "${cell("incomeMode")}" is not "${expected.incomeMode}"`
      );
    }
    const row: SeasonRow = {
      dumpSchemaVersion: schema,
      engineVersion: cell("engineVersion"),
      incomeMode: cell("incomeMode"),
      clubShortName: cell("clubShortName"),
      policyName: cell("policyName"),
      seed: finite(cell("seed"), "seed", i, "season"),
      season: finite(cell("season"), "season", i, "season"),
      initialBudget: finite(cell("initialBudget"), "initialBudget", i, "season"),
      preseasonForecastBalanceWithoutTransfersAndCups: finite(
        cell("preseasonForecastBalanceWithoutTransfersAndCups"),
        "preseasonForecastBalanceWithoutTransfersAndCups",
        i,
        "season"
      ),
      actualBalanceWithoutTransfersAndCups: finite(
        cell("actualBalanceWithoutTransfersAndCups"),
        "actualBalanceWithoutTransfersAndCups",
        i,
        "season"
      ),
      scaledRecurringRevenue: finite(
        cell("scaledRecurringRevenue"),
        "scaledRecurringRevenue",
        i,
        "season"
      ),
      leaguePositionPrize: finite(cell("leaguePositionPrize"), "leaguePositionPrize", i, "season"),
      totalPayroll: finite(cell("totalPayroll"), "totalPayroll", i, "season"),
      fixedCosts: finite(cell("fixedCosts"), "fixedCosts", i, "season"),
      cashAtHandover:
        cell("cashAtHandover") === ""
          ? null
          : finite(cell("cashAtHandover"), "cashAtHandover", i, "season"),
      creditedCupIncome: finite(cell("creditedCupIncome"), "creditedCupIncome", i, "season"),
      rngDrawCount: finite(cell("rngDrawCount"), "rngDrawCount", i, "season"),
    };
    if (row.clubShortName === "" || row.policyName === "") {
      throw new Error(`season row ${i}: missing club or policy`);
    }
    const key = `${row.clubShortName}\0${row.policyName}\0${row.seed}\0${row.season}`;
    if (seen.has(key)) {
      throw new Error(
        `season row ${i}: duplicate season (${row.clubShortName}, ${row.policyName}, seed ${row.seed}, season ${row.season})`
      );
    }
    seen.add(key);
    rows.push(row);
  }
  if (rows.length === 0) throw new Error("season dump has no rows");
  if (schemasSeen.size > 1) {
    throw new Error(
      `season dump mixes dump schemas: ${[...schemasSeen].sort((a, b) => a - b).join(", ")}`
    );
  }
  assertMatrix(
    rows.map((row) => ({
      club: clubIdForShortName(row.clubShortName),
      policy: row.policyName,
      seed: row.seed,
    })),
    expected,
    "season dump"
  );
  const versions = [...new Set(rows.map((row) => row.engineVersion))];
  if (versions.length > 1) {
    throw new Error(`season dump mixes engine versions: ${versions.join(", ")}`);
  }
  return rows;
};

// --------------------------------------------------------------------------
// Career dump
// --------------------------------------------------------------------------

export type CareerRow = {
  readonly clubShortName: string;
  readonly policyName: string;
  readonly seed: number;
  readonly incomeMode: string;
  readonly kasa: number;
  readonly wartoscKadryMoj: number;
  readonly werdykt: string;
  readonly verdictDraws: 0 | 1;
  readonly rngDrawCount: number;
  readonly sezonyRozegrane: number;
  readonly pktA: number;
  readonly trofea: number;
  readonly sezonyLM: number;
  readonly sezonyLE: number;
  readonly sezonyLK: number;
  readonly handoverSeason: number;
  readonly spadkiKadencja: number;
  readonly pierwszySpadekSezon: number;
};

const CAREER_COLUMNS = [
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
] as const;

export const parseCareerDump = (csv: string, expected: DumpExpectation): CareerRow[] => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) throw new Error("career dump is empty: no header row");
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  for (const column of CAREER_COLUMNS) {
    if (!header.includes(column)) throw new Error(`career dump is missing the "${column}" column`);
  }
  const rows: CareerRow[] = [];
  const seen = new Set<string>();
  const schemasSeen = new Set<number>();
  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(at(lines, i, "CSV line"));
    const cell = (column: string): string => fields[header.indexOf(column)] ?? "";
    const schema = finite(cell("dumpSchemaVersion"), "dumpSchemaVersion", i, "career");
    if (!ACCEPTED_DUMP_SCHEMAS.includes(schema)) {
      throw new Error(
        `career row ${i}: dump schema ${schema} is not one of ${ACCEPTED_DUMP_SCHEMAS.join(", ")}`
      );
    }
    schemasSeen.add(schema);
    if (cell("incomeMode") !== expected.incomeMode) {
      throw new Error(
        `career row ${i}: incomeMode "${cell("incomeMode")}" is not "${expected.incomeMode}"`
      );
    }
    const werdykt = cell("werdykt");
    if (werdykt === "") throw new Error(`career row ${i}: missing verdict`);
    const row: CareerRow = {
      clubShortName: cell("clubShortName"),
      policyName: cell("polityka"),
      seed: finite(cell("seed"), "seed", i, "career"),
      incomeMode: cell("incomeMode"),
      kasa: finite(cell("kasa"), "kasa", i, "career"),
      wartoscKadryMoj: finite(cell("wartoscKadryMoj"), "wartoscKadryMoj", i, "career"),
      werdykt,
      verdictDraws: werdykt === NO_DRAW_VERDICT ? 0 : 1,
      rngDrawCount: finite(cell("rngDrawCount"), "rngDrawCount", i, "career"),
      sezonyRozegrane: finite(cell("sezonyRozegrane"), "sezonyRozegrane", i, "career"),
      pktA: finite(cell("pktA"), "pktA", i, "career"),
      trofea: finite(cell("trofea"), "trofea", i, "career"),
      sezonyLM: finite(cell("sezonyLM"), "sezonyLM", i, "career"),
      sezonyLE: finite(cell("sezonyLE"), "sezonyLE", i, "career"),
      sezonyLK: finite(cell("sezonyLK"), "sezonyLK", i, "career"),
      handoverSeason: finite(cell("handoverSeason"), "handoverSeason", i, "career"),
      spadkiKadencja: finite(cell("spadkiKadencja"), "spadkiKadencja", i, "career"),
      pierwszySpadekSezon: finite(cell("pierwszySpadekSezon"), "pierwszySpadekSezon", i, "career"),
    };
    if (row.clubShortName === "" || row.policyName === "") {
      throw new Error(`career row ${i}: missing club or policy`);
    }
    const key = `${row.clubShortName}\0${row.policyName}\0${row.seed}`;
    if (seen.has(key)) {
      throw new Error(
        `career row ${i}: duplicate career (${row.clubShortName}, ${row.policyName}, seed ${row.seed})`
      );
    }
    seen.add(key);
    rows.push(row);
  }
  if (rows.length === 0) throw new Error("career dump has no rows");
  if (schemasSeen.size > 1) {
    throw new Error(
      `career dump mixes dump schemas: ${[...schemasSeen].sort((a, b) => a - b).join(", ")}`
    );
  }
  assertMatrix(
    rows.map((row) => ({
      club: clubIdForShortName(row.clubShortName),
      policy: row.policyName,
      seed: row.seed,
    })),
    expected,
    "career dump"
  );
  return rows;
};

/**
 * Every expected cell is present, with the expected number of distinct seeds
 * and nothing else in it.
 *
 * A dump that silently lost a club would still produce a plausible median -
 * which is exactly why the shape is checked before any number is taken from
 * it.
 */
const assertMatrix = (
  keys: readonly { club: string; policy: string; seed: number }[],
  expected: DumpExpectation,
  what: string
): void => {
  const cells = new Map<string, Set<number>>();
  for (const key of keys) {
    if (!expected.clubs.includes(key.club)) {
      throw new Error(`${what}: club "${key.club}" is not in the expected club list`);
    }
    if (!expected.policies.includes(key.policy)) {
      throw new Error(`${what}: policy "${key.policy}" is not in the expected policy list`);
    }
    const cell = `${key.club}\0${key.policy}`;
    const seeds = cells.get(cell) ?? new Set<number>();
    seeds.add(key.seed);
    cells.set(cell, seeds);
  }
  for (const club of expected.clubs) {
    for (const policy of expected.policies) {
      const seeds = cells.get(`${club}\0${policy}`);
      if (seeds === undefined) throw new Error(`${what}: no rows for ${club} / ${policy}`);
      if (seeds.size !== expected.runsPerCell) {
        throw new Error(
          `${what}: ${club} / ${policy} has ${seeds.size} seeds, expected ${expected.runsPerCell}`
        );
      }
    }
  }
};

// --------------------------------------------------------------------------
// Aggregates
// --------------------------------------------------------------------------

export const pooledMedian = (values: readonly number[]): number => median(values);

/**
 * The median of the clubs' medians - every club weighted equally, whatever
 * its number of careers. The spec's chapter 12.2 asks the money-scale
 * question this way, and it is NOT the pooled median.
 */
export const medianOfClubMedians = <T>(
  rows: readonly T[],
  club: (_row: T) => string,
  pick: (_row: T) => number
): number => {
  const byClub = new Map<string, number[]>();
  for (const row of rows) {
    const list = byClub.get(club(row));
    if (list) list.push(pick(row));
    else byClub.set(club(row), [pick(row)]);
  }
  if (byClub.size === 0) throw new Error("no clubs to take a median of");
  return median([...byClub.values()].map((values) => median(values)));
};

export type ClubMedian = { readonly clubShortName: string; readonly value: number };

export const perClubMedians = <T>(
  rows: readonly T[],
  club: (_row: T) => string,
  pick: (_row: T) => number
): ClubMedian[] => {
  const byClub = new Map<string, number[]>();
  for (const row of rows) {
    const list = byClub.get(club(row));
    if (list) list.push(pick(row));
    else byClub.set(club(row), [pick(row)]);
  }
  return [...byClub.entries()]
    .map(([clubShortName, values]) => ({ clubShortName, value: median(values) }))
    .sort((a, b) => a.clubShortName.localeCompare(b.clubShortName, "pl"));
};

export type CareerKeyed<T> = { readonly key: string; readonly value: T };

/**
 * The cash each career was holding at handover, taken from the season the
 * engine actually wrote it on.
 *
 * A tenure cut short by relegation ends before S5 and writes its handover on
 * its own last season. Nothing is imputed for the seasons that never
 * happened: a missing figure is an error, not a zero.
 */
export const cashAtHandoverPerCareer = (
  rows: readonly SeasonRow[]
): { readonly key: string; readonly clubShortName: string; readonly cash: number }[] => {
  const byCareer = new Map<string, { club: string; cash: number | null; lastSeason: number }>();
  for (const row of rows) {
    const key = `${row.clubShortName}\0${row.policyName}\0${row.seed}`;
    const entry = byCareer.get(key) ?? { club: row.clubShortName, cash: null, lastSeason: 0 };
    if (row.cashAtHandover !== null) {
      if (entry.cash !== null) {
        throw new Error(`career ${key} records handover cash on more than one season`);
      }
      entry.cash = row.cashAtHandover;
    }
    entry.lastSeason = Math.max(entry.lastSeason, row.season);
    byCareer.set(key, entry);
  }
  return [...byCareer.entries()].map(([key, entry]) => {
    if (entry.cash === null) throw new Error(`career ${key} has no handover cash`);
    return { key, clubShortName: entry.club, cash: entry.cash };
  });
};

// --------------------------------------------------------------------------
// Gates
// --------------------------------------------------------------------------

export type GateStatus = "passed" | "failed" | "notMeasured";

export type Gate = {
  readonly name: string;
  readonly status: GateStatus;
  readonly detail: string;
};

export const MONEY_SCALE_TOLERANCE = 0.25;
export const CASH_DRIFT_TOLERANCE = 0.5;
/** Re-exported with `legacyUnit`, which it belongs to: the tolerance and the
 * conversion it bounds have to move together or neither means anything. */
export { LEGACY_TOLERANCE };
/** How many clubs the absolute playability floor is expected to bind for
 * under the decided rule: delta 2 leaves five, against nine at delta 1. */
export const EXPECTED_FLOOR_CLUBS = 5;

export type MoneyScaleGate = {
  readonly balanceMedianOfClubMedians: number;
  readonly withinTolerance: boolean;
};

export const moneyScaleGate = (rows: readonly SeasonRow[]): MoneyScaleGate => {
  const balanceMedianOfClubMedians = medianOfClubMedians(
    rows,
    (row) => row.clubShortName,
    (row) => row.actualBalanceWithoutTransfersAndCups
  );
  return {
    balanceMedianOfClubMedians,
    withinTolerance: Math.abs(balanceMedianOfClubMedians) <= MONEY_SCALE_TOLERANCE,
  };
};

export type CashDriftRow = {
  readonly clubShortName: string;
  readonly careers: number;
  readonly medianResidual: number;
  readonly withinTolerance: boolean;
};

/**
 * `cashAtHandover - initialBudget - sum(preseasonProjected x rate)`, per
 * career, summarised per club.
 *
 * The rate is the point of this version. Before the activation the residual
 * was measured against the raw forecast, because all of it reached the
 * budget; now only a share does, and comparing against the raw balance would
 * report the reinvestment rate itself as drift.
 */
export const cashDrift = (
  rows: readonly SeasonRow[],
  reinvestmentRate: number = BOARD_REINVESTMENT_RATE
): CashDriftRow[] => {
  type Career = { budget: number; projectedShareSum: number; handover: number | null };
  const careers = new Map<string, Map<string, Career>>();
  for (const row of rows) {
    const perClub = careers.get(row.clubShortName) ?? new Map<string, Career>();
    careers.set(row.clubShortName, perClub);
    const key = `${row.policyName}\0${row.seed}`;
    const career = perClub.get(key) ?? {
      budget: row.initialBudget,
      projectedShareSum: 0,
      handover: null,
    };
    career.projectedShareSum +=
      row.preseasonForecastBalanceWithoutTransfersAndCups * reinvestmentRate;
    if (row.cashAtHandover !== null) career.handover = row.cashAtHandover;
    perClub.set(key, career);
  }
  return [...careers.entries()]
    .map(([clubShortName, perClub]) => {
      const residuals: number[] = [];
      for (const career of perClub.values()) {
        if (career.handover === null) {
          throw new Error(`${clubShortName}: a career has no handover cash`);
        }
        residuals.push(career.handover - career.budget - career.projectedShareSum);
      }
      const medianResidual = median(residuals);
      return {
        clubShortName,
        careers: residuals.length,
        medianResidual,
        withinTolerance: Math.abs(medianResidual) <= CASH_DRIFT_TOLERANCE,
      };
    })
    .sort((a, b) => a.clubShortName.localeCompare(b.clubShortName, "pl"));
};

export type PlayabilityRow = {
  readonly clubShortName: string;
  readonly budget: number;
  readonly firstYearCost: number;
  readonly affordable: boolean;
};

/**
 * The precision the game settles money at. `zaokr(..., 2)` rounds the opening
 * budget before it ever reaches `kasa`, so the dump's budget column carries
 * two decimals while the cost of an upgrade is a closed form with fifteen.
 */
const MONEY_DECIMALS = 2;
const atMoneyPrecision = (value: number): number =>
  Math.round(value * 10 ** MONEY_DECIMALS) / 10 ** MONEY_DECIMALS;

/**
 * Can each club buy one representative useful upgrade with its first year of
 * wages? A control invariant of the formula, not an axis of choice.
 *
 * BOTH sides are taken to the game's own two decimals. The formula guarantees
 * `budget >= cost` exactly; the reducer then rounds the budget to the
 * precision money is settled at, which can move it down by up to half a
 * grosz. Comparing a rounded budget against an unrounded cost would report
 * that rounding as an unaffordable club - twice, on the two clubs whose cost
 * happens to round down - and invite a fix to a number nobody measured.
 */
export const playability = (
  clubs: readonly {
    readonly clubShortName: string;
    readonly budget: number;
    readonly cost: number;
  }[]
): PlayabilityRow[] =>
  clubs
    .map((entry) => ({
      clubShortName: entry.clubShortName,
      budget: entry.budget,
      firstYearCost: entry.cost,
      affordable: atMoneyPrecision(entry.budget) >= atMoneyPrecision(entry.cost),
    }))
    .sort((a, b) => a.budget - b.budget);

/**
 * The unit-conversion helper, imported from the 2026-09-10 tool rather than
 * copied.
 *
 * A legacy multiplier is a unit conversion, not a calibration: the historical
 * PRODUCT is preserved and the multiplier is whatever divides into the new
 * median to reproduce it. That arithmetic is the same question asked twice,
 * so it lives in one place - unlike the PARSERS, which are deliberately not
 * shared because the two tools read different dump schemas.
 */
export { legacyUnit, type LegacyUnit };

/** The candidate multiplier a measured median implies, at full precision. */
export const legacyMultiplierCandidate = (historicalProduct: number, newMedian: number): number => {
  if (!Number.isFinite(newMedian) || newMedian <= 0) {
    throw new Error(`median ${newMedian} has no sensible unit conversion`);
  }
  return historicalProduct / newMedian;
};

// --------------------------------------------------------------------------
// RNG attribution
// --------------------------------------------------------------------------

export type SnapshotCareer = {
  readonly sezonyRozegrane: number;
  readonly pktA: number;
  readonly trofea: number;
  readonly sezonyLM: number;
  readonly sezonyLE: number;
  readonly sezonyLK: number;
  readonly handoverSeason: number;
  readonly spadkiKadencja: number;
  readonly pierwszySpadekSezon: number;
  readonly werdykt: string;
  readonly verdictDraws: 0 | 1;
  readonly rngDrawCount: number;
  readonly seasons: readonly {
    readonly season: number;
    readonly actualBalanceWithoutTransfersAndCups: number;
    readonly creditedCupIncome: number;
    readonly rngDrawCount: number;
  }[];
};

export type RngAttribution = {
  readonly pairs: number;
  readonly missingBefore: number;
  readonly missingAfter: number;
  /** Careers whose pre-verdict career fields are all unchanged. Nothing in
   * this activation may move them: the budget changes what a career can buy,
   * and the control run buys nothing.
   *
   * `trofea` is deliberately NOT one of them. The raw dump's trophy component
   * counts the EPILOGUE's cups and titles alongside the tenure's, so it sits
   * downstream of the verdict rather than before it - see `changedTrofea`. */
  readonly identicalPrelude: number;
  /**
   * Every list below is CAPPED at twenty samples and paired with its own
   * count, for the same reason `unexplainedDrawCount` is: a report that
   * printed eighteen thousand keys would be unreadable, and one that reported
   * `array.length` as the count would understate the very failure it exists
   * to catch - "20 of a possible 90 000" reads like a rounding error.
   */
  readonly changedPreludeCount: number;
  readonly changedPrelude: readonly string[];
  /**
   * Careers whose post-epilogue trophy component moved, and how many of those
   * did NOT also change verdict draw class.
   *
   * The first number is reported; the second is gated. A changed class shifts
   * the whole epilogue stream, so a different epilogue trophy haul is the
   * expected consequence - but one moving WITHOUT it would mean the
   * activation reordered a career the control run never bought into.
   */
  readonly changedTrofea: number;
  readonly unexplainedTrofeaCount: number;
  readonly unexplainedTrofea: readonly string[];
  /** Careers whose full verdict TITLE moved. Reported, never gated: the
   * verdict reads cash, so a changed unit is expected to move some of them. */
  readonly changedVerdictTitle: number;
  /** Of those, how many crossed the boundary between the drawing and the
   * non-drawing branch. */
  readonly changedVerdictClass: number;
  readonly identicalDraws: number;
  readonly explainedByVerdictClass: number;
  readonly unexplainedDrawCount: number;
  readonly unexplainedDraws: readonly {
    readonly key: string;
    readonly before: number;
    readonly after: number;
  }[];
  /** Season-level disagreements, each of which would be invisible in a career
   * total: a season the snapshot has and the run does not, a different number
   * of seasons, a changed balance or cup receipt under an unchanged tally. */
  readonly seasonCountMismatchCount: number;
  readonly seasonCountMismatch: readonly string[];
  readonly seasonBalanceMismatchCount: number;
  readonly seasonBalanceMismatch: readonly string[];
  readonly seasonDrawMismatchCount: number;
  readonly seasonDrawMismatch: readonly string[];
  readonly allAttributed: boolean;
};

/**
 * Pairs the activated control run against the preactivation snapshot by
 * (club, seed) and attributes every difference to a named cause.
 *
 * The honest claim is "every difference is attributable", not "there are no
 * differences": the verdict is scored partly on cash, and the lowest of its
 * four branches is the only one that returns without drawing, so a career
 * whose cash moved across that boundary legitimately consumes one draw more
 * or fewer - which then shifts the whole epilogue after it.
 *
 * Everything BEFORE the verdict has to be identical, and the season arrays
 * have to agree season by season. That pair of claims is what says the
 * activation changed the value of money rather than the course of the game.
 */
export const attributeRng = (
  before: (_club: string, _seed: number) => SnapshotCareer | undefined,
  beforeCount: number,
  after: readonly CareerRow[],
  afterSeasons: ReadonlyMap<string, readonly SeasonRow[]>
): RngAttribution => {
  let missingBefore = 0;
  let identicalPrelude = 0;
  let changedTrofea = 0;
  let changedVerdictTitle = 0;
  let changedVerdictClass = 0;
  let identicalDraws = 0;
  let explainedByVerdictClass = 0;
  let unexplainedCount = 0;
  let changedPreludeCount = 0;
  let unexplainedTrofeaCount = 0;
  let seasonCountMismatchCount = 0;
  let seasonBalanceMismatchCount = 0;
  let seasonDrawMismatchCount = 0;
  const changedPrelude: string[] = [];
  const unexplainedTrofea: string[] = [];
  const unexplainedDraws: { key: string; before: number; after: number }[] = [];
  const seasonCountMismatch: string[] = [];
  const seasonBalanceMismatch: string[] = [];
  const seasonDrawMismatch: string[] = [];

  for (const row of after) {
    const key = `${row.clubShortName}/${row.seed}`;
    const previous = before(row.clubShortName, row.seed);
    if (previous === undefined) {
      missingBefore += 1;
      continue;
    }
    const preludeSame =
      previous.sezonyRozegrane === row.sezonyRozegrane &&
      previous.pktA === row.pktA &&
      previous.sezonyLM === row.sezonyLM &&
      previous.sezonyLE === row.sezonyLE &&
      previous.sezonyLK === row.sezonyLK &&
      previous.handoverSeason === row.handoverSeason &&
      previous.spadkiKadencja === row.spadkiKadencja &&
      previous.pierwszySpadekSezon === row.pierwszySpadekSezon;
    if (preludeSame) identicalPrelude += 1;
    else {
      changedPreludeCount += 1;
      if (changedPrelude.length < 20) changedPrelude.push(key);
    }

    if (previous.trofea !== row.trofea) {
      changedTrofea += 1;
      if (previous.verdictDraws === row.verdictDraws) {
        unexplainedTrofeaCount += 1;
        if (unexplainedTrofea.length < 20) unexplainedTrofea.push(key);
      }
    }

    if (previous.werdykt !== row.werdykt) {
      changedVerdictTitle += 1;
      if (previous.verdictDraws !== row.verdictDraws) changedVerdictClass += 1;
    }

    if (previous.rngDrawCount === row.rngDrawCount) identicalDraws += 1;
    else if (previous.verdictDraws !== row.verdictDraws) explainedByVerdictClass += 1;
    else {
      unexplainedCount += 1;
      // Listed up to twenty; counted all of them. A report that printed
      // eighteen thousand rows would be unreadable, and one that counted
      // twenty would understate the failure it exists to catch.
      if (unexplainedDraws.length < 20) {
        unexplainedDraws.push({ key, before: previous.rngDrawCount, after: row.rngDrawCount });
      }
    }

    const seasons = afterSeasons.get(`${row.clubShortName}\0${row.policyName}\0${row.seed}`) ?? [];
    if (seasons.length !== previous.seasons.length) {
      seasonCountMismatchCount += 1;
      if (seasonCountMismatch.length < 20) seasonCountMismatch.push(key);
      continue;
    }
    const sorted = [...seasons].sort((a, b) => a.season - b.season);
    const previousSorted = [...previous.seasons].sort((a, b) => a.season - b.season);
    for (const [i, now] of sorted.entries()) {
      const then = at(previousSorted, i, "previous season");
      if (now.season !== then.season) {
        seasonCountMismatchCount += 1;
        if (seasonCountMismatch.length < 20) seasonCountMismatch.push(`${key}@${now.season}`);
        continue;
      }
      if (
        now.actualBalanceWithoutTransfersAndCups !== then.actualBalanceWithoutTransfersAndCups ||
        now.creditedCupIncome !== then.creditedCupIncome
      ) {
        seasonBalanceMismatchCount += 1;
        if (seasonBalanceMismatch.length < 20) seasonBalanceMismatch.push(`${key}@${now.season}`);
      }
      if (now.rngDrawCount !== then.rngDrawCount) {
        seasonDrawMismatchCount += 1;
        if (seasonDrawMismatch.length < 20) seasonDrawMismatch.push(`${key}@${now.season}`);
      }
    }
  }

  return {
    pairs: after.length,
    missingBefore,
    // Signed on purpose. A clamp to zero would make this unable to express
    // one direction of disagreement: a run carrying MORE careers than the
    // snapshot would report zero missing, which is the shape of an answer
    // rather than an answer.
    missingAfter: beforeCount - (after.length - missingBefore),
    identicalPrelude,
    changedPreludeCount,
    changedPrelude,
    changedTrofea,
    unexplainedTrofeaCount,
    unexplainedTrofea,
    changedVerdictTitle,
    changedVerdictClass,
    identicalDraws,
    explainedByVerdictClass,
    unexplainedDrawCount: unexplainedCount,
    unexplainedDraws,
    seasonCountMismatchCount,
    seasonCountMismatch,
    seasonBalanceMismatchCount,
    seasonBalanceMismatch,
    seasonDrawMismatchCount,
    seasonDrawMismatch,
    allAttributed:
      after.length > 0 &&
      missingBefore === 0 &&
      changedPreludeCount === 0 &&
      unexplainedTrofeaCount === 0 &&
      unexplainedCount === 0 &&
      seasonCountMismatchCount === 0 &&
      seasonBalanceMismatchCount === 0 &&
      seasonDrawMismatchCount === 0,
  };
};
