import { expect, test } from "vitest";

import { FORMACJE } from "../../src/data/positions";
import { POSITION_WEIGHTS } from "../../src/data/balance";
import type { Formation, FormationId } from "../../src/data/types";

const all = (): Formation[] => Object.values(FORMACJE);

test("there are seven formations and each is keyed by its own id", () => {
  expect(all()).toHaveLength(7);
  for (const [id, formation] of Object.entries(FORMACJE)) {
    expect(formation.id).toBe(id as FormationId);
  }
});

test("every formation fields exactly eleven players", () => {
  for (const formation of all()) {
    const starters = formation.pozycje.reduce((total, p) => total + p.xi, 0);
    expect(starters, formation.id).toBe(11);
    expect(formation.kolejnoscXi, formation.id).toHaveLength(11);
  }
});

test("the rendering order matches the starting counts position by position", () => {
  for (const formation of all()) {
    for (const p of formation.pozycje) {
      const rendered = formation.kolejnoscXi.filter((code) => code === p.kod).length;
      expect(rendered, `${formation.id} ${p.kod}`).toBe(p.xi);
    }
  }
});

test("squad depth is one over the starting count everywhere", () => {
  for (const formation of all()) {
    for (const p of formation.pozycje) {
      expect(p.kadra, `${formation.id} ${p.kod}`).toBe(p.xi + 1);
    }
  }
});

/**
 * The spec's hard limit: a player makes exactly 30 decisions in a career, so
 * a squad much past twenty stops being rebuildable and rule 3 of the brief
 * weakens without a word changing in it.
 */
test("every formation produces a squad between nineteen and twenty-two", () => {
  for (const formation of all()) {
    const squad = formation.pozycje.reduce((total, p) => total + p.kadra, 0);
    expect(squad, formation.id).toBeGreaterThanOrEqual(19);
    expect(squad, formation.id).toBeLessThanOrEqual(22);
  }
});

test("every formation starts one goalkeeper", () => {
  for (const formation of all()) {
    expect(formation.kolejnoscXi[0], formation.id).toBe("BR");
    expect(
      formation.kolejnoscXi.filter((code) => code === "BR"),
      formation.id
    ).toHaveLength(1);
  }
});

test("no formation uses a position twice in its own list", () => {
  for (const formation of all()) {
    const codes = formation.pozycje.map((p) => p.kod);
    expect(new Set(codes).size, formation.id).toBe(codes.length);
  }
});

/** A code nothing can field is a code that should not exist. */
test("every new position code is used by at least one formation", () => {
  const used = new Set(all().flatMap((f) => f.pozycje.map((p) => p.kod)));
  for (const code of ["CLS", "CPS", "ŚPD", "ŚP", "LP", "PP", "ŚPO", "CN", "N"] as const) {
    expect(used.has(code), code).toBe(true);
  }
});

test("no formation uses a code without a weight", () => {
  for (const formation of all()) {
    for (const p of formation.pozycje) {
      expect(POSITION_WEIGHTS[p.kod], `${formation.id} ${p.kod}`).toBeDefined();
    }
  }
});
