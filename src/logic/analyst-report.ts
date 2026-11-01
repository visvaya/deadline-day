/**
 * Analyst report generation.
 *
 * Generates a two-metric observation of a player for a specific season/window.
 * Reports include:
 * - Exactly two metrics from the player's assigned bundle
 * - Minutes played (depends on window and age)
 * - Sample tier (small/medium/large based on minutes)
 * - Quality percentile (noisy observation of OVR + marketEdge + per-metric
 *   metricDelta, adjusted by context tier)
 * - Presentation value (derived from percentile and displayScale, no second draw)
 *
 * Critical: All sampling uses PRE-CLAMP-THEN-UNIFORM-DRAW, never post-clamp.
 * This prevents artificial pile-up at boundaries 3 and 99.
 */

import { ANALYST_METRICS } from "../data/analyst-metrics";
import type {
  AnalystContextTier,
  AnalystMetricId,
  AnalystMetricResult,
  AnalystReport,
  Player,
  PlayingTime,
  ReportPeriod,
  SampleTier,
} from "../data/types";
import { createRng, rand, type Rng } from "./rng";
import { selectAnalystProfile } from "./analyst-profile";
import { deriveSeed } from "./stable-seed";

/**
 * Clamp value to [min, max].
 */
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Determine sample tier from minutes played.
 * Universal thresholds per brief: small <600, medium [600, 1399], large >=1400.
 * This maps directly to the minutes table: both windows/ages produce ranges
 * that fall into these tiers in the expected pattern.
 */
const sampleTierFromMinutes = (minutes: number): SampleTier => {
  if (minutes < 600) return "small";
  if (minutes < 1400) return "medium";
  return "large";
};

/**
 * Get noise radii (in percentile points) for quality observation based on sample tier and metric index.
 * Brief specifies differentiated radii per metric: metric-1/metric-2.
 * Metric-2 always has wider radius (less certain second signal).
 * Radii: 24/32, 16/24, 10/16 for small/medium/large respectively.
 */
const getQualityRadius = (tier: SampleTier, metricIndex: 0 | 1): number => {
  if (metricIndex === 0) {
    // Metric-1 (more certain)
    switch (tier) {
      case "small":
        return 24;
      case "medium":
        return 16;
      case "large":
        return 10;
    }
  } else {
    // Metric-2 (less certain)
    switch (tier) {
      case "small":
        return 32;
      case "medium":
        return 24;
      case "large":
        return 16;
    }
  }
};

/**
 * Convert a percentile-scale value to a displayed value using the metric's displayScale.
 * For qualityHigherRaw: t = percentile / 100
 * For qualityLowerRaw: t = 1 - percentile / 100 (inverted: high percentile → low value, good outcome)
 * Then: value = min + (max - min) * t, rounded/truncated per decimals.
 */
export const analystMetricValueFromPercentile = (
  percentile: number,
  metricId: AnalystMetricId
): number => {
  const metric = ANALYST_METRICS[metricId];
  if (!metric) throw new Error(`unknown metric: ${metricId}`);

  const { min, max, decimals } = metric.displayScale;
  const t = metric.semantics === "qualityLowerRaw" ? 1 - percentile / 100 : percentile / 100;
  const value = min + (max - min) * t;

  // Apply decimal rounding
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
};

/** How far one quality metric may sit from its bundle's shared domain base. */
const METRIC_DELTA_RADIUS = 20;

/**
 * Metric IDs are part of the stable presentation seed. Keep the original seed
 * input when a source-alignment rename changes only the serialized identifier,
 * otherwise the same player would silently receive different metric standings.
 */
const METRIC_DELTA_SEED_IDS: Partial<Record<AnalystMetricId, string>> = {
  goalsPreventedPer90: "goalsPreventedRate",
  dangerousOpponentHalfRecoveriesPer90: "dangerousOpponentHalfRecoveryPct",
};

/**
 * A player's standing in ONE quality metric, relative to the domain he shares
 * with the bundle's other metric.
 *
 * Without this both quality metrics observe a single hidden number and differ
 * only by noise, so they agree by construction - measured at r = 0.86, and
 * 0.94 once the sample is large. That makes the second line almost redundant:
 * it cannot confirm or contradict the first, because there is nothing
 * independent for it to say. A striker could not be sharp at getting good
 * chances and wasteful at taking them.
 *
 * Drawn uniformly, so a pair lands close as readily as far apart: two metrics
 * agreeing then means something, rather than being guaranteed.
 *
 * Seeded from the player's id and the metric only - never from the ceiling,
 * nor from anything correlated with it - so this opens no new channel to the
 * hidden potential. Display only: the engine still reads `marketEdge`.
 */
const stableMetricDelta = (playerId: string, metricId: AnalystMetricId): number => {
  const seedMetricId = METRIC_DELTA_SEED_IDS[metricId] ?? metricId;
  const rng = createRng(deriveSeed(playerId, seedMetricId, "analyst-metric-delta-v1"));
  return Math.floor(rand(rng, -METRIC_DELTA_RADIUS, METRIC_DELTA_RADIUS + 1));
};

/**
 * Draw a noisy percentile with pre-clamp-then-uniform-draw.
 * Clamps the range [basePercentile - radius, basePercentile + radius] to [3, 99],
 * then draws uniformly from the clamped range.
 */
const drawNoisyPercentile = (rng: Rng, basePercentile: number, radius: number): number => {
  const minClipped = Math.max(3, basePercentile - radius);
  const maxClipped = Math.min(99, basePercentile + radius);
  return Math.floor(rand(rng, minClipped, maxClipped + 1));
};

/**
 * Draw minutes played in a window, depending on window type and player age.
 * Per brief's minutes table:
 * - summer age≤20: [280, 950]
 * - summer age>20: [1150, 2650]
 * - winter age≤20: [150, 500]
 * - winter age>20: [610, 1400]
 */
const drawMinutes = (rng: Rng, age: number, window: "summer" | "winter"): number => {
  if (window === "summer") {
    if (age <= 20) {
      return Math.floor(rand(rng, 280, 951)); // [280, 950]
    } else {
      return Math.floor(rand(rng, 1150, 2651)); // [1150, 2650]
    }
  } else {
    // Winter
    if (age <= 20) {
      return Math.floor(rand(rng, 150, 501)); // [150, 500]
    } else {
      return Math.floor(rand(rng, 610, 1401)); // [610, 1400]
    }
  }
};

/**
 * What a player's place in OUR squad does to his minutes.
 *
 * The age-based draw above describes a player we do not pick - a transfer
 * target somewhere else, whose role at his own club we can only assume from
 * his age. For a player already in our squad we know exactly how much he
 * plays, and the report has to agree with it: a reserve goalkeeper on 52 OVR
 * showing the same near-complete season as the 72 OVR starter ahead of him is
 * simply a wrong report.
 *
 * The tiers mirror the ones ageSquad already uses for season form - the XI,
 * then FORM_ROTATION_SLOTS substitutes, then the rest - so the number the
 * player reads and the number that moves his development mean the same thing.
 *
 * The knock-on effect on sampleTier is intended, not a side effect: a player
 * who barely appears is a player the analyst knows less about, so the
 * observation radius widens and the report says so out loud.
 */
const PLAYING_TIME_SHARE: Record<PlayingTime, number> = {
  starter: 1,
  rotation: 0.45,
  reserve: 0.12,
};

const applyPlayingTime = (minutes: number, playingTime: PlayingTime | undefined): number =>
  playingTime === undefined ? minutes : Math.floor(minutes * PLAYING_TIME_SHARE[playingTime]);

/**
 * Create an analyst report for a player in a given period.
 *
 * Process:
 * 1. Get player's stable profile (bundle, impactSide, marketEdge)
 * 2. Derive observation seed from player.id, season, window
 * 3. Draw minutes and determine sample tier
 * 4. For each metric in the bundle:
 *    a. Draw a noisy observation of OVR + marketEdge + context adjustment
 *    b. Apply the metric-specific stable deviation
 *    c. Convert the final percentile to its displayed value
 */
export const createAnalystReport = (
  player: Player,
  period: ReportPeriod,
  contextTier: AnalystContextTier,
  /** Only for players in our own squad - see PlayingTime. Left out for
   * everyone else, whose role at their own club we can only assume. */
  playingTime?: PlayingTime
): AnalystReport => {
  const profile = selectAnalystProfile(player);

  // Observation seed
  const obsSeed = deriveSeed(player.id, period.season, period.window, "analyst-observation-v2");
  const rng = createRng(obsSeed);

  // Draw minutes and sample tier. The draw comes first and is scaled
  // afterwards, so adding the playing-time argument cannot shift any later
  // draw from this seed - the same player reads identically apart from his
  // minutes and the tier they imply.
  const minutes = applyPlayingTime(drawMinutes(rng, player.wiek, period.window), playingTime);
  const sampleTier = sampleTierFromMinutes(minutes);

  // Quality base: OVR + marketEdge converted to percentile, THEN context tier adjustment (±4pp)
  const domainOvr = clamp(player.ovr + profile.marketEdge, 45, 99);
  const latentPercentile = clamp(Math.round((domainOvr - 56) * 4), 3, 99);
  const contextTierAdjustment = contextTier === "bottom" ? -4 : contextTier === "top" ? 4 : 0;
  const qualityBasePercentile = clamp(latentPercentile + contextTierAdjustment, 3, 99);

  // Generate metrics
  const [metricId1, metricId2] = profile.metrics;

  // Every metric judges quality now. The bundle's shared domain base,
  // shifted by this player's own standing in THIS metric, then observed
  // through noise whose width comes from the sample.
  const observeMetric = (metricId: AnalystMetricId, index: 0 | 1): AnalystMetricResult => {
    const qualityRadius = getQualityRadius(sampleTier, index);
    const metricBase = clamp(qualityBasePercentile + stableMetricDelta(player.id, metricId), 3, 99);
    const percentile = drawNoisyPercentile(rng, metricBase, qualityRadius);
    const value = analystMetricValueFromPercentile(percentile, metricId);
    return { metricId, percentile, value };
  };

  const metrics: [AnalystMetricResult, AnalystMetricResult] = [
    observeMetric(metricId1, 0),
    observeMetric(metricId2, 1),
  ];

  return {
    metrics,
    minutes,
    sampleTier,
    period,
    contextTier,
  };
};
