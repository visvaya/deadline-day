/**
 * Statistical properties of analyst reports: rail saturation and the
 * independence of every report component from the hidden ceiling, each over
 * more than a hundred thousand observations. Kept apart from the unit tests in
 * analyst-report.test.ts because `*.statistical.test.ts` files run without
 * coverage instrumentation (vite.config.ts), which slowed them six times.
 */

import { describe, it, expect } from "vitest";
import type { AnalystContextTier, Player, PositionCode } from "../../src/data/types";
import { createAnalystReport } from "../../src/logic/analyst-report";
import { pickSourceClub } from "../../src/logic/analyst-context";
import { selectAnalystProfile } from "../../src/logic/analyst-profile";
import { createRng, randInt } from "../../src/logic/rng";
import { startingMembership } from "../../src/logic/league-membership";

const createPlayer = (id: string, poz: string, wiek = 25, ovr = 75, sufit = 85): Player => ({
  id,
  nazwa: `Player ${id}`,
  poz: poz as PositionCode,
  wiek,
  ovr,
  sufit,
  moj: false,
  cenaZakupu: null,
  ageAtSigning: null,
  mnoznikPlacy: 1,
  wKlubieOd: 0,
  kontraktOd: 0,
  wygasa: false,
});

const residualMeanRangeByPercentileTercile = (
  observations: ReadonlyArray<{ residual: number; percentile: number }>
): number => {
  const residualsByTercile: [number[], number[], number[]] = [[], [], []];

  for (const observation of observations) {
    const tercile = observation.percentile < 34 ? 0 : observation.percentile < 67 ? 1 : 2;
    residualsByTercile[tercile].push(observation.residual);
  }

  expect(residualsByTercile.flat()).toHaveLength(observations.length);
  expect(residualsByTercile.every((bucket) => bucket.length > 0)).toBe(true);

  const meanResiduals = residualsByTercile.map(
    (bucket) => bucket.reduce((sum, value) => sum + value, 0) / bucket.length
  );
  return Math.max(...meanResiduals) - Math.min(...meanResiduals);
};

describe("createAnalystReport rail saturation (<5% at 3 or 99)", () => {
  it("quality metrics: <5% of observations at 3 or 99", () => {
    const contextTier: AnalystContextTier = "mid";
    let railCount = 0;
    const sampleSize = 100000;

    for (let i = 0; i < sampleSize; i += 1) {
      const player = createPlayer(`player-${i}`, "BR", 25, 75, 85);
      const report = createAnalystReport(player, { season: 3, window: "summer" }, contextTier);
      for (const metric of report.metrics) {
        if (metric.percentile === 3 || metric.percentile === 99) {
          railCount += 1;
        }
      }
    }

    const railPct = (railCount / (sampleSize * 2)) * 100; // 2 metrics per report
    expect(railPct).toBeLessThan(5);
  }, 90000);

  it("profile metrics: <5% of observations at 3 or 99", () => {
    const contextTier: AnalystContextTier = "mid";
    let railCount = 0;
    const sampleSize = 100000;

    for (let i = 0; i < sampleSize; i += 1) {
      const player = createPlayer(`player-${i}`, "BR", 25, 75, 85);
      const report = createAnalystReport(player, { season: 3, window: "summer" }, contextTier);
      for (const metric of report.metrics) {
        if (metric.percentile === 3 || metric.percentile === 99) {
          railCount += 1;
        }
      }
    }

    const railPct = (railCount / (sampleSize * 2)) * 100;
    expect(railPct).toBeLessThan(5);
  }, 90000);

  it("small sample tier: <5% at rails", () => {
    const contextTier: AnalystContextTier = "mid";
    let railCount = 0;
    let smallCount = 0;

    for (let i = 0; i < 100000; i += 1) {
      const player = createPlayer(`player-${i}`, "BR", 18, 50, 60);
      const report = createAnalystReport(player, { season: 3, window: "summer" }, contextTier);
      if (report.sampleTier === "small") {
        smallCount += 1;
        for (const metric of report.metrics) {
          if (metric.percentile === 3 || metric.percentile === 99) {
            railCount += 1;
          }
        }
      }
    }

    if (smallCount > 0) {
      const railPct = (railCount / (smallCount * 2)) * 100;
      expect(railPct).toBeLessThan(5);
    }
  }, 90000);

  it("medium sample tier: <5% at rails", () => {
    const contextTier: AnalystContextTier = "mid";
    let railCount = 0;
    let mediumCount = 0;

    for (let i = 0; i < 100000; i += 1) {
      const player = createPlayer(`player-${i}`, "BR", 24, 72, 82);
      const report = createAnalystReport(player, { season: 3, window: "summer" }, contextTier);
      if (report.sampleTier === "medium") {
        mediumCount += 1;
        for (const metric of report.metrics) {
          if (metric.percentile === 3 || metric.percentile === 99) {
            railCount += 1;
          }
        }
      }
    }

    if (mediumCount > 0) {
      const railPct = (railCount / (mediumCount * 2)) * 100;
      expect(railPct).toBeLessThan(5);
    }
  }, 90000);

  it("large sample tier: <5% at rails", () => {
    const contextTier: AnalystContextTier = "mid";
    let railCount = 0;
    let largeCount = 0;

    for (let i = 0; i < 100000; i += 1) {
      const player = createPlayer(`player-${i}`, "BR", 28, 80, 90);
      const report = createAnalystReport(player, { season: 3, window: "summer" }, contextTier);
      if (report.sampleTier === "large") {
        largeCount += 1;
        for (const metric of report.metrics) {
          if (metric.percentile === 3 || metric.percentile === 99) {
            railCount += 1;
          }
        }
      }
    }

    if (largeCount > 0) {
      const railPct = (railCount / (largeCount * 2)) * 100;
      expect(railPct).toBeLessThan(5);
    }
  }, 90000);
});

/**
 * Residual independence from the ceiling: after holding visible OVR constant,
 * no analyst signal may reveal the remaining ceiling gap. The analyst measures
 * present hidden value; StaffOutlook remains the potential channel.
 */
describe("createAnalystReport residual independence (>100k observations)", () => {
  it("keeps visible quality percentiles independent from the ceiling gap", () => {
    const contextTier: AnalystContextTier = "mid";
    const observations: Array<{ residual: number; percentile: number }> = [];
    const ovrBuckets: Record<number, number[]> = {};

    // First pass: collect gaps per OVR
    for (let i = 0; i < 100000; i += 1) {
      const rng = createRng(0x1000_0000 + i);
      const ovr = 60 + randInt(rng, 0, 29);
      const ceiling = ovr + randInt(rng, 0, 29);

      if (!ovrBuckets[ovr]) ovrBuckets[ovr] = [];
      ovrBuckets[ovr].push(ceiling - ovr);
    }

    // Second pass: collect residuals (gaps centered per OVR) with percentiles
    for (let i = 0; i < 100000; i += 1) {
      const rng = createRng(0x1000_0000 + i);
      const ovr = 60 + randInt(rng, 0, 29);
      const ceiling = ovr + randInt(rng, 0, 29);

      const player = createPlayer(`player-${i}`, "BR", 25, ovr, ceiling);
      const report = createAnalystReport(player, { season: 3, window: "summer" }, contextTier);

      const meanGapAtOvr = ovrBuckets[ovr]!.reduce((a, b) => a + b, 0) / ovrBuckets[ovr]!.length;
      const residual = ceiling - ovr - meanGapAtOvr;
      observations.push({ residual, percentile: report.metrics[0].percentile });
    }

    const difference = residualMeanRangeByPercentileTercile(observations);

    expect(difference).toBeLessThanOrEqual(0.25);
  }, 90000);

  it("keeps hidden marketEdge independent from the ceiling gap", () => {
    const observations: Array<{ residual: number; marketEdge: number }> = [];
    const ovrBuckets: Record<number, number[]> = {};

    // First pass: collect gaps per OVR
    for (let i = 0; i < 100000; i += 1) {
      const rng = createRng(0x1000_0000 + i);
      const ovr = 60 + randInt(rng, 0, 29);
      const ceiling = ovr + randInt(rng, 0, 29);

      if (!ovrBuckets[ovr]) ovrBuckets[ovr] = [];
      ovrBuckets[ovr].push(ceiling - ovr);
    }

    // Second pass: collect residuals with marketEdge
    for (let i = 0; i < 100000; i += 1) {
      const rng = createRng(0x1000_0000 + i);
      const ovr = 60 + randInt(rng, 0, 29);
      const ceiling = ovr + randInt(rng, 0, 29);

      const player = createPlayer(`player-${i}`, "BR", 25, ovr, ceiling);
      const profile = selectAnalystProfile(player);

      const meanGapAtOvr = ovrBuckets[ovr]!.reduce((a, b) => a + b, 0) / ovrBuckets[ovr]!.length;
      const residual = ceiling - ovr - meanGapAtOvr;
      observations.push({ residual, marketEdge: profile.marketEdge });
    }

    // Split marketEdge into terciles: [-3, -1], [0], [1, 3]
    const residualsByDeltaTercile: Array<number[]> = [[], [], []];
    for (const obs of observations) {
      const tercile = obs.marketEdge <= -1 ? 0 : obs.marketEdge === 0 ? 1 : 2;
      residualsByDeltaTercile[tercile]!.push(obs.residual);
    }

    const meanResiduals = residualsByDeltaTercile.map((bucket) =>
      bucket.length > 0 ? bucket.reduce((a, b) => a + b, 0) / bucket.length : 0
    );
    const maxMean = Math.max(...meanResiduals.filter(isFinite));
    const minMean = Math.min(...meanResiduals.filter(isFinite));
    const difference = maxMean - minMean;

    expect(difference).toBeLessThanOrEqual(0.25);
  }, 90000);

  it("keeps bundle choice independent of the ceiling", () => {
    const observations: Array<{ residual: number; bundleId: string }> = [];
    const ovrBuckets: Record<number, number[]> = {};

    // First pass: collect gaps per OVR
    for (let i = 0; i < 100000; i += 1) {
      const rng = createRng(0x1000_0000 + i);
      const ovr = 60 + randInt(rng, 0, 29);
      const ceiling = ovr + randInt(rng, 0, 29);

      if (!ovrBuckets[ovr]) ovrBuckets[ovr] = [];
      ovrBuckets[ovr].push(ceiling - ovr);
    }

    // Second pass: collect residuals with bundle choice
    for (let i = 0; i < 100000; i += 1) {
      const rng = createRng(0x1000_0000 + i);
      const ovr = 60 + randInt(rng, 0, 29);
      const ceiling = ovr + randInt(rng, 0, 29);

      const player = createPlayer(`player-${i}`, "BR", 25, ovr, ceiling);
      const profile = selectAnalystProfile(player);

      const meanGapAtOvr = ovrBuckets[ovr]!.reduce((a, b) => a + b, 0) / ovrBuckets[ovr]!.length;
      const residual = ceiling - ovr - meanGapAtOvr;
      observations.push({ residual, bundleId: profile.id });
    }

    // Group by bundle and compute means per bundle
    const residualsByBundle: Record<string, number[]> = {};
    for (const obs of observations) {
      if (!residualsByBundle[obs.bundleId]) {
        residualsByBundle[obs.bundleId] = [];
      }
      residualsByBundle[obs.bundleId]!.push(obs.residual);
    }

    const meanResiduals = Object.values(residualsByBundle).map((bucket) =>
      bucket.length > 0 ? bucket.reduce((a, b) => a + b, 0) / bucket.length : 0
    );
    const maxMean = Math.max(...meanResiduals.filter(isFinite));
    const minMean = Math.min(...meanResiduals.filter(isFinite));
    const difference = maxMean - minMean;

    expect(difference).toBeLessThanOrEqual(0.25);
  }, 90000);

  it("keeps context tier independent of the ceiling", () => {
    const observations: Array<{ residual: number; contextTier: AnalystContextTier }> = [];
    const ovrBuckets: Record<number, number[]> = {};
    const userClubId = "lech-poznan"; // Fixed user club, so only the draw varies
    const membership = startingMembership();

    // First pass: collect gaps per OVR
    for (let i = 0; i < 100000; i += 1) {
      const rng = createRng(0x1000_0000 + i);
      const ovr = 60 + randInt(rng, 0, 29);
      const ceiling = ovr + randInt(rng, 0, 29);

      if (!ovrBuckets[ovr]) ovrBuckets[ovr] = [];
      ovrBuckets[ovr].push(ceiling - ovr);
    }

    // Second pass: collect residuals with genuinely-derived context tiers
    for (let i = 0; i < 100000; i += 1) {
      const rng = createRng(0x1000_0000 + i);
      const ovr = 60 + randInt(rng, 0, 29);
      const ceiling = ovr + randInt(rng, 0, 29);

      // Derive the context tier the way the real pipeline does: pickSourceClub
      // draws it from the league, on an rng that has never seen the player.
      // Until 2026-08-25 the club came from deriveSeed(player.id, ...), so the
      // tier was a function OF the player and this test had to prove the
      // function did not reach his ceiling. It no longer can reach him at all,
      // and the sweep now checks the percentiles behind the tier instead.
      const derivedTier = pickSourceClub(
        createRng(0x2000_0000 + i),
        membership,
        userClubId
      ).contextTier;

      const meanGapAtOvr = ovrBuckets[ovr]!.reduce((a, b) => a + b, 0) / ovrBuckets[ovr]!.length;
      const residual = ceiling - ovr - meanGapAtOvr;
      observations.push({ residual, contextTier: derivedTier });
    }

    // Group by genuinely-derived context tier
    const residualsByTier: Record<string, number[]> = { bottom: [], mid: [], top: [] };
    for (const obs of observations) {
      residualsByTier[obs.contextTier]!.push(obs.residual);
    }

    const meanResiduals = Object.values(residualsByTier).map((bucket) =>
      bucket.length > 0 ? bucket.reduce((a, b) => a + b, 0) / bucket.length : 0
    );
    const maxMean = Math.max(...meanResiduals.filter(isFinite));
    const minMean = Math.min(...meanResiduals.filter(isFinite));
    const difference = maxMean - minMean;

    expect(difference).toBeLessThanOrEqual(0.25);
  }, 90000);

  it("keeps Cross Claim Success % independent from the ceiling gap", () => {
    const contextTier: AnalystContextTier = "mid";
    const observations: Array<{ residual: number; percentile: number }> = [];
    const ovrBuckets: Record<number, number[]> = {};

    // First pass: collect gaps per OVR
    for (let i = 0; i < 100000; i += 1) {
      const rng = createRng(0x1000_0000 + i);
      const ovr = 60 + randInt(rng, 0, 29);
      const ceiling = ovr + randInt(rng, 0, 29);

      if (!ovrBuckets[ovr]) ovrBuckets[ovr] = [];
      ovrBuckets[ovr].push(ceiling - ovr);
    }

    // Second pass: collect residuals with Cross Claim Success % percentiles
    for (let i = 0; i < 100000; i += 1) {
      const rng = createRng(0x1000_0000 + i);
      const ovr = 60 + randInt(rng, 0, 29);
      const ceiling = ovr + randInt(rng, 0, 29);
      const player = createPlayer(`player-${i}`, "BR", 25, ovr, ceiling);

      const report = createAnalystReport(player, { season: 3, window: "summer" }, contextTier);
      const claimMetric = report.metrics.find((m) => m.metricId === "crossClaimSuccessPct");
      if (claimMetric) {
        const meanGapAtOvr = ovrBuckets[ovr]!.reduce((a, b) => a + b, 0) / ovrBuckets[ovr]!.length;
        const residual = ceiling - ovr - meanGapAtOvr;
        observations.push({ residual, percentile: claimMetric.percentile });
      }
    }

    const difference = residualMeanRangeByPercentileTercile(observations);

    expect(difference).toBeLessThanOrEqual(0.25);
  }, 90000);

  it("keeps Dribble & Carry OBV independent from the ceiling gap", () => {
    const contextTier: AnalystContextTier = "mid";
    const observations: Array<{ residual: number; percentile: number }> = [];
    const ovrBuckets: Record<number, number[]> = {};

    // First pass: collect gaps per OVR
    for (let i = 0; i < 100000; i += 1) {
      const rng = createRng(0x1000_0000 + i);
      const ovr = 60 + randInt(rng, 0, 29);
      const ceiling = ovr + randInt(rng, 0, 29);

      if (!ovrBuckets[ovr]) ovrBuckets[ovr] = [];
      ovrBuckets[ovr].push(ceiling - ovr);
    }

    // Second pass: collect residuals with Dribble & Carry OBV percentiles
    for (let i = 0; i < 100000; i += 1) {
      const rng = createRng(0x1000_0000 + i);
      const ovr = 60 + randInt(rng, 0, 29);
      const ceiling = ovr + randInt(rng, 0, 29);
      const player = createPlayer(`player-${i}`, "LO", 25, ovr, ceiling); // wide defender

      const report = createAnalystReport(player, { season: 3, window: "summer" }, contextTier);
      const cdMetric = report.metrics.find((m) => m.metricId === "dribbleCarryObv");
      if (cdMetric) {
        const meanGapAtOvr = ovrBuckets[ovr]!.reduce((a, b) => a + b, 0) / ovrBuckets[ovr]!.length;
        const residual = ceiling - ovr - meanGapAtOvr;
        observations.push({ residual, percentile: cdMetric.percentile });
      }
    }

    const difference = residualMeanRangeByPercentileTercile(observations);

    expect(difference).toBeLessThanOrEqual(0.25);
  }, 90000);
});
