import type { LeagueClub, LeagueMembership, LeagueStanding } from "../src/data/types";
import { buildFixtures, emptyStandings, sortStandings, type Fixture } from "../src/logic/league";
import { clubOvr } from "../src/logic/league-ratings";
import { currentRating, startingMembership } from "../src/logic/league-membership";
import { expectedGoals, type MatchRating } from "../src/logic/match";
import { createRng, shuffle } from "../src/logic/rng";
import { deriveSeed } from "../src/logic/stable-seed";
import { estimate, type MetricEstimate } from "./match-engine-audit-reference";
import {
  adjustOutcomeLambdas,
  sampleOutcome,
  type OutcomeLambdaAdjustment,
  type OutcomeLambdas,
  type OutcomeModel,
} from "./match-outcome-models";
import { spearmanRankCorrelation } from "./stats";
import { at } from "../src/logic/invariant";

export const transformRatingSpread = (rating: MatchRating, exponent: number): MatchRating => ({
  attack: rating.attack ** exponent,
  defence: rating.defence ** exponent,
});

export const calibrateOutcomeLambdaFactors = (
  current: OutcomeLambdas,
  target: OutcomeLambdas
): Required<Pick<OutcomeLambdaAdjustment, "baseGoalsFactor" | "homeAdvantageFactor">> => {
  if (current.home <= 0 || current.away <= 0 || target.home <= 0 || target.away <= 0) {
    throw new Error("outcome lambda calibration requires positive means");
  }
  const baseGoalsFactor = target.away / current.away;
  return {
    baseGoalsFactor,
    homeAdvantageFactor: target.home / current.home / baseGoalsFactor,
  };
};

export const leagueClubs = (membership: LeagueMembership): LeagueClub[] =>
  membership.clubs.filter((club) => club.tier === "league");

export const ratingsFor = (membership: LeagueMembership): Map<string, MatchRating> =>
  new Map(leagueClubs(membership).map((club) => [club.shortName, currentRating(club)]));

export const binaryEstimate = (values: readonly boolean[]): MetricEstimate =>
  estimate(values.map((value) => (value ? 1 : 0)));

export const orderedStrengthFromRatings = (ratings: ReadonlyMap<string, MatchRating>): string[] =>
  [...ratings.entries()]
    .sort(
      ([nameA, ratingA], [nameB, ratingB]) =>
        clubOvr(ratingB) - clubOvr(ratingA) || nameA.localeCompare(nameB)
    )
    .map(([club]) => club);

export const overlapRate = (first: readonly string[], second: readonly string[]): number => {
  const expected = new Set(first);
  return second.filter((club) => expected.has(club)).length / first.length;
};

export type CoupledSeason = {
  spread: number;
  champion: number;
  last: number;
  strongestChampion: boolean;
  topFourAccuracy: number;
  lowerHalfInTopFour: number;
  goalsPerMatch: number;
  homeGoalsPerMatch: number;
  awayGoalsPerMatch: number;
  drawRate: number;
  homeWinRate: number;
  awayWinRate: number;
  homePointAdvantage: number;
  spearmanStrengthPlace: number | null;
};

export type CoupledConfig = OutcomeLambdaAdjustment & {
  exponent: number;
  outcomeModel?: OutcomeModel;
};

export type CoupledContext = {
  baseRatings: ReadonlyMap<string, MatchRating>;
  order: readonly string[];
  fixtures: readonly {
    fixture: Fixture;
    homeSeed: number;
    awaySeed: number;
    dependenceSeed: number;
  }[];
};

const recordCoupledResult = (
  table: Map<string, LeagueStanding>,
  fixture: Fixture,
  homeGoals: number,
  awayGoals: number
): void => {
  const home = table.get(fixture.home)!;
  const away = table.get(fixture.away)!;
  home.goalsFor += homeGoals;
  home.goalsAgainst += awayGoals;
  away.goalsFor += awayGoals;
  away.goalsAgainst += homeGoals;
  if (homeGoals > awayGoals) home.points += 3;
  else if (awayGoals > homeGoals) away.points += 3;
  else {
    home.points += 1;
    away.points += 1;
  }
};

/** Distribution-equivalent league season with one independent RNG stream per
 * fixture side. Reusing those streams across variants gives strong paired
 * counterfactuals while still calling the production lambda and Poisson code. */
export const coupledContext = (seed: number): CoupledContext => {
  const baseRatings = ratingsFor(startingMembership());
  const order = shuffle(createRng(deriveSeed(seed, "audit-order")), [...baseRatings.keys()]);
  const fixtures = buildFixtures(order).flatMap((round, roundIndex) =>
    round.map((fixture, fixtureIndex) => ({
      fixture,
      homeSeed: deriveSeed(seed, "audit-goals", roundIndex, fixtureIndex, "home"),
      awaySeed: deriveSeed(seed, "audit-goals", roundIndex, fixtureIndex, "away"),
      dependenceSeed: deriveSeed(seed, "audit-goals", roundIndex, fixtureIndex, "dependence"),
    }))
  );
  return { baseRatings, order, fixtures };
};

export const coupledSeason = (context: CoupledContext, config: CoupledConfig): CoupledSeason => {
  const ratings = new Map(
    [...context.baseRatings.entries()].map(([club, rating]) => [
      club,
      transformRatingSpread(rating, config.exponent),
    ])
  );
  const table = new Map(emptyStandings(context.order).map((row) => [row.club, row]));
  let homeGoalsTotal = 0;
  let awayGoalsTotal = 0;
  let draws = 0;
  let homeWins = 0;
  let awayWins = 0;
  context.fixtures.forEach(({ fixture, homeSeed, awaySeed, dependenceSeed }) => {
    const homeRating = ratings.get(fixture.home)!;
    const awayRating = ratings.get(fixture.away)!;
    const lambda = adjustOutcomeLambdas(expectedGoals(homeRating, awayRating), config);
    const { homeGoals, awayGoals } = sampleOutcome(
      lambda,
      config.outcomeModel ?? { kind: "independent" },
      { home: homeSeed, away: awaySeed, dependence: dependenceSeed }
    );
    homeGoalsTotal += homeGoals;
    awayGoalsTotal += awayGoals;
    if (homeGoals > awayGoals) homeWins += 1;
    else if (awayGoals > homeGoals) awayWins += 1;
    else draws += 1;
    recordCoupledResult(table, fixture, homeGoals, awayGoals);
  });
  const final = sortStandings([...table.values()]);
  const strengthOrder = orderedStrengthFromRatings(ratings);
  const finalTopFour = final.slice(0, 4).map((row) => row.club);
  const ratedBottomHalf = new Set(strengthOrder.slice(9));
  const finalPlace = new Map(final.map((row, index) => [row.club, index + 1]));
  const strengthValues = strengthOrder.map((club) => clubOvr(ratings.get(club)!));
  return {
    spread: at(final, 0, "champion row").points - final.at(-1)!.points,
    champion: at(final, 0, "champion row").points,
    last: final.at(-1)!.points,
    strongestChampion: at(final, 0, "champion row").club === strengthOrder[0],
    topFourAccuracy: overlapRate(strengthOrder.slice(0, 4), finalTopFour),
    lowerHalfInTopFour: finalTopFour.filter((club) => ratedBottomHalf.has(club)).length / 4,
    goalsPerMatch: (homeGoalsTotal + awayGoalsTotal) / 306,
    homeGoalsPerMatch: homeGoalsTotal / 306,
    awayGoalsPerMatch: awayGoalsTotal / 306,
    drawRate: draws / 306,
    homeWinRate: homeWins / 306,
    awayWinRate: awayWins / 306,
    homePointAdvantage: (3 * (homeWins - awayWins)) / 306,
    spearmanStrengthPlace:
      new Set(strengthValues).size === 1
        ? null
        : spearmanRankCorrelation(
            strengthValues,
            strengthOrder.map((club) => finalPlace.get(club)!)
          ),
  };
};
