import { CLUBS } from "../src/data/clubs";
import { scaledRecurringRevenue } from "../src/logic/finance";
import {
  openingBudgetComponents,
  representativeUsefulPurchaseCost,
} from "../src/logic/opening-budget-model";
import { at } from "../src/logic/invariant";

/**
 * The measurement layer of `pnpm fit:opening-budget`.
 *
 * Owns the grid, the backer-support tiers and the per-club arithmetic of one
 * candidate rule - but NOT the cost formula itself, which lives in
 * `src/logic/opening-budget-model.ts` so the later activation plan can wire the
 * same code into the game rather than transcribe a script.
 */

/** One point of the scan: a complete candidate rule for the opening budget. */
export type OpeningBudgetCandidate = {
  /** Share of scaled recurring revenue handed over on day one. */
  readonly budgetShare: number;
  /** How far above the club's own positional target a signing has to be for
   * the purchase to count as a useful upgrade rather than a like-for-like. */
  readonly usefulUpgradeOvrDelta: 0 | 1 | 2;
  /** Share of the season's operating balance the board passes back into the
   * transfer budget. */
  readonly boardReinvestmentRate: number;
  /** Percentile of the eighteen share budgets a `strong` backer floor sits at. */
  readonly strongBackerPercentile: 0.9 | 0.95;
  /** The same for an `active` backer. */
  readonly activeBackerPercentile: 0.75 | 0.8;
};

/** What one candidate rule gives one club, with every component of the maximum
 * kept separate so the report can name the one that binds. */
export type ClubOpeningBudget = {
  readonly clubId: string;
  readonly shortName: string;
  readonly absoluteFloor: number;
  readonly shareBudget: number;
  readonly usefulPurchaseCost: number;
  readonly backerSupportFloor: number | null;
  readonly initialBudget: number;
};

/** Every club id the fit covers, in the order `CLUBS` declares them. */
export const FIT_CLUB_IDS: readonly string[] = CLUBS.map((club) => club.clubId);

/** The display name for a club id, so a report table does not have to reach
 * into the club record for a second reason. */
export const shortNameForClubId = (clubId: string): string => {
  const club = CLUBS.find((entry) => entry.clubId === clubId);
  if (club === undefined) throw new Error(`Unknown club id: ${clubId}`);
  return club.shortName;
};

/**
 * Price one candidate rule for one club.
 *
 * `backerSupportFloor` arrives already resolved, because the percentile it
 * comes from is a property of the whole eighteen-club distribution and cannot
 * be computed from a single club.
 */
export const clubOpeningBudget = (input: {
  readonly clubId: string;
  readonly candidate: OpeningBudgetCandidate;
  readonly backerSupportFloor: number | null;
}): ClubOpeningBudget => {
  const components = openingBudgetComponents({
    clubId: input.clubId,
    // Passed explicitly because the model no longer looks it up: keeping it
    // parametric is what stops `opening-budget-model.ts` from importing the
    // finance module the adapter above it is imported BY.
    scaledRecurringRevenue: scaledRecurringRevenue(input.clubId),
    budgetShare: input.candidate.budgetShare,
    usefulUpgradeOvrDelta: input.candidate.usefulUpgradeOvrDelta,
    backerSupportFloor: input.backerSupportFloor,
  });
  return {
    clubId: input.clubId,
    shortName: shortNameForClubId(input.clubId),
    absoluteFloor: components.absoluteFloor,
    shareBudget: components.shareBudget,
    usefulPurchaseCost: components.usefulPurchaseCost,
    backerSupportFloor: components.backerSupportFloor,
    initialBudget: components.initialBudget,
  };
};

/**
 * Which components actually decide the budget, as a SET rather than a single
 * winner. Two components landing on the same number is not a tie to be broken
 * arbitrarily - it is a fact about the candidate, and a report that picked one
 * of them would hide it.
 */
export const bindingComponents = (
  budget: ClubOpeningBudget,
  tolerance = 1e-12
): readonly string[] => {
  const named: [string, number | null][] = [
    ["absoluteFloor", budget.absoluteFloor],
    ["shareBudget", budget.shareBudget],
    ["usefulPurchaseCost", budget.usefulPurchaseCost],
    ["backerSupportFloor", budget.backerSupportFloor],
  ];
  return named
    .filter(([, value]) => value !== null && Math.abs(value - budget.initialBudget) <= tolerance)
    .map(([name]) => name);
};

/** Re-exported so the CLI prices costs through one import rather than reaching
 * past this layer into `src/logic`. */
export { representativeUsefulPurchaseCost };

/**
 * How strong the documented case is that a backer - an owner OR a main
 * sponsor - would put money behind the first window.
 *
 * Four values, not a boolean, because `restrained` and `none` are different
 * facts that happen to produce the same number. `restrained` is a club whose
 * backer has publicly rejected the model of bankrolling the club; `none` is
 * the absence of evidence, which covers wealthy owners, city ownership and
 * large corporate sponsors alike. Collapsing them would let the report claim
 * eighteen measurements where it has fourteen non-observations.
 */
export type BackerSupportTier = "strong" | "active" | "restrained" | "none";

/**
 * The tier of every club, read off `docs/decisions/club-owner-finance-context-2026-09-11.md`.
 *
 * Only four clubs are anything but `none`, and that rigour is the point: a
 * recapitalisation aimed at liquidity, a rescue from insolvency, a change of
 * owner and an ordinary sponsorship deal already counted in recurring revenue
 * are NOT promotions to a floor. Without that rule the mechanic becomes
 * eighteen hand-tuned handicaps wearing the word "context".
 *
 * Written out club by club rather than derived, so adding a club to the league
 * fails the completeness test instead of silently defaulting to `none`.
 */
export const BACKER_SUPPORT_TIERS: Readonly<Record<string, BackerSupportTier>> = {
  "legia-warszawa": "none",
  "lech-poznan": "none",
  "rakow-czestochowa": "none",
  "jagiellonia-bialystok": "none",
  "pogon-szczecin": "none",
  "gornik-zabrze": "none",
  cracovia: "none",
  // Robert Dobrzycki's money already built an expensive squad - past tense.
  // Any floor is about the start of the tenure, never a recurring transfer.
  "widzew-lodz": "strong",
  "slask-wroclaw": "none",
  "piast-gliwice": "none",
  "radomiak-radom": "none",
  // Korona 4ever's documented recapitalisation and rising budget targets:
  // moderate, already delivered, so `active` rather than `strong`.
  "korona-kielce": "active",
  // Zbigniew Jakubas publicly rejected permanent owner funding in 2026. The
  // absence of a floor here is part of the hypothesis, not a gap in it.
  "motor-lublin": "restrained",
  "zaglebie-lubin": "none",
  "wisla-krakow": "none",
  // Formally the main SPONSOR, not the owner: the sole shareholder is the
  // sports club. The money built a costly squad while the organisation did
  // not keep pace with promotion.
  "wieczysta-krakow": "strong",
  "gks-katowice": "none",
  "wisla-plock": "none",
};

/** The tier of one club, throwing rather than defaulting on an unknown id. */
export const backerSupportTier = (clubId: string): BackerSupportTier => {
  const tier = BACKER_SUPPORT_TIERS[clubId];
  if (tier === undefined) throw new Error(`No backer-support tier for club id: ${clubId}`);
  return tier;
};

/**
 * The eighteen unrounded share budgets of one candidate, ascending.
 *
 * All eighteen, including the clubs that will take a floor: their own share
 * budget is defined exactly like everybody else's, and leaving them out would
 * take a percentile of a fourteen-club league and call it the league. This
 * mirrors `shareBudgets` in `src/logic/finance.ts`, which does the same for
 * the production rule.
 */
export const candidateShareBudgets = (budgetShare: number): number[] =>
  FIT_CLUB_IDS.map((clubId) => scaledRecurringRevenue(clubId) * budgetShare).sort((a, b) => a - b);

/** Linear-interpolated quantile, so a percentile between two clubs does not
 * silently round onto one of them. */
export const quantile = (sorted: readonly number[], p: number): number => {
  if (sorted.length === 0) throw new Error("quantile of an empty sample");
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error(`quantile: p out of range: ${p}`);
  const position = (sorted.length - 1) * p;
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  const low = at(sorted, lo, "quantile lower");
  return lo === hi ? low : low + (position - lo) * (at(sorted, hi, "quantile upper") - low);
};

/**
 * The floor a club's backer puts under the FIRST window, or null.
 *
 * Null for `restrained` and for `none` alike - the tier stays in the report to
 * keep the two apart. The floor enters `max(...)` when the career is created
 * and nowhere else: not at the start of a later season, not on a change of
 * club, and never as recurring revenue. Raising it so that a club's written
 * character has a visible number behind it would be exactly the fabrication
 * this tiering exists to prevent.
 */
export const backerSupportFloorFor = (
  clubId: string,
  candidate: OpeningBudgetCandidate
): number | null => {
  const tier = backerSupportTier(clubId);
  if (tier === "restrained" || tier === "none") return null;
  const sorted = candidateShareBudgets(candidate.budgetShare);
  return quantile(
    sorted,
    tier === "strong" ? candidate.strongBackerPercentile : candidate.activeBackerPercentile
  );
};
