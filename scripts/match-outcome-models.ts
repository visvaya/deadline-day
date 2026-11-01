import { MATCH_HOME_ADVANTAGE } from "../src/data/balance";
import type { MatchResult } from "../src/logic/match";
import { createRng, poisson } from "../src/logic/rng";

export type OutcomeLambdas = { home: number; away: number };

export type OutcomeLambdaAdjustment = {
  baseGoalsFactor?: number;
  homeAdvantageFactor?: number;
  homeAdvantageShare?: number;
};

export type OutcomeModel =
  | { kind: "independent" }
  | { kind: "dixon-coles"; rho: number }
  | { kind: "shared-poisson"; covariance: number };

export type OutcomeSeeds = {
  home: number;
  away: number;
  dependence: number;
};

/**
 * Re-expresses the existing one-sided home multiplier as a split log effect.
 * A share of 1 is exactly the production formula. A share of 0.5 applies half
 * the target advantage to home attack and half to suppressing away attack.
 */
export const adjustOutcomeLambdas = (
  current: OutcomeLambdas,
  adjustment: OutcomeLambdaAdjustment
): OutcomeLambdas => {
  const baseGoalsFactor = adjustment.baseGoalsFactor ?? 1;
  const homeAdvantageFactor = adjustment.homeAdvantageFactor ?? 1;
  const homeAdvantageShare = adjustment.homeAdvantageShare ?? 1;
  if (baseGoalsFactor <= 0) throw new Error("base goals factor must be positive");
  if (homeAdvantageFactor <= 0) throw new Error("home advantage factor must be positive");
  if (homeAdvantageShare < 0 || homeAdvantageShare > 1) {
    throw new Error("home advantage share must be between 0 and 1");
  }
  const targetHomeAdvantage = MATCH_HOME_ADVANTAGE * homeAdvantageFactor;
  return {
    home:
      current.home *
      baseGoalsFactor *
      (targetHomeAdvantage ** homeAdvantageShare / MATCH_HOME_ADVANTAGE),
    away: (current.away * baseGoalsFactor) / targetHomeAdvantage ** (1 - homeAdvantageShare),
  };
};

/**
 * Exact Dixon-Coles low-score correction, for either sign of rho.
 *
 * The correction reweights four scorelines by tau, and every reweighting of
 * that shape is a transfer of one single quantity of mass, p(0,0)*lambda*mu*|rho|,
 * between two pairs of cells. Which way it flows is the only thing the sign
 * decides:
 *
 *   rho < 0   0-1 -> 0-0   and   1-0 -> 1-1      (more low draws)
 *   rho > 0   0-0 -> 0-1   and   1-1 -> 1-0      (fewer low draws)
 *
 * Both directions preserve the two Poisson marginals exactly, so neither
 * touches either side's expected goals and neither calls for refitting the
 * lambdas - see 1.4 of the rho plan.
 *
 * Both signs exist because the STUDY needs both, not because the game does.
 * The estimator is free to land on a positive rho, and verdict B is settled
 * by simulating the positive end of a confidence envelope that straddles
 * zero. A sampler that threw there could not classify A against B at all.
 * Whether a positive rho would ever reach the game is a separate decision,
 * reserved to the product owner (verdict F).
 */
export const applyDixonColes = (
  result: MatchResult,
  lambda: OutcomeLambdas,
  rho: number,
  uniform: number
): MatchResult => {
  if (rho === 0) return result;
  const { homeGoals, awayGoals } = result;
  if (rho < 0) {
    const removeAwayWin = -rho * lambda.home;
    const removeHomeWin = -rho * lambda.away;
    // Strictly greater than one, not at least one: a transfer probability of
    // exactly one empties the source cell, and tau = 0 is a scoreline the
    // model says can happen being given probability zero.
    if (removeAwayWin >= 1 || removeHomeWin >= 1) {
      throw new Error("Dixon-Coles rho leaves a low score with no probability");
    }
    if (homeGoals === 0 && awayGoals === 1 && uniform < removeAwayWin) {
      return { homeGoals: 0, awayGoals: 0 };
    }
    if (homeGoals === 1 && awayGoals === 0 && uniform < removeHomeWin) {
      return { homeGoals: 1, awayGoals: 1 };
    }
    return result;
  }
  // Mass leaving 0-0 is lambda*mu*rho of it, and mass leaving 1-1 is rho of
  // it; both equal p(0,0)*lambda*mu*rho, which is why one uniform serves.
  const removeLevelNil = rho * lambda.home * lambda.away;
  if (removeLevelNil >= 1 || rho >= 1) {
    throw new Error("Dixon-Coles rho leaves a low score with no probability");
  }
  if (homeGoals === 0 && awayGoals === 0 && uniform < removeLevelNil) {
    return { homeGoals: 0, awayGoals: 1 };
  }
  if (homeGoals === 1 && awayGoals === 1 && uniform < rho) {
    return { homeGoals: 1, awayGoals: 0 };
  }
  return result;
};

export const sampleOutcome = (
  lambda: OutcomeLambdas,
  model: OutcomeModel,
  seeds: OutcomeSeeds
): MatchResult => {
  if (model.kind === "shared-poisson") {
    if (model.covariance < 0 || model.covariance > Math.min(lambda.home, lambda.away)) {
      throw new Error("shared Poisson covariance must be between zero and both lambdas");
    }
    const common = poisson(createRng(seeds.dependence), model.covariance);
    return {
      homeGoals: poisson(createRng(seeds.home), lambda.home - model.covariance) + common,
      awayGoals: poisson(createRng(seeds.away), lambda.away - model.covariance) + common,
    };
  }

  const independent = {
    homeGoals: poisson(createRng(seeds.home), lambda.home),
    awayGoals: poisson(createRng(seeds.away), lambda.away),
  };
  return model.kind === "dixon-coles"
    ? applyDixonColes(independent, lambda, model.rho, createRng(seeds.dependence).next())
    : independent;
};
