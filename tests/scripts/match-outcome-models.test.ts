import { describe, expect, test } from "vitest";

import {
  adjustOutcomeLambdas,
  applyDixonColes,
  sampleOutcome,
} from "../../scripts/match-outcome-models";
import { deriveSeed } from "../../src/logic/stable-seed";

describe("adjustOutcomeLambdas", () => {
  test("leaves the current one-sided home advantage unchanged by default", () => {
    expect(adjustOutcomeLambdas({ home: 1.5525, away: 1.35 }, {})).toEqual({
      home: 1.5525,
      away: 1.35,
    });
  });

  test("can split a stronger home advantage across both teams", () => {
    const adjusted = adjustOutcomeLambdas(
      { home: 1.5525, away: 1.35 },
      { homeAdvantageFactor: 1.1, homeAdvantageShare: 0.5 }
    );

    expect(adjusted.home + adjusted.away).toBeLessThan(1.5525 + 1.35);
    expect(adjusted.home / adjusted.away).toBeCloseTo((1.5525 / 1.35) * 1.1, 12);
  });
});

describe("applyDixonColes", () => {
  test("moves only low decisive scores into low draws", () => {
    const lambda = { home: 1.5, away: 1.2 };

    expect(applyDixonColes({ homeGoals: 0, awayGoals: 1 }, lambda, -0.1, 0)).toEqual({
      homeGoals: 0,
      awayGoals: 0,
    });
    expect(applyDixonColes({ homeGoals: 1, awayGoals: 0 }, lambda, -0.1, 0)).toEqual({
      homeGoals: 1,
      awayGoals: 1,
    });
    expect(applyDixonColes({ homeGoals: 2, awayGoals: 1 }, lambda, -0.1, 0)).toEqual({
      homeGoals: 2,
      awayGoals: 1,
    });
  });

  test("moves the same mass the other way when rho is positive", () => {
    const lambda = { home: 1.5, away: 1.2 };

    expect(applyDixonColes({ homeGoals: 0, awayGoals: 0 }, lambda, 0.1, 0)).toEqual({
      homeGoals: 0,
      awayGoals: 1,
    });
    expect(applyDixonColes({ homeGoals: 1, awayGoals: 1 }, lambda, 0.1, 0)).toEqual({
      homeGoals: 1,
      awayGoals: 0,
    });
    expect(applyDixonColes({ homeGoals: 0, awayGoals: 1 }, lambda, 0.1, 0)).toEqual({
      homeGoals: 0,
      awayGoals: 1,
    });
    expect(applyDixonColes({ homeGoals: 2, awayGoals: 1 }, lambda, 0.1, 0)).toEqual({
      homeGoals: 2,
      awayGoals: 1,
    });
  });

  test("converts each level score at exactly the rate tau prescribes", () => {
    const lambda = { home: 1.5, away: 1.2 };
    const rho = 0.1;
    // tau(0,0) = 1 - lambda*mu*rho, so that fraction of 0-0 must leave.
    const levelNilShare = lambda.home * lambda.away * rho;
    expect(
      applyDixonColes({ homeGoals: 0, awayGoals: 0 }, lambda, rho, levelNilShare - 1e-9)
    ).toEqual({ homeGoals: 0, awayGoals: 1 });
    expect(
      applyDixonColes({ homeGoals: 0, awayGoals: 0 }, lambda, rho, levelNilShare + 1e-9)
    ).toEqual({ homeGoals: 0, awayGoals: 0 });
    // tau(1,1) = 1 - rho, so exactly rho of 1-1 must leave.
    expect(applyDixonColes({ homeGoals: 1, awayGoals: 1 }, lambda, rho, rho - 1e-9)).toEqual({
      homeGoals: 1,
      awayGoals: 0,
    });
    expect(applyDixonColes({ homeGoals: 1, awayGoals: 1 }, lambda, rho, rho + 1e-9)).toEqual({
      homeGoals: 1,
      awayGoals: 1,
    });
  });

  test("leaves every scoreline alone at rho = 0", () => {
    for (const result of [
      { homeGoals: 0, awayGoals: 0 },
      { homeGoals: 0, awayGoals: 1 },
      { homeGoals: 1, awayGoals: 0 },
      { homeGoals: 1, awayGoals: 1 },
    ]) {
      expect(applyDixonColes(result, { home: 1.5, away: 1.2 }, 0, 0)).toEqual(result);
    }
  });

  test("rejects the boundary too, where tau reaches exactly zero", () => {
    // lambda_home = 2 with rho = -0.5 gives a transfer probability of exactly
    // one: every 0-1 becomes 0-0 and the scoreline 0-1 stops existing. tau = 0
    // is a scoreline the model says can happen being given probability zero,
    // so the contract is tau > 0, not tau >= 0.
    expect(() =>
      applyDixonColes({ homeGoals: 0, awayGoals: 1 }, { home: 2, away: 1 }, -0.5, 0)
    ).toThrow(/Dixon.Coles/i);
    expect(() =>
      applyDixonColes({ homeGoals: 1, awayGoals: 1 }, { home: 1, away: 1 }, 1, 0)
    ).toThrow(/Dixon.Coles/i);
  });

  test("rejects a parameter that would make a low-score probability negative", () => {
    expect(() =>
      applyDixonColes({ homeGoals: 0, awayGoals: 1 }, { home: 2, away: 1 }, -0.6, 0)
    ).toThrow(/Dixon.Coles/i);
    // The positive side has its own binding limit: lambda*mu*rho must stay
    // below one, which bites long before rho itself reaches one.
    expect(() =>
      applyDixonColes({ homeGoals: 0, awayGoals: 0 }, { home: 2, away: 1 }, 0.6, 0)
    ).toThrow(/Dixon.Coles/i);
  });
});

test("dependence models preserve marginal means while increasing draws", () => {
  const matches = 30_000;
  let independentHome = 0;
  let independentAway = 0;
  let sharedHome = 0;
  let sharedAway = 0;
  let dixonColesHome = 0;
  let dixonColesAway = 0;
  let independentDraws = 0;
  let sharedDraws = 0;
  let dixonColesDraws = 0;

  for (let index = 0; index < matches; index += 1) {
    const seeds = {
      home: deriveSeed(0xace01234, index, "home"),
      away: deriveSeed(0xace01234, index, "away"),
      dependence: deriveSeed(0xace01234, index, "dependence"),
    };
    const independent = sampleOutcome({ home: 1.55, away: 1.35 }, { kind: "independent" }, seeds);
    const shared = sampleOutcome(
      { home: 1.55, away: 1.35 },
      { kind: "shared-poisson", covariance: 0.15 },
      seeds
    );
    const dixonColes = sampleOutcome(
      { home: 1.55, away: 1.35 },
      { kind: "dixon-coles", rho: -0.12 },
      seeds
    );
    independentHome += independent.homeGoals;
    independentAway += independent.awayGoals;
    sharedHome += shared.homeGoals;
    sharedAway += shared.awayGoals;
    dixonColesHome += dixonColes.homeGoals;
    dixonColesAway += dixonColes.awayGoals;
    if (independent.homeGoals === independent.awayGoals) independentDraws += 1;
    if (shared.homeGoals === shared.awayGoals) sharedDraws += 1;
    if (dixonColes.homeGoals === dixonColes.awayGoals) dixonColesDraws += 1;
  }

  expect(sharedHome / matches).toBeCloseTo(independentHome / matches, 1);
  expect(sharedAway / matches).toBeCloseTo(independentAway / matches, 1);
  expect(dixonColesHome / matches).toBeCloseTo(independentHome / matches, 1);
  expect(dixonColesAway / matches).toBeCloseTo(independentAway / matches, 1);
  expect(sharedDraws).toBeGreaterThan(independentDraws);
  expect(dixonColesDraws).toBeGreaterThan(independentDraws);
});

test("a positive rho suppresses draws and still leaves both marginals alone", () => {
  const matches = 30_000;
  const lambda = { home: 1.55, away: 1.35 };
  let independentHome = 0;
  let independentAway = 0;
  let correctedHome = 0;
  let correctedAway = 0;
  let independentDraws = 0;
  let correctedDraws = 0;

  for (let index = 0; index < matches; index += 1) {
    const seeds = {
      home: deriveSeed(0xbeef4321, index, "home"),
      away: deriveSeed(0xbeef4321, index, "away"),
      dependence: deriveSeed(0xbeef4321, index, "dependence"),
    };
    const independent = sampleOutcome(lambda, { kind: "independent" }, seeds);
    const corrected = sampleOutcome(lambda, { kind: "dixon-coles", rho: 0.08 }, seeds);
    independentHome += independent.homeGoals;
    independentAway += independent.awayGoals;
    correctedHome += corrected.homeGoals;
    correctedAway += corrected.awayGoals;
    if (independent.homeGoals === independent.awayGoals) independentDraws += 1;
    if (corrected.homeGoals === corrected.awayGoals) correctedDraws += 1;
  }

  expect(correctedHome / matches).toBeCloseTo(independentHome / matches, 1);
  expect(correctedAway / matches).toBeCloseTo(independentAway / matches, 1);
  expect(correctedDraws).toBeLessThan(independentDraws);
});
