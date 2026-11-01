import { describe, expect, test } from "vitest";

import type { GameState } from "../../src/data/types";
import {
  academyDebutMessage,
  budgetForecastMessage,
  buyerWithdrewMessage,
  extensionDeclinedMessage,
  extensionMessage,
  extensionWalkoutMessage,
  freeAgentDeclinedMessage,
  freeAgentSigningMessage,
  freeAgentWentElsewhereMessage,
  insufficientFundsMessage,
  purchaseDeclinedMessage,
  purchaseLostMessage,
  purchaseMessage,
  saleDeclinedMessage,
  saleMessage,
  squadEvictionMessage,
  stallMessage,
} from "../../src/logic/decision-messages";
import { money } from "../../src/logic/format";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { makeTestPlayer, quietMarket, testCareerBaseline, testClub } from "./fixtures";

/**
 * The exact sentences, pinned once here; the reducer and UI tests check that
 * each decision reaches the right one. Every sentence carries the player as
 * "name (OVR, age)" and every amount through money(), which is why the
 * expectations are built from money() rather than typed out.
 */
describe("decision sentences", () => {
  const p = makeTestPlayer("p", { nazwa: "K. Nowy", ovr: 73, wiek: 24 });
  const facts = "K. Nowy (73 OVR, 24 lata)";

  test.each([
    [
      "purchase",
      purchaseMessage(p, 0.97, 0.4),
      `Kupiłeś ${facts} za ${money(0.97)}. Płaca ${money(0.4)}/rok.`,
    ],
    [
      "free agent",
      freeAgentSigningMessage(p, 0.5),
      `Podpisałeś kontrakt z ${facts} bez odstępnego. Płaca ${money(0.5)}/rok.`,
    ],
    [
      "sale",
      saleMessage(p, 1.2, "Lech", 0.3),
      `Sprzedałeś ${facts} do klubu Lech za ${money(1.2)}. Płace spadły o ${money(0.3)}/rok.`,
    ],
    [
      "sale, no buyer",
      saleMessage(p, 1.2, null, 0.3),
      `Sprzedałeś ${facts} za ${money(1.2)}. Płace spadły o ${money(0.3)}/rok.`,
    ],
    [
      "extension",
      extensionMessage(p, 0.45),
      `Przedłużyłeś kontrakt z ${facts}. Płaca ${money(0.45)}/rok.`,
    ],
    [
      "buyer withdrew",
      buyerWithdrewMessage(p, "Lech"),
      `Kupiec (Lech) się wycofał. ${facts} zostaje w kadrze.`,
    ],
    ["free agent left", freeAgentWentElsewhereMessage(p), `${facts} wybrał inny klub.`],
    ["purchase lost", purchaseLostMessage(p), `Przeciągnąłeś strunę. ${facts} przepadł.`],
    [
      "extension walkout",
      extensionWalkoutMessage(p, 0.3),
      `${facts} odchodzi od razu, nie czekając na koniec sezonu. Płace spadły o ${money(0.3)}/rok.`,
    ],
    [
      "no funds",
      insufficientFundsMessage(p, 1.5, 1.2, false),
      `Brak środków na ${facts}: odstępne ${money(1.5)}, w kasie ${money(1.2)}.`,
    ],
    [
      "no funds after stalling",
      insufficientFundsMessage(p, 1.5, 1.2, true),
      `Negocjacje nieudane. Brak środków na ${facts}: odstępne ${money(1.5)}, w kasie ${money(1.2)}.`,
    ],
    [
      "purchase declined",
      purchaseDeclinedMessage(p, 0.97),
      `Odrzuciłeś ofertę: ${facts} za ${money(0.97)}.`,
    ],
    [
      "free agent declined",
      freeAgentDeclinedMessage(p, 0.5),
      `Odrzuciłeś ofertę: ${facts} bez odstępnego, płaca ${money(0.5)}/rok.`,
    ],
    [
      "sale declined",
      saleDeclinedMessage(p, 1.2),
      `Zatrzymałeś ${facts}, odrzucając ${money(1.2)}.`,
    ],
    [
      "extension declined",
      extensionDeclinedMessage(p),
      `Nie przedłużyłeś kontraktu: ${facts} odejdzie za darmo po sezonie.`,
    ],
    [
      "stalled purchase",
      stallMessage(p, { amount: 1.1, rises: true }, 0.45),
      `Przeciągnąłeś negocjacje: ${facts}. Kwota wzrosła do ${money(1.1)}, płaca wzrosła do ${money(0.45)}/rok.`,
    ],
    [
      "stalled sale",
      stallMessage(p, { amount: 0.9, rises: false }, null),
      `Przeciągnąłeś negocjacje: ${facts}. Kwota spadła do ${money(0.9)}.`,
    ],
    [
      "stalled extension",
      stallMessage(p, null, 0.5),
      `Przeciągnąłeś negocjacje: ${facts}. Płaca wzrosła do ${money(0.5)}/rok.`,
    ],
  ])("%s", (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });

  test("the budget sentence names the new forecast with its sign, or nothing", () => {
    expect(budgetForecastMessage(1, 1.2)).toBe(
      `Prognozowana zmiana budżetu rośnie do +${money(1.2)}.`
    );
    expect(budgetForecastMessage(0.2, -0.3)).toBe(
      `Prognozowana zmiana budżetu spada do ${money(-0.3)}.`
    );
    // Equal at the two decimals the player reads: nothing to report.
    expect(budgetForecastMessage(1, 1.001)).toBeNull();
  });

  test("never reads a rounding of zero as a fall to minus zero", () => {
    // -0.001 and 0.001 both read 0,00 to the player: no change to report.
    expect(budgetForecastMessage(0.001, -0.001)).toBeNull();
    // A real fall that lands on zero names it as +0,00, not -0,00.
    expect(budgetForecastMessage(0.5, -0.001)).toBe(
      `Prognozowana zmiana budżetu spada do +${money(0)}.`
    );
  });
});

describe("academyDebutMessage", () => {
  test("is null when nobody had to step up", () => {
    expect(academyDebutMessage([])).toBeNull();
  });

  test("names the debutant with OVR and age, like a squad-depth cut", () => {
    const junior = makeTestPlayer("j1", { nazwa: "K. Ndiaye", poz: "LO", ovr: 54, wiek: 18 });
    expect(academyDebutMessage([junior])).toBe(
      "K. Ndiaye (54 OVR, 18 lat) debiutuje z akademii na LO."
    );
    // The same player facts as the eviction sentence, word for word.
    expect(squadEvictionMessage("LO", junior)).toContain("K. Ndiaye (54 OVR, 18 lat)");
  });

  test("uses the plural verb for two debutants", () => {
    const first = makeTestPlayer("j1", { nazwa: "A. Nowak", ovr: 52, wiek: 17 });
    const second = makeTestPlayer("j2", { nazwa: "B. Kowal", ovr: 55, wiek: 22 });
    expect(academyDebutMessage([first, second])).toBe(
      "A. Nowak (52 OVR, 17 lat), B. Kowal (55 OVR, 22 lata) debiutują z akademii na LO."
    );
  });
});

test("a sale that empties a position logs the academy debutant with OVR and age", () => {
  const sold = makeTestPlayer("sold", { moj: true, poz: "LO", nazwa: "S. Sprzedany" });
  const base: GameState = {
    ...initialState(),
    faza: "okno",
    club: testClub,
    careerBaseline: testCareerBaseline,
    kadra: [sold],
    kasa: 10,
    rynek: quietMarket,
    ruchy: 1,
    karta: {
      typ: "SPRZEDAZ",
      zawodnik: sold,
      cena: 1,
      sourceClub: null,
      buyer: { clubId: "lech-poznan", name: "Lech", origin: "domestic" },
      staffAssessment: {
        source: "scout",
        focus: "current",
        outlook: "leagueLevel",
        confidence: "high",
        isFirstObservation: false,
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

  const after = gameReducer(base, { type: "DECIDE", choice: "take" });
  const debutants = after.kadra.filter((player) => player.id !== sold.id);
  expect(debutants.length).toBeGreaterThan(0);
  expect(after.log[0]!.endsWith(` ${academyDebutMessage(debutants)!}`)).toBe(true);
});
