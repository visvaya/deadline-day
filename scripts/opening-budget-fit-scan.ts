import { LEGACY_KASA, MIN_INITIAL_BUDGET, VERDICT_KASA } from "../src/data/balance";
import { ACCEPTED_DUMP_SCHEMA_VERSIONS, CUP_INCOME_SCHEMA_VERSION } from "./balance-metrics";
import { parseCsvLine } from "./csv";
import type { SeasonRow } from "./finance-activation-report-core";
import {
  FIT_CLUB_IDS,
  backerSupportFloorFor,
  backerSupportTier,
  bindingComponents,
  clubOpeningBudget,
  shortNameForClubId,
  type BackerSupportTier,
  type ClubOpeningBudget,
  type OpeningBudgetCandidate,
} from "./opening-budget-fit-core";
import { NO_DRAW_VERDICT } from "./rng-control-snapshot";
import { median, quantile } from "./stats";
import { at, recordAt } from "../src/logic/invariant";

/**
 * The scan behind `pnpm fit:opening-budget`: the grid, the paired reading of
 * two dumps, the per-club arithmetic and the Pareto front.
 *
 * Separated from the CLI so every step is checkable on rows built by hand.
 * Nothing here re-simulates: the reinvestment estimate is reconstructed from
 * seasons the engine actually played, and is labelled as an estimate because
 * an active policy's transfers would have depended on the very cash the
 * candidate rule changes.
 */

/** The number of seasons a tenure runs when nothing cuts it short. */
export const FULL_TENURE_SEASONS = 5;
const REQUIRED_POLICY = "alwaysPass";

/** How many bound clubs make the playability floor the rule rather than the
 * exception. Ten of eighteen is a majority; nine is still half. */
export const MAX_FLOOR_BOUND_CLUBS = 9;

const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  // Counted rather than accumulated: repeated addition of 0.01 drifts, and a
  // grid whose points are 0.22000000000000003 is a grid nobody can pin.
  const steps = Math.round((to - from) / step);
  for (let i = 0; i <= steps; i += 1) out.push(Number((from + i * step).toFixed(10)));
  return out;
};

export const BUDGET_SHARES = range(0.18, 0.3, 0.01);
export const USEFUL_UPGRADE_DELTAS = [0, 1, 2] as const;
/** 0.20..0.80 in twentieths, plus a control point at 1.00: passing the whole
 * operating balance back is not a candidate anyone proposed, but it bounds
 * what the rate can do at all. */
export const BOARD_REINVESTMENT_RATES = [...range(0.2, 0.8, 0.05), 1];
export const STRONG_BACKER_PERCENTILES = [0.9, 0.95] as const;
export const ACTIVE_BACKER_PERCENTILES = [0.75, 0.8] as const;

/** The full product of the five axes, in a stable order: the report and the
 * JSON must list variants the same way on every run. */
export const buildGrid = (): OpeningBudgetCandidate[] => {
  const out: OpeningBudgetCandidate[] = [];
  for (const budgetShare of BUDGET_SHARES) {
    for (const usefulUpgradeOvrDelta of USEFUL_UPGRADE_DELTAS) {
      for (const boardReinvestmentRate of BOARD_REINVESTMENT_RATES) {
        for (const strongBackerPercentile of STRONG_BACKER_PERCENTILES) {
          for (const activeBackerPercentile of ACTIVE_BACKER_PERCENTILES) {
            out.push({
              budgetShare,
              usefulUpgradeOvrDelta,
              boardReinvestmentRate,
              strongBackerPercentile,
              activeBackerPercentile,
            });
          }
        }
      }
    }
  }
  return out;
};

/** A stable, human-readable identity for one grid point. */
export const candidateKey = (c: OpeningBudgetCandidate): string =>
  [
    `share=${c.budgetShare.toFixed(2)}`,
    `delta=${c.usefulUpgradeOvrDelta}`,
    `rate=${c.boardReinvestmentRate.toFixed(2)}`,
    `strong=${c.strongBackerPercentile.toFixed(2)}`,
    `active=${c.activeBackerPercentile.toFixed(2)}`,
  ].join(" ");

// ---------------------------------------------------------------------------
// Reading the raw career dump
// ---------------------------------------------------------------------------

/** The little of the raw career dump this scan needs: enough to prove the two
 * runs are the same careers, and nothing more. */
export type CareerRow = {
  readonly clubShortName: string;
  readonly policyName: string;
  readonly seed: number;
  readonly incomeMode: string;
  readonly seasonsPlayed: number;
  /** The career's FINAL tally: after the verdict and the whole epilogue. */
  readonly rngDrawCount: number;
  readonly verdict: string;
};

const RAW_COLUMNS = [
  "polityka",
  "seed",
  "clubShortName",
  "incomeMode",
  "dumpSchemaVersion",
  "sezonyRozegrane",
  "rngDrawCount",
  "werdykt",
] as const;

export const parseCareerDump = (
  csv: string,
  expected: { readonly incomeMode: string }
): CareerRow[] => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) throw new Error("career dump is empty: no header row");
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  for (const column of RAW_COLUMNS) {
    if (!header.includes(column)) throw new Error(`career dump is missing the "${column}" column`);
  }
  const rows: CareerRow[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(at(lines, i, "CSV line"));
    const cell = (column: string): string => fields[header.indexOf(column)] ?? "";
    const schema = Number(cell("dumpSchemaVersion"));
    if (!ACCEPTED_DUMP_SCHEMA_VERSIONS.includes(schema)) {
      throw new Error(
        `career row ${i}: dump schema ${schema} is not one of ${ACCEPTED_DUMP_SCHEMA_VERSIONS.join(", ")}`
      );
    }
    if (cell("incomeMode") !== expected.incomeMode) {
      throw new Error(
        `career row ${i}: incomeMode "${cell("incomeMode")}" is not "${expected.incomeMode}"`
      );
    }
    const row: CareerRow = {
      clubShortName: cell("clubShortName"),
      policyName: cell("polityka"),
      seed: Number(cell("seed")),
      incomeMode: cell("incomeMode"),
      seasonsPlayed: Number(cell("sezonyRozegrane")),
      rngDrawCount: Number(cell("rngDrawCount")),
      verdict: cell("werdykt"),
    };
    if (row.clubShortName === "" || row.policyName === "") {
      throw new Error(`career row ${i}: missing club or policy`);
    }
    if (row.verdict === "") throw new Error(`career row ${i}: missing verdict`);
    if (!Number.isSafeInteger(row.seasonsPlayed) || row.seasonsPlayed <= 0) {
      throw new Error(
        `career row ${i}: sezonyRozegrane "${cell("sezonyRozegrane")}" is not a count`
      );
    }
    if (!Number.isSafeInteger(row.rngDrawCount) || row.rngDrawCount <= 0) {
      throw new Error(`career row ${i}: rngDrawCount "${cell("rngDrawCount")}" is not a count`);
    }
    const key = `${row.clubShortName}\0${row.policyName}\0${row.seed}`;
    if (seen.has(key)) throw new Error(`career row ${i}: duplicate career`);
    seen.add(key);
    rows.push(row);
  }
  if (rows.length === 0) throw new Error("career dump has no rows");
  return rows;
};

// ---------------------------------------------------------------------------
// Input identity
// ---------------------------------------------------------------------------

export const careerKey = (row: {
  clubShortName: string;
  policyName: string;
  seed: number;
}): string => `${row.clubShortName}\0${row.policyName}\0${row.seed}`;

const seasonKey = (row: SeasonRow): string => `${careerKey(row)}\0${row.season}`;

/**
 * How the two runs' RNG streams compare, once the pairing has been checked.
 *
 * Reported rather than merely asserted, because the one legal difference is
 * itself a measurement the reader has to see: the size of the set tells them
 * how far the controlled and the normal economy part company, and where.
 */
export type RngPairing = {
  /** Careers whose final tally differs. Legal only where the verdict crossed
   * the branch that draws nothing. */
  readonly finalTallyDiffers: number;
  /** Careers that crossed that branch, whether or not the totals ended up
   * differing - the epilogue cascade can happen to cancel the one draw. */
  readonly verdictBoundaryCrossed: number;
  readonly totalCareers: number;
};

/**
 * Everything that must hold before a single candidate is priced.
 *
 * Each check is a way the report would still look finished while measuring
 * something else: a dump from a different engine, a club missing from one
 * run, a career whose two versions drifted apart, a cup column silently
 * absent. Each throws with the club and seed that broke it.
 *
 * The RNG rule is the subtle one, and it is deliberately asymmetric about
 * WHEN a difference occurs.
 *
 * A controlled run and a normal run cannot be required to consume identical
 * draws end to end. `computeVerdict` reads the club's cash, the control
 * credits no cup money, and one of the verdict's four branches
 * (`ROZWIĄZANIE KONTRAKTU`) returns before touching the generator while the
 * other three each draw once - so a career that crosses that boundary legally
 * diverges, and the epilogue then cascades the single draw into thousands.
 *
 * What may NOT differ is anything at or before the last season. Every figure
 * this fit reads - the operating balances, the cup receipts, the number of
 * seasons - comes from the tenure, so a per-season tally that moved would mean
 * the two runs played different football, and no aggregate below would mean
 * anything. Hence: identical `rngDrawCount` after every season, identical
 * final tally EXCEPT where the verdict crossed the no-draw branch, and a count
 * of those careers in the report.
 */
export const assertPairedInputs = (input: {
  readonly controlSeasons: readonly SeasonRow[];
  readonly activeSeasons: readonly SeasonRow[];
  readonly controlCareers: readonly CareerRow[];
  readonly activeCareers: readonly CareerRow[];
}): RngPairing => {
  for (const [name, rows] of [
    ["control seasons", input.controlSeasons],
    ["active seasons", input.activeSeasons],
  ] as const) {
    const wrong = rows.find((row) => row.policyName !== REQUIRED_POLICY);
    if (wrong !== undefined) {
      throw new Error(
        `${name}: policy "${wrong.policyName}" is not ${REQUIRED_POLICY}; the fit only measures the passive policy`
      );
    }
  }
  for (const [name, rows] of [
    ["control careers", input.controlCareers],
    ["active careers", input.activeCareers],
  ] as const) {
    const wrong = rows.find((row) => row.policyName !== REQUIRED_POLICY);
    if (wrong !== undefined) {
      throw new Error(
        `${name}: policy "${wrong.policyName}" is not ${REQUIRED_POLICY}; the fit only measures the passive policy`
      );
    }
  }

  const clubsOf = (rows: readonly { clubShortName: string }[]): Set<string> =>
    new Set(rows.map((row) => row.clubShortName));
  const expectedClubs = new Set(FIT_CLUB_IDS.map(shortNameForClubId));
  for (const [name, rows] of [
    ["control seasons", input.controlSeasons],
    ["active seasons", input.activeSeasons],
    ["control careers", input.controlCareers],
    ["active careers", input.activeCareers],
  ] as const) {
    const seen = clubsOf(rows);
    for (const club of expectedClubs) {
      if (!seen.has(club)) throw new Error(`${name}: no rows for club "${club}"`);
    }
    for (const club of seen) {
      if (!expectedClubs.has(club)) throw new Error(`${name}: unexpected club "${club}"`);
    }
  }

  const controlByKey = new Map(input.controlSeasons.map((row) => [seasonKey(row), row]));
  const activeByKey = new Map(input.activeSeasons.map((row) => [seasonKey(row), row]));
  if (controlByKey.size !== activeByKey.size) {
    throw new Error(
      `the two season dumps cover different seasons: ${controlByKey.size} controlled, ${activeByKey.size} active`
    );
  }
  for (const [key, control] of controlByKey) {
    const active = activeByKey.get(key);
    if (active === undefined) {
      throw new Error(`no active season paired with control ${key.replace(/\0/g, "/")}`);
    }
    if (control.engineVersion !== active.engineVersion) {
      throw new Error(
        `${key.replace(/\0/g, "/")}: engineVersion differs (${control.engineVersion} vs ${active.engineVersion})`
      );
    }
    // The ONLY financial difference the two economies may show is credited
    // cup money (and cash derived from it). Comparing each source column, not
    // just the net, prevents two compensating errors from looking identical.
    for (const field of [
      "initialBudget",
      "preseasonForecastBalanceWithoutTransfersAndCups",
      "actualBalanceWithoutTransfersAndCups",
      "scaledRecurringRevenue",
      "leaguePositionPrize",
      "totalPayroll",
      "fixedCosts",
      "scalableNetPln",
    ] as const) {
      if (Math.abs(control[field] - active[field]) > 1e-9) {
        throw new Error(
          `${key.replace(/\0/g, "/")}: the paired seasons disagree on ${field} (${control[field]} vs ${active[field]})`
        );
      }
    }
    if (active.creditedCupIncome === null) {
      throw new Error(
        `${key.replace(/\0/g, "/")}: the active dump carries no creditedCupIncome; re-run the simulator`
      );
    }
    if (control.creditedCupIncome !== null && control.creditedCupIncome !== 0) {
      throw new Error(
        `${key.replace(/\0/g, "/")}: the controlled run credited ${control.creditedCupIncome} in cup money`
      );
    }
    // The tenure's own draw tally, season by season. This is the check the
    // final-tally comparison cannot make: a divergence inside the tenure and
    // one caused by the verdict look identical in the career row.
    if (control.rngDrawCount === null || active.rngDrawCount === null) {
      throw new Error(
        `${key.replace(/\0/g, "/")}: a season carries no rngDrawCount; re-run the simulator on schema ${CUP_INCOME_SCHEMA_VERSION}`
      );
    }
    if (control.rngDrawCount !== active.rngDrawCount) {
      throw new Error(
        `${key.replace(/\0/g, "/")}: the paired seasons consumed ${control.rngDrawCount} and ${active.rngDrawCount} draws. ` +
          `A difference BEFORE the verdict means the two runs played different football, and no aggregate below would mean anything.`
      );
    }
  }

  let finalTallyDiffers = 0;
  let verdictBoundaryCrossed = 0;
  const controlCareers = new Map(input.controlCareers.map((row) => [careerKey(row), row]));
  const activeCareers = new Map(input.activeCareers.map((row) => [careerKey(row), row]));
  if (controlCareers.size !== activeCareers.size) {
    throw new Error(
      `the two career dumps cover different careers: ${controlCareers.size} controlled, ${activeCareers.size} active`
    );
  }

  const assertDeclaredSeasonCounts = (
    label: string,
    seasons: readonly SeasonRow[],
    careers: ReadonlyMap<string, CareerRow>
  ): void => {
    const counts = new Map<string, number>();
    for (const season of seasons) {
      const key = careerKey(season);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const [key, career] of careers) {
      const count = counts.get(key) ?? 0;
      if (count !== career.seasonsPlayed) {
        throw new Error(
          `${label} ${key.replace(/\0/g, "/")} declares ${career.seasonsPlayed} seasons but the season dump has ${count}`
        );
      }
      counts.delete(key);
    }
    const extra = counts.keys().next().value;
    if (extra !== undefined) {
      throw new Error(
        `${label}: season dump has no matching raw career for ${extra.replace(/\0/g, "/")}`
      );
    }
  };
  assertDeclaredSeasonCounts("control career", input.controlSeasons, controlCareers);
  assertDeclaredSeasonCounts("active career", input.activeSeasons, activeCareers);

  for (const [key, control] of controlCareers) {
    const active = activeCareers.get(key);
    if (active === undefined) {
      throw new Error(`no active career paired with control ${key.replace(/\0/g, "/")}`);
    }
    if (control.seasonsPlayed !== active.seasonsPlayed) {
      throw new Error(
        `${key.replace(/\0/g, "/")}: the paired careers played ${control.seasonsPlayed} and ${active.seasonsPlayed} seasons`
      );
    }
    const crossed = (control.verdict === NO_DRAW_VERDICT) !== (active.verdict === NO_DRAW_VERDICT);
    if (crossed) verdictBoundaryCrossed += 1;
    if (control.rngDrawCount !== active.rngDrawCount) {
      finalTallyDiffers += 1;
      // The only legal explanation. Every season tally already matched above,
      // so the difference arose after the last season; the verdict is the only
      // thing between there and the epilogue whose branch count depends on
      // cash, and only the crossing of the no-draw branch changes it.
      if (!crossed) {
        throw new Error(
          `${key.replace(/\0/g, "/")}: the paired careers consumed ${control.rngDrawCount} and ${active.rngDrawCount} draws, ` +
            `yet neither crossed the "${NO_DRAW_VERDICT}" verdict branch (${control.verdict} vs ${active.verdict}). ` +
            `The difference is unattributed and blocks the report.`
        );
      }
    }
  }

  return {
    finalTallyDiffers,
    verdictBoundaryCrossed,
    totalCareers: controlCareers.size,
  };
};

/**
 * The drift control: the median operating balance per club, as the controlled
 * run reports it now, against the figure pinned in the 2026-09-10 activation
 * summary.
 *
 * Byte-comparing the dumps would fail on `engineVersion` alone, which has been
 * raised since without touching this mechanic. Comparing the quantity the
 * report was built on catches real drift and tolerates the label moving.
 */
export type DriftRow = {
  readonly clubShortName: string;
  readonly measured: number;
  readonly pinned: number;
  readonly difference: number;
};

export const medianSeasonBalanceDrift = (
  controlSeasons: readonly SeasonRow[],
  pinned: readonly { clubShortName: string; medianSeasonBalance: number }[]
): DriftRow[] => {
  const byClub = new Map<string, number[]>();
  for (const row of controlSeasons) {
    const list = byClub.get(row.clubShortName);
    if (list) list.push(row.actualBalanceWithoutTransfersAndCups);
    else byClub.set(row.clubShortName, [row.actualBalanceWithoutTransfersAndCups]);
  }
  return pinned.map((entry) => {
    const values = byClub.get(entry.clubShortName);
    if (values === undefined)
      throw new Error(`drift: no controlled rows for "${entry.clubShortName}"`);
    const measured = median(values);
    return {
      clubShortName: entry.clubShortName,
      measured,
      pinned: entry.medianSeasonBalance,
      difference: measured - entry.medianSeasonBalance,
    };
  });
};

// ---------------------------------------------------------------------------
// Per-career reinvestment
// ---------------------------------------------------------------------------

/** One career's real season income, in the order it was played. */
export type CareerIncome = {
  readonly clubShortName: string;
  readonly seed: number;
  readonly seasonsPlayed: number;
  readonly operatingBalances: readonly number[];
  readonly cupIncomes: readonly number[];
  /** `actualBalanceWithoutTransfersAndCups + creditedCupIncome`, season by
   * season. Cups included, because after schema 4 they are measured. */
  readonly seasonIncome: readonly number[];
};

export const careerIncomes = (activeSeasons: readonly SeasonRow[]): CareerIncome[] => {
  const byCareer = new Map<string, SeasonRow[]>();
  for (const row of activeSeasons) {
    const key = careerKey(row);
    const list = byCareer.get(key);
    if (list) list.push(row);
    else byCareer.set(key, [row]);
  }
  const out: CareerIncome[] = [];
  for (const rows of byCareer.values()) {
    const ordered = [...rows].sort((a, b) => a.season - b.season);
    for (const [i, row] of ordered.entries()) {
      if (row.season !== i + 1) {
        throw new Error(
          `${row.clubShortName}/${row.seed}: seasons are not 1..n (saw ${row.season} at position ${i + 1})`
        );
      }
      if (row.creditedCupIncome === null) {
        throw new Error(
          `${row.clubShortName}/${row.seed}: season ${row.season} has no creditedCupIncome`
        );
      }
    }
    const first = at(ordered, 0, "first season of a career");
    out.push({
      clubShortName: first.clubShortName,
      seed: first.seed,
      seasonsPlayed: ordered.length,
      operatingBalances: ordered.map((row) => row.actualBalanceWithoutTransfersAndCups),
      cupIncomes: ordered.map((row) => row.creditedCupIncome ?? 0),
      seasonIncome: ordered.map(
        (row) => row.actualBalanceWithoutTransfersAndCups + (row.creditedCupIncome ?? 0)
      ),
    });
  }
  return out;
};

/**
 * The post-hoc cash of one career under a candidate rule.
 *
 * `budget + rate * sum(income[1..n])`, with the real income of the seasons
 * that were actually played. This is a PASSIVE ALWAYS-PASS ESTIMATE and
 * nothing more: an active policy's transfers would have depended on the cash
 * the candidate changes, so the counterfactual squad is not reconstructible
 * from a dump and is not pretended to be.
 */
export const candidateCash = (
  career: CareerIncome,
  initialBudget: number,
  rate: number,
  seasons: number
): number => {
  if (seasons > career.seasonsPlayed) {
    throw new Error(
      `${career.clubShortName}/${career.seed} played ${career.seasonsPlayed} seasons, not ${seasons}`
    );
  }
  let total = initialBudget;
  for (let i = 0; i < seasons; i += 1) total += rate * at(career.seasonIncome, i, "season income");
  return total;
};

// ---------------------------------------------------------------------------
// One candidate, all eighteen clubs
// ---------------------------------------------------------------------------

export type ClubVariantRow = ClubOpeningBudget & {
  readonly backerTier: BackerSupportTier;
  readonly binding: readonly string[];
  /** The budget the game hands out today, for the delta axis of the front. */
  readonly currentInitialBudget: number;
  readonly budgetShareOfRevenue: number;
  /** Medians over played seasons, kept separate so a cup windfall cannot
   * make a structurally loss-making club look healthy. */
  readonly medianOperatingBalance: number;
  readonly medianCupIncome: number;
  /** Median of operating balance plus cups, not the sum of the two medians. */
  readonly medianSeasonIncome: number;
  /** Cup evidence for the two horizons a starting berth materially affects. */
  readonly medianFirstSeasonCupIncome: number;
  readonly medianCareerCupIncome: number;
  readonly medianReinvestedCareerCupIncome: number;
  readonly projectedTransferBudgetChange: number;
  readonly medianCashAfterSeason1: number;
  /** Median over the club's FULL five-season careers only. */
  readonly medianCashAfterSeason5: number;
  readonly medianCashAtHandover: number;
  readonly fullTenureCareers: number;
};

export type VariantResult = {
  readonly candidate: OpeningBudgetCandidate;
  readonly key: string;
  readonly clubs: readonly ClubVariantRow[];
  readonly aggregate: VariantAggregate;
  readonly feasible: boolean;
  readonly infeasibleReasons: readonly string[];
};

export type VariantAggregate = {
  readonly boundByComponent: Readonly<Record<string, number>>;
  readonly minBudget: number;
  readonly medianBudget: number;
  readonly iqrBudget: number;
  readonly maxBudget: number;
  readonly maxOverMinBudget: number;
  readonly clubsCoveringUsefulCost: number;
  readonly clubsNegativeMedianCashAfterSeason1: number;
  readonly clubsNegativeMedianCashAfterSeason5: number;
  readonly clubsNegativeMedianCashAtHandover: number;
  readonly pooledP95CashAfterSeason5: number;
  readonly totalBudgetDeltaVsCurrent: number;
  /** A unit-scale proxy only: legacy scores cash after the epilogue, which
   * this five-season dump does not contain. */
  readonly handoverCashLegacyProxyPoints: number;
  readonly medianHandoverVerdictPoints: number;
  /** Clubs whose emergency floor still binds, named because the plan expects
   * this to be common and wants it stated rather than tuned away. */
  readonly floorBoundClubs: readonly string[];
};

export const evaluateCandidate = (input: {
  readonly candidate: OpeningBudgetCandidate;
  readonly incomes: readonly CareerIncome[];
  readonly currentInitialBudget: (_clubId: string) => number;
  readonly scaledRecurringRevenue: (_clubId: string) => number;
}): VariantResult => {
  const { candidate } = input;
  const byClub = new Map<string, CareerIncome[]>();
  for (const career of input.incomes) {
    const list = byClub.get(career.clubShortName);
    if (list) list.push(career);
    else byClub.set(career.clubShortName, [career]);
  }

  const clubs: ClubVariantRow[] = FIT_CLUB_IDS.map((clubId) => {
    const shortName = shortNameForClubId(clubId);
    const budget = clubOpeningBudget({
      clubId,
      candidate,
      backerSupportFloor: backerSupportFloorFor(clubId, candidate),
    });
    const careers = byClub.get(shortName);
    if (careers === undefined || careers.length === 0) {
      throw new Error(`no careers for club "${shortName}"`);
    }
    const full = careers.filter((career) => career.seasonsPlayed >= FULL_TENURE_SEASONS);
    if (full.length === 0) {
      // A club whose every career ended early cannot answer "what does the
      // manager hand over after five seasons", and a zero there would be an
      // answer rather than the absence of one.
      throw new Error(`club "${shortName}" has no five-season career; the input is incomplete`);
    }
    const rate = candidate.boardReinvestmentRate;
    const medianOperatingBalance = median(
      careers.flatMap((career) => [...career.operatingBalances])
    );
    const medianCupIncome = median(careers.flatMap((career) => [...career.cupIncomes]));
    const medianSeasonIncome = median(careers.flatMap((career) => [...career.seasonIncome]));
    const medianFirstSeasonCupIncome = median(
      careers.map((career) => at(career.cupIncomes, 0, "first-season cup income"))
    );
    const medianCareerCupIncome = median(
      careers.map((career) => career.cupIncomes.reduce((sum, value) => sum + value, 0))
    );
    return {
      ...budget,
      backerTier: backerSupportTier(clubId),
      binding: bindingComponents(budget),
      currentInitialBudget: input.currentInitialBudget(clubId),
      budgetShareOfRevenue: budget.initialBudget / input.scaledRecurringRevenue(clubId),
      medianOperatingBalance,
      medianCupIncome,
      medianSeasonIncome,
      medianFirstSeasonCupIncome,
      medianCareerCupIncome,
      medianReinvestedCareerCupIncome: medianCareerCupIncome * rate,
      projectedTransferBudgetChange: medianSeasonIncome * rate,
      medianCashAfterSeason1: median(
        careers.map((career) => candidateCash(career, budget.initialBudget, rate, 1))
      ),
      medianCashAfterSeason5: median(
        full.map((career) => candidateCash(career, budget.initialBudget, rate, FULL_TENURE_SEASONS))
      ),
      medianCashAtHandover: median(
        careers.map((career) =>
          candidateCash(career, budget.initialBudget, rate, career.seasonsPlayed)
        )
      ),
      fullTenureCareers: full.length,
    };
  });

  const budgets = clubs.map((club) => club.initialBudget);
  const boundByComponent: Record<string, number> = {
    absoluteFloor: 0,
    shareBudget: 0,
    usefulPurchaseCost: 0,
    backerSupportFloor: 0,
  };
  for (const club of clubs) {
    for (const name of club.binding) {
      boundByComponent[name] = recordAt(boundByComponent, name, "binding component") + 1;
    }
  }

  // A map rather than a linear find: this runs once per full career per
  // variant, which is eighteen thousand times two thousand.
  const budgetByClub = new Map(clubs.map((club) => [club.shortName, club.initialBudget]));
  const pooledFive = input.incomes
    .filter((career) => career.seasonsPlayed >= FULL_TENURE_SEASONS)
    .map((career) => {
      const budget = budgetByClub.get(career.clubShortName);
      if (budget === undefined) throw new Error(`no budget row for club "${career.clubShortName}"`);
      return candidateCash(career, budget, candidate.boardReinvestmentRate, FULL_TENURE_SEASONS);
    });

  const floorBoundClubs = clubs
    .filter((club) => club.binding.includes("absoluteFloor"))
    .map((club) => club.shortName);

  const aggregate: VariantAggregate = {
    boundByComponent,
    minBudget: Math.min(...budgets),
    medianBudget: median(budgets),
    iqrBudget: quantile(budgets, 0.75) - quantile(budgets, 0.25),
    maxBudget: Math.max(...budgets),
    maxOverMinBudget: Math.max(...budgets) / Math.min(...budgets),
    clubsCoveringUsefulCost: clubs.filter((club) => club.initialBudget >= club.usefulPurchaseCost)
      .length,
    clubsNegativeMedianCashAfterSeason1: clubs.filter((club) => club.medianCashAfterSeason1 < 0)
      .length,
    clubsNegativeMedianCashAfterSeason5: clubs.filter((club) => club.medianCashAfterSeason5 < 0)
      .length,
    clubsNegativeMedianCashAtHandover: clubs.filter((club) => club.medianCashAtHandover < 0).length,
    pooledP95CashAfterSeason5: quantile(pooledFive, 0.95),
    totalBudgetDeltaVsCurrent: clubs.reduce(
      (sum, club) => sum + (club.initialBudget - club.currentInitialBudget),
      0
    ),
    handoverCashLegacyProxyPoints:
      median(clubs.map((club) => club.medianCashAtHandover)) * LEGACY_KASA,
    medianHandoverVerdictPoints:
      median(clubs.map((club) => club.medianCashAtHandover)) * VERDICT_KASA,
    floorBoundClubs,
  };

  const infeasibleReasons: string[] = [];
  if (aggregate.clubsCoveringUsefulCost < FIT_CLUB_IDS.length) {
    infeasibleReasons.push(
      `only ${aggregate.clubsCoveringUsefulCost}/${FIT_CLUB_IDS.length} clubs cover a representative useful signing`
    );
  }
  const floorBound = recordAt(boundByComponent, "absoluteFloor", "binding component");
  if (floorBound > MAX_FLOOR_BOUND_CLUBS) {
    infeasibleReasons.push(
      `the playability floor binds at ${floorBound} clubs, more than ${MAX_FLOOR_BOUND_CLUBS}`
    );
  }
  for (const club of clubs) {
    if (!Number.isFinite(club.initialBudget) || club.initialBudget <= 0) {
      infeasibleReasons.push(`${club.shortName}: budget ${club.initialBudget} is not positive`);
    }
    if (club.initialBudget < MIN_INITIAL_BUDGET) {
      infeasibleReasons.push(`${club.shortName}: budget falls below the absolute floor`);
    }
  }

  return {
    candidate,
    key: candidateKey(candidate),
    clubs,
    aggregate,
    feasible: infeasibleReasons.length === 0,
    infeasibleReasons,
  };
};

// ---------------------------------------------------------------------------
// Pareto
// ---------------------------------------------------------------------------

/** The four exact axes, as the plan fixes them. Never folded into one weight:
 * a weighting would be the product owner's decision, and this report exists
 * precisely to hand that decision over undecided. */
export const paretoObjectives = (
  variant: VariantResult
): { readonly value: number; readonly minimise: boolean }[] => [
  { value: variant.aggregate.totalBudgetDeltaVsCurrent, minimise: true },
  { value: variant.aggregate.clubsNegativeMedianCashAfterSeason5, minimise: true },
  { value: variant.aggregate.pooledP95CashAfterSeason5, minimise: true },
  { value: variant.aggregate.iqrBudget, minimise: false },
];

const dominates = (a: VariantResult, b: VariantResult): boolean => {
  const av = paretoObjectives(a);
  const bv = paretoObjectives(b);
  let strictlyBetter = false;
  for (const [i, objective] of av.entries()) {
    const other = at(bv, i, "Pareto objective").value;
    const better = objective.minimise ? objective.value < other : objective.value > other;
    const worse = objective.minimise ? objective.value > other : objective.value < other;
    if (worse) return false;
    if (better) strictlyBetter = true;
  }
  return strictlyBetter;
};

/** The non-dominated set, in the grid's own order. */
export const paretoFront = (variants: readonly VariantResult[]): VariantResult[] =>
  variants.filter((candidate) => !variants.some((other) => dominates(other, candidate)));
