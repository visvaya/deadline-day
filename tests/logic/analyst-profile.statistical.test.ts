/**
 * Distribution fairness of analyst profiles over at least a hundred thousand
 * synthetic players: even bundles, centred marketEdge, independence from the
 * ceiling. Unit tests stay in analyst-profile.test.ts; `*.statistical.test.ts`
 * files run without coverage instrumentation (vite.config.ts).
 */

import { describe, it, expect } from "vitest";
import type { Player, PlayerType, PositionCode } from "../../src/data/types";
import { selectAnalystProfile } from "../../src/logic/analyst-profile";
import { createRng } from "../../src/logic/rng";
import { createPlayer as createGeneratedPlayer } from "../../src/logic/player";

/** Generate a synthetic player with a chosen position and visible attributes. */
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

describe("selectAnalystProfile distribution fairness (≥100k synthetic players)", () => {
  it("distributes bundles evenly: 30-37% per bundle per position group", () => {
    const groups: readonly PositionCode[] = ["BR", "ŚO", "LO", "ŚPD", "LP", "CN"];

    for (const pos of groups) {
      const bundleCounts: Record<string, number> = {};
      const sampleSize = 100000;

      for (let i = 0; i < sampleSize; i += 1) {
        const player = createPlayer(`${pos}-${i}`, pos);
        const profile = selectAnalystProfile(player);
        bundleCounts[profile.id] = (bundleCounts[profile.id] || 0) + 1;
      }

      const bundleShares = Object.values(bundleCounts).map((count) => count / sampleSize);
      for (const share of bundleShares) {
        expect(share).toBeGreaterThanOrEqual(0.3);
        expect(share).toBeLessThanOrEqual(0.37);
      }
    }
  }, 90000);

  it("distributes marketEdge evenly: 13.5-15.1% per value [-3, 3]", () => {
    const deltaCounts: Record<number, number> = {};
    const sampleSize = 100000;

    for (let i = 0; i < sampleSize; i += 1) {
      const player = createPlayer(`player-${i}`, "BR");
      const profile = selectAnalystProfile(player);
      deltaCounts[profile.marketEdge] = (deltaCounts[profile.marketEdge] || 0) + 1;
    }

    const deltaShares = Object.values(deltaCounts).map((count) => count / sampleSize);
    for (const share of deltaShares) {
      expect(share).toBeGreaterThanOrEqual(0.135);
      expect(share).toBeLessThanOrEqual(0.151);
    }
  });

  it("mean marketEdge has magnitude <0.03 globally", () => {
    const sampleSize = 100000;
    let sumDelta = 0;

    for (let i = 0; i < sampleSize; i += 1) {
      const player = createPlayer(`player-${i}`, "BR");
      const profile = selectAnalystProfile(player);
      sumDelta += profile.marketEdge;
    }

    const meanDelta = sumDelta / sampleSize;
    expect(Math.abs(meanDelta)).toBeLessThan(0.03);
  });

  it("mean marketEdge per position group has magnitude <0.03", () => {
    const positions: readonly PositionCode[] = ["BR", "ŚO", "LO", "ŚPD", "LP", "CN"];

    for (const pos of positions) {
      const sampleSize = 100000;
      let sumDelta = 0;

      for (let i = 0; i < sampleSize; i += 1) {
        const player = createPlayer(`${pos}-${i}`, pos);
        const profile = selectAnalystProfile(player);
        sumDelta += profile.marketEdge;
      }

      const meanDelta = sumDelta / sampleSize;
      expect(Math.abs(meanDelta)).toBeLessThan(0.03);
    }
  }, 90000);

  it("mean marketEdge per bundle has magnitude <0.06 (looser threshold due to smaller sample)", () => {
    const bundleSamples: Record<string, number[]> = {};
    const sampleSize = 100000;

    for (let i = 0; i < sampleSize; i += 1) {
      const player = createPlayer(`player-${i}`, "BR");
      const profile = selectAnalystProfile(player);
      if (!bundleSamples[profile.id]) bundleSamples[profile.id] = [];
      bundleSamples[profile.id]!.push(profile.marketEdge);
    }

    for (const deltas of Object.values(bundleSamples)) {
      const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      expect(Math.abs(mean)).toBeLessThan(0.06);
    }
  });

  it("keeps the entire profile distribution independent of the ceiling", () => {
    // Which part of the game is observed, the affected side and the hidden
    // market edge must never hint at potential.
    const ceilings = [70, 80, 90];
    const bundleShares: Array<Record<string, number>> = [];
    const attackShares: number[] = [];

    for (const ceiling of ceilings) {
      const counts: Record<string, number> = {};
      let attack = 0;
      const n = 20000;
      for (let i = 0; i < n; i += 1) {
        const profile = selectAnalystProfile(
          createPlayer(`ceil-${ceiling}-${i}`, "BR", 25, 75, ceiling)
        );
        counts[profile.id] = (counts[profile.id] ?? 0) + 1;
        if (profile.impactSide === "attack") attack += 1;
      }
      for (const key of Object.keys(counts)) counts[key]! /= n;
      bundleShares.push(counts);
      attackShares.push(attack / n);
    }

    for (const key of Object.keys(bundleShares[0]!)) {
      const shares = bundleShares.map((row) => row[key] ?? 0);
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThan(0.02);
    }
    expect(Math.max(...attackShares) - Math.min(...attackShares)).toBeLessThan(0.02);
  }, 60000);

  it("keeps marketEdge independent from ceiling gaps produced by the real generator", () => {
    const rng = createRng(0x5eed_1908);
    const playerTypes: readonly PlayerType[] = ["mlody", "gotowy", "weteran", "akademia"];
    const samples: Array<{ key: string; gap: number; marketEdge: number }> = [];
    const gapsByVisibleState: Record<string, number[]> = {};

    for (let i = 0; i < 120000; i += 1) {
      const playerType = playerTypes[i % playerTypes.length];
      const player = createGeneratedPlayer(rng, playerType!, "BR", 65);
      const key = `${playerType}:${player.wiek}:${player.ovr}`;
      const gap = player.sufit - player.ovr;
      const sample = { key, gap, marketEdge: selectAnalystProfile(player).marketEdge };
      samples.push(sample);
      (gapsByVisibleState[key] ??= []).push(gap);
    }

    const meanGapByVisibleState = Object.fromEntries(
      Object.entries(gapsByVisibleState).map(([key, gaps]) => [
        key,
        gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length,
      ])
    );
    const residualsByEdgeTercile: [number[], number[], number[]] = [[], [], []];

    for (const sample of samples) {
      const tercile = sample.marketEdge <= -1 ? 0 : sample.marketEdge === 0 ? 1 : 2;
      residualsByEdgeTercile[tercile].push(sample.gap - meanGapByVisibleState[sample.key]!);
    }

    expect(residualsByEdgeTercile.every((bucket) => bucket.length > 0)).toBe(true);
    const meanResiduals = residualsByEdgeTercile.map(
      (bucket) => bucket.reduce((sum, residual) => sum + residual, 0) / bucket.length
    );
    expect(Math.max(...meanResiduals) - Math.min(...meanResiduals)).toBeLessThanOrEqual(0.25);
  }, 90000);
});
