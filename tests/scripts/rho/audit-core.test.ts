/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

import { buildLayout, fitAtRho } from "../../../scripts/rho/dixon-coles";
import { fitProfile } from "../../../scripts/rho/dixon-coles-profile";
import {
  doubleRoundRobin,
  evenlySpreadTruth,
  simulateLeague,
} from "../../../scripts/rho/dixon-coles-simulate";
import { ALL_SEASONS, CALIBRATION_WINDOW } from "../../../scripts/match-engine-audit-reference";
import {
  blockResample,
  bootstrapPValue,
  conservativePercentileInterval,
  buildWindow,
  conservativeEnvelope,
  percentileInterval,
  redrawFrom,
  truthFromFit,
} from "../../../scripts/rho/audit-core";

describe("window construction", () => {
  const window = buildWindow(ALL_SEASONS);

  it("carries every pinned fixture with clubs indexed inside their season", () => {
    expect(window.matches.length).toBe(2944);
    expect(window.clubs.length).toBe(ALL_SEASONS.length);
    for (const match of window.matches) {
      expect(match.home).toBeLessThan(window.clubs[match.season]!.length);
      expect(match.away).toBeLessThan(window.clubs[match.season]!.length);
      expect(match.home).not.toBe(match.away);
    }
  });

  it("drops exactly the pandemic season for the sensitivity window", () => {
    const nine = buildWindow(CALIBRATION_WINDOW);
    expect(nine.seasons.length).toBe(ALL_SEASONS.length - 1);
    expect(nine.seasons).not.toContain("2020/21");
    expect(window.matches.length - nine.matches.length).toBeGreaterThan(0);
  });

  it("refuses a season the CSV does not hold", () => {
    expect(() => buildWindow(["1999/00"])).toThrow(/holds no season/);
  });
});

describe("resampling", () => {
  const fixtures = doubleRoundRobin(3, 8);
  const league = simulateLeague(0x77, evenlySpreadTruth(3, 8, -0.06), fixtures);
  const fit = fitProfile(league, { starts: 1 });

  it("redraws goals while keeping every fixture in place", () => {
    const truth = truthFromFit(fit.layout, fit.params, 0);
    const redrawn = redrawFrom(0x99, truth, league);
    expect(redrawn.length).toBe(league.length);
    redrawn.forEach((match, index) => {
      expect(match.season).toBe(league[index]!.season);
      expect(match.home).toBe(league[index]!.home);
      expect(match.away).toBe(league[index]!.away);
    });
    // A redraw that reproduced the data exactly would mean no randomness.
    const identical = redrawn.filter(
      (match, index) =>
        match.homeGoals === league[index]!.homeGoals && match.awayGoals === league[index]!.awayGoals
    ).length;
    expect(identical).toBeLessThan(league.length);
  });

  it("is deterministic in its seed", () => {
    const truth = truthFromFit(fit.layout, fit.params, 0);
    expect(redrawFrom(0x99, truth, league)).toEqual(redrawFrom(0x99, truth, league));
    expect(redrawFrom(0x9a, truth, league)).not.toEqual(redrawFrom(0x99, truth, league));
  });

  it("draws the null with no dependence, whatever the fit found", () => {
    const truth = truthFromFit(fit.layout, fit.params, 0);
    expect(truth.rho).toBe(0);
    expect(truth.home.length).toBe(3);
    // Attacks are on the identified scale, so each season sums to zero.
    for (const season of truth.attack) {
      expect(season.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 10);
    }
  });
});

describe("block resampling keeps its blocks independent", () => {
  const window = buildWindow(ALL_SEASONS);

  it("re-indexes by loop position, so a season drawn twice gets two blocks", () => {
    // Find a seed that actually duplicates something - most do.
    let duplicated = -1;
    let seed = 0;
    let sample = blockResample(window, seed);
    for (; seed < 50; seed += 1) {
      sample = blockResample(window, seed);
      duplicated = sample.weights.findIndex((weight) => weight >= 2);
      if (duplicated >= 0) break;
    }
    expect(duplicated).toBeGreaterThanOrEqual(0);

    const layout = buildLayout(sample.matches);
    // One block per draw, never one per distinct season drawn.
    expect(layout.seasons).toBe(window.seasons.length);
    expect(sample.weights.reduce((a, b) => a + b, 0)).toBe(window.seasons.length);
    // The duplicated season's clubs appear in two separate parameter blocks.
    const blocks = new Set(sample.matches.map((match) => match.season));
    expect(blocks.size).toBe(window.seasons.length);
  });

  it("separates the profiled likelihood across blocks, which the speed-up needs", () => {
    // Two DIFFERENT seasons as two blocks. If the blocks shared one parameter
    // set - which is what dropping the re-indexing would do - the two clubs
    // lists would collide by index and this identity would break. A duplicate
    // of one season would not catch that, since duplicated data doubles the
    // likelihood either way.
    const bySeasonIndex: (typeof window.matches)[] = [];
    for (let index = 0; index < window.seasons.length; index += 1) {
      bySeasonIndex.push(window.matches.filter((match) => match.season === index));
    }
    const alone = (index: number, rho: number): number => {
      const only = bySeasonIndex[index]!.map((match) => ({ ...match, season: 0 }));
      const layout = buildLayout(only);
      return fitAtRho(layout, only, new Float64Array(layout.dim), rho).negativeLogLikelihood;
    };
    const paired = [
      ...bySeasonIndex[1]!.map((match) => ({ ...match, season: 0 })),
      ...bySeasonIndex[4]!.map((match) => ({ ...match, season: 1 })),
    ];
    for (const rho of [0, -0.07]) {
      const layout = buildLayout(paired);
      const joint = fitAtRho(
        layout,
        paired,
        new Float64Array(layout.dim),
        rho
      ).negativeLogLikelihood;
      expect(joint).toBeCloseTo(alone(1, rho) + alone(4, rho), 6);
    }
  });
});

describe("interval helpers", () => {
  const values = Array.from({ length: 201 }, (_, index) => index / 200 - 0.5);

  it("cuts a percentile interval symmetrically", () => {
    const interval = percentileInterval(values, 0.99);
    expect(interval.lower).toBeCloseTo(-0.495, 6);
    expect(interval.upper).toBeCloseTo(0.495, 6);
  });

  it("never reports a p-value of exactly zero", () => {
    const clean = { values: [1, 2, 3], failures: 0, requested: 3 };
    expect(bootstrapPValue(clean, 99)).toEqual({ lower: 1 / 4, upper: 1 / 4 });
    expect(bootstrapPValue(clean, 0)).toEqual({ lower: 1, upper: 1 });
  });

  it("brackets the p-value by what the failed replications could have been", () => {
    // Two replications never produced a statistic. The denominator stays at
    // what the protocol asked for; the numerator spans both possibilities.
    const lossy = { values: [1, 2, 3], failures: 2, requested: 5 };
    expect(bootstrapPValue(lossy, 2.5)).toEqual({ lower: 2 / 6, upper: 4 / 6 });
    // Dividing by the survivors instead would have read 2/4 and hidden the
    // ambiguity entirely.
    expect(bootstrapPValue(lossy, 2.5).lower).not.toBeCloseTo(2 / 4, 6);
  });

  it("reduces to a plain percentile interval when nothing failed", () => {
    const run = { values, failures: 0, requested: values.length };
    const conservative = conservativePercentileInterval(run, 0.99);
    const plain = percentileInterval(values, 0.99);
    expect(conservative.lower).toBeCloseTo(plain.lower, 12);
    expect(conservative.upper).toBeCloseTo(plain.upper, 12);
    expect(conservative.estimable).toBe(true);
  });

  it("loses both ends when the failures alone could fill either tail", () => {
    // 2000 replications at 99% puts each tail 9.995 values wide. Ten missing
    // results could be all of one tail, so neither end is estimable.
    const run = {
      values: Array.from({ length: 1990 }, (_, index) => index / 1989 - 0.5),
      failures: 10,
      requested: 2000,
    };
    const interval = conservativePercentileInterval(run, 0.99);
    expect(interval.lower).toBe(Number.NEGATIVE_INFINITY);
    expect(interval.upper).toBe(Number.POSITIVE_INFINITY);
    expect(interval.estimable).toBe(false);
  });

  it("never shifts the upper index by the failures, which would narrow it", () => {
    // The failures are placed ABOVE the upper tail, so the upper end reads at
    // the same survivor index it would without them. Subtracting the failures
    // there pulls the end inward and reports an interval the run does not
    // support - anti-conservative, and the reason this test exists.
    const sample = Array.from({ length: 1000 }, (_, index) => index);
    const clean = conservativePercentileInterval(
      { values: sample, failures: 0, requested: 1000 },
      0.9
    );
    const lossy = conservativePercentileInterval(
      { values: sample.slice(0, 995), failures: 5, requested: 1000 },
      0.9
    );
    expect(lossy.upper).toBeGreaterThanOrEqual(clean.upper);
    expect(lossy.lower).toBeLessThanOrEqual(clean.lower);
  });

  it("widens monotonically as more replications go missing", () => {
    const sample = Array.from({ length: 1000 }, (_, index) => index);
    let previousWidth = -Infinity;
    for (const failures of [0, 5, 20, 60]) {
      const run = { values: sample.slice(0, 1000 - failures), failures, requested: 1000 };
      const interval = conservativePercentileInterval(run, 0.9);
      const width = interval.upper - interval.lower;
      expect(width).toBeGreaterThanOrEqual(previousWidth);
      previousWidth = width;
    }
    expect(previousWidth).toBe(Infinity);
  });

  it("can lose one end while keeping the other", () => {
    // Level 0.8 puts each tail at index 99.9 of 1000. Ten failures eat the
    // lower tail; the upper one is untouched because the failures sit above it.
    const sample = Array.from({ length: 990 }, (_, index) => index);
    const interval = conservativePercentileInterval(
      { values: sample, failures: 100, requested: 1000 },
      0.8
    );
    expect(interval.lower).toBe(Number.NEGATIVE_INFINITY);
    expect(Number.isFinite(interval.upper)).toBe(true);
    expect(interval.estimable).toBe(false);
  });

  it("refuses a level outside the open unit interval and a run of one", () => {
    const run = { values: [1, 2], failures: 0, requested: 2 };
    expect(() => conservativePercentileInterval(run, 1)).toThrow(/level/);
    expect(() => conservativePercentileInterval(run, 0)).toThrow(/level/);
    expect(() =>
      conservativePercentileInterval({ values: [1], failures: 0, requested: 1 }, 0.99)
    ).toThrow(/at least two/);
  });

  it("takes the widest of the two intervals, not their intersection", () => {
    expect(
      conservativeEnvelope({ lower: -0.1, upper: 0.02 }, { lower: -0.06, upper: 0.05 })
    ).toEqual({ lower: -0.1, upper: 0.05 });
  });
});
