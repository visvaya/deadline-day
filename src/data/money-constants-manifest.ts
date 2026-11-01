/**
 * Which constants in balance.ts are money, in which money, and where each one
 * came from.
 *
 * Built after the same class of bug turned up three times while the money
 * scale moved: a constant priced in the old unit, found by hand and
 * separately each time (the budget floor, WOLNY_WAGE_PREMIUM, VERDICT_KASA).
 * A unit alone would not have found the second one - it is a dimensionless
 * multiplier, fitted against the wage curve - so every entry records its
 * ORIGIN as well as its unit.
 *
 * Two calibration families share one visible game unit:
 * - `game`: reported PLN turned into game amounts by
 *   MONEY_SCALE_PLN_PER_GAME_MILLION - revenue, wages, budgets, cash scores;
 * - `realEuro`: card prices anchored numerically 1:1 to real mln EUR (spec 4,
 *   3.4), plus buyer capacity derived from real PLN revenue and the source
 *   NBP rate EUR_PLN_SOURCE_SEASON (buyer-capacity spec, 3.2).
 * `family` describes calibration provenance, not a second runtime currency.
 * A game amount may be sized against a real-euro card price.
 *
 * Every runtime export of balance.ts is in exactly one of the two lists
 * below; tests/data/money-constants-manifest.test.ts fails otherwise. The
 * manifest only sees balance.ts: a money constant defined anywhere else is
 * invisible to it.
 *
 * Imported by no runtime module. It documents the game, it does not run it.
 */

import type * as balance from "./balance";

type BalanceExportName = keyof typeof balance;

type MoneyFamily = "game" | "realEuro";

type MoneyUnit =
  | "gameMillionEur"
  | "gameMillionEurPerPlace"
  | "realMillionEur"
  | "pln"
  | "plnPerGameMillionEur"
  | "plnPerEur"
  | "pointsPerGameMillionEur"
  | "pointsPerRealMillionEur"
  | "ratio"
  | "ovr"
  | Readonly<{ buyerFactor: "ratio"; maxSpend: "realMillionEur" }>;

/**
 * - `measured`: read from an external source (report, record, NBP table);
 * - `fitted`: the output of a fit against data or simulation;
 * - `anchor`: a pinned input that other constants were fitted around;
 * - `derivedInCode`: computed in balance.ts from other exports;
 * - `unitConversion`: a multiplier that preserves a historical product in a
 *   new unit - not a calibration;
 * - `productDecision`: chosen by the product owner, with the date in `basis`;
 * - `designAssumption`: stated, not measured, and says so;
 * - `preActivation`: set before 2026-09-10 and not repriced since; its current
 *   runtime unit is still gameMillionEur, but its real-world fit is unverified.
 */
type MoneyOrigin =
  | "measured"
  | "fitted"
  | "anchor"
  | "derivedInCode"
  | "unitConversion"
  | "productDecision"
  | "designAssumption"
  | "preActivation";

type MoneyConstant = {
  family: MoneyFamily;
  unit: MoneyUnit;
  origin: MoneyOrigin;
  basis: string;
  /** Repo-relative paths; the test checks that each one exists. */
  evidence: readonly string[];
  externalSources?: readonly string[];
  /** Direct inputs only - balance exports this one was computed from, fitted
   * against or sized with. The closure is `moneyDependentsOf`. */
  dependsOn: readonly BalanceExportName[];
};

/**
 * - `relativeMultiplier`: scales a money amount but is invariant under a
 *   change of money unit and was not fitted against any money curve;
 * - `noMoney`: has nothing to do with money.
 */
type NotMonetaryReason = "relativeMultiplier" | "noMoney";

const FINANCE_ACTIVATION = "docs/decisions/finance-activation-2026-09-10.md";
const MONEY_SCALE_FIT = "docs/decisions/money-scale-fit-2026-09-08.md";
const VALUE_CURVE_FIT = "docs/decisions/value-curve-fit-2026-09-07.md";
const OPENING_BUDGET_FIT = "docs/decisions/opening-budget-fit-2026-09-12.md";
const OPENING_BUDGET_ACTIVATION = "docs/decisions/opening-budget-activation-2026-09-12.md";
const BUYER_CAPACITY = "docs/decisions/buyer-capacity-2026-09-22.md";
const LEGACY_UNIT_BASELINE = "scripts/data/legacy-unit-baseline.json";

const VALUE_CURVE: readonly BalanceExportName[] = [
  "MARKET_VALUE_MAX",
  "MARKET_VALUE_SLOPE",
  "MARKET_VALUE_MIDPOINT",
  "MARKET_VALUE_AGE_SHIFTS",
];

const WAGE_CURVE: readonly BalanceExportName[] = ["WAGE_AT_PIVOT", "WAGE_SLOPE"];

/** What the median cash of a controlled career is made of. The control run
 * switches off transfers, European prize money and both domestic cups, so
 * none of the prize constants belongs here. */
const CONTROLLED_CASH: readonly BalanceExportName[] = [
  "MONEY_SCALE_PLN_PER_GAME_MILLION",
  "KOSZTY_STALE",
  "WAGE_AT_PIVOT",
  "LEAGUE_PRIZE_RATE",
  "INITIAL_BUDGET_SHARE",
  "MIN_INITIAL_BUDGET",
  "USEFUL_UPGRADE_OVR_DELTA",
  "STRONG_BACKER_PERCENTILE",
  "ACTIVE_BACKER_PERCENTILE",
  "BOARD_REINVESTMENT_RATE",
];

export const MONEY_CONSTANTS: Readonly<Partial<Record<BalanceExportName, MoneyConstant>>> = {
  KOSZTY_STALE: {
    family: "game",
    unit: "gameMillionEur",
    origin: "anchor",
    basis:
      "Prototype value 1.1, kept through the activation as an input rather than a dial: the money scale is D = median surplus / KOSZTY_STALE, so moving this moves the whole game family.",
    evidence: [MONEY_SCALE_FIT, FINANCE_ACTIVATION],
    dependsOn: [],
  },
  MONEY_SCALE_PLN_PER_GAME_MILLION: {
    family: "game",
    unit: "plnPerGameMillionEur",
    origin: "fitted",
    basis:
      "Centres the median across clubs of their median annual finance-control balances near zero, measured over full careers. Root of the game family: reported PLN amounts reach the game through it.",
    evidence: [MONEY_SCALE_FIT, FINANCE_ACTIVATION],
    dependsOn: ["KOSZTY_STALE", "WAGE_AT_PIVOT_PLN", "WAGE_SLOPE", "WAGE_PIVOT_OVR"],
  },
  WAGE_PIVOT_OVR: {
    family: "game",
    unit: "ovr",
    origin: "anchor",
    basis:
      "Pinned at 70 and not fitted: with a free base only base x exp(-pivot / slope) is identifiable.",
    evidence: [MONEY_SCALE_FIT],
    dependsOn: [],
  },
  WAGE_SLOPE: {
    family: "game",
    unit: "ovr",
    origin: "productDecision",
    basis:
      "Option A of 2026-09-09: the middle of a flat region of the wage fit, not the minimum of any loss.",
    evidence: [MONEY_SCALE_FIT],
    dependsOn: ["WAGE_PIVOT_OVR"],
  },
  WAGE_AT_PIVOT_PLN: {
    family: "game",
    unit: "pln",
    origin: "fitted",
    basis:
      "The level that reproduces the fit population's total payroll exactly at WAGE_SLOPE, at full precision.",
    evidence: [MONEY_SCALE_FIT],
    dependsOn: ["WAGE_SLOPE", "WAGE_PIVOT_OVR"],
  },
  WAGE_AT_PIVOT: {
    family: "game",
    unit: "gameMillionEur",
    origin: "derivedInCode",
    basis: "WAGE_AT_PIVOT_PLN / MONEY_SCALE_PLN_PER_GAME_MILLION.",
    evidence: [],
    dependsOn: ["WAGE_AT_PIVOT_PLN", "MONEY_SCALE_PLN_PER_GAME_MILLION"],
  },
  LEAGUE_PRIZE_RATE: {
    family: "game",
    unit: "gameMillionEurPerPlace",
    origin: "derivedInCode",
    basis:
      "LEAGUE_MERIT_POOL_PLN / (MERIT_WEIGHT_SUM x MONEY_SCALE_PLN_PER_GAME_MILLION); the pool and the weight sum live in club-finance-profiles.ts.",
    evidence: [],
    dependsOn: ["MONEY_SCALE_PLN_PER_GAME_MILLION"],
  },
  leaguePositionPrize: {
    family: "game",
    unit: "gameMillionEur",
    origin: "derivedInCode",
    basis: "LEAGUE_PRIZE_RATE x (19 - place): the absolute placement ladder.",
    evidence: [],
    dependsOn: ["LEAGUE_PRIZE_RATE"],
  },
  MARKET_VALUE_MAX: {
    family: "realEuro",
    unit: "realMillionEur",
    origin: "fitted",
    basis:
      "Asymptote of the value curve, jointly fitted with its slope, midpoint and age shifts on 2026-09-07. Card prices are anchored 1:1 in real mln EUR.",
    evidence: [VALUE_CURVE_FIT],
    dependsOn: ["AGE_PROFILES"],
  },
  MARKET_VALUE_SLOPE: {
    family: "realEuro",
    unit: "ovr",
    origin: "fitted",
    basis: "Slope of the value sigmoid, same joint fit as MARKET_VALUE_MAX.",
    evidence: [VALUE_CURVE_FIT],
    dependsOn: ["AGE_PROFILES"],
  },
  MARKET_VALUE_MIDPOINT: {
    family: "realEuro",
    unit: "ovr",
    origin: "fitted",
    basis: "Midpoint of the value sigmoid, same joint fit as MARKET_VALUE_MAX.",
    evidence: [VALUE_CURVE_FIT],
    dependsOn: ["AGE_PROFILES"],
  },
  MARKET_VALUE_AGE_SHIFTS: {
    family: "realEuro",
    unit: "ovr",
    origin: "fitted",
    basis:
      "Ovr shift per age anchor relative to the position's peak band (AGE_PROFILES), same joint fit as MARKET_VALUE_MAX.",
    evidence: [VALUE_CURVE_FIT],
    dependsOn: ["AGE_PROFILES"],
  },
  MIN_MARKET_VALUE: {
    family: "realEuro",
    unit: "realMillionEur",
    origin: "designAssumption",
    basis: "Floor of a valuation, carried from the prototype and kept explicitly.",
    evidence: [],
    dependsOn: [],
  },
  MIN_BUDGET_SHARE: {
    family: "game",
    unit: "ratio",
    origin: "measured",
    basis:
      "Median of the observed budget shares in the source document. Historical lower bound of the 2026-09-12 scan; the budget formula no longer reads it.",
    evidence: [FINANCE_ACTIVATION],
    dependsOn: [],
  },
  MAX_BUDGET_SHARE: {
    family: "game",
    unit: "ratio",
    origin: "designAssumption",
    basis:
      "Ceiling on the share component of the opening budget only; the floor, the upgrade cost and backer support may exceed it.",
    evidence: [],
    dependsOn: [],
  },
  MIN_INITIAL_BUDGET: {
    family: "game",
    unit: "gameMillionEur",
    origin: "productDecision",
    basis:
      "Playability floor of 2026-09-09: every club can afford a median KUPNO card with its first year of wages, with room across the 11-13 wage-slope band.",
    evidence: [],
    dependsOn: [...WAGE_CURVE, ...VALUE_CURVE, "MIN_BUDGET_SHARE"],
  },
  INITIAL_BUDGET_SHARE: {
    family: "game",
    unit: "ratio",
    origin: "productDecision",
    basis: "Share of scaled recurring revenue in the opening budget, decided 2026-09-12.",
    evidence: [OPENING_BUDGET_FIT],
    dependsOn: ["MONEY_SCALE_PLN_PER_GAME_MILLION"],
  },
  USEFUL_UPGRADE_OVR_DELTA: {
    family: "game",
    unit: "ovr",
    origin: "productDecision",
    basis:
      "Sizes the cost of a representative useful upgrade (price plus wages) in the opening budget, decided 2026-09-12; delta 2 leaves five clubs on the floor.",
    evidence: [OPENING_BUDGET_FIT],
    dependsOn: [...WAGE_CURVE, ...VALUE_CURVE, "MIN_INITIAL_BUDGET", "INITIAL_BUDGET_SHARE"],
  },
  STRONG_BACKER_PERCENTILE: {
    family: "game",
    unit: "ratio",
    origin: "productDecision",
    basis:
      "Percentile of the eighteen share budgets taken at INITIAL_BUDGET_SHARE, decided 2026-09-12.",
    evidence: [],
    dependsOn: ["INITIAL_BUDGET_SHARE"],
  },
  ACTIVE_BACKER_PERCENTILE: {
    family: "game",
    unit: "ratio",
    origin: "productDecision",
    basis:
      "Percentile of the eighteen share budgets taken at INITIAL_BUDGET_SHARE, decided 2026-09-12.",
    evidence: [],
    dependsOn: ["INITIAL_BUDGET_SHARE"],
  },
  BOARD_REINVESTMENT_RATE: {
    family: "game",
    unit: "ratio",
    origin: "productDecision",
    basis:
      "Share of the season's operating balance passed to the transfer budget, a gameplay decision of 2026-09-12, not an optimum of the Pareto front.",
    evidence: [OPENING_BUDGET_ACTIVATION],
    dependsOn: [],
  },
  PUCHAR_POLSKI_PREMIA: {
    family: "game",
    unit: "gameMillionEur",
    origin: "preActivation",
    basis:
      "Prototype 1.4, never repriced. PZPN's 2025/26 rules award the winner 5 mln PLN net, about 0.32 at the current game scale. This comparison is a calibration warning, not an approved replacement: step 9 must measure gameplay and score effects.",
    evidence: [FINANCE_ACTIVATION],
    externalSources: [
      "https://www.pzpn.pl/public/system/files/site_content/635/6577-Regulamin%20Pucharu%20Polski%202025-2026.pdf",
    ],
    dependsOn: [],
  },
  SUPERPUCHAR_PREMIA: {
    family: "game",
    unit: "gameMillionEur",
    origin: "preActivation",
    basis:
      "First approximation 0.3, never repriced. Its real-world cash award is not established here by a primary PZPN source. Step 9 must research the applicable edition and measure gameplay before any change.",
    evidence: [],
    dependsOn: [],
  },
  EUROPEAN_PRIZE_MONEY: {
    family: "game",
    unit: "gameMillionEur",
    origin: "preActivation",
    basis:
      "Simplified cup-stage payouts fitted to pre-activation budgets, never repriced. UEFA's 2024-27 equal league-phase shares are 18.62 / 4.31 / 3.17 mln EUR, but this game's stage payout is not identical to that isolated component. Step 9 must compare total simulated campaigns and gameplay, not substitute the equal shares directly.",
    evidence: [],
    externalSources: [
      "https://www.uefa.com/running-competitions/financial-distribution/mens-competitions/",
    ],
    dependsOn: [],
  },
  VERDICT_KASA: {
    family: "game",
    unit: "pointsPerGameMillionEur",
    origin: "unitConversion",
    basis:
      "16.55 / 0.87: the historical product over the median cash at handover of 18 000 controlled careers, reconverted 2026-09-12.",
    evidence: [OPENING_BUDGET_ACTIVATION, FINANCE_ACTIVATION, LEGACY_UNIT_BASELINE],
    dependsOn: CONTROLLED_CASH,
  },
  LEGACY_KASA: {
    family: "game",
    unit: "pointsPerGameMillionEur",
    origin: "unitConversion",
    basis:
      "16.55 / 0.92: the historical product over the median cash after the epilogue of 18 000 controlled careers, reconverted 2026-09-12.",
    evidence: [OPENING_BUDGET_ACTIVATION, LEGACY_UNIT_BASELINE],
    dependsOn: CONTROLLED_CASH,
  },
  LEGACY_WARTOSC_KADRY: {
    family: "realEuro",
    unit: "pointsPerRealMillionEur",
    origin: "unitConversion",
    basis:
      "Historical product / median wartoscKadryMoj of 234 000 active careers, 2026-09-10; prices a squad valued by the real-euro value curve. The denominator was measured under the game budgets of 2026-09-10, but this constant is deliberately not linked to the game scale, because the unit of marketValue did not change; a budget change that shifts what players buy would still warrant remeasuring it.",
    evidence: [FINANCE_ACTIVATION, LEGACY_UNIT_BASELINE],
    dependsOn: [...VALUE_CURVE, "MIN_MARKET_VALUE"],
  },
  WOLNY_WAGE_PREMIUM: {
    family: "game",
    unit: "ratio",
    origin: "fitted",
    basis:
      "1 + target / unitShare, where unitShare is two seasons of wage over a fee anchored in real euro, over the 2026-09-07 cohort. Moves whenever either curve does.",
    evidence: [MONEY_SCALE_FIT],
    dependsOn: [...WAGE_CURVE, ...VALUE_CURVE],
  },
  MAX_DOMESTIC_FEE: {
    family: "realEuro",
    unit: "realMillionEur",
    origin: "measured",
    basis:
      "Record fee paid by an Ekstraklasa club to a foreign seller (Bukari, Austin FC to Widzew: 5 mln EUR in the source, 5.5 mln by other reports it cites; the game takes 5.50); the soft cap's floor. Not MAX_INTRA_LEAGUE_FEE.",
    evidence: [],
    externalSources: [
      "https://transfery.info/aktualnosci/2-miliony-euro-to-minimum-tak-wyglada-lista-najdrozszych-transferow-w-ekstraklasie/267051",
    ],
    dependsOn: [],
  },
  MAX_FOREIGN_FEE: {
    family: "realEuro",
    unit: "realMillionEur",
    origin: "measured",
    basis: "Record sale out of the Ekstraklasa, 11 mln EUR.",
    evidence: ["docs/decisions/foreign-buyer-tiers.md"],
    externalSources: [
      "https://gol24.pl/transfery-rekordowy-transfer-jakuba-modera-do-brighton-lech-dostanie-11-mln-euro-i-roczne-wypozyczenie/ar/c2-15215028",
    ],
    dependsOn: [],
  },
  MAX_UNHAGGLED_FOREIGN_FEE: {
    family: "realEuro",
    unit: "realMillionEur",
    origin: "derivedInCode",
    basis: "MAX_FOREIGN_FEE / (1 + HAGGLE_SALE_BONUS).",
    evidence: [],
    dependsOn: ["MAX_FOREIGN_FEE", "HAGGLE_SALE_BONUS"],
  },
  FOREIGN_FEE_SOFT_KNEE: {
    family: "realEuro",
    unit: "realMillionEur",
    origin: "fitted",
    basis:
      "Chosen from the feasible band 5.50-6.95 by the value-curve joint fit, under MAX_DOMESTIC_FEE <= knee < MAX_UNHAGGLED_FOREIGN_FEE. The upper end of the band comes from the offer-spread test after buyer qualification, so it also depends on the buyer tiers and the raw-price deviation.",
    evidence: [VALUE_CURVE_FIT],
    dependsOn: [
      "MAX_DOMESTIC_FEE",
      "MAX_UNHAGGLED_FOREIGN_FEE",
      "MARKET_VALUE_MAX",
      "MARKET_VALUE_SLOPE",
      "MARKET_VALUE_MIDPOINT",
      "MARKET_VALUE_AGE_SHIFTS",
      "FOREIGN_TIER_TERMS",
      "SALE_PRICE_DEVIATION_MIN",
      "SALE_PRICE_DEVIATION_MAX",
    ],
  },
  EUR_PLN_SOURCE_SEASON: {
    family: "realEuro",
    unit: "plnPerEur",
    origin: "measured",
    basis:
      "Mean NBP table-A mid rate over the manifest's source financial year, 251 publications. Read only by the buyer's capacity; must never reach revenue, wages, budgets or legacy.",
    evidence: ["scripts/data/nbp-eur-2024-07-2025-06.json"],
    dependsOn: [],
  },
  BUYER_CAPACITY_REVENUE_SHARE: {
    family: "realEuro",
    unit: "ratio",
    origin: "designAssumption",
    basis:
      "Share of real annual revenue that a domestic buyer may devote to one transfer. The share is independent of the NBP exchange rate; buyer capacity uses both separately. Deliberately not INITIAL_BUDGET_SHARE.",
    evidence: [BUYER_CAPACITY],
    dependsOn: [],
  },
  MAX_INTRA_LEAGUE_FEE: {
    family: "realEuro",
    unit: "realMillionEur",
    origin: "measured",
    basis:
      "Record fee between two Polish clubs: Kapuadi, Legia to Widzew, winter 2026, 2.0 mln EUR.",
    evidence: [BUYER_CAPACITY],
    dependsOn: [],
  },
  DOMESTIC_BUYER_FACTOR_MIN: {
    family: "realEuro",
    unit: "ratio",
    origin: "designAssumption",
    basis:
      "Lower end of the domestic buyerFactor band, linear in log revenue over the 36 manifest clubs.",
    evidence: [],
    dependsOn: [],
  },
  DOMESTIC_BUYER_FACTOR_MAX: {
    family: "realEuro",
    unit: "ratio",
    origin: "designAssumption",
    basis:
      "Upper end of the domestic buyerFactor band, linear in log revenue over the 36 manifest clubs.",
    evidence: [],
    dependsOn: [],
  },
  FOREIGN_TIER_TERMS: {
    family: "realEuro",
    unit: { buyerFactor: "ratio", maxSpend: "realMillionEur" },
    origin: "designAssumption",
    basis:
      "Composite: each tier has buyerFactor (ratio) and maxSpend (real mln EUR); the top tier's maxSpend is MAX_FOREIGN_FEE.",
    evidence: ["docs/decisions/foreign-buyer-tiers.md"],
    dependsOn: ["MAX_FOREIGN_FEE"],
  },
};

export const NOT_MONETARY: Readonly<Partial<Record<BalanceExportName, NotMonetaryReason>>> = {
  SEZONY_GRY: "noMoney",
  SEZONY_EPILOGU: "noMoney",
  VERDICT_TROFEUM: "noMoney",
  VERDICT_SPADEK: "noMoney",
  PROGI_WERDYKTU: "noMoney",
  LEGACY_SPADEK: "noMoney",
  LEGACY_PUCHAR: "noMoney",
  LEGACY_MISTRZOSTWO: "noMoney",
  PROGI_DZIEDZICTWA: "noMoney",
  EUROPEAN_ADVANCE_ODDS: "noMoney",
  BENCH_WEIGHT: "noMoney",
  CZAS_BAZOWY: "noMoney",
  CZAS_DODATKOWY: "noMoney",
  MAX_PRZECIAGNIEC: "noMoney",
  KARA_CENA: "relativeMultiplier",
  KARA_SPRZEDAZ: "relativeMultiplier",
  KARA_PLACA: "relativeMultiplier",
  SQUAD_BENCH_BUFFER: "noMoney",
  ACADEMY_CEILING_CLUB_REFERENCE: "noMoney",
  ACADEMY_CEILING_CLUB_FACTOR: "noMoney",
  OFFER_SOURCE_CLUB_REFERENCE: "noMoney",
  OFFER_SOURCE_CLUB_FACTOR: "noMoney",
  LOWER_LEAGUE_SOURCE_SHARE: "noMoney",
  HAGGLE_ODDS: "noMoney",
  HAGGLE_MARKET_SHIFT: "noMoney",
  HAGGLE_FEE_DISCOUNT: "relativeMultiplier",
  HAGGLE_WAGE_DISCOUNT: "relativeMultiplier",
  HAGGLE_SALE_BONUS: "relativeMultiplier",
  SALE_PRICE_DEVIATION_MIN: "relativeMultiplier",
  SALE_PRICE_DEVIATION_MAX: "relativeMultiplier",
  PURCHASE_PRICE_CAP: "relativeMultiplier",
  EXTENSION_MIN_AGE: "noMoney",
  EXTENSION_MIN_TENURE: "noMoney",
  EXTENSION_WAGE_ASK_MIN: "relativeMultiplier",
  EXTENSION_WAGE_ASK_MAX: "relativeMultiplier",
  AGE_GROWTH_MIN: "noMoney",
  AGE_GROWTH_MAX: "noMoney",
  AGE_DECLINE_JITTER: "noMoney",
  AGE_OVR_FLOOR: "noMoney",
  RETIREMENT_OVR: "noMoney",
  AGE_PROFILE_DEFAULT: "noMoney",
  AGE_PROFILES: "noMoney",
  STARTING_SQUAD_HEADROOM: "noMoney",
  STARTING_SQUAD_XI_AGE: "noMoney",
  STARTING_SQUAD_BENCH_AGE_BANDS: "noMoney",
  STARTING_XI_OVR_BONUS: "noMoney",
  STARTING_BENCH_OVR_BONUS: "noMoney",
  FORM_UP_ODDS: "noMoney",
  FORM_ROTATION_SLOTS: "noMoney",
  FORM_PENALTY_FLOOR: "noMoney",
  MATCH_BASE_GOALS: "noMoney",
  MATCH_HOME_ADVANTAGE: "noMoney",
  POSITION_WEIGHTS: "noMoney",
  RATING_OVR_REFERENCE: "noMoney",
  RATING_OVR_SCALE: "noMoney",
  AGE_STRENGTH_SLOPE: "noMoney",
  MARKET_EDGE_IMPACT_MULTIPLIER: "noMoney",
  PROMOTION_WEIGHT_T: "noMoney",
  RELEGATED_COUNT: "noMoney",
  PROMOTION_BONUS: "noMoney",
  RELEGATION_PENALTY: "noMoney",
};

/**
 * Every classified money constant that depends on `name`, directly or
 * through other entries: the list to revisit when `name` moves. Sorted, and
 * without `name` itself. The test pins that dependsOn has no cycle.
 */
export const moneyDependentsOf = (name: BalanceExportName): readonly BalanceExportName[] => {
  const entries = Object.entries(MONEY_CONSTANTS) as [BalanceExportName, MoneyConstant][];
  const directDependents = (target: BalanceExportName): readonly BalanceExportName[] =>
    entries.filter(([, entry]) => entry.dependsOn.includes(target)).map(([dependent]) => dependent);
  const collect = (
    frontier: readonly BalanceExportName[],
    found: ReadonlySet<BalanceExportName>
  ): ReadonlySet<BalanceExportName> => {
    const next = [...new Set(frontier.flatMap(directDependents))].filter(
      (dependent) => !found.has(dependent)
    );
    return next.length === 0 ? found : collect(next, new Set([...found, ...next]));
  };
  return [...collect([name], new Set())].filter((dependent) => dependent !== name).sort();
};
