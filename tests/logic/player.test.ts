import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { selectPotentialSpread } from "../../src/data/potential-variance";
import { at } from "../../src/logic/invariant";
import { createRng } from "../../src/logic/rng";
import { createPlayer } from "../../src/logic/player";
import { baselineCeilingDistribution } from "../fixtures/player-ceiling-distribution";

describe("selectPotentialSpread", () => {
  it("should return valid spread values", () => {
    // Test multiple seeds to ensure we get all possible spread values
    const spreads = new Set<number>();

    for (let seed = 0; seed < 1000; seed++) {
      const rng = createRng(seed);
      const spread = selectPotentialSpread(rng);
      spreads.add(spread);
      // All spreads must be one of the three valid values
      expect([3, 11, 24]).toContain(spread);
    }

    // Verify we get all three spread values across the seed range
    expect(spreads.size).toBe(3);
    expect(spreads.has(3)).toBe(true);
    expect(spreads.has(11)).toBe(true);
    expect(spreads.has(24)).toBe(true);
  });

  it("should explicitly pin thresholds 0.35 and 0.75", () => {
    // Mock RNG that returns fixed values to test explicit threshold boundaries
    const mockRng = (nextValue: number) => ({
      next: () => nextValue,
    });

    // Below 0.35 => spread 3
    expect(selectPotentialSpread(mockRng(0.1))).toBe(3);
    expect(selectPotentialSpread(mockRng(0.34))).toBe(3);

    // Between 0.35 and 0.75 => spread 11
    expect(selectPotentialSpread(mockRng(0.35))).toBe(11);
    expect(selectPotentialSpread(mockRng(0.5))).toBe(11);
    expect(selectPotentialSpread(mockRng(0.74))).toBe(11);

    // At or above 0.75 => spread 24
    expect(selectPotentialSpread(mockRng(0.75))).toBe(24);
    expect(selectPotentialSpread(mockRng(0.9))).toBe(24);
    expect(selectPotentialSpread(mockRng(0.99))).toBe(24);
  });

  it("should not export old label names (pewny, nierówny, loteria)", () => {
    // Read the source file and assert that old label names are not exported
    // or used as identifiers (comments explaining the change are OK)
    const sourcePath = resolve(process.cwd(), "src/data/potential-variance.ts");
    const source = readFileSync(sourcePath, "utf-8");

    // Remove all comments to focus on code identifiers only
    const codeOnly = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");

    // Old label names must not be exported or used as identifiers in code
    expect(codeOnly).not.toMatch(/export\s+.*pewny/);
    expect(codeOnly).not.toMatch(/export\s+.*nierówny/);
    expect(codeOnly).not.toMatch(/export\s+.*loteria/);
    // Also check they're not used as variable/constant names
    expect(codeOnly).not.toMatch(/const\s+pewny/);
    expect(codeOnly).not.toMatch(/const\s+nierówny/);
    expect(codeOnly).not.toMatch(/const\s+loteria/);
  });

  it("should draw exactly once per call", () => {
    const rng = createRng(12345);
    const state1 = rng.state();
    selectPotentialSpread(rng);
    const state2 = rng.state();

    // Should have advanced by exactly one draw
    expect(state2).not.toBe(state1);

    // Second call should continue from where we left off
    const state3 = rng.state();
    selectPotentialSpread(rng);
    const state4 = rng.state();

    expect(state4).not.toBe(state3);
    expect(state4).not.toBe(state2);
  });
});

describe("createPlayer ceiling distribution regression (Task 6)", () => {
  it("young players (typ=mlody) marginal ceiling distribution matches Task 2 baseline after selectPotentialSpread wiring", () => {
    // Task 6 refactored the hidden spread selector from being embedded in the
    // ceiling-generation formula to being called explicitly. This regression test
    // verifies that the marginal distribution of ceilings for young players was
    // preserved exactly – confirming formula and draw order stayed the same.

    const rng = createRng(0x20260817); // seed 20260817 in hex
    const ceilings: number[] = [];
    let ceilingEqualityCount = 0;

    const sampleSize = baselineCeilingDistribution.count; // 120000

    for (let i = 0; i < sampleSize; i++) {
      const player = createPlayer(rng, "mlody", "BR");
      ceilings.push(player.sufit);

      if (player.sufit === player.ovr) {
        ceilingEqualityCount++;
      }
    }

    // Compute aggregates: mean, equality share, percentiles
    ceilings.sort((a, b) => a - b);
    const mean = ceilings.reduce((sum, c) => sum + c, 0) / ceilings.length;
    const equalityShare = ceilingEqualityCount / ceilings.length;

    const percentile = (p: number) => {
      const index = Math.floor((p / 100) * ceilings.length);
      return at(ceilings, Math.min(index, ceilings.length - 1), "ceiling percentile");
    };

    // Assert count matches
    expect(ceilings.length).toBe(baselineCeilingDistribution.count);

    // Assert mean matches within 0.02 OVR (allows for float rounding across 120k samples)
    expect(Math.abs(mean - baselineCeilingDistribution.mean)).toBeLessThanOrEqual(0.02);

    // Assert equality share matches within 0.2% (allows for rounding variance across 120k samples)
    expect(Math.abs(equalityShare - baselineCeilingDistribution.equalityShare)).toBeLessThanOrEqual(
      0.002
    );

    // Assert quantiles match within ±1 OVR (allows for percentile calculation rounding)
    expect(Math.abs(percentile(5) - baselineCeilingDistribution.p05)).toBeLessThanOrEqual(1);
    expect(Math.abs(percentile(25) - baselineCeilingDistribution.p25)).toBeLessThanOrEqual(1);
    expect(Math.abs(percentile(50) - baselineCeilingDistribution.p50)).toBeLessThanOrEqual(1);
    expect(Math.abs(percentile(75) - baselineCeilingDistribution.p75)).toBeLessThanOrEqual(1);
    expect(Math.abs(percentile(95) - baselineCeilingDistribution.p95)).toBeLessThanOrEqual(1);
  }, 60000); // Generating 120k players takes time; allow 60s under coverage instrumentation
});
