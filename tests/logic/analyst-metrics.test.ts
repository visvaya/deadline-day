import { describe, expect, it } from "vitest";

import {
  ANALYST_METRICS,
  ANALYST_BUNDLES,
  analystPositionGroup,
} from "../../src/data/analyst-metrics";
import { ANALYST_METRIC_SOURCES } from "../../src/data/analyst-metric-sources";
import type {
  AnalystPositionGroup,
  AnalystMetricId,
  AnalystBundleId,
  AnalystBundleDefinition,
} from "../../src/data/types";

describe("analystPositionGroup", () => {
  it.each([
    // Goalkeepers
    ["BR", "goalkeeper"],
    // Centre backs
    ["ŚO", "centreBack"],
    // Wide defenders
    ["LO", "wideDefender"],
    ["PO", "wideDefender"],
    ["CLS", "wideDefender"],
    ["CPS", "wideDefender"],
    // Central midfielders
    ["ŚPD", "centralMidfielder"],
    ["ŚP", "centralMidfielder"],
    ["POM", "centralMidfielder"],
    // Attacking midfielders
    ["LP", "attackingMidfielder"],
    ["PP", "attackingMidfielder"],
    ["LS", "attackingMidfielder"],
    ["PS", "attackingMidfielder"],
    ["ŚPO", "attackingMidfielder"],
    // Strikers
    ["CN", "striker"],
    ["N", "striker"],
    ["ŚN", "striker"],
  ] as const)("maps %s to %s", (position, expected) => {
    expect(analystPositionGroup(position)).toBe(expected);
  });
});

describe("ANALYST_METRICS", () => {
  it("contains no Defensive Actions Above Expectation metric", () => {
    expect(JSON.stringify(ANALYST_METRICS)).not.toContain("Defensive Actions Above Expectation");
  });

  it.each(["Aggressive Distance", "xGOT Faced", "PSxG Faced", "High Intensity Distance"])(
    "does not use workload or team-context metric %s",
    (forbidden) => {
      expect(JSON.stringify(ANALYST_METRICS)).not.toContain(forbidden);
    }
  );

  it("every metric has unique ID and valid displayScale", () => {
    const ids = new Set<AnalystMetricId>();
    for (const [id, def] of Object.entries(ANALYST_METRICS)) {
      expect(ids.has(id as AnalystMetricId)).toBe(false);
      ids.add(id as AnalystMetricId);

      expect(def).toBeDefined();
      expect(def.label).toBeDefined();
      expect(def.displayScale).toBeDefined();

      const scale = def.displayScale;
      expect(scale.min).toBeLessThan(scale.max);
      expect([0, 1, 2]).toContain(scale.decimals);
      expect(["", "%", "pp", "/90", "m"]).toContain(scale.unit);

      expect("profileHint" in def).toBe(false);
    }
  });

  it("provides a Polish explanation for every displayed metric", () => {
    for (const [metricId, def] of Object.entries(ANALYST_METRICS)) {
      expect(def.helpText.trim().length, `${metricId} help text`).toBeGreaterThan(20);
    }
  });

  it("uses source-aligned labels for the audited metrics", () => {
    expect({
      goalsPreventedPer90: ANALYST_METRICS.goalsPreventedPer90.label,
      positioningErrorAverage: ANALYST_METRICS.positioningErrorAverage.label,
      hops: ANALYST_METRICS.hops.label,
      dangerousOpponentHalfRecoveriesPer90:
        ANALYST_METRICS.dangerousOpponentHalfRecoveriesPer90.label,
      xgotMinusXg: ANALYST_METRICS.xgotMinusXg.label,
      xgPerShot: ANALYST_METRICS.xgPerShot.label,
    }).toEqual({
      goalsPreventedPer90: "Goals Prevented /90",
      positioningErrorAverage: "Positioning Error Average",
      hops: "HOPS Rating (Normalized)",
      dangerousOpponentHalfRecoveriesPer90: "Dangerous Opponent-Half Recoveries",
      xgotMinusXg: "Shooting Goals Added",
      xgPerShot: "NP xG/Shot",
    });
  });

  it("pins provenance and range evidence for every displayed metric", () => {
    expect(Object.keys(ANALYST_METRIC_SOURCES).sort()).toEqual(Object.keys(ANALYST_METRICS).sort());

    for (const [metricId, source] of Object.entries(ANALYST_METRIC_SOURCES)) {
      expect(source.provider, `${metricId} provider`).not.toBe("");
      expect(source.sourceMetric, `${metricId} source metric`).not.toBe("");
      expect(source.definition, `${metricId} definition`).not.toBe("");
      expect(source.normalization, `${metricId} normalization`).not.toBe("");
      expect(source.semantics, `${metricId} semantics`).toBe(
        ANALYST_METRICS[metricId as AnalystMetricId].semantics
      );
      expect(source.qualityRationale, `${metricId} quality rationale`).not.toBe("");
      expect(source.unit, `${metricId} unit`).toBe(
        ANALYST_METRICS[metricId as AnalystMetricId].displayScale.unit
      );
      expect(source.references.length, `${metricId} references`).toBeGreaterThan(0);
      for (const reference of source.references) {
        expect(reference.id, `${metricId} reference ID`).not.toBe("");
        expect(reference.title, `${metricId} reference title`).not.toBe("");
        const hasUrl = "url" in reference && Boolean(reference.url);
        const hasDocKey = "docKey" in reference && Boolean(reference.docKey);
        expect(hasUrl !== hasDocKey, `${metricId} reference target`).toBe(true);
        expect(reference.accessedOn, `${metricId} access date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      expect(source.range.status, `${metricId} range status`).toMatch(
        /^(confirmed|plausible|definition-bounded|unverified)$/
      );
      expect(source.range.rationale, `${metricId} range rationale`).not.toBe("");
    }
  });

  it("pins the local xPass derivative and the recovery event population", () => {
    expect(ANALYST_METRIC_SOURCES.passCompletionAboveExpected).toMatchObject({
      provider: "StatsBomb plus local derivative",
      sourceMetric: "100 × (sum(completed) - sum(xPass)) / eligible passes",
      denominator: "passes for which StatsBomb xPass is available",
      unit: "pp",
    });
    expect(ANALYST_METRIC_SOURCES.dangerousOpponentHalfRecoveriesPer90).toMatchObject({
      sourceMetric: "average.dangerousOpponentHalfRecoveries",
      denominator: "minutes played",
      unit: "/90",
    });
    expect(ANALYST_METRIC_SOURCES.dangerousOpponentHalfRecoveriesPer90.definition).toContain(
      "shot within 20 seconds"
    );
  });

  it("keeps percentage display scales inside their natural bounds", () => {
    for (const [metricId, metric] of Object.entries(ANALYST_METRICS)) {
      if (metric.displayScale.unit !== "%") continue;

      const naturalMin = metric.displayScale.signed ? -100 : 0;
      expect(metric.displayScale.min, `${metricId} minimum`).toBeGreaterThanOrEqual(naturalMin);
      expect(metric.displayScale.max, `${metricId} maximum`).toBeLessThanOrEqual(100);
    }
  });
});

describe("ANALYST_BUNDLES", () => {
  it("every position group has exactly three bundles", () => {
    const groups: AnalystPositionGroup[] = [
      "goalkeeper",
      "centreBack",
      "wideDefender",
      "centralMidfielder",
      "attackingMidfielder",
      "striker",
    ];

    for (const group of groups) {
      const bundles = ANALYST_BUNDLES[group];
      expect(bundles).toBeDefined();
      expect(bundles).toHaveLength(3);
    }
  });

  it("every bundle has unique ID, exactly two metrics, and one impact side", () => {
    const allBundles: AnalystBundleDefinition[] = [];
    for (const bundleGroup of Object.values(ANALYST_BUNDLES)) {
      allBundles.push(...bundleGroup);
    }

    const ids = new Set<AnalystBundleId>();
    for (const bundle of allBundles) {
      expect(ids.has(bundle.id)).toBe(false);
      ids.add(bundle.id);

      expect(bundle.metrics).toHaveLength(2);
      expect(["attack", "defence"]).toContain(bundle.impactSide);

      for (const metricId of bundle.metrics) {
        expect(ANALYST_METRICS[metricId]).toBeDefined();
      }
    }
  });

  it("each position group in ANALYST_BUNDLES matches impact sides from spec", () => {
    const expectedSides: Record<AnalystPositionGroup, [ImpactSide, ImpactSide, ImpactSide]> = {
      goalkeeper: ["defence", "attack", "defence"],
      centreBack: ["defence", "attack", "defence"],
      wideDefender: ["defence", "attack", "attack"],
      centralMidfielder: ["attack", "attack", "defence"],
      attackingMidfielder: ["attack", "attack", "attack"],
      striker: ["attack", "attack", "attack"],
    };

    type ImpactSide = "attack" | "defence";

    for (const [group, expectedSidesList] of Object.entries(expectedSides)) {
      const bundles = ANALYST_BUNDLES[group as AnalystPositionGroup];
      expect(bundles).toHaveLength(3);

      for (let i = 0; i < 3; i++) {
        expect(bundles[i]!.impactSide).toBe(expectedSidesList[i]);
      }
    }
  });

  it("all bundle metrics reference defined metrics in ANALYST_METRICS", () => {
    for (const bundleGroup of Object.values(ANALYST_BUNDLES)) {
      for (const bundle of bundleGroup) {
        for (const metricId of bundle.metrics) {
          expect(ANALYST_METRICS[metricId], `Metric ${metricId} not found`).toBeDefined();
        }
      }
    }
  });
});

describe("Metric definitions", () => {
  it("every metric definition has one valid semantics value", () => {
    for (const def of Object.values(ANALYST_METRICS)) {
      expect(["qualityHigherRaw", "qualityLowerRaw"]).toContain(def.semantics);
    }
  });

  it("every metric judges quality, so every line can inform a decision", () => {
    // The old `profile` semantics (CCAA, Carry Directness) described HOW a
    // player plays, with no better or worse direction. In a game with no
    // tactics, roles or style fit that could not tell anyone whether a
    // transfer improves the squad - it spent one of only two lines saying
    // nothing decision-relevant. Style now comes from which bundle is drawn.
    for (const def of Object.values(ANALYST_METRICS)) {
      expect(def.semantics).toMatch(/^quality(Higher|Lower)Raw$/);
    }
  });

  it("display scales match the audited presentation contract", () => {
    const expectedScales: Record<
      AnalystMetricId,
      { min: number; max: number; decimals: 0 | 1 | 2; unit: string; signed?: boolean }
    > = {
      goalsPreventedPer90: { min: -0.35, max: 0.35, decimals: 2, unit: "/90", signed: true },
      positioningErrorAverage: { min: 1.14, max: 2.97, decimals: 2, unit: "m" },
      passCompletionAboveExpected: { min: -8, max: 8, decimals: 1, unit: "pp", signed: true },
      longBallCompletionPct: { min: 25, max: 75, decimals: 0, unit: "%" },
      crossClaimSuccessPct: { min: 78, max: 97, decimals: 0, unit: "%" },
      successfulGkExitsPct: { min: 45, max: 95, decimals: 0, unit: "%" },
      stopReducePossessionDangerPct: { min: 15, max: 65, decimals: 0, unit: "%" },
      defensiveDuelsWonPct: { min: 45, max: 80, decimals: 0, unit: "%" },
      lineBreakingPassCompletionPct: { min: 45, max: 92, decimals: 0, unit: "%" },
      hops: { min: 0, max: 1, decimals: 2, unit: "" },
      aerialWinPct: { min: 35, max: 80, decimals: 0, unit: "%" },
      successfulDribblesPct: { min: 35, max: 74, decimals: 0, unit: "%" },
      xaPerKeyPass: { min: 0.04, max: 0.23, decimals: 2, unit: "" },
      ballRetentionRatioUnderHighPressure: { min: 60, max: 95, decimals: 0, unit: "%" },
      progressiveActionUnderIntensePressure: { min: 20, max: 70, decimals: 0, unit: "%" },
      dangerousOpponentHalfRecoveriesPer90: {
        min: 0,
        max: 1,
        decimals: 2,
        unit: "/90",
      },
      dribbleCarryObv: { min: -0.05, max: 0.25, decimals: 2, unit: "/90", signed: true },
      xgotMinusXg: { min: -0.1, max: 0.2, decimals: 2, unit: "/90", signed: true },
      xgPerShot: { min: 0.06, max: 0.24, decimals: 2, unit: "" },
      successfulLinkupPlaysPct: { min: 35, max: 80, decimals: 0, unit: "%" },
      passCompletionRatioUnderHighPressure: { min: 65, max: 95, decimals: 0, unit: "%" },
    };

    for (const [id, expected] of Object.entries(expectedScales)) {
      const metric = ANALYST_METRICS[id as AnalystMetricId];
      expect(metric).toBeDefined();

      const scale = metric.displayScale;
      expect(scale.min, `${id} min`).toBe(expected.min);
      expect(scale.max, `${id} max`).toBe(expected.max);
      expect(scale.decimals, `${id} decimals`).toBe(expected.decimals);
      expect(scale.unit, `${id} unit`).toBe(expected.unit);
      if (expected.signed) {
        expect(scale.signed, `${id} signed`).toBe(true);
      } else {
        expect(scale.signed, `${id} signed`).not.toBe(true);
      }
    }
  });
});
