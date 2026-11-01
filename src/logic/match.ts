import { MATCH_BASE_GOALS, MATCH_HOME_ADVANTAGE } from "../data/balance";
import { poisson, type Rng } from "./rng";

/** Attack and defence on the external model's multiplicative scale, league
 * average 1.00. Higher defence means a better defence, so it divides. */
export type MatchRating = { attack: number; defence: number };

export type MatchResult = { homeGoals: number; awayGoals: number };

/** The Poisson means sampled by simulateMatch. Kept as one public function
 * so analytical diagnostics cannot drift to a copied match formula. */
export const expectedGoals = (
  home: MatchRating,
  away: MatchRating
): { home: number; away: number } => ({
  home: (MATCH_BASE_GOALS * home.attack * MATCH_HOME_ADVANTAGE) / away.defence,
  away: (MATCH_BASE_GOALS * away.attack) / home.defence,
});

/**
 * One match. Draw order is part of the golden contract: home goals first,
 * then away goals.
 */
export const simulateMatch = (rng: Rng, home: MatchRating, away: MatchRating): MatchResult => {
  const lambda = expectedGoals(home, away);
  const homeGoals = poisson(rng, lambda.home);
  const awayGoals = poisson(rng, lambda.away);
  return { homeGoals, awayGoals };
};
