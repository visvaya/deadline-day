import { expect, test } from "vitest";

import { AGE_PROFILES } from "../../src/data/balance";
import type { Player, PositionCode, StaffConfidence, StaffMemo } from "../../src/data/types";
import { createRng } from "../../src/logic/rng";
import { createStaffAssessment } from "../../src/logic/staff-assessment";
import { deriveSeed } from "../../src/logic/stable-seed";

/** Helper to create a minimal player for testing */
const createTestPlayer = (overrides: Partial<Player>): Player => ({
  id: "test-player-1",
  nazwa: "Test",
  poz: "BR",
  wiek: 25,
  ovr: 70,
  sufit: 80,
  moj: false,
  cenaZakupu: null,
  ageAtSigning: null,
  mnoznikPlacy: 1,
  wKlubieOd: 0,
  kontraktOd: 0,
  wygasa: false,
  ...overrides,
});

const testPeriod = { season: 2, window: "winter" as const };

// ============================================================================
// Basic unit tests
// ============================================================================

test("assessment is deterministic - same call always gives same result", () => {
  const player = createTestPlayer({ poz: "BR", wiek: 20 });

  const assessment1 = createStaffAssessment(player, testPeriod, "scout", null);
  const assessment2 = createStaffAssessment(player, testPeriod, "scout", null);

  expect(assessment1).toEqual(assessment2);
});

test("source field reflects the passed source", () => {
  const player = createTestPlayer({ poz: "BR", wiek: 20 });

  const scoutAssessment = createStaffAssessment(player, testPeriod, "scout", null);
  const coachAssessment = createStaffAssessment(player, testPeriod, "coach", null);

  expect(scoutAssessment.source).toBe("scout");
  expect(coachAssessment.source).toBe("coach");
});

test("young player (before peakStart) gets focus: potential", () => {
  // BR peakStart is 26
  const player = createTestPlayer({ poz: "BR", wiek: 20 });
  const assessment = createStaffAssessment(player, testPeriod, "scout", null);
  expect(assessment.focus).toBe("potential");
});

test("mature player (at or after peakStart) gets focus: current", () => {
  // BR peakStart is 26
  const player = createTestPlayer({ poz: "BR", wiek: 26 });
  const assessment = createStaffAssessment(player, testPeriod, "scout", null);
  expect(assessment.focus).toBe("current");
});

test("mature player always has high confidence", () => {
  // BR peakStart is 26
  const player = createTestPlayer({ poz: "BR", wiek: 27 });
  const assessment = createStaffAssessment(player, testPeriod, "scout", null);
  expect(assessment.confidence).toBe("high");
});

test("mature player output is deterministic from visible OVR only", () => {
  // BR peakStart is 26
  const player1 = createTestPlayer({ poz: "BR", wiek: 27, ovr: 70, sufit: 80 });
  const player2 = createTestPlayer({ poz: "BR", wiek: 27, ovr: 70, sufit: 90 });

  const assessment1 = createStaffAssessment(player1, testPeriod, "scout", null);
  const assessment2 = createStaffAssessment(player2, testPeriod, "scout", null);

  // Both should give the same outlook since both have OVR 70, despite different ceiling
  expect(assessment1.outlook).toBe(assessment2.outlook);
});

test("young player gets one of the three valid confidence levels", () => {
  // Spot check that confidence is one of the three valid values
  const player = createTestPlayer({ poz: "BR", wiek: 20 });
  const assessment = createStaffAssessment(player, testPeriod, "scout", null);
  expect(["high", "medium", "low"]).toContain(assessment.confidence);
});

test("young player gets one of the four valid outlook values", () => {
  const player = createTestPlayer({ poz: "BR", wiek: 20 });
  const assessment = createStaffAssessment(player, testPeriod, "scout", null);
  expect(["limited", "leagueLevel", "leadingLeague", "aboveLeague"]).toContain(assessment.outlook);
});

// ============================================================================
// Edge cases around peakStart
// ============================================================================

test("player one year before peakStart is potential, one year after is current", () => {
  const pos = "ŚPD"; // peakStart 26
  const profile = AGE_PROFILES[pos];
  const before = createTestPlayer({ poz: pos, wiek: profile.peakStart - 1 });
  const after = createTestPlayer({ poz: pos, wiek: profile.peakStart });

  expect(createStaffAssessment(before, testPeriod, "scout", null).focus).toBe("potential");
  expect(createStaffAssessment(after, testPeriod, "scout", null).focus).toBe("current");
});

// ============================================================================
// Statistical test: Confidence independence (100k+ observations)
// ============================================================================

/**
 * Confidence must not be readable back into the ceiling.
 *
 * The cohort here is structurally ineligible for `high`: at least two years
 * from the peak and a first observation, so the guarantee gate cannot open.
 * With `high` unreachable the whole label is a pure draw, and changing ONLY
 * the ceiling must leave the sequence byte-identical. Exact, not statistical -
 * and it needs no production switch to disable the gate.
 *
 * `high` may depend on the ceiling, and deliberately does: it is granted only
 * when the entire conservative peak range falls inside one band. That is the
 * one widening of the catalogue this rule allows, and it is measured
 * separately rather than hidden here.
 */
test("base confidence does not depend on the ceiling", () => {
  const pos = "BR" as PositionCode;
  const youngAge = 20; // BR peaks at 26 - six years out, far from the gate

  for (let i = 0; i < 500; i += 1) {
    const chain = (sufit: number): StaffConfidence[] => {
      let memo: StaffMemo | null = null;
      return [1, 2].map((season) => {
        const player = createTestPlayer({
          id: `independence-${i}`,
          poz: pos,
          wiek: youngAge,
          sufit,
          ovr: 50,
        });
        const report = createStaffAssessment(player, { season, window: "summer" }, "coach", memo);
        memo = {
          season,
          outlook: report.outlook,
          confidence: report.confidence,
          seasonsObserved: season,
        };
        return report.confidence;
      });
    };

    expect(chain(88)).toEqual(chain(64));
  }
});

// The two 100 000-observation tests below finish in about 1.3s in isolation
// but were measured at 5.2s and 6.8s under a loaded full-gate run, past
// Vitest's default 5s - a false red, not a regression. They get an explicit
// timeout rather than a smaller N: both guard the hidden-ceiling rule, and
// shrinking N would need a fresh power check to prove they still detect
// what they exist to detect. Same treatment as the archive-cap test in
// tests/ui/game-archive.test.ts.
const STATISTICAL_TEST_TIMEOUT_MS = 30_000;

/**
 * And the marginal version of the same claim, over the levels that are still
 * drawn: the mean ceiling behind a "medium" reading must not differ from the
 * mean behind a "low" one.
 */
test(
  "the drawn confidence levels are marginally independent of ceiling",
  () => {
    const N = 100_000;
    const pos = "BR" as PositionCode;
    const youngAge = 20;
    const byConfidence: Record<string, number[]> = { high: [], medium: [], low: [] };

    for (let i = 0; i < N; i += 1) {
      const ceiling = 60 + (i / N) * 35;
      const player = createTestPlayer({
        id: `independence-test-${i}`,
        poz: pos,
        wiek: youngAge,
        sufit: ceiling,
        ovr: 50,
      });

      byConfidence[createStaffAssessment(player, testPeriod, "scout", null).confidence]!.push(
        ceiling
      );
    }

    // Nothing in this cohort can earn `high`: six years from the peak, first
    // observation. If that ever stops being true the test below would silently
    // start measuring the guaranteed channel instead.
    expect(byConfidence.high).toHaveLength(0);

    const mean = (values: number[]) => values.reduce((sum, x) => sum + x, 0) / values.length;
    expect(Math.abs(mean(byConfidence.medium!) - mean(byConfidence.low!))).toBeLessThan(0.25);
  },
  STATISTICAL_TEST_TIMEOUT_MS
);

// ============================================================================
// Signal strength test: Outlook validity (100k+ observations)
// ============================================================================

/**
 * Test that outlook carries real signal about hidden ceiling.
 * Generates 100,000 synthetic young players, draws assessments,
 * and verifies that the mean ceiling residual (ceiling - mean_at_that_ovr)
 * in the "aboveLeague" outlook group exceeds the "limited" group by at least 4.0 OVR.
 *
 * This confirms that outlook provides meaningful information beyond noise,
 * acting as a compressed signal of the player's potential.
 */
test(
  "outlook carries meaningful signal about ceiling (100k observations, 4.0 OVR spread)",
  () => {
    const N = 100_000;
    const pos = "BR" as PositionCode;
    const youngAge = 20; // Well before BR's peakStart of 26

    // Track ceiling per exact OVR for residual computation
    const ceilingByOvr: Map<number, number[]> = new Map();
    const observations: Array<{ ceiling: number; ovr: number; outlook: string }> = [];

    // Use deterministic but independent variation to fill out the design space
    for (let i = 0; i < N; i += 1) {
      // Vary ceiling across the full range [60, 95]
      const ceilingIdx = Math.floor((i / N) * 36);
      const ceiling = 60 + ceilingIdx;

      // Vary OVR independently: use a different large prime for mixing
      const ovrIdx = Math.floor((((i * 7919) % N) / N) * 15);
      const ovr = 50 + ovrIdx;

      const player = createTestPlayer({
        id: `signal-test-${i}`,
        poz: pos,
        wiek: youngAge,
        sufit: ceiling,
        ovr,
      });

      const assessment = createStaffAssessment(player, testPeriod, "scout", null);
      observations.push({ ceiling, ovr, outlook: assessment.outlook });

      // Track for residual computation
      if (!ceilingByOvr.has(ovr)) {
        ceilingByOvr.set(ovr, []);
      }
      ceilingByOvr.get(ovr)!.push(ceiling);
    }

    // Compute mean ceiling per exact OVR
    const meanCeilingPerOvr: Map<number, number> = new Map();
    for (const [ovr, ceilings] of ceilingByOvr.entries()) {
      const mean = ceilings.reduce((sum, x) => sum + x, 0) / ceilings.length;
      meanCeilingPerOvr.set(ovr, mean);
    }

    // Compute residuals for each observation
    const residualsByOutlook: Record<string, number[]> = {
      limited: [],
      leagueLevel: [],
      leadingLeague: [],
      aboveLeague: [],
    };

    for (const obs of observations) {
      const meanAtThisOvr = meanCeilingPerOvr.get(obs.ovr) || 0;
      const residual = obs.ceiling - meanAtThisOvr;
      residualsByOutlook[obs.outlook]!.push(residual);
    }

    // Compute mean residual for each outlook
    const residualMeans = {
      limited:
        residualsByOutlook.limited!.reduce((sum, x) => sum + x, 0) /
        Math.max(residualsByOutlook.limited!.length, 1),
      leagueLevel:
        residualsByOutlook.leagueLevel!.reduce((sum, x) => sum + x, 0) /
        Math.max(residualsByOutlook.leagueLevel!.length, 1),
      leadingLeague:
        residualsByOutlook.leadingLeague!.reduce((sum, x) => sum + x, 0) /
        Math.max(residualsByOutlook.leadingLeague!.length, 1),
      aboveLeague:
        residualsByOutlook.aboveLeague!.reduce((sum, x) => sum + x, 0) /
        Math.max(residualsByOutlook.aboveLeague!.length, 1),
    };

    // Key assertion: aboveLeague residual must exceed limited by at least 6.0 OVR
    const spread = residualMeans.aboveLeague - residualMeans.limited;

    expect(
      spread,
      `aboveLeague residual: ${residualMeans.aboveLeague}, limited: ${residualMeans.limited}, spread: ${spread}`
      // Was 6.0 while a first read could still draw `high` and its narrow 32pp
      // radius. It cannot any more - `high` is earned, not drawn - so every
      // reading in this cohort now carries the wider medium/low noise and the
      // spread falls to about 5.1. That drop is the rule working, not a
      // regression: the floor is here to prove the outlook is not pure noise,
      // and 4.0 still does that with room to spare.
    ).toBeGreaterThanOrEqual(4.0);
  },
  STATISTICAL_TEST_TIMEOUT_MS
);

// ============================================================================
// RNG seeding test
// ============================================================================

test("stable seed derivation is deterministic", () => {
  const seed1 = deriveSeed("test", 1, "summer", "scout", "v1");
  const seed2 = deriveSeed("test", 1, "summer", "scout", "v1");
  expect(seed1).toBe(seed2);
});

test("different inputs produce different seeds", () => {
  const seed1 = deriveSeed("player1", 1, "summer", "scout", "v1");
  const seed2 = deriveSeed("player2", 1, "summer", "scout", "v1");
  expect(seed1).not.toBe(seed2);
});

test("RNG created from derived seed produces deterministic sequence", () => {
  const seed = deriveSeed("test", 1, "summer", "scout", "v1");
  const rng1 = createRng(seed);
  const rng2 = createRng(seed);

  const seq1 = [rng1.next(), rng1.next(), rng1.next()];
  const seq2 = [rng2.next(), rng2.next(), rng2.next()];

  expect(seq1).toEqual(seq2);
});
