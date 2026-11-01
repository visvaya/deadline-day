import { INITIAL_BUDGET_SHARE, USEFUL_UPGRADE_OVR_DELTA } from "../data/balance";
import { CLUBS } from "../data/clubs";
import { financeProfileFor } from "../data/club-finance-profiles";
import { scaledRecurringRevenue, transferBudgetChange } from "./finance-scale";
import { openingBudgetComponents } from "./opening-budget-model";
import { at } from "./invariant";

/**
 * The club-facing adapter over the parametric opening-budget model.
 *
 * The model in `opening-budget-model.ts` knows the arithmetic and nothing
 * about clubs; this file knows where a club's revenue, share and backer
 * percentile come from and hands them over. Keeping the two apart is what
 * lets `pnpm fit:opening-budget` price candidate rules through exactly the
 * code the game runs, instead of a transcription of it.
 *
 * It imports `finance-scale.ts`, never `finance.ts`. `finance.ts` is a
 * consumer of this module, so the other direction would be a cycle.
 */

/** The four names a component can bind under, in the order the report lists
 * them. */
type OpeningBudgetComponentName =
  | "absoluteFloor"
  | "shareBudget"
  | "usefulPurchaseCost"
  | "backerSupportFloor";

export type OpeningBudgetBreakdown = {
  readonly absoluteFloor: number;
  readonly shareBudget: number;
  readonly usefulPurchaseCost: number;
  readonly backerSupportFloor: number | null;
  readonly binding: readonly OpeningBudgetComponentName[];
  readonly initialBudget: number;
};

/**
 * The eighteen unrounded share budgets at the production share, ascending.
 *
 * All eighteen, the backed clubs included: their own share budget is defined
 * exactly like everybody else's, so leaving them out would take a percentile
 * of a fourteen-club league and call it the league. This is also why the
 * percentile cannot be fed its own result - it is a property of the
 * distribution the exception is measured against.
 */
const shareBudgets = (): number[] =>
  CLUBS.map((club) => scaledRecurringRevenue(club.clubId) * INITIAL_BUDGET_SHARE).sort(
    (a, b) => a - b
  );

/** Linear-interpolated quantile, so a percentile between two clubs does not
 * silently round onto one of them. */
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

/**
 * The floor a club's backer puts under the FIRST window, or null when the
 * manifest documents no backing.
 *
 * Null is the common case and stays null: absence of evidence is not a
 * restrained owner, and neither is a promotion to a floor.
 */
export const backerSupportFloor = (clubId: string): number | null => {
  const percentile = financeProfileFor(clubId).backerBudgetPercentile;
  if (percentile === undefined) return null;
  return quantile(shareBudgets(), percentile);
};

/** Which components actually decide the budget, as a SET rather than a single
 * winner: two components landing on the same number is a fact about the club,
 * and picking one of them would hide it. */
const bindingComponents = (
  breakdown: Omit<OpeningBudgetBreakdown, "binding">,
  tolerance = 1e-12
): OpeningBudgetComponentName[] => {
  const named: [OpeningBudgetComponentName, number | null][] = [
    ["absoluteFloor", breakdown.absoluteFloor],
    ["shareBudget", breakdown.shareBudget],
    ["usefulPurchaseCost", breakdown.usefulPurchaseCost],
    ["backerSupportFloor", breakdown.backerSupportFloor],
  ];
  return named
    .filter(([, value]) => value !== null && Math.abs(value - breakdown.initialBudget) <= tolerance)
    .map(([name]) => name);
};

/** Every component of one club's opening budget, kept separate so a report can
 * name the one that binds instead of presenting an exception as a share. */
export const openingBudgetComponentsForClub = (clubId: string): OpeningBudgetBreakdown => {
  const components = openingBudgetComponents({
    clubId,
    scaledRecurringRevenue: scaledRecurringRevenue(clubId),
    budgetShare: INITIAL_BUDGET_SHARE,
    usefulUpgradeOvrDelta: USEFUL_UPGRADE_OVR_DELTA,
    backerSupportFloor: backerSupportFloor(clubId),
  });
  const breakdown = {
    absoluteFloor: components.absoluteFloor,
    shareBudget: components.shareBudget,
    usefulPurchaseCost: components.usefulPurchaseCost,
    backerSupportFloor: components.backerSupportFloor,
    initialBudget: components.initialBudget,
  };
  return { ...breakdown, binding: bindingComponents(breakdown) };
};

/**
 * What the club hands the player on day one, in millions of game euro: the
 * maximum of the absolute playability floor, the revenue share, the cost of
 * one representative useful upgrade and any documented backer floor.
 *
 * The first two components are about the club's structural means; the other
 * two are about the game being playable and about a documented backer, and
 * neither is evidence that the club is wealthy. Anything reasoning about
 * financial strength reads `structuralPurchasingPower` below instead.
 */
export const openingBudget = (clubId: string): number =>
  openingBudgetComponentsForClub(clubId).initialBudget;

/**
 * The structural half of the same budget: what the club can buy with because
 * of what it EARNS and who backs it, rather than because the game has to stay
 * playable.
 *
 * Deliberately excludes `usefulPurchaseCost` and `MIN_INITIAL_BUDGET`. Both
 * are playability rules rather than evidence of wealth, and the cost of a
 * useful upgrade is a function of the club's own squad quality - so anything
 * that scored financial strength off the full budget would be counting squad
 * quality a second time, through the finances. The budget shown on screen and
 * the quantity that feeds a handicap are two different numbers, and both are
 * meant to be.
 *
 * The `*From` variant takes the three inputs directly, so a test can hold
 * them fixed across any change to the cost of an upgrade and watch the answer
 * stay put.
 */
export const structuralPurchasingPowerFrom = (input: {
  readonly shareBudget: number;
  readonly backerSupportFloor: number | null;
  readonly projectedOperatingBalanceWithoutTransfersAndCups: number;
}): number => {
  const structuralOpeningBudget = Math.max(
    input.shareBudget,
    input.backerSupportFloor ?? Number.NEGATIVE_INFINITY
  );
  return (
    structuralOpeningBudget +
    transferBudgetChange(input.projectedOperatingBalanceWithoutTransfersAndCups)
  );
};

/** The same quantity for a named club, reading its share budget and backer
 * floor off the manifest. */
export const structuralPurchasingPower = (input: {
  readonly clubId: string;
  readonly projectedOperatingBalanceWithoutTransfersAndCups: number;
}): number => {
  const components = openingBudgetComponentsForClub(input.clubId);
  return structuralPurchasingPowerFrom({
    shareBudget: components.shareBudget,
    backerSupportFloor: components.backerSupportFloor,
    projectedOperatingBalanceWithoutTransfersAndCups:
      input.projectedOperatingBalanceWithoutTransfersAndCups,
  });
};
