import { expect, test } from "vitest";

import { FORMACJE } from "../../src/data/positions";
import type { Offer } from "../../src/data/types";
import type { PlayResult } from "../../src/logic/simulate";
import { simulateGame } from "../../src/logic/simulate";
import { alwaysPass, stallThenTake, youngBuySellStars } from "../../src/logic/simulate-policies";
import {
  DILEMMA_COLUMNS,
  extractDilemmaCareer,
  observeCard,
  type ObservedCard,
} from "../../scripts/dilemma-observations";
import { makeTestPlayer } from "../logic/fixtures";

const observed = (policy: typeof alwaysPass, seed = 4242, clubId = "wisla-krakow") => {
  const cards: ObservedCard[] = [];
  const result = simulateGame({
    seed,
    clubId,
    policy,
    onCard: (card, index, state) => cards.push(observeCard(card, index, state)),
  });
  return { result, cards };
};

test("one row per career, columns in the declared order", () => {
  const { result, cards } = observed(alwaysPass);
  const row = extractDilemmaCareer(result, "alwaysPass", cards, "normal");
  expect(Object.keys(row)).toEqual([...DILEMMA_COLUMNS]);
  expect(row.windows).toBeGreaterThanOrEqual(1);
  expect(row.firstWindowKupno).toBeLessThanOrEqual(4);
  expect(row.salesAccepted).toBe(0);
  expect(row.externalAffordableStrengthening).toBeLessThanOrEqual(
    Math.min(row.externalAffordable, row.externalStrengthening)
  );
});

test("a stalled card counts once", () => {
  const { result, cards } = observed(stallThenTake);
  const row = extractDilemmaCareer(result, "stallThenTake", cards, "normal");
  const decisions = result.events.filter((e) => e.type === "decision");
  const external = decisions.filter((e) => ["KUPNO", "PANIC", "WOLNY"].includes(e.kartaTyp)).length;
  expect(row.externalCards).toBe(external);
});

// Seed 4242 gives youngBuySellStars a career with zero SPRZEDAZ cards for an
// own star (ownStarSaleCards === 0), which would make the assertion below
// pass vacuously. Chosen by the loop the brief prescribes: starting at 4242
// and taking the first seed where ownStarSaleCards > 0, which is 4261.
const STAR_SALE_SEED = 4261;

test("the star seller never accepts a sale of a non-star", () => {
  const { result, cards } = observed(youngBuySellStars, STAR_SALE_SEED);
  const row = extractDilemmaCareer(result, "youngBuySellStars", cards, "normal");
  expect(row.ownStarSaleCards).toBeGreaterThan(0);
  expect(row.salesAccepted).toBe(row.ownStarSalesAccepted);
});

// Regression for the bug where the "first window" was the smallest
// windowStep among KUPNO cards only, so a career whose earliest window had
// no KUPNO card at all was judged on a later window instead. Built by hand,
// not simulated, per the plan: two windows, the earlier one carrying a
// WOLNY card and no KUPNO card at all, the later one carrying a KUPNO card.
test("the first window is the career's earliest observed card, not the earliest KUPNO card", () => {
  const formation = Object.values(FORMACJE).find((f) =>
    f.pozycje.some((slot) => slot.kod === "LO")
  )!;
  const view = { kasa: 100, squad: [], formation };
  const wolnyCard = {
    typ: "WOLNY",
    cena: 0,
    zawodnik: makeTestPlayer("w", { ovr: 40, poz: "LO" }),
  } as Offer;
  const kupnoCard = {
    typ: "KUPNO",
    cena: 1,
    zawodnik: makeTestPlayer("k", { ovr: 90, poz: "LO" }),
  } as Offer;
  const cards: ObservedCard[] = [
    { decisionIndex: 0, windowStep: 1, card: wolnyCard, view },
    { decisionIndex: 1, windowStep: 2, card: kupnoCard, view },
  ];
  const result = {
    clubId: "legia-warszawa",
    seed: 1,
    state: {
      trace: [
        { type: "decision", index: 0, cenaKoncowa: 0 },
        { type: "decision", index: 1, cenaKoncowa: 0 },
      ],
    },
  } as unknown as PlayResult;

  const row = extractDilemmaCareer(result, "alwaysPass", cards, "normal");

  expect(row.windows).toBe(2);
  expect(row.firstWindowKupno).toBe(0);
  expect(row.firstWindowUsefulKupno).toBe(0);
  expect(row.firstWindowUsefulAffordableKupno).toBe(0);
  expect(row.firstWindowUsefulHaggleAffordableKupno).toBe(0);
});

test("a decision without an observed card is an error", () => {
  const { result, cards } = observed(alwaysPass);
  expect(() => extractDilemmaCareer(result, "alwaysPass", cards.slice(1), "normal")).toThrow();
});
