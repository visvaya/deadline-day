import type { GameState, Offer } from "../src/data/types";
import { ENGINE_REVISION } from "../src/logic/engine-version";
import { zaokr } from "../src/logic/format";
import type { IncomeMode } from "../src/logic/income-mode";
import { openingBudgetComponentsForClub } from "../src/logic/opening-budget";
import type { PlayResult } from "../src/logic/simulate";
import { isOwnStar } from "../src/logic/simulate-policies";
import { formationOf } from "../src/logic/squad";
import type { TraceEvent } from "../src/logic/trace-format";
import { isConcludedSale } from "./balance-metrics";
import { classifyExternalCard, type CardView } from "./dilemma-card";

/**
 * One card observed by simulateGame's onCard hook, on the way to a per-career
 * dilemma summary. Only the fields the observer needs are kept - the squad is
 * copied once here, and never a reference into the live GameState, so a stale
 * ObservedCard can outlive the state it was read from.
 */
export type ObservedCard = {
  readonly decisionIndex: number;
  readonly windowStep: number;
  readonly card: Offer;
  readonly view: CardView;
};

export const observeCard = (
  card: Offer,
  decisionIndex: number,
  state: GameState
): ObservedCard => ({
  decisionIndex,
  windowStep: state.krok,
  card,
  view: {
    kasa: state.kasa,
    squad: [...state.kadra],
    formation: formationOf(state),
  },
});

const EXTERNAL_CARD_TYPES = new Set(["KUPNO", "PANIC", "WOLNY"]);
const PAID_EXTERNAL_CARD_TYPES = new Set(["KUPNO", "PANIC"]);

/**
 * Column order of the dilemma dump. `dilemmaSchemaVersion` is the new
 * format's own version, independent of `DUMP_SCHEMA_VERSION` in
 * balance-metrics.ts - the two files evolve on their own schedules.
 */
export const DILEMMA_COLUMNS = [
  "dilemmaSchemaVersion",
  "engineVersion",
  "incomeMode",
  "clubId",
  "policyName",
  "seed",
  "usefulPurchaseCost",
  "externalCards",
  "paidExternalCards",
  "externalAffordable",
  "externalStrengthening",
  "externalAffordableStrengthening",
  "atPriceCapCards",
  "windows",
  "windowsUnderPressure",
  "salesAccepted",
  "pressureSales",
  "ownStarSaleCards",
  "ownStarSalesAccepted",
  "firstWindowKupno",
  "firstWindowUsefulKupno",
  "firstWindowUsefulAffordableKupno",
  "firstWindowUsefulHaggleAffordableKupno",
] as const;

export const DILEMMA_SCHEMA_VERSION = 1;

export type DilemmaCareer = {
  dilemmaSchemaVersion: number;
  engineVersion: string;
  incomeMode: IncomeMode;
  clubId: string;
  policyName: string;
  seed: number;
  usefulPurchaseCost: number;
  /**
   * KUPNO, PANIC and WOLNY cards, per classifyExternalCard's own contract.
   * paidExternalCards and atPriceCapCards count only KUPNO and PANIC, so a
   * zero-price WOLNY never dilutes the affordability rate of a paid offer -
   * report both shares (of externalCards and of paidExternalCards) rather
   * than picking one denominator.
   */
  externalCards: number;
  paidExternalCards: number;
  externalAffordable: number;
  externalStrengthening: number;
  externalAffordableStrengthening: number;
  atPriceCapCards: number;
  /** Count of distinct windowStep values the career saw a card in. */
  windows: number;
  /** Windows whose FIRST card was shown with kasa below usefulPurchaseCost. */
  windowsUnderPressure: number;
  /** SPRZEDAZ decisions isConcludedSale calls concluded. */
  salesAccepted: number;
  /**
   * Concluded sales that crossed the fixed usefulPurchaseCost threshold: cash
   * before the sale was below it, cash after (before + the realised fee) was
   * at or above it. A counter of sales exceeding a fixed opening-window cost
   * threshold, not evidence the sale was necessary or that the threshold
   * still matches a since-changed squad.
   */
  pressureSales: number;
  /** SPRZEDAZ cards offering one of the manager's own top-OWN_STAR_RANK
   * players, per isOwnStar - visible inputs only, never the ceiling. */
  ownStarSaleCards: number;
  ownStarSalesAccepted: number;
  /** Restricted to KUPNO cards observed at the career's first window - the
   * smallest windowStep among ALL observed cards, not only KUPNO ones, so a
   * first window without any KUPNO card counts as zero rather than being
   * skipped in favour of a later window. Useful means strengthens;
   * Affordable / HaggleAffordable are the matching classifyExternalCard
   * fields. */
  firstWindowKupno: number;
  firstWindowUsefulKupno: number;
  firstWindowUsefulAffordableKupno: number;
  firstWindowUsefulHaggleAffordableKupno: number;
};

export const extractDilemmaCareer = (
  result: PlayResult,
  policyName: string,
  cards: readonly ObservedCard[],
  incomeMode: IncomeMode
): DilemmaCareer => {
  const cardsByIndex = new Map(cards.map((observed) => [observed.decisionIndex, observed]));
  const decisions = result.state.trace.filter(
    (event): event is Extract<TraceEvent, { type: "decision" }> => event.type === "decision"
  );

  // Read through the club-facing opening-budget adapter, never the parametric
  // model underneath it directly: a guard test in tests/logic pins that
  // model's only runtime door to the adapter, and this is exactly the
  // adapter's own usefulPurchaseCost component.
  const usefulPurchaseCost = openingBudgetComponentsForClub(result.clubId).usefulPurchaseCost;

  let externalCards = 0;
  let paidExternalCards = 0;
  let externalAffordable = 0;
  let externalStrengthening = 0;
  let externalAffordableStrengthening = 0;
  let atPriceCapCards = 0;
  let salesAccepted = 0;
  let pressureSales = 0;
  let ownStarSaleCards = 0;
  let ownStarSalesAccepted = 0;
  const windowSteps = new Set<number>();
  const windowsUnderPressureSteps = new Set<number>();

  for (const event of decisions) {
    const observed = cardsByIndex.get(event.index);
    if (observed === undefined) {
      throw new Error(`No observed card for decision ${event.index} (seed=${result.seed})`);
    }
    const { card, view, windowStep } = observed;

    // The window's own pressure reading is fixed by its FIRST card, in trace
    // order - decisions are pushed chronologically, so the first time a
    // windowStep is seen here is the window's first card.
    if (!windowSteps.has(windowStep)) {
      windowSteps.add(windowStep);
      if (view.kasa < usefulPurchaseCost) windowsUnderPressureSteps.add(windowStep);
    }

    if (EXTERNAL_CARD_TYPES.has(card.typ)) {
      const cls = classifyExternalCard(view, card);
      externalCards += 1;
      if (cls.affordable) externalAffordable += 1;
      if (cls.strengthens) externalStrengthening += 1;
      if (cls.affordable && cls.strengthens) externalAffordableStrengthening += 1;
      if (PAID_EXTERNAL_CARD_TYPES.has(card.typ)) {
        paidExternalCards += 1;
        if (cls.atPriceCap) atPriceCapCards += 1;
      }
    }

    if (card.typ === "SPRZEDAZ") {
      const isStar = isOwnStar(view.squad, card.zawodnik);
      if (isStar) ownStarSaleCards += 1;
      if (isConcludedSale(event)) {
        salesAccepted += 1;
        if (isStar) ownStarSalesAccepted += 1;
        const kasaPrzed = view.kasa;
        if (kasaPrzed < usefulPurchaseCost && usefulPurchaseCost <= kasaPrzed + event.cenaKoncowa) {
          pressureSales += 1;
        }
      }
    }
  }

  // The career's first window is the smallest windowStep among ALL observed
  // cards, not only KUPNO ones - a career whose earliest window had no KUPNO
  // card at all must still be judged on that earliest window (with zero
  // KUPNO cards), never on a later window that happened to carry one.
  const firstWindowStep =
    cards.length > 0 ? Math.min(...cards.map((observed) => observed.windowStep)) : null;
  const kupnoCards = cards.filter((observed) => observed.card.typ === "KUPNO");
  const firstWindowKupnoCards =
    firstWindowStep === null
      ? []
      : kupnoCards.filter((observed) => observed.windowStep === firstWindowStep);

  let firstWindowUsefulKupno = 0;
  let firstWindowUsefulAffordableKupno = 0;
  let firstWindowUsefulHaggleAffordableKupno = 0;
  for (const observed of firstWindowKupnoCards) {
    const cls = classifyExternalCard(observed.view, observed.card);
    if (!cls.strengthens) continue;
    firstWindowUsefulKupno += 1;
    if (cls.affordable) firstWindowUsefulAffordableKupno += 1;
    if (cls.affordableWithHaggle) firstWindowUsefulHaggleAffordableKupno += 1;
  }

  return {
    dilemmaSchemaVersion: DILEMMA_SCHEMA_VERSION,
    engineVersion: ENGINE_REVISION,
    incomeMode,
    clubId: result.clubId,
    policyName,
    seed: result.seed,
    usefulPurchaseCost: zaokr(usefulPurchaseCost, 4),
    externalCards,
    paidExternalCards,
    externalAffordable,
    externalStrengthening,
    externalAffordableStrengthening,
    atPriceCapCards,
    windows: windowSteps.size,
    windowsUnderPressure: windowsUnderPressureSteps.size,
    salesAccepted,
    pressureSales,
    ownStarSaleCards,
    ownStarSalesAccepted,
    firstWindowKupno: firstWindowKupnoCards.length,
    firstWindowUsefulKupno,
    firstWindowUsefulAffordableKupno,
    firstWindowUsefulHaggleAffordableKupno,
  };
};
