/**
 * Analyst report metric catalog and bundle definitions.
 *
 * Defines the complete metric definitions, bundles per position group, and the
 * position-to-group mapping. Display scales follow the audited source contract
 * in docs/decisions/analyst-metrics-audit.md; bundles tie two metrics and an
 * impact side (attack/defence) to a unique bundle ID. Every metric judges quality;
 * bundle choice carries style.
 */

import type {
  AnalystMetricId,
  AnalystMetricDefinition,
  AnalystBundleDefinition,
  AnalystPositionGroup,
  PositionCode,
} from "./types";

/**
 * Complete catalog of analyst metrics with display scales and semantics.
 * Each metric defines how a percentile is converted to a displayed value via displayScale.
 *
 * Display scales use source-compatible units and documented synthetic ranges.
 * - Quality metrics read higher-is-better (qualityHigherRaw) or lower-is-better (qualityLowerRaw).
 * - Metrics without a good direction (the former CCAA and Carry Directness) are excluded.
 * - Signed metrics include a +/- indicator.
 */
export const ANALYST_METRICS: Record<AnalystMetricId, AnalystMetricDefinition> = {
  goalsPreventedPer90: {
    label: "Goals Prevented /90",
    helpText:
      "Liczba goli zapobieżonych ponad oczekiwanie na 90 minut, na podstawie jakości strzałów celnych. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: -0.35, max: 0.35, decimals: 2, unit: "/90", signed: true },
  },
  positioningErrorAverage: {
    label: "Positioning Error Average",
    helpText:
      "Średnia odległość bramkarza od modelowanej pozycji optymalnej przy strzałach bez karnych. Wynik w metrach; mniej = lepiej.",
    semantics: "qualityLowerRaw",
    displayScale: { min: 1.14, max: 2.97, decimals: 2, unit: "m" },
  },
  passCompletionAboveExpected: {
    label: "Pass Completion Above Expected",
    helpText:
      "Różnica między rzeczywistą a oczekiwaną skutecznością podań dla prób ocenionych przez model xPass. Wynik w punktach procentowych; wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: -8, max: 8, decimals: 1, unit: "pp", signed: true },
  },
  longBallCompletionPct: {
    label: "Long Ball Completion %",
    helpText: "Udział celnych długich podań wśród wszystkich prób. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 25, max: 75, decimals: 0, unit: "%" },
  },
  crossClaimSuccessPct: {
    label: "Cross Claim Success %",
    helpText:
      "Udział udanych przejęć wśród prób wyjścia bramkarza do dośrodkowania. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 78, max: 97, decimals: 0, unit: "%" },
  },
  successfulGkExitsPct: {
    label: "Successful GK Exits %",
    helpText: "Udział udanych wyjść bramkarza wśród wszystkich jego wyjść. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 45, max: 95, decimals: 0, unit: "%" },
  },
  stopReducePossessionDangerPct: {
    label: "Stop or Reduce Possession Danger %",
    helpText:
      "Udział interwencji przy piłce, które zatrzymały lub zmniejszyły zagrożenie posiadania rywala. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 15, max: 65, decimals: 0, unit: "%" },
  },
  defensiveDuelsWonPct: {
    label: "Defensive Duels Won %",
    helpText: "Udział wygranych pojedynków defensywnych. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 45, max: 80, decimals: 0, unit: "%" },
  },
  lineBreakingPassCompletionPct: {
    label: "Line-Breaking Pass Completion %",
    helpText: "Udział celnych podań łamiących linię w otwartej grze. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 45, max: 92, decimals: 0, unit: "%" },
  },
  hops: {
    label: "HOPS Rating (Normalized)",
    helpText:
      "Kontekstowa ocena gry w powietrzu, uwzględniająca trudność pojedynków. Skala 0–1; wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 0, max: 1, decimals: 2, unit: "" },
  },
  aerialWinPct: {
    label: "Aerial Win %",
    helpText: "Udział wygranych pojedynków powietrznych. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 35, max: 80, decimals: 0, unit: "%" },
  },
  successfulDribblesPct: {
    label: "Successful Dribbles %",
    helpText: "Udział udanych dryblingów wśród wszystkich prób. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 35, max: 74, decimals: 0, unit: "%" },
  },
  xaPerKeyPass: {
    label: "xA per Key Pass",
    helpText: "Średnia wartość xA przypadająca na jedno kluczowe podanie. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 0.04, max: 0.23, decimals: 2, unit: "" },
  },
  ballRetentionRatioUnderHighPressure: {
    label: "Ball Retention Ratio Under High Pressure",
    helpText: "Udział posiadań utrzymanych przez zawodnika pod wysoką presją. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 60, max: 95, decimals: 0, unit: "%" },
  },
  progressiveActionUnderIntensePressure: {
    label: "Progressive Action Under Intense Pressure",
    helpText:
      "Udział przyjęć pod intensywną presją zakończonych podaniem lub prowadzeniem przesuwającym piłkę o co najmniej 8 m. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 20, max: 70, decimals: 0, unit: "%" },
  },
  dangerousOpponentHalfRecoveriesPer90: {
    label: "Dangerous Opponent-Half Recoveries",
    helpText:
      "Odzyskania piłki na połowie rywala, po których zespół oddał strzał w ciągu 20 sekund, na 90 minut. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 0, max: 1, decimals: 2, unit: "/90" },
  },
  dribbleCarryObv: {
    label: "Dribble & Carry OBV",
    helpText:
      "Wartość dla sytuacji bramkowej dodana przez dryblingi i prowadzenia piłki, na 90 minut. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: -0.05, max: 0.25, decimals: 2, unit: "/90", signed: true },
  },
  xgotMinusXg: {
    label: "Shooting Goals Added",
    helpText:
      "Różnica między jakością strzałów po uderzeniu (xGOT) a ich wartością przed uderzeniem (xG), na 90 minut. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: -0.1, max: 0.2, decimals: 2, unit: "/90", signed: true },
  },
  xgPerShot: {
    label: "NP xG/Shot",
    helpText: "Średnia wartość xG jednego strzału bez rzutów karnych. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 0.06, max: 0.24, decimals: 2, unit: "" },
  },
  successfulLinkupPlaysPct: {
    label: "Successful Link-Up Plays %",
    helpText: "Udział udanych zagrań łącznikowych wśród wszystkich prób. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 35, max: 80, decimals: 0, unit: "%" },
  },
  passCompletionRatioUnderHighPressure: {
    label: "Pass Completion Ratio Under High Pressure",
    helpText: "Udział celnych podań wykonanych pod wysoką presją. Wyżej = lepiej.",
    semantics: "qualityHigherRaw",
    displayScale: { min: 65, max: 95, decimals: 0, unit: "%" },
  },
};

/**
 * Bundle definitions: three per position group, each with two metrics and an impact side.
 * Impact sides from Product Contract lines 196-203.
 *
 * Position group mapping:
 * - BR -> goalkeeper
 * - ŚO -> centreBack
 * - LO/PO/CLS/CPS -> wideDefender
 * - ŚPD/ŚP/POM -> centralMidfielder
 * - LP/PP/LS/PS/ŚPO -> attackingMidfielder
 * - CN/N/ŚN -> striker
 */
export const ANALYST_BUNDLES: Record<
  AnalystPositionGroup,
  readonly [AnalystBundleDefinition, AnalystBundleDefinition, AnalystBundleDefinition]
> = {
  goalkeeper: [
    {
      id: "gkShotStopping",
      metrics: ["goalsPreventedPer90", "positioningErrorAverage"] as const,
      impactSide: "defence",
    },
    {
      id: "gkDistribution",
      metrics: ["passCompletionAboveExpected", "longBallCompletionPct"] as const,
      impactSide: "attack",
    },
    {
      id: "gkAreaCommand",
      metrics: ["crossClaimSuccessPct", "successfulGkExitsPct"] as const,
      impactSide: "defence",
    },
  ],
  centreBack: [
    {
      id: "centreBackDefending",
      metrics: ["stopReducePossessionDangerPct", "defensiveDuelsWonPct"] as const,
      impactSide: "defence",
    },
    {
      id: "centreBackProgression",
      metrics: ["lineBreakingPassCompletionPct", "passCompletionAboveExpected"] as const,
      impactSide: "attack",
    },
    {
      id: "centreBackAerial",
      metrics: ["hops", "aerialWinPct"] as const,
      impactSide: "defence",
    },
  ],
  wideDefender: [
    {
      id: "wideDefenderDefending",
      metrics: ["stopReducePossessionDangerPct", "defensiveDuelsWonPct"] as const,
      impactSide: "defence",
    },
    {
      id: "wideDefenderCarrying",
      metrics: ["dribbleCarryObv", "successfulDribblesPct"] as const,
      impactSide: "attack",
    },
    {
      id: "wideDefenderCreating",
      metrics: ["xaPerKeyPass", "lineBreakingPassCompletionPct"] as const,
      impactSide: "attack",
    },
  ],
  centralMidfielder: [
    {
      id: "centralMidfielderPassing",
      metrics: ["lineBreakingPassCompletionPct", "passCompletionAboveExpected"] as const,
      impactSide: "attack",
    },
    {
      id: "centralMidfielderPressureResistance",
      metrics: [
        "ballRetentionRatioUnderHighPressure",
        "progressiveActionUnderIntensePressure",
      ] as const,
      impactSide: "attack",
    },
    {
      id: "centralMidfielderRecovering",
      metrics: ["dangerousOpponentHalfRecoveriesPer90", "stopReducePossessionDangerPct"] as const,
      impactSide: "defence",
    },
  ],
  attackingMidfielder: [
    {
      id: "attackingMidfielderCreating",
      metrics: ["xaPerKeyPass", "lineBreakingPassCompletionPct"] as const,
      impactSide: "attack",
    },
    {
      id: "attackingMidfielderCarrying",
      metrics: ["dribbleCarryObv", "successfulDribblesPct"] as const,
      impactSide: "attack",
    },
    {
      id: "attackingMidfielderFinishing",
      metrics: ["xgotMinusXg", "xgPerShot"] as const,
      impactSide: "attack",
    },
  ],
  striker: [
    {
      id: "strikerFinishing",
      metrics: ["xgotMinusXg", "xgPerShot"] as const,
      impactSide: "attack",
    },
    {
      id: "strikerLinkup",
      metrics: ["successfulLinkupPlaysPct", "passCompletionRatioUnderHighPressure"] as const,
      impactSide: "attack",
    },
    {
      id: "strikerAerial",
      metrics: ["hops", "aerialWinPct"] as const,
      impactSide: "attack",
    },
  ],
};

/**
 * Map a position code to its analyst position group.
 *
 * This is a separate taxonomy from the four-group `PositionGroup` system used elsewhere;
 * the analyst report needs six groups for finer segmentation of profiles.
 * Notably, LS/PS belong here to the attacking-midfielder group despite being different
 * in the position-weighting system.
 */
export function analystPositionGroup(position: PositionCode): AnalystPositionGroup {
  switch (position) {
    case "BR":
      return "goalkeeper";
    case "ŚO":
      return "centreBack";
    case "LO":
    case "PO":
    case "CLS":
    case "CPS":
      return "wideDefender";
    case "ŚPD":
    case "ŚP":
    case "POM":
      return "centralMidfielder";
    case "LP":
    case "PP":
    case "LS":
    case "PS":
    case "ŚPO":
      return "attackingMidfielder";
    case "CN":
    case "N":
    case "ŚN":
      return "striker";
  }
}
