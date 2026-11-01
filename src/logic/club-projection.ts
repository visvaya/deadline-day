import { CLUBS, ratingForClubId } from "../data/clubs";
import { initialEuropeanBerth } from "../data/european-berths-2026";
import { KOSZTY_STALE, leaguePositionPrize } from "../data/balance";
import { europeanExpectedIncome } from "./european-cups";
import { scaledRecurringRevenue, transferBudgetChange } from "./finance-scale";
import { clubOvr } from "./league-ratings";
import { expectedSquadPayroll } from "./squad-cost";
import { initialClubProjection } from "./league-projection";
import { structuralPurchasingPower } from "./opening-budget";
import { at } from "./invariant";

/**
 * The financial half of the career baseline and the internal advantage score
 * that combines it with the sporting one.
 *
 * Every equation here reads only the pre-transfer, pre-season state of a
 * club: its rating snapshot, its recurring revenue and the placement money
 * its projected finish would earn. Nothing here reads a real squad, a real
 * transfer or Europe - a career baseline is frozen before any of those exist.
 */

/** Revenue a club's projected season would show: recurring revenue plus the
 * placement prize for its projected finish. Not exported - both
 * `projectedSeasonBalance` and `projectedWageShare` need it and neither
 * should recompute the other's business. */
const projectedSeasonRevenue = (clubId: string): number =>
  scaledRecurringRevenue(clubId) + leaguePositionPrize(initialClubProjection(clubId).expectedPlace);

/**
 * The club's projected pre-transfer, pre-cup operating balance for the
 * season: revenue minus the generator's expected squad payroll minus fixed
 * costs.
 *
 * This is deliberately the same "operating balance without transfers and
 * cups" quantity `structuralPurchasingPower` expects as its raw input -
 * Europe and transfers must not enter either equation.
 */
export const projectedSeasonBalance = (clubId: string): number =>
  projectedSeasonRevenue(clubId) - expectedSquadPayroll(ratingForClubId(clubId)) - KOSZTY_STALE;

/** How much of that projected balance the board would pass on to the
 * transfer budget, at the active `BOARD_REINVESTMENT_RATE`. */
export const projectedTransferBudgetChange = (clubId: string): number =>
  transferBudgetChange(projectedSeasonBalance(clubId));

/**
 * A club-select-screen-only PRESENTATION quantity: `projectedTransferBudgetChange`
 * plus the board's share of the club's expected European cup income for its
 * season-1 berth. Zero for the thirteen clubs with no berth, so this equals
 * the cup-free figure for them.
 *
 * MUST NEVER feed `projectedSeasonBalance`, `structuralPurchasingPower`,
 * `advantageScoreFor` or either career handicap. Those four read only the
 * cup-free operating balance by design - the difficulty calibration and the golden master are built on
 * that basis, and folding cup money into it would silently recalibrate both.
 * This function exists precisely so the club-select screen can show a
 * cup-inclusive number WITHOUT that number ever reaching the handicap path -
 * it is display-only, one-directional, and has no other caller.
 *
 * The strength used to price the cup income is an APPROXIMATION:
 * `squadStrength` needs a real squad, which does not exist before a career
 * starts, so this reads `clubOvr(ratingForClubId(clubId))` instead - the same
 * rating-to-scalar step `leagueRatings`/`analyst-context.ts` already use for a
 * club's own strength before any squad-specific correction. The product
 * owner has accepted this approximation for a pre-season display figure.
 *
 * `BOARD_REINVESTMENT_RATE` is applied exactly once, via `transferBudgetChange`
 * - the same helper `projectedTransferBudgetChange` uses - never twice.
 */
export const projectedTransferBudgetChangeWithCups = (clubId: string): number => {
  const berth = initialEuropeanBerth(clubId);
  if (!berth) return projectedTransferBudgetChange(clubId);
  const strength = clubOvr(ratingForClubId(clubId));
  const cupIncome = europeanExpectedIncome(berth.cup, strength);
  return projectedTransferBudgetChange(clubId) + transferBudgetChange(cupIncome);
};

/** The generator's expected payroll as a share of the club's projected
 * season revenue. The historical `wageToRevenueRatio` from the finance
 * manifest is never an input here - this is what the game itself would pay,
 * not what the real club paid. */
export const projectedWageShare = (clubId: string): number =>
  expectedSquadPayroll(ratingForClubId(clubId)) / projectedSeasonRevenue(clubId);

/** Linear-interpolated quantile: sorted array, index `(n - 1) * p`,
 * interpolated between its floor and ceiling. Local per the repo's
 * convention - `opening-budget.ts` keeps its own copy for the same reason. */
const quantile = (sorted: readonly number[], p: number): number => {
  if (sorted.length === 0) throw new Error("quantile of an empty sample");
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`quantile: p out of range: ${p}`);
  const position = (sorted.length - 1) * p;
  const loIndex = Math.floor(position);
  const hiIndex = Math.ceil(position);
  const lo = at(sorted, loIndex, "quantile lower bound");
  const hi = at(sorted, hiIndex, "quantile upper bound");
  return loIndex === hiIndex ? lo : lo + (position - loIndex) * (hi - lo);
};

/** Median and interquartile range of one sample, computed once. A zero IQR
 * (every club tied) makes the z-score component zero rather than dividing by
 * zero - `advantageScoreFor` reads `iqr` for exactly that check. */
const medianAndIqr = (
  values: readonly number[]
): { readonly median: number; readonly iqr: number } => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: quantile(sorted, 0.5),
    iqr: quantile(sorted, 0.75) - quantile(sorted, 0.25),
  };
};

/**
 * The two raw samples `advantageScoreFor` z-scores against, built once at
 * module init over all eighteen clubs - the same reasoning
 * `league-projection.ts` uses for its table: a z-score needs the whole
 * league's distribution, so it is computed once rather than per lookup.
 */
const CLUB_IDS: readonly string[] = CLUBS.map((club) => club.clubId);

const SPORT_POINTS: readonly number[] = CLUB_IDS.map(
  (clubId) => initialClubProjection(clubId).expectedSeasonPoints
);

const structuralPurchasingPowerFor = (clubId: string): number =>
  structuralPurchasingPower({
    clubId,
    projectedOperatingBalanceWithoutTransfersAndCups: projectedSeasonBalance(clubId),
  });

const PURCHASING_POWERS: readonly number[] = CLUB_IDS.map((clubId) =>
  structuralPurchasingPowerFor(clubId)
);

const SPORT_STATS = medianAndIqr(SPORT_POINTS);
const FINANCE_STATS = medianAndIqr(PURCHASING_POWERS);

/**
 * The internal advantage score a club's career starts with: how many of a
 * point's worth of sporting strength it has, plus how many of a euro's worth
 * of structural purchasing power - each expressed as a z-score against the
 * other seventeen clubs, so the two very different units can be added.
 *
 * `structuralPurchasingPower` (not `openingBudget`) is deliberate: the full
 * opening budget is a maximum that includes a playability floor and the cost
 * of a useful upgrade, and the second of those is a function of the club's
 * own squad quality. Reading it here would count squad quality twice, once
 * through the sporting z-score and once through the financial one.
 */
export const advantageScoreFor = (clubId: string): number => {
  const points = initialClubProjection(clubId).expectedSeasonPoints;
  const purchasingPower = structuralPurchasingPowerFor(clubId);
  const sportZ = SPORT_STATS.iqr === 0 ? 0 : (points - SPORT_STATS.median) / SPORT_STATS.iqr;
  const financeZ =
    FINANCE_STATS.iqr === 0 ? 0 : (purchasingPower - FINANCE_STATS.median) / FINANCE_STATS.iqr;
  return sportZ + financeZ;
};
