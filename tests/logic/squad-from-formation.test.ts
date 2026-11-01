import { expect, test } from "vitest";

import { FORMACJE } from "../../src/data/positions";
import type { Formation, PositionCode } from "../../src/data/types";
import type { MatchRating } from "../../src/logic/match";
import { createRng } from "../../src/logic/rng";
import { createSquadFromFormation, squadRatings } from "../../src/logic/squad";

/** Geometric mean of the measured rating over many seeds. Geometric, not
 * arithmetic: ratings are exponentials of ovr, so averaging them linearly
 * would bias the result upward. */
const measuredOver = (formation: Formation, rating: MatchRating, runs = 400): MatchRating => {
  let logAttack = 0;
  let logDefence = 0;
  for (let seed = 0; seed < runs; seed += 1) {
    const kadra = createSquadFromFormation(createRng(seed * 7919 + 13), formation, rating);
    const m = squadRatings(kadra, null, formation);
    logAttack += Math.log(m.attack);
    logDefence += Math.log(m.defence);
  }
  return { attack: Math.exp(logAttack / runs), defence: Math.exp(logDefence / runs) };
};

const WISLA: MatchRating = { attack: 1.03, defence: 0.87 };

test("the squad has exactly the formation's positions, at its depths", () => {
  for (const formation of Object.values(FORMACJE)) {
    const kadra = createSquadFromFormation(createRng(5), formation, WISLA);
    expect(kadra, formation.id).toHaveLength(
      formation.pozycje.reduce((sum, slot) => sum + slot.kadra, 0)
    );
    for (const slot of formation.pozycje) {
      expect(
        kadra.filter((z) => z.poz === slot.kod),
        `${formation.id} ${slot.kod}`
      ).toHaveLength(slot.kadra);
    }
    const allowed = new Set(formation.pozycje.map((slot) => slot.kod));
    expect(
      kadra.every((z) => allowed.has(z.poz)),
      formation.id
    ).toBe(true);
  }
});

test("a squad built for a club measures back as that club's shape", () => {
  // The ratio is the shape of the club - attacking versus defensive. The
  // bench drags both sides down by the same amount, so the ratio survives it
  // even though the absolute level does not.
  for (const formation of Object.values(FORMACJE)) {
    const m = measuredOver(formation, WISLA);
    expect(m.attack / m.defence, formation.id).toBeCloseTo(WISLA.attack / WISLA.defence, 1);
    const err = Math.abs(m.attack / m.defence / (WISLA.attack / WISLA.defence) - 1);
    expect(err, `${formation.id} ratio off by ${(err * 100).toFixed(1)}%`).toBeLessThan(0.02);
  }
}, 10_000);

test("the level lands on the club, minus only what the bench costs", () => {
  // squadRatings blends the eleven with six substitutes at 0.95 / 0.05, and
  // substitutes are drawn below the target, so the measured level sits
  // slightly under it. That gap is the mechanic, not an error.
  for (const formation of Object.values(FORMACJE)) {
    const m = measuredOver(formation, WISLA);
    for (const [side, target] of [
      ["attack", WISLA.attack],
      ["defence", WISLA.defence],
    ] as const) {
      const err = Math.abs(m[side] / target - 1);
      expect(err, `${formation.id} ${side} off by ${(err * 100).toFixed(1)}%`).toBeLessThan(0.03);
    }
  }
});

test("an attacking club fields better attackers than defenders", () => {
  const formation = FORMACJE["4-3-3"];
  const kadra = createSquadFromFormation(createRng(11), formation, { attack: 1.2, defence: 0.85 });
  const avg = (kod: PositionCode): number => {
    const at = kadra.filter((z) => z.poz === kod);
    return at.reduce((s, z) => s + z.ovr, 0) / at.length;
  };
  expect(avg("N")).toBeGreaterThan(avg("ŚO"));
  expect(avg("LS")).toBeGreaterThan(avg("LO"));
});

test("nobody is created below the floor", () => {
  // Wieczysta is the weakest club in the snapshot; even there the ovr floor
  // must hold, because the whole rating scale sits above it.
  const kadra = createSquadFromFormation(createRng(3), FORMACJE["5-3-2"], {
    attack: 0.84,
    defence: 0.84,
  });
  expect(Math.min(...kadra.map((z) => z.ovr))).toBeGreaterThanOrEqual(48);
});

test("every player's ceiling is at least his rating", () => {
  // The hard cap from src/logic/player.ts must survive the ovr being
  // overwritten here - otherwise the legacy screen prints a broken number.
  const kadra = createSquadFromFormation(createRng(9), FORMACJE["4-4-2"], WISLA);
  expect(kadra.every((z) => z.sufit >= z.ovr)).toBe(true);
});
