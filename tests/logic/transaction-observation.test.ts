import { expect, test } from "vitest";

import type { GameState, Offer, OfferType, Player } from "../../src/data/types";
import { HAGGLE_WAGE_DISCOUNT, WOLNY_WAGE_PREMIUM } from "../../src/data/balance";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { baseWage, playerWage, totalPayroll } from "../../src/logic/wages";
import { autoAdvance } from "../golden/headless";
import { makeTestPlayer, quietMarket, testCareerBaseline, testClub, testManager } from "./fixtures";

/**
 * The transaction facts recorded on every decision event: what the squad
 * payroll was before and after, and - only when someone actually joined -
 * who joined and on what wage.
 *
 * The point of recording them at the moment of the decision is that nothing
 * else in the trace can reconstruct them afterwards. The difference between
 * two consecutive payrolls is not the newcomer's wage (an eviction, a sale
 * or the season's ageing all move it too), and the action token is not proof
 * a signing went through (a haggle can be lost, funds can run out).
 */

const lastDecision = (state: GameState) => {
  const event = [...state.trace].reverse().find((e) => e.type === "decision");
  if (!event || event.type !== "decision") throw new Error("no decision event recorded");
  return event;
};

const makeOffer = (typ: OfferType, zawodnik: Player, cena: number): Offer => ({
  typ,
  zawodnik,
  cena,
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

/**
 * A squad whose total wage bill is exactly `target`, so `payrollBefore` is a
 * number the test states rather than one it reads back off the curve.
 */
const squadWithPayroll = (target: number, ...extra: readonly Player[]): Player[] => {
  const anchor = makeTestPlayer("anchor", { poz: "BR", ovr: 60 });
  const anchorWage = target - totalPayroll(extra);
  return [{ ...anchor, mnoznikPlacy: anchorWage / baseWage(anchor.ovr) }, ...extra];
};

const INCOMING = makeTestPlayer("incoming", { poz: "ŚP", ovr: 67, wiek: 24 });
/**
 * The signing's wage on a WOLNY card. No stalling and no wage haggle, so the
 * multiplier the reducer stamps is the signing premium and nothing else - the
 * bare curve value stays the base wage the trace records alongside it.
 */
const INCOMING_BASE_WAGE = baseWage(INCOMING.ovr);
const INCOMING_WAGE = INCOMING_BASE_WAGE * WOLNY_WAGE_PREMIUM;

const stateWith = (
  karta: Offer,
  kadra: readonly Player[],
  overrides: Partial<GameState> = {}
): GameState => ({
  ...initialState(),
  faza: "okno",
  club: testClub,
  careerBaseline: testCareerBaseline,
  kadra: [...kadra],
  kasa: 100,
  rynek: quietMarket,
  // Last move of the window: no follow-up card is dealt, so the event under
  // test is the last one in the trace.
  ruchy: 1,
  karta,
  rngState: 1,
  ...overrides,
});

test("a free signing records the payroll it joined, not the payroll delta", () => {
  const state = stateWith(makeOffer("WOLNY", INCOMING, 0), squadWithPayroll(4));

  const after = gameReducer(state, { type: "DECIDE", choice: "take" });
  const event = lastDecision(after);

  expect(event.payrollBefore).toBeCloseTo(4, 10);
  expect(event.payrollAfter).toBeCloseTo(4 + INCOMING_WAGE, 10);
  expect(event.signedPlayerId).toBe(INCOMING.id);
  expect(event.signedAnnualWage).toBeCloseTo(INCOMING_WAGE, 10);
  expect(event.signedBaseAnnualWage).toBeCloseTo(INCOMING_BASE_WAGE, 10);
});

test("an eviction can make the net payroll delta negative without changing the signing cost", () => {
  // 4-3-3 holds two keepers plus the four-deep bench buffer, so a seventh
  // makes the incoming goalkeeper displace the squad's worst - who earns
  // more than he does.
  const evicted = makeTestPlayer("evicted", {
    poz: "BR",
    ovr: 40,
    wiek: 34,
    mnoznikPlacy: (INCOMING_WAGE + 0.1) / baseWage(40),
  });
  const keepers = [1, 2, 3, 4, 5].map((n) =>
    makeTestPlayer(`keeper${n}`, { poz: "BR", ovr: 70 + n, wiek: 26 })
  );
  const incomingKeeper: Player = { ...INCOMING, poz: "BR" };
  const state = stateWith(
    makeOffer("WOLNY", incomingKeeper, 0),
    squadWithPayroll(4, evicted, ...keepers)
  );

  const after = gameReducer(state, {
    type: "CONFIRM_SQUAD_EVICTION",
    choice: "take",
    offerPlayerId: incomingKeeper.id,
    evictedPlayerId: evicted.id,
  });
  const event = lastDecision(after);

  expect(after.kadra.some((z) => z.id === evicted.id)).toBe(false);
  expect(after.kadra.some((z) => z.id === incomingKeeper.id)).toBe(true);
  expect(event.payrollAfter - event.payrollBefore).toBeCloseTo(-0.1, 10);
  // The net movement is negative; what the signing costs is not.
  expect(event.signedAnnualWage).toBeCloseTo(INCOMING_WAGE, 10);
  expect(event.signedPlayerId).toBe(incomingKeeper.id);
});

test("season ageing is not counted as part of the transaction", () => {
  let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
  state = gameReducer(state, {
    type: "START_CAREER",
    clubId: testClub.clubId,
    manager: testManager,
    seed: 0x5eed0001,
  });
  // The WINTER window's last move: the round it precedes is the spring one,
  // which is where the season is resolved and the squad ages.
  for (let guard = 0; guard < 3000; guard += 1) {
    const step = state.kroki[state.krok];
    if (
      state.faza === "okno" &&
      step?.typ === "okno" &&
      step.tura === "zima" &&
      state.ruchy === 1 &&
      state.karta
    ) {
      break;
    }
    const advanced = autoAdvance(state);
    state = advanced ?? gameReducer(state, { type: "DECIDE", choice: "pass" });
  }
  const payrollAtDecision = totalPayroll(state.kadra);
  const after = gameReducer(state, { type: "DECIDE", choice: "pass" });
  const event = lastDecision(after);

  // The same dispatch ran the season: retirements, academy debutants and a
  // year of development all moved the squad's wage bill.
  expect(after.faza).not.toBe("okno");
  expect(totalPayroll(after.kadra)).not.toBeCloseTo(payrollAtDecision, 6);
  expect(event.payrollBefore).toBeCloseTo(payrollAtDecision, 10);
  expect(event.payrollAfter).toBeCloseTo(payrollAtDecision, 10);
  expect(event.signedPlayerId).toBeNull();
});

test("a pass records no signing", () => {
  const state = stateWith(makeOffer("KUPNO", INCOMING, 1), squadWithPayroll(4));
  const event = lastDecision(gameReducer(state, { type: "DECIDE", choice: "pass" }));
  expect(event.signedPlayerId).toBeNull();
  expect(event.signedAnnualWage).toBeNull();
  expect(event.signedBaseAnnualWage).toBeNull();
  expect(event.payrollAfter).toBeCloseTo(event.payrollBefore, 10);
});

test("stalling alone records nothing at all", () => {
  const state = stateWith(makeOffer("KUPNO", INCOMING, 1), squadWithPayroll(4));
  const after = gameReducer(state, { type: "STALL" });
  expect(after.trace.some((e) => e.type === "decision")).toBe(false);
});

test("a lost haggle records no signing", () => {
  for (let seed = 0; seed < 3000; seed += 1) {
    const state = stateWith(makeOffer("KUPNO", INCOMING, 1), squadWithPayroll(4), {
      rngState: seed,
    });
    const event = lastDecision(gameReducer(state, { type: "DECIDE", choice: "haggle" }));
    if (event.wynik !== "PRZEPADL") continue;
    expect(event.signedPlayerId).toBeNull();
    expect(event.signedAnnualWage).toBeNull();
    expect(event.payrollAfter).toBeCloseTo(event.payrollBefore, 10);
    return;
  }
  throw new Error("no seed produced a lost KUPNO haggle");
});

test("BRAK_SRODKOW records no signing", () => {
  const state = stateWith(makeOffer("KUPNO", INCOMING, 5), squadWithPayroll(4), { kasa: 1 });
  const event = lastDecision(gameReducer(state, { type: "DECIDE", choice: "take" }));
  expect(event.wynik).toBe("BRAK_SRODKOW");
  expect(event.signedPlayerId).toBeNull();
  expect(event.signedAnnualWage).toBeNull();
  expect(event.payrollAfter).toBeCloseTo(event.payrollBefore, 10);
});

test("a won fee haggle records the price actually paid and the plain wage", () => {
  for (let seed = 0; seed < 3000; seed += 1) {
    const state = stateWith(makeOffer("KUPNO", INCOMING, 1), squadWithPayroll(4), {
      rngState: seed,
    });
    const event = lastDecision(gameReducer(state, { type: "DECIDE", choice: "haggle" }));
    if (event.wynik !== "UTARG_KWOTA") continue;
    expect(event.cenaKoncowa).toBeLessThan(event.cena);
    expect(event.signedPlayerId).toBe(INCOMING.id);
    expect(event.signedAnnualWage).toBeCloseTo(INCOMING_BASE_WAGE, 10);
    expect(event.signedBaseAnnualWage).toBeCloseTo(INCOMING_BASE_WAGE, 10);
    return;
  }
  throw new Error("no seed produced a won KUPNO fee haggle");
});

test("a won wage haggle records the discounted wage against the full base", () => {
  for (let seed = 0; seed < 3000; seed += 1) {
    const state = stateWith(makeOffer("KUPNO", INCOMING, 1), squadWithPayroll(4), {
      rngState: seed,
    });
    const after = gameReducer(state, { type: "DECIDE", choice: "haggle" });
    const event = lastDecision(after);
    if (event.wynik !== "UTARG_PLACA") continue;
    const signed = after.kadra.find((z) => z.id === INCOMING.id)!;
    expect(event.signedAnnualWage).toBeCloseTo(INCOMING_BASE_WAGE * (1 - HAGGLE_WAGE_DISCOUNT), 10);
    expect(event.signedAnnualWage).toBeCloseTo(playerWage(signed), 10);
    expect(event.signedBaseAnnualWage).toBeCloseTo(INCOMING_BASE_WAGE, 10);
    return;
  }
  throw new Error("no seed produced a won KUPNO wage haggle");
});

test("a sale is a departure, not a signing", () => {
  const sold = makeTestPlayer("sold", { poz: "ŚP", ovr: 65, moj: true });
  const state = stateWith(makeOffer("SPRZEDAZ", sold, 3), squadWithPayroll(4, sold));
  const event = lastDecision(gameReducer(state, { type: "DECIDE", choice: "take" }));
  expect(event.signedPlayerId).toBeNull();
  expect(event.payrollBefore).toBeCloseTo(4, 10);
});
