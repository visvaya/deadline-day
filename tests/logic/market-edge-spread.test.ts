import { describe, expect, test } from "vitest";

import { CLUBS as ALL_CLUBS } from "../../src/data/clubs";
import { FORMACJE } from "../../src/data/positions";
import { ANALYST_BUNDLES, analystPositionGroup } from "../../src/data/analyst-metrics";
import type { FormationId, ImpactSide, Player } from "../../src/data/types";
import { benchWeight } from "../../src/logic/european-cups";
import { clubRating } from "../../src/logic/league-ratings";
import { sideAdjustment } from "../../src/logic/player-impact";
import { at } from "../../src/logic/invariant";
import { createRng } from "../../src/logic/rng";
import {
  createSquadFromFormation,
  squadRatings,
  startingXi,
  substitutes,
} from "../../src/logic/squad";

/**
 * The hidden per-career spread of the universal market edge.
 *
 * Since playerImpact stopped checking `moj`, the starting squad arrives with a
 * fixed total edge that lasts the whole five seasons. A career gets ONE draw,
 * so the mean over many careers says nothing about it: it comes out at zero
 * whether the spread is 0.1 or 3 OVR. Nothing else in the suite measures this,
 * and it feeds squadStrength, and through it finance.ts and the expected
 * league place that sets revenue - so it compounds over the whole game.
 *
 * The bands are two-sided on purpose. A one-sided cap would catch an
 * accidental amplification (a raised multiplier, a widened marketEdge range)
 * but not an accidental muting, which is the quieter and more likely
 * regression: the mechanic would simply stop mattering and every other test
 * would stay green.
 *
 * SCALE OF REFERENCE (match-engine calibration): the
 * league model spans 12.21 OVR with SD 3.17 between clubs, and the median gap
 * between neighbours in the table is 0.52 OVR. The hidden lottery is meant to
 * sit a little above that gap - below it, no report could ever reveal it.
 *
 * SPEC CORRECTION. Design 2.1 records "SD 0.67, p05-p95 2.18, extremes +-2.8"
 * and labels it the ATTACK side. Measured here, those are the DEFENCE figures;
 * attack sits at SD 0.92. The asymmetry is structural, not noise: impactSide
 * comes from the metric bundle, bundles belong to position groups, and the
 * attacking groups are far more likely to carry an attack-side bundle. Per XI
 * that is ~7.5 attack contributors against ~3.4 defence ones, and since
 * sideAdjustment divides by the full roster either way, the side with more
 * contributors has the wider sum. Predicted SD ratio sqrt(7.5/3.4) = 1.49,
 * measured 1.43. The bands below therefore differ per side, and "attack
 * contributors outnumber defence ones" is itself asserted, so the explanation
 * cannot silently stop being true.
 */

const CLUBS = ALL_CLUBS;
const FORMATIONS = Object.keys(FORMACJE) as FormationId[];
/** 16 clubs x 7 formations x 45 seeds = 5040 careers worth of starting squads. */
const SEEDS_PER_COMBINATION = 45;
const WEIGHT = benchWeight(null);

type Sample = {
  readonly club: string;
  readonly formation: FormationId;
  readonly attack: number;
  readonly defence: number;
  readonly attackRatio: number;
  readonly defenceRatio: number;
};

/** The whole squad's hidden correction on one side, on the internal OVR-like
 * scale squadStrength works in: the XI and the six-man bench, weighted exactly
 * as the production aggregate weights them. */
const hiddenAdjustment = (
  xi: readonly Player[],
  bench: readonly Player[],
  side: ImpactSide
): number =>
  sideAdjustment([...xi], side) * WEIGHT.xi + sideAdjustment([...bench], side) * WEIGHT.bench;

/** Built once. Never synthetic players sharing one edge - a degenerate
 * population would pass every band here while the real generator produced
 * something else entirely. */
const buildSamples = (): Sample[] => {
  const samples: Sample[] = [];
  CLUBS.forEach((club, clubIndex) => {
    const rating = clubRating(club);
    FORMATIONS.forEach((formationId, formationIndex) => {
      const formation = FORMACJE[formationId];
      for (let seed = 0; seed < SEEDS_PER_COMBINATION; seed += 1) {
        const rng = createRng(0x9e37_0000 + clubIndex * 1000 + formationIndex * 100 + seed);
        const squad = createSquadFromFormation(rng, formation, rating);
        const xi = startingXi(squad, formation);
        const bench = substitutes(squad, formation).slice(0, 6);
        const ratings = squadRatings(squad, null, formation);
        samples.push({
          club: club.shortName,
          formation: formationId,
          attack: hiddenAdjustment(xi, bench, "attack"),
          defence: hiddenAdjustment(xi, bench, "defence"),
          attackRatio: ratings.attack / rating.attack,
          defenceRatio: ratings.defence / rating.defence,
        });
      }
    });
  });
  return samples;
};

const SAMPLES = buildSamples();

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

const sd = (xs: readonly number[]): number => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

const percentile = (xs: readonly number[], p: number): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return at(sorted, Math.min(sorted.length - 1, Math.floor(p * sorted.length)), "percentile");
};

const on = (side: ImpactSide, from: readonly Sample[] = SAMPLES): number[] =>
  from.map((sample) => (side === "attack" ? sample.attack : sample.defence));

/** Measured 2026-08-20 over the 5040 squads above: attack mean 0.005 / SD
 * 0.923 / p01 -2.156 / p99 2.162, defence mean -0.010 / SD 0.647 / p01 -1.555
 * / p99 1.521. Widening a band to make a run pass defeats the test - if the
 * numbers move, find out what moved them. */
const SIDE_BANDS: Record<ImpactSide, { sdMin: number; sdMax: number }> = {
  attack: { sdMin: 0.8, sdMax: 1.05 },
  defence: { sdMin: 0.55, sdMax: 0.75 },
};

describe("hidden per-career spread of the market edge", () => {
  test("the sample really does span all clubs and formations", () => {
    expect(SAMPLES).toHaveLength(CLUBS.length * FORMATIONS.length * SEEDS_PER_COMBINATION);
    expect(new Set(SAMPLES.map((sample) => sample.club)).size).toBe(CLUBS.length);
    expect(new Set(SAMPLES.map((sample) => sample.formation)).size).toBe(FORMATIONS.length);
  });

  test.each(["attack", "defence"] as const)("%s stays inside its band", (side) => {
    const values = on(side);
    const band = SIDE_BANDS[side];

    expect(Math.abs(mean(values))).toBeLessThan(0.05);
    expect(sd(values)).toBeGreaterThan(band.sdMin);
    expect(sd(values)).toBeLessThan(band.sdMax);
    expect(Math.abs(percentile(values, 0.01))).toBeLessThan(2.5);
    expect(Math.abs(percentile(values, 0.99))).toBeLessThan(2.5);
  });

  test("the spread is bigger than the gap between neighbouring clubs", () => {
    // Below the 0.52 OVR median gap the mechanic would be undiscoverable; far
    // above it, reading reports would beat picking a better club.
    for (const side of ["attack", "defence"] as const) {
      expect(sd(on(side)), side).toBeGreaterThan(0.52);
    }
  });

  test("each formation and side keeps its own spread, not just the pooled one", () => {
    // impactSide comes from the metric bundle and bundles belong to position
    // groups, so 3-5-2 and 5-3-2 field a different number of contributors per
    // side. Pooling would average that away.
    for (const formationId of FORMATIONS) {
      const subset = SAMPLES.filter((sample) => sample.formation === formationId);
      for (const side of ["attack", "defence"] as const) {
        const values = on(side, subset);
        const band = SIDE_BANDS[side];
        expect(Math.abs(mean(values)), `${formationId} ${side} mean`).toBeLessThan(0.15);
        expect(sd(values), `${formationId} ${side} sd`).toBeGreaterThan(band.sdMin - 0.03);
        expect(sd(values), `${formationId} ${side} sd`).toBeLessThan(band.sdMax + 0.03);
      }
    }
  });

  test("every formation fields more attack-side contributors than defence-side ones", () => {
    // The reason the two bands differ. If this ever flips, the bands above are
    // describing a game that no longer exists.
    for (const formationId of FORMATIONS) {
      const formation = FORMACJE[formationId];
      const attackContributors = formation.pozycje.reduce((total, slot) => {
        const bundles = ANALYST_BUNDLES[analystPositionGroup(slot.kod)];
        const share = bundles.filter((bundle) => bundle.impactSide === "attack").length / 3;
        return total + share * slot.xi;
      }, 0);
      const xiSize = formation.pozycje.reduce((total, slot) => total + slot.xi, 0);

      expect(attackContributors, formationId).toBeGreaterThan(xiSize - attackContributors);
    }
  });

  test("each club's starting squad stays anchored to its own attack/defence pair", () => {
    // A globally zero mean can still hide one club being systematically lifted
    // and another pushed down, so this is checked per club, per side.
    for (const club of CLUBS) {
      const subset = SAMPLES.filter((sample) => sample.club === club.shortName);
      const attack = mean(subset.map((sample) => sample.attackRatio));
      const defence = mean(subset.map((sample) => sample.defenceRatio));

      expect(Math.abs(attack - 1), `${club.shortName} attack`).toBeLessThan(0.03);
      expect(Math.abs(defence - 1), `${club.shortName} defence`).toBeLessThan(0.03);
    }
  });
}, 120_000);
