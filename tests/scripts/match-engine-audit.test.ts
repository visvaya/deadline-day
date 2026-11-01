import { describe, expect, test } from "vitest";

import { MATCH_BASE_GOALS, MATCH_HOME_ADVANTAGE } from "../../src/data/balance";
import {
  calibratedLambdaFit,
  parseAuditCli,
  runMatchEngineAudit,
  transformRatingSpread,
} from "../../scripts/match-engine-audit-core";
import { calibrateOutcomeLambdaFactors } from "../../scripts/match-engine-audit-coupled";
import { renderMatchEngineAudit } from "../../scripts/match-engine-audit-report";
import { adjustOutcomeLambdas } from "../../scripts/match-outcome-models";

describe("parseAuditCli", () => {
  test("parses an explicit reproducible sample", () => {
    expect(
      parseAuditCli([
        "--runs",
        "12",
        "--batches",
        "3",
        "--seed",
        "0x1234",
        "--md",
        "report.md",
        "--outcome-experiments",
      ])
    ).toMatchObject({
      runs: 12,
      batches: 3,
      seed: 0x1234,
      md: "report.md",
      outcomeExperiments: true,
    });
  });

  test("keeps outcome experiments opt-in", () => {
    expect(parseAuditCli([]).outcomeExperiments).toBe(false);
  });

  test("keeps the default seed independent from pnpm balance", () => {
    expect(parseAuditCli([]).seed).not.toBe(0x5eed0001);
  });

  test("rejects samples too small to populate every seed batch", () => {
    expect(() => parseAuditCli(["--runs", "2", "--batches", "3"])).toThrow(/batches/i);
  });
});

test("the adaptive calibration solves both target side means exactly", () => {
  const current = { home: 1.5683382935993397, away: 1.3637724292168176 };
  const target = { home: 3_622 / 2_408, away: 2_803 / 2_408 };
  const factors = calibrateOutcomeLambdaFactors(current, target);

  expect(adjustOutcomeLambdas(current, factors)).toEqual({
    home: expect.closeTo(target.home, 12),
    away: expect.closeTo(target.away, 12),
  });
  expect(factors.baseGoalsFactor).toBeCloseTo(0.85354163195613, 12);
  expect(factors.homeAdvantageFactor).toBeCloseTo(1.123640819618732, 12);
});

test("rating-spread transforms leave the centre fixed", () => {
  expect(transformRatingSpread({ attack: 1.2, defence: 0.8 }, 0)).toEqual({
    attack: 1,
    defence: 1,
  });
  expect(transformRatingSpread({ attack: 1.2, defence: 0.8 }, 1)).toEqual({
    attack: 1.2,
    defence: 0.8,
  });
  expect(transformRatingSpread({ attack: 1.2, defence: 0.8 }, 2)).toEqual({
    attack: 1.44,
    defence: 0.6400000000000001,
  });
});

test("the audit is deterministic and never pools the snapshot with post-promotion seasons", () => {
  const options = { runs: 6, batches: 3, seed: 0x12345678 };
  const first = runMatchEngineAudit(options);
  const replay = runMatchEngineAudit(options);

  expect(replay).toEqual(first);
  expect(first.snapshot.n).toBe(6);
  expect(first.postPromotion.n).toBe(6);
  expect(first.snapshot.matchCount).toBe(6 * 306);
  expect(first.postPromotion.matchCount).toBe(6 * 306);
  expect(first.snapshot.clubs).toHaveLength(18);
  expect(first.snapshot.clubs.every((club) => club.n === 6)).toBe(true);
  expect(first.batches.map((batch) => batch.n).reduce((a, b) => a + b, 0)).toBe(6);
  expect(new Set(first.batches.map((batch) => batch.seedRoot)).size).toBe(3);
  expect(first.promotedClubTitleRate.n).toBe(6);
});

test("the report prints sample size, standard errors and both league cohorts", () => {
  const audit = runMatchEngineAudit({ runs: 6, batches: 3, seed: 0x87654321 });
  const report = renderMatchEngineAudit(audit);

  expect(report).toContain("Statyczny snapshot");
  expect(report).toContain("Po jednym cyklu awansów i spadków");
  expect(report).toContain("SE");
  expect(report).toContain("n = 6");
});

test("the optional outcome experiment reports paired gameplay costs", () => {
  const audit = runMatchEngineAudit({
    runs: 6,
    batches: 3,
    seed: 0x13579bdf,
    outcomeExperiments: true,
  });
  const experiment = audit.outcomeExperiment;

  expect(experiment).not.toBeNull();
  expect(experiment!.current.spearmanStrengthPlace.n).toBe(6);
  expect(experiment!.variants.length).toBeGreaterThanOrEqual(10);
  expect(experiment!.variants.every((variant) => variant.delta.goalsPerMatch.n === 6)).toBe(true);
  expect(experiment!.variants.every((variant) => variant.absolute.strongestTitleRate.n === 6)).toBe(
    true
  );
  expect(experiment!.current.homeGoalsPerMatch.n).toBe(6);
  expect(experiment!.current.awayGoalsPerMatch.n).toBe(6);
  expect(experiment!.variants.some((variant) => variant.id === "calibrated-window-lambdas")).toBe(
    true
  );

  const report = renderMatchEngineAudit(audit);
  expect(report).toContain("Eksperyment rozkładu wyniku meczu");
  expect(report).toContain("Dixon–Coles");
  expect(report).toContain("wspólny Poisson");
  expect(report).toContain("Spearman");
  expect(report).toContain("2704 meczów");
});

test("paired lever probes move the intended match outcome", () => {
  const audit = runMatchEngineAudit({ runs: 6, batches: 3, seed: 0x2468ace0 });
  const { current, lowerBaseGoals, higherHomeAdvantage } = audit.decomposition.levers;

  expect(lowerBaseGoals.goalsPerMatch.mean).toBeLessThan(current.goalsPerMatch.mean);
  expect(higherHomeAdvantage.homePointAdvantage.mean).toBeGreaterThan(
    current.homePointAdvantage.mean
  );
  expect(current.goalsPerMatch.n).toBe(6);
  expect(audit.decomposition.ratingVariants.current.strongestTitleRate.n).toBe(6);
  expect(audit.decomposition.ratingVariants.wider.topFourAccuracy.n).toBe(6);
  expect(audit.decomposition.leverDeltas.lowerBaseGoals.goalsPerMatch.mean).toBeLessThan(0);
  expect(audit.decomposition.ratingDeltas.widerMinusCurrent.topFourAccuracy.n).toBe(6);
});

describe("calibrated lambda fit", () => {
  test("implies constants that reproduce its own factors exactly", () => {
    const fit = calibratedLambdaFit();

    // The label rounds to three decimals, which turns 1.15228 into 1.1529 -
    // enough to describe the direction, not enough to paste into balance.ts.
    expect(fit.impliedConstants.baseGoals).toBeCloseTo(MATCH_BASE_GOALS * fit.baseGoalsFactor, 12);
    expect(fit.impliedConstants.homeAdvantage).toBeCloseTo(
      MATCH_HOME_ADVANTAGE * fit.homeAdvantageFactor,
      12
    );
  });

  test("renders both constants at full precision inside the audit report", () => {
    // Deliberately NOT renderLambdaFitSection() on its own: a helper that
    // exists but was never wired into the report would pass that test and
    // still leave the executor with no number to copy.
    const audit = runMatchEngineAudit({
      runs: 6,
      batches: 3,
      seed: 0x13579bdf,
      outcomeExperiments: true,
    });
    const rendered = renderMatchEngineAudit(audit).split("\n");
    const fit = calibratedLambdaFit();

    // Exact lines, not a substring match: the point of this section is that a
    // human copies characters out of it.
    expect(rendered).toContain(`  MATCH_BASE_GOALS = ${fit.impliedConstants.baseGoals}`);
    expect(rendered).toContain(`  MATCH_HOME_ADVANTAGE = ${fit.impliedConstants.homeAdvantage}`);
  });
});
