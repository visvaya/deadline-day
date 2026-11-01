import type { AnalystMetricDefinition, AnalystMetricId, MetricDisplayScale } from "./types";

type AnalystMetricRangeStatus = "confirmed" | "plausible" | "definition-bounded" | "unverified";

type AnalystMetricSourceReference = {
  id: string;
  title: string;
  url?: string;
  docKey?: string;
  accessedOn: string;
};

type AnalystMetricSource = {
  provider: string;
  sourceMetric: string;
  definition: string;
  semantics: AnalystMetricDefinition["semantics"];
  qualityRationale: string;
  numerator: string | null;
  denominator: string | null;
  normalization: string;
  unit: MetricDisplayScale["unit"];
  references: readonly AnalystMetricSourceReference[];
  range: {
    status: AnalystMetricRangeStatus;
    rationale: string;
  };
};

const REFERENCES = {
  statsBombIq: {
    id: "SB-IQ",
    title: "StatsBomb IQ metrics glossary",
    docKey: "statsbomb/iq-metrics-glossary",
    accessedOn: "2026-09-02",
  },
  statsBombSeason: {
    id: "SB-PS",
    title: "StatsBomb player season statistics",
    docKey: "statsbomb/player-season-stats",
    accessedOn: "2026-09-02",
  },
  statsBombCoordinates: {
    id: "SB-COORD",
    title: "StatsBomb coordinate system",
    docKey: "statsbomb/coordinate-system",
    accessedOn: "2026-09-03",
  },
  statsBombGoalkeepers: {
    id: "SB-GK-2019",
    title: "The Two Gianluigis",
    url: "https://statsbomb.com/articles/soccer/the-two-gianluigis-will-donnarumma-dominate-in-goal-for-the-next-20-years-like-buffon-did-for-the-last-20/",
    accessedOn: "2026-09-03",
  },
  statsBombPositioningAverage: {
    id: "SB-GK-2025",
    title: "Europe Women's Goalkeepers 2024-25",
    url: "https://www.hudl.com/blog/europe-women-goalkeepers-2024-25-statsbomb",
    accessedOn: "2026-09-03",
  },
  statsBombRadar: {
    id: "SB-RADAR",
    title: "New Hudl Statsbomb Radars: 2023 Update",
    url: "https://www.hudl.com/blog/new-statsbomb-radars-2023-update",
    accessedOn: "2026-09-02",
  },
  statsBombHops: {
    id: "SB-HOPS",
    title: "Hudl Statsbomb Launches New HOPS Metrics and Set Piece Model",
    url: "https://www.hudl.com/blog/statsbomb-hops-set-pieces-upgrades",
    accessedOn: "2026-09-02",
  },
  statsBombXpass: {
    id: "SB-XPASS",
    title: "Hudl Statsbomb Release New Models: Expected Pass and Pass Clustering",
    url: "https://www.hudl.com/blog/statsbomb-models-expected-pass-xpass-and-pass-clustering",
    accessedOn: "2026-09-02",
  },
  statsBombLbp: {
    id: "SB-LBP",
    title: "Hudl Statsbomb Launch New 360 Metrics: Line-Breaking Passes",
    url: "https://www.hudl.com/blog/hudl-statsbomb-launch-new-360-metrics-line-breaking-passes-and-ball-receipts-in-space",
    accessedOn: "2026-09-02",
  },
  optaXgot: {
    id: "OPTA-XGOT",
    title: "What Are Expected Goals on Target (xGOT)?",
    url: "https://theanalyst.com/articles/what-are-expected-goals-on-target-xgot",
    accessedOn: "2026-09-02",
  },
  wyscoutAdvanced: {
    id: "WY-API",
    title: "Players WyID AdvancedStats",
    url: "https://support.wyscout.com/players-wyid-advancedstats",
    accessedOn: "2026-09-02",
  },
  wyscoutGlossary: {
    id: "WY-GLOSSARY",
    title: "Wyscout Data Glossary: player metrics",
    url: "https://dataglossary.wyscout.com/player_metrics/",
    accessedOn: "2026-09-02",
  },
  skillCornerPressure: {
    id: "SC-PRESSURE",
    title: "SCOUTED: How to scout South America like Brighton",
    url: "https://skillcorner.com/articles/scouting-south-america",
    accessedOn: "2026-09-02",
  },
  skillCornerProgressive: {
    id: "SC-PROGRESSIVE",
    title: "Metric Explainer: Progressive Actions Under Intense Pressure",
    url: "https://www.skillcorner.com/es/articles/metric-explainer-progressive-actions-under-intense-pressure",
    accessedOn: "2026-09-02",
  },
  skillCornerDefence: {
    id: "SC-DEFENCE",
    title: "Smarter Scouting: Profiling Players Beyond the Position Group: Centre-Backs",
    url: "https://skillcorner.com/us/articles/smarter-scouting---profiling-players-beyond-the-position-group-centre-backs",
    accessedOn: "2026-09-02",
  },
} as const satisfies Record<string, AnalystMetricSourceReference>;

/**
 * Provenance for every player-facing analyst metric.
 *
 * The game does not reproduce licensed provider observations. It maps its own
 * quality percentile onto the catalog's display scale. This manifest pins what
 * that presentation is allowed to mean and how strong the evidence for the
 * chosen synthetic range is.
 */
export const ANALYST_METRIC_SOURCES = {
  goalsPreventedPer90: {
    provider: "StatsBomb",
    sourceMetric: "player_season_gsaa_90 / Goals Prevented /90",
    definition:
      "Non-penalty post-shot expected goals faced minus non-penalty goals conceded, normalized per 90 minutes.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Preventing more goals than the post-shot model expects is better.",
    numerator: "non-penalty PSxG faced minus non-penalty goals conceded",
    denominator: "minutes played",
    normalization: "Goals prevented above expectation per 90 minutes.",
    unit: "/90",
    references: [
      REFERENCES.statsBombIq,
      REFERENCES.statsBombSeason,
      REFERENCES.statsBombGoalkeepers,
    ],
    range: {
      status: "plausible",
      rationale:
        "The -0.35 to +0.35 per-90 range is synthetic but brackets StatsBomb's published +0.30 and +0.32 GSAA/90 examples; no league distribution is claimed.",
    },
  },
  positioningErrorAverage: {
    provider: "StatsBomb",
    sourceMetric: "player_season_np_optimal_gk_dlength / Positioning Error Average",
    definition:
      "Average distance between the goalkeeper's position and the modelled optimal position when facing qualifying non-penalty shots.",
    semantics: "qualityLowerRaw",
    qualityRationale: "A smaller distance from the modelled optimal position means less error.",
    numerator: "sum of distances from the modelled optimal goalkeeper position",
    denominator: "qualifying non-penalty shots faced",
    normalization:
      "Average distance in the StatsBomb 120 by 80 yard coordinate system, converted for display at 1 yard = 0.9144 metres.",
    unit: "m",
    references: [
      REFERENCES.statsBombIq,
      REFERENCES.statsBombSeason,
      REFERENCES.statsBombCoordinates,
      REFERENCES.statsBombGoalkeepers,
      REFERENCES.statsBombPositioningAverage,
    ],
    range: {
      status: "plausible",
      rationale:
        "The 1.14 to 2.97 metre range is the player-facing conversion of the synthetic 1.25 to 3.25 yard range. The source-native yard unit is inferred from StatsBomb's coordinate system, and the source range includes the published elite example of 1.53; no league distribution is claimed.",
    },
  },
  passCompletionAboveExpected: {
    provider: "StatsBomb plus local derivative",
    sourceMetric: "100 × (sum(completed) - sum(xPass)) / eligible passes",
    definition:
      "The actual completion percentage minus the xPass-model expected completion percentage over passes for which xPass is available.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Completing more passes than the model expects is better.",
    numerator: "sum of completed-pass indicators minus the sum of xPass probabilities",
    denominator: "passes for which StatsBomb xPass is available",
    normalization: "Difference of two completion percentages, expressed in percentage points.",
    unit: "pp",
    references: [REFERENCES.statsBombXpass],
    range: {
      status: "unverified",
      rationale:
        "The -8 to +8 pp range is synthetic, symmetric around expectation and inside the natural -100 to +100 pp bounds.",
    },
  },
  longBallCompletionPct: {
    provider: "StatsBomb",
    sourceMetric: "player_season_long_ball_ratio",
    definition: "The share of attempted long balls that are completed.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Completing a larger share of attempted long balls is better.",
    numerator: "completed long balls",
    denominator: "attempted long balls",
    normalization: "Percentage over the reporting period.",
    unit: "%",
    references: [REFERENCES.statsBombSeason, REFERENCES.statsBombRadar],
    range: {
      status: "unverified",
      rationale:
        "The 25 to 75% range is synthetic and remains within the natural 0 to 100% bounds.",
    },
  },
  crossClaimSuccessPct: {
    provider: "StatsBomb",
    sourceMetric: "player_match_claim_success",
    definition: "The share of goalkeeper claim attempts that succeed.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Succeeding on a larger share of attempted claims is better.",
    numerator: "successful claim attempts",
    denominator: "all claim attempts",
    normalization: "Percentage over the reporting period.",
    unit: "%",
    references: [REFERENCES.statsBombIq, REFERENCES.statsBombRadar],
    range: {
      status: "unverified",
      rationale:
        "The 78 to 97% range is synthetic and remains within the natural 0 to 100% bounds.",
    },
  },
  successfulGkExitsPct: {
    provider: "Wyscout",
    sourceMetric: "percent.gkSuccessfulExits",
    definition: "The share of goalkeeper exits recorded as successful.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Succeeding on a larger share of goalkeeper exits is better.",
    numerator: "successful goalkeeper exits",
    denominator: "all goalkeeper exits",
    normalization: "Percentage over the reporting period.",
    unit: "%",
    references: [REFERENCES.wyscoutAdvanced, REFERENCES.wyscoutGlossary],
    range: {
      status: "unverified",
      rationale:
        "The 45 to 95% range is synthetic and remains within the natural 0 to 100% bounds.",
    },
  },
  stopReducePossessionDangerPct: {
    provider: "SkillCorner",
    sourceMetric: "Stop or Reduce Possession Danger %",
    definition:
      "The share of on-ball engagements that stop or reduce the opponent possession's danger.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Neutralizing danger in a larger share of engagements is better.",
    numerator: "on-ball engagements that stop or reduce possession danger",
    denominator: "all qualifying on-ball engagements",
    normalization: "Percentage over the reporting period.",
    unit: "%",
    references: [REFERENCES.skillCornerDefence],
    range: {
      status: "unverified",
      rationale:
        "The 15 to 65% range is synthetic and remains within the natural 0 to 100% bounds.",
    },
  },
  defensiveDuelsWonPct: {
    provider: "Wyscout",
    sourceMetric: "percent.defensiveDuelsWon",
    definition: "The share of defensive duels won by the player.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Winning a larger share of defensive duels is better.",
    numerator: "defensive duels won",
    denominator: "defensive duels attempted",
    normalization: "Percentage over the reporting period.",
    unit: "%",
    references: [REFERENCES.wyscoutAdvanced, REFERENCES.wyscoutGlossary],
    range: {
      status: "unverified",
      rationale:
        "The 45 to 80% range is synthetic and remains within the natural 0 to 100% bounds.",
    },
  },
  lineBreakingPassCompletionPct: {
    provider: "StatsBomb plus local derivative",
    sourceMetric: "player_match_lbp_completed / player_match_lbp",
    definition: "The share of attempted open-play line-breaking passes that are completed.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Completing a larger share of attempted line-breaking passes is better.",
    numerator: "completed open-play line-breaking passes",
    denominator: "attempted open-play line-breaking passes",
    normalization: "Percentage over the reporting period.",
    unit: "%",
    references: [REFERENCES.statsBombIq, REFERENCES.statsBombLbp],
    range: {
      status: "unverified",
      rationale:
        "The 45 to 92% range is synthetic and remains within the natural 0 to 100% bounds.",
    },
  },
  hops: {
    provider: "StatsBomb",
    sourceMetric: "HOPS Rating (Normalized)",
    definition: "A normalized model rating of aerial ability that accounts for duel context.",
    semantics: "qualityHigherRaw",
    qualityRationale: "A higher provider-defined HOPS rating represents stronger aerial ability.",
    numerator: null,
    denominator: null,
    normalization: "Provider-defined normalized rating on a 0 to 1 scale.",
    unit: "",
    references: [REFERENCES.statsBombHops],
    range: {
      status: "confirmed",
      rationale: "Hudl Statsbomb explicitly defines the normalized HOPS rating on a 0 to 1 scale.",
    },
  },
  aerialWinPct: {
    provider: "StatsBomb",
    sourceMetric: "player_season_aerial_ratio / Aerial Win %",
    definition: "The share of aerial duels won by the player.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Winning a larger share of aerial duels is better.",
    numerator: "aerial duels won",
    denominator: "aerial duels attempted",
    normalization: "Percentage over the reporting period.",
    unit: "%",
    references: [REFERENCES.statsBombSeason, REFERENCES.statsBombRadar],
    range: {
      status: "unverified",
      rationale:
        "The 35 to 80% range is synthetic and remains within the natural 0 to 100% bounds.",
    },
  },
  successfulDribblesPct: {
    provider: "StatsBomb",
    sourceMetric: "player_season_dribble_ratio",
    definition: "The share of attempted dribbles completed successfully.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Completing a larger share of attempted dribbles is better.",
    numerator: "successful dribbles",
    denominator: "attempted dribbles",
    normalization: "Percentage over the reporting period.",
    unit: "%",
    references: [REFERENCES.statsBombSeason],
    range: {
      status: "unverified",
      rationale:
        "The 35 to 74% range is synthetic and remains within the natural 0 to 100% bounds.",
    },
  },
  xaPerKeyPass: {
    provider: "Wyscout plus local derivative",
    sourceMetric: "total.xgAssist / total.keyPasses",
    definition: "Average expected-assist value of a key pass.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Creating higher-quality shots per key pass is better.",
    numerator: "sum of xA attached to key passes",
    denominator: "all key passes in the reporting period, including set pieces",
    normalization: "Expected goals per key pass.",
    unit: "",
    references: [REFERENCES.wyscoutAdvanced],
    range: {
      status: "unverified",
      rationale:
        "The 0.04 to 0.23 range is synthetic and respects the non-negative xA-per-event scale.",
    },
  },
  ballRetentionRatioUnderHighPressure: {
    provider: "SkillCorner",
    sourceMetric: "Ball Retention Ratio Under High Pressure",
    definition: "The share of player possessions retained while under high pressure.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Retaining possession more often under high pressure is better.",
    numerator: "player possessions retained under high pressure",
    denominator: "all qualifying player possessions under high pressure",
    normalization: "Percentage over the reporting period.",
    unit: "%",
    references: [REFERENCES.skillCornerPressure],
    range: {
      status: "plausible",
      rationale:
        "The 60 to 95% synthetic range brackets SkillCorner's published percentage examples while staying inside the natural bounds.",
    },
  },
  progressiveActionUnderIntensePressure: {
    provider: "SkillCorner plus local derivative",
    sourceMetric: "Progressive Actions Under Intense Pressure share",
    definition:
      "The share of qualifying pressured receptions followed by a pass or carry progressing at least eight metres.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Turning more pressured receptions into progressive actions is better.",
    numerator:
      "qualifying receptions followed by a progressive pass or carry of at least eight metres",
    denominator: "qualifying receptions under high or very high pressure",
    normalization: "Percentage over the reporting period.",
    unit: "%",
    references: [REFERENCES.skillCornerProgressive],
    range: {
      status: "unverified",
      rationale:
        "The 20 to 70% range is synthetic and remains within the natural 0 to 100% bounds.",
    },
  },
  dangerousOpponentHalfRecoveriesPer90: {
    provider: "Wyscout",
    sourceMetric: "average.dangerousOpponentHalfRecoveries",
    definition:
      "Opponent-half ball recoveries that lead to a shot within 20 seconds, normalized per 90 minutes.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Producing more recoveries that quickly lead to a shot is better.",
    numerator: "qualifying opponent-half recoveries",
    denominator: "minutes played",
    normalization: "Events per 90 minutes.",
    unit: "/90",
    references: [REFERENCES.wyscoutAdvanced],
    range: {
      status: "unverified",
      rationale:
        "The 0 to 1 per-90 range is a conservative synthetic presentation for a rare compound event; no empirical league distribution is claimed.",
    },
  },
  dribbleCarryObv: {
    provider: "StatsBomb",
    sourceMetric: "player_season_obv_dribble_carry_90",
    definition: "On-Ball Value added by dribbles and carries per 90 minutes.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Adding more on-ball value through dribbles and carries is better.",
    numerator: "sum of OBV from dribbles and carries",
    denominator: "minutes played",
    normalization: "On-Ball Value per 90 minutes.",
    unit: "/90",
    references: [REFERENCES.statsBombIq, REFERENCES.statsBombSeason],
    range: {
      status: "unverified",
      rationale:
        "The -0.05 to +0.25 per-90 range is synthetic, allows negative value and matches the source field's order of magnitude without claiming a league distribution.",
    },
  },
  xgotMinusXg: {
    provider: "Opta",
    sourceMetric: "Shooting Goals Added = xGOT - xG",
    definition:
      "Post-shot expected goals minus pre-shot expected goals generated by the player's shots.",
    semantics: "qualityHigherRaw",
    qualityRationale:
      "Adding more post-shot goal probability than the chances initially carried is better.",
    numerator: "sum of xGOT minus sum of xG",
    denominator: "minutes played",
    normalization: "Shooting Goals Added per 90 minutes.",
    unit: "/90",
    references: [REFERENCES.optaXgot],
    range: {
      status: "unverified",
      rationale:
        "The -0.10 to +0.20 per-90 range is synthetic but is explicitly normalized and consistent with published per-90 examples.",
    },
  },
  xgPerShot: {
    provider: "StatsBomb",
    sourceMetric: "player_season_np_xg_per_shot",
    definition: "Average expected-goal value of non-penalty shots.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Selecting or reaching higher-quality non-penalty shots is better.",
    numerator: "sum of non-penalty xG",
    denominator: "non-penalty shots",
    normalization: "Expected goals per non-penalty shot.",
    unit: "",
    references: [REFERENCES.statsBombSeason],
    range: {
      status: "unverified",
      rationale:
        "The 0.06 to 0.24 range is synthetic, non-negative and plausible for expected-goal probability per shot.",
    },
  },
  successfulLinkupPlaysPct: {
    provider: "Wyscout",
    sourceMetric: "percent.successfulLinkupPlays",
    definition: "The share of link-up plays recorded as successful.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Succeeding on a larger share of link-up plays is better.",
    numerator: "successful link-up plays",
    denominator: "all link-up plays",
    normalization: "Percentage over the reporting period.",
    unit: "%",
    references: [REFERENCES.wyscoutAdvanced],
    range: {
      status: "unverified",
      rationale:
        "The 35 to 80% range is synthetic and remains within the natural 0 to 100% bounds.",
    },
  },
  passCompletionRatioUnderHighPressure: {
    provider: "SkillCorner",
    sourceMetric: "Pass Completion Ratio Under High Pressure",
    definition: "The share of passes completed while the player is under high pressure.",
    semantics: "qualityHigherRaw",
    qualityRationale: "Completing a larger share of passes under high pressure is better.",
    numerator: "completed passes under high pressure",
    denominator: "attempted passes under high pressure",
    normalization: "Percentage over the reporting period.",
    unit: "%",
    references: [REFERENCES.skillCornerPressure],
    range: {
      status: "plausible",
      rationale:
        "The 65 to 95% synthetic range brackets SkillCorner's published percentage examples while staying inside the natural bounds.",
    },
  },
} as const satisfies Record<AnalystMetricId, AnalystMetricSource>;
