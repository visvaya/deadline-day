import { describe, expect, it } from "vitest";

import {
  buildLayout,
  clubStrengths,
  feasibleRhoRange,
  fitAtRho,
  homeEffect,
  negativeLogLikelihood,
  tau,
} from "../../../scripts/rho/dixon-coles";
import { devianceAt, fitProfile, profileInterval } from "../../../scripts/rho/dixon-coles-profile";
import {
  doubleRoundRobin,
  evenlySpreadTruth,
  jointScorelinePmf,
  simulateLeague,
} from "../../../scripts/rho/dixon-coles-simulate";

/** Small enough to fit in milliseconds, large enough that the estimator has
 * something to find. Everything below shares it so the whole file stays in
 * `pnpm verify` - the heavy validation is `pnpm audit:rho-power`. */
const TRUE_RHO = -0.08;
const fixtures = doubleRoundRobin(5, 12);
const truth = evenlySpreadTruth(5, 12, TRUE_RHO);
const league = simulateLeague(0x5eed, truth, fixtures);

const probe = (dim: number): Float64Array => {
  const point = new Float64Array(dim);
  for (let k = 0; k < dim; k += 1) point[k] = Math.sin(k * 1.7) * 0.2;
  return point;
};

describe("Dixon-Coles likelihood", () => {
  it("matches the analytic gradient against central differences", () => {
    const layout = buildLayout(league);
    const point = probe(layout.dim);
    const analytic = new Float64Array(layout.dim);
    negativeLogLikelihood(layout, league, point, -0.05, analytic);
    for (const index of [0, 3, 11, 60, 119, layout.dim - 1]) {
      const epsilon = 1e-6;
      const saved = point[index]!;
      point[index] = saved + epsilon;
      const up = negativeLogLikelihood(layout, league, point, -0.05);
      point[index] = saved - epsilon;
      const down = negativeLogLikelihood(layout, league, point, -0.05);
      point[index] = saved;
      const numeric = (up - down) / (2 * epsilon);
      expect(Math.abs(numeric - analytic[index]!)).toBeLessThan(
        1e-5 * Math.max(1, Math.abs(numeric))
      );
    }
  });

  it("reduces to independent Poisson at rho = 0", () => {
    const layout = buildLayout(league);
    const point = probe(layout.dim);
    // Rebuilt here from the model definition rather than from the module, so
    // an error in the shared rate code cannot cancel itself out.
    const attack = (season: number, club: number): number => {
      const offset = layout.atkOffset[season];
      const count = layout.clubsPerSeason[season];
      let sum = 0;
      for (let k = 0; k < count!; k += 1) sum += point[offset! + k]!;
      return point[offset! + club]! - sum / count!;
    };
    let expected = 0;
    for (const match of league) {
      const lambda = Math.exp(
        attack(match.season, match.home) +
          point[layout.defOffset[match.season]! + match.away]! +
          point[layout.homeOffset + match.season]!
      );
      const mu = Math.exp(
        attack(match.season, match.away) + point[layout.defOffset[match.season]! + match.home]!
      );
      expected += lambda + mu - match.homeGoals * Math.log(lambda) - match.awayGoals * Math.log(mu);
    }
    expect(negativeLogLikelihood(layout, league, point, 0)).toBeCloseTo(expected, 9);
  });

  it("is invariant to shifting a season's attacks by a constant", () => {
    const layout = buildLayout(league);
    const point = probe(layout.dim);
    const shifted = Float64Array.from(point);
    for (let k = 0; k < layout.clubsPerSeason[2]!; k += 1)
      shifted[layout.atkOffset[2]! + k]! += 0.37;
    expect(negativeLogLikelihood(layout, league, shifted, -0.05)).toBeCloseTo(
      negativeLogLikelihood(layout, league, point, -0.05),
      9
    );
  });

  it("refuses a rho that drives any low score non-positive", () => {
    const layout = buildLayout(league);
    const point = new Float64Array(layout.dim);
    const range = feasibleRhoRange(layout, league, point);
    expect(negativeLogLikelihood(layout, league, point, range.lower * 1.5)).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(Number.isFinite(negativeLogLikelihood(layout, league, point, range.lower * 0.9))).toBe(
      true
    );
  });

  it("reports club strengths on the identified scale, whatever the offset", () => {
    const layout = buildLayout(league);
    const point = probe(layout.dim);
    const shifted = Float64Array.from(point);
    for (let k = 0; k < layout.clubsPerSeason[1]!; k += 1)
      shifted[layout.atkOffset[1]! + k]! += 0.9;
    const before = clubStrengths(layout, point, 1, 4);
    const after = clubStrengths(layout, shifted, 1, 4);
    expect(after.attack).toBeCloseTo(before.attack, 12);
    expect(after.defence).toBeCloseTo(before.defence, 12);
    // Attacks within a season sum to zero once identified.
    let total = 0;
    for (let club = 0; club < layout.clubsPerSeason[1]!; club += 1) {
      total += clubStrengths(layout, shifted, 1, club).attack;
    }
    expect(total).toBeCloseTo(0, 12);
    expect(homeEffect(layout, point, 1)).toBe(point[layout.homeOffset + 1]);
  });

  it("refuses a point where an UNOBSERVED low score would go negative", () => {
    // lambda = mu = 3 admits rho only up to 1/9. At rho = 0.2, tau(0,0) is
    // 1 - 9 * 0.2 = -0.8, and the likelihood must reject the point even
    // though the match that was played finished 2:2 and has tau = 1.
    const played = [{ season: 0, home: 0, away: 1, homeGoals: 2, awayGoals: 2 }];
    const layout = buildLayout(played);
    const point = new Float64Array(layout.dim);
    point[layout.homeOffset] = Math.log(3);
    point[layout.defOffset[0]!] = Math.log(3);
    point[layout.defOffset[0]! + 1] = 0;
    const rates = feasibleRhoRange(layout, played, point);
    expect(rates.upper).toBeLessThan(0.2);
    expect(negativeLogLikelihood(layout, played, point, 0.2)).toBe(Number.POSITIVE_INFINITY);
    expect(Number.isFinite(negativeLogLikelihood(layout, played, point, rates.upper * 0.9))).toBe(
      true
    );
  });

  it("keeps tau at one away from the four low scores", () => {
    expect(tau(2, 1, 1.4, 1.1, -0.08)).toBe(1);
    expect(tau(1, 1, 1.4, 1.1, -0.08)).toBeCloseTo(1.08, 12);
    expect(tau(0, 0, 1.4, 1.1, -0.08)).toBeCloseTo(1 + 1.4 * 1.1 * 0.08, 12);
  });
});

describe("synthetic leagues", () => {
  it("preserves both Poisson marginals under the correction", () => {
    const lambda = 1.6;
    const mu = 1.1;
    const table = jointScorelinePmf(lambda, mu, -0.09);
    const plain = (k: number, rate: number): number =>
      (Math.exp(-rate) * rate ** k) /
      Array.from({ length: k }, (_, i) => i + 1).reduce((a, b) => a * b, 1);
    for (const goals of [0, 1, 2, 3]) {
      const homeMargin = table[goals]!.reduce((a, b) => a + b, 0);
      const awayMargin = table.reduce((sum, row) => sum + row[goals]!, 0);
      expect(homeMargin).toBeCloseTo(plain(goals, lambda), 6);
      expect(awayMargin).toBeCloseTo(plain(goals, mu), 6);
    }
  });

  it("raises the two level scorelines when rho is negative", () => {
    const independent = jointScorelinePmf(1.5, 1.2, 0);
    const corrected = jointScorelinePmf(1.5, 1.2, -0.1);
    expect(corrected[0]![0]).toBeGreaterThan(independent[0]![0]!);
    expect(corrected[1]![1]).toBeGreaterThan(independent[1]![1]!);
    expect(corrected[0]![1]).toBeLessThan(independent[0]![1]!);
    expect(corrected[1]![0]).toBeLessThan(independent[1]![0]!);
  });

  it("rejects a rho the rates cannot carry", () => {
    expect(() => jointScorelinePmf(1.5, 1.2, 0.9)).toThrow(/at zero/);
  });

  it("rejects the boundary as well, matching the likelihood's own domain", () => {
    // rho = 1 makes tau(1,1) exactly zero. The generator has to refuse it for
    // the same reason lowScoresStayPositive does: a scoreline the model says
    // can happen must not be given probability zero. These are two files
    // whose whole value is that they were written independently, so their
    // admissible domains have to agree - a generator that accepts what the
    // likelihood rejects can hand the estimator data it cannot fit.
    expect(() => jointScorelinePmf(1.5, 1.2, 1)).toThrow(/at zero/);
    expect(Number.isFinite(jointScorelinePmf(1.5, 1.2, 0.5)[0]![0])).toBe(true);
  });
});

describe("profile fit", () => {
  const fit = fitProfile(league, { starts: 2 });

  it("recovers a rho it was never told, with the interval covering it", () => {
    expect(fit.rho).toBeGreaterThan(-0.2);
    expect(fit.rho).toBeLessThan(0);
    expect(Math.abs(fit.rho - TRUE_RHO)).toBeLessThan(0.06);
    const interval = profileInterval(league, fit, 0.99);
    expect(interval.lower).toBeLessThan(TRUE_RHO);
    expect(interval.upper).toBeGreaterThan(TRUE_RHO);
    expect(interval.truncated).toBe(false);
  });

  it("keeps the constrained null apart from the alternative with rho zeroed", () => {
    // What a parametric bootstrap under H0 has to draw from. Setting rho to
    // zero on the alternative's parameters is a different model: its
    // likelihood at rho = 0 is strictly worse than the constrained fit's.
    expect(fit.nullParams).not.toEqual(fit.params);
    const atNull = negativeLogLikelihood(fit.layout, league, fit.nullParams, 0);
    const alternativeAtZero = negativeLogLikelihood(fit.layout, league, fit.params, 0);
    expect(atNull).toBeLessThan(alternativeAtZero);
    expect(atNull).toBeCloseTo(fit.nullMinimum, 8);
  });

  it("agrees between starts far below the scale that decides anything", () => {
    expect(fit.startSpread).toBeLessThan(1e-6);
  });

  it("reports a likelihood ratio that grows away from the optimum", () => {
    expect(fit.likelihoodRatio).toBeGreaterThan(0);
    expect(devianceAt(league, fit, fit.rho)).toBeLessThan(1e-6);
    expect(devianceAt(league, fit, 0)).toBeCloseTo(fit.likelihoodRatio, 6);
  });

  it("fits both signs of rho, because the estimator is not the sampler", () => {
    const layout = buildLayout(league);
    const positive = fitAtRho(layout, league, new Float64Array(layout.dim), 0.05);
    expect(Number.isFinite(positive.negativeLogLikelihood)).toBe(true);
    expect(positive.gradientNorm).toBeLessThan(1e-4);
  });
});
