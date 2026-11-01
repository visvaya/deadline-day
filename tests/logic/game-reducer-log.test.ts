import { expect, test } from "vitest";

import type { GameState } from "../../src/data/types";
import { money } from "../../src/logic/format";
import {
  insufficientFundsMessage,
  playerFacts,
  squadEvictionMessage,
} from "../../src/logic/decision-messages";
import { gameReducer } from "../../src/logic/game-reducer";
import { SQUAD_BENCH_BUFFER } from "../../src/data/balance";
import { FORMACJE } from "../../src/data/positions";
import { makeTestPlayer, quietMarket, testCareerBaseline, testClub, testManager } from "./fixtures";
import { initialState } from "../../src/logic/game-state";

/**
 * Regression net for the in-game log (`state.log`), which the golden traces
 * deliberately do NOT record - the trace stores decision outcomes, not the
 * Polish sentences shown to the player. That blind spot let the phase 2
 * extraction drop the "Kupiony ..." / "Sprzedany ..." branches, so every
 * completed transfer logged "Pas: <nazwa>." instead. Nothing else in the
 * suite could see it: goldens ignore the log and dom-parity only reads the
 * legacy screen.
 */

const openFirstOffer = (seed: number): GameState => {
  let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
  state = gameReducer(state, {
    type: "START_CAREER",
    clubId: testClub.clubId,
    manager: testManager,
    seed,
  });
  return gameReducer(state, { type: "OPEN_OFFERS" });
};

test("a completed transfer logs what actually happened, never a pass", () => {
  const seen = new Set<string>();

  for (let seed = 1; seed <= 60; seed += 1) {
    const opened = openFirstOffer(seed);
    const karta = opened.karta;
    if (!karta) throw new Error("OPEN_OFFERS produced no card");

    const sprzedaz = karta.typ === "SPRZEDAZ";
    // "bierz" is disabled in the UI when the player cannot afford the card.
    if (!sprzedaz && karta.cena > opened.kasa) continue;

    const after = gameReducer(opened, { type: "DECIDE", choice: "take" });
    const wpis = after.log[0];

    expect(wpis).toBeTruthy();
    expect(wpis!.startsWith("Odrzuciłeś ")).toBe(false);
    expect(wpis).toMatch(sprzedaz ? /^Sprzedałeś / : /^(Kupiłeś|Podpisałeś kontrakt z) /);
    expect(wpis).toContain(playerFacts(karta.zawodnik));
    // Same money() form as every other amount on screen: comma, "mln €".
    if (karta.typ !== "WOLNY") expect(wpis).toContain(` za ${money(karta.cena)}.`);
    expect(wpis).not.toMatch(/\d\.\d/);
    seen.add(sprzedaz ? "SPRZEDAZ" : "KUPNO");
  }

  // Both branches must actually be exercised, or the assertions above are vacuous.
  expect([...seen].sort()).toEqual(["KUPNO", "SPRZEDAZ"]);
});

test("passing on an offer logs a pass", () => {
  const opened = openFirstOffer(1);
  const after = gameReducer(opened, { type: "DECIDE", choice: "pass" });
  const karta = opened.karta!;
  expect(after.log[0]).toMatch(/^(Odrzuciłeś ofertę: |Zatrzymałeś |Nie przedłużyłeś kontraktu: )/);
  expect(after.log[0]).toContain(playerFacts(karta.zawodnik));
});

test("an unaffordable purchase logs the shortfall and consumes the move", () => {
  for (let seed = 1; seed <= 400; seed += 1) {
    const opened = openFirstOffer(seed);
    const karta = opened.karta!;
    if (karta.typ === "SPRZEDAZ" || karta.cena <= opened.kasa) continue;

    const after = gameReducer(opened, { type: "DECIDE", choice: "take" });
    expect(after.log[0]).toBe(
      insufficientFundsMessage(karta.zawodnik, karta.cena, opened.kasa, false)
    );
    expect(after.ruchy).toBe(opened.ruchy - 1);
    return;
  }
  throw new Error("No seed in range produced an unaffordable opening offer");
});

test("a squad-depth cut is spelled out in the log entry", () => {
  // The exact post-action sentence the log and notification both reuse.
  // Pinned verbatim so the two records cannot describe one release as two
  // different events.
  const doomed = makeTestPlayer("doomed", { poz: "ŚO", ovr: 52, wiek: 35, nazwa: "M. Wójcik" });
  const formation = FORMACJE["4-3-3"];
  const capacity = formation.pozycje.find((slot) => slot.kod === "ŚO")!.kadra + SQUAD_BENCH_BUFFER;
  const squad = [
    ...Array.from({ length: capacity - 1 }, (_, i) =>
      makeTestPlayer(`safe-${i}`, { poz: "ŚO", ovr: 70, wiek: 25 })
    ),
    doomed,
  ];
  const incoming = makeTestPlayer("nowy", { poz: "ŚO", ovr: 78, wiek: 24, nazwa: "K. Nowy" });

  const base: GameState = {
    ...initialState(),
    faza: "okno",
    club: testClub,
    careerBaseline: testCareerBaseline,
    kadra: squad,
    kasa: 100,
    rynek: quietMarket,
    ruchy: 2,
    karta: {
      typ: "KUPNO",
      zawodnik: incoming,
      cena: 1,
      sourceClub: null,
      buyer: null,
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
    },
  };

  const after = gameReducer(base, {
    type: "CONFIRM_SQUAD_EVICTION",
    choice: "take",
    offerPlayerId: "nowy",
    evictedPlayerId: "doomed",
  });

  expect(after.log[0]).toContain(
    "Brak miejsca na ŚO – kontrakt rozwiązany: M. Wójcik (52 OVR, 35 lat)."
  );
  // Same post-action string as the notification, from the one formatter both call.
  expect(after.log[0]!.endsWith(squadEvictionMessage("ŚO", doomed))).toBe(true);
});

test("a squad-depth message declines the player's age", () => {
  const prospect = makeTestPlayer("prospect", {
    poz: "ŚO",
    ovr: 70,
    wiek: 24,
    nazwa: "K. Nowy",
  });
  const veteran = { ...prospect, wiek: 35 };

  expect(squadEvictionMessage("ŚO", prospect)).toContain("24 lata");
  expect(squadEvictionMessage("ŚO", veteran)).toContain("35 lat");
});
