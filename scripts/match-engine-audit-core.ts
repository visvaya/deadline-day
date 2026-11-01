import { MATCH_BASE_GOALS, MATCH_HOME_ADVANTAGE, RELEGATED_COUNT } from "../src/data/balance";
import type { LeagueMembership, LeagueStanding } from "../src/data/types";
import { expectedSeasonPoints } from "../src/logic/expected-points";
import { buildFixtures, emptyStandings, playRounds, sortStandings } from "../src/logic/league";
import { clubOvr } from "../src/logic/league-ratings";
import { startingMembership, swapTiers } from "../src/logic/league-membership";
import { expectedGoals, type MatchRating } from "../src/logic/match";
import { createRng, shuffle, type Rng } from "../src/logic/rng";
import { deriveSeed } from "../src/logic/stable-seed";
import { parseFlags } from "./cli-args";
import { RHO_ENVELOPE_LOWER, RHO_ENVELOPE_UPPER, RHO_ESTIMATE } from "./rho/measured-points";
import {
  binaryEstimate,
  calibrateOutcomeLambdaFactors,
  coupledContext,
  coupledSeason,
  leagueClubs,
  orderedStrengthFromRatings,
  overlapRate,
  ratingsFor,
  transformRatingSpread,
  type CoupledConfig,
  type CoupledContext,
  type CoupledSeason,
} from "./match-engine-audit-coupled";
import {
  MATCH_OUTCOME_REFERENCE,
  estimate,
  summarizeMatchOutcomeReference,
  type MatchOutcomeSeasonReference,
  type MetricEstimate,
} from "./match-engine-audit-reference";
import { seedSeries } from "./seed-series";
import { mean, quantile, sampleStandardDeviation, spearmanRankCorrelation } from "./stats";
import { at } from "../src/logic/invariant";

const DEFAULT_RUNS = 20_000;
const DEFAULT_BATCHES = 3;
const DEFAULT_SEED = 0x1ea6e001;

export type AuditCli = {
  runs: number;
  batches: number;
  seed: number;
  md: string | null;
  outcomeExperiments: boolean;
};

export type AuditOptions = Pick<AuditCli, "runs" | "batches" | "seed"> & {
  outcomeExperiments?: boolean;
};

const parsePositiveInteger = (flag: string, raw: string): number => {
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid ${flag} value: "${raw}"`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${flag} value: "${raw}"`);
  }
  return value;
};

const parseSeed = (raw: string): number => {
  if (!/^(?:0[xX][\da-fA-F]+|\d+)$/.test(raw)) throw new Error(`Invalid --seed value: "${raw}"`);
  return Number.parseInt(raw, raw.toLowerCase().startsWith("0x") ? 16 : 10) >>> 0;
};

export const parseAuditCli = (argv: string[]): AuditCli => {
  const cli: AuditCli = {
    runs: DEFAULT_RUNS,
    batches: DEFAULT_BATCHES,
    seed: DEFAULT_SEED,
    md: null,
    outcomeExperiments: argv.includes("--outcome-experiments"),
  };
  const valueArguments = argv.filter((argument) => argument !== "--outcome-experiments");
  const flags = parseFlags(valueArguments, ["--runs", "--batches", "--seed", "--md"]);
  for (const [flag, value] of flags) {
    if (flag === "--runs") cli.runs = parsePositiveInteger(flag, value);
    else if (flag === "--batches") cli.batches = parsePositiveInteger(flag, value);
    else if (flag === "--seed") cli.seed = parseSeed(value);
    else if (flag === "--md") cli.md = value;
  }
  if (cli.batches > cli.runs) {
    throw new Error(`--batches (${cli.batches}) cannot exceed --runs (${cli.runs})`);
  }
  return cli;
};

export { transformRatingSpread } from "./match-engine-audit-coupled";

type RawSeason = {
  batch: number;
  ratings: ReadonlyMap<string, MatchRating>;
  half: LeagueStanding[];
  final: LeagueStanding[];
  matches: { homeGoals: number; awayGoals: number }[];
};

type RawChain = {
  snapshot: RawSeason;
  postPromotion: RawSeason;
  promotedChampion: boolean;
  previousChampionRelegated: boolean;
};

const playSeason = (rng: Rng, membership: LeagueMembership, batch: number): RawSeason => {
  const ratings = ratingsFor(membership);
  const order = shuffle(rng, [...ratings.keys()]);
  const fixtures = buildFixtures(order);
  const matches: { homeGoals: number; awayGoals: number }[] = [];
  const halfUnsorted = playRounds(
    rng,
    fixtures.slice(0, 17),
    ratings,
    emptyStandings(order),
    ({ homeGoals, awayGoals }) => matches.push({ homeGoals, awayGoals })
  );
  const finalUnsorted = playRounds(
    rng,
    fixtures.slice(17),
    ratings,
    halfUnsorted,
    ({ homeGoals, awayGoals }) => matches.push({ homeGoals, awayGoals })
  );
  return {
    batch,
    ratings,
    half: sortStandings(halfUnsorted),
    final: sortStandings(finalUnsorted),
    matches,
  };
};

type SeedEntry = {
  seed: number;
  batch: number;
  seedRoot: number;
};

const independentSeedEntries = (options: AuditOptions): SeedEntry[] => {
  const baseSize = Math.floor(options.runs / options.batches);
  const remainder = options.runs % options.batches;
  return Array.from({ length: options.batches }, (_, batch) => {
    const seedRoot = deriveSeed(options.seed, "match-engine-audit-batch", batch);
    const size = baseSize + (batch < remainder ? 1 : 0);
    return seedSeries(seedRoot, size).map((seed) => ({ seed, batch, seedRoot }));
  }).flat();
};

const runChain = (seed: number, batch: number): RawChain => {
  const rng = createRng(seed);
  const initialMembership = startingMembership();
  const snapshot = playSeason(rng, initialMembership, batch);
  const afterFirstSwap = swapTiers(
    rng,
    initialMembership,
    snapshot.final.slice(-RELEGATED_COUNT).map((row) => row.club)
  );
  const initialLeague = new Set(leagueClubs(initialMembership).map((club) => club.shortName));
  const promoted = new Set(
    leagueClubs(afterFirstSwap)
      .map((club) => club.shortName)
      .filter((club) => !initialLeague.has(club))
  );
  const postPromotion = playSeason(rng, afterFirstSwap, batch);
  const champion = at(postPromotion.final, 0, "post-promotion champion").club;
  const afterSecondSwap = swapTiers(
    rng,
    afterFirstSwap,
    postPromotion.final.slice(-RELEGATED_COUNT).map((row) => row.club)
  );
  const following = playSeason(rng, afterSecondSwap, batch);
  return {
    snapshot,
    postPromotion,
    promotedChampion: promoted.has(champion),
    previousChampionRelegated: following.final
      .slice(-RELEGATED_COUNT)
      .some((row) => row.club === champion),
  };
};

export type ClubAudit = {
  club: string;
  ovr: number;
  n: number;
  pointsMean: number;
  pointsSd: number;
  pointsMeanSe: number;
  pointsSdSe: number;
  titleRate: number;
  titleRateSe: number;
  topFourRate: number;
  topFourRateSe: number;
  relegationRate: number;
  relegationRateSe: number;
};

export type CohortAudit = {
  n: number;
  matchCount: number;
  championPoints: MetricEstimate;
  lastPoints: MetricEstimate;
  pointSpread: MetricEstimate;
  p25Points: MetricEstimate;
  medianPoints: MetricEstimate;
  p75Points: MetricEstimate;
  tablePointSd: MetricEstimate;
  goalsPerMatch: MetricEstimate;
  drawRate: MetricEstimate;
  homeWinRate: MetricEstimate;
  awayWinRate: MetricEstimate;
  homePointsPerMatch: MetricEstimate;
  awayPointsPerMatch: MetricEstimate;
  spearmanStrengthPlace: MetricEstimate;
  topFourAccuracy: MetricEstimate;
  lowerHalfInTopFour: MetricEstimate;
  residualPointsRmse: MetricEstimate;
  strongestTitleRate: MetricEstimate;
  meanAbsoluteHalfMove: MetricEstimate;
  p90AbsoluteHalfMove: MetricEstimate;
  topFourHalfRetention: MetricEstimate;
  bottomThreeHalfRetention: MetricEstimate;
  clubs: ClubAudit[];
};

const orderedStrength = (season: RawSeason): string[] => orderedStrengthFromRatings(season.ratings);

const expectedPointsCache = new Map<string, ReadonlyMap<string, number>>();

const expectedPointsByClub = (
  ratings: ReadonlyMap<string, MatchRating>
): ReadonlyMap<string, number> => {
  const entries = [...ratings.entries()].sort(([a], [b]) => a.localeCompare(b));
  const signature = entries
    .map(([club, rating]) => `${club}:${rating.attack}:${rating.defence}`)
    .join("|");
  const cached = expectedPointsCache.get(signature);
  if (cached) return cached;
  const result = new Map(
    entries.map(([club, rating]) => [
      club,
      expectedSeasonPoints(
        rating,
        entries.filter(([opponent]) => opponent !== club).map(([, opponent]) => opponent)
      ),
    ])
  );
  expectedPointsCache.set(signature, result);
  return result;
};

const aggregateCohort = (seasons: readonly RawSeason[]): CohortAudit => {
  const championPoints: number[] = [];
  const lastPoints: number[] = [];
  const spreads: number[] = [];
  const p25: number[] = [];
  const medians: number[] = [];
  const p75: number[] = [];
  const pointSds: number[] = [];
  const goalsPerMatch: number[] = [];
  const drawRates: number[] = [];
  const homeWinRates: number[] = [];
  const awayWinRates: number[] = [];
  const homePoints: number[] = [];
  const awayPoints: number[] = [];
  const correlations: number[] = [];
  const topFourAccuracy: number[] = [];
  const lowerHalfInTopFour: number[] = [];
  const residualRmse: number[] = [];
  const strongestTitles: boolean[] = [];
  const meanMoves: number[] = [];
  const p90Moves: number[] = [];
  const topFourRetention: number[] = [];
  const bottomThreeRetention: number[] = [];
  const clubSamples = new Map<
    string,
    { ovr: number[]; points: number[]; title: boolean[]; topFour: boolean[]; relegated: boolean[] }
  >();

  for (const season of seasons) {
    const points = season.final.map((row) => row.points);
    const first = at(points, 0, "champion points");
    championPoints.push(first);
    lastPoints.push(points.at(-1)!);
    spreads.push(first - points.at(-1)!);
    p25.push(quantile(points, 0.25));
    medians.push(quantile(points, 0.5));
    p75.push(quantile(points, 0.75));
    pointSds.push(sampleStandardDeviation(points));

    const matchCount = season.matches.length;
    const goals = season.matches.reduce((sum, match) => sum + match.homeGoals + match.awayGoals, 0);
    const homeWins = season.matches.filter((match) => match.homeGoals > match.awayGoals).length;
    const draws = season.matches.filter((match) => match.homeGoals === match.awayGoals).length;
    const awayWins = matchCount - homeWins - draws;
    goalsPerMatch.push(goals / matchCount);
    drawRates.push(draws / matchCount);
    homeWinRates.push(homeWins / matchCount);
    awayWinRates.push(awayWins / matchCount);
    homePoints.push((homeWins * 3 + draws) / matchCount);
    awayPoints.push((awayWins * 3 + draws) / matchCount);

    const strengthOrder = orderedStrength(season);
    const finalPlace = new Map(season.final.map((row, index) => [row.club, index + 1]));
    correlations.push(
      spearmanRankCorrelation(
        strengthOrder.map((club) => clubOvr(season.ratings.get(club)!)),
        strengthOrder.map((club) => finalPlace.get(club)!)
      )
    );
    const ratedTopFour = strengthOrder.slice(0, 4);
    const finalTopFour = season.final.slice(0, 4).map((row) => row.club);
    topFourAccuracy.push(overlapRate(ratedTopFour, finalTopFour));
    const ratedBottomHalf = new Set(strengthOrder.slice(9));
    lowerHalfInTopFour.push(finalTopFour.filter((club) => ratedBottomHalf.has(club)).length / 4);
    strongestTitles.push(at(season.final, 0, "season champion").club === strengthOrder[0]);

    const expected = expectedPointsByClub(season.ratings);
    residualRmse.push(
      Math.sqrt(mean(season.final.map((row) => (row.points - expected.get(row.club)!) ** 2)))
    );

    const halfPlace = new Map(season.half.map((row, index) => [row.club, index + 1]));
    const moves = season.final.map((row, index) => Math.abs(index + 1 - halfPlace.get(row.club)!));
    meanMoves.push(mean(moves));
    p90Moves.push(quantile(moves, 0.9));
    topFourRetention.push(
      overlapRate(
        season.half.slice(0, 4).map((row) => row.club),
        finalTopFour
      )
    );
    bottomThreeRetention.push(
      overlapRate(
        season.half.slice(-3).map((row) => row.club),
        season.final.slice(-3).map((row) => row.club)
      )
    );

    season.final.forEach((row, index) => {
      const sample = clubSamples.get(row.club) ?? {
        ovr: [],
        points: [],
        title: [],
        topFour: [],
        relegated: [],
      };
      sample.ovr.push(clubOvr(season.ratings.get(row.club)!));
      sample.points.push(row.points);
      sample.title.push(index === 0);
      sample.topFour.push(index < 4);
      sample.relegated.push(index >= season.final.length - RELEGATED_COUNT);
      clubSamples.set(row.club, sample);
    });
  }

  const clubs = [...clubSamples.entries()]
    .map(([club, sample]): ClubAudit => {
      const points = estimate(sample.points);
      const title = binaryEstimate(sample.title);
      const topFour = binaryEstimate(sample.topFour);
      const relegated = binaryEstimate(sample.relegated);
      return {
        club,
        ovr: mean(sample.ovr),
        n: sample.points.length,
        pointsMean: points.mean,
        pointsSd: points.sd,
        pointsMeanSe: points.se,
        pointsSdSe: points.sd / Math.sqrt(Math.max(1, 2 * (points.n - 1))),
        titleRate: title.mean,
        titleRateSe: title.se,
        topFourRate: topFour.mean,
        topFourRateSe: topFour.se,
        relegationRate: relegated.mean,
        relegationRateSe: relegated.se,
      };
    })
    .sort((a, b) => b.ovr - a.ovr || a.club.localeCompare(b.club));

  return {
    n: seasons.length,
    matchCount: seasons.reduce((sum, season) => sum + season.matches.length, 0),
    championPoints: estimate(championPoints),
    lastPoints: estimate(lastPoints),
    pointSpread: estimate(spreads),
    p25Points: estimate(p25),
    medianPoints: estimate(medians),
    p75Points: estimate(p75),
    tablePointSd: estimate(pointSds),
    goalsPerMatch: estimate(goalsPerMatch),
    drawRate: estimate(drawRates),
    homeWinRate: estimate(homeWinRates),
    awayWinRate: estimate(awayWinRates),
    homePointsPerMatch: estimate(homePoints),
    awayPointsPerMatch: estimate(awayPoints),
    spearmanStrengthPlace: estimate(correlations),
    topFourAccuracy: estimate(topFourAccuracy),
    lowerHalfInTopFour: estimate(lowerHalfInTopFour),
    residualPointsRmse: estimate(residualRmse),
    strongestTitleRate: binaryEstimate(strongestTitles),
    meanAbsoluteHalfMove: estimate(meanMoves),
    p90AbsoluteHalfMove: estimate(p90Moves),
    topFourHalfRetention: estimate(topFourRetention),
    bottomThreeHalfRetention: estimate(bottomThreeRetention),
    clubs,
  };
};

const analyticalPointSpread = (exponent: number): number => {
  const ratings = new Map(
    [...ratingsFor(startingMembership()).entries()].map(([club, rating]) => [
      club,
      transformRatingSpread(rating, exponent),
    ])
  );
  const expected = expectedPointsByClub(ratings);
  const values = [...expected.values()];
  return Math.max(...values) - Math.min(...values);
};

export type DecompositionAudit = {
  neutralSpread: MetricEstimate;
  currentSpread: MetricEstimate;
  widerSpread: MetricEstimate;
  currentMinusNeutral: MetricEstimate;
  widerMinusCurrent: MetricEstimate;
  analyticalNeutralSpread: number;
  analyticalCurrentSpread: number;
  analyticalWiderSpread: number;
  ratingVariants: {
    neutral: CoupledStrengthAudit;
    current: CoupledStrengthAudit;
    wider: CoupledStrengthAudit;
  };
  ratingDeltas: {
    currentMinusNeutral: CoupledStrengthAudit;
    widerMinusCurrent: CoupledStrengthAudit;
  };
  levers: {
    current: CoupledOutcomeAudit;
    lowerBaseGoals: CoupledOutcomeAudit;
    higherHomeAdvantage: CoupledOutcomeAudit;
    combined: CoupledOutcomeAudit;
  };
  leverDeltas: {
    lowerBaseGoals: CoupledOutcomeAudit;
    higherHomeAdvantage: CoupledOutcomeAudit;
    combined: CoupledOutcomeAudit;
  };
};

export type CoupledStrengthAudit = {
  strongestTitleRate: MetricEstimate;
  topFourAccuracy: MetricEstimate;
  lowerHalfInTopFour: MetricEstimate;
};

export type CoupledOutcomeAudit = {
  goalsPerMatch: MetricEstimate;
  homeGoalsPerMatch: MetricEstimate;
  awayGoalsPerMatch: MetricEstimate;
  drawRate: MetricEstimate;
  homeWinRate: MetricEstimate;
  awayWinRate: MetricEstimate;
  homePointAdvantage: MetricEstimate;
  pointSpread: MetricEstimate;
};

const coupledOutcomeAudit = (seasons: readonly CoupledSeason[]): CoupledOutcomeAudit => ({
  goalsPerMatch: estimate(seasons.map((season) => season.goalsPerMatch)),
  homeGoalsPerMatch: estimate(seasons.map((season) => season.homeGoalsPerMatch)),
  awayGoalsPerMatch: estimate(seasons.map((season) => season.awayGoalsPerMatch)),
  drawRate: estimate(seasons.map((season) => season.drawRate)),
  homeWinRate: estimate(seasons.map((season) => season.homeWinRate)),
  awayWinRate: estimate(seasons.map((season) => season.awayWinRate)),
  homePointAdvantage: estimate(seasons.map((season) => season.homePointAdvantage)),
  pointSpread: estimate(seasons.map((season) => season.spread)),
});

const coupledStrengthAudit = (seasons: readonly CoupledSeason[]): CoupledStrengthAudit => ({
  strongestTitleRate: binaryEstimate(seasons.map((season) => season.strongestChampion)),
  topFourAccuracy: estimate(seasons.map((season) => season.topFourAccuracy)),
  lowerHalfInTopFour: estimate(seasons.map((season) => season.lowerHalfInTopFour)),
});

const pairedEstimate = (
  baseline: readonly CoupledSeason[],
  variant: readonly CoupledSeason[],
  select: (_season: CoupledSeason) => number
): MetricEstimate => {
  if (baseline.length !== variant.length) throw new Error("paired samples must have equal length");
  return estimate(
    variant.map(
      (season, index) => select(season) - select(at(baseline, index, "paired baseline season"))
    )
  );
};

const pairedOutcomeAudit = (
  baseline: readonly CoupledSeason[],
  variant: readonly CoupledSeason[]
): CoupledOutcomeAudit => ({
  goalsPerMatch: pairedEstimate(baseline, variant, (season) => season.goalsPerMatch),
  homeGoalsPerMatch: pairedEstimate(baseline, variant, (season) => season.homeGoalsPerMatch),
  awayGoalsPerMatch: pairedEstimate(baseline, variant, (season) => season.awayGoalsPerMatch),
  drawRate: pairedEstimate(baseline, variant, (season) => season.drawRate),
  homeWinRate: pairedEstimate(baseline, variant, (season) => season.homeWinRate),
  awayWinRate: pairedEstimate(baseline, variant, (season) => season.awayWinRate),
  homePointAdvantage: pairedEstimate(baseline, variant, (season) => season.homePointAdvantage),
  pointSpread: pairedEstimate(baseline, variant, (season) => season.spread),
});

const pairedStrengthAudit = (
  baseline: readonly CoupledSeason[],
  variant: readonly CoupledSeason[]
): CoupledStrengthAudit => ({
  strongestTitleRate: pairedEstimate(baseline, variant, (season) =>
    season.strongestChampion ? 1 : 0
  ),
  topFourAccuracy: pairedEstimate(baseline, variant, (season) => season.topFourAccuracy),
  lowerHalfInTopFour: pairedEstimate(baseline, variant, (season) => season.lowerHalfInTopFour),
});

export type OutcomeExperimentProfile = CoupledOutcomeAudit &
  CoupledStrengthAudit & {
    spearmanStrengthPlace: MetricEstimate;
  };

export type OutcomeExperimentVariant = {
  id: string;
  label: string;
  impliedConstants?: CalibratedLambdaFit["impliedConstants"];
  absolute: OutcomeExperimentProfile;
  delta: OutcomeExperimentProfile;
};

export type OutcomeExperimentAudit = {
  current: OutcomeExperimentProfile;
  variants: OutcomeExperimentVariant[];
};

type NamedOutcomeConfig = CoupledConfig & {
  id: string;
  label: string;
  impliedConstants?: CalibratedLambdaFit["impliedConstants"];
};

export type CalibratedLambdaFit = {
  baseGoalsFactor: number;
  homeAdvantageFactor: number;
  impliedConstants: { baseGoals: number; homeAdvantage: number };
};

/**
 * Solves the two-constant fit against a window of real seasons: BASE alone
 * sets the away lambda, BASE * HOME sets the home one. Exported because the
 * numbers it produces are pasted into balance.ts by hand, and a factor
 * rounded for a report label is not the number to paste.
 *
 * The window is a parameter so `pnpm audit:outcome-windows` can ask what a
 * DIFFERENT range of seasons would imply without switching the calibration
 * window over. Called with no argument it still fits the eight seasons the
 * engine is calibrated against, exactly as before.
 */
export const calibratedLambdaFit = (
  seasons: readonly MatchOutcomeSeasonReference[] = MATCH_OUTCOME_REFERENCE
): CalibratedLambdaFit => {
  const reference = summarizeMatchOutcomeReference(seasons);
  const ratings = ratingsFor(startingMembership());
  const fixtures = buildFixtures([...ratings.keys()]).flat();
  const current = fixtures.reduce(
    (sum, fixture) => {
      const lambda = expectedGoals(ratings.get(fixture.home)!, ratings.get(fixture.away)!);
      return { home: sum.home + lambda.home, away: sum.away + lambda.away };
    },
    { home: 0, away: 0 }
  );
  const { baseGoalsFactor, homeAdvantageFactor } = calibrateOutcomeLambdaFactors(
    { home: current.home / fixtures.length, away: current.away / fixtures.length },
    {
      home: reference.pooled.homeGoalsPerMatch,
      away: reference.pooled.awayGoalsPerMatch,
    }
  );
  return {
    baseGoalsFactor,
    homeAdvantageFactor,
    impliedConstants: {
      baseGoals: MATCH_BASE_GOALS * baseGoalsFactor,
      homeAdvantage: MATCH_HOME_ADVANTAGE * homeAdvantageFactor,
    },
  };
};

/**
 * Refits both lambdas to the calibration window and runs the engine with the
 * result.
 *
 * Once the fitted constants are pasted into balance.ts this variant is a fixed
 * point: both factors read 1,000 and every paired delta reads zero. That is
 * the healthy state, not a broken row - a non-zero line here means the shipped
 * constants and the window have drifted apart. tests/scripts pins the same
 * property directly and fails louder; this row is where a reader of the report
 * can see it.
 *
 * Named for the window rather than for a season count, because it was called
 * "eight seasons" for two days after the window became nine.
 */
const calibratedWindowConfig = (): NamedOutcomeConfig => {
  const fit = calibratedLambdaFit();
  const factor = (value: number): string => value.toFixed(3).replace(".", ",");
  return {
    id: "calibrated-window-lambdas",
    label: `λ stron do okna kalibracji: base ×${factor(fit.baseGoalsFactor)}; home ×${factor(fit.homeAdvantageFactor)}`,
    exponent: 1,
    baseGoalsFactor: fit.baseGoalsFactor,
    homeAdvantageFactor: fit.homeAdvantageFactor,
    impliedConstants: fit.impliedConstants,
  };
};

const OUTCOME_EXPERIMENT_CONFIGS: readonly NamedOutcomeConfig[] = [
  calibratedWindowConfig(),
  // Task 6 of the rho study: the point estimate, both ends of the
  // conservative envelope, and rho = 0 as a pairing control. Imported at the
  // precision they were measured at rather than transcribed from a report
  // that prints four decimals - the draws gate's admissible window is 0.036
  // wide, so a rounded rho answers a question about a different rho.
  ...[
    { rho: RHO_ESTIMATE, name: "estymata" },
    { rho: RHO_ENVELOPE_LOWER, name: "dolny koniec obwiedni" },
    { rho: RHO_ENVELOPE_UPPER, name: "górny koniec obwiedni" },
    { rho: 0, name: "kontrola sparowania" },
  ].map(({ rho, name }) => ({
    id: `rho-study-${name.replace(/\s+/g, "-")}`,
    label: `badanie ρ: ${name} (ρ=${rho.toFixed(6)})`,
    exponent: 1,
    outcomeModel: { kind: "dixon-coles" as const, rho },
  })),
  ...[-0.04, -0.08, -0.12].map((rho) => ({
    id: `dixon-coles-${Math.abs(rho).toFixed(2)}`,
    label: `Dixon–Coles ρ=${rho.toFixed(2)}`,
    exponent: 1,
    outcomeModel: { kind: "dixon-coles" as const, rho },
  })),
  ...[0.05, 0.1, 0.15].map((covariance) => ({
    id: `shared-poisson-${covariance.toFixed(2)}`,
    label: `wspólny Poisson κ=${covariance.toFixed(2)}`,
    exponent: 1,
    outcomeModel: { kind: "shared-poisson" as const, covariance },
  })),
  ...[0.75, 0.5, 0.25].map((homeAdvantageShare) => ({
    id: `split-home-${homeAdvantageShare.toFixed(2)}`,
    label: `home ×1,10; udział ataku ${Math.round(homeAdvantageShare * 100)}%`,
    exponent: 1,
    homeAdvantageFactor: 1.1,
    homeAdvantageShare,
  })),
  ...[-0.08, -0.12].flatMap((rho) =>
    [0.5, 0.25].map((homeAdvantageShare) => ({
      id: `split-home-${homeAdvantageShare.toFixed(2)}-dixon-coles-${Math.abs(rho).toFixed(2)}`,
      label: `home ×1,10; atak ${Math.round(homeAdvantageShare * 100)}%; DC ρ=${rho.toFixed(2)}`,
      exponent: 1,
      homeAdvantageFactor: 1.1,
      homeAdvantageShare,
      outcomeModel: { kind: "dixon-coles" as const, rho },
    }))
  ),
  ...[0.1, 0.15].flatMap((covariance) =>
    [0.5, 0.25].map((homeAdvantageShare) => ({
      id: `split-home-${homeAdvantageShare.toFixed(2)}-shared-${covariance.toFixed(2)}`,
      label: `home ×1,10; atak ${Math.round(homeAdvantageShare * 100)}%; wspólny κ=${covariance.toFixed(2)}`,
      exponent: 1,
      homeAdvantageFactor: 1.1,
      homeAdvantageShare,
      outcomeModel: { kind: "shared-poisson" as const, covariance },
    }))
  ),
  {
    id: "scaled-levers-dixon-coles-0.12",
    label: "base ×0,90; home ×1,10; DC ρ=-0,12",
    exponent: 1,
    baseGoalsFactor: 0.9,
    homeAdvantageFactor: 1.1,
    outcomeModel: { kind: "dixon-coles", rho: -0.12 },
  },
  {
    id: "scaled-levers-shared-0.15",
    label: "base ×0,90; home ×1,10; wspólny κ=0,15",
    exponent: 1,
    baseGoalsFactor: 0.9,
    homeAdvantageFactor: 1.1,
    outcomeModel: { kind: "shared-poisson", covariance: 0.15 },
  },
];

const outcomeExperimentProfile = (seasons: readonly CoupledSeason[]): OutcomeExperimentProfile => ({
  ...coupledOutcomeAudit(seasons),
  ...coupledStrengthAudit(seasons),
  spearmanStrengthPlace: estimate(
    seasons.map((season) => {
      if (season.spearmanStrengthPlace === null) {
        throw new Error("outcome experiment requires non-constant strength ratings");
      }
      return season.spearmanStrengthPlace;
    })
  ),
});

const pairedOutcomeExperimentProfile = (
  baseline: readonly CoupledSeason[],
  variant: readonly CoupledSeason[]
): OutcomeExperimentProfile => ({
  ...pairedOutcomeAudit(baseline, variant),
  ...pairedStrengthAudit(baseline, variant),
  spearmanStrengthPlace: pairedEstimate(baseline, variant, (season) => {
    if (season.spearmanStrengthPlace === null) {
      throw new Error("outcome experiment requires non-constant strength ratings");
    }
    return season.spearmanStrengthPlace;
  }),
});

const runOutcomeExperiment = (contexts: readonly CoupledContext[]): OutcomeExperimentAudit => {
  const currentSeasons = contexts.map((context) => coupledSeason(context, { exponent: 1 }));
  return {
    current: outcomeExperimentProfile(currentSeasons),
    variants: OUTCOME_EXPERIMENT_CONFIGS.map(({ id, label, impliedConstants, ...config }) => {
      const seasons = contexts.map((context) => coupledSeason(context, config));
      return {
        id,
        label,
        impliedConstants,
        absolute: outcomeExperimentProfile(seasons),
        delta: pairedOutcomeExperimentProfile(currentSeasons, seasons),
      };
    }),
  };
};

const pairedDecomposition = (contexts: readonly CoupledContext[]): DecompositionAudit => {
  const run = (config: CoupledConfig): CoupledSeason[] =>
    contexts.map((context) => coupledSeason(context, config));
  const neutral = run({ exponent: 0 });
  const current = run({ exponent: 1 });
  const wider = run({ exponent: 1.5 });
  const lowerBaseGoals = run({ exponent: 1, baseGoalsFactor: 0.9 });
  const higherHomeAdvantage = run({ exponent: 1, homeAdvantageFactor: 1.1 });
  const combined = run({ exponent: 1, baseGoalsFactor: 0.9, homeAdvantageFactor: 1.1 });
  const currentOutcomes = coupledOutcomeAudit(current);
  return {
    neutralSpread: estimate(neutral.map((season) => season.spread)),
    currentSpread: estimate(current.map((season) => season.spread)),
    widerSpread: estimate(wider.map((season) => season.spread)),
    currentMinusNeutral: estimate(
      current.map((season, index) => season.spread - at(neutral, index, "neutral season").spread)
    ),
    widerMinusCurrent: estimate(
      wider.map((season, index) => season.spread - at(current, index, "current season").spread)
    ),
    analyticalNeutralSpread: analyticalPointSpread(0),
    analyticalCurrentSpread: analyticalPointSpread(1),
    analyticalWiderSpread: analyticalPointSpread(1.5),
    ratingVariants: {
      neutral: coupledStrengthAudit(neutral),
      current: coupledStrengthAudit(current),
      wider: coupledStrengthAudit(wider),
    },
    ratingDeltas: {
      currentMinusNeutral: pairedStrengthAudit(neutral, current),
      widerMinusCurrent: pairedStrengthAudit(current, wider),
    },
    levers: {
      current: currentOutcomes,
      lowerBaseGoals: coupledOutcomeAudit(lowerBaseGoals),
      higherHomeAdvantage: coupledOutcomeAudit(higherHomeAdvantage),
      combined: coupledOutcomeAudit(combined),
    },
    leverDeltas: {
      lowerBaseGoals: pairedOutcomeAudit(current, lowerBaseGoals),
      higherHomeAdvantage: pairedOutcomeAudit(current, higherHomeAdvantage),
      combined: pairedOutcomeAudit(current, combined),
    },
  };
};

export type BatchAudit = {
  index: number;
  seedRoot: number;
  n: number;
  snapshotSpread: MetricEstimate;
  postPromotionSpread: MetricEstimate;
  strongestTitleRate: MetricEstimate;
};

export type MatchEngineAudit = {
  options: AuditOptions;
  snapshot: CohortAudit;
  postPromotion: CohortAudit;
  decomposition: DecompositionAudit;
  promotedChampion: MetricEstimate;
  promotedClubTitleRate: MetricEstimate;
  previousChampionRelegated: MetricEstimate;
  batches: BatchAudit[];
  outcomeExperiment: OutcomeExperimentAudit | null;
};

export const runMatchEngineAudit = (options: AuditOptions): MatchEngineAudit => {
  if (options.runs <= 0 || !Number.isInteger(options.runs))
    throw new Error("runs must be positive");
  if (
    options.batches <= 0 ||
    options.batches > options.runs ||
    !Number.isInteger(options.batches)
  ) {
    throw new Error("batches must be a positive integer no greater than runs");
  }
  const seedEntries = independentSeedEntries(options);
  const seeds = seedEntries.map(({ seed }) => seed);
  const coupledContexts = seeds.map(coupledContext);
  const chains = seedEntries.map(({ seed, batch }) => runChain(seed, batch));
  const snapshotRaw = chains.map((chain) => chain.snapshot);
  const postRaw = chains.map((chain) => chain.postPromotion);
  const snapshot = aggregateCohort(snapshotRaw);
  const postPromotion = aggregateCohort(postRaw);
  const promotedChampionValues = chains.map((chain) => chain.promotedChampion);
  return {
    options,
    snapshot,
    postPromotion,
    decomposition: pairedDecomposition(coupledContexts),
    promotedChampion: binaryEstimate(promotedChampionValues),
    promotedClubTitleRate: estimate(
      promotedChampionValues.map((champion) => (champion ? 1 : 0) / RELEGATED_COUNT)
    ),
    previousChampionRelegated: binaryEstimate(
      chains.map((chain) => chain.previousChampionRelegated)
    ),
    outcomeExperiment: options.outcomeExperiments ? runOutcomeExperiment(coupledContexts) : null,
    batches: Array.from({ length: options.batches }, (_, index) => {
      const snapshotBatch = aggregateCohort(snapshotRaw.filter((season) => season.batch === index));
      const postBatch = aggregateCohort(postRaw.filter((season) => season.batch === index));
      return {
        index: index + 1,
        seedRoot: seedEntries.find((entry) => entry.batch === index)!.seedRoot,
        n: snapshotBatch.n,
        snapshotSpread: snapshotBatch.pointSpread,
        postPromotionSpread: postBatch.pointSpread,
        strongestTitleRate: snapshotBatch.strongestTitleRate,
      };
    }),
  };
};
