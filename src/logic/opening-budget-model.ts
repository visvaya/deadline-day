import { AGE_PROFILES, MIN_INITIAL_BUDGET } from "../data/balance";
import { CLUBS, ratingForClubId } from "../data/clubs";
import { FORMACJE } from "../data/positions";
import type { PositionCode } from "../data/types";
import { marketValue } from "./player";
import { formationTargetOvr } from "./squad-targets";
import { baseWage } from "./wages";
import { at } from "./invariant";

/**
 * A parameterised model of what the first transfer window costs, written so a
 * later activation plan can read one arithmetic rather than copy it out of a
 * measurement script.
 *
 * ACTIVE SINCE 2026-09-12, and still reached through exactly one door. The
 * game's opening budget is this arithmetic, composed with club data by
 * `opening-budget.ts`; `pnpm fit:opening-budget` prices candidate rules
 * through the same code rather than a transcription of it.
 * `tests/logic/opening-budget-model.test.ts` pins that single door, so an
 * import from the reducer, `finance.ts` or the UI fails rather than growing a
 * second copy of the formula.
 *
 * Deliberately free of RNG. A cost sampled from one seed would be a single
 * card wearing the word "median"; every number here is a closed form of the
 * club's own rating, the formation catalogue and the value and wage curves.
 */

/**
 * The median of the KUPNO card's price multiplier, `rand(rng, 0.9, 1.5)` in
 * `offers.ts`. Uniform, so the median is the midpoint.
 *
 * NOT `PURCHASE_PRICE_CAP`. That constant caps a card at `kasa * 1.25` and is
 * therefore a function of the cash the club already has - using it here would
 * define "what a useful signing costs" in terms of the very budget this model
 * is being asked to size, and spec 5 removes the cap outright. The test pins
 * that the two numbers differ, so the substitution cannot be made quietly.
 */
export const KUPNO_MEDIAN_PRICE_MULTIPLIER = 1.2;

/** The neutral market's `mnoznikCeny` (`spokoj` in `market-states.ts`). Stated
 * rather than imported so the model cannot start tracking a market state it
 * has no business knowing about. */
export const NEUTRAL_MARKET_PRICE_MULTIPLIER = 1;

/** Median, with an even-sized sample taking the mean of the middle pair.
 * Local and unexported: `src/logic` has no statistics module, and adding a
 * public one for a single call site would invite copies of it. */
const median = (values: readonly number[]): number => {
  if (values.length === 0) throw new Error("median of an empty sample");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const midValue = at(sorted, mid, "median middle value");
  if (sorted.length % 2 === 1) return midValue;
  return (at(sorted, mid - 1, "median lower middle value") + midValue) / 2;
};

/** What one starting slot of one formation costs to fill at `delta` above the
 * ovr the club must average there: the median KUPNO fee on a neutral market,
 * plus the first year of the player's wage. */
const slotCost = (targetOvr: number, pos: PositionCode, delta: 0 | 1 | 2): number => {
  const ovr = Math.round(targetOvr + delta);
  const age = AGE_PROFILES[pos].peakStart;
  return (
    marketValue(ovr, age, pos) * KUPNO_MEDIAN_PRICE_MULTIPLIER * NEUTRAL_MARKET_PRICE_MULTIPLIER +
    baseWage(ovr)
  );
};

/** Every starting slot of every formation, each counted as many times as it
 * fields players. Exported for the test, which needs the sample the median is
 * taken of to pin a single slot by hand. */
export const usefulPurchaseSlotCosts = (
  clubId: string,
  usefulUpgradeOvrDelta: 0 | 1 | 2
): number[] => {
  const rating = ratingForClubId(clubId);
  const costs: number[] = [];
  for (const formation of Object.values(FORMACJE)) {
    const targets = formationTargetOvr(formation, rating);
    for (const slot of formation.pozycje) {
      const target = targets.get(slot.kod);
      if (target === undefined) {
        throw new Error(
          `representativeUsefulPurchaseCost: ${formation.id} has no target for ${slot.kod}`
        );
      }
      const cost = slotCost(target, slot.kod, usefulUpgradeOvrDelta);
      // The bench is deliberately absent. "Useful upgrade" is a question
      // about the eleven that plays; a squad-depth signing is a different
      // purchase, measured separately by the reactive-market audit.
      for (let i = 0; i < slot.xi; i += 1) costs.push(cost);
    }
  }
  return costs;
};

/**
 * What one representative useful signing costs this club in its first year:
 * fee at the median KUPNO multiplier plus one year of wages, taken as the
 * median over every starting slot of all seven formations.
 *
 * All seven, because the career draws its formation and the budget is handed
 * over before the draw is visible to the player. Pricing only the formation
 * that happened to come up would make the budget a function of a coin the
 * player never sees.
 */
export const representativeUsefulPurchaseCost = (
  clubId: string,
  usefulUpgradeOvrDelta: 0 | 1 | 2
): number => {
  // Memoised because the function is pure and there are only 18 x 3 answers,
  // while the fit asks for them 2184 times over - each call solving seven
  // formations' 2x2 systems and pricing 77 slots. The cache is keyed on the
  // whole argument list and holds no state of its own, so it can never make
  // two callers disagree.
  const key = `${clubId}\u0000${usefulUpgradeOvrDelta}`;
  const cached = costCache.get(key);
  if (cached !== undefined) return cached;
  const value = median(usefulPurchaseSlotCosts(clubId, usefulUpgradeOvrDelta));
  costCache.set(key, value);
  return value;
};

const costCache = new Map<string, number>();

/**
 * The four components a candidate opening budget is the maximum of, returned
 * separately so a report can name which one actually binds.
 *
 * `backerSupportFloor` is null for most clubs and never enters the maximum
 * when it is. It is a floor on the FIRST window only - not a recurring
 * injection, not additive to the others.
 *
 * `scaledRecurringRevenue` arrives as a NUMBER rather than being looked up,
 * so this module imports neither `finance.ts` nor `finance-scale.ts`. It is
 * the parametric layer: the club-facing adapter is what decides which revenue
 * and which share a club actually gets.
 */
export const openingBudgetComponents = (input: {
  readonly clubId: string;
  readonly scaledRecurringRevenue: number;
  readonly budgetShare: number;
  readonly usefulUpgradeOvrDelta: 0 | 1 | 2;
  readonly backerSupportFloor: number | null;
}): {
  readonly absoluteFloor: number;
  readonly shareBudget: number;
  readonly usefulPurchaseCost: number;
  readonly backerSupportFloor: number | null;
  readonly initialBudget: number;
} => {
  if (!Number.isFinite(input.budgetShare) || input.budgetShare <= 0) {
    throw new Error(
      `openingBudgetComponents: budgetShare must be positive, got ${input.budgetShare}`
    );
  }
  if (input.backerSupportFloor !== null && !Number.isFinite(input.backerSupportFloor)) {
    throw new Error("openingBudgetComponents: backerSupportFloor must be finite or null");
  }
  if (!Number.isFinite(input.scaledRecurringRevenue) || input.scaledRecurringRevenue <= 0) {
    throw new Error(
      `openingBudgetComponents: scaledRecurringRevenue must be positive, got ${input.scaledRecurringRevenue}`
    );
  }
  const absoluteFloor = MIN_INITIAL_BUDGET;
  const shareBudget = input.scaledRecurringRevenue * input.budgetShare;
  const usefulPurchaseCost = representativeUsefulPurchaseCost(
    input.clubId,
    input.usefulUpgradeOvrDelta
  );
  const candidates = [absoluteFloor, shareBudget, usefulPurchaseCost];
  if (input.backerSupportFloor !== null) candidates.push(input.backerSupportFloor);
  return {
    absoluteFloor,
    shareBudget,
    usefulPurchaseCost,
    backerSupportFloor: input.backerSupportFloor,
    initialBudget: Math.max(...candidates),
  };
};

/** The eighteen club ids, in the order `CLUBS` declares them. Re-exported so a
 * caller that only needs the fit's domain does not have to reach into the club
 * record for a field it will not use. */
export const OPENING_BUDGET_CLUB_IDS: readonly string[] = CLUBS.map((club) => club.clubId);
