/**
 * Everything zadanie 4 of the rho study needs between the pinned CSV and a
 * report: window selection, the two resampling schemes, and the season-level
 * diagnostics.
 *
 * Split from the CLI so that each piece is callable from a test without a
 * file path or a console, and split from dixon-coles.ts so that the estimator
 * stays ignorant of where matches come from.
 */
import { clubStrengths, homeEffect, type DcLayout, type DcMatch } from "./dixon-coles";
import {
  fitProfile,
  profileInterval,
  type ProfileFit,
  type ProfileOptions,
} from "./dixon-coles-profile";
import { jointScorelinePmf, truthRates, type DcTruth } from "./dixon-coles-simulate";
import {
  ALL_SEASONS,
  CALIBRATION_WINDOW,
  bySeason,
  readPinnedResults,
} from "../match-engine-audit-reference";
import { quantile, spearmanRankCorrelation } from "../stats";
import { createRng } from "../../src/logic/rng";
import type { ProgressSink } from "./progress";
import { TEAM_RATINGS } from "../../src/data/team-ratings";
import { at } from "../../src/logic/invariant";

/** Matches of one window, plus the club names behind each per-season index -
 * the transportability table needs the names back. */
export type RhoWindow = {
  seasons: readonly string[];
  matches: readonly DcMatch[];
  clubs: readonly (readonly string[])[];
};

export const buildWindow = (seasons: readonly string[]): RhoWindow => {
  const grouped = bySeason(readPinnedResults());
  const clubs: string[][] = [];
  const matches: DcMatch[] = [];
  seasons.forEach((season, index) => {
    const played = grouped.get(season);
    if (!played) throw new Error(`the results CSV holds no season "${season}"`);
    const names: string[] = [];
    const indexOf = (club: string): number => {
      const seen = names.indexOf(club);
      if (seen >= 0) return seen;
      names.push(club);
      return names.length - 1;
    };
    for (const row of played) {
      matches.push({
        season: index,
        home: indexOf(row.home),
        away: indexOf(row.away),
        homeGoals: row.homeGoals,
        awayGoals: row.awayGoals,
      });
    }
    clubs.push(names);
  });
  return { seasons, matches, clubs };
};

/** The fitted parameters, re-expressed as something the synthetic generator
 * can draw from. Rho is passed in rather than read off the fit, because the
 * parametric bootstrap draws under the NULL, not under the estimate. */
export const truthFromFit = (layout: DcLayout, params: Float64Array, rho: number): DcTruth => {
  const attack: number[][] = [];
  const defence: number[][] = [];
  const home: number[] = [];
  for (let season = 0; season < layout.seasons; season += 1) {
    const seasonAttack: number[] = [];
    const seasonDefence: number[] = [];
    const clubs = at(layout.clubsPerSeason, season, "clubs in season");
    for (let club = 0; club < clubs; club += 1) {
      const strength = clubStrengths(layout, params, season, club);
      seasonAttack.push(strength.attack);
      seasonDefence.push(strength.defence);
    }
    attack.push(seasonAttack);
    defence.push(seasonDefence);
    home.push(homeEffect(layout, params, season));
  }
  return { attack, defence, home, rho };
};

/**
 * Redraws every fixture from the fitted rates, keeping the fixture list.
 *
 * Written here rather than reused from simulateLeague because that helper
 * takes fixtures without goals, and a bootstrap replicate is exactly the same
 * fixture list with new goals - passing the real matches through would risk
 * carrying a goal count across by accident.
 */
export const redrawFrom = (
  seed: number,
  truth: DcTruth,
  matches: readonly DcMatch[]
): DcMatch[] => {
  const rng = createRng(seed);
  const tables = new Map<string, number[][]>();
  return matches.map((match) => {
    const key = `${match.season}|${match.home}|${match.away}`;
    let table = tables.get(key);
    if (!table) {
      const { lambda, mu } = truthRates(truth, match);
      table = jointScorelinePmf(lambda, mu, truth.rho);
      tables.set(key, table);
    }
    let remaining = rng.next();
    let homeGoals = table.length - 1;
    let awayGoals = table.length - 1;
    outer: for (const [x, row] of table.entries()) {
      for (const [y, cell] of row.entries()) {
        remaining -= cell;
        if (remaining <= 0) {
          homeGoals = x;
          awayGoals = y;
          break outer;
        }
      }
    }
    return { season: match.season, home: match.home, away: match.away, homeGoals, awayGoals };
  });
};

/** Keeps a retry's random start independent of which replicate drew it. */
const RESTART_STREAM_OFFSET = 0x57a47;

export type BootstrapRun = {
  /** Every value the run produced, in replication order. */
  values: number[];
  /** Replications that still threw after every retry. */
  failures: number;
  /** How many the protocol asked for. Quantiles and p-values are computed
   * against THIS, not against values.length: dividing by the surviving count
   * silently rescales the distribution the whole run exists to estimate, and
   * a replication that fails is not a replication that landed low. */
  requested: number;
};

/**
 * One profile fit, retried from fresh random starts before it counts as a
 * failure. Most failures are a line search that cannot follow a curvature
 * history built somewhere awkward, and a different start clears them.
 */
export const fitWithRetries = (
  matches: readonly DcMatch[],
  options: ProfileOptions,
  retries = 3
): ProfileFit => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return fitProfile(
        matches,
        attempt === 0 ? options : { starts: 2, seed: (options.seed ?? 1) + 7919 * attempt }
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

/**
 * Parametric bootstrap of the likelihood-ratio statistic under rho = 0, with
 * every parameter refitted on each replicate.
 *
 * The plan forbids reading the null distribution off an asymptotic
 * chi-square: with 347 parameters and a bounded domain, asymptotics are an
 * assumption, not a fact - and the power run measured how far off they are.
 */
export const parametricBootstrap = (
  window: RhoWindow,
  fit: ProfileFit,
  replications: number,
  baseSeed: number,
  onProgress?: ProgressSink
): BootstrapRun => {
  // The restricted MLE, not the unrestricted one with rho zeroed out. A
  // parametric bootstrap of a likelihood-ratio test simulates under the null
  // model that was actually fitted under the null; using the alternative's
  // nuisance parameters draws from a different model and moves the
  // distribution the p-value is read from.
  const nullTruth = truthFromFit(fit.layout, fit.nullParams, 0);
  const values: number[] = [];
  let failures = 0;
  for (let replicate = 0; replicate < replications; replicate += 1) {
    const redrawn = redrawFrom(baseSeed + replicate, nullTruth, window.matches);
    try {
      values.push(
        fitWithRetries(redrawn, {
          starts: 1,
          start: fit.nullParams,
          // Offset stream. Feeding the redraw seed straight into the restarts
          // makes a retry's random start a deterministic function of which
          // dataset it is retrying. The staff-confidence draws follow the same
          // rule for the same reason: a shared stream couples two things by
          // accident.
          seed: baseSeed + replicate + RESTART_STREAM_OFFSET,
        }).likelihoodRatio
      );
    } catch {
      failures += 1;
    }
    onProgress?.(replicate + 1, replications);
  }
  return { values, failures, requested: replications };
};

/**
 * Block bootstrap over seasons: whole seasons are drawn with replacement and
 * re-indexed as separate blocks, so a season drawn twice gets two independent
 * sets of club parameters.
 *
 * Seasons are the block because that is the level the model's nuisance
 * parameters live at. Resampling matches would break the club structure the
 * whole study exists to control for.
 */
/**
 * One block resample: whole seasons drawn with replacement and RE-INDEXED by
 * the loop position, not by the season drawn.
 *
 * The re-indexing is the load-bearing line. It gives a season drawn twice two
 * independent sets of club parameters, which is what makes the blocks share
 * nothing but rho - and that in turn is what makes the profiled likelihood
 * separate across them. Collapsing the copies back onto their original season
 * index would look like a simplification and would silently destroy both the
 * independence and the separability, so a test pins it.
 *
 * Returns the weights as well as the matches, so a paired comparison can put
 * two implementations on identical draws instead of merely similar ones.
 */
export const blockResample = (
  window: RhoWindow,
  seed: number
): { matches: DcMatch[]; weights: number[] } => {
  const seasonCount = window.seasons.length;
  const grouped: DcMatch[][] = Array.from({ length: seasonCount }, () => []);
  for (const match of window.matches) at(grouped, match.season, "season block").push(match);
  const rng = createRng(seed);
  const weights = new Array<number>(seasonCount).fill(0);
  const matches: DcMatch[] = [];
  for (let block = 0; block < seasonCount; block += 1) {
    const drawn = Math.floor(rng.next() * seasonCount);
    weights[drawn] = at(weights, drawn, "block weight") + 1;
    for (const match of at(grouped, drawn, "season block"))
      matches.push({ ...match, season: block });
  }
  return { matches, weights };
};

/**
 * Block bootstrap over seasons.
 *
 * Seasons are the block because that is the level the model's nuisance
 * parameters live at. Resampling matches would break the club structure the
 * whole study exists to control for.
 */
export const blockBootstrap = (
  window: RhoWindow,
  replications: number,
  baseSeed: number
): BootstrapRun => {
  const values: number[] = [];
  let failures = 0;
  for (let replicate = 0; replicate < replications; replicate += 1) {
    const { matches } = blockResample(window, baseSeed + replicate);
    try {
      values.push(
        fitWithRetries(matches, {
          starts: 1,
          seed: baseSeed + replicate + RESTART_STREAM_OFFSET,
        }).rho
      );
    } catch {
      failures += 1;
    }
  }
  return { values, failures, requested: replications };
};

/** Percentile interval of a bootstrap distribution. */
export const percentileInterval = (
  values: readonly number[],
  level: number
): { lower: number; upper: number } => ({
  lower: quantile(values, (1 - level) / 2),
  upper: quantile(values, 1 - (1 - level) / 2),
});

/**
 * Percentile interval that refuses to pretend the failed replications did not
 * happen, by placing them where they hurt: all of them below the lower tail
 * when computing the lower end, all of them above the upper tail when
 * computing the upper end.
 *
 * Both the index arithmetic and the index convention matter, and getting
 * either wrong narrows the interval - the one direction that must never
 * happen here.
 *
 * The tail position is `p * (requested - 1)`, matching quantile() and taken
 * against the count the protocol ASKED for rather than the count that came
 * back. Then, among the sorted survivors:
 *
 *   lower = survivor[tail - failures]        the failures sit below it
 *   upper = survivor[requested - 1 - tail]   the failures sit ABOVE it, so
 *                                            this index is NOT shifted
 *
 * Shifting the upper index by the failures too moves it inward and returns a
 * narrower interval than the run supports. An end whose index falls outside
 * the survivors is an end the failures alone could have filled; it comes back
 * infinite, which is a true statement about what the run knows and impossible
 * to misread in a report.
 *
 * With 2000 requested, 10 failed and a 99% level, both ends are infinite: each
 * tail is 9.995 values wide and ten of them are missing.
 */
export const conservativePercentileInterval = (
  run: BootstrapRun,
  level: number
): { lower: number; upper: number; estimable: boolean } => {
  if (run.requested < 2) throw new Error("a percentile interval needs at least two replications");
  if (level <= 0 || level >= 1) {
    throw new Error(`level must be strictly inside (0, 1), got ${level}`);
  }
  const sorted = [...run.values].sort((a, b) => a - b);
  const tail = ((1 - level) / 2) * (run.requested - 1);
  const lowerIndex = tail - run.failures;
  const upperIndex = run.requested - 1 - tail;
  const last = sorted.length - 1;

  const interpolate = (index: number): number => {
    const low = Math.floor(index);
    const high = Math.ceil(index);
    const lowValue = at(sorted, low, "sorted replicate");
    return low === high
      ? lowValue
      : lowValue * (high - index) + at(sorted, high, "sorted replicate") * (index - low);
  };

  const lowerKnown = sorted.length > 0 && lowerIndex >= 0;
  const upperKnown = sorted.length > 0 && upperIndex <= last;
  return {
    lower: lowerKnown ? interpolate(lowerIndex) : Number.NEGATIVE_INFINITY,
    upper: upperKnown ? interpolate(upperIndex) : Number.POSITIVE_INFINITY,
    estimable: lowerKnown && upperKnown,
  };
};

/**
 * Monte Carlo p-value as an INTERVAL, with the observed statistic counted in
 * so it can never be exactly zero.
 *
 * The two ends bracket what the failed replications could have been: `lower`
 * assumes every one of them fell below the observed statistic, `upper` that
 * every one exceeded it. When the interval straddles the decision threshold
 * the run has not decided anything and has to be repeated - which is a very
 * different statement from quietly reporting the point value computed on the
 * survivors.
 */
export const bootstrapPValue = (
  run: BootstrapRun,
  observed: number
): { lower: number; upper: number } => {
  const exceeded = run.values.filter((value) => value >= observed).length;
  return {
    lower: (exceeded + 1) / (run.requested + 1),
    upper: (exceeded + run.failures + 1) / (run.requested + 1),
  };
};

/** Rho refitted season by season. Diagnostics of stability only - the study's
 * rho is common across seasons by design (chapter 3 of the plan). */
export const rhoPerSeason = (window: RhoWindow): { season: string; rho: number | null }[] =>
  window.seasons.map((season, index) => {
    const only = window.matches
      .filter((match) => match.season === index)
      .map((match) => ({ ...match, season: 0 }));
    try {
      return { season, rho: fitProfile(only, { starts: 1 }).rho };
    } catch {
      return { season, rho: null };
    }
  });

/** Envelope of two intervals, which is what the plan makes decide verdict A
 * against B: the widest of the profile and the block bootstrap. */
export const conservativeEnvelope = (
  first: { lower: number; upper: number },
  second: { lower: number; upper: number }
): { lower: number; upper: number } => ({
  lower: Math.min(first.lower, second.lower),
  upper: Math.max(first.upper, second.upper),
});

export { profileInterval };

/**
 * Fitted club strengths of one season set against the pinned TEAM_RATINGS.
 *
 * Diagnostics only, and for a reason: TEAM_RATINGS
 * carries snapshotDate 2026-08-13 and describes TODAY's league - Wieczysta is
 * in it and is absent from a CSV that stops at 2024/25. These are not the
 * same clubs at the same moment nor the same parameter scale, so a rank
 * correlation between them mostly measures that strong clubs tend to stay
 * strong. Settling transportability would need pinned historical snapshots,
 * which this repository does not have and this study does not obtain.
 *
 * Defence flips sign on the way across: TEAM_RATINGS scores a good defence
 * high, while in the model defence enters the OPPONENT's rate, so a good
 * defence is negative.
 */
export type Transportability = {
  matched: number;
  unmatched: readonly string[];
  attackCorrelation: number | null;
  defenceCorrelation: number | null;
};

export const transportability = (
  window: RhoWindow,
  fit: ProfileFit,
  season: number
): Transportability => {
  const names = at(window.clubs, season, "season club names");
  const fitAttack: number[] = [];
  const fitDefence: number[] = [];
  const ratedAttack: number[] = [];
  const ratedDefence: number[] = [];
  const unmatched: string[] = [];
  names.forEach((name, club) => {
    const rated = TEAM_RATINGS.clubs.find(
      (entry) => entry.nazwa === name || name.includes(entry.krotko)
    );
    if (!rated) {
      unmatched.push(name);
      return;
    }
    const strength = clubStrengths(fit.layout, fit.params, season, club);
    fitAttack.push(strength.attack);
    fitDefence.push(-strength.defence);
    ratedAttack.push(rated.attack);
    ratedDefence.push(rated.defence);
  });
  const correlate = (a: number[], b: number[]): number | null =>
    a.length >= 3 ? spearmanRankCorrelation(a, b) : null;
  return {
    matched: fitAttack.length,
    unmatched,
    attackCorrelation: correlate(fitAttack, ratedAttack),
    defenceCorrelation: correlate(fitDefence, ratedDefence),
  };
};

/**
 * Draw share the fitted model implies, summed over the real fixture list
 * rather than simulated. Takes the parameters explicitly, because the row
 * "fitted without tau" has to come from the CONSTRAINED fit at rho = 0 and
 * not from the alternative's parameters with rho zeroed - the same
 * distinction the parametric bootstrap turns on. Answers the question that started the study - how
 * much of the engine's 1.45 pp draw gap a fitted rho would close - without
 * spending a single random draw on it.
 */
export const impliedDrawShare = (
  window: RhoWindow,
  layout: DcLayout,
  params: Float64Array,
  rho: number
): number => {
  const truth = truthFromFit(layout, params, rho);
  let total = 0;
  for (const match of window.matches) {
    const { lambda, mu } = truthRates(truth, match);
    const table = jointScorelinePmf(lambda, mu, rho);
    let draw = 0;
    for (const [goals, row] of table.entries()) draw += at(row, goals, "draw cell");
    total += draw;
  }
  return (total / window.matches.length) * 100;
};

/** docs/decisions/rho-estimator-method.md fixes these. Lowering one is a
 * change to the protocol, not a convenience. */
export const DEFAULT_LRT_REPLICATIONS = 5000;
export const DEFAULT_BLOCK_REPLICATIONS = 2000;
const SENSITIVITY_REPLICATIONS = 2000;
const SENSITIVITY_SEED_OFFSET = 500_000;

/**
 * The single pre-registered escalation, from
 * docs/decisions/rho-estimator-method.md: a p-value landing within three
 * Monte Carlo standard errors of the 0.01 threshold at B = 5000 buys exactly
 * one repeat at B = 20000, and that repeat decides.
 */
export const ESCALATION_BAND = { lower: 0.0058, upper: 0.0142 };
export const ESCALATION_REPLICATIONS = 20000;

export type RunOptions = {
  lrtReplications: number;
  blockReplications: number;
  seedShift: number;
};

export type WindowPlan = {
  name: string;
  seasons: readonly string[];
  lrtReplications: number;
  blockReplications: number;
  seedOffset: number;
};

/**
 * Which windows run, with which replication counts and which seed offsets.
 *
 * Pulled out of main() so it can be tested, after --seed turned out to reach
 * only the sensitivity window while the main ten-season bootstrap always got
 * offset zero. Nothing about parsing a flag would have caught that; what was
 * wrong was where the parsed value went.
 */
export const planRun = (options: RunOptions): WindowPlan[] => [
  {
    name: "dziesięć sezonów",
    seasons: ALL_SEASONS,
    lrtReplications: options.lrtReplications,
    blockReplications: options.blockReplications,
    seedOffset: options.seedShift,
  },
  {
    name: "dziewięć sezonów",
    seasons: CALIBRATION_WINDOW,
    lrtReplications: Math.min(options.lrtReplications, SENSITIVITY_REPLICATIONS),
    blockReplications: Math.min(options.blockReplications, SENSITIVITY_REPLICATIONS),
    seedOffset: SENSITIVITY_SEED_OFFSET + options.seedShift,
  },
];

export type ReportStatus = "smoke" | "escalation-owed" | "inconclusive" | "final";

/**
 * Whether a run may call itself final.
 *
 * The protocol's replication counts are binding, so a run below them is a
 * smoke run whatever its p-value does - without this the tool stamped
 * "ostateczny" on two replications that happened to miss the escalation band.
 */
export const reportStatus = (
  pValue: { lower: number; upper: number },
  options: RunOptions
): ReportStatus => {
  if (
    options.lrtReplications < DEFAULT_LRT_REPLICATIONS ||
    options.blockReplications < DEFAULT_BLOCK_REPLICATIONS
  ) {
    return "smoke";
  }
  // A p-value bracketed across 0.01 by failed replications has not decided
  // which side of the threshold it is on. Below the escalation count that is
  // what the one repeat is for; at or above it there is no further run, and
  // the honest label is inconclusive rather than final. There is no third
  // attempt in either direction.
  const straddles = pValue.lower <= 0.01 && pValue.upper > 0.01;
  if (straddles && options.lrtReplications >= ESCALATION_REPLICATIONS) return "inconclusive";
  const inBand = pValue.upper >= ESCALATION_BAND.lower && pValue.lower <= ESCALATION_BAND.upper;
  return options.lrtReplications < ESCALATION_REPLICATIONS && inBand ? "escalation-owed" : "final";
};
