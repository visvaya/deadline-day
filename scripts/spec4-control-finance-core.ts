import { CLUBS } from "../src/data/clubs";
import { transferBudgetChange } from "../src/logic/finance-scale";
import { scaledRecurringRevenue } from "../src/logic/finance-scale";
import { advantageScoreFor } from "../src/logic/club-projection";
import { distribution, median } from "./stats";
import { at } from "../src/logic/invariant";

/**
 * Pure arithmetic for the spec 4 control report's finance sections (5-7),
 * with no file reading in it - the counterpart of
 * spec4-control-dilemmas-core.ts for sections 1-4.
 */

const groupBy = <T, K>(rows: readonly T[], key: (_row: T) => K): Map<K, T[]> => {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = groups.get(k);
    if (bucket) bucket.push(row);
    else groups.set(k, [row]);
  }
  return groups;
};

const sumBy = <T>(rows: readonly T[], pick: (_row: T) => number): number =>
  rows.reduce((total, row) => total + pick(row), 0);

// --------------------------------------------------------------------------
// Section 5: the free-agent wage cost
// --------------------------------------------------------------------------

/** The policies that actually take WOLNY (free-agent) offers with any
 * regularity - `alwaysTake` and `alwaysHaggle` by design, `mixed` by cycling
 * through it. A policy outside this list would report on a handful of
 * incidental signings rather than the wage the card actually costs. */
export const FREE_AGENT_POLICIES: readonly string[] = ["alwaysTake", "alwaysHaggle", "mixed"];

/** The subset of a `--dump-signings` row this section needs, plus `clubId`
 * resolved from `clubShortName` by the report's own I/O layer - the dump
 * itself only carries the short name. */
export type SigningRow = {
  clubId: string;
  policyName: string;
  offerType: "KUPNO" | "PANIC" | "WOLNY";
  annualWage: number;
  seasonsOnPayroll: number;
  wageCostToHandover: number;
};

export type FreeAgentCostRow = {
  policyName: string;
  signings: number;
  /** Null in every field below when the policy closed no WOLNY signing at
   * all - an unobserved cost, never reported as a zero one. */
  medianAnnualWage: number | null;
  /** The denominator is the SIGNING CLUB's own recurring revenue - never the
   * sum of every club's, and never the cost projected to the tenure's end -
   * so the ratio answers "how big is this wage against what this club
   * actually earns", not a league-wide average. */
  medianAnnualWageShareOfRecurringRevenue: number | null;
  medianWageCostToHandover: number | null;
  medianSeasonsOnPayroll: number | null;
};

/**
 * The wage cost of a WOLNY (free-agent) signing, per policy that actually
 * takes them. The 0.40-0.60 overpay ratio and its fixed two-season horizon
 * are `pnpm audit:finance-activation`'s own criterion and are not
 * recomputed here - this section is additional diagnostic, reported beside
 * that tool's result, not a replacement for it.
 */
export const freeAgentWageCost = (signings: readonly SigningRow[]): FreeAgentCostRow[] => {
  const wolny = signings.filter(
    (row) => row.offerType === "WOLNY" && FREE_AGENT_POLICIES.includes(row.policyName)
  );
  const byPolicy = groupBy(wolny, (row) => row.policyName);
  return FREE_AGENT_POLICIES.map((policyName) => {
    const rows = byPolicy.get(policyName) ?? [];
    if (rows.length === 0) {
      return {
        policyName,
        signings: 0,
        medianAnnualWage: null,
        medianAnnualWageShareOfRecurringRevenue: null,
        medianWageCostToHandover: null,
        medianSeasonsOnPayroll: null,
      };
    }
    return {
      policyName,
      signings: rows.length,
      medianAnnualWage: median(rows.map((row) => row.annualWage)),
      medianAnnualWageShareOfRecurringRevenue: median(
        rows.map((row) => row.annualWage / scaledRecurringRevenue(row.clubId))
      ),
      medianWageCostToHandover: median(rows.map((row) => row.wageCostToHandover)),
      medianSeasonsOnPayroll: median(rows.map((row) => row.seasonsOnPayroll)),
    };
  });
};

// --------------------------------------------------------------------------
// Section 6: raw result versus the board's reinvested budget
// --------------------------------------------------------------------------

/** The subset of a `--dump-seasons` (control run) row this section needs,
 * plus `clubId` resolved from `clubShortName` by the report's I/O layer -
 * the same convention `freeAgentWageCost`'s `SigningRow` uses. */
export type ControlSeasonRow = {
  clubId: string;
  policyName: string;
  seed: number;
  actualBalanceWithoutTransfersAndCups: number;
  initialBudget: number;
  cashAtHandover: number | null;
};

export type ReinvestmentRow = {
  clubId: string;
  medianRawResultSum: number;
  medianBudgetChange: number;
  medianRateResidual: number;
};

const careerKey = (row: ControlSeasonRow): string =>
  `${row.clubId}\0${row.policyName}\0${row.seed}`;

/**
 * Compares each career's summed raw sporting result against how much of it
 * actually reached the transfer budget through `transferBudgetChange`
 * (the board's fixed reinvestment rate) - the residual is what a season's
 * own rate would need to be to explain the observed budget change exactly,
 * and is expected to sit near zero when the rate is truly constant and
 * uniform across seasons.
 *
 * Deliberately does not assume five seasons per career: a career a relegation
 * cut short still has a well-defined raw result sum and a well-defined
 * handover, from whichever season actually carried `cashAtHandover`.
 */
export const rawResultVsBudget = (rows: readonly ControlSeasonRow[]): ReinvestmentRow[] => {
  const byCareer = groupBy(rows, careerKey);
  const perCareer = [...byCareer.values()].map((seasons) => {
    const first = at(seasons, 0, "first season of a career");
    const clubId = first.clubId;
    const rawResultSum = sumBy(seasons, (row) => row.actualBalanceWithoutTransfersAndCups);
    const handover = seasons.find((row) => row.cashAtHandover !== null);
    if (handover === undefined) {
      throw new Error(`career ${careerKey(first)} has no handover season`);
    }
    const budgetChange = (handover.cashAtHandover as number) - handover.initialBudget;
    const transferSum = sumBy(seasons, (row) =>
      transferBudgetChange(row.actualBalanceWithoutTransfersAndCups)
    );
    return { clubId, rawResultSum, budgetChange, rateResidual: budgetChange - transferSum };
  });
  const byClub = groupBy(perCareer, (career) => career.clubId);
  return [...byClub.entries()]
    .map(([clubId, careers]) => ({
      clubId,
      medianRawResultSum: median(careers.map((career) => career.rawResultSum)),
      medianBudgetChange: median(careers.map((career) => career.budgetChange)),
      medianRateResidual: median(careers.map((career) => career.rateResidual)),
    }))
    .sort((a, b) => a.clubId.localeCompare(b.clubId));
};

// --------------------------------------------------------------------------
// Section 7: titles by advantage quartile
// --------------------------------------------------------------------------

/** The subset of a `--dump-raw` career row this section needs. */
export type RawTitleRow = {
  clubId: string;
  tytul: string;
};

export type QuartileRow = {
  label: string;
  clubIds: string[];
  /** Careers pooled over all 15 policies for this quartile's clubs - the
   * denominator titleShares divides by. */
  careers: number;
  titles: Record<string, number>;
  /** titles as fractions of careers, so a Q1-Q2/Q3-Q4 group-size difference
   * does not read as a difference in the underlying rate. Empty when
   * careers is 0, never a share divided by zero. */
  titleShares: Record<string, number>;
};

/** Group sizes for the eighteen clubs, lowest advantageScore first: 5, 5, 4,
 * 4 rather than four equal groups of 4.5, since eighteen does not divide by
 * four. */
const QUARTILE_SIZES: readonly number[] = [5, 5, 4, 4];

const QUARTILE_LABELS: readonly string[] = [
  "Q1 (najniższy advantageScore)",
  "Q2",
  "Q3",
  "Q4 (najwyższy advantageScore)",
];

/**
 * Splits all eighteen starting clubs into four groups by `advantageScoreFor`
 * (lowest first) and reports each group's title distribution across every
 * policy in `raw`. The grouping itself never depends on `raw`: it always
 * covers all eighteen clubs, so an empty or partial career dump still
 * produces the four groups, each with a title distribution of zero
 * observations rather than a missing group.
 */
export const titlesByAdvantageQuartile = (raw: readonly RawTitleRow[]): QuartileRow[] => {
  const ranked = CLUBS.map((club) => ({
    clubId: club.clubId,
    advantageScore: advantageScoreFor(club.clubId),
  })).sort((a, b) => a.advantageScore - b.advantageScore);
  if (ranked.length !== 18) {
    throw new Error(`expected eighteen starting clubs, got ${ranked.length}`);
  }

  const groups: string[][] = [];
  let offset = 0;
  for (const size of QUARTILE_SIZES) {
    groups.push(ranked.slice(offset, offset + size).map((entry) => entry.clubId));
    offset += size;
  }

  return groups.map((clubIds, index) => {
    const clubSet = new Set(clubIds);
    const groupRows = raw.filter((row) => clubSet.has(row.clubId));
    const careers = groupRows.length;
    const titles = distribution(groupRows.map((row) => row.tytul));
    const titleShares =
      careers > 0
        ? Object.fromEntries(
            Object.entries(titles).map(([title, count]) => [title, count / careers])
          )
        : {};
    return {
      label: at(QUARTILE_LABELS, index, "quartile label"),
      clubIds,
      careers,
      titles,
      titleShares,
    };
  });
};
