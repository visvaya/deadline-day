import { expect, test } from "vitest";

import type { Offer } from "../../src/data/types";
import { FORMACJE } from "../../src/data/positions";
import { PURCHASE_PRICE_CAP, SQUAD_BENCH_BUFFER } from "../../src/data/balance";
import { zaokr } from "../../src/logic/format";
import { acquisitionCapacityOutcome } from "../../src/logic/squad";
import { makeTestPlayer } from "../logic/fixtures";
import { classifyExternalCard } from "../../scripts/dilemma-card";

const formation = Object.values(FORMACJE).find((f) => f.pozycje.some((slot) => slot.kod === "LO"))!;
const slot = formation.pozycje.find((s) => s.kod === "LO")!;
const buy = (ovr: number, cena: number, typ: Offer["typ"] = "KUPNO"): Offer =>
  ({ typ, cena, zawodnik: makeTestPlayer("new", { ovr, poz: "LO" }) }) as Offer;
const holders = (ovrs: number[]) =>
  ovrs.map((ovr, i) => makeTestPlayer(`h${i}`, { ovr, poz: "LO" }));

test("a player better than the weakest starter enters the eleven", () => {
  const squad = holders(Array.from({ length: slot.xi }, () => 60));
  const result = classifyExternalCard({ kasa: 5, squad, formation }, buy(70, 1));
  expect(result).toMatchObject({ affordable: true, entersXi: true, strengthens: true });
});

test("a player below every starter but above the weakest substitute improves the bench", () => {
  const squad = holders([...Array.from({ length: slot.xi }, () => 80), 50]);
  const result = classifyExternalCard({ kasa: 5, squad, formation }, buy(55, 1));
  expect(result).toMatchObject({ entersXi: false, improvesBench: true, strengthens: true });
});

test("a player below the whole position strengthens nothing", () => {
  const squad = holders([...Array.from({ length: slot.xi }, () => 80), 70]);
  const result = classifyExternalCard({ kasa: 5, squad, formation }, buy(55, 1));
  expect(result).toMatchObject({ entersXi: false, improvesBench: false, strengthens: false });
});

test("a card can sit at the price-cap amount only when cash is positive", () => {
  const squad = holders([60]);
  const capped = zaokr(2 * PURCHASE_PRICE_CAP, 2);
  expect(classifyExternalCard({ kasa: 2, squad, formation }, buy(70, capped))).toMatchObject({
    atPriceCap: true,
    affordable: false,
    affordableWithHaggle: true,
  });
  expect(classifyExternalCard({ kasa: 0, squad, formation }, buy(70, 0.5))).toMatchObject({
    atPriceCap: false,
    affordable: false,
  });
});

test("an evicting signing is judged on the squad after the eviction", () => {
  // Fill the position past capacity (kadra + SQUAD_BENCH_BUFFER slots, plus
  // one more so the incoming player is not himself the one rejected) so the
  // next signing must evict.
  const full = holders(
    Array.from({ length: slot.kadra + SQUAD_BENCH_BUFFER + 1 }, (_, i) => 70 - i)
  );
  const incoming = buy(69, 1);
  expect(acquisitionCapacityOutcome(full, incoming.zawodnik, formation).kind).toBe(
    "evictsExisting"
  );
  const result = classifyExternalCard({ kasa: 5, squad: full, formation }, incoming);
  expect(result.entersXi || result.improvesBench).toBe(true);
});

test("only external signing cards can be classified", () => {
  expect(() =>
    classifyExternalCard({ kasa: 5, squad: holders([60]), formation }, buy(70, 1, "SPRZEDAZ"))
  ).toThrow();
});
