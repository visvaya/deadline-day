import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { HAGGLE_SALE_BONUS, KOSZTY_STALE } from "../src/data/balance";
import { CLUBS, ratingForClubId } from "../src/data/clubs";
import { financeProfileFor, LEAGUE_MERIT_POOL_PLN } from "../src/data/club-finance-profiles";
import { FIRST_DIVISION } from "../src/data/first-division";
import { RYNEK_OPIS } from "../src/data/market-states";
import { parseFlags } from "./cli-args";
import {
  clubBudgets,
  createShapeCache,
  deriveMoneyScale,
  domesticBuyingCapacity,
  KUPNO_MEDIAN_PRICE_DEVIATION,
  leagueForecast,
  observationsFor,
  MAX_BUDGET_SHARE,
  MIN_BUDGET_SHARE,
  OWNER_BUDGET_PERCENTILE,
  optionAVariantAt,
  type OptionAPoint,
  playabilityCheck,
  priceCohort,
  probeSpreadAcrossScales,
  searchSlope,
  SQUAD_MODEL_IDS,
  summariseCohort,
  summariseFit,
  type SpreadProbe,
  sumNormalisedLevel,
  WAGE_CRITERIA,
  WAGE_PIVOT,
  WIDE_SLOPE_PROBE,
  type BudgetRow,
  type BudgetClub,
  type BuyingCapacityRow,
  type CohortSummary,
  type FitSummary,
  type MoneyScaleCandidate,
  type PlayabilityRow,
  type SlopeSearch,
  type SquadModelId,
} from "./money-scale-core";
import {
  compareWithPinnedCurve,
  counterfactualKupnoFee,
  assertDumpReadable,
  FINANCE_BASELINE_SHA256,
  fitFreeAgentPremium,
  fittedValueCurve,
  FIRST_TEAM_WAGE_SHARE,
  loadSigningsByType,
  loadCareers,
  validateLegacyBaseline,
  PLAYER_WAGE_SHARE_OF_FIRST_TEAM,
  summariseSigningCohort,
  wagePopulation,
  type CohortBreakdown,
  type DumpDigest,
  type FreeAgentPremiumFit,
  type PinnedCurveComparison,
  type WagePopulation,
} from "./money-scale-inputs";
import { MAX_DOMESTIC_FEE } from "./value-curve-core";
import type { PositionCode } from "../src/data/types";
import { at } from "../src/logic/invariant";

/**
 * The money-scale measurement of step 3b.
 *
 * It reports CANDIDATES and readiness gates. Nothing here activates a
 * constant, and a run that finishes cleanly having found the spec's wage
 * criteria unreachable is a successful measurement, not a failure - which is
 * why the default exit code says "the measurement ran", and only
 * --require-feasible turns an unmet criterion into a non-zero status.
 */

export const MONEY_SCALE_TOOL_VERSION = "1.0.0";

/** The thirteen active policies of the pinned baseline, so the free-agent
 * cohort can name the ones that signed nobody instead of leaving their
 * absence invisible. */
const ACTIVE_POLICIES = [
  "youngOnly",
  "primeOnly",
  "veteranOnly",
  "youngOnlyBuy",
  "primeOnlyBuy",
  "veteranOnlyBuy",
  "youngBuySellAlways",
  "alwaysTake",
  "alwaysHaggle",
  "stallThenTake",
  "depthFirst",
  "analystEdgeBuy",
  "mixed",
] as const;

/**
 * The squad model the derived candidates are computed from.
 *
 * The generator model, since the spec settled it there on 2026-09-09: what a
 * club actually pays is the truth about its burden, and the squad the game
 * draws prices its bench 3 to 12 ovr below the eleven. The screen projection
 * stays measured beside it, now as the size of the simplification the spec
 * used to carry - the two differ by about a fifth, so mixing a constant
 * fitted on one with shapes from the other is wrong by that much.
 */
export const REFERENCE_SQUAD_MODEL: SquadModelId = "generator-expectation";

/** Difference between the two squad models, above which the report calls the
 * disagreement material and asks for a decision before activation. */
const MATERIAL_MODEL_DIFFERENCE = 0.05;

/**
 * Uncertainty bands on the two European corrections the manifest marks
 * `estimated`. Both come from the manifest's own notes, and both move only
 * the RECURRING base, never the wage-fit target, which reads total revenue.
 */
const EUROPEAN_CORRECTION_BANDS = [
  { clubId: "slask-wroclaw", shortName: "Śląsk", lowPln: 6_800_000, highPln: 7_700_000 },
  { clubId: "wisla-krakow", shortName: "Wisła K.", lowPln: 5_300_000, highPln: 6_600_000 },
] as const;

export type ModelFit = {
  readonly model: SquadModelId;
  readonly search: SlopeSearch;
  readonly reference: FitSummary;
  readonly sumNormalised: FitSummary;
  /** Whether the fine scan's verdict survives outside its own range. */
  readonly wideProbe: SpreadProbe;
};

/**
 * One candidate slope under option A, where the level is fixed by matching the
 * aggregate rather than by minimising the reference loss.
 *
 * Exists because the aggregate ALONE identifies nothing: for any slope there
 * is a level that hits the sum exactly, so option A needs a companion
 * condition. These are the consequences that condition has to be chosen
 * against - what a single player earns, which is the one piece of evidence
 * the aggregate does not contain.
 */
export type OptionAVariant = OptionAPoint;

/** Recompute owner support from each variant's base budgets, before its floor. */
export const budgetPolicyVariant = (
  clubs: readonly BudgetClub[],
  divisor: number,
  label: string,
  minShare: number,
  floor: number,
  firstYearCost: number
): BudgetPolicyVariant => {
  const baseline = clubBudgets(clubs, divisor);
  const variant = clubBudgets(
    clubs.map((club) => ({
      ...club,
      reportedBudgetShare: Math.max(club.reportedBudgetShare ?? MIN_BUDGET_SHARE, minShare),
    })),
    divisor
  );
  const rows = variant.map((row, i) => ({
    budget: Math.max(row.budget, floor),
    previous: at(baseline, i, "baseline budget row").budget,
    row,
  }));
  const maxImpliedShare = Math.max(
    ...rows.filter((r) => !r.row.ownerException).map((r) => r.budget / r.row.recurringGameMillions)
  );
  return {
    label,
    minShare,
    floor,
    playableClubs: rows.filter((r) => r.budget >= firstYearCost).length,
    clubsLifted: rows.filter((r) => r.budget > r.previous + 1e-9).length,
    maxImpliedShare,
    maxShareExceeded: maxImpliedShare > MAX_BUDGET_SHARE + 1e-9,
    extraBudgetGranted: rows.reduce((sum, r) => sum + r.budget - r.previous, 0),
  };
};

/**
 * A way of making the smallest clubs able to buy, and what it costs elsewhere.
 *
 * The share and the floor fail differently and that is the whole point of
 * showing them together: raising the share lifts every club in proportion and
 * leaves the poorest still poorest, while an absolute floor lifts only those
 * below it - and pushes their implied share past MAX_BUDGET_SHARE, which the
 * spec set as a ceiling.
 */
export type BudgetPolicyVariant = {
  readonly label: string;
  readonly minShare: number;
  /** Absolute floor in game millions; zero means none. */
  readonly floor: number;
  readonly playableClubs: number;
  readonly clubsLifted: number;
  /** Highest share any club ends up on, after the floor. */
  readonly maxImpliedShare: number;
  readonly maxShareExceeded: boolean;
  readonly extraBudgetGranted: number;
};

export type FixedCostVariant = {
  readonly fixedCosts: number;
  readonly pricePerGameMillionPln: number;
  readonly wageAtPivot: number;
  readonly leaguePrizeRate: number;
  readonly playableClubs: number;
};

export type EuropeanSensitivity = {
  readonly clubId: string;
  readonly shortName: string;
  readonly lowPln: number;
  readonly highPln: number;
  readonly recurringAtLowPln: number;
  readonly recurringAtHighPln: number;
  readonly pricePerGameMillionAtLowPln: number;
  readonly pricePerGameMillionAtHighPln: number;
};

export type MoneyScaleResult = {
  readonly toolVersion: string;
  readonly status: "measured" | "blocked";
  readonly blockers: readonly string[];
  readonly openDecisions: readonly string[];
  readonly population: WagePopulation;
  readonly fits: readonly ModelFit[];
  readonly referenceModel: SquadModelId;
  readonly modelDifference: number;
  readonly modelDifferenceMaterial: boolean;
  readonly forecast: readonly { readonly shortName: string; readonly place: number }[];
  readonly scale: MoneyScaleCandidate;
  readonly budgets: readonly BudgetRow[];
  readonly playability: readonly PlayabilityRow[];
  readonly capacities: readonly BuyingCapacityRow[];
  readonly cohort: CohortSummary;
  readonly purchaseCohort: CohortBreakdown;
  readonly optionAVariants: readonly OptionAVariant[];
  readonly budgetPolicies: readonly BudgetPolicyVariant[];
  readonly fixedCostVariants: readonly FixedCostVariant[];
  readonly europeanSensitivity: readonly EuropeanSensitivity[];
  readonly curve: PinnedCurveComparison;
  readonly freeAgents: {
    readonly breakdown: CohortBreakdown;
    readonly fit: FreeAgentPremiumFit;
    readonly digest: DumpDigest;
  } | null;
  readonly legacy: unknown;
};

export type MoneyScaleOptions = {
  readonly signingsPath: string;
  readonly legacyBaselinePath: string;
};

/**
 * Runs the whole measurement once.
 *
 * The value fit, both wage fits and the squad shapes are each computed a
 * single time and handed to every consumer. Recomputing them per section
 * would multiply a half-second grid and a two-hundred-thousand-point scan by
 * however many tables happen to want them.
 */
export const runMoneyScaleFit = async (options: MoneyScaleOptions): Promise<MoneyScaleResult> => {
  // Inputs first, before a minute of fitting: a missing dump or an unreadable
  // baseline is a typo, and it should read as one rather than as a slow run.
  assertDumpReadable(options.signingsPath);
  const legacy = validateLegacyBaseline(
    JSON.parse(readFileSync(options.legacyBaselinePath, "utf8"))
  );

  const population = wagePopulation();
  const cache = createShapeCache();
  const fits: ModelFit[] = SQUAD_MODEL_IDS.map((model) => {
    const observationsAt = observationsFor(population.main, model, cache);
    const search = searchSlope(observationsAt);
    const observations = observationsAt(search.refined.slope);
    return {
      model,
      search,
      reference: summariseFit(observations, search.refined.level),
      sumNormalised: summariseFit(observations, sumNormalisedLevel(observations)),
      wideProbe: probeSpreadAcrossScales(observationsAt),
    };
  });

  const reference = fits.find((fit) => fit.model === REFERENCE_SQUAD_MODEL);
  if (!reference) throw new Error(`no fit for the reference model ${REFERENCE_SQUAD_MODEL}`);
  const other = fits.find((fit) => fit.model !== REFERENCE_SQUAD_MODEL);
  const modelDifference = other
    ? Math.abs(other.reference.level - reference.reference.level) / reference.reference.level
    : 0;

  const members = CLUBS.map((club) => ({
    clubId: club.clubId,
    shortName: club.shortName,
    rating: ratingForClubId(club.clubId),
  }));
  const forecast = leagueForecast(members);
  const payrollOf = (clubId: string, rating: { attack: number; defence: number }): number =>
    reference.reference.level *
    cache.shape(clubId, rating, REFERENCE_SQUAD_MODEL, reference.search.refined.slope);

  const scaleClubs = members.map((member, index) => ({
    clubId: member.clubId,
    shortName: member.shortName,
    recurringRevenuePln: financeProfileFor(member.clubId).recurringRevenuePln,
    fittedPayrollPln: payrollOf(member.clubId, member.rating),
    forecastPlace: at(forecast, index, "club forecast").expectedPlace,
  }));
  const scale = deriveMoneyScale(
    scaleClubs,
    LEAGUE_MERIT_POOL_PLN,
    KOSZTY_STALE,
    reference.reference.level
  );

  const budgets = clubBudgets(
    CLUBS.map((club) => ({
      clubId: club.clubId,
      shortName: club.shortName,
      recurringRevenuePln: financeProfileFor(club.clubId).recurringRevenuePln,
      backerBudgetPercentile: financeProfileFor(club.clubId).backerBudgetPercentile,
    })),
    scale.pricePerGameMillionPln
  );
  const capacities = domesticBuyingCapacity(
    [...CLUBS, ...FIRST_DIVISION].map((club) => ({
      clubId: club.clubId,
      shortName: club.shortName,
      recurringRevenuePln: financeProfileFor(club.clubId).recurringRevenuePln,
    })),
    scale.pricePerGameMillionPln,
    MAX_DOMESTIC_FEE,
    HAGGLE_SALE_BONUS
  );

  const curveFit = fittedValueCurve();
  const wageParams = {
    wageAtPivot: scale.wageAtPivot,
    wageSlope: reference.search.refined.slope,
  };

  // Both offer types in one pass. The playability question of chapter 3.5 is
  // about a median KUPNO card, so it must be answered on the KUPNO cohort;
  // asking it of the WOLNY cohort would price a veteran free agent (median
  // ovr 74, age 32) as though it were the card a club normally buys.
  const { byType, digest } = await loadSigningsByType(
    options.signingsPath,
    ["KUPNO", "WOLNY"],
    FINANCE_BASELINE_SHA256.signings
  );
  const purchases = byType.get("KUPNO") ?? [];
  const freeAgentRows = byType.get("WOLNY") ?? [];

  // The reference fee depends on the value curve and the market, never on the
  // wage slope, so it is computed once and reused by every option-A row. Nine
  // rows would otherwise repeat 320k curve evaluations apiece.
  const referenceFees = new Map<(typeof freeAgentRows)[number], number>(
    freeAgentRows.map((row) => [
      row,
      counterfactualKupnoFee(
        row.ovr,
        row.age,
        row.position,
        curveFit.params,
        RYNEK_OPIS.spokoj.mnoznikCeny
      ),
    ])
  );
  const referenceFeeOf = (row: (typeof freeAgentRows)[number]): number => {
    const fee = referenceFees.get(row);
    if (fee === undefined) throw new Error("no reference fee for a free-agent row");
    return fee;
  };

  const freeAgents: MoneyScaleResult["freeAgents"] = {
    breakdown: summariseSigningCohort(freeAgentRows, [...ACTIVE_POLICIES]),
    fit: fitFreeAgentPremium(freeAgentRows, wageParams, referenceFeeOf),
    digest,
  };
  const purchaseBreakdown = summariseSigningCohort(purchases, [...ACTIVE_POLICIES]);
  const cohortPlayers = purchases.map((row) => ({
    ovr: row.ovr,
    age: row.age,
    pos: row.position,
  }));
  // priceCohort applies the median deviation itself, so the price function
  // here returns the bare market value.
  const priceOf = (player: { ovr: number; age: number; pos: PositionCode }): number =>
    counterfactualKupnoFee(
      player.ovr,
      player.age,
      player.pos,
      curveFit.params,
      RYNEK_OPIS.spokoj.mnoznikCeny,
      1
    );
  const cohort = summariseCohort(
    priceCohort(cohortPlayers, wageParams, priceOf, RYNEK_OPIS.spokoj.mnoznikCeny)
  );

  const playability = playabilityCheck(budgets, cohort.medianFirstYearCost);

  const referenceAt = observationsFor(population.main, REFERENCE_SQUAD_MODEL, cache);
  const WAGE_PROBE_OVRS = [60, 70, 80, 90] as const;
  const optionAVariants: OptionAVariant[] = [4, 6, 8, 10, 12, 14.58, 16, 18, 20].map((slope) =>
    optionAVariantAt(
      slope,
      referenceAt(slope),
      members.map((member, index) => ({
        clubId: member.clubId,
        shortName: member.shortName,
        recurringRevenuePln: financeProfileFor(member.clubId).recurringRevenuePln,
        shape: cache.shape(member.clubId, member.rating, REFERENCE_SQUAD_MODEL, slope),
        forecastPlace: at(forecast, index, "club forecast").expectedPlace,
      })),
      LEAGUE_MERIT_POOL_PLN,
      KOSZTY_STALE,
      WAGE_PROBE_OVRS,
      // Priced again per row: the fee is anchored in real euro and does not
      // move, but the wage rides on this row's own curve, so the cost a club
      // has to clear is not the one measured at the reference slope.
      (params) =>
        summariseCohort(priceCohort(cohortPlayers, params, priceOf, RYNEK_OPIS.spokoj.mnoznikCeny))
          .medianFirstYearCost,
      // The same coupling, and the one that survived the first review: the
      // premium is two seasons of wage against a fee that does not move, so it
      // belongs to the curve it was fitted on.
      (params) => fitFreeAgentPremium(freeAgentRows, params, referenceFeeOf).premium
    )
  );

  const budgetPolicy = (label: string, minShare: number, floor: number): BudgetPolicyVariant =>
    budgetPolicyVariant(
      CLUBS.map((club) => ({
        clubId: club.clubId,
        shortName: club.shortName,
        recurringRevenuePln: financeProfileFor(club.clubId).recurringRevenuePln,
        backerBudgetPercentile: financeProfileFor(club.clubId).backerBudgetPercentile,
      })),
      scale.pricePerGameMillionPln,
      label,
      minShare,
      floor,
      cohort.medianFirstYearCost
    );
  const budgetPolicies: BudgetPolicyVariant[] = [
    budgetPolicy("dziś: udział 0,18, bez podłogi", MIN_BUDGET_SHARE, 0),
    budgetPolicy("udział podniesiony do maksimum speka", MAX_BUDGET_SHARE, 0),
    budgetPolicy(
      "podłoga = medianowy koszt pierwszego roku",
      MIN_BUDGET_SHARE,
      cohort.medianFirstYearCost
    ),
    budgetPolicy("podłoga = medianowe odstępne", MIN_BUDGET_SHARE, cohort.medianFee),
  ];

  const fixedCostVariants: FixedCostVariant[] = [KOSZTY_STALE, 0.9, 0.75, 0.6].map((fixedCosts) => {
    const variant = deriveMoneyScale(
      scaleClubs,
      LEAGUE_MERIT_POOL_PLN,
      fixedCosts,
      reference.reference.level
    );
    const variantBudgets = clubBudgets(
      CLUBS.map((club) => ({
        clubId: club.clubId,
        shortName: club.shortName,
        recurringRevenuePln: financeProfileFor(club.clubId).recurringRevenuePln,
        backerBudgetPercentile: financeProfileFor(club.clubId).backerBudgetPercentile,
      })),
      variant.pricePerGameMillionPln
    );
    // A different money scale reprices the cohort: the wage moves with
    // wageAtPivot, the fee does not, because transfer prices are anchored in
    // real millions of euro and cross into the game's unit one to one. So the
    // whole cohort is priced again rather than the median being rescaled -
    // the median of a sum is not the sum of rescaled medians.
    const variantCohort = summariseCohort(
      priceCohort(
        cohortPlayers,
        { wageAtPivot: variant.wageAtPivot, wageSlope: reference.search.refined.slope },
        priceOf,
        RYNEK_OPIS.spokoj.mnoznikCeny
      )
    );
    return {
      fixedCosts,
      pricePerGameMillionPln: variant.pricePerGameMillionPln,
      wageAtPivot: variant.wageAtPivot,
      leaguePrizeRate: variant.leaguePrizeRate,
      playableClubs: playabilityCheck(variantBudgets, variantCohort.medianFirstYearCost).filter(
        (row) => row.playable
      ).length,
    };
  });

  const europeanSensitivity: EuropeanSensitivity[] = EUROPEAN_CORRECTION_BANDS.map((band) => {
    const profile = financeProfileFor(band.clubId);
    const withCorrection = (correction: number): number =>
      profile.recurringRevenuePln + profile.europeanRevenuePln - correction;
    const scaleWith = (correction: number): number =>
      deriveMoneyScale(
        scaleClubs.map((club) =>
          club.clubId === band.clubId
            ? { ...club, recurringRevenuePln: withCorrection(correction) }
            : club
        ),
        LEAGUE_MERIT_POOL_PLN,
        KOSZTY_STALE,
        reference.reference.level
      ).pricePerGameMillionPln;
    return {
      clubId: band.clubId,
      shortName: band.shortName,
      lowPln: band.lowPln,
      highPln: band.highPln,
      recurringAtLowPln: withCorrection(band.lowPln),
      recurringAtHighPln: withCorrection(band.highPln),
      pricePerGameMillionAtLowPln: scaleWith(band.lowPln),
      pricePerGameMillionAtHighPln: scaleWith(band.highPln),
    };
  });

  const blockers: string[] = [];
  for (const fit of fits) {
    if (fit.search.scan.every((point) => point.joint.length === 0)) {
      blockers.push(
        `${fit.model}: no slope in [${at(fit.search.scan, 0, "first scan point").slope}, ` +
          `${at(fit.search.scan, fit.search.scan.length - 1, "last scan point").slope}] meets both wage criteria ` +
          `at any level`
      );
    }
  }
  const unplayable = playability.filter((row) => !row.playable);
  if (unplayable.length > 0) {
    blockers.push(
      `${unplayable.length} of ${playability.length} clubs cannot afford one median ` +
        `KUPNO card and its first-year wage`
    );
  }
  if (freeAgents && !freeAgents.fit.withinSpecBand) {
    blockers.push(
      `free-agent overpay ${freeAgents.fit.achievedRatio.toFixed(3)} of the reference fee is ` +
        `outside the spec's 0.40-0.60 band`
    );
  }
  const curveComparison = compareWithPinnedCurve(curveFit);
  if (!curveComparison.matches) {
    blockers.push("the step-3a curve no longer matches its report");
  }

  // Polish, like the rest of the report: this is a decision document a human
  // reads, and documentation stays in Polish even where the code
  // around it is English.
  const openDecisions = [
    "**Rozstrzygnięte 2026-09-09** decyzją właściciela produktu: " +
      "kryteria płac §4 zastąpione opcją A z nachyleniem 12,00. Narzędzie nadal raportuje " +
      "samą wykonalność i nie wybiera wiersza — tabela opcji A wyżej jest dowodem, " +
      "wobec którego ta decyzja zapadła.",
    "**Rozstrzygnięte 2026-09-09** (ten sam dokument): grywalność budżetów naprawia " +
      "podłoga bezwzględna 0,75 mln EUR gry, jako jawny wyjątek od `MAX_BUDGET_SHARE`. " +
      "Wariant kosztów stałych odrzucony — jako jedyny wyprowadza `D` od nowa i przesuwa " +
      "całą skalę.",
    "**Otwarte:** krok 4 musi przemierzyć skalę pieniądza na pełnych karierach " +
      "`finance-control`. Tożsamość rozwiązana tutaj centruje medianę jednorocznej " +
      "nadwyżki i jest przybliżeniem startowym, nie kryterium §12.2.",
    "**Otwarte:** kryteria §4 trzeba przepisać w speku razem z aktywacją. Dziś spek " +
      "nadal podaje medianę ≤ 15% i maksimum ≤ 30%, oznaczone jako nieosiągalne.",
  ];

  return {
    toolVersion: MONEY_SCALE_TOOL_VERSION,
    status: blockers.length === 0 ? "measured" : "blocked",
    blockers,
    openDecisions,
    population,
    fits,
    referenceModel: REFERENCE_SQUAD_MODEL,
    modelDifference,
    modelDifferenceMaterial: modelDifference > MATERIAL_MODEL_DIFFERENCE,
    forecast: forecast.map((entry) => ({
      shortName: entry.shortName,
      place: entry.expectedPlace,
    })),
    scale,
    budgets,
    playability,
    capacities,
    cohort,
    purchaseCohort: purchaseBreakdown,
    optionAVariants,
    budgetPolicies,
    fixedCostVariants,
    europeanSensitivity,
    curve: curveComparison,
    freeAgents,
    legacy,
  };
};

/** Windows hands back backslashes, and a report regenerated there would differ
 * from the pinned one in nothing but separators. The path is provenance, so it
 * is normalised for display rather than left platform-dependent. */
const displayPath = (path: string): string => path.split("\\").join("/");

const pl = (value: number, digits = 2): string =>
  value.toFixed(digits).replace(".", ",").replace("-", "−");

const mln = (pln: number): string => pl(pln / 1e6);

export const renderReport = (result: MoneyScaleResult): string => {
  const lines: string[] = [];
  const push = (...rows: string[]): void => {
    lines.push(...rows);
  };

  push(
    "# Skala pieniądza i płace — pomiar",
    "",
    `**Status: ${result.status === "measured" ? "ZMIERZONE" : "ZABLOKOWANE"}.**`,
    "",
    "To jest **pomiar**, nie zgoda na aktywację. Wszystkie liczby niżej są",
    "**kandydatami**, nie stałymi gotowymi do wpisania. Żadna z nich nie zmienia",
    "`src/`; aktywacja wymaga decyzji właściciela produktu i pomiaru pełnych karier",
    "w kroku 4.",
    "",
    `Wersja narzędzia: **${result.toolVersion}**. Model referencyjny: \`${result.referenceModel}\`.`,
    ""
  );

  if (result.blockers.length > 0) {
    push("## Co blokuje aktywację", "");
    for (const blocker of result.blockers) push(`- ${blocker}`);
    push("");
  }

  push(
    "## Metoda",
    "",
    "Cel dopasowania: `totalRevenuePln × wageToRevenueRatio × " +
      `${FIRST_TEAM_WAGE_SHARE} × ${PLAYER_WAGE_SHARE_OF_FIRST_TEAM}\`. Pierwszy udział jest **raportowany**`,
    "(podział płac w raporcie GT), drugi **estymowany** (udział samych piłkarzy w płacach",
    "pierwszej drużyny). Nie wolno nazywać obu raportowanymi.",
    "",
    `\`WAGE_PIVOT\` jest przypięte na **${WAGE_PIVOT}** i nie podlega dopasowaniu.`,
    "Strata referencyjna to **suma kwadratów logarytmów residuów**, każdy klub z równą wagą.",
    "To **nie jest** minimalizacja mediany APE ani maksimum APE — kryteria akceptacji speka",
    "są sprawdzane osobno, przy **swobodnym poziomie**, a nie w punkcie tej straty.",
    "",
    "Błąd płac `predicted − reportedTarget` **nie jest bilansem finansowym klubu**",
    "i nie wolno go nazywać deficytem.",
    "",
    "## Populacja",
    "",
    `Główna (raportowani, grywalni, porównywalni): **${result.population.main.length}** klubów.`,
    "",
    "| klub | przychód ogółem (mln PLN) | wskaźnik płac | cel płac (mln PLN) |",
    "| --- | ---: | ---: | ---: |",
    ...result.population.main.map(
      (member) =>
        `| ${member.shortName} | ${mln(member.totalRevenuePln)} | ${pl(member.wageToRevenueRatio)} | ${mln(member.targetPayrollPln)} |`
    ),
    "",
    "Wrażliwość (raportowani i grywalni, wyłączeni z dopasowania referencyjnego):",
    "",
    "| klub | powód |",
    "| --- | --- |",
    ...result.population.sensitivity.map(
      (entry) => `| ${entry.member.shortName} | ${entry.reason} |`
    ),
    "",
    "Wyłączeni:",
    "",
    "| klub | powód |",
    "| --- | --- |",
    ...result.population.excluded.map((entry) => `| ${entry.shortName} | ${entry.reason} |`),
    "",
    "**Gwiazdka GT-EKS przy Motorze, Lechii i GKS dotyczy kolumny 2023/2024**, nie",
    "2024/2025 — sprawdzone wobec legendy wykresu płac (str. 19) i kart klubowych.",
    "Ich bieżące wskaźniki są więc porównywalne; Motor i GKS trafiają do wrażliwości",
    "zachowawczo, jako kluby w pierwszym sezonie po awansie, a nie dlatego, że dane są złe.",
    "Lechia odpada wcześniej — nie da się nią grać.",
    ""
  );

  push("## Dopasowanie płac i wykonalność", "");
  for (const fit of result.fits) {
    const first = at(fit.search.scan, 0, "first scan point");
    const last = at(fit.search.scan, fit.search.scan.length - 1, "last scan point");
    push(
      `### Model \`${fit.model}\``,
      "",
      `Nachylenie: **${pl(fit.search.refined.slope, 4)}**, poziom: **${mln(fit.reference.level)} mln PLN**.`,
      `Minimum na siatce: ${pl(fit.search.gridBest.slope, 2)}; ` +
        `${fit.search.atRangeBoundary ? "**na brzegu zakresu — ograniczone zakresem, nie globalne**" : "wewnątrz zakresu"}.`,
      `Lokalnych minimów na siatce: **${fit.search.localMinimaCount}** ` +
        `(${fit.search.localMinimaCount === 1 ? "zgodne z unimodalnością" : "unimodalność NIE zachodzi"}), ` +
        `remisów: ${fit.search.gridTies}.`,
      `Doprecyzowanie: ${fit.search.refineIterations} iteracji, ` +
        `${fit.search.refineConverged ? "zbieżne do 1e-6" : "**niezbieżne w limicie iteracji**"}.`,
      "",
      `Mediana APE: **${pl(fit.reference.medianApePercent)}%** (kryterium ≤ ${WAGE_CRITERIA.medianTolerance * 100}%), ` +
        `maksimum: **${pl(fit.reference.maxApePercent)}%** (kryterium ≤ ${WAGE_CRITERIA.maxTolerance * 100}%).`,
      `Suma celu: ${mln(fit.reference.targetSum)} mln PLN, suma prognozy: ${mln(fit.reference.predictedSum)} mln PLN, ` +
        `**względny błąd sumy populacji dopasowania**: ${pl(fit.reference.sumRelativeErrorPercent)}%.`,
      "",
      "Wykonalność sprawdzona przy **swobodnym poziomie**, osobno dla każdego nachylenia",
      `w zakresie [${first.slope}, ${last.slope}] krokiem 0,01:`,
      "",
      `- nachyleń spełniających **oba** kryteria jednocześnie: **${fit.search.scan.filter((point) => point.joint.length > 0).length}** z ${fit.search.scan.length}`,
      `- świadek kryterium maksimum w optimum: **${fit.search.refined.maxWitness.high.id}** kontra ` +
        `**${fit.search.refined.maxWitness.low.id}**, rozrzut ${pl(fit.search.refined.maxWitness.spread, 3)} ` +
        `wobec dopuszczalnego ${pl(fit.search.refined.maxWitness.allowedSpread, 3)}`,
      `- najmniejszy rozrzut w całym zakresie: ` +
        `**${pl(Math.min(...fit.search.scan.map((point) => point.maxWitness.spread)), 3)}**`,
      "",
      "Para klubów wskazana wyżej jest **certyfikatem dla tego nachylenia**: żaden poziom nie",
      "leży jednocześnie w paśmie obu, dopóki ich rozrzut przekracza `(1+t)/(1−t)`. Świadek",
      "zmienia się jednak wraz z nachyleniem, więc **nie jest to dowód niezależny od `s`** —",
      "sonda niżej sprawdza dodatkowe nachylenia, nie dowodzi niewykonalności dla kontinuum.",
      "",
      `Sonda log-równomierna po \`[${WIDE_SLOPE_PROBE.min}; ${WIDE_SLOPE_PROBE.max}]\`, ` +
        `${WIDE_SLOPE_PROBE.points} punktów, poza zakresem skanu:`,
      "",
      `- najmniejszy rozrzut w całej sondzie: **${pl(fit.wideProbe.minSpread, 3)}** przy nachyleniu ${pl(fit.wideProbe.minSpreadSlope, 2)}`,
      `- rozrzut przy krzywej płaskiej (\`s → ∞\`): **${pl(fit.wideProbe.limitSpread, 3)}** = \`max(cel)/min(cel)\``,
      `- dopuszczalny: ${pl(fit.wideProbe.allowedSpread, 3)}`,
      `- czy gdziekolwiek wykonalne: **${fit.wideProbe.anyFeasible ? "tak" : "nie"}**`,
      "",
      "Granica przy `s → ∞` opisuje wyłącznie krzywą płaską:",
      "przy płaskiej krzywej kształt każdego klubu dąży do liczebności kadry, ta sama dla",
      "wszystkich, więc ilorazy zależą już tylko od celów. Rozrzut samych celów przekracza",
      "dopuszczalny dla aktualnych danych; sonda sprawdza dodatkowo wybrane skończone nachylenia.",
      "",
      "Werdykt numeryczny dotyczy zbadanych punktów, także poza `[2, 20]`, oraz granicy płaskiej.",
      "Nie wyklucza matematycznie rozwiązania pomiędzy próbkami ani poza sondą.",
      "",
      "| klub | cel (mln PLN) | prognoza (mln PLN) | błąd podpisany | błąd bezwzgl. |",
      "| --- | ---: | ---: | ---: | ---: |",
      ...[...fit.reference.residuals]
        .sort((a, b) => b.absoluteErrorPercent - a.absoluteErrorPercent)
        .map(
          (residual) =>
            `| ${residual.id} | ${mln(residual.target)} | ${mln(residual.predicted)} | ` +
            `${pl(residual.signedErrorPercent)}% | ${pl(residual.absoluteErrorPercent)}% |`
        ),
      "",
      "Diagnostyka A (normalizacja do sumy): poziom " +
        `${mln(fit.sumNormalised.level)} mln PLN, mediana APE ${pl(fit.sumNormalised.medianApePercent)}%, ` +
        `maksimum ${pl(fit.sumNormalised.maxApePercent)}%, błąd sumy ${pl(fit.sumNormalised.sumRelativeErrorPercent)}%.`,
      "**Sama zgodność sumy nie identyfikuje nachylenia** — dla każdego slope istnieje poziom,",
      "który trafia w sumę dokładnie.",
      ""
    );
  }

  const referenceFit = result.fits.find((fit) => fit.model === result.referenceModel);
  if (!referenceFit) throw new Error(`no fit for the reference model ${result.referenceModel}`);
  const candidateSlope = referenceFit.search.refined.slope;
  /** Today's curve, from src/logic/wages.ts, quoted so the report can show the
   * direction of the change rather than assert it. */
  const legacyWage = (ovr: number): number => 0.066 * Math.exp((ovr - 58) / 8.5);
  const candidateWage = (ovr: number): number =>
    result.scale.wageAtPivot * Math.exp((ovr - WAGE_PIVOT) / candidateSlope);

  push(
    "### Opcja A po nachyleniach: co wybiera nachylenie",
    "",
    "Poziom jest tu ustawiony **warunkiem A** — trafia w sumę populacji dopasowania dokładnie,",
    "przy każdym nachyleniu. Dlatego suma nie może być jedynym kryterium: wszystkie wiersze",
    "niżej spełniają ją idealnie i różnią się dopiero **pojedynczą płacą**. To jest tabela,",
    "wobec której trzeba wybrać warunek towarzyszący.",
    "",
    "`D` jest w każdym wierszu **wyprowadzone od nowa**, bo skala idzie za dopasowaną listą płac.",
    "Z tego samego powodu **koszt medianowej karty i grywalność też są liczone per wiersz**:",
    "odstępne jest zakotwiczone w realnych euro i nie drgnie, ale płaca jedzie po krzywej",
    "danego wiersza, więc próg, który klub musi pokryć, nie jest tym zmierzonym przy",
    "nachyleniu referencyjnym. Tabela polityk budżetowych niżej stoi na wierszu referencyjnym.",
    "",
    "| nachylenie | D (mln PLN) | OVR 60 | OVR 70 | OVR 80 | OVR 90 | OVR 90 / przychód najbog. | OVR 90 / przychód najuboż. | mediana APE | maks. APE | koszt 1. roku | grywalnych | podłoga na 18/18 | `WOLNY_WAGE_PREMIUM` |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...result.optionAVariants.map((variant) => {
      const wage = (ovr: number): string =>
        pl(variant.wageByOvr.find((entry) => entry.ovr === ovr)?.wage ?? 0, 3);
      return (
        `| ${pl(variant.slope, 2)} | ${mln(variant.pricePerGameMillionPln)} | ` +
        `${wage(60)} | ${wage(70)} | ${wage(80)} | ${wage(90)} | ` +
        `${pl(variant.topWageShareRichest * 100, 1)}% | ${pl(variant.topWageSharePoorest * 100, 1)}% | ` +
        `${pl(variant.medianApePercent)}% | ${pl(variant.maxApePercent)}% | ` +
        `${pl(variant.medianFirstYearCost, 3)} | ${variant.playableAtMinShare} / ${variant.clubCount} | ` +
        `${pl(variant.floorForFullPlayability, 3)} | ${pl(variant.freeAgentPremium, 4)} |`
      );
    }),
    "",
    "**Cztery ostatnie kolumny wiążą decyzję o nachyleniu z resztą stałych.** Decyzje",
    "o nachyleniu i o budżetach zapadły 2026-09-09, ale sprzężenie zostaje i obowiązuje",
    "przy każdej ich rewizji: wybór nachylenia przesuwa",
    "`D`, a przez `D` budżety i koszt pierwszego roku — więc podłoga odczytana z wiersza",
    "referencyjnego byłaby podłogą dla nachylenia, którego nikt nie wybrał. Podłoga",
    "gwarantująca grywalność wszystkich klubów to dokładnie koszt medianowej karty **przy tym",
    "samym nachyleniu**.",
    "",
    "Kwoty płac w **mln EUR gry**, rocznie. Dwie kolumny udziału mówią, ile jeden zawodnik OVR 90",
    "zjada z całorocznego przychodu najbogatszego i najuboższego klubu — to jest wielkość, którą",
    "da się ocenić **bez modelu**, i jedyna niezależna informacja, jakiej agregat nie zawiera.",
    "",
    "Kolumny APE są tu **konsekwencją, nie celem**: pokazują, co dane nachylenie kosztuje po",
    "stronie klubowej, skoro kryteria §4 i tak są nieosiągalne (sekcja wyżej).",
    "",
    "**Narzędzie nie wybiera wiersza.**",
    "",
    "### Rozjazd z wcześniejszym przepisem na krzywą płac",
    "",
    "Ten dokument mówi wprost: „Wykładnik 8,5 trzeba **obniżyć** (stromsza krzywa), a bazę",
    '**podnieść**". Dopasowanie zrobiło **odwrotnie w obu parametrach** i jest to wynik, nie',
    "usterka — ale czytelnik speka spodziewa się krzywej stromszej, więc rozjazd musi tu stać.",
    "",
    `Nachylenie: **8,5 → ${pl(candidateSlope, 2)}** (wyższe znaczy **płaszej**).`,
    "",
    "| OVR | dziś | kandydat |",
    "| ---: | ---: | ---: |",
    ...[60, 70, 80, 90].map(
      (ovr) => `| ${ovr} | ${pl(legacyWage(ovr), 3)} | ${pl(candidateWage(ovr), 3)} |`
    ),
    "",
    `Rozpiętość płac OVR 60→90 spada z **${pl(legacyWage(90) / legacyWage(60), 1)}×** na ` +
      `**${pl(candidateWage(90) / candidateWage(60), 1)}×**.`,
    "",
    "Dwie przyczyny, obie sprawdzalne, żadna nie unieważnia dopasowania:",
    "",
    '1. **Diagnoza „3× za płasko" mieszała jednostki.** Cel Legii 16,74 mln € w tamtej tabeli',
    '   to `71,96 mln PLN / 4,30`, czyli **realne** euro; kolumna „dziś w grze" była w **starych',
    "   euro gry**. Wspólny błąd jednostki nie tłumaczy jednak rosnącej krotności (Legia 2,9×,",
    "   Puszcza 1,8×, Stal 1,1×), więc sam kierunek tamtej diagnozy nie jest tym obalony.",
    "2. **Diagnoza jest starsza od dzisiejszego generatora kadr.** Powstała przy `sila`,",
    "   a `formationTargetOvr` ściska dziś projektowane kadry do wąskiego pasma OVR. To ta sama",
    "   kompresja, która stoi za niewykonalnością kryteriów: krzywa stromsza rozjeżdżałaby",
    "   kluby o podobnych ocenach i różnych przychodach jeszcze mocniej, nie słabiej.",
    "",
    "**Wcześniejszy przepis został wycofany 2026-09-09** — jawną adnotacją w tamtym",
    "dokumencie, nie po cichu. Tabela krotności zostaje tam jako zapis obserwacji z tamtego",
    "momentu; obowiązuje wynik z tego raportu.",
    "",
    "### Oba modele obok siebie",
    "",
    `Różnica poziomów: **${pl(result.modelDifference * 100)}%**` +
      `${result.modelDifferenceMaterial ? " — **materialna: modeli nie wolno mieszać**" : " — poniżej progu materialności"}.`,
    "",
    "Spek §6 od 2026-09-09 wskazuje **model generatora** jako kontrakt prognozy i płac.",
    "Projekcja ekranowa pozostaje diagnostyką historycznego uproszczenia.",
    ""
  );

  push(
    "## Skala pieniądza i drabinka",
    "",
    "Kandydat wyprowadzony z tożsamości: `surplus = recurring − fittedPayroll +",
    "pool × (19 − forecastPlace) / 171`, `D = mediana(surplus) / KOSZTY_STALE`.",
    "",
    `Pula manifestowa: **${mln(LEAGUE_MERIT_POOL_PLN)} mln PLN**. \`KOSZTY_STALE\` = **${pl(KOSZTY_STALE)}** — wejście, nie pokrętło.`,
    "",
    `| wielkość | kandydat |`,
    `| --- | ---: |`,
    `| D (PLN na 1 mln EUR gry) | ${mln(result.scale.pricePerGameMillionPln)} mln |`,
    `| \`LEAGUE_PRIZE_RATE\` | ${pl(result.scale.leaguePrizeRate, 4)} |`,
    `| \`WAGE_AT_PIVOT\` | ${pl(result.scale.wageAtPivot, 4)} |`,
    `| \`wageSlope\` | ${pl(result.fits.find((fit) => fit.model === result.referenceModel)!.search.refined.slope, 4)} |`,
    `| mediana nadwyżki | ${mln(result.scale.medianSurplusPln)} mln PLN |`,
    "",
    "D **nie jest kursem walutowym**: ceny transferowe są zakotwiczone w realnych mln EUR",
    "i przechodzą do jednostki gry 1:1.",
    "",
    "**To przybliżenie startowe, nie dowód spełnienia §12.2.** Tam kryterium brzmi:",
    "mediana klubowych median bilansów pełnych karier `finance-control` w granicach 0,25 mln",
    "od zera. Rozwój, spadki i zmiana składu ligi nie znikają od rozwiązania tej tożsamości.",
    "",
    "| klub | przychód | płace | drabinka | bilans po kosztach stałych |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...[...result.scale.surpluses]
      .sort((a, b) => b.surplusPln - a.surplusPln)
      .map((entry) => {
        const d = result.scale.pricePerGameMillionPln;
        return (
          `| ${entry.shortName} | ${pl(entry.recurringRevenuePln / d)} | ${pl(entry.fittedPayrollPln / d)} | ` +
          `${pl(entry.leaguePrizePln / d)} | ${pl(entry.surplusPln / d - KOSZTY_STALE)} |`
        );
      }),
    "",
    "Kwoty w tej tabeli są w **mln EUR gry**. Podpisane residua klubów strukturalnie",
    "deficytowych i nadwyżkowych **mają zostać widoczne**, a nie być kasowane poprawką.",
    "",
    "Prognozowane miejsca (z `expectedPlace`, semantyka silnika — remisy dają to samo miejsce,",
    "więc zbiór nie musi być permutacją 1–18):",
    "",
    result.forecast.map((entry) => `${entry.shortName}: ${entry.place}`).join(" · "),
    ""
  );

  push(
    "## Budżety i grywalność",
    "",
    `Udział bazowy **${pl(MIN_BUDGET_SHARE)}**, maksimum **${pl(MAX_BUDGET_SHARE)}** — oba są **założeniami speka**.`,
    "Manifest nie ma pola `sourceBudgetShare`; brakujące udziały obsługuje lokalny adapter,",
    "a nie nowe pole w manifeście.",
    "",
    `Wyjątek właścicielski: percentyl **${pl(OWNER_BUDGET_PERCENTILE)}** bazowych budżetów grywalnej`,
    "osiemnastki, liczony **przed** podstawieniem, żeby wyjątek nie zapętlał się przez własny wynik.",
    "",
    "| klub | przychód | budżet bazowy | budżet | wyjątek |",
    "| --- | ---: | ---: | ---: | --- |",
    ...result.budgets.map(
      (row) =>
        `| ${row.shortName} | ${pl(row.recurringGameMillions)} | ${pl(row.baseBudget)} | ` +
        `${pl(row.budget)} | ${row.ownerException ? "tak" : "—"} |`
    ),
    "",
    `Kohorta wyceniona krzywą 3a i nową płacą: **${result.cohort.count}** obserwacji` +
      `${result.freeAgents ? `, z \`${displayPath(result.freeAgents.digest.path)}\` (sha256 rozpakowanych bajtów ${result.freeAgents.digest.sha256})` : ""}.`,
    `Mediana odstępnego: **${pl(result.cohort.medianFee, 3)}**, mediana płacy rocznej: **${pl(result.cohort.medianAnnualWage, 3)}**,`,
    `**mediana kosztu pierwszego roku: ${pl(result.cohort.medianFirstYearCost, 3)}** — liczona jako mediana sum`,
    `\`fee + annualWage\` per zawodnik, nie jako suma dwóch median (ta wynosi ${pl(result.cohort.sumOfMedians, 3)}).`,
    "",
    "Kohorta pochodzi z **podpisanych kart `KUPNO`**, nie z pełnego zbioru ofert. Karta",
    "odrzucona przez politykę albo przez limit obsady nie zostawia wiersza, więc rozkład",
    "jest warunkowany dwoma filtrami. Wyniki są w tym sensie **warunkowe**.",
    "",
    `Kwartyle OVR kohorty \`KUPNO\`: ${result.purchaseCohort.ovrQuartiles.join(" / ")}, ` +
      `kwartyle wieku: ${result.purchaseCohort.ageQuartiles.join(" / ")}. ` +
      `Polityk bez ani jednego zakupu: ${result.purchaseCohort.policiesWithoutSignings.length}` +
      `${result.purchaseCohort.policiesWithoutSignings.length > 0 ? ` (${result.purchaseCohort.policiesWithoutSignings.join(", ")})` : ""}.`,
    "",
    "Historyczne mediany `KUPNO` 0,32 / 0,134 z notatki bazowej są **kolumną historyczną**",
    "starej ekonomii, nie celem ani punktem odniesienia dla liczb wyżej.",
    "",
    "**Niedostępność ma dwa źródła, nie jedno.** Zestawienie ze starą ekonomią pokazuje, że",
    "cena karty i budżet klubu ruszyły się w przeciwne strony:",
    "",
    "| wielkość | stara ekonomia | kandydat | zmiana |",
    "| --- | ---: | ---: | ---: |",
    `| mediana odstępnego \`KUPNO\` | 0,320 | ${pl(result.cohort.medianFee, 3)} | ` +
      `**×${pl(result.cohort.medianFee / 0.32, 2)}** |`,
    `| mediana płacy rocznej | 0,134 | ${pl(result.cohort.medianAnnualWage, 3)} | ` +
      `×${pl(result.cohort.medianAnnualWage / 0.134, 2)} |`,
    `| koszt pierwszego roku | 0,454 | ${pl(result.cohort.medianFirstYearCost, 3)} | ` +
      `**×${pl(result.cohort.medianFirstYearCost / 0.454, 2)}** |`,
    "",
    "Odstępne rośnie przez **krzywą wartości z kroku 3a**, a budżety maleją przez **skalę",
    "pieniądza z tego kroku**. Obie zmiany działają w tę samą stronę, a wszystkie trzy warianty",
    "naprawy niżej (udział, podłoga bezwzględna, koszty stałe) siedzą wyłącznie po stronie",
    "budżetu. **Druga połowa problemu jest w cenie** i naprawa po jednej stronie strojona pod",
    "dzisiejszą medianę odstępnego stroi się pod liczbę, którą wyprodukował krok 3a.",
    "",
    "Zestawienie jest **orientacyjne**: bazuje na tej samej kohorcie podpisań, ale nowe ceny",
    "są kontrfaktyczne, z medianowym modyfikatorem i neutralnym rynkiem. Stary koszt pierwszego",
    "roku jest sumą osobnych median, nie medianą sum. To nie jest sparowany pomiar kosztu.",
    "",
    "| klub | budżet | grywalny | wymagany udział | brakuje |",
    "| --- | ---: | --- | ---: | ---: |",
    ...result.playability.map(
      (row) =>
        `| ${row.shortName} | ${pl(row.budget)} | ${row.playable ? "tak" : "**nie**"} | ` +
        `${pl(row.requiredShare, 3)} | ${pl(row.shortfall)} |`
    ),
    "",
    "Warianty polityki budżetowej. Udział i podłoga zawodzą **inaczej**, i to jest powód,",
    "żeby stały obok siebie: udział podnosi wszystkich proporcjonalnie i zostawia najuboższego",
    "najuboższym, a podłoga bezwzględna podnosi wyłącznie tych poniżej niej — za cenę udziału",
    "przekraczającego `MAX_BUDGET_SHARE`, które spek ustawił jako sufit.",
    "",
    "**Żaden z tych wariantów nie rusza przychodu ani `D`.** Zmieniają tylko regułę budżetu",
    "startowego, więc nie unieważniają skali ani drabinki.",
    "",
    "| wariant | udział min. | podłoga | grywalnych | podniesionych | maks. udział | ponad sufit | dodany budżet |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |",
    ...result.budgetPolicies.map(
      (policy) =>
        `| ${policy.label} | ${pl(policy.minShare, 2)} | ${pl(policy.floor, 3)} | ` +
        `${policy.playableClubs} / ${result.budgets.length} | ${policy.clubsLifted} | ` +
        `${pl(policy.maxImpliedShare * 100, 1)}% | ${policy.maxShareExceeded ? "**tak**" : "nie"} | ` +
        `${pl(policy.extraBudgetGranted, 2)} |`
    ),
    "",
    '„Dodany budżet" jest sumą po całej osiemnastce, w mln EUR gry. „Maks. udział" liczy się',
    "z przychodu klubu **po** zastosowaniu podłogi i **z pominięciem wyjątku właścicielskiego**,",
    `który stoi ponad sufitem z definicji (Wieczysta, percentyl ${OWNER_BUDGET_PERCENTILE}). Kolumna`,
    `„ponad sufit" mówi więc, czy **sam wariant** łamie \`MAX_BUDGET_SHARE = ${MAX_BUDGET_SHARE}\`,`,
    "a nie czy łamie go wyjątek, który spek już dopuścił.",
    "",
    "Warianty kosztów stałych (każdy **ponownie wyprowadza D**, nie tylko obniża wydatek):",
    "",
    "| KOSZTY_STALE | D (mln PLN) | WAGE_AT_PIVOT | LEAGUE_PRIZE_RATE | klubów grywalnych |",
    "| ---: | ---: | ---: | ---: | ---: |",
    ...result.fixedCostVariants.map(
      (variant) =>
        `| ${pl(variant.fixedCosts)} | ${mln(variant.pricePerGameMillionPln)} | ${pl(variant.wageAtPivot, 4)} | ` +
        `${pl(variant.leaguePrizeRate, 4)} | ${variant.playableClubs} / ${result.playability.length} |`
    ),
    "",
    "**Narzędzie nie wybiera wariantu i nie zmienia speka.**",
    "",
    `Krajowa zdolność nabywcza: \`min(${pl(MAX_DOMESTIC_FEE)}, recurring / D × 0,20)\`, oferta przed targowaniem`,
    `= zdolność / ${pl(1 + HAGGLE_SALE_BONUS)}. Klubów, dla których limit ${pl(MAX_DOMESTIC_FEE)} faktycznie wiąże: ` +
      `**${result.capacities.filter((row) => row.capBinding).length}** z ${result.capacities.length}.`,
    "Nieaktywny limit jest **diagnostyką**, nie błędem wymagającym podniesienia przychodu.",
    "",
    "| klub | zdolność | oferta przed targiem | limit wiąże |",
    "| --- | ---: | ---: | --- |",
    ...[...result.capacities]
      .sort((a, b) => b.capacity - a.capacity)
      .map(
        (row) =>
          `| ${row.shortName} | ${pl(row.capacity, 3)} | ${pl(row.offerBeforeHaggle, 3)} | ${row.capBinding ? "tak" : "—"} |`
      ),
    ""
  );

  push(
    "## Krzywa wartości (krok 3a)",
    "",
    `Parametry uzyskane ponownie z \`bestFit(feasibleJointSets(SEARCH_RANGE))\`, nie przepisane.`,
    `Zgodność z przypiętym raportem: **${result.curve.matches ? "tak" : "NIE"}**` +
      `${result.curve.matches ? "" : ` (${result.curve.differences.join("; ")})`}.`,
    `Wersja narzędzia 3a: ${result.curve.toolVersion}.`,
    ""
  );

  if (result.freeAgents) {
    const { breakdown, fit, digest } = result.freeAgents;
    push(
      "## Premia za podpis (`WOLNY`)",
      "",
      `Dump: \`${displayPath(digest.path)}\`, sha256 rozpakowanych bajtów **${digest.sha256}**,`,
      `wierszy w dumpie: ${digest.rowCount}, obserwacji \`WOLNY\`: **${breakdown.count}**.`,
      "",
      "**To są podpisania, nie oferty.** Selekcja jest widoczna i istotna:",
      "",
      `- polityki, które nie podpisały ani jednego wolnego agenta: **${breakdown.policiesWithoutSignings.length}** ` +
        `(${breakdown.policiesWithoutSignings.join(", ") || "—"})`,
      `- rozkład po sezonach: ${[...breakdown.bySeason.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([season, count]) => `${season}: ${count}`)
        .join(", ")} — malejący, bo krótsze kariery kończą się wcześniej`,
      `- kwartyle OVR: ${breakdown.ovrQuartiles.join(" / ")}, kwartyle wieku: ${breakdown.ageQuartiles.join(" / ")}`,
      "",
      "Karty odrzucone przez limit obsady nie zostawiają wiersza, więc rozkład jest",
      "warunkowany **dwoma** filtrami: polityką i pojemnością kadry. Liczba 320597 i mediany",
      "74/32 z notatki bazowej są tym samym pomiarem, nie dowodem braku selekcji.",
      "",
      "| polityka | podpisań |",
      "| --- | ---: |",
      ...[...breakdown.byPolicy.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([policy, count]) => `| ${policy} | ${count} |`),
      "",
      "Odniesienie: **medianowe odstępne za zawodnika o tym samym OVR, wieku i pozycji**,",
      `liczone krzywą 3a razy medianowy modyfikator ceny \`KUPNO\` (**${pl(KUPNO_MEDIAN_PRICE_DEVIATION)}**, mediana`,
      "`U(0,9; 1,5)`) i neutralny stan rynku. `marketValue` **nie jest** medianą odstępnego —",
      "jest nią dopiero po przemnożeniu przez ten modyfikator.",
      "",
      `| wielkość | wartość |`,
      `| --- | ---: |`,
      `| mediana odstępnego referencyjnego | ${pl(fit.medianCounterfactualFee, 3)} |`,
      `| mediana płacy bazowej | ${pl(fit.medianBaseWage, 3)} |`,
      `| mediana \`unitShare\` = 2×płaca/odstępne | ${pl(fit.medianUnitShare, 4)} |`,
      `| kandydat przy dopasowaniu **referencyjnym** | ${pl(fit.premium, 4)} |`,
      `| ten sam fit z równą wagą klubów | ${pl(fit.premiumEqualClubWeight, 4)} |`,
      `| nadpłata przez dwa sezony / odstępne | ${pl(fit.achievedRatio, 3)} |`,
      `| w paśmie 0,40–0,60 speka | ${fit.withinSpecBand ? "tak" : "**nie**"} |`,
      "",
      `Diagnostyka bez progu: przez pięć sezonów nadpłata wynosi ${pl(fit.fiveSeasonOverpayShare, 3)}`,
      "odstępnego. Horyzont dopasowania to **dwa sezony**, nie koniec kadencji.",
      "",
      "**Premia < 2 nie wynika z tego kryterium.** Dwukrotna płaca nie znaczy nadpłaty równej",
      "odstępnemu, więc żaden limit nie jest tu nakładany ani wynik przycinany.",
      "",
      "**Liczba wyżej jest dopasowana przy nachyleniu referencyjnym i nie wolno jej wziąć",
      "do aktywacji razem z innym nachyleniem.** `unitShare` to dwa sezony płacy wobec",
      "odstępnego zakotwiczonego w realnych euro — odstępne nie drga, płaca jedzie po",
      "krzywej, więc premia należy do tej krzywej, na której ją dopasowano. Wartość dla",
      "każdego rozważanego nachylenia stoi w ostatniej kolumnie tabeli opcji A;",
      "**stałą do aktywacji bierze się stamtąd, nie stąd.**",
      ""
    );
  }

  const legacy = result.legacy as {
    aggregation: { definition: string };
    artefacts: {
      control: {
        path: string;
        sha256: string;
        rowCount: number;
        incomeModes: string[];
      };
      active: {
        path: string;
        sha256: string;
        rowCount: number;
        incomeModes: string[];
      };
    };
    invariants: {
      cash: { measurement: { pooledMedian: number; count: number }; product: number };
      squadValue: { measurement: { pooledMedian: number; count: number }; product: number };
    };
  };
  push(
    "## Jednostka dziedzictwa",
    "",
    `Agregacja: \`${legacy.aggregation.definition}\` — krok 4 musi użyć **tej samej** definicji.`,
    "",
    "| dump | plik | sha256 rozpakowanych bajtów | wiersze | tryb przychodu |",
    "| --- | --- | --- | ---: | --- |",
    `| control | \`${legacy.artefacts.control.path}\` | \`${legacy.artefacts.control.sha256}\` | ` +
      `${legacy.artefacts.control.rowCount} | ${legacy.artefacts.control.incomeModes.join(", ")} |`,
    `| active | \`${legacy.artefacts.active.path}\` | \`${legacy.artefacts.active.sha256}\` | ` +
      `${legacy.artefacts.active.rowCount} | ${legacy.artefacts.active.incomeModes.join(", ")} |`,
    "",
    "| składnik | przebieg | mediana surowa | × stała historyczna | iloczyn |",
    "| --- | --- | ---: | ---: | ---: |",
    `| \`kasa\` | finance-control | ${legacy.invariants.cash.measurement.pooledMedian} | 5 | ${legacy.invariants.cash.product} |`,
    `| \`wartoscKadryMoj\` | aktywny | ${legacy.invariants.squadValue.measurement.pooledMedian} | 2 | ${legacy.invariants.squadValue.product} |`,
    "",
    "Iloczyn wartości kadry to **dwa razy mediana surowa**, nie `2 × 1,99`. 1,99 jest",
    "zaokrągleniem prezentacyjnym; odbudowanie iloczynu z niego dałoby 3,98 i zmieniłoby",
    "jednostkę, którą krok 4 ma zachować.",
    "",
    "Procedura kroku 4: sparować przebieg **tego samego typu i tych samych ziaren**, policzyć",
    "nową medianę i wziąć `nowa stała = iloczyn historyczny / nowa mediana`. Przy medianie",
    "zerowej, ujemnej lub niestabilnej **nie wolno dzielić mechanicznie** — należy zgłosić brak",
    "sensownej konwersji. Progi tolerancji czyta się ze speka (§5.2: ±5% dla mediany ligowej,",
    "plus tolerancja bezwzględna w punktach dla klubów blisko zera).",
    ""
  );

  push(
    "## Wrażliwość",
    "",
    "Europejskie korekty oznaczone `estimated`. Zmieniają wyłącznie **bazę powtarzalną**;",
    "cel dopasowania płac czyta przychód **ogółem** i pozostaje nietknięty.",
    "",
    "| klub | korekta niska | korekta wysoka | baza przy niskiej | baza przy wysokiej | D przy niskiej | D przy wysokiej |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...result.europeanSensitivity.map(
      (entry) =>
        `| ${entry.shortName} | ${mln(entry.lowPln)} | ${mln(entry.highPln)} | ` +
        `${mln(entry.recurringAtLowPln)} | ${mln(entry.recurringAtHighPln)} | ` +
        `${mln(entry.pricePerGameMillionAtLowPln)} | ${mln(entry.pricePerGameMillionAtHighPln)} |`
    ),
    "",
    "Miejsc historycznych z różnych szczebli nie składano w jedną sztuczną tabelę.",
    "",
    "## Decyzje wymagane przed krokiem 4",
    ""
  );
  for (const decision of result.openDecisions) push(`- ${decision}`);

  // No trailing blank: the caller adds the closing newline, and both consumers
  // would otherwise end on an empty line - which `git diff --check` reports on
  // the pinned file, and which console.log turns into a stray blank row.
  return lines.join("\n").trimEnd();
};

const KNOWN_FLAGS = [
  "--md",
  "--signings",
  "--control",
  "--active",
  "--legacy-baseline",
  "--require-feasible",
  "--help",
];
const VALUELESS_FLAGS = ["--require-feasible", "--help"];

const HELP = `pnpm fit:money-scale --signings <plik> [--md <plik>] [--require-feasible]

Mierzy krzywą płac, skalę pieniądza, drabinkę, budżety i premię wolnego agenta.
Raportuje KANDYDATÓW i bramki gotowości; nie zmienia żadnej stałej w src/.

  --signings <plik>       dump --dump-signings (CSV albo .gz). Wymagany.
  --control <plik>        dump --dump-raw --finance-control (weryfikacja hasza)
  --active <plik>         dump --dump-raw aktywnych polityk (weryfikacja hasza)
  --legacy-baseline <p>   domyślnie scripts/data/legacy-unit-baseline.json
  --md <plik>             zapisz raport
  --require-feasible      kod wyjścia 2, gdy kryteria nie są spełnione

Kody wyjścia: 0 = pomiar wykonany (także wynik "zablokowany"),
2 = --require-feasible i niespełnione kryteria, 1 = błąd danych albo wejścia/wyjścia.`;

const DEFAULT_LEGACY_BASELINE = "scripts/data/legacy-unit-baseline.json";

export const main = async (argv: readonly string[]): Promise<number> => {
  const flags = parseFlags([...argv], KNOWN_FLAGS, VALUELESS_FLAGS);
  if (flags.has("--help")) {
    console.log(HELP);
    return 0;
  }
  for (const flag of ["--md", "--signings", "--control", "--active", "--legacy-baseline"]) {
    const value = flags.get(flag);
    if (value !== undefined && (value.trim() === "" || value.startsWith("--"))) {
      throw new Error(`${flag} requires a non-empty path, not another flag`);
    }
  }
  const signingsPath = flags.get("--signings");
  if (!signingsPath) {
    throw new Error("--signings is required: there is no default cohort and no substitute");
  }

  for (const [flag, hash] of [
    ["--control", FINANCE_BASELINE_SHA256.control],
    ["--active", FINANCE_BASELINE_SHA256.active],
  ] as const) {
    const path = flags.get(flag);
    if (path) await loadCareers(path, hash);
  }

  const result = await runMoneyScaleFit({
    signingsPath,
    legacyBaselinePath: flags.get("--legacy-baseline") ?? DEFAULT_LEGACY_BASELINE,
  });
  const report = renderReport(result);
  console.log(report);
  const md = flags.get("--md");
  if (md) writeFileSync(md, `${report}\n`, "utf8");

  // A blocked measurement is still a completed measurement. Only the explicit
  // gate turns it into a non-zero status.
  return flags.has("--require-feasible") && result.status !== "measured" ? 2 : 0;
};

/** Nothing runs on import: the render test builds a small result by hand, and
 * importing this module must not read a 163 MB dump to do it. */
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
