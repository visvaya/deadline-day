/**
 * Tests for analyst profile derivation.
 *
 * Analyst profiles assign each player a stable market profile, independent of
 * ceiling, OVR, age, club, formation and the main RNG stream. Profiles consist of:
 * - One of three metric bundles for their position group
 * - An impact side (attack/defence)
 * - A marketEdge in [-3, 3]
 *
 * All three components derive deterministically from player.id and position group.
 */

import { describe, it, expect } from "vitest";
import { ANALYST_BUNDLES } from "../../src/data/analyst-metrics";
import type { Player, PositionCode } from "../../src/data/types";
import { selectAnalystProfile } from "../../src/logic/analyst-profile";
import { analystPositionGroup } from "../../src/data/analyst-metrics";
import { AGE_PROFILES } from "../../src/data/balance";
import { develop } from "../../src/logic/development";
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

describe("selectAnalystProfile", () => {
  it("assigns one stable marketEdge independent of ceiling, OVR and age", () => {
    const observedEdges = new Set<number>();

    for (let i = 0; i < 500; i += 1) {
      const id = `stable-edge-${i}`;
      const variants = [
        createPlayer(id, "ŚO", 18, 58, 58),
        createPlayer(id, "ŚO", 18, 58, 90),
        createPlayer(id, "ŚO", 24, 72, 90),
        createPlayer(id, "ŚO", 31, 72, 72),
      ];
      const profiles = variants.map((player) => selectAnalystProfile(player));
      const edges = profiles.map(({ marketEdge }) => marketEdge);

      expect(edges.every(Number.isInteger)).toBe(true);
      expect(new Set(edges).size).toBe(1);
      expect(profiles.every(({ id: profileId }) => profileId === profiles[0]!.id)).toBe(true);
      expect(profiles.every(({ impactSide }) => impactSide === profiles[0]!.impactSide)).toBe(true);
      expect(profiles.every(({ metrics }) => metrics === profiles[0]!.metrics)).toBe(true);
      observedEdges.add(edges[0]!);
    }

    expect(observedEdges.size).toBe(7);
  });

  it("keeps marketEdge unchanged through real player development", () => {
    const playerRng = createRng(20260819);
    const developmentRng = createRng(0x19_08_2026);

    for (let i = 0; i < 500; i += 1) {
      let player = createGeneratedPlayer(playerRng, "mlody", "ŚO");
      const initialEdge = selectAnalystProfile(player).marketEdge;
      expect(Number.isInteger(initialEdge)).toBe(true);

      for (let season = 0; season < 5; season += 1) {
        player = develop(developmentRng, player, AGE_PROFILES[player.poz]);
        expect(selectAnalystProfile(player).marketEdge).toBe(initialEdge);
      }
    }
  });

  it("returns a profile with two metrics, an impact side, and a marketEdge", () => {
    const player = createPlayer("p1", "BR");
    const profile = selectAnalystProfile(player);

    expect(profile).toHaveProperty("metrics");
    expect(profile).toHaveProperty("impactSide");
    expect(profile).toHaveProperty("marketEdge");
    expect(profile.marketEdge).toBeDefined();
  });

  it("assigns bundle for correct position group", () => {
    const player = createPlayer("p1", "BR");
    const profile = selectAnalystProfile(player);

    // Goalkeepers should get one of three goalkeeper bundles
    const validBundles = ANALYST_BUNDLES.goalkeeper;
    const bundleIds = validBundles.map((b) => b.id);
    expect(bundleIds).toContain(profile.id);
  });

  it("returns stable profile for same player across calls", () => {
    const player = createPlayer("p1", "BR");
    const profile1 = selectAnalystProfile(player);
    const profile2 = selectAnalystProfile(player);

    expect(profile1.id).toBe(profile2.id);
    expect(profile1.impactSide).toBe(profile2.impactSide);
    expect(profile1.marketEdge).toBe(profile2.marketEdge);
    expect(profile1.metrics).toEqual(profile2.metrics);
  });

  it("returns marketEdge in [-3, 3]", () => {
    const player = createPlayer("p1", "BR");
    const profile = selectAnalystProfile(player);

    expect(profile.marketEdge).toBeGreaterThanOrEqual(-3);
    expect(profile.marketEdge).toBeLessThanOrEqual(3);
    expect(Number.isInteger(profile.marketEdge)).toBe(true);
  });

  it("different players get different profiles (deterministic but varied)", () => {
    const profiles = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const player = createPlayer(`p${i}`, "BR");
      const profile = selectAnalystProfile(player);
      profiles.add(`${profile.id}-${profile.marketEdge}`);
    }
    // 3 bundles × 7 marketEdge values = 21 max unique combinations per position
    expect(profiles.size).toBeGreaterThan(10);
    expect(profiles.size).toBeLessThanOrEqual(21);
  });

  it("handles all 15 position codes including rare ones (POM, ŚN)", () => {
    const positions: readonly PositionCode[] = [
      "BR",
      "LO",
      "ŚO",
      "PO",
      "CLS",
      "CPS",
      "ŚPD",
      "ŚP",
      "LP",
      "PP",
      "ŚPO",
      "LS",
      "PS",
      "CN",
      "N",
      "POM",
      "ŚN",
    ];

    for (const pos of positions) {
      const player = createPlayer("test", pos);
      const profile = selectAnalystProfile(player);

      expect(profile).toBeDefined();
      expect(profile.group).toBeDefined();
      expect(profile.impactSide).toMatch(/^(attack|defence)$/);

      // Bundle should match position group
      const posGroup = analystPositionGroup(pos);
      const validBundles = ANALYST_BUNDLES[posGroup];
      const bundleIds = validBundles.map((b) => b.id);
      expect(bundleIds).toContain(profile.id);
    }
  });
});

describe("analystPositionGroup mapping includes all position codes", () => {
  it("maps all 15 position codes (including POM and ŚN)", () => {
    const positions = [
      "BR",
      "LO",
      "ŚO",
      "PO",
      "CLS",
      "CPS",
      "ŚPD",
      "ŚP",
      "LP",
      "PP",
      "ŚPO",
      "LS",
      "PS",
      "CN",
      "N",
      "POM",
      "ŚN",
    ] as const;

    for (const pos of positions) {
      const group = analystPositionGroup(pos);
      expect(group).toBeDefined();
      expect([
        "goalkeeper",
        "centreBack",
        "wideDefender",
        "centralMidfielder",
        "attackingMidfielder",
        "striker",
      ]).toContain(group);
    }
  });
});
