import { expect, test } from "vitest";

import type { GameState, Offer, OfferType } from "../../src/data/types";
import { HAGGLE_WAGE_DISCOUNT } from "../../src/data/balance";
import {
  extensionMessage,
  freeAgentSigningMessage,
  HAGGLE_WON,
  insufficientFundsMessage,
  purchaseMessage,
  saleMessage,
} from "../../src/logic/decision-messages";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { buyPrice, marketHaggleShift } from "../../src/logic/offers";
import { baseWage } from "../../src/logic/wages";
import { makeTestPlayer, quietMarket, testCareerBaseline, testClub } from "./fixtures";

/**
 * "Albo lepiej, albo przepada": every haggle either improves a term or loses the offer - no more
 * "no change" outcome, and each offer type only ever produces its own
 * declared set of outcomes.
 */

const OWN_PLAYER_TYPES: OfferType[] = ["SPRZEDAZ", "PRZEDLUZENIE"];

const makeOffer = (typ: OfferType): Offer => ({
  typ,
  zawodnik: makeTestPlayer("target", {
    moj: typ === "SPRZEDAZ",
    wiek: 24,
    kontraktOd: 0,
  }),
  cena: typ === "WOLNY" ? 0 : 1.0,
  sourceClub: null,
  buyer: typ === "SPRZEDAZ" ? { clubId: "lech-poznan", name: "Lech", origin: "domestic" } : null,
  staffAssessment: {
    source: "scout",
    focus: "potential",
    outlook: "leagueLevel",
    confidence: "medium",
    isFirstObservation: true,
  },
  analystReport: {
    metrics: [
      { metricId: "goalsPreventedPer90", percentile: 50, value: 0 },
      { metricId: "positioningErrorAverage", percentile: 50, value: 2.06 },
    ],
    minutes: 900,
    sampleTier: "medium",
    period: { season: 1, window: "summer" },
    contextTier: "mid",
  },
});

const stateFor = (typ: OfferType, seed: number): GameState => ({
  ...initialState(),
  faza: "okno",
  club: testClub,
  careerBaseline: testCareerBaseline,
  kadra: OWN_PLAYER_TYPES.includes(typ) ? [makeOffer(typ).zawodnik] : [],
  kasa: 100,
  rynek: quietMarket,
  // Last card of the window - no follow-up card is drawn, so an empty kadra
  // for non-SPRZEDAZ offer types never crashes nastepnaKarta's own draw.
  ruchy: 1,
  karta: makeOffer(typ),
  rngState: seed,
});

/** Retries seeds until the haggle produces the requested wynik. */
const haggleUntil = (typ: OfferType, wynik: string, maxSeed = 3000): GameState => {
  for (let seed = 0; seed < maxSeed; seed += 1) {
    const after = gameReducer(stateFor(typ, seed), { type: "DECIDE", choice: "haggle" });
    const lastDecision = [...after.trace].reverse().find((e) => e.type === "decision");
    if (lastDecision?.type === "decision" && lastDecision.wynik === wynik) return after;
  }
  throw new Error(`No seed under ${maxSeed} produced wynik "${wynik}" for ${typ}`);
};

const OUTCOMES: Record<OfferType, string[]> = {
  KUPNO: ["UTARG_KWOTA", "UTARG_PLACA", "PRZEPADL"],
  PANIC: ["UTARG_KWOTA", "UTARG_PLACA", "PRZEPADL"],
  SPRZEDAZ: ["UTARG_KWOTA", "PRZEPADL"],
  WOLNY: ["UTARG_PLACA", "PRZEPADL"],
  PRZEDLUZENIE: ["UTARG_PLACA", "PRZEPADL"],
};

for (const [typ, outcomes] of Object.entries(OUTCOMES) as [OfferType, string[]][]) {
  test(`${typ} haggle only ever produces its declared outcomes`, () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 500; seed += 1) {
      const after = gameReducer(stateFor(typ, seed), { type: "DECIDE", choice: "haggle" });
      const lastDecision = [...after.trace].reverse().find((e) => e.type === "decision");
      if (lastDecision?.type === "decision") seen.add(lastDecision.wynik);
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const wynik of seen) expect(outcomes).toContain(wynik);
  });
}

test("a wage haggle permanently discounts the signed player's mnoznikPlacy", () => {
  const after = haggleUntil("KUPNO", "UTARG_PLACA");
  const signed = after.kadra.find((z) => z.poz === "LO");
  expect(signed).toBeDefined();
  expect(signed!.mnoznikPlacy).toBeCloseTo(1 - HAGGLE_WAGE_DISCOUNT, 6);
  // The wage is actually reduced, not just the multiplier field.
  expect(baseWage(signed!.ovr) * signed!.mnoznikPlacy).toBeLessThan(baseWage(signed!.ovr));
});

test("a fee haggle discounts the price but leaves mnoznikPlacy untouched", () => {
  const after = haggleUntil("KUPNO", "UTARG_KWOTA");
  const signed = after.kadra.find((z) => z.poz === "LO");
  expect(signed).toBeDefined();
  expect(signed!.mnoznikPlacy).toBe(1);
});

test("a lost sale haggle keeps the player in the squad", () => {
  const after = haggleUntil("SPRZEDAZ", "PRZEPADL");
  expect(after.kadra.some((z) => z.id === "target")).toBe(true);
});

test("market shift favours the buyer on obfity and the seller on pusty, mirrored for SPRZEDAZ", () => {
  // Buying-side offers: an obfity (glut) market makes the offer easier to
  // win (lower "lost" chance), a pusty (scarce) market makes it harder.
  expect(marketHaggleShift("KUPNO", "obfity")).toBeLessThan(0);
  expect(marketHaggleShift("KUPNO", "spokoj")).toBe(0);
  expect(marketHaggleShift("KUPNO", "pusty")).toBeGreaterThan(0);
  expect(marketHaggleShift("PANIC", "obfity")).toBeLessThan(0);
  expect(marketHaggleShift("WOLNY", "obfity")).toBeLessThan(0);
  expect(marketHaggleShift("PRZEDLUZENIE", "obfity")).toBeLessThan(0);
  // SPRZEDAZ is mirrored - a glutted market is a weak hand for the seller.
  expect(marketHaggleShift("SPRZEDAZ", "obfity")).toBeGreaterThan(0);
  expect(marketHaggleShift("SPRZEDAZ", "spokoj")).toBeCloseTo(0, 10);
  expect(marketHaggleShift("SPRZEDAZ", "pusty")).toBeLessThan(0);
});

/**
 * Every won haggle names the improvement and then the transaction it produced,
 * with the fee and the wage in the same money() form the rest of the UI uses.
 * The log line is also the notification text after a haggle (app.tsx), so a
 * raw "0.97 mln" or a missing wage reaches the player twice.
 */
const lastLog = (state: GameState): string => state.log[0]!;
const signedWage = (state: GameState): number => {
  const signed = state.kadra.find((z) => z.id === "target")!;
  return baseWage(signed.ovr) * signed.mnoznikPlacy;
};

test("a won fee haggle on a purchase logs the lower fee and the wage", () => {
  const after = haggleUntil("KUPNO", "UTARG_KWOTA");
  // 1.0 on the card, 0.8 after the -20% fee haggle.
  expect(lastLog(after)).toBe(
    `${HAGGLE_WON.lowerFee} ${purchaseMessage(makeOffer("KUPNO").zawodnik, 0.8, signedWage(after))}`
  );
});

test("a won wage haggle on a purchase logs the fee and the lower wage", () => {
  const after = haggleUntil("KUPNO", "UTARG_PLACA");
  expect(lastLog(after)).toBe(
    `${HAGGLE_WON.lowerWage} ${purchaseMessage(makeOffer("KUPNO").zawodnik, 1, signedWage(after))}`
  );
});

test("a won wage haggle on a free agent logs a signing, not a purchase", () => {
  const after = haggleUntil("WOLNY", "UTARG_PLACA");
  expect(lastLog(after)).toBe(
    `${HAGGLE_WON.lowerWage} ${freeAgentSigningMessage(makeOffer("WOLNY").zawodnik, signedWage(after))}`
  );
});

test("a won sale haggle logs the raised fee, the buyer and the wage leaving the payroll", () => {
  const after = haggleUntil("SPRZEDAZ", "UTARG_KWOTA");
  const player = makeOffer("SPRZEDAZ").zawodnik;
  // startsWith, not toBe: the sale may add an academy debutant sentence.
  expect(
    lastLog(after).startsWith(
      `${HAGGLE_WON.higherFee} ${saleMessage(player, 1.2, "Lech", baseWage(player.ovr))}`
    )
  ).toBe(true);
});

test("a won extension haggle logs the lowered wage", () => {
  const after = haggleUntil("PRZEDLUZENIE", "UTARG_PLACA");
  expect(lastLog(after)).toBe(
    `${HAGGLE_WON.lowerWage} ${extensionMessage(makeOffer("PRZEDLUZENIE").zawodnik, 0.8)}`
  );
});

test("no log amount uses a decimal point", () => {
  for (const [typ, wynik] of [
    ["KUPNO", "UTARG_KWOTA"],
    ["SPRZEDAZ", "UTARG_KWOTA"],
    ["PRZEDLUZENIE", "UTARG_PLACA"],
  ] as const) {
    expect(lastLog(haggleUntil(typ, wynik))).not.toMatch(/\d\.\d/);
  }
});

test("passing on a purchase remembers the fee as it stood, stalling included", () => {
  const stalled = gameReducer(stateFor("KUPNO", 1), { type: "STALL" });
  expect(stalled.przeciagniecia).toBe(1);
  const after = gameReducer(stalled, { type: "DECIDE", choice: "pass" });
  expect(after.odrzuceni).toEqual([
    { player: makeOffer("KUPNO").zawodnik, fee: buyPrice(stalled.karta!, 1) },
  ]);
  // The surcharge is in it: more than the 1.0 the card opened with.
  expect(after.odrzuceni[0]!.fee).toBeGreaterThan(1);
});

test("a won wage haggle the club still cannot pay for keeps the haggle in the log", () => {
  // The fee stays at 1.0 after a wage haggle, more than the 0.9 in the bank.
  // The player won the haggle and lost the deal; the log says both.
  const player = makeOffer("KUPNO").zawodnik;
  const expected = `${HAGGLE_WON.lowerWage} ${insufficientFundsMessage(player, 1, 0.9, false)}`;
  const logs = new Set<string>();
  for (let seed = 0; seed < 500; seed += 1) {
    const after = gameReducer(
      { ...stateFor("KUPNO", seed), kasa: 0.9 },
      { type: "DECIDE", choice: "haggle" }
    );
    logs.add(lastLog(after));
  }
  expect(logs).toContain(expected);
});
