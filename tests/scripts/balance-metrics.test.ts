import { describe, expect, test } from "vitest";

import { LEGACY_KASA, LEGACY_SPADEK, LEGACY_WARTOSC_KADRY } from "../../src/data/balance";
import type { LegacyBreakdown, Offer } from "../../src/data/types";
import type { PlayResult } from "../../src/logic/simulate";
import type { TraceEvent } from "../../src/logic/trace-format";
import { aggregateCell, extractSales } from "../../scripts/balance-metrics";
import type { GameMetrics } from "../../scripts/balance-metrics";

const CLUB_ID = "widzew-lodz";

const makeGameMetric = (
  seed: number,
  clubId: string,
  policyName: string,
  overrides: Partial<GameMetrics> = {}
): GameMetrics => ({
  seed,
  clubId,
  klub: "Widzew",
  policyName,
  tytul: "TEST",
  werdyktTytul: "TEST_VERDICT",
  spadek: false,
  mistrzostwa: 0,
  puchary: 0,
  udzialBierz: 50,
  wynikRozklad: {},
  miejsceSezony: [5, 5, 5, 5, 5],
  miejsceEpilog: [5, 5, 5, 5, 5],
  sezonyLM: 0,
  sezonyLE: 0,
  sezonyLK: 0,
  kasaEuro: 0,
  sezonyRozegrane: 5,
  offerCounts: { KUPNO: 0, SPRZEDAZ: 0, PRZEDLUZENIE: 0, WOLNY: 0, PANIC: 0 },
  signingCount: 0,
  rngDrawCount: 1000 + seed,
  // Defaults with increment pattern
  dziedzictwo: 500 + seed * 50,
  kasaKoncowa: 5 + seed * 5,
  ocenaKadencji: 4 + seed,
  squadSizeAtHandover: 13 + seed * 2,
  squadSizeEnd: 12 + seed,
  breakdown: {
    pktA: 90 + seed * 10,
    pktB: 40 + seed * 10,
    trofea: 0,
    kasa: 5 + seed * 5,
    wartoscKadry: 90 + seed * 10,
    wartoscKadryMoj: 40 + seed * 10,
    spadki: 0,
    squadSizeAtHandover: 13 + seed * 2,
    squadSizeEnd: 12 + seed,
  } as LegacyBreakdown,
  ...overrides,
});

describe("aggregateCell - a cell nobody's career survived", () => {
  /**
   * Relegation ends a tenure on the spot, so a career can finish before the
   * epilogue ever runs - and a whole cell can consist of nothing else at a
   * weak club. mean() throws on an empty array, so averaging the epilogue
   * places of a cell where none exist would take the simulator down on a
   * perfectly legitimate sample.
   */
  test("reports no epilogue average instead of throwing", () => {
    const games: GameMetrics[] = [1, 2, 3].map((seed) => ({
      ...makeGameMetric(seed, CLUB_ID, "test"),
      miejsceEpilog: [],
    }));

    const result = aggregateCell(CLUB_ID, "test", games);

    expect(result.miejsceEpilogMean).toBeNull();
    // Everything else still aggregates: the missing sample is one column.
    expect(result.squadSizeAtHandoverMedian).toBe(17);
  });

  test("still averages when at least one career reached the epilogue", () => {
    const games: GameMetrics[] = [
      { ...makeGameMetric(1, CLUB_ID, "test"), miejsceEpilog: [] },
      { ...makeGameMetric(2, CLUB_ID, "test"), miejsceEpilog: [8, 8] },
      { ...makeGameMetric(3, CLUB_ID, "test"), miejsceEpilog: [] },
    ];

    const result = aggregateCell(CLUB_ID, "test", games);

    expect(result.miejsceEpilogMean).toBe(8);
  });
});

describe("aggregateCell - squad size metrics", () => {
  test("computes medians of squad size at season 5 and epilogue end", () => {
    // Create synthetic GameMetrics with known squad sizes
    const games: GameMetrics[] = [
      makeGameMetric(1, CLUB_ID, "test"),
      makeGameMetric(2, CLUB_ID, "test"),
      makeGameMetric(3, CLUB_ID, "test"),
    ];

    const result = aggregateCell(CLUB_ID, "test", games);

    // Medians: [15, 17, 19] -> 17, and [13, 14, 15] -> 14
    expect(result.squadSizeAtHandoverMedian).toBe(17);
    expect(result.squadSizeEndMedian).toBe(14);
  });
});

describe("aggregateCell - legacy breakdown weights", () => {
  /**
   * The breakdown columns must use the engine's own LEGACY_* weights, not
   * copies of them.
   *
   * They used to be inline literals: kasa * 5, wartoscKadry * 2, spadki * 60.
   * Two survived by luck; the third did not. When LEGACY_SPADEK went to zero
   * the report kept charging 60 points a relegation, and a 42 000-game report
   * shipped showing a career worth 73.5 carrying a 60-point penalty it had
   * never paid. Nothing caught it, because the fixture here never relegated
   * anyone and no test asserted on the breakdown at all.
   */
  test("weights the components the way the legacy formula does", () => {
    const games = [
      makeGameMetric(1, CLUB_ID, "test", {
        breakdown: {
          pktA: 100,
          pktB: 40,
          trofea: 0,
          kasa: 10,
          wartoscKadry: 90,
          wartoscKadryMoj: 30,
          spadki: 2,
          squadSizeAtHandover: 13,
          squadSizeEnd: 12,
        } as LegacyBreakdown,
      }),
    ];

    const { breakdownMedian } = aggregateCell(CLUB_ID, "test", games);

    expect(breakdownMedian.kasa).toBe(10 * LEGACY_KASA);
    // The formula counts the manager's own signings, so must this column.
    expect(breakdownMedian.wartoscKadryMoj).toBe(30 * LEGACY_WARTOSC_KADRY);
    expect(breakdownMedian.spadki).toBe(2 * LEGACY_SPADEK);
  });

  test("charges nothing for relegation while LEGACY_SPADEK is zero", () => {
    // Deliberately separate from the test above and deliberately not written
    // as `2 * LEGACY_SPADEK`: this one is about the number the report prints,
    // and it should have to be rewritten by hand if the penalty ever returns.
    const games = [
      makeGameMetric(1, CLUB_ID, "test", {
        breakdown: {
          pktA: 60,
          pktB: 10,
          trofea: 0,
          kasa: 1,
          wartoscKadry: 20,
          wartoscKadryMoj: 5,
          spadki: 3,
          squadSizeAtHandover: 13,
          squadSizeEnd: 12,
        } as LegacyBreakdown,
      }),
    ];

    expect(aggregateCell(CLUB_ID, "test", games).breakdownMedian.spadki).toBe(0);
  });
});

describe("extractSales", () => {
  const decision = (
    index: number,
    akcje: string[],
    wynik: string,
    cenaKoncowa: number
  ): Extract<TraceEvent, { type: "decision" }> => ({
    type: "decision",
    index,
    kartaTyp: "SPRZEDAZ",
    poz: "ŚP",
    ovr: 65,
    wiek: 25,
    ceiling: 70,
    cena: cenaKoncowa,
    akcje,
    wynik,
    cenaKoncowa,
    kasa: 1,
    season: 1,
    payrollBefore: 1,
    payrollAfter: 1,
    signedPlayerId: null,
    signedAnnualWage: null,
    signedBaseAnnualWage: null,
    buyer: "legia-warszawa",
  });

  const makeResult = (events: TraceEvent[]): PlayResult => ({
    seed: 1,
    clubId: "legia-warszawa",
    akcje: [],
    state: { trace: events } as unknown as PlayResult["state"],
    events,
  });

  const card = (cena: number): Offer =>
    ({
      cena,
      buyer: { clubId: "legia-warszawa", name: "Legia", origin: "domestic" },
    }) as unknown as Offer;

  test("a passed card has a null realised fee", () => {
    const cards = new Map<number, Offer>([[1, card(0.5)]]);
    const result = makeResult([decision(1, ["PAS"], "OK", 0.5)]);
    const [sale] = extractSales(result, "mixed", cards);
    expect(sale!.offerPrice).toBe(0.5);
    expect(sale!.realisedFee).toBeNull();
  });

  test("a taken card is realised at the asking price", () => {
    const cards = new Map<number, Offer>([[2, card(0.7)]]);
    const result = makeResult([decision(2, ["BIERZ"], "OK", 0.7)]);
    const [sale] = extractSales(result, "mixed", cards);
    expect(sale!.realisedFee).toBe(0.7);
  });

  test("a lost haggle has a null realised fee even though the price is stalled", () => {
    const cards = new Map<number, Offer>([[3, card(1.0)]]);
    const result = makeResult([decision(3, ["CZAS", "TARG"], "PRZEPADL", 1.0)]);
    const [sale] = extractSales(result, "mixed", cards);
    expect(sale!.offerPrice).toBe(1.0);
    expect(sale!.realisedFee).toBeNull();
  });

  test("a won haggle is realised at the haggled amount", () => {
    const cards = new Map<number, Offer>([[4, card(1.05)]]);
    const result = makeResult([decision(4, ["TARG"], "UTARG_KWOTA", 1.26)]);
    const [sale] = extractSales(result, "mixed", cards);
    expect(sale!.offerPrice).toBe(1.05);
    expect(sale!.realisedFee).toBe(1.26);
  });

  test("offerPrice comes from the observed card, never from the event's own cena", () => {
    // The event's cena is already post-stall; the card map holds the
    // pre-stall asking price, and the two must never be confused.
    const cards = new Map<number, Offer>([[5, card(2.0)]]);
    const result = makeResult([decision(5, ["BIERZ"], "OK", 1.5)]);
    const [sale] = extractSales(result, "mixed", cards);
    expect(sale!.offerPrice).toBe(2.0);
    expect(sale!.realisedFee).toBe(1.5);
  });

  test("throws when a decision has no observed card", () => {
    const result = makeResult([decision(9, ["PAS"], "OK", 0.1)]);
    expect(() => extractSales(result, "mixed", new Map())).toThrow(/No observed card/);
  });

  test("ignores non-SPRZEDAZ decisions", () => {
    const kupno: Extract<TraceEvent, { type: "decision" }> = {
      ...decision(1, ["BIERZ"], "OK", 1),
      kartaTyp: "KUPNO",
    };
    const cards = new Map<number, Offer>([[1, card(1)]]);
    expect(extractSales(makeResult([kupno]), "mixed", cards)).toEqual([]);
  });
});
