/**
 * Synthetic Dixon-Coles leagues, for validating the estimator against a rho
 * that is known because we chose it.
 *
 * Deliberately does NOT import the likelihood. It builds the joint
 * probability table cell by cell from the model definition and samples it by
 * inverse CDF, where the likelihood evaluates one cell and differentiates it.
 * Sharing code between the two would let a sign error in tau agree with
 * itself and pass every test - the plan names this as a hard requirement.
 *
 * Randomness comes from src/logic/rng, never Math.random: a power analysis
 * nobody can rerun bit for bit is an anecdote.
 */
import { createRng, type Rng } from "../../src/logic/rng";
import type { DcMatch } from "./dixon-coles";
import { at } from "../../src/logic/invariant";

/** Goals per side beyond which the Poisson tail is numerically irrelevant.
 * At lambda = 5 the mass above 20 is below 1e-7. */
const MAX_GOALS = 20;

const poissonPmf = (lambda: number, upTo: number): number[] => {
  const pmf = new Array<number>(upTo + 1);
  let term = Math.exp(-lambda);
  pmf[0] = term;
  for (let k = 1; k <= upTo; k += 1) {
    term = (term * lambda) / k;
    pmf[k] = term;
  }
  return pmf;
};

/**
 * The full corrected joint distribution of a scoreline, normalised.
 *
 * The correction is written here as its own four literal cases rather than
 * borrowed, for the independence reason in the file header. It also carries
 * its own feasibility check: a non-positive cell means the caller asked for a
 * rho the rates do not admit, and that must stop the run rather than quietly
 * produce a truncated distribution.
 */
export const jointScorelinePmf = (lambda: number, mu: number, rho: number): number[][] => {
  const home = poissonPmf(lambda, MAX_GOALS);
  const away = poissonPmf(mu, MAX_GOALS);
  const table: number[][] = [];
  let total = 0;
  for (let x = 0; x <= MAX_GOALS; x += 1) {
    const row = new Array<number>(MAX_GOALS + 1);
    for (let y = 0; y <= MAX_GOALS; y += 1) {
      let correction = 1;
      if (x === 0 && y === 0) correction = 1 - lambda * mu * rho;
      else if (x === 0 && y === 1) correction = 1 + lambda * rho;
      else if (x === 1 && y === 0) correction = 1 + mu * rho;
      else if (x === 1 && y === 1) correction = 1 - rho;
      // Strictly positive, matching lowScoresStayPositive and applyDixonColes.
      // A zero cell is a scoreline the model says can happen that can never be
      // drawn, and a generator whose admissible domain differs from the
      // likelihood's can hand the estimator data the estimator rejects - in
      // two files whose entire value is that they were written independently.
      if (correction <= 0 && (x <= 1 || y <= 1)) {
        throw new Error(`rho=${rho} leaves P(${x}:${y}) at zero for lambda=${lambda}, mu=${mu}`);
      }
      const cell =
        at(home, x, "home goal probability") * at(away, y, "away goal probability") * correction;
      row[y] = cell;
      total += cell;
    }
    table.push(row);
  }
  // The correction preserves both marginals exactly, so this only ever
  // removes the truncated tail. A drift beyond that is a bug in the table.
  if (Math.abs(total - 1) > 1e-6) {
    throw new Error(`scoreline table sums to ${total}, which the correction cannot explain`);
  }
  for (const row of table) {
    for (const [y, cell] of row.entries()) row[y] = cell / total;
  }
  return table;
};

const sampleScoreline = (rng: Rng, table: readonly number[][]): { home: number; away: number } => {
  let remaining = rng.next();
  for (const [x, row] of table.entries()) {
    for (const [y, cell] of row.entries()) {
      remaining -= cell;
      if (remaining <= 0) return { home: x, away: y };
    }
  }
  // Unreachable: the table sums to one to within 1e-16 and Mulberry32 never
  // returns 1. Falling back to 20:20 anyway would have been the worst
  // possible choice for a study about draws - a silent leak would have
  // manufactured level scorelines. Throwing says so instead.
  throw new Error("scoreline sampling fell off the end of a normalised table");
};

/** The parameters a synthetic league is generated from - the answer the
 * estimator is supposed to recover. */
export type DcTruth = {
  attack: readonly (readonly number[])[];
  defence: readonly (readonly number[])[];
  home: readonly number[];
  rho: number;
};

/** Every club meets every other twice per season, home and away. */
export const doubleRoundRobin = (
  seasons: number,
  clubs: number
): { season: number; home: number; away: number }[] => {
  const fixtures: { season: number; home: number; away: number }[] = [];
  for (let season = 0; season < seasons; season += 1) {
    for (let home = 0; home < clubs; home += 1) {
      for (let away = 0; away < clubs; away += 1) {
        if (home !== away) fixtures.push({ season, home, away });
      }
    }
  }
  return fixtures;
};

/**
 * A league whose strengths are spread deterministically rather than drawn, so
 * that two runs of the power analysis differ only in the goals - which is the
 * variation the analysis is about.
 */
export const evenlySpreadTruth = (seasons: number, clubs: number, rho: number): DcTruth => {
  const attack: number[][] = [];
  const defence: number[][] = [];
  const home: number[] = [];
  for (let season = 0; season < seasons; season += 1) {
    const seasonAttack: number[] = [];
    const seasonDefence: number[] = [];
    for (let club = 0; club < clubs; club += 1) {
      const position = clubs === 1 ? 0 : club / (clubs - 1) - 0.5;
      seasonAttack.push(position * 0.8);
      seasonDefence.push(-position * 0.6 + ((season % 3) - 1) * 0.05);
    }
    const mean = seasonAttack.reduce((a, b) => a + b, 0) / clubs;
    attack.push(seasonAttack.map((value) => value - mean));
    defence.push(seasonDefence);
    home.push(0.25);
  }
  return { attack, defence, home, rho };
};

/** Home and away scoring rates of one fixture under a known truth. */
export const truthRates = (
  truth: DcTruth,
  fixture: { season: number; home: number; away: number }
): { lambda: number; mu: number } => {
  const attack = at(truth.attack, fixture.season, "season attack");
  const defence = at(truth.defence, fixture.season, "season defence");
  return {
    lambda: Math.exp(
      at(attack, fixture.home, "home attack") +
        at(defence, fixture.away, "away defence") +
        at(truth.home, fixture.season, "season home effect")
    ),
    mu: Math.exp(
      at(attack, fixture.away, "away attack") + at(defence, fixture.home, "home defence")
    ),
  };
};

export const simulateLeague = (
  seed: number,
  truth: DcTruth,
  fixtures: readonly { season: number; home: number; away: number }[]
): DcMatch[] => {
  const rng = createRng(seed);
  const tables = new Map<string, number[][]>();
  return fixtures.map((fixture) => {
    const { lambda, mu } = truthRates(truth, fixture);
    const key = `${fixture.season}|${fixture.home}|${fixture.away}`;
    let table = tables.get(key);
    if (!table) {
      table = jointScorelinePmf(lambda, mu, truth.rho);
      tables.set(key, table);
    }
    const score = sampleScoreline(rng, table);
    return {
      season: fixture.season,
      home: fixture.home,
      away: fixture.away,
      homeGoals: score.home,
      awayGoals: score.away,
    };
  });
};
