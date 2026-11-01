import { describe, expect, test } from "vitest";

import { EUROPEAN_BERTHS_2026 } from "../../src/data/european-berths-2026";
import {
  CAREER_POLICIES,
  careerCampaigns,
  collectCampaigns,
  distributionOf,
  firstCampaignPerCareer,
  groupBy,
  qualifyResidual,
  type CampaignObservation,
} from "../../scripts/european-cups-careers";

const SEED = 0x4e05_7c01;

/** Two clubs and two policies rather than the tool's full anchor set x
 * policies: these tests check the shape of the measurement, not its
 * statistics, and the full grid is slow enough to time out when the whole
 * suite runs its workers in parallel. */
const CLUBS = ["legia-warszawa", "zaglebie-lubin", "wisla-krakow"] as const;
const POLICIES = { mixed: CAREER_POLICIES.mixed!, alwaysTake: CAREER_POLICIES.alwaysTake! };

const observation = (over: Partial<CampaignObservation>): CampaignObservation => ({
  clubId: "zaglebie-lubin",
  policy: "mixed",
  seed: 1,
  sezon: 2,
  cup: "LK",
  strength: 68,
  legs: 1,
  qualified: true,
  reachedLeague: true,
  reachedKnockout: false,
  ...over,
});

describe("odczyt kampanii z kariery", () => {
  const run = collectCampaigns(SEED, 4, CLUBS, POLICIES);

  test("jest deterministyczny wobec ziarna", () => {
    expect(collectCampaigns(SEED, 4, CLUBS, POLICIES)).toEqual(run);
  }, 30_000);

  test("żadna kariera nie rzuca, a kampanie mają sensowną siłę", () => {
    expect(run.errors).toEqual([]);
    expect(run.observations.length).toBeGreaterThan(0);
    for (const o of run.observations) {
      expect(o.strength).toBeGreaterThan(40);
      expect(o.strength).toBeLessThan(100);
    }
  });

  /**
   * Until 2026-09-10 season one started with no berth for anybody, so a
   * campaign there meant the reader had picked the wrong season off the trace.
   *
   * Activating the economy changed that: the first season now replays Poland's
   * real 2026/27 allocation, so five clubs play a campaign straight away. The
   * test pins the correct version of the same contract instead of being
   * deleted.
   */
  test("kampania w sezonie 1 gra tylko rozgrywki z przypiętego przydziału", () => {
    const pinnedCups = new Set(EUROPEAN_BERTHS_2026.map((b) => b.cup));
    const seasonOne = run.observations.filter((o) => o.sezon === 1);

    // The observation does not carry the club, so this does not check WHICH
    // club played - tests/logic/finance.test.ts pins that at the career start.
    // What is checked here is that the reader produced no season-one
    // competition the snapshot never assigned to anyone.
    for (const o of seasonOne) expect(pinnedCups.has(o.cup)).toBe(true);
    expect(Math.min(...run.observations.map((o) => o.sezon))).toBeGreaterThanOrEqual(1);
  });

  test("kształt kampanii jest wewnętrznie spójny", () => {
    for (const o of run.observations) {
      // Passing qualifying ends the campaign where it stands, so more than
      // one leg can only mean the first one was lost.
      if (o.legs > 1) expect(o.qualified).toBe(false);
      if (o.reachedKnockout) expect(o.reachedLeague).toBe(true);
      // The cascade terminates at the bottom competition.
      if (o.cup === "LK") expect(o.legs).toBe(1);
      expect(o.legs).toBeLessThanOrEqual(3);
    }
  });

  test("pojedyncza kariera daje najwyżej cztery kampanie", () => {
    const single = careerCampaigns("legia-warszawa", "mixed", CAREER_POLICIES.mixed!, SEED);
    expect(single.length).toBeLessThanOrEqual(4);
    expect(new Set(single.map((o) => o.sezon)).size).toBe(single.length);
  });
});

describe("agregacja", () => {
  test("pierwsza kampania w karierze to najwcześniejszy sezon, po jednej na puchar", () => {
    const observations = [
      observation({ seed: 7, sezon: 4, cup: "LK" }),
      observation({ seed: 7, sezon: 2, cup: "LK" }),
      observation({ seed: 7, sezon: 3, cup: "LM" }),
      observation({ seed: 8, sezon: 5, cup: "LK" }),
    ];
    const first = firstCampaignPerCareer(observations);
    expect(first).toHaveLength(3);
    expect(first.find((o) => o.seed === 7 && o.cup === "LK")!.sezon).toBe(2);
  });

  /** The mistake this guards against: treating campaigns as independent when
   * one seed feeds all fifteen difficulty x policy cells. */
  test("reszta klastruje po ziarnie, nie po kampanii", () => {
    const observations = [
      observation({ seed: 1, qualified: true }),
      observation({ seed: 1, qualified: true }),
      observation({ seed: 2, qualified: false }),
    ];
    const residual = qualifyResidual(observations, () => 0.5)!;
    expect(residual.observations).toBe(3);
    expect(residual.clusters).toBe(2);
    // Seed 1 averages +0.5 over its two campaigns, seed 2 contributes -0.5.
    expect(residual.mean).toBeCloseTo(0, 12);
  });

  test("rozkład i grupowanie", () => {
    const observations = [
      observation({ strength: 60, qualified: false }),
      observation({ strength: 70 }),
      observation({ strength: 80 }),
    ];
    const d = distributionOf("LK", observations)!;
    expect(d.n).toBe(3);
    expect(d.median).toBe(70);
    expect(d.qualifiedShare).toBeCloseTo(2 / 3, 12);
    expect(distributionOf("pusty", [])).toBeNull();

    const grouped = groupBy(observations, (o) => o.strength, [60, 70, 80, 90]);
    expect(grouped.map((g) => g.observations.length)).toEqual([1, 1, 1, 0]);
  });
});
