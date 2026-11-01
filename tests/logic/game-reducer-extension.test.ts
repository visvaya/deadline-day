import { expect, test } from "vitest";

import type { GameState, Offer, Player } from "../../src/data/types";
import { KARA_CENA, KARA_PLACA } from "../../src/data/balance";
import { FORMACJE } from "../../src/data/positions";
import { CLUBS } from "../../src/data/clubs";
import { gameReducer } from "../../src/logic/game-reducer";
import { initialState } from "../../src/logic/game-state";
import { emptyStandings } from "../../src/logic/league";
import { eligibleForExtension, extensionWage } from "../../src/logic/offers";
import { zaokr } from "../../src/logic/format";
import { baseWage } from "../../src/logic/wages";
import { makeTestPlayer, quietMarket, testCareerBaseline, testClub } from "./fixtures";

/**
 * PRZEDLUZENIE: a contract-expiry card for the player's own squad.
 */

const extensionOffer = (
  overrides: Parameters<typeof makeTestPlayer>[1] = {},
  cena = 0.2
): Offer => ({
  typ: "PRZEDLUZENIE",
  zawodnik: makeTestPlayer("target", { wiek: 25, kontraktOd: 0, ...overrides }),
  cena,
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
});

// One player per position so fillEmptyPositions never has anything to do -
// season-end tests below need this so an academy debutant never confuses
// squad-size or mnoznikPlacy assertions.
const fullSquad = (target: Player): Player[] => [
  target,
  ...FORMACJE["4-3-3"].pozycje
    .filter((t) => t.kod !== target.poz)
    .map((t) => makeTestPlayer(`filler-${t.kod}`, { poz: t.kod, wiek: 24 })),
];

const baseExtensionState = (overrides: Partial<GameState> = {}): GameState => {
  const offer = extensionOffer();
  return {
    ...initialState(),
    faza: "okno",
    club: testClub,
    careerBaseline: testCareerBaseline,
    kadra: fullSquad(offer.zawodnik),
    kasa: 5,
    rynek: quietMarket,
    karta: offer,
    ...overrides,
  };
};

/** ruchy: 2 - the decision resolves but the window isn't over, so the
 * reducer stays in "okno" rather than cascading into season-end. Lets
 * these tests inspect the immediate effect of the decision in isolation. */
const stateMidWindow = (overrides: Partial<GameState> = {}): GameState =>
  baseExtensionState({ krok: 0, ruchy: 2, ...overrides });

/** krok: 2 (winter window) + ruchy: 1 - the decision is the window's last
 * card, so a single DECIDE dispatch cascades all the way into this
 * season's second half and koniecSezonu (game-reducer.ts's dalejKrok).
 * The spring round reads state.liga from the autumn round it never played
 * within this test, so it's seeded here the same shape symulujRunde would
 * have left it in. */
const clubShortNames = CLUBS.map((club) => club.shortName);

const stateLastCardBeforeSeasonEnd = (overrides: Partial<GameState> = {}): GameState =>
  baseExtensionState({
    krok: 2,
    ruchy: 1,
    liga: { order: clubShortNames, standings: emptyStandings(clubShortNames) },
    ...overrides,
  });

test("extending a contract doesn't change squad size or cash, and doesn't join moje/odrzuceni", () => {
  const before = stateMidWindow();
  const after = gameReducer(before, { type: "DECIDE", choice: "take" });

  expect(after.kadra).toHaveLength(before.kadra.length);
  expect(after.kasa).toBe(before.kasa);
  expect(after.moje.some((z) => z.id === "target")).toBe(false);
  expect(after.odrzuceni.some((entry) => entry.player.id === "target")).toBe(false);
});

test("extending sets mnoznikPlacy from the agreed wage and resets kontraktOd to this season", () => {
  const before = stateMidWindow();
  const after = gameReducer(before, { type: "DECIDE", choice: "take" });

  const extended = after.kadra.find((z) => z.id === "target")!;
  expect(extended.kontraktOd).toBe(1); // krok 0 is season 1's summer window
  expect(extended.mnoznikPlacy).toBeCloseTo(before.karta!.cena / baseWage(extended.ovr), 3);
});

test("declining flags wygasa, and the player leaves only once the season ends", () => {
  const before = stateLastCardBeforeSeasonEnd();
  const after = gameReducer(before, { type: "DECIDE", choice: "pass" });

  expect(after.faza).toBe("koniecSezonu");
  expect(after.kadra.some((z) => z.id === "target")).toBe(false);
  expect(after.wynikSezonu!.odeszli.some((z) => z.id === "target")).toBe(true);
});

test("a lost haggle removes the player immediately, before koniecSezonu", () => {
  let after: GameState | null = null;
  for (let seed = 0; seed < 3000; seed += 1) {
    const before = stateMidWindow({ rngState: seed });
    const attempt = gameReducer(before, { type: "DECIDE", choice: "haggle" });
    const lastDecision = [...attempt.trace].reverse().find((e) => e.type === "decision");
    if (lastDecision?.type === "decision" && lastDecision.wynik === "PRZEPADL") {
      after = attempt;
      break;
    }
  }
  expect(after).not.toBeNull();
  // Still in the same window (unlike a plain decline, which only flags
  // wygasa and leaves at season end) - the removal already happened.
  expect(after!.faza).toBe("okno");
  expect(after!.kadra.some((z) => z.id === "target")).toBe(false);
});

test("stalling grows the wage ask by KARA_PLACA per step, not KARA_CENA", () => {
  // A large enough base that the two growth rates round to visibly
  // different figures (KARA_PLACA=0.08 vs KARA_CENA=0.12).
  const offer = extensionOffer({}, 1.0);
  expect(extensionWage(offer, 1)).toBeCloseTo(zaokr(offer.cena * (1 + KARA_PLACA), 2), 5);
  expect(extensionWage(offer, 1)).not.toBeCloseTo(zaokr(offer.cena * (1 + KARA_CENA), 2), 5);
});

test("eligibleForExtension excludes the whole squad in season 1", () => {
  const kadra = [
    makeTestPlayer("a", { wiek: 25, kontraktOd: 0 }),
    makeTestPlayer("b", { wiek: 30, kontraktOd: 0 }),
  ];
  expect(eligibleForExtension(kadra, 1)).toHaveLength(0);
  expect(eligibleForExtension(kadra, 2)).toHaveLength(2);
});

test("a player who just extended doesn't qualify again the very next season", () => {
  const kadra = [makeTestPlayer("a", { wiek: 25, kontraktOd: 3 })];
  expect(eligibleForExtension(kadra, 4)).toHaveLength(0);
  expect(eligibleForExtension(kadra, 5)).toHaveLength(1);
});
