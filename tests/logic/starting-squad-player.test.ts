import { expect, test } from "vitest";

import { createRng } from "../../src/logic/rng";
import {
  createStartingSquadPlayer,
  drawStartingSquadAge,
  startingSquadHeadroom,
} from "../../src/logic/player";
import { AGE_PROFILES } from "../../src/data/balance";

/**
 * The headroom model reads raw age and nothing else. Deliberately NOT years
 * to peakStart: peakStart comes from AGE_PROFILES[poz], so a ceiling derived
 * from it would make position correlate with the ceiling and turn the
 * potential arrow - which is computed from age and position - into a
 * predictor.
 */
test("headroom shrinks with age and reaches zero after the prime", () => {
  const rng = createRng(0x5eed_0100);
  const sample = (wiek: number): number[] =>
    Array.from({ length: 2000 }, () => startingSquadHeadroom(rng, wiek));

  const teen = sample(18);
  const early = sample(22);
  const prime = sample(26);
  const old = sample(31);

  expect(Math.min(...teen)).toBe(6);
  expect(Math.max(...teen)).toBe(14);
  expect(Math.min(...early)).toBe(3);
  expect(Math.max(...early)).toBe(9);
  expect(Math.min(...prime)).toBe(0);
  expect(Math.max(...prime)).toBe(4);
  expect(old.every((h) => h === 0)).toBe(true);
});

test("every age from 16 to 40 has a band, so nothing falls through", () => {
  const rng = createRng(11);
  for (let wiek = 16; wiek <= 40; wiek += 1) {
    const h = startingSquadHeadroom(rng, wiek);
    expect(Number.isInteger(h), `age ${wiek} gave ${h}`).toBe(true);
    expect(h, `age ${wiek}`).toBeGreaterThanOrEqual(0);
  }
});

test("the eleven keeps today's age range, the bench grows tails", () => {
  const rng = createRng(0x5eed_0200);
  const xi = Array.from({ length: 4000 }, () => drawStartingSquadAge(rng, true));
  const bench = Array.from({ length: 4000 }, () => drawStartingSquadAge(rng, false));

  expect(Math.min(...xi)).toBe(21);
  expect(Math.max(...xi)).toBe(31);

  expect(Math.min(...bench)).toBe(17);
  expect(Math.max(...bench)).toBe(34);
  // Both tails must actually appear, not merely be reachable in principle.
  expect(bench.filter((w) => w <= 20).length / bench.length).toBeGreaterThan(0.4);
  expect(bench.filter((w) => w >= 32).length / bench.length).toBeGreaterThan(0.1);
});

test("the ceiling is derived from the rating the player actually has", () => {
  const rng = createRng(0x5eed_0300);
  // A high target and a low target must both produce a ceiling just above
  // their own rating - not a ceiling anchored to some other number.
  for (const target of [52, 60, 68, 76]) {
    for (let i = 0; i < 500; i += 1) {
      const p = createStartingSquadPlayer(rng, "ŚO", target, i % 2 === 0);
      expect(p.sufit, `target ${target}: ovr ${p.ovr} sufit ${p.sufit}`).toBeGreaterThanOrEqual(
        p.ovr
      );
      expect(p.sufit - p.ovr, `target ${target}`).toBeLessThanOrEqual(14);
    }
  }
});

test("a starting-squad player is a complete, well-formed Player", () => {
  const rng = createRng(3);
  const p = createStartingSquadPlayer(rng, "ŚP", 65, true);
  expect(p.id).toMatch(/^[a-z0-9]+$/);
  expect(p.nazwa.length).toBeGreaterThan(2);
  expect(p.poz).toBe("ŚP");
  expect(p.moj).toBe(false);
  expect(p.cenaZakupu).toBeNull();
  expect(p.mnoznikPlacy).toBe(1);
  expect(p.wKlubieOd).toBe(0);
  expect(p.kontraktOd).toBe(0);
  expect(p.wygasa).toBe(false);
});

test("the ceiling never depends on the position's peak", () => {
  // Two positions with peakStart 23 and 26. At a fixed age and target the
  // headroom distributions must be indistinguishable - otherwise the
  // potential arrow becomes a predictor.
  expect(AGE_PROFILES.LS.peakStart).toBe(23);
  expect(AGE_PROFILES.ŚO.peakStart).toBe(26);

  const headroomFor = (poz: "LS" | "ŚO"): number => {
    const rng = createRng(0x5eed_0400);
    let total = 0;
    let n = 0;
    for (let i = 0; i < 20_000; i += 1) {
      const p = createStartingSquadPlayer(rng, poz, 64, true);
      total += p.sufit - p.ovr;
      n += 1;
    }
    return total / n;
  };

  expect(Math.abs(headroomFor("LS") - headroomFor("ŚO"))).toBeLessThan(0.15);
});
