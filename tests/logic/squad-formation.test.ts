import { expect, test } from "vitest";

import { FORMACJE } from "../../src/data/positions";
import type { Player } from "../../src/data/types";
import { createRng } from "../../src/logic/rng";
import { fillEmptyPositions, startingXi, substitutes, xiInOrder } from "../../src/logic/squad";

/** A squad with one player per slot of the given formation, ovr descending
 * so the pick order is unambiguous. */
const build = (kod: readonly string[]): Player[] =>
  kod.map((poz, i) => ({
    id: `p${i}`,
    nazwa: `Zawodnik ${i}`,
    poz: poz as Player["poz"],
    wiek: 25,
    ovr: 70 - i,
    sufit: 80,
    moj: false,
    cenaZakupu: null,
    ageAtSigning: null,
    mnoznikPlacy: 1,
    wKlubieOd: 0,
    kontraktOd: 0,
    wygasa: false,
  }));

test("with a formation the eleven is drawn from that formation's positions", () => {
  for (const formation of Object.values(FORMACJE)) {
    const kadra = build(
      formation.pozycje.flatMap((slot) => Array.from({ length: slot.kadra }, () => slot.kod))
    );
    const xi = startingXi(kadra, formation);
    expect(xi, formation.id).toHaveLength(11);
    for (const slot of formation.pozycje) {
      expect(
        xi.filter((z) => z.poz === slot.kod),
        `${formation.id} ${slot.kod}`
      ).toHaveLength(slot.xi);
    }
  }
});

test("the eleven takes the best player available at each position", () => {
  const formation = FORMACJE["4-3-3"];
  const kadra = build(
    formation.pozycje.flatMap((slot) => Array.from({ length: slot.kadra }, () => slot.kod))
  );
  const xi = startingXi(kadra, formation);
  for (const slot of formation.pozycje) {
    const atPosition = kadra.filter((z) => z.poz === slot.kod).sort((a, b) => b.ovr - a.ovr);
    const picked = xi.filter((z) => z.poz === slot.kod).map((z) => z.id);
    expect(picked.sort()).toEqual(
      atPosition
        .slice(0, slot.xi)
        .map((z) => z.id)
        .sort()
    );
  }
});

test("everyone the eleven leaves behind is a substitute", () => {
  const formation = FORMACJE["3-5-2"];
  const kadra = build(
    formation.pozycje.flatMap((slot) => Array.from({ length: slot.kadra }, () => slot.kod))
  );
  const xi = new Set(startingXi(kadra, formation).map((z) => z.id));
  const subs = substitutes(kadra, formation);
  expect(subs).toHaveLength(kadra.length - xi.size);
  expect(subs.some((z) => xi.has(z.id))).toBe(false);
});

test("the rendered eleven follows the formation's own order", () => {
  const formation = FORMACJE["4-2-3-1"];
  const kadra = build(
    formation.pozycje.flatMap((slot) => Array.from({ length: slot.kadra }, () => slot.kod))
  );
  expect(xiInOrder(kadra, formation).map((slot) => slot.poz)).toEqual(formation.kolejnoscXi);
});

test("an empty position of the formation is refilled, and only from it", () => {
  const formation = FORMACJE["4-3-3"];
  // Everything except the strikers.
  const kadra = build(
    formation.pozycje
      .filter((slot) => slot.kod !== "N")
      .flatMap((slot) => Array.from({ length: slot.kadra }, () => slot.kod))
  );
  const { debiutanci } = fillEmptyPositions(createRng(1), kadra, 65, formation);
  expect(debiutanci.map((z) => z.poz)).toEqual(["N"]);
});
