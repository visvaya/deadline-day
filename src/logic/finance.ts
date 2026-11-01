import type { EuropeanCup, Formation, LeagueMembership, Player } from "../data/types";
import { KOSZTY_STALE, MAX_BUDGET_SHARE, leaguePositionPrize } from "../data/balance";
import { scaledRecurringRevenue, transferBudgetChange } from "./finance-scale";
import { openingBudget } from "./opening-budget";
import { europeanExpectedIncome } from "./european-cups";
import { totalPayroll } from "./wages";
import { squadStrength } from "./squad";
import { expectedPlace } from "./expected-points";
import { leagueRatings } from "./league-ratings";
import { mapAt } from "./invariant";

/**
 * The club's side of the money: what it earns, what it may start with, and
 * what the HUD forecasts it will end the season on.
 *
 * One function computes a season's revenue and every consumer - the
 * settlement, the epilogue, the forecast and the market screen - reads it.
 * The prototype had the same `2.0 + (19 - place) * 0.22` copy-pasted into
 * three of those, which gave Legia and the bottom club an identical base
 * against real revenues that differ by a factor of fifteen.
 */

/**
 * Re-exported rather than defined here since 2026-09-12: both definitions
 * moved to `finance-scale.ts` so the opening-budget adapter can read them
 * without importing this module, which by then imports the adapter. Same
 * functions, same values, one source.
 */
export { scaledRecurringRevenue, transferBudgetChange };

/**
 * Everything a season pays in, in one place.
 *
 * The three one-off prizes arrive already credited - or already withheld
 * under `finance-control` - so this function never has to know about the
 * measurement mode. Only the recurring base and the placement ladder are
 * unconditional, because those are the two the control is measuring against.
 */
export const calculateSeasonRevenue = (input: {
  readonly clubId: string;
  readonly place: number;
  readonly europeanPrize: number;
  readonly polishCupPrize: number;
  readonly superCupPrize: number;
}): number =>
  scaledRecurringRevenue(input.clubId) +
  leaguePositionPrize(input.place) +
  input.europeanPrize +
  input.polishCupPrize +
  input.superCupPrize;

/**
 * The two quantities the HUD's forecast is allowed to assume, frozen at the
 * start of a season and not touched again until the next one.
 *
 * Freezing is what makes the forecast readable: with these fixed, a transfer
 * moves the number by exactly minus the change in the whole payroll and by
 * nothing else. An earlier version recomputed the European campaign from the
 * current squad, which broke the rule in both directions - buying a star
 * raised the forecast UEFA prize, writing in revenue nobody had earned yet.
 *
 * The settlement stays live: the real campaign and the real placement money
 * are resolved from what actually happened.
 */
export type SeasonForecast = {
  readonly expectedPlace: number;
  readonly europeanIncome: number;
};

export const freezeSeasonForecast = (input: {
  readonly squad: readonly Player[];
  readonly cup: EuropeanCup | null;
  readonly clubShortName: string;
  readonly formation: Formation;
  readonly membership: LeagueMembership;
}): SeasonForecast => {
  const ratings = leagueRatings(
    input.squad,
    input.cup,
    input.clubShortName,
    input.formation,
    input.membership
  );
  const own = mapAt(ratings, input.clubShortName, "own rating");
  const place = expectedPlace(
    own,
    [...ratings.values()].filter((rating) => rating !== own)
  );
  const strength = squadStrength(input.squad, input.cup, input.formation);
  return {
    expectedPlace: place,
    europeanIncome: input.cup ? europeanExpectedIncome(input.cup, strength) : 0,
  };
};

/**
 * The forecast balance the HUD shows: the frozen income side, minus the
 * payroll as it stands right now, minus the fixed costs.
 *
 * No sporting projection happens here. Reading the frozen fields rather than
 * recomputing them is the whole contract, so this function takes them as
 * data and cannot be made to re-forecast by accident.
 */
export const annualForecast = (input: {
  readonly clubId: string;
  readonly squad: readonly Player[];
  readonly forecast: SeasonForecast;
}): number =>
  scaledRecurringRevenue(input.clubId) +
  leaguePositionPrize(input.forecast.expectedPlace) +
  input.forecast.europeanIncome -
  (totalPayroll(input.squad) + KOSZTY_STALE);

/**
 * The same forecast, split into the two numbers the player needs.
 *
 * `operatingBalance` is exactly `annualForecast` - the club's projected
 * result - and `transferBudgetChange` is the part of it the board passes on.
 * Two fields rather than one because they answer different questions: the
 * first is how the club is doing, the second is what the player's working
 * budget will do. Showing only the first would promise money that never
 * arrives; showing only the second would hide a club heading for trouble.
 */
export const annualForecastBreakdown = (input: {
  readonly clubId: string;
  readonly squad: readonly Player[];
  readonly forecast: SeasonForecast;
}): { readonly operatingBalance: number; readonly transferBudgetChange: number } => {
  const operatingBalance = annualForecast(input);
  return { operatingBalance, transferBudgetChange: transferBudgetChange(operatingBalance) };
};

/**
 * What the club hands the player on day one - an ALIAS for `openingBudget`
 * since the activation of 2026-09-12, kept so scripts and historical tests
 * that ask for this name still get the one live answer.
 *
 * There is no second body here on purpose. The rule moved to
 * `opening-budget.ts`, where the four components of the maximum can be named
 * separately, and leaving an old arithmetic behind under this name would have
 * meant two budgets and no way to tell which one the game handed out.
 */
export const initialClubBudget = (clubId: string): number => openingBudget(clubId);

/** The ceiling `MAX_BUDGET_SHARE` puts on an ordinary club, exported so the
 * test asks the question against the constant rather than restating it. */
export const maxOrdinaryBudget = (clubId: string): number =>
  scaledRecurringRevenue(clubId) * MAX_BUDGET_SHARE;
