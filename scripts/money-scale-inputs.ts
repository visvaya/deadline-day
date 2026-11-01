import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { createGunzip } from "node:zlib";

import { AGE_PROFILES } from "../src/data/balance";
import { CLUBS, ratingForClubId } from "../src/data/clubs";
import { REPORTED_CLUB_FINANCES, reportedFinanceFor } from "../src/data/club-finance-sources";
import { financeProfileFor } from "../src/data/club-finance-profiles";
import type { MatchRating } from "../src/logic/match";
import type { PositionCode } from "../src/data/types";
import { parseCsvLine } from "./csv";
import { baseWage, KUPNO_MEDIAN_PRICE_DEVIATION, type WageParams } from "./money-scale-core";
import {
  bestFit,
  feasibleJointSets,
  FIT_TOOL_VERSION,
  marketValueAt,
  SEARCH_RANGE,
  type ValueCurveParams,
} from "./value-curve-core";
import { at, recordAt } from "../src/logic/invariant";

/**
 * Which clubs the wage fit may learn from, and what it is trying to hit.
 *
 * The population is a decision, not a filter written for convenience, so the
 * exclusions carry their reason and the report prints them. Two rules do the
 * work: a club whose finance record was CONSTRUCTED cannot teach the model
 * anything (its wage ratio is a design assumption, so fitting to it would
 * have the model learn from its own guess), and a club whose reported ratio
 * is not comparable to the rest of the cohort belongs in sensitivity rather
 * than in the main fit.
 */

/**
 * Share of a club's wage cost that goes to the first team's players and
 * coaching staff. Reported directly: the Grant Thornton Ekstraklasa report
 * gives the league-average split as 76.4% first team, 16.4% administration,
 * 7.1% reserves.
 */
export const FIRST_TEAM_WAGE_SHARE = 0.764;

/**
 * Share of that first-team wage bill taken by the players themselves, the
 * rest being the coaching staff. ESTIMATED - no report separates the two -
 * and therefore named apart from the figure above rather than folded into a
 * single "reported" constant.
 */
export const PLAYER_WAGE_SHARE_OF_FIRST_TEAM = 0.85;

export const targetPlayerPayrollPln = (
  totalRevenuePln: number,
  wageToRevenueRatio: number
): number => {
  if (!Number.isFinite(totalRevenuePln) || totalRevenuePln <= 0) {
    throw new Error(`totalRevenuePln must be finite and positive, got ${totalRevenuePln}`);
  }
  if (!Number.isFinite(wageToRevenueRatio) || wageToRevenueRatio <= 0) {
    throw new Error(`wageToRevenueRatio must be finite and positive, got ${wageToRevenueRatio}`);
  }
  return (
    totalRevenuePln * wageToRevenueRatio * FIRST_TEAM_WAGE_SHARE * PLAYER_WAGE_SHARE_OF_FIRST_TEAM
  );
};

export type WagePopulationMember = {
  readonly clubId: string;
  readonly shortName: string;
  readonly totalRevenuePln: number;
  readonly wageToRevenueRatio: number;
  readonly recurringRevenuePln: number;
  /** The fit's target, in PLN. Not a budget and not a balance. */
  readonly targetPayrollPln: number;
  readonly rating: MatchRating;
  readonly report: string;
};

export type PopulationEntry = {
  readonly member: WagePopulationMember;
  readonly reason: string;
};

export type ExcludedClub = {
  readonly clubId: string;
  readonly shortName: string;
  readonly reason: string;
};

export type WagePopulation = {
  /** Reported, playable and comparable. What the reference fit learns from. */
  readonly main: readonly WagePopulationMember[];
  /** Reported and playable, but held out of the main fit for a stated reason. */
  readonly sensitivity: readonly PopulationEntry[];
  readonly excluded: readonly ExcludedClub[];
};

/**
 * The three clubs the GT Ekstraklasa report's wage chart marks with an
 * asterisk.
 *
 * The asterisk belongs to the chart's 2023/24 COLUMN, not to 2024/25: Motor,
 * Lechia and GKS played that earlier season in the first division, so their
 * earlier ratio is the incomparable one. The 2024/25 figures the manifest
 * carries are ordinary Ekstraklasa figures.
 *
 * They are still held out of the reference fit by default. A club in its
 * first season back carries a squad and a wage bill assembled for a different
 * division, and the plan asks for the conservative population with the
 * finding reported rather than for the wider one on the strength of a legend
 * reading. Lechia never reaches this list: the game does not let a career
 * start there, so it is excluded one rule earlier.
 */
export const PROMOTED_COHORT_2023_24: readonly string[] = [
  "motor-lublin",
  "lechia-gdansk",
  "gks-katowice",
];

/** Reported clubs whose figures come from the first division's own report,
 * a different document with a different cohort and a different central
 * package. Comparable within themselves, not with the Ekstraklasa fifteen. */
const FIRST_DIVISION_REPORT = "gt-pierwsza-liga-2024-25";

const memberFor = (clubId: string, shortName: string): WagePopulationMember => {
  const reported = reportedFinanceFor(clubId);
  if (!reported) throw new Error(`No reported finance row for ${clubId}`);
  const profile = financeProfileFor(clubId);
  const rating = ratingForClubId(clubId);
  return {
    clubId,
    shortName,
    totalRevenuePln: reported.totalRevenuePln,
    wageToRevenueRatio: reported.wageToRevenueRatio,
    recurringRevenuePln: profile.recurringRevenuePln,
    targetPayrollPln: targetPlayerPayrollPln(reported.totalRevenuePln, reported.wageToRevenueRatio),
    rating: { attack: rating.attack, defence: rating.defence },
    report: reported.report,
  };
};

export const wagePopulation = (): WagePopulation => {
  const main: WagePopulationMember[] = [];
  const sensitivity: PopulationEntry[] = [];
  const excluded: ExcludedClub[] = [];

  for (const club of CLUBS) {
    const reported = reportedFinanceFor(club.clubId);
    if (!reported) {
      excluded.push({
        clubId: club.clubId,
        shortName: club.shortName,
        reason: "constructed finance record: its wage ratio is an assumption, not a measurement",
      });
      continue;
    }
    const member = memberFor(club.clubId, club.shortName);
    if (reported.report === FIRST_DIVISION_REPORT) {
      sensitivity.push({
        member,
        reason: "first-division report: a different cohort and central package",
      });
      continue;
    }
    if (PROMOTED_COHORT_2023_24.includes(club.clubId)) {
      sensitivity.push({
        member,
        reason:
          "promoted for 2024/25: wage bill assembled in the division below, held out by default",
      });
      continue;
    }
    main.push(member);
  }

  const playable = new Set(CLUBS.map((club) => club.clubId));
  for (const row of REPORTED_CLUB_FINANCES) {
    if (playable.has(row.clubId)) continue;
    excluded.push({
      clubId: row.clubId,
      shortName: row.clubId,
      reason: "reported but not playable: no career starts at this club",
    });
  }

  if (main.length === 0) throw new Error("empty main wage population");
  return { main, sensitivity, excluded };
};

/** Every member the report ever prints, in one list, for the aggregate
 * diagnostics that deliberately span the whole reported and playable set. */
export const allReportedPlayable = (population: WagePopulation): WagePopulationMember[] => [
  ...population.main,
  ...population.sensitivity.map((entry) => entry.member),
];
/**
 * Reading the pinned balance dumps.
 *
 * Two of the three baseline artefacts are gitignored in both forms, so a
 * fresh clone has neither the CSV nor its gzip. That is exactly why every
 * loader here fails loudly on a missing or mismatched file: a report that
 * quietly substituted a remembered number for a dump it could not open would
 * look like a measurement and be a recollection.
 */

/** The decompressed SHA256 of each artefact, from the pinned baseline note.
 * Hashing the decompressed bytes rather than the file means the CSV and its
 * gzip are the same measurement, which is what makes either acceptable. */
export const FINANCE_BASELINE_SHA256 = {
  control: "ee250dc96a44229eb5a8b032ceb64be0dba107c6571cd74a9badfdf987151efd",
  active: "69e7cc611394c4cb52467735ce8b17c117aec91dbfeff4f378f51ddd501085ec",
  signings: "6d7bc82be672039a3af5ee1d7d3c7f66612e0f4274acc0d82fe4099bded1ba05",
} as const;

export type DumpDigest = {
  readonly path: string;
  readonly sha256: string;
  readonly rowCount: number;
  readonly compressed: boolean;
};

/**
 * Streams a dump, row by row, hashing the decompressed bytes as it goes.
 *
 * Streaming rather than reading the file whole is not an optimisation: the
 * signings dump is 163 MB of CSV, and holding it as one JavaScript string
 * would take twice that in UTF-16 before a single row is parsed.
 */
export const streamDump = async (
  path: string,
  onRow: (_row: Record<string, string>, _index: number) => void
): Promise<DumpDigest> => {
  if (!existsSync(path)) {
    throw new Error(`Missing dump ${path}. Reproduce it as the baseline note describes.`);
  }
  const compressed = path.endsWith(".gz");
  const hash = createHash("sha256");
  const input = createReadStream(path);
  const stream = compressed ? input.pipe(createGunzip()) : input;

  let header: string[] | null = null;
  let pending = "";
  let rowCount = 0;

  const handleLine = (line: string): void => {
    if (line === "") return;
    const fields = parseCsvLine(line);
    if (header === null) {
      header = fields;
      return;
    }
    if (fields.length !== header.length) {
      throw new Error(
        `${path}: row ${rowCount + 1} has ${fields.length} fields, header has ${header.length}`
      );
    }
    const row: Record<string, string> = {};
    for (const [i, name] of header.entries()) row[name] = at(fields, i, "CSV field");
    onRow(row, rowCount);
    rowCount += 1;
  };

  // A StringDecoder, not chunk.toString(): sooner or later a chunk boundary
  // falls inside a multi-byte character, and decoding each chunk on its own
  // turns "ŚO" into replacement characters. The signings dump has one at row
  // 484355, so this is an observed failure rather than a defensive guess.
  const decoder = new StringDecoder("utf8");
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    hash.update(chunk);
    pending += decoder.write(chunk);
    let newline = pending.indexOf("\n");
    while (newline !== -1) {
      handleLine(pending.slice(0, newline).replace(/\r$/, ""));
      pending = pending.slice(newline + 1);
      newline = pending.indexOf("\n");
    }
  }
  pending += decoder.end();
  handleLine(pending.replace(/\r$/, ""));
  if (header === null) throw new Error(`${path}: no header row`);
  return { path, sha256: hash.digest("hex"), rowCount, compressed };
};

/** Fails before any expensive work starts. A tool that spent half a minute
 * fitting curves and only then discovered its dump was absent would make a
 * typo look like a slow run. */
export const assertDumpReadable = (path: string): void => {
  if (!existsSync(path)) {
    throw new Error(`Missing dump ${path}. Reproduce it as the baseline note describes.`);
  }
};

export const assertDigest = (digest: DumpDigest, expectedSha256: string): void => {
  if (digest.sha256 !== expectedSha256) {
    throw new Error(
      `${digest.path}: decompressed sha256 ${digest.sha256} does not match the pinned ` +
        `${expectedSha256}. This file is not that baseline and must not be compared to it.`
    );
  }
};

const SIGNINGS_HEADER = [
  "clubShortName",
  "policyName",
  "seed",
  "decisionIndex",
  "season",
  "offerType",
  "playerId",
  "position",
  "age",
  "ovr",
  "fee",
  "annualWage",
  "baseAnnualWage",
  "payrollDelta",
] as const;

export type SigningRow = {
  readonly clubShortName: string;
  readonly policyName: string;
  readonly season: number;
  readonly offerType: string;
  readonly position: PositionCode;
  readonly age: number;
  readonly ovr: number;
  readonly fee: number;
  readonly annualWage: number;
};

const POSITION_CODES = new Set(Object.keys(AGE_PROFILES));

const requireNumber = (row: Record<string, string>, key: string, index: number): number => {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`signings row ${index}: ${key} "${row[key]}" is not a finite number`);
  }
  return value;
};

/**
 * Every signing of the named offer types, validated on the way in and grouped
 * by type.
 *
 * Grouping in ONE pass rather than one call per type is not only speed: the
 * digest is computed while streaming, so a second pass would hash the same
 * 163 MB again to learn what it already knows. Filtering inside the stream
 * keeps the whole 1.36 million rows from existing at once.
 */
export const loadSigningsByType = async (
  path: string,
  offerTypes: readonly string[],
  expectedSha256?: string
): Promise<{ byType: Map<string, SigningRow[]>; digest: DumpDigest }> => {
  if (offerTypes.length === 0) throw new Error("no offer types requested");
  const wanted = new Set(offerTypes);
  const byType = new Map<string, SigningRow[]>(offerTypes.map((type) => [type, []]));
  let headerChecked = false;
  const digest = await streamDump(path, (row, index) => {
    if (!headerChecked) {
      for (const column of SIGNINGS_HEADER) {
        if (!(column in row)) throw new Error(`${path}: missing column "${column}"`);
      }
      headerChecked = true;
    }
    const offerType = recordAt(row, "offerType", "signings column");
    const position = recordAt(row, "position", "signings column");
    const clubShortName = recordAt(row, "clubShortName", "signings column");
    const policyName = recordAt(row, "policyName", "signings column");
    if (!wanted.has(offerType)) return;
    if (!POSITION_CODES.has(position)) {
      throw new Error(`signings row ${index}: unknown position "${position}"`);
    }
    const age = requireNumber(row, "age", index);
    const ovr = requireNumber(row, "ovr", index);
    const fee = requireNumber(row, "fee", index);
    const annualWage = requireNumber(row, "annualWage", index);
    const season = requireNumber(row, "season", index);
    if (age <= 0 || ovr <= 0 || annualWage <= 0 || fee < 0 || season <= 0) {
      throw new Error(`signings row ${index}: non-positive age, ovr, wage, season or negative fee`);
    }
    if (clubShortName === "" || policyName === "") {
      throw new Error(`signings row ${index}: missing club or policy`);
    }
    byType.get(offerType)?.push({
      clubShortName,
      policyName,
      season,
      offerType,
      position: position as PositionCode,
      age,
      ovr,
      fee,
      annualWage,
    });
  });
  for (const [type, rows] of byType) {
    if (rows.length === 0) throw new Error(`${path}: no ${type} rows`);
  }
  if (expectedSha256) assertDigest(digest, expectedSha256);
  return { byType, digest };
};

/** One offer type, for callers that want exactly one. */
export const loadSignings = async (
  path: string,
  offerType: string,
  expectedSha256?: string
): Promise<{ rows: SigningRow[]; digest: DumpDigest }> => {
  const { byType, digest } = await loadSigningsByType(path, [offerType], expectedSha256);
  return { rows: byType.get(offerType) ?? [], digest };
};

export type CohortBreakdown = {
  readonly count: number;
  readonly medianOvr: number;
  readonly medianAge: number;
  readonly ovrQuartiles: readonly [number, number, number];
  readonly ageQuartiles: readonly [number, number, number];
  readonly byPolicy: ReadonlyMap<string, number>;
  readonly byClub: ReadonlyMap<string, number>;
  readonly bySeason: ReadonlyMap<number, number>;
  /** Policies present in the dump that signed nobody of this type. Named so
   * the selection is visible rather than assumed absent. */
  readonly policiesWithoutSignings: readonly string[];
};

const quantileOf = (sorted: readonly number[], p: number): number => {
  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = at(sorted, lower, "quantile lower");
  if (lower === upper) return lowerValue;
  return lowerValue * (upper - index) + at(sorted, upper, "quantile upper") * (index - lower);
};

/**
 * What the cohort is, before anything is fitted to it.
 *
 * The plan's warning applies here: these are SIGNINGS, not offers. A policy
 * that only buys young players never signs a veteran free agent, and a card
 * refused for lack of a squad slot leaves no row at all, so the ovr and age
 * distributions below are conditioned on both filters. The breakdown exists
 * so a reader can see the size of that conditioning instead of taking the
 * headline median at face value.
 */
export const summariseSigningCohort = (
  rows: readonly SigningRow[],
  allPolicies: readonly string[] = []
): CohortBreakdown => {
  if (rows.length === 0) throw new Error("empty signing cohort");
  const ovr = rows.map((row) => row.ovr).sort((a, b) => a - b);
  const age = rows.map((row) => row.age).sort((a, b) => a - b);
  const byPolicy = new Map<string, number>();
  const byClub = new Map<string, number>();
  const bySeason = new Map<number, number>();
  for (const row of rows) {
    byPolicy.set(row.policyName, (byPolicy.get(row.policyName) ?? 0) + 1);
    byClub.set(row.clubShortName, (byClub.get(row.clubShortName) ?? 0) + 1);
    bySeason.set(row.season, (bySeason.get(row.season) ?? 0) + 1);
  }
  return {
    count: rows.length,
    medianOvr: quantileOf(ovr, 0.5),
    medianAge: quantileOf(age, 0.5),
    ovrQuartiles: [quantileOf(ovr, 0.25), quantileOf(ovr, 0.5), quantileOf(ovr, 0.75)],
    ageQuartiles: [quantileOf(age, 0.25), quantileOf(age, 0.5), quantileOf(age, 0.75)],
    byPolicy,
    byClub,
    bySeason,
    policiesWithoutSignings: allPolicies.filter((policy) => !byPolicy.has(policy)),
  };
};

export type FreeAgentPremiumFit = {
  readonly count: number;
  /** `2 * baseWage(ovr) / counterfactualFee` for the median observation. */
  readonly medianUnitShare: number;
  readonly premium: number;
  /** The same fit with every club weighted equally instead of by how many
   * signings it made. Reported side by side, never averaged. */
  readonly premiumEqualClubWeight: number;
  readonly medianCounterfactualFee: number;
  readonly medianBaseWage: number;
  /** Diagnostic only: what the overpay costs over five seasons instead of
   * the two the target is defined on. */
  readonly fiveSeasonOverpayShare: number;
  readonly targetRatio: number;
  readonly achievedRatio: number;
  readonly withinSpecBand: boolean;
};

export const FREE_AGENT_TARGET_BAND = { lo: 0.4, hi: 0.6 } as const;

/** The horizon the spec's chapter 4.1 fixes. Two seasons, not "to the end of
 * the tenure": otherwise the same constant would have to hit the target for
 * a card in season 1 and one in season 5 at once. */
export const FREE_AGENT_HORIZON_SEASONS = 2;

/**
 * The signing premium that makes the two-season overpay the target share of
 * what the same player would have cost in a fee.
 *
 * The reference fee is for a player of the SAME ovr, age and position, and it
 * carries the median KUPNO price deviation explicitly - the market value is
 * not the median fee of a KUPNO card, it is the median fee divided by that
 * deviation, and treating the two as one would understate the reference by
 * a fifth.
 */
export const fitFreeAgentPremium = (
  rows: readonly SigningRow[],
  wageParams: WageParams,
  counterfactualFeeOf: (_row: SigningRow) => number,
  targetRatio = 0.5
): FreeAgentPremiumFit => {
  if (rows.length === 0) throw new Error("empty free-agent cohort");
  if (!Number.isFinite(targetRatio) || targetRatio <= 0) {
    throw new Error(`target ratio must be finite and positive, got ${targetRatio}`);
  }
  const perRow = rows.map((row) => {
    const fee = counterfactualFeeOf(row);
    if (!Number.isFinite(fee) || fee <= 0) {
      throw new Error(`counterfactual fee must be finite and positive, got ${fee}`);
    }
    const wage = baseWage(row.ovr, wageParams);
    return {
      club: row.clubShortName,
      fee,
      wage,
      unitShare: (FREE_AGENT_HORIZON_SEASONS * wage) / fee,
    };
  });

  const unitShares = perRow.map((entry) => entry.unitShare).sort((a, b) => a - b);
  const medianUnitShare = quantileOf(unitShares, 0.5);
  const premium = 1 + targetRatio / medianUnitShare;

  const byClub = new Map<string, number[]>();
  for (const entry of perRow) {
    const list = byClub.get(entry.club);
    if (list) list.push(entry.unitShare);
    else byClub.set(entry.club, [entry.unitShare]);
  }
  const clubMedians = [...byClub.values()]
    .map((values) =>
      quantileOf(
        [...values].sort((a, b) => a - b),
        0.5
      )
    )
    .sort((a, b) => a - b);
  const premiumEqualClubWeight = 1 + targetRatio / quantileOf(clubMedians, 0.5);

  const achievedRatio = medianUnitShare * (premium - 1);
  return {
    count: rows.length,
    medianUnitShare,
    premium,
    premiumEqualClubWeight,
    medianCounterfactualFee: quantileOf(
      perRow.map((entry) => entry.fee).sort((a, b) => a - b),
      0.5
    ),
    medianBaseWage: quantileOf(
      perRow.map((entry) => entry.wage).sort((a, b) => a - b),
      0.5
    ),
    fiveSeasonOverpayShare: (achievedRatio * 5) / FREE_AGENT_HORIZON_SEASONS,
    targetRatio,
    achievedRatio,
    withinSpecBand:
      achievedRatio >= FREE_AGENT_TARGET_BAND.lo && achievedRatio <= FREE_AGENT_TARGET_BAND.hi,
  };
};
/**
 * The step-3a value curve, derived rather than transcribed.
 *
 * The parameters below are the report's, kept only so the tool can SAY the
 * two agree. Everything that prices a player goes through `fittedValueCurve`,
 * which reruns the step-3a search, because a hand-copied constant is exactly
 * how the spec's own examples drifted twice.
 */
export const PINNED_VALUE_CURVE: ValueCurveParams = {
  vmax: 13,
  slope: 6.6,
  midpoint: 87.6,
  youngShift: 4.8,
  peakEndShift: -2.7,
  latePlusThreeShift: -6.9,
  latePlusSixShift: -11.1,
};

export const PINNED_VALUE_CURVE_KNEE = 6;

let cachedCurve: { params: ValueCurveParams; knee: number } | null = null;

/** Memoised for the process: the search walks a 15625-point grid and takes
 * about half a second, which is cheap once and wasteful per consumer. */
export const fittedValueCurve = (): {
  params: ValueCurveParams;
  knee: number;
} => {
  if (cachedCurve === null) cachedCurve = bestFit(feasibleJointSets(SEARCH_RANGE));
  return cachedCurve;
};

export type PinnedCurveComparison = {
  readonly matches: boolean;
  readonly differences: readonly string[];
  readonly toolVersion: string;
};

export const compareWithPinnedCurve = (fit: {
  params: ValueCurveParams;
  knee: number;
}): PinnedCurveComparison => {
  const differences: string[] = [];
  for (const key of Object.keys(PINNED_VALUE_CURVE) as (keyof ValueCurveParams)[]) {
    if (fit.params[key] !== PINNED_VALUE_CURVE[key]) {
      differences.push(`${key}: fitted ${fit.params[key]}, pinned ${PINNED_VALUE_CURVE[key]}`);
    }
  }
  if (fit.knee !== PINNED_VALUE_CURVE_KNEE) {
    differences.push(`knee: fitted ${fit.knee}, pinned ${PINNED_VALUE_CURVE_KNEE}`);
  }
  return {
    matches: differences.length === 0,
    differences,
    toolVersion: FIT_TOOL_VERSION,
  };
};

/**
 * The fee a KUPNO card would carry for this player, at the median of the
 * card's own price deviation.
 *
 * The market value is NOT the median fee: the card multiplies it by a draw
 * from `U(0.9, 1.5)`, whose median is 1.2, and by the position's market
 * state. Both factors are passed explicitly so the reference fee is a stated
 * construction rather than an implied equality.
 */
export const counterfactualKupnoFee = (
  ovr: number,
  age: number,
  pos: PositionCode,
  params: ValueCurveParams,
  marketMultiplier: number,
  priceDeviation: number = KUPNO_MEDIAN_PRICE_DEVIATION
): number => {
  if (!Number.isFinite(marketMultiplier) || marketMultiplier <= 0) {
    throw new Error(`market multiplier must be finite and positive, got ${marketMultiplier}`);
  }
  return marketValueAt(ovr, age, AGE_PROFILES[pos], params) * priceDeviation * marketMultiplier;
};
/**
 * The two legacy-unit invariants of the spec's chapter 5.2, at full
 * precision.
 *
 * The pinned baseline note prints these medians rounded to two decimals for
 * reading. Rounding is fine for reading and wrong for arithmetic: step 4
 * divides a historical PRODUCT by a new median to get a new multiplier, and
 * a product rebuilt from `2 x 1.99` is not the product the old economy
 * actually scored. So the raw medians are recomputed here from the dumps and
 * written down at full precision, alongside the rounded figures they explain.
 */

export type CareerRow = {
  readonly clubShortName: string;
  readonly policyName: string;
  readonly seed: number;
  readonly incomeMode: string;
  readonly dumpSchemaVersion: string;
  readonly kasa: number;
  readonly wartoscKadryMoj: number;
};

export type CareerDump = {
  readonly rows: readonly CareerRow[];
  readonly digest: DumpDigest;
  readonly policies: readonly string[];
  readonly clubs: readonly string[];
  readonly incomeModes: readonly string[];
  readonly schemaVersions: readonly string[];
};

const CAREER_COLUMNS = [
  "polityka",
  "seed",
  "kasa",
  "wartoscKadryMoj",
  "clubShortName",
  "incomeMode",
  "dumpSchemaVersion",
] as const;

export const loadCareers = async (path: string, expectedSha256?: string): Promise<CareerDump> => {
  const rows: CareerRow[] = [];
  let headerChecked = false;
  const digest = await streamDump(path, (row, index) => {
    if (!headerChecked) {
      for (const column of CAREER_COLUMNS) {
        if (!(column in row)) throw new Error(`${path}: missing column "${column}"`);
      }
      headerChecked = true;
    }
    const kasa = Number(row.kasa);
    const wartoscKadryMoj = Number(row.wartoscKadryMoj);
    const seed = Number(row.seed);
    if (!Number.isFinite(kasa) || !Number.isFinite(wartoscKadryMoj) || !Number.isFinite(seed)) {
      throw new Error(`career row ${index}: kasa, wartoscKadryMoj or seed is not a finite number`);
    }
    const clubShortName = recordAt(row, "clubShortName", "career column");
    const policyName = recordAt(row, "polityka", "career column");
    if (clubShortName === "" || policyName === "") {
      throw new Error(`career row ${index}: missing club or policy`);
    }
    rows.push({
      clubShortName,
      policyName,
      seed,
      incomeMode: recordAt(row, "incomeMode", "career column"),
      dumpSchemaVersion: recordAt(row, "dumpSchemaVersion", "career column"),
      kasa,
      wartoscKadryMoj,
    });
  });
  if (rows.length === 0) throw new Error(`${path}: no career rows`);
  if (expectedSha256) assertDigest(digest, expectedSha256);
  const distinct = (pick: (_row: CareerRow) => string): string[] =>
    [...new Set(rows.map(pick))].sort();
  return {
    rows,
    digest,
    policies: distinct((row) => row.policyName),
    clubs: distinct((row) => row.clubShortName),
    incomeModes: distinct((row) => row.incomeMode),
    schemaVersions: distinct((row) => row.dumpSchemaVersion),
  };
};

export type LegacyUnitMeasurement = {
  readonly count: number;
  /** Every career weighted equally. This is the definition the baseline note
   * used, and therefore the one step 4 must reuse. */
  readonly pooledMedian: number;
  /** Every club weighted equally instead. Recorded beside the pooled figure
   * because chapter 12.2 asks its question this way, and the two differ. */
  readonly medianOfClubMedians: number;
  readonly perClub: readonly {
    readonly club: string;
    readonly median: number;
    readonly count: number;
  }[];
};

export const measureLegacyUnit = (
  rows: readonly CareerRow[],
  pick: (_row: CareerRow) => number
): LegacyUnitMeasurement => {
  if (rows.length === 0) throw new Error("empty career population");
  const byClub = new Map<string, number[]>();
  const all: number[] = [];
  for (const row of rows) {
    const value = pick(row);
    if (!Number.isFinite(value)) throw new Error(`${row.clubShortName}: non-finite career value`);
    all.push(value);
    const list = byClub.get(row.clubShortName);
    if (list) list.push(value);
    else byClub.set(row.clubShortName, [value]);
  }
  const perClub = [...byClub.entries()]
    .map(([club, values]) => ({
      club,
      median: quantileOf(
        [...values].sort((a, b) => a - b),
        0.5
      ),
      count: values.length,
    }))
    .sort((a, b) => a.club.localeCompare(b.club, "pl"));
  return {
    count: rows.length,
    pooledMedian: quantileOf(
      [...all].sort((a, b) => a - b),
      0.5
    ),
    medianOfClubMedians: quantileOf(
      perClub.map((entry) => entry.median).sort((a, b) => a - b),
      0.5
    ),
    perClub,
  };
};

/**
 * The multipliers the OLD economy scored with. Written down rather than
 * imported: step 4 changes both, and a test that imported them would start
 * asserting the new economy reproduces itself.
 */
export const HISTORICAL_LEGACY_MULTIPLIERS = {
  kasa: 5,
  wartoscKadryMoj: 2,
} as const;

const PINNED_LEGACY_INVARIANTS = {
  control: {
    pooledMedian: 3.31,
    medianOfClubMedians: 3.17,
    product: 16.55,
  },
  active: {
    pooledMedian: 1.9932376574242872,
    medianOfClubMedians: 1.9055612632082046,
    product: 3.9864753148485743,
  },
} as const;

/** Validate the historical measurement before admitting it into a fit report.
 * These pins must not follow current clubs, policies or balance constants:
 * changing today's simulation cannot rewrite yesterday's unit of legacy. */
export const validateLegacyBaseline = (raw: unknown): Record<string, unknown> => {
  const fail = (field: string): never => {
    throw new Error(`Invalid legacy baseline: ${field}`);
  };
  const record = (value: unknown, field: string): Record<string, unknown> => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return fail(field);
    return value as Record<string, unknown>;
  };
  const equal = (value: unknown, expected: unknown, field: string): void => {
    if (value !== expected) fail(field);
  };
  const finite = (value: unknown, field: string): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) return fail(field);
    return value;
  };
  const sameMembers = (value: unknown, expected: readonly string[], field: string): void => {
    if (
      !Array.isArray(value) ||
      value.length !== expected.length ||
      new Set(value).size !== expected.length ||
      !value.every((item) => typeof item === "string" && expected.includes(item))
    )
      fail(field);
  };
  const root = record(raw, "root");
  equal(root.schemaVersion, 1, "schemaVersion");
  equal(record(root.aggregation, "aggregation").definition, "pooledMedian", "aggregation");
  const source = record(root.source, "source");
  equal(source.engineCommit, "81d611a6c50e2e7c718e7c949aba2339ea4a8d15", "engineCommit");
  equal(source.engineRevision, "2026-09-07.1", "engineRevision");
  equal(source.dumpSchemaVersion, 2, "dumpSchemaVersion");
  equal(source.seed, "0x5eed0001", "seed");
  equal(source.runsPerCell, 1000, "runsPerCell");
  const clubs = [
    "Cracovia",
    "GKS",
    "Górnik",
    "Jagiellonia",
    "Korona",
    "Lech",
    "Legia",
    "Motor",
    "Piast",
    "Pogoń",
    "Radomiak",
    "Raków",
    "Widzew",
    "Wieczysta",
    "Wisła K.",
    "Wisła P.",
    "Zagłębie",
    "Śląsk",
  ];
  const activePolicies = [
    "alwaysHaggle",
    "alwaysTake",
    "analystEdgeBuy",
    "depthFirst",
    "mixed",
    "primeOnly",
    "primeOnlyBuy",
    "stallThenTake",
    "veteranOnly",
    "veteranOnlyBuy",
    "youngBuySellAlways",
    "youngOnly",
    "youngOnlyBuy",
  ];
  const artefacts = record(root.artefacts, "artefacts");
  const invariants = record(root.invariants, "invariants");
  for (const key of ["control", "active"] as const) {
    const control = key === "control";
    const policies = control ? ["alwaysPass"] : activePolicies;
    const countPerClub = 1000 * policies.length;
    const count = clubs.length * countPerClub;
    const artefact = record(artefacts[key], `artefacts.${key}`);
    equal(artefact.sha256, FINANCE_BASELINE_SHA256[key], `${key}.sha256`);
    equal(artefact.rowCount, count, `${key}.rowCount`);
    sameMembers(artefact.policies, policies, `${key}.policies`);
    sameMembers(artefact.clubs, clubs, `${key}.clubs`);
    sameMembers(
      artefact.incomeModes,
      [control ? "finance-control" : "normal"],
      `${key}.incomeModes`
    );
    sameMembers(artefact.dumpSchemaVersions, ["2"], `${key}.dumpSchemaVersions`);
    const invariant = record(invariants[control ? "cash" : "squadValue"], `${key}.invariant`);
    const quantity = control ? "kasa" : "wartoscKadryMoj";
    equal(invariant.quantity, quantity, `${key}.quantity`);
    equal(invariant.run, control ? "finance-control" : "active", `${key}.run`);
    equal(
      invariant.historicalMultiplier,
      HISTORICAL_LEGACY_MULTIPLIERS[quantity],
      `${key}.multiplier`
    );
    const measurement = record(invariant.measurement, `${key}.measurement`);
    equal(measurement.count, count, `${key}.count`);
    const median = finite(measurement.pooledMedian, `${key}.pooledMedian`);
    if (median <= 0) fail(`${key}.pooledMedian must be positive`);
    equal(median, PINNED_LEGACY_INVARIANTS[key].pooledMedian, `${key}.pooledMedian pin`);
    equal(invariant.product, HISTORICAL_LEGACY_MULTIPLIERS[quantity] * median, `${key}.product`);
    equal(invariant.product, PINNED_LEGACY_INVARIANTS[key].product, `${key}.product pin`);
    if (!Array.isArray(measurement.perClub)) fail(`${key}.perClub`);
    const perClub = (measurement.perClub as unknown[]).map((entry) =>
      record(entry, `${key}.perClub`)
    );
    sameMembers(
      perClub.map((entry) => entry.club),
      clubs,
      `${key}.perClub clubs`
    );
    const medians = perClub
      .map((entry) => {
        equal(entry.count, countPerClub, `${key}.perClub count`);
        const value = finite(entry.median, `${key}.perClub median`);
        if (!control && value < 0) fail(`${key}.perClub negative squad value`);
        return value;
      })
      .sort((a, b) => a - b);
    equal(measurement.medianOfClubMedians, quantileOf(medians, 0.5), `${key}.medianOfClubMedians`);
    equal(
      measurement.medianOfClubMedians,
      PINNED_LEGACY_INVARIANTS[key].medianOfClubMedians,
      `${key}.medianOfClubMedians pin`
    );
  }
  return root;
};

export type LegacyUnitInvariant = {
  readonly quantity: "kasa" | "wartoscKadryMoj";
  readonly run: "finance-control" | "active";
  readonly measurement: LegacyUnitMeasurement;
  readonly historicalMultiplier: number;
  /** `multiplier x median`, the contribution this component made to legacy
   * under the old economy. The quantity step 4 must preserve. */
  readonly product: number;
};

export const legacyUnitInvariant = (
  quantity: "kasa" | "wartoscKadryMoj",
  run: "finance-control" | "active",
  rows: readonly CareerRow[]
): LegacyUnitInvariant => {
  const measurement = measureLegacyUnit(rows, (row) =>
    quantity === "kasa" ? row.kasa : row.wartoscKadryMoj
  );
  const historicalMultiplier = HISTORICAL_LEGACY_MULTIPLIERS[quantity];
  return {
    quantity,
    run,
    measurement,
    historicalMultiplier,
    product: historicalMultiplier * measurement.pooledMedian,
  };
};

export type ConversionResult =
  | { readonly ok: true; readonly multiplier: number }
  | { readonly ok: false; readonly reason: string };

/**
 * The step-4 conversion: a new multiplier that keeps the old product.
 *
 * Refuses rather than divides when the new median is zero, negative or too
 * close to zero to be stable. A median that has crossed zero is not a change
 * of unit, it is a change of sign, and no multiplier expresses that.
 */
export const convertedLegacyMultiplier = (
  invariant: LegacyUnitInvariant,
  newMedian: number,
  minimumStableMedian: number
): ConversionResult => {
  if (!Number.isFinite(minimumStableMedian) || minimumStableMedian <= 0) {
    throw new Error(`minimum stable median must be finite and positive`);
  }
  if (!Number.isFinite(newMedian)) return { ok: false, reason: "new median is not finite" };
  if (newMedian <= 0) {
    return {
      ok: false,
      reason: `new median ${newMedian} is not positive; no unit conversion`,
    };
  }
  if (newMedian < minimumStableMedian) {
    return {
      ok: false,
      reason: `new median ${newMedian} is below the stability floor ${minimumStableMedian}`,
    };
  }
  return { ok: true, multiplier: invariant.product / newMedian };
};
