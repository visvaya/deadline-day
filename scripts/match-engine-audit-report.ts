import { MATCH_BASE_GOALS, MATCH_HOME_ADVANTAGE, RELEGATED_COUNT } from "../src/data/balance";
import { renderTable } from "./balance-report";
import {
  calibratedLambdaFit,
  type CalibratedLambdaFit,
  type CohortAudit,
  type MatchEngineAudit,
  type OutcomeExperimentAudit,
  type OutcomeExperimentProfile,
} from "./match-engine-audit-core";
import {
  EKSTRAKLASA_REFERENCE,
  MATCH_OUTCOME_REFERENCE,
  estimate,
  summarizeEkstraklasaReference,
  summarizeMatchOutcomeReference,
  type MetricEstimate,
} from "./match-engine-audit-reference";
import { wilsonInterval } from "./stats";

const number = (value: number, digits = 2): string => value.toFixed(digits);
const percentage = (value: number, digits = 2): string => `${(value * 100).toFixed(digits)}%`;
const visibleSeDigits = (
  value: MetricEstimate,
  kind: "number" | "percentage",
  minimum: number
): number => {
  if (value.se === 0) return minimum;
  const scaled = kind === "percentage" ? value.se * 100 : value.se;
  let digits = minimum;
  while (digits < 6 && Number(scaled.toFixed(digits)) === 0) digits += 1;
  return digits;
};
const estimateCell = (
  value: MetricEstimate,
  kind: "number" | "percentage" = "number",
  digits = 2
): string => {
  const visibleDigits = visibleSeDigits(value, kind, digits);
  return kind === "percentage"
    ? `${percentage(value.mean, visibleDigits)} ± ${percentage(value.se, visibleDigits)} (n=${value.n})`
    : `${number(value.mean, visibleDigits)} ± ${number(value.se, visibleDigits)} (n=${value.n})`;
};

const pointRows = (
  label: string,
  cohort: CohortAudit
): [
  string,
  MetricEstimate,
  MetricEstimate,
  MetricEstimate,
  MetricEstimate,
  MetricEstimate,
  MetricEstimate,
  MetricEstimate,
] => [
  label,
  cohort.championPoints,
  cohort.p75Points,
  cohort.medianPoints,
  cohort.p25Points,
  cohort.lastPoints,
  cohort.pointSpread,
  cohort.tablePointSd,
];

const combinedStandardError = (first: MetricEstimate, second: MetricEstimate): number =>
  Math.hypot(first.se, second.se);

const primaryDistance = (
  profile: OutcomeExperimentProfile,
  realGoals: MetricEstimate,
  realDraws: MetricEstimate,
  realHomeAdvantage: MetricEstimate
): number => {
  const pairs: readonly (readonly [MetricEstimate, MetricEstimate])[] = [
    [profile.goalsPerMatch, realGoals],
    [profile.drawRate, realDraws],
    [profile.homePointAdvantage, realHomeAdvantage],
  ];
  return pairs.reduce((sum, [model, reference]) => {
    const denominator = combinedStandardError(model, reference);
    return sum + ((model.mean - reference.mean) / denominator) ** 2;
  }, 0);
};

const closerToReference = (
  candidate: MetricEstimate,
  current: MetricEstimate,
  reference: MetricEstimate
): boolean => Math.abs(candidate.mean - reference.mean) < Math.abs(current.mean - reference.mean);

const qualifiesOutcomeVariant = (
  candidate: OutcomeExperimentProfile,
  delta: OutcomeExperimentProfile,
  current: OutcomeExperimentProfile,
  realGoals: MetricEstimate,
  realDraws: MetricEstimate,
  realHomeAdvantage: MetricEstimate
): boolean => {
  const materialDrawIncrease = Math.max(2 * delta.drawRate.se, realDraws.se / 4);
  const materialHomeAdvantageIncrease = Math.max(
    2 * delta.homePointAdvantage.se,
    realHomeAdvantage.se / 4
  );
  return (
    delta.goalsPerMatch.mean <= 2 * delta.goalsPerMatch.se &&
    delta.drawRate.mean > materialDrawIncrease &&
    delta.homePointAdvantage.mean > materialHomeAdvantageIncrease &&
    closerToReference(candidate.goalsPerMatch, current.goalsPerMatch, realGoals) &&
    closerToReference(candidate.drawRate, current.drawRate, realDraws) &&
    closerToReference(candidate.homePointAdvantage, current.homePointAdvantage, realHomeAdvantage)
  );
};

/**
 * Prints the fitted constants verbatim, without toFixed and without a Polish
 * decimal comma: this is input for source code, not for prose, and a rounded
 * factor is not the number to paste into balance.ts.
 */
export const renderLambdaFitSection = (fit: CalibratedLambdaFit): string =>
  [
    "#### Kandydat lambd stron, wartości do wklejenia w src/data/balance.ts",
    "",
    "```",
    `  MATCH_BASE_GOALS = ${fit.impliedConstants.baseGoals}`,
    `  MATCH_HOME_ADVANTAGE = ${fit.impliedConstants.homeAdvantage}`,
    "```",
  ].join("\n");

const renderOutcomeExperiment = (
  experiment: OutcomeExperimentAudit,
  reference: ReturnType<typeof summarizeMatchOutcomeReference>
): string => {
  const realGoals = reference.goalsPerMatch;
  const realDraws = reference.drawRate;
  const realHomeWins = reference.homeWinRate;
  const realAwayWins = reference.awayWinRate;
  const realHomeAdvantage = reference.homePointAdvantage;
  const evaluated = experiment.variants.map((variant) => ({
    ...variant,
    qualifies: qualifiesOutcomeVariant(
      variant.absolute,
      variant.delta,
      experiment.current,
      realGoals,
      realDraws,
      realHomeAdvantage
    ),
    distance: primaryDistance(variant.absolute, realGoals, realDraws, realHomeAdvantage),
  }));
  const best = evaluated
    .filter((variant) => variant.qualifies)
    .sort((a, b) => a.distance - b.distance)[0];
  const absoluteTable = renderTable(
    [
      "wariant",
      "gole/mecz",
      "gole dom",
      "gole wyjazd",
      "remisy",
      "wygrane dom",
      "wygrane wyjazd",
      "przewaga pkt dom",
      "dystans z²",
      "przechodzi",
    ],
    [
      [
        "obecne",
        estimateCell(experiment.current.goalsPerMatch, "number", 3),
        estimateCell(experiment.current.homeGoalsPerMatch, "number", 3),
        estimateCell(experiment.current.awayGoalsPerMatch, "number", 3),
        estimateCell(experiment.current.drawRate, "percentage"),
        estimateCell(experiment.current.homeWinRate, "percentage"),
        estimateCell(experiment.current.awayWinRate, "percentage"),
        estimateCell(experiment.current.homePointAdvantage, "number", 3),
        number(primaryDistance(experiment.current, realGoals, realDraws, realHomeAdvantage), 2),
        "punkt odniesienia",
      ],
      ...evaluated.map((variant) => [
        variant.label,
        estimateCell(variant.absolute.goalsPerMatch, "number", 3),
        estimateCell(variant.absolute.homeGoalsPerMatch, "number", 3),
        estimateCell(variant.absolute.awayGoalsPerMatch, "number", 3),
        estimateCell(variant.absolute.drawRate, "percentage"),
        estimateCell(variant.absolute.homeWinRate, "percentage"),
        estimateCell(variant.absolute.awayWinRate, "percentage"),
        estimateCell(variant.absolute.homePointAdvantage, "number", 3),
        number(variant.distance, 2),
        variant.qualifies ? "tak" : "nie",
      ]),
      [
        "Ekstraklasa",
        estimateCell(realGoals, "number", 3),
        estimateCell(reference.homeGoalsPerMatch, "number", 3),
        estimateCell(reference.awayGoalsPerMatch, "number", 3),
        estimateCell(realDraws, "percentage"),
        estimateCell(realHomeWins, "percentage"),
        estimateCell(realAwayWins, "percentage"),
        estimateCell(realHomeAdvantage, "number", 3),
        "0,00",
        "—",
      ],
    ],
    "markdown"
  );
  const costTable = renderTable(
    [
      "sparowana różnica vs obecne",
      "Δ gole/mecz",
      "Δ gole dom",
      "Δ gole wyjazd",
      "Δ remisy",
      "Δ przewaga dom",
      "Δ rozpiętość",
      "Δ Spearman",
      "Δ #1 mistrzem",
      "Δ top 4",
      "Δ dolna połowa w top 4",
    ],
    evaluated.map((variant) => [
      variant.label,
      estimateCell(variant.delta.goalsPerMatch, "number", 3),
      estimateCell(variant.delta.homeGoalsPerMatch, "number", 3),
      estimateCell(variant.delta.awayGoalsPerMatch, "number", 3),
      estimateCell(variant.delta.drawRate, "percentage"),
      estimateCell(variant.delta.homePointAdvantage, "number", 3),
      estimateCell(variant.delta.pointSpread),
      estimateCell(variant.delta.spearmanStrengthPlace, "number", 3),
      estimateCell(variant.delta.strongestTitleRate, "percentage"),
      estimateCell(variant.delta.topFourAccuracy, "percentage"),
      estimateCell(variant.delta.lowerHalfInTopFour, "percentage"),
    ]),
    "markdown"
  );
  const poissonRows = [
    ["0:0", reference.seasonMeanPoisson.zeroZero],
    ["1:0", reference.seasonMeanPoisson.oneZero],
    ["0:1", reference.seasonMeanPoisson.zeroOne],
    ["1:1", reference.seasonMeanPoisson.oneOne],
    ["remisy razem", reference.seasonMeanPoisson.draws],
    ["remisy 2:2+", reference.seasonMeanPoisson.highDraws],
  ] as const;
  const poissonTable = renderTable(
    ["wynik", "obserwowane", "niezależny Poisson", "z"],
    poissonRows.map(([label, comparison]) => [
      label,
      comparison.observed.toString(),
      number(comparison.expected, 1),
      number(comparison.z, 2),
    ]),
    "markdown"
  );
  return [
    "### Eksperyment rozkładu wyniku meczu",
    "",
    `Benchmark mechanizmu wyniku obejmuje ${reference.seasons} pełnych sezonów i ${reference.matches} meczów (2015/16–2019/20 oraz 2021/22–2024/25). Jest większy od pięciosezonowego benchmarku tabeli i pomija wyłącznie sezon pandemiczny 2020/21 — z powodu spoza modelu, nie z powodu braków w danych.`,
    "",
    "#### Agregatowy test diagnostyczny zależności",
    "",
    poissonTable,
    "",
    "Oczekiwania policzono osobno dla każdego sezonu z jednej pary średnich goli gospodarzy i gości. Żadna komórka ani łączna nadwyżka remisów nie osiąga |z| = 2, więc ten prosty test nie daje dodatniego sygnału za nowym parametrem. Nie jest jednak testem warunkowej niezależności: nie kontroluje różnych sił par drużyn, a mieszanka heterogenicznych Poissonów sama zmienia częstość remisów i niskich wyników. Rozstrzygnięcie wymaga surowych par klubów, dopasowanego modelu attack/defence/home i estymacji ρ lub kowariancji względem niego.",
    "",
    "Kryterium `tak`: brak wzrostu goli przy 95% sparowanym marginesie, wzrost remisów i przewagi gospodarza większy zarówno od 2 sparowanych SE, jak i 1/4 SE danych rzeczywistych, oraz mniejszy błąd każdej z trzech metryk wobec ośmiosezonowego benchmarku Ekstraklasy. Próg materialności względem danych rzeczywistych nie pozwala ogromnemu n symulacji uznać mikroskopijnego efektu za użyteczny. `Dystans z²` sumuje trzy kwadraty odchyleń standaryzowanych; niżej jest lepiej, ale metryki kosztu nie wchodzą do tego rankingu.",
    "",
    absoluteTable,
    "",
    best
      ? `Najniższy dystans wśród wariantów przechodzących: **${best.label}** (${number(best.distance, 2)}). To kandydat pomiarowy, nie automatyczna decyzja o wdrożeniu.`
      : "Żaden wariant nie spełnił wszystkich warunków wejściowych.",
    "",
    "#### Pełna cena na pozostałych metrykach",
    "",
    costTable,
    "",
    "Dixon–Coles zachowuje marginalne rozkłady Poissona; wspólny składnik Poissona odejmuje κ od obu składników niezależnych i dodaje ten sam los do obu wyników. Oba mechanizmy zachowują oczekiwane gole konstrukcyjnie, a tabela wyżej sprawdza to empirycznie.",
    "",
    renderLambdaFitSection(calibratedLambdaFit()),
  ].join("\n");
};

export const renderMatchEngineAudit = (audit: MatchEngineAudit): string => {
  const real = summarizeEkstraklasaReference(EKSTRAKLASA_REFERENCE);
  const outcomeReference = summarizeMatchOutcomeReference(MATCH_OUTCOME_REFERENCE);
  const realGoals = estimate(EKSTRAKLASA_REFERENCE.map((season) => season.goals / season.matches));
  const realDraws = estimate(EKSTRAKLASA_REFERENCE.map((season) => season.draws / season.matches));
  const realHomeWins = estimate(
    EKSTRAKLASA_REFERENCE.map((season) => season.homeWins / season.matches)
  );
  const realAwayWins = estimate(
    EKSTRAKLASA_REFERENCE.map((season) => season.awayWins / season.matches)
  );
  const realHomePoints = estimate(
    EKSTRAKLASA_REFERENCE.map((season) => (season.homeWins * 3 + season.draws) / season.matches)
  );
  const realAwayPoints = estimate(
    EKSTRAKLASA_REFERENCE.map((season) => (season.awayWins * 3 + season.draws) / season.matches)
  );
  const realHomeAdvantage = estimate(
    EKSTRAKLASA_REFERENCE.map(
      (season) => (3 * (season.homeWins - season.awayWins)) / season.matches
    )
  );
  const realPromotedChampionCount = EKSTRAKLASA_REFERENCE.filter(
    (season) => season.promotedChampion
  ).length;
  const realPreviousChampionRelegatedCount = EKSTRAKLASA_REFERENCE.filter(
    (season) => season.previousChampionRelegated
  ).length;
  const realPromotedChampionUpper = wilsonInterval(
    realPromotedChampionCount,
    EKSTRAKLASA_REFERENCE.length
  ).upper;
  const realPromotedClubUpper = wilsonInterval(
    realPromotedChampionCount,
    real.promotedClubExposures
  ).upper;
  const realPreviousChampionRelegatedUpper = wilsonInterval(
    realPreviousChampionRelegatedCount,
    EKSTRAKLASA_REFERENCE.length
  ).upper;
  const realPointRow = [
    "Ekstraklasa 2021/22–2025/26",
    real.championPoints,
    real.tableQuartiles.p75,
    real.tableQuartiles.median,
    real.tableQuartiles.p25,
    real.lastPoints,
    real.pointSpread,
    real.tableQuartiles.sd,
  ] as const;
  const pointTable = renderTable(
    ["próba", "mistrz", "P75", "mediana", "P25", "ostatni", "rozpiętość", "SD tabeli"],
    [
      pointRows("Statyczny snapshot", audit.snapshot),
      pointRows("Po jednym cyklu awansów i spadków", audit.postPromotion),
      realPointRow,
    ].map(([label, ...values]) => [label, ...values.map((value) => estimateCell(value))]),
    "markdown"
  );

  const strengthTable = renderTable(
    [
      "próba",
      "Spearman siła↔miejsce",
      "najsilniejszy mistrzem",
      "trafność top 4",
      "dolna połowa ocen w top 4",
      "RMSE pkt od oczekiwanych",
    ],
    [
      ["Statyczny snapshot", audit.snapshot],
      ["Po jednym cyklu awansów i spadków", audit.postPromotion],
    ].map(([label, cohort]) => {
      const value = cohort as CohortAudit;
      return [
        label as string,
        estimateCell(value.spearmanStrengthPlace, "number", 3),
        estimateCell(value.strongestTitleRate, "percentage"),
        estimateCell(value.topFourAccuracy, "percentage"),
        estimateCell(value.lowerHalfInTopFour, "percentage"),
        estimateCell(value.residualPointsRmse),
      ];
    }),
    "markdown"
  );

  const matchTable = renderTable(
    [
      "próba",
      "gole/mecz",
      "remisy",
      "wygrane dom",
      "wygrane wyjazd",
      "pkt dom/mecz",
      "pkt wyjazd/mecz",
    ],
    [
      [
        "Statyczny snapshot",
        audit.snapshot.goalsPerMatch,
        audit.snapshot.drawRate,
        audit.snapshot.homeWinRate,
        audit.snapshot.awayWinRate,
        audit.snapshot.homePointsPerMatch,
        audit.snapshot.awayPointsPerMatch,
      ],
      [
        "Po jednym cyklu",
        audit.postPromotion.goalsPerMatch,
        audit.postPromotion.drawRate,
        audit.postPromotion.homeWinRate,
        audit.postPromotion.awayWinRate,
        audit.postPromotion.homePointsPerMatch,
        audit.postPromotion.awayPointsPerMatch,
      ],
      [
        "Ekstraklasa 2021/22–2025/26",
        realGoals,
        realDraws,
        realHomeWins,
        realAwayWins,
        realHomePoints,
        realAwayPoints,
      ],
      [
        // Derived, never typed: this row moved from eight seasons to nine on
        // 2026-08-28 and a hardcoded count would have gone on describing the
        // window it used to be.
        `Ekstraklasa — ${outcomeReference.seasons} sezonów wyników`,
        outcomeReference.goalsPerMatch,
        outcomeReference.drawRate,
        outcomeReference.homeWinRate,
        outcomeReference.awayWinRate,
        outcomeReference.homePointsPerMatch,
        outcomeReference.awayPointsPerMatch,
      ],
    ].map(([label, goals, draws, homeWins, awayWins, homePoints, awayPoints]) => [
      label as string,
      estimateCell(goals as MetricEstimate, "number", 3),
      estimateCell(draws as MetricEstimate, "percentage"),
      estimateCell(homeWins as MetricEstimate, "percentage"),
      estimateCell(awayWins as MetricEstimate, "percentage"),
      estimateCell(homePoints as MetricEstimate, "number", 3),
      estimateCell(awayPoints as MetricEstimate, "number", 3),
    ]),
    "markdown"
  );

  const movementTable = renderTable(
    [
      "próba",
      "średni ruch bezwzgl.",
      "P90 ruchu bezwzgl.",
      "utrzymanie top 4",
      "utrzymanie bottom 3",
    ],
    [
      [
        "Statyczny snapshot",
        audit.snapshot.meanAbsoluteHalfMove,
        audit.snapshot.p90AbsoluteHalfMove,
        audit.snapshot.topFourHalfRetention,
        audit.snapshot.bottomThreeHalfRetention,
      ],
      [
        "Po jednym cyklu",
        audit.postPromotion.meanAbsoluteHalfMove,
        audit.postPromotion.p90AbsoluteHalfMove,
        audit.postPromotion.topFourHalfRetention,
        audit.postPromotion.bottomThreeHalfRetention,
      ],
      [
        "Ekstraklasa",
        real.halfToFinal.meanAbsoluteMove,
        real.halfToFinal.p90AbsoluteMove,
        real.halfToFinal.topFourRetention,
        real.halfToFinal.bottomThreeRetention,
      ],
    ].map(([label, move, p90, top, bottom]) => [
      label as string,
      estimateCell(move as MetricEstimate, "number", 3),
      estimateCell(p90 as MetricEstimate, "number", 3),
      estimateCell(top as MetricEstimate, "percentage"),
      estimateCell(bottom as MetricEstimate, "percentage"),
    ]),
    "markdown"
  );

  const clubTable = renderTable(
    [
      "klub",
      "OVR",
      "n",
      "pkt średnia ± SE",
      "SD pkt ± SE(SD)",
      "mistrz",
      "top 4",
      `spadek (bottom ${RELEGATED_COUNT})`,
    ],
    audit.snapshot.clubs.map((club) => [
      club.club,
      number(club.ovr),
      String(club.n),
      `${number(club.pointsMean)} ± ${number(club.pointsMeanSe)}`,
      `${number(club.pointsSd)} ± ${number(club.pointsSdSe)}`,
      `${percentage(club.titleRate)} ± ${percentage(club.titleRateSe)}`,
      `${percentage(club.topFourRate)} ± ${percentage(club.topFourRateSe)}`,
      `${percentage(club.relegationRate)} ± ${percentage(club.relegationRateSe)}`,
    ]),
    "markdown"
  );

  const batchTable = renderTable(
    [
      "partia ziaren",
      "seed root",
      "n",
      "rozpiętość snapshot",
      "rozpiętość po awansach",
      "najsilniejszy mistrzem",
    ],
    audit.batches.map((batch) => [
      String(batch.index),
      `0x${batch.seedRoot.toString(16).padStart(8, "0")}`,
      String(batch.n),
      estimateCell(batch.snapshotSpread),
      estimateCell(batch.postPromotionSpread),
      estimateCell(batch.strongestTitleRate, "percentage"),
    ]),
    "markdown"
  );

  const decomposition = audit.decomposition;
  const decompositionTable = renderTable(
    [
      "wariant sparowany",
      "rozpiętość",
      "zmiana sparowana",
      "rozpiętość tabeli oczekiwanej",
      "#1 rankingu mistrzem",
      "trafność top 4",
      "dolna połowa ocen w top 4",
    ],
    [
      [
        "równe oceny (k=0)",
        estimateCell(decomposition.neutralSpread),
        "punkt odniesienia",
        number(decomposition.analyticalNeutralSpread),
        estimateCell(decomposition.ratingVariants.neutral.strongestTitleRate, "percentage"),
        estimateCell(decomposition.ratingVariants.neutral.topFourAccuracy, "percentage"),
        estimateCell(decomposition.ratingVariants.neutral.lowerHalfInTopFour, "percentage"),
      ],
      [
        "snapshot (k=1)",
        estimateCell(decomposition.currentSpread),
        estimateCell(decomposition.currentMinusNeutral),
        number(decomposition.analyticalCurrentSpread),
        estimateCell(decomposition.ratingVariants.current.strongestTitleRate, "percentage"),
        estimateCell(decomposition.ratingVariants.current.topFourAccuracy, "percentage"),
        estimateCell(decomposition.ratingVariants.current.lowerHalfInTopFour, "percentage"),
      ],
      [
        "szersze oceny (k=1,5)",
        estimateCell(decomposition.widerSpread),
        estimateCell(decomposition.widerMinusCurrent),
        number(decomposition.analyticalWiderSpread),
        estimateCell(decomposition.ratingVariants.wider.strongestTitleRate, "percentage"),
        estimateCell(decomposition.ratingVariants.wider.topFourAccuracy, "percentage"),
        estimateCell(decomposition.ratingVariants.wider.lowerHalfInTopFour, "percentage"),
      ],
    ],
    "markdown"
  );

  const ratingDeltaTable = renderTable(
    [
      "porównanie sparowane",
      "Δ #1 rankingu mistrzem (p.p.)",
      "Δ trafność top 4 (p.p.)",
      "Δ dolna połowa w top 4 (p.p.)",
    ],
    [
      ["snapshot minus równe", decomposition.ratingDeltas.currentMinusNeutral],
      ["k=1,5 minus snapshot", decomposition.ratingDeltas.widerMinusCurrent],
    ].map(([label, raw]) => {
      const value = raw as (typeof decomposition.ratingDeltas)["currentMinusNeutral"];
      return [
        label as string,
        estimateCell(value.strongestTitleRate, "percentage"),
        estimateCell(value.topFourAccuracy, "percentage"),
        estimateCell(value.lowerHalfInTopFour, "percentage"),
      ];
    }),
    "markdown"
  );

  const leverRows = [
    ["obecne", decomposition.levers.current],
    [
      `base goals -10% (${number(MATCH_BASE_GOALS)} → ${number(MATCH_BASE_GOALS * 0.9)})`,
      decomposition.levers.lowerBaseGoals,
    ],
    [
      `home advantage +10% (${number(MATCH_HOME_ADVANTAGE)} → ${number(MATCH_HOME_ADVANTAGE * 1.1)})`,
      decomposition.levers.higherHomeAdvantage,
    ],
    ["obie zmiany", decomposition.levers.combined],
  ] as const;
  const leverTable = renderTable(
    [
      "wariant sparowany",
      "gole/mecz",
      "remisy",
      "wygrane dom",
      "wygrane wyjazd",
      "przewaga pkt dom",
      "rozpiętość",
    ],
    [
      ...leverRows.map(([label, value]) => [
        label,
        estimateCell(value.goalsPerMatch, "number", 3),
        estimateCell(value.drawRate, "percentage"),
        estimateCell(value.homeWinRate, "percentage"),
        estimateCell(value.awayWinRate, "percentage"),
        estimateCell(value.homePointAdvantage, "number", 3),
        estimateCell(value.pointSpread),
      ]),
      [
        "Ekstraklasa",
        estimateCell(realGoals, "number", 3),
        estimateCell(realDraws, "percentage"),
        estimateCell(realHomeWins, "percentage"),
        estimateCell(realAwayWins, "percentage"),
        estimateCell(realHomeAdvantage, "number", 3),
        estimateCell(real.pointSpread),
      ],
    ],
    "markdown"
  );

  const leverDeltaTable = renderTable(
    [
      "porównanie sparowane vs obecne",
      "Δ gole/mecz",
      "Δ remisy (p.p.)",
      "Δ wygrane dom (p.p.)",
      "Δ wygrane wyjazd (p.p.)",
      "Δ przewaga pkt dom",
      "Δ rozpiętość",
    ],
    [
      ["base goals -10%", decomposition.leverDeltas.lowerBaseGoals],
      ["home advantage +10%", decomposition.leverDeltas.higherHomeAdvantage],
      ["obie zmiany", decomposition.leverDeltas.combined],
    ].map(([label, raw]) => {
      const value = raw as (typeof decomposition.leverDeltas)["lowerBaseGoals"];
      return [
        label as string,
        estimateCell(value.goalsPerMatch, "number", 3),
        estimateCell(value.drawRate, "percentage"),
        estimateCell(value.homeWinRate, "percentage"),
        estimateCell(value.awayWinRate, "percentage"),
        estimateCell(value.homePointAdvantage, "number", 3),
        estimateCell(value.pointSpread),
      ];
    }),
    "markdown"
  );

  const sourceLinks = [
    ...new Set([
      ...EKSTRAKLASA_REFERENCE.flatMap((season) => season.sources),
      ...MATCH_OUTCOME_REFERENCE.map((season) => season.source),
    ]),
  ]
    .map((url) => `- ${url}`)
    .join("\n");
  const outcomeExperimentSection = audit.outcomeExperiment
    ? renderOutcomeExperiment(audit.outcomeExperiment, outcomeReference)
    : null;

  return [
    "# Audyt silnika meczowego i tabeli",
    "",
    `- n = ${audit.options.runs} sezonów na raportowany scenariusz, podzielonych na ${audit.options.batches} niezależnie wyprowadzone partie ziaren`,
    `- seed bazowy: 0x${audit.options.seed.toString(16)}`,
    `- statyczny snapshot: ${audit.snapshot.matchCount.toLocaleString("pl-PL")} meczów`,
    `- po jednym cyklu awansów i spadków: ${audit.postPromotion.matchCount.toLocaleString("pl-PL")} meczów`,
    "- zapis `średnia ± SE (n=…)`; procenty są udziałami, nie punktami procentowymi",
    "",
    "## 1. Rozpiętość punktowa",
    "",
    pointTable,
    "",
    "## 2. Zgodność siły z miejscem",
    "",
    strengthTable,
    "",
    "### Statyczny snapshot — wynik każdego klubu",
    "",
    clubTable,
    "",
    "## 3. Rozkład bramek i przewaga gospodarza",
    "",
    matchTable,
    "",
    "## 4. Anomalie piramidy",
    "",
    `- beniaminek mistrzem: ${estimateCell(audit.promotedChampion, "percentage")} sezonów; na pojedynczy klub-awans: ${estimateCell(audit.promotedClubTitleRate, "percentage")} (${audit.options.runs * RELEGATED_COUNT} ekspozycji klubowych, SE klastrowane po sezonie)`,
    `- poprzedni mistrz spada: ${estimateCell(audit.previousChampionRelegated, "percentage")}`,
    `- rzeczywistość 2021/22–2025/26: beniaminek mistrzem ${estimateCell(real.promotedChampion, "percentage")}; na pojedynczy klub-awans ${estimateCell(real.promotedClubTitleRate, "percentage")} (${real.promotedClubExposures} ekspozycji); poprzedni mistrz spada ${estimateCell(real.previousChampionRelegated, "percentage")}`,
    `- przy zerze zdarzeń plug-in SE degeneruje do zera; górne granice 95% Wilsona: beniaminek mistrzem ${percentage(realPromotedChampionUpper)}, pojedynczy klub-awans ${percentage(realPromotedClubUpper)}, poprzedni mistrz spada ${percentage(realPreviousChampionRelegatedUpper)}`,
    "",
    "## 5. Źródło ściśnięcia — scenariusze sparowane",
    "",
    decompositionTable,
    "",
    "### Sparowana cena zmiany sygnału ocen",
    "",
    ratingDeltaTable,
    "",
    "Warianty korzystają z produkcyjnych `expectedGoals` i `poisson`. Każda strona każdego meczu ma osobny, wspólny dla wariantów strumień RNG; różnice są zatem sparowane bez kopiowania wzoru lambda.",
    "",
    "### Czułość bez zmiany stałych",
    "",
    leverTable,
    "",
    "### Sparowane różnice wobec obecnych stałych",
    "",
    leverDeltaTable,
    "",
    "Wiersze `-10%` i `+10%` są kontrfaktycznym pomiarem elastyczności. Komenda nie zmienia wartości w `balance.ts`.",
    ...(outcomeExperimentSection ? ["", outcomeExperimentSection] : []),
    "",
    "## 6. Tabela po 17 kolejkach a tabela końcowa",
    "",
    movementTable,
    "",
    "## 7. Stabilność między partiami ziaren",
    "",
    batchTable,
    "",
    "## 8. Granice interpretacji",
    "",
    "- Snapshot i liga po rotacji są oddzielnymi kohortami; raport nigdy ich nie łączy.",
    "- Przy mnożnikowej lambdzie poszerzenie odchyleń ocen `x → x^k` jest równoważne zmianie efektywnej czułości ilorazu ocen. Bez zewnętrznej kalibracji skali ocen nie da się jednoznacznie przypisać efektu wyłącznie danym albo wyłącznie lambdzie.",
    "- Zmiana czułości tabeli wpływa na miejsca, przychód ligowy, ryzyko spadku, punkty dziedzictwa i werdykt kadencji; przed jej przyjęciem trzeba ponownie uruchomić `pnpm balance` i sprawdzić handicapy oraz progi dziedzictwa.",
    "",
    "## Źródła danych rzeczywistych",
    "",
    sourceLinks,
  ].join("\n");
};
