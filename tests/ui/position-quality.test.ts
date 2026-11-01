/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from "vitest";

import { FORMACJE } from "../../src/data/positions";
import type { Player, PositionCode } from "../../src/data/types";
import { positionQuality } from "../../src/ui/components/position-summary";

/**
 * Cover wanted scales with the formation's slot count for the position
 * (2026-09-03). Before that `wanted` was flat at 1, or 2 in Europe, which
 * read two ways at once: three centre-backs with one reserve scored the
 * same as one goalkeeper with two.
 *
 * The fault only ever mattered for multi-slot positions, so the tests below
 * pin both halves - that single-slot answers did NOT move, and that the
 * multi-slot one did.
 */

const at = (poz: PositionCode, ovr: number, id: string): Player => ({
  id,
  nazwa: `A. ${id}`,
  poz,
  wiek: 24,
  ovr,
  sufit: 80,
  moj: false,
  cenaZakupu: null,
  ageAtSigning: null,
  mnoznikPlacy: 1,
  wKlubieOd: 0,
  kontraktOd: 0,
  wygasa: false,
});

/** A full XI for the formation at a flat rating, so the starter never drags
 * the verdict: every starter sits exactly on the XI mean, which scores the
 * middle band. Only the cover behind the position under test varies. */
const squadFor = (formationId: keyof typeof FORMACJE, extras: readonly Player[]): Player[] => {
  const formation = FORMACJE[formationId];
  const xi = formation.kolejnoscXi.map((kod, index) => at(kod, 70, `xi${index}`));
  return [...xi, ...extras];
};

describe("positionQuality scales cover with the formation's slots", () => {
  test("a single-slot position is unchanged: one reserve is enough outside Europe", () => {
    const squad = squadFor("4-3-3", [at("BR", 68, "res1")]);
    expect(positionQuality(squad, FORMACJE["4-3-3"], "BR", false)).toBe("dobra");
  });

  test("a single-slot position still wants two reserves in Europe", () => {
    const one = squadFor("4-3-3", [at("BR", 68, "res1")]);
    const two = squadFor("4-3-3", [at("BR", 68, "res1"), at("BR", 68, "res2")]);
    expect(positionQuality(one, FORMACJE["4-3-3"], "BR", true)).toBe("średnia");
    expect(positionQuality(two, FORMACJE["4-3-3"], "BR", true)).toBe("dobra");
  });

  test("three slots want two reserves, where one used to score full marks", () => {
    const one = squadFor("5-3-2", [at("ŚO", 68, "res1")]);
    const two = squadFor("5-3-2", [at("ŚO", 68, "res1"), at("ŚO", 68, "res2")]);
    expect(positionQuality(one, FORMACJE["5-3-2"], "ŚO", false)).toBe("średnia");
    expect(positionQuality(two, FORMACJE["5-3-2"], "ŚO", false)).toBe("dobra");
  });

  test("no cover at all is still the worst answer, whatever the slot count", () => {
    const squad = squadFor("5-3-2", []);
    expect(positionQuality(squad, FORMACJE["5-3-2"], "ŚO", false)).toBe("słaba");
  });
});
