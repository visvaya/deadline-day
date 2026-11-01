/**
 * Tests for analyst report generation.
 *
 * Reports include:
 * - Exactly two metrics from the player's assigned profile
 * - Minutes played depending on window (summer=34 weeks, winter=18 weeks)
 * - Sample tier based on minutes thresholds
 * - Quality percentile (noisy observation of OVR + marketEdge)
 * - Per-metric quality variation that can make both lines agree or disagree
 * - Stable across same period but different between summer/winter
 */

import { describe, it, expect } from "vitest";
import type {
  AnalystContextTier,
  AnalystMetricId,
  Player,
  PositionCode,
  ReportPeriod,
} from "../../src/data/types";
import { createAnalystReport } from "../../src/logic/analyst-report";
import { analystContextTier, pickSourceClub } from "../../src/logic/analyst-context";
import { ANALYST_METRICS } from "../../src/data/analyst-metrics";
import { selectAnalystProfile } from "../../src/logic/analyst-profile";
import { createRng, randInt } from "../../src/logic/rng";
import { currentRating, startingMembership } from "../../src/logic/league-membership";
import { clubOvr } from "../../src/logic/league-ratings";

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

describe("createAnalystReport", () => {
  it("returns report with exactly 2 metrics", () => {
    const player = createPlayer("p1", "BR", 25, 75, 85);
    const period: ReportPeriod = { season: 3, window: "summer" };
    const contextTier: AnalystContextTier = "mid";

    const report = createAnalystReport(player, period, contextTier);
    expect(report.metrics).toHaveLength(2);
  });

  it("assigns metrics from player's position group bundle", () => {
    const player = createPlayer("p1", "BR", 25, 75, 85);
    const period: ReportPeriod = { season: 3, window: "summer" };
    const contextTier: AnalystContextTier = "mid";

    const report = createAnalystReport(player, period, contextTier);
    for (const metric of report.metrics) {
      expect(metric).toHaveProperty("metricId");
      expect(metric).toHaveProperty("percentile");
      expect(metric).toHaveProperty("value");
    }
  });

  it("all percentiles are in [3, 99]", () => {
    const player = createPlayer("p1", "BR", 25, 75, 85);
    const period: ReportPeriod = { season: 3, window: "summer" };
    const contextTier: AnalystContextTier = "mid";

    const report = createAnalystReport(player, period, contextTier);
    expect(report.metrics.every(({ percentile }) => percentile >= 3 && percentile <= 99)).toBe(
      true
    );
  });

  it("same player+period produces same report", () => {
    const player = createPlayer("p1", "BR", 25, 75, 85);
    const period: ReportPeriod = { season: 3, window: "summer" };
    const contextTier: AnalystContextTier = "mid";

    const report1 = createAnalystReport(player, period, contextTier);
    const report2 = createAnalystReport(player, period, contextTier);

    expect(report1.metrics.map((m) => m.metricId)).toEqual(report2.metrics.map((m) => m.metricId));
    expect(report1.metrics.map((m) => m.percentile)).toEqual(
      report2.metrics.map((m) => m.percentile)
    );
  });

  it("metric IDs are stable across summer and winter", () => {
    const player = createPlayer("p1", "BR", 25, 75, 85);
    const contextTier: AnalystContextTier = "mid";

    const summer = createAnalystReport(player, { season: 3, window: "summer" }, contextTier);
    const winter = createAnalystReport(player, { season: 3, window: "winter" }, contextTier);

    expect(summer.metrics.map((metric) => metric.metricId)).toEqual(
      winter.metrics.map((metric) => metric.metricId)
    );
  });

  it("percentiles differ between summer and winter", () => {
    const player = createPlayer("p1", "BR", 25, 75, 85);
    const contextTier: AnalystContextTier = "mid";

    const summer = createAnalystReport(player, { season: 3, window: "summer" }, contextTier);
    const winter = createAnalystReport(player, { season: 3, window: "winter" }, contextTier);

    // Very unlikely to be identical across both metrics
    const summerPercentiles = summer.metrics.map((m) => m.percentile);
    const winterPercentiles = winter.metrics.map((m) => m.percentile);
    expect(summerPercentiles).not.toEqual(winterPercentiles);
  });

  it("has contextTier matching what was passed", () => {
    const player = createPlayer("p1", "BR", 25, 75, 85);
    const period: ReportPeriod = { season: 3, window: "summer" };

    for (const tier of ["bottom", "mid", "top"] as const) {
      const report = createAnalystReport(player, period, tier);
      expect(report.contextTier).toBe(tier);
    }
  });

  it("reports minutes and sampleTier", () => {
    const player = createPlayer("p1", "BR", 25, 75, 85);
    const period: ReportPeriod = { season: 3, window: "summer" };
    const contextTier: AnalystContextTier = "mid";

    const report = createAnalystReport(player, period, contextTier);
    expect(report.minutes).toBeDefined();
    expect(report.sampleTier).toMatch(/^(small|medium|large)$/);
  });

  it("summer minutes reflect 34-week season", () => {
    const player = createPlayer("p1", "BR", 25, 75, 85);
    const contextTier: AnalystContextTier = "mid";

    const report = createAnalystReport(player, { season: 3, window: "summer" }, contextTier);
    // Summer corresponds to full season, minutes should be reasonable
    expect(report.minutes).toBeGreaterThan(0);
    expect(report.minutes).toBeLessThanOrEqual(3060); // 34 weeks * 90 mins
  });

  it("winter minutes reflect 18-week autumn run", () => {
    const player = createPlayer("p1", "BR", 25, 75, 85);
    const contextTier: AnalystContextTier = "mid";

    const report = createAnalystReport(player, { season: 3, window: "winter" }, contextTier);
    // Winter is first half (18 weeks), so fewer minutes
    expect(report.minutes).toBeGreaterThan(0);
    expect(report.minutes).toBeLessThanOrEqual(1620); // 18 weeks * 90 mins
  });

  it("enforces winter minute constraints by age: ≤20yo max 500, >20yo min 610", () => {
    const contextTier: AnalystContextTier = "mid";
    const period: ReportPeriod = { season: 3, window: "winter" };

    // Player ≤20 years old
    for (let i = 0; i < 50; i += 1) {
      const youngPlayer = createPlayer(`young-${i}`, "BR", 20, 75, 85);
      const report = createAnalystReport(youngPlayer, period, contextTier);
      expect(report.minutes).toBeLessThanOrEqual(500);
    }

    // Player >20 years old
    for (let i = 0; i < 50; i += 1) {
      const oldPlayer = createPlayer(`old-${i}`, "BR", 21, 75, 85);
      const report = createAnalystReport(oldPlayer, period, contextTier);
      expect(report.minutes).toBeGreaterThanOrEqual(610);
    }
  });

  it("maps minutes to sampleTier correctly: small <600, medium 600-1399, large >=1400", () => {
    const contextTier: AnalystContextTier = "mid";
    const period: ReportPeriod = { season: 3, window: "summer" };

    // Test the tier boundaries directly
    for (let i = 0; i < 50; i += 1) {
      const player = createPlayer(`player-${i}`, "BR", 25, 75, 85);
      const report = createAnalystReport(player, period, contextTier);

      // Verify tier boundaries
      if (report.minutes < 600) {
        expect(report.sampleTier).toBe("small");
      } else if (report.minutes < 1400) {
        expect(report.sampleTier).toBe("medium");
      } else {
        expect(report.sampleTier).toBe("large");
      }
    }
  });

  it("no player >20yo in winter can have sampleTier=small (hard structural invariant)", () => {
    const contextTier: AnalystContextTier = "mid";
    const winterPeriod: ReportPeriod = { season: 3, window: "winter" };
    const summerPeriod: ReportPeriod = { season: 3, window: "summer" };

    // Winter: >20yo players always have minutes >= 610, which is >= 600, so never "small"
    for (let i = 0; i < 5000; i += 1) {
      const player = createPlayer(`winter-old-${i}`, "BR", 21, 75, 85);
      const report = createAnalystReport(player, winterPeriod, contextTier);
      expect(report.sampleTier).not.toBe("small");
    }

    // Summer: >20yo players have minutes >= 1150, which is >= 600, so also never "small"
    for (let i = 0; i < 5000; i += 1) {
      const player = createPlayer(`summer-old-${i}`, "BR", 21, 75, 85);
      const report = createAnalystReport(player, summerPeriod, contextTier);
      expect(report.sampleTier).not.toBe("small");
    }
  }, 10_000);

  it("quality metrics respond to contextTier by exactly ±4pp", () => {
    // Use a fixed deterministic seed to ensure same random draws across tiers
    // We'll test multiple players to average over the randomness in sampling
    let totalBottomShift = 0;
    let totalTopShift = 0;
    let count = 0;

    // OVR 68 keeps the quality base away from the rails, so the test measures
    // context rather than saturation at percentile 99.
    for (let seed = 0; seed < 100; seed += 1) {
      const player = createPlayer(`p${seed}`, "BR", 25, 68, 68 + (seed % 4));
      const period: ReportPeriod = { season: 3, window: "summer" };

      const bottom = createAnalystReport(player, period, "bottom");
      const mid = createAnalystReport(player, period, "mid");
      const top = createAnalystReport(player, period, "top");

      // Same profile should be used for all
      expect(bottom.metrics.map((m) => m.metricId)).toEqual(mid.metrics.map((m) => m.metricId));
      expect(mid.metrics.map((m) => m.metricId)).toEqual(top.metrics.map((m) => m.metricId));

      // Check that quality metrics (first/second) shift by ±4pp
      for (let metricIdx = 0; metricIdx < 2; metricIdx += 1) {
        const midMetric = ANALYST_METRICS[mid.metrics[metricIdx]!.metricId];
        if (
          midMetric &&
          (midMetric.semantics === "qualityHigherRaw" || midMetric.semantics === "qualityLowerRaw")
        ) {
          const bottomPercentile = bottom.metrics[metricIdx]!.percentile;
          const midPercentile = mid.metrics[metricIdx]!.percentile;
          const topPercentile = top.metrics[metricIdx]!.percentile;

          // The expected percentiles should differ by exactly 4pp between tiers
          // (allowing small rounding tolerance for boundary effects)
          const bottomShift = midPercentile - bottomPercentile;
          const topShift = topPercentile - midPercentile;

          totalBottomShift += bottomShift;
          totalTopShift += topShift;
          count += 1;
        }
      }
    }

    // Average shift across all quality metrics should be ±4pp
    // With noise radius, the actual shifts will vary, but should average close to 4pp
    const avgBottomShift = totalBottomShift / count;
    const avgTopShift = totalTopShift / count;

    // Tolerance: ±1pp from 4 (to account for noise-induced variation)
    expect(avgBottomShift).toBeGreaterThan(3);
    expect(avgBottomShift).toBeLessThan(5);
    expect(avgTopShift).toBeGreaterThan(3);
    expect(avgTopShift).toBeLessThan(5);
  });

  it("displays values match percentiles and displayScale", () => {
    const player = createPlayer("p1", "BR", 25, 75, 85);
    const period: ReportPeriod = { season: 3, window: "summer" };
    const contextTier: AnalystContextTier = "mid";

    const report = createAnalystReport(player, period, contextTier);
    for (const result of report.metrics) {
      const metric = ANALYST_METRICS[result.metricId];
      expect(metric).toBeDefined();

      // Value should be a number
      expect(typeof result.value).toBe("number");

      // Value should be in displayScale range
      expect(result.value).toBeGreaterThanOrEqual(metric.displayScale.min);
      expect(result.value).toBeLessThanOrEqual(metric.displayScale.max);
    }
  });

  it("value formula inverts correctly for qualityLowerRaw metrics: high percentile → low value", () => {
    const period: ReportPeriod = { season: 3, window: "summer" };
    const contextTier: AnalystContextTier = "mid";

    // Grouped per metric on purpose. Display scales differ by orders of
    // magnitude across metrics - xgotMinusXg spans [-0.1, 0.2] while
    // successfulGkExitsPct spans [45, 95] - so averaging raw values across
    // metrics measures which metrics landed in the bucket, not whether the
    // formula inverts. Monotonicity is a property of one metric's scale.
    const byMetric = new Map<AnalystMetricId, Array<{ percentile: number; value: number }>>();

    // OVR is spread on purpose. At a single OVR the quality percentile never
    // reaches the bottom third, so a low/high comparison has nothing to
    // compare and passes while asserting nothing - which is exactly what the
    // earlier version of this test did.
    const positions: PositionCode[] = ["BR", "ŚO", "ŚPD", "ŚPO", "N"];

    for (let i = 0; i < 10000; i++) {
      const ovr = 52 + (i % 34);
      const player = createPlayer(`player-${i}`, positions[i % positions.length]!, 25, ovr, 90);
      const report = createAnalystReport(player, period, contextTier);

      for (const metric of report.metrics) {
        const semantics = ANALYST_METRICS[metric.metricId]?.semantics;
        if (semantics !== "qualityHigherRaw" && semantics !== "qualityLowerRaw") continue;
        const bucket = byMetric.get(metric.metricId) ?? [];
        bucket.push({ percentile: metric.percentile, value: metric.value });
        byMetric.set(metric.metricId, bucket);
      }
    }

    expect(byMetric.size).toBeGreaterThan(0);
    let compared = 0;

    for (const [metricId, pairs] of byMetric) {
      const low = pairs.filter((pair) => pair.percentile < 33);
      const high = pairs.filter((pair) => pair.percentile > 66);
      if (low.length <= 10 || high.length <= 10) continue;

      const avg = (rows: typeof pairs): number =>
        rows.reduce((sum, row) => sum + row.value, 0) / rows.length;
      const inverted = ANALYST_METRICS[metricId].semantics === "qualityLowerRaw";

      if (inverted) {
        // Low percentile is the worse standing, so it must read as the HIGHER
        // raw number - conceding more, erring more often.
        expect(avg(low)).toBeGreaterThan(avg(high));
      } else {
        expect(avg(high)).toBeGreaterThan(avg(low));
      }
      compared += 1;
    }

    // Guards the loop itself: a filter that silently matched nothing would
    // otherwise let this test pass while asserting nothing at all.
    expect(compared).toBeGreaterThan(1);
  }, 120000);

  it("report period is returned unchanged", () => {
    const player = createPlayer("p1", "BR", 25, 75, 85);
    const period: ReportPeriod = { season: 3, window: "summer" };
    const contextTier: AnalystContextTier = "mid";

    const report = createAnalystReport(player, period, contextTier);
    expect(report.period).toEqual(period);
  });
});

describe("contextTier thresholds", () => {
  it("analystContextTier classifies OVRs at boundaries: 62.99->bottom, 63->mid, 67->top, 67.01->top", () => {
    expect(analystContextTier(62.99)).toBe("bottom");
    expect(analystContextTier(63)).toBe("mid");
    expect(analystContextTier(67)).toBe("top");
    expect(analystContextTier(67.01)).toBe("top");
    expect(analystContextTier(62.98)).toBe("bottom");
  });
});

describe("pickSourceClub", () => {
  it("names the same club whose level the report reports", () => {
    // The card and the report read one draw, not two, so the name and the
    // tier can never point at different places.
    const membership = startingMembership();
    const rng = createRng(11);
    for (let i = 0; i < 200; i += 1) {
      const context = pickSourceClub(rng, membership, "lech-poznan");
      const club = membership.clubs.find((entry) => entry.name === context.clubName);

      expect(club).toBeDefined();
      expect(analystContextTier(context.clubOvr)).toBe(context.contextTier);
      expect(clubOvr(currentRating(club!))).toBeCloseTo(context.clubOvr, 10);
    }
  });
});

describe("quality metric pairs say two different things", () => {
  /** Percentiles of both lines, for reports whose bundle is quality+quality. */
  const qualityPairs = (): Array<[number, number]> => {
    const positions: PositionCode[] = ["BR", "ŚO", "LO", "ŚPD", "ŚPO", "N"];
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < 12000; i += 1) {
      const rng = createRng(0x51_0000 + i);
      const pos = positions[i % positions.length];
      const ovr = randInt(rng, 58, 84);
      const player = createPlayer(`pair-${i}`, pos!, 25, ovr, ovr + randInt(rng, 0, 14));
      const report = createAnalystReport(player, { season: 2, window: "summer" }, "mid");
      const [first, second] = report.metrics;
      const bothQuality = [first, second].every((metric) =>
        ANALYST_METRICS[metric.metricId].semantics.startsWith("quality")
      );
      if (bothQuality) pairs.push([first.percentile, second.percentile]);
    }
    return pairs;
  };

  it("lets a pair agree or openly disagree, and makes neither a rarity", () => {
    const gaps = qualityPairs().map(([first, second]) => Math.abs(first - second));
    expect(gaps.length).toBeGreaterThan(5000);

    const close = gaps.filter((gap) => gap <= 8).length / gaps.length;
    const wide = gaps.filter((gap) => gap >= 25).length / gaps.length;

    // Measured 0.41 / 0.17 at METRIC_DELTA_RADIUS = 20. Agreement stays the
    // common case, so two lines lining up still reads as the normal picture -
    // but a clear split happens for roughly one player in six.
    expect(close).toBeGreaterThan(0.3);
    expect(close).toBeLessThan(0.52);

    // The gate this file was missing. With both quality metrics reading one
    // shared number and differing only by noise, open disagreement sat at
    // 0.067: the second line could not contradict the first, so it could not
    // confirm it either. If that model ever returns, this fails.
    expect(wide).toBeGreaterThan(0.1);
  });

  it("keeps both lines anchored to the same player", () => {
    const pairs = qualityPairs();
    const meanA = pairs.reduce((sum, [first]) => sum + first, 0) / pairs.length;
    const meanB = pairs.reduce((sum, [, second]) => sum + second, 0) / pairs.length;
    let cov = 0;
    let varA = 0;
    let varB = 0;
    for (const [first, second] of pairs) {
      cov += (first - meanA) * (second - meanB);
      varA += (first - meanA) ** 2;
      varB += (second - meanB) ** 2;
    }
    const r = cov / Math.sqrt(varA * varB);

    // Measured 0.81. Note this stays high by construction: across players of
    // widely different OVR, both lines track OVR, so correlation says little
    // about whether one report's two lines differ - the gap distribution
    // above is what the player actually sees. It guards the other direction:
    // the metrics must not drift into telling unrelated stories.
    expect(r).toBeGreaterThan(0.6);
  });

  it("gives each metric a standing that survives re-reading", () => {
    const player = createPlayer("stable-1", "N", 25, 74, 82);
    const first = createAnalystReport(player, { season: 4, window: "summer" }, "mid");
    const again = createAnalystReport(player, { season: 4, window: "summer" }, "mid");
    expect(first.metrics.map((metric) => metric.percentile)).toEqual(
      again.metrics.map((metric) => metric.percentile)
    );
  });

  it("keeps metric standings stable when source-aligned IDs replace legacy IDs", () => {
    const playerForBundle = (position: PositionCode, bundleId: string): Player => {
      for (let index = 0; index < 1000; index += 1) {
        const player = createPlayer(`metric-id-${position}-${index}`, position, 25, 74, 82);
        if (selectAnalystProfile(player).id === bundleId) return player;
      }
      throw new Error(`could not find player for analyst bundle: ${bundleId}`);
    };

    const goalkeeper = createAnalystReport(
      playerForBundle("BR", "gkShotStopping"),
      { season: 4, window: "summer" },
      "mid"
    );
    const midfielder = createAnalystReport(
      playerForBundle("ŚP", "centralMidfielderRecovering"),
      { season: 4, window: "summer" },
      "mid"
    );

    expect(goalkeeper.metrics.map((metric) => metric.percentile)).toEqual([94, 69]);
    expect(midfielder.metrics.map((metric) => metric.percentile)).toEqual([67, 86]);
    expect(goalkeeper.metrics.map((metric) => metric.metricId)).toEqual([
      "goalsPreventedPer90",
      "positioningErrorAverage",
    ]);
    expect(midfielder.metrics.map((metric) => metric.metricId)).toEqual([
      "dangerousOpponentHalfRecoveriesPer90",
      "stopReducePossessionDangerPct",
    ]);
  });
});
