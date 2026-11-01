import { KOSZTY_STALE, WOLNY_WAGE_PREMIUM } from "../src/data/balance";
import { ACCEPTED_DUMP_SCHEMA_VERSIONS, CUP_INCOME_SCHEMA_VERSION } from "./balance-metrics";
import { parseCsvLine } from "./csv";
import { median, quantile } from "./stats";
import { at } from "../src/logic/invariant";

/**
 * The arithmetic of the activation report, with no file reading in it.
 *
 * Split from the CLI for the same reason every other tool here is: the
 * measurement has to be checkable on rows built by hand, and importing this
 * module must not read a 200 MB dump to make that possible.
 *
 * Nothing here re-simulates and nothing re-derives a balance from other
 * columns: a recomputation would agree with the engine by construction and
 * would check nothing. Every figure comes from a dump the engine wrote.
 */

export const REPORT_SCHEMA_VERSION = 1;

/** The four clubs the spec's chapter 12.2 asks for by name: the richest, the
 * one with a low budget against its revenue, the one with money and a weak
 * defence, and the owner exception. */
export const ANCHOR_CLUBS = ["Legia", "Zagłębie", "Wisła K.", "Wieczysta"] as const;

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
  readonly scalableNetPln: number;
  readonly cashAtHandover: number | null;
  /**
   * The three one-off cup receipts, and their sum, as the engine actually
   * credited them - so zero throughout a `finance-control` run.
   *
   * Null on a schema-3 row, which predates the columns. Null is not zero and
   * must never be read as it: the pinned 2026-09-10 activation artefacts are
   * schema 3, and silently treating their missing cups as "no cup money" would
   * turn an absent measurement into a measured absence. On schema 4 the
   * columns are required, so a row that lacks one is an input error.
   */
  readonly europeanPrizeIncome: number | null;
  readonly polishCupPrizeIncome: number | null;
  readonly superCupPrizeIncome: number | null;
  readonly creditedCupIncome: number | null;
  /** `GameState.rngDrawCount` when this season's event was emitted. Null on a
   * schema-3 row, which predates the column - never zero, which would read as
   * a career that never touched the generator. */
  readonly rngDrawCount: number | null;
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
  "scalableNetPln",
  "cashAtHandover",
] as const;

const finite = (raw: string, field: string, index: number): number => {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`season row ${index}: ${field} is not a finite number ("${raw}")`);
  }
  return value;
};

/** The columns schema 4 added to the season dump, in dump order: the three
 * cup receipts, their sum, and the per-season draw tally. */
const SCHEMA_4_COLUMNS = [
  "europeanPrizeIncome",
  "polishCupPrizeIncome",
  "superCupPrizeIncome",
  "creditedCupIncome",
  "rngDrawCount",
] as const;

/**
 * The schema-4 fields of one row: numbers on schema 4, nulls on schema 3.
 *
 * A schema-4 row with one of them missing is an input error, never a zero.
 * Defaulting would make a truncated dump read as a season in which no club won
 * anything and nobody touched the generator - both perfectly plausible-looking
 * seasons, and therefore the hardest kind of corruption to notice downstream.
 */
const schema4Fields = (
  cell: (_column: string) => string,
  schema: number,
  index: number
): {
  europeanPrizeIncome: number | null;
  polishCupPrizeIncome: number | null;
  superCupPrizeIncome: number | null;
  creditedCupIncome: number | null;
  rngDrawCount: number | null;
} => {
  if (schema < CUP_INCOME_SCHEMA_VERSION) {
    return {
      europeanPrizeIncome: null,
      polishCupPrizeIncome: null,
      superCupPrizeIncome: null,
      creditedCupIncome: null,
      rngDrawCount: null,
    };
  }
  for (const column of SCHEMA_4_COLUMNS) {
    if (cell(column) === "") {
      throw new Error(
        `season row ${index}: schema ${schema} requires the "${column}" column, and it is empty`
      );
    }
  }
  const fields = {
    europeanPrizeIncome: finite(cell("europeanPrizeIncome"), "europeanPrizeIncome", index),
    polishCupPrizeIncome: finite(cell("polishCupPrizeIncome"), "polishCupPrizeIncome", index),
    superCupPrizeIncome: finite(cell("superCupPrizeIncome"), "superCupPrizeIncome", index),
    creditedCupIncome: finite(cell("creditedCupIncome"), "creditedCupIncome", index),
    rngDrawCount: finite(cell("rngDrawCount"), "rngDrawCount", index),
  };
  const componentSum =
    fields.europeanPrizeIncome + fields.polishCupPrizeIncome + fields.superCupPrizeIncome;
  // Each component and the total are written to four decimal places. Permit
  // the largest possible one-unit rounding disagreement, but never let a
  // stale or truncated total masquerade as measured cup income.
  if (Math.abs(componentSum - fields.creditedCupIncome) > 0.0001 + Number.EPSILON) {
    throw new Error(
      `season row ${index}: creditedCupIncome ${fields.creditedCupIncome} is not the sum of its components (${componentSum})`
    );
  }
  return fields;
};

/**
 * Reads a season dump and refuses every shape that would make an aggregate
 * lie: a wrong schema, a mixed economy, a career counted twice.
 */
export const parseSeasonDump = (
  csv: string,
  expected: { readonly incomeMode: string }
): SeasonRow[] => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) throw new Error("season dump is empty: no header row");
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  for (const column of SEASON_COLUMNS) {
    if (!header.includes(column)) throw new Error(`season dump is missing the "${column}" column`);
  }
  const rows: SeasonRow[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(at(lines, i, "CSV line"));
    const cell = (column: string): string => fields[header.indexOf(column)] ?? "";
    const schema = finite(cell("dumpSchemaVersion"), "dumpSchemaVersion", i);
    if (!ACCEPTED_DUMP_SCHEMA_VERSIONS.includes(schema)) {
      throw new Error(
        `season row ${i}: dump schema ${schema} is not one of ${ACCEPTED_DUMP_SCHEMA_VERSIONS.join(", ")}`
      );
    }
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
      seed: finite(cell("seed"), "seed", i),
      season: finite(cell("season"), "season", i),
      initialBudget: finite(cell("initialBudget"), "initialBudget", i),
      preseasonForecastBalanceWithoutTransfersAndCups: finite(
        cell("preseasonForecastBalanceWithoutTransfersAndCups"),
        "preseasonForecastBalanceWithoutTransfersAndCups",
        i
      ),
      actualBalanceWithoutTransfersAndCups: finite(
        cell("actualBalanceWithoutTransfersAndCups"),
        "actualBalanceWithoutTransfersAndCups",
        i
      ),
      scaledRecurringRevenue: finite(cell("scaledRecurringRevenue"), "scaledRecurringRevenue", i),
      leaguePositionPrize: finite(cell("leaguePositionPrize"), "leaguePositionPrize", i),
      totalPayroll: finite(cell("totalPayroll"), "totalPayroll", i),
      fixedCosts: finite(cell("fixedCosts"), "fixedCosts", i),
      scalableNetPln: finite(cell("scalableNetPln"), "scalableNetPln", i),
      cashAtHandover:
        cell("cashAtHandover") === "" ? null : finite(cell("cashAtHandover"), "cashAtHandover", i),
      ...schema4Fields(cell, schema, i),
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
  const versions = [...new Set(rows.map((row) => row.engineVersion))];
  if (versions.length > 1) {
    throw new Error(`season dump mixes engine versions: ${versions.join(", ")}`);
  }
  return rows;
};

/**
 * The median of the clubs' medians - every club weighted equally, whatever
 * its number of careers.
 *
 * This is the definition the spec's chapter 12.2 asks the money-scale
 * question with, and it is NOT the pooled median: pooling would let the
 * clubs with the longest careers speak loudest, which is precisely the
 * clubs whose seasons the change is meant to move.
 */
export const medianOfClubMedians = (
  rows: readonly SeasonRow[],
  pick: (_row: SeasonRow) => number
): number => {
  const byClub = new Map<string, number[]>();
  for (const row of rows) {
    const list = byClub.get(row.clubShortName);
    if (list) list.push(pick(row));
    else byClub.set(row.clubShortName, [pick(row)]);
  }
  if (byClub.size === 0) throw new Error("no clubs to take a median of");
  return median([...byClub.values()].map((values) => median(values)));
};

export type MoneyScaleStep = {
  /** The median club's median season balance, in millions of game euro. */
  readonly balanceMedian: number;
  /** The same seasons' scalable part, carried back into PLN. */
  readonly scalableMedianPln: number;
  /** `scalableMedianPln / KOSZTY_STALE`: the scale at which the median
   * ordinary season would come out exactly even. */
  readonly dCandidate: number;
  readonly withinTolerance: boolean;
};

export const MONEY_SCALE_TOLERANCE = 0.25;

/**
 * One step of the spec's fixed point. The balance is read straight off the
 * dump; the candidate scale is what the same seasons imply.
 */
export const moneyScaleStep = (rows: readonly SeasonRow[]): MoneyScaleStep => {
  const balanceMedian = medianOfClubMedians(
    rows,
    (row) => row.actualBalanceWithoutTransfersAndCups
  );
  const scalableMedianPln = medianOfClubMedians(rows, (row) => row.scalableNetPln);
  if (KOSZTY_STALE <= 0) throw new Error("KOSZTY_STALE must be positive to derive a money scale");
  return {
    balanceMedian,
    scalableMedianPln,
    dCandidate: scalableMedianPln / KOSZTY_STALE,
    withinTolerance: Math.abs(balanceMedian) <= MONEY_SCALE_TOLERANCE,
  };
};

export type CareerDrift = {
  readonly clubShortName: string;
  readonly careers: number;
  readonly medianResidual: number;
  readonly withinTolerance: boolean;
};

export const CASH_DRIFT_TOLERANCE = 0.5;

/**
 * `cashAtHandover - initialBudget - sum(preseason forecast balances)`, per
 * career, summarised per club.
 *
 * A club's expected deficit appears on both sides of the subtraction, so this
 * catches unforeseen accumulation or loss rather than removing the deficit
 * the economy is meant to have. Only seasons actually played are summed - a
 * career cut short by relegation has fewer of them, not missing ones.
 */
export const cashDrift = (rows: readonly SeasonRow[]): CareerDrift[] => {
  type Career = { budget: number; forecastSum: number; handover: number | null };
  const careers = new Map<string, Map<string, Career>>();
  for (const row of rows) {
    const perClub = careers.get(row.clubShortName) ?? new Map<string, Career>();
    careers.set(row.clubShortName, perClub);
    const key = `${row.policyName}\0${row.seed}`;
    const career = perClub.get(key) ?? {
      budget: row.initialBudget,
      forecastSum: 0,
      handover: null,
    };
    career.forecastSum += row.preseasonForecastBalanceWithoutTransfersAndCups;
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
        residuals.push(career.handover - career.budget - career.forecastSum);
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

export type LadderShare = {
  readonly clubShortName: string;
  readonly recurringRevenue: number;
  /** The ladder's share of a season's scalable income, at the top and at the
   * bottom of the table. The same ladder for everyone; the bases differ. */
  readonly shareAsChampion: number;
  readonly shareAsLast: number;
  readonly medianSeasonBalance: number;
};

export const ladderShares = (
  rows: readonly SeasonRow[],
  ladderAt: (_place: number) => number
): LadderShare[] => {
  const byClub = new Map<string, SeasonRow[]>();
  for (const row of rows) {
    const list = byClub.get(row.clubShortName);
    if (list) list.push(row);
    else byClub.set(row.clubShortName, [row]);
  }
  const champion = ladderAt(1);
  const last = ladderAt(18);
  return [...byClub.entries()]
    .map(([clubShortName, clubRows]) => {
      const recurringRevenue = at(clubRows, 0, "first club row").scaledRecurringRevenue;
      return {
        clubShortName,
        recurringRevenue,
        shareAsChampion: champion / (recurringRevenue + champion),
        shareAsLast: last / (recurringRevenue + last),
        medianSeasonBalance: median(
          clubRows.map((row) => row.actualBalanceWithoutTransfersAndCups)
        ),
      };
    })
    .sort((a, b) => b.recurringRevenue - a.recurringRevenue);
};

export type CareerLengths = {
  readonly careers: number;
  readonly medianSeasons: number;
  readonly p25Seasons: number;
  readonly shareCutShort: number;
};

export const careerLengths = (rows: readonly SeasonRow[], fullTenure: number): CareerLengths => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.clubShortName}\0${row.policyName}\0${row.seed}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const lengths = [...counts.values()].sort((a, b) => a - b);
  return {
    careers: lengths.length,
    medianSeasons: quantile(lengths, 0.5),
    p25Seasons: quantile(lengths, 0.25),
    shareCutShort: lengths.filter((n) => n < fullTenure).length / lengths.length,
  };
};

export type FreeAgentRatio = {
  readonly policyName: string;
  readonly signings: number;
  readonly medianUnitShare: number;
  /** The two-season overpay as a share of the median fee the same player
   * would have cost on a KUPNO card. The spec's band is 0.40-0.60. */
  readonly achievedRatio: number;
  readonly withinBand: boolean;
};

export const FREE_AGENT_BAND = { lo: 0.4, hi: 0.6 } as const;
export const FREE_AGENT_HORIZON_SEASONS = 2;

/**
 * The overpay ratio, per policy, from the activated run's own signings.
 *
 * The unit share uses the signing's recorded BASE wage - the wage before the
 * premium, the stalling penalty and any haggle - because the premium is what
 * is being measured and including it would measure it against itself.
 */
export const freeAgentRatios = (
  rows: readonly {
    readonly policyName: string;
    readonly baseAnnualWage: number;
    /** The median fee the SAME player - same ovr, age and position - would
     * have carried on a KUPNO card. Passed in rather than computed here, so
     * the reference market and the median price deviation are stated by the
     * caller instead of being implied. */
    readonly referenceFee: number;
  }[]
): FreeAgentRatio[] => {
  const byPolicy = new Map<string, number[]>();
  for (const row of rows) {
    if (!Number.isFinite(row.referenceFee) || row.referenceFee <= 0) {
      throw new Error("a free-agent signing has no usable reference fee");
    }
    const unitShare = (FREE_AGENT_HORIZON_SEASONS * row.baseAnnualWage) / row.referenceFee;
    const list = byPolicy.get(row.policyName);
    if (list) list.push(unitShare);
    else byPolicy.set(row.policyName, [unitShare]);
  }
  return [...byPolicy.entries()]
    .map(([policyName, shares]) => {
      const medianUnitShare = median(shares);
      const achievedRatio = medianUnitShare * (WOLNY_WAGE_PREMIUM - 1);
      return {
        policyName,
        signings: shares.length,
        medianUnitShare,
        achievedRatio,
        withinBand: achievedRatio >= FREE_AGENT_BAND.lo && achievedRatio <= FREE_AGENT_BAND.hi,
      };
    })
    .sort((a, b) => a.policyName.localeCompare(b.policyName));
};

export type PlayabilityRow = {
  readonly clubShortName: string;
  readonly budget: number;
  readonly medianFirstYearCost: number;
  readonly affordable: boolean;
};

/** Can each club buy one median KUPNO card and pay its first year of wages?
 * The floor exists for this question, and it is asked of all eighteen. */
export const playability = (
  budgets: readonly { readonly clubShortName: string; readonly budget: number }[],
  medianFirstYearCost: number
): PlayabilityRow[] =>
  budgets
    .map((entry) => ({
      clubShortName: entry.clubShortName,
      budget: entry.budget,
      medianFirstYearCost,
      affordable: entry.budget >= medianFirstYearCost,
    }))
    .sort((a, b) => a.budget - b.budget);

/**
 * The `gotowy` archetype's own band, as `createPlayer` draws it. A KUPNO card
 * shows a ready-made player from exactly this range, and the middle age is
 * what the reach measurement holds fixed.
 */
export const READY_BAND = { minOvr: 67, maxOvr: 78, midAge: 26 } as const;

export type ReachRow = {
  readonly clubShortName: string;
  readonly budget: number;
  /** The best ovr from the band whose FEE alone the opening cash covers, or
   * null when even the cheapest is out of reach. */
  readonly highestByFee: number | null;
  /** The best ovr whose fee AND first year of wages the opening cash covers -
   * the same question the playability gate asks of the median card. */
  readonly highestByFirstYear: number | null;
};

/**
 * How far up the ready-made band each club can actually reach.
 *
 * The playability gate asks whether every club can buy the MEDIAN card, which
 * it would pass even if the whole upper half of the archetype were out of
 * reach for all eighteen. This asks the other question: not "can everyone buy
 * something" but "can anyone buy someone good".
 *
 * Reported as a measured quantity with NO threshold - where the top of the
 * band should sit is a product-owner decision nobody has taken.
 */
export const bandReach = (
  budgets: readonly { readonly clubShortName: string; readonly budget: number }[],
  feeAt: (_ovr: number) => number,
  wageAt: (_ovr: number) => number
): ReachRow[] =>
  budgets
    .map((entry) => {
      let highestByFee: number | null = null;
      let highestByFirstYear: number | null = null;
      for (let ovr = READY_BAND.minOvr; ovr <= READY_BAND.maxOvr; ovr += 1) {
        if (feeAt(ovr) <= entry.budget) highestByFee = ovr;
        if (feeAt(ovr) + wageAt(ovr) <= entry.budget) highestByFirstYear = ovr;
      }
      return {
        clubShortName: entry.clubShortName,
        budget: entry.budget,
        highestByFee,
        highestByFirstYear,
      };
    })
    .sort((a, b) => a.budget - b.budget);

export type PriceCapRow = {
  readonly clubShortName: string;
  readonly budget: number;
  /** Ovr values in the band whose rolled price the cap cuts. */
  readonly cutCount: number;
  /** The deepest cut as a share of the uncut price, over the band. */
  readonly deepestCutShare: number;
};

/**
 * How much of that reach is an illusion produced by `capPurchasePrice`.
 *
 * The cap trims a KUPNO or PANIC card's price to `cash x PURCHASE_PRICE_CAP`,
 * so a club with no money sees a strong player at a price that says how much
 * it HAS rather than what he is worth. Spec 5 chapter 6 removes that
 * mechanism, so this plan must neither repair it nor pin it as correct - but
 * while it runs, it distorts this step's own measurement, and the number
 * below is the baseline against which spec 5 will show how big a cliff
 * appears once the cap is gone.
 */
export const priceCapReach = (
  budgets: readonly { readonly clubShortName: string; readonly budget: number }[],
  uncutFeeAt: (_ovr: number) => number,
  purchasePriceCap: number
): PriceCapRow[] =>
  budgets
    .map((entry) => {
      let cutCount = 0;
      let deepestCutShare = 0;
      for (let ovr = READY_BAND.minOvr; ovr <= READY_BAND.maxOvr; ovr += 1) {
        const uncut = uncutFeeAt(ovr);
        const ceiling = entry.budget * purchasePriceCap;
        if (uncut > ceiling) {
          cutCount += 1;
          deepestCutShare = Math.max(deepestCutShare, (uncut - ceiling) / uncut);
        }
      }
      return {
        clubShortName: entry.clubShortName,
        budget: entry.budget,
        cutCount,
        deepestCutShare,
      };
    })
    .sort((a, b) => a.budget - b.budget);

export type VerdictShift = {
  readonly title: string;
  readonly before: number;
  readonly after: number;
};

export type VerdictKasaMeasurement = {
  readonly careers: number;
  readonly distribution: readonly VerdictShift[];
  /** Careers whose OBSERVABLE verdict class changed. The preactivation
   * snapshot distinguishes only the no-draw lowest branch from the three
   * drawing branches taken together, so this is a lower bound on title/tier
   * changes rather than their exact count. */
  readonly changedClass: number;
  /**
   * The same count over clubs WITHOUT a 2026/27 berth, where money is the
   * only thing that changed.
   *
   * A berth club's verdict can move for a reason that has nothing to do with
   * cash: its season-one campaign changes squad strength, which changes the
   * league table and therefore the points the verdict is scored on. Mixing
   * the two populations would credit `VERDICT_KASA` with movement it did not
   * cause.
   */
  readonly changedClassWithoutBerth: number;
  readonly careersWithoutBerth: number;
  readonly medianCashBefore: number;
  readonly medianCashAfter: number;
  /** `median cash x VERDICT_KASA` - the component's contribution to `ocena`
   * in each scale. */
  readonly contributionBefore: number;
  readonly contributionAfter: number;
};

/**
 * What leaving `VERDICT_KASA` at its old-scale value actually did.
 *
 * `computeVerdict` scores a tenure partly on cash, and `VERDICT_KASA = 5` is
 * the same number the historical `LEGACY_KASA` carried, for the same reason:
 * both converted cash into points at the OLD scale. Neither the plan nor the
 * spec listed it among the constants the activation reprices, so it is left
 * as it stands - and this measurement is what makes that a decision rather
 * than an oversight.
 */
export type VerdictRow = {
  readonly key: string;
  readonly verdict: string;
  readonly kasa: number;
  /** True when the club replays a real 2026/27 berth, so its verdict can move
   * for a sporting reason rather than a monetary one. */
  readonly hasBerth: boolean;
};

export const verdictKasaShift = (
  before: readonly VerdictRow[],
  after: readonly VerdictRow[],
  verdictKasa: number,
  titles: readonly string[]
): VerdictKasaMeasurement => {
  const beforeByKey = new Map(before.map((row) => [row.key, row]));
  let changedClass = 0;
  let changedClassWithoutBerth = 0;
  let careersWithoutBerth = 0;
  let paired = 0;
  for (const row of after) {
    const previous = beforeByKey.get(row.key);
    if (previous === undefined) continue;
    paired += 1;
    if (!row.hasBerth) careersWithoutBerth += 1;
    if (previous.verdict !== row.verdict) {
      changedClass += 1;
      if (!row.hasBerth) changedClassWithoutBerth += 1;
    }
  }
  const share = (rows: readonly { readonly verdict: string }[], title: string): number =>
    rows.filter((row) => row.verdict === title).length;
  const medianCashBefore = median(before.map((row) => row.kasa));
  const medianCashAfter = median(after.map((row) => row.kasa));
  return {
    careers: paired,
    distribution: titles.map((title) => ({
      title,
      before: share(before, title),
      after: share(after, title),
    })),
    changedClass,
    changedClassWithoutBerth,
    careersWithoutBerth,
    medianCashBefore,
    medianCashAfter,
    contributionBefore: medianCashBefore * verdictKasa,
    contributionAfter: medianCashAfter * verdictKasa,
  };
};

export type LegacyUnit = {
  readonly quantity: string;
  readonly historicalProduct: number;
  readonly newMedian: number;
  readonly multiplier: number;
  readonly rebuiltProduct: number;
  readonly relativeError: number;
  readonly withinTolerance: boolean;
};

export const LEGACY_TOLERANCE = 0.05;

/**
 * A legacy multiplier is a unit conversion, not a calibration: the historical
 * PRODUCT is preserved and the multiplier is whatever divides into the new
 * median to reproduce it. A zero, negative or non-finite median has no
 * sensible conversion and must block rather than divide.
 */
export const legacyUnit = (
  quantity: string,
  historicalProduct: number,
  newMedian: number,
  multiplier: number
): LegacyUnit => {
  if (!Number.isFinite(newMedian) || newMedian <= 0) {
    throw new Error(`${quantity}: new median ${newMedian} has no sensible unit conversion`);
  }
  const rebuiltProduct = multiplier * newMedian;
  const relativeError = (rebuiltProduct - historicalProduct) / historicalProduct;
  return {
    quantity,
    historicalProduct,
    newMedian,
    multiplier,
    rebuiltProduct,
    relativeError,
    withinTolerance: Math.abs(relativeError) <= LEGACY_TOLERANCE,
  };
};

export type RngPairing = {
  readonly pairs: number;
  readonly identical: number;
  readonly missing: number;
  /** Careers whose club replays a real 2026/27 european berth: season one now
   * runs a campaign that did not exist before, and a campaign draws. */
  readonly explainedByBerth: number;
  /** Careers that crossed the one verdict branch which draws nothing. */
  readonly explainedByVerdict: number;
  readonly unexplained: readonly {
    readonly club: string;
    readonly seed: number;
    readonly before: number;
    readonly after: number;
  }[];
  /** Careers at a club WITHOUT a berth whose tenure itself moved - a different
   * number of seasons played, or a different number of relegations. Nothing in
   * the activation may do that, so this has to be zero. */
  readonly tenureMovedWithoutBerth: number;
  /**
   * What happened at the five berth clubs, where a season-one campaign now
   * exists that did not before.
   *
   * The campaign consumes a VARIABLE number of values, so the difference is a
   * wide distribution rather than a fixed offset - and a career can land back
   * on the same total. `leaguePoints` separates the two ways that happens:
   * a stream that never diverged keeps its points, one that diverged and
   * re-converged in count does not.
   */
  readonly berth: {
    readonly careers: number;
    readonly unchangedTally: number;
    /** Of those, how many also kept identical league points. */
    readonly unchangedTallyAndPoints: number;
    /** Careers whose tally moved but whose league points did not. */
    readonly movedTallySamePoints: number;
    readonly deltaP05: number;
    readonly deltaMedian: number;
    readonly deltaP95: number;
  };
  readonly allAttributed: boolean;
};

export type RngAfterRow = {
  readonly club: string;
  readonly seed: number;
  readonly draws: number;
  /** How many values this career's verdict consumed: 0 or 1. */
  readonly verdictDraws: number;
  readonly seasonsPlayed: number;
  readonly tenureRelegations: number;
  /** League points over the controlled seasons: the one recorded quantity
   * that depends on squad strength and the match RNG but never on money. */
  readonly leaguePoints: number;
};

export type RngBeforeRow = {
  readonly draws: number;
  readonly verdictDraws: number;
  readonly seasonsPlayed: number;
  readonly tenureRelegations: number;
  readonly leaguePoints: number;
};

/**
 * Pairs the activated control run's draw tallies against the preactivation
 * snapshot, by (club, seed), and attributes every difference to a named cause.
 *
 * The plan expected all 18 000 pairs to be identical, on the assumption that
 * activating the economy changes what money is WORTH and not how many values a
 * career draws. Two of the plan's own required changes break that assumption,
 * and both are nameable rather than mysterious:
 *
 *  - the first season now replays Poland's real 2026/27 berths, so five clubs
 *    play a european campaign they previously did not, and a campaign draws a
 *    variable number of values;
 *  - `computeVerdict` scores the tenure partly on CASH, and the lowest of its
 *    four branches is the only one that returns without drawing. A career
 *    whose cash moved it across that boundary consumes one draw more or fewer,
 *    which then shifts the whole epilogue that follows.
 *
 * So the honest gate is "every difference is attributable", not "there are no
 * differences" - paired with the stronger claim that the TENURE of a club
 * without a berth is unchanged, which is what says the economy did not quietly
 * reorder the game itself.
 */
export const pairRngCounts = (
  before: (_club: string, _seed: number) => RngBeforeRow | undefined,
  after: readonly RngAfterRow[],
  berthClubs: ReadonlySet<string>
): RngPairing => {
  let identical = 0;
  let missing = 0;
  let explainedByBerth = 0;
  let explainedByVerdict = 0;
  let tenureMovedWithoutBerth = 0;
  const unexplained: { club: string; seed: number; before: number; after: number }[] = [];
  const berthDeltas: number[] = [];
  let berthCareers = 0;
  let berthUnchangedTally = 0;
  let berthUnchangedTallyAndPoints = 0;
  let berthMovedTallySamePoints = 0;

  for (const row of after) {
    const previous = before(row.club, row.seed);
    if (previous === undefined) {
      missing += 1;
      continue;
    }
    const hasBerth = berthClubs.has(row.club);
    if (hasBerth) {
      berthCareers += 1;
      berthDeltas.push(row.draws - previous.draws);
      const samePoints = previous.leaguePoints === row.leaguePoints;
      if (previous.draws === row.draws) {
        berthUnchangedTally += 1;
        if (samePoints) berthUnchangedTallyAndPoints += 1;
      } else if (samePoints) {
        berthMovedTallySamePoints += 1;
      }
    }
    if (
      !hasBerth &&
      (previous.seasonsPlayed !== row.seasonsPlayed ||
        previous.tenureRelegations !== row.tenureRelegations)
    ) {
      tenureMovedWithoutBerth += 1;
    }
    if (previous.draws === row.draws) {
      identical += 1;
      continue;
    }
    if (hasBerth) {
      explainedByBerth += 1;
      continue;
    }
    if (previous.verdictDraws !== row.verdictDraws) {
      explainedByVerdict += 1;
      continue;
    }
    unexplained.push({
      club: row.club,
      seed: row.seed,
      before: previous.draws,
      after: row.draws,
    });
  }

  const sorted = [...berthDeltas].sort((a, b) => a - b);
  const percentileAt = (p: number): number =>
    sorted.length === 0 ? 0 : at(sorted, Math.floor((sorted.length - 1) * p), "berth delta");

  return {
    pairs: after.length,
    identical,
    missing,
    explainedByBerth,
    explainedByVerdict,
    unexplained: unexplained.slice(0, 20),
    tenureMovedWithoutBerth,
    berth: {
      careers: berthCareers,
      unchangedTally: berthUnchangedTally,
      unchangedTallyAndPoints: berthUnchangedTallyAndPoints,
      movedTallySamePoints: berthMovedTallySamePoints,
      deltaP05: percentileAt(0.05),
      deltaMedian: percentileAt(0.5),
      deltaP95: percentileAt(0.95),
    },
    allAttributed:
      after.length > 0 &&
      missing === 0 &&
      unexplained.length === 0 &&
      tenureMovedWithoutBerth === 0,
  };
};
