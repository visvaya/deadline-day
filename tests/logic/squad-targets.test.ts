import { expect, test } from "vitest";

import { POSITION_WEIGHTS, RATING_OVR_REFERENCE, RATING_OVR_SCALE } from "../../src/data/balance";
import { FORMACJE } from "../../src/data/positions";
import { TEAM_RATINGS } from "../../src/data/team-ratings";
import type { Formation, PositionCode } from "../../src/data/types";
import type { MatchRating } from "../../src/logic/match";
import { ageShiftFor, formationTargetOvr } from "../../src/logic/squad-targets";

const all = (): Formation[] => Object.values(FORMACJE);

/** What squadRatings will compute from a squad sitting exactly on these
 * targets: the weighted mean of ovr on each side, then exponentiated once.
 * Kept here rather than imported so the test pins the contract between the
 * two directions instead of trusting one to define the other. */
const measure = (formation: Formation, targets: Map<PositionCode, number>): MatchRating => {
  let sumA = 0;
  let weightA = 0;
  let sumD = 0;
  let weightD = 0;
  for (const kod of formation.kolejnoscXi) {
    const w = POSITION_WEIGHTS[kod];
    const ovr = targets.get(kod)!;
    sumA += w.attack * ovr;
    weightA += w.attack;
    sumD += w.defence * ovr;
    weightD += w.defence;
  }
  const toRating = (ovr: number): number =>
    Math.exp((ovr - RATING_OVR_REFERENCE) / RATING_OVR_SCALE);
  return { attack: toRating(sumA / weightA), defence: toRating(sumD / weightD) };
};

test("a squad built on these targets measures back as the club it was built for", () => {
  // Deliberately lopsided: Wisła Kraków, the club this whole mapping exists
  // for. A naive inversion returns 0.98 / 0.895 here and loses half the gap.
  const rating: MatchRating = { attack: 1.03, defence: 0.87 };
  for (const formation of all()) {
    const back = measure(formation, formationTargetOvr(formation, rating));
    expect(back.attack, formation.id).toBeCloseTo(rating.attack, 6);
    expect(back.defence, formation.id).toBeCloseTo(rating.defence, 6);
  }
});

test("the round trip holds for every club in the snapshot", () => {
  const cases: MatchRating[] = [
    { attack: 1.24, defence: 1.16 },
    { attack: 0.94, defence: 1.11 },
    { attack: 0.93, defence: 0.84 },
    { attack: 1, defence: 1 },
  ];
  for (const formation of all()) {
    for (const rating of cases) {
      const back = measure(formation, formationTargetOvr(formation, rating));
      expect(back.attack).toBeCloseTo(rating.attack, 6);
      expect(back.defence).toBeCloseTo(rating.defence, 6);
    }
  }
});

test("a club with no bias gives every position the same target", () => {
  const targets = formationTargetOvr(FORMACJE["4-3-3"], { attack: 1, defence: 1 });
  for (const ovr of targets.values()) expect(ovr).toBeCloseTo(RATING_OVR_REFERENCE, 6);
});

test("an attacking club rates its forwards above its defenders", () => {
  const targets = formationTargetOvr(FORMACJE["4-3-3"], { attack: 1.15, defence: 0.9 });
  expect(targets.get("N")!).toBeGreaterThan(targets.get("ŚO")!);
  expect(targets.get("LS")!).toBeGreaterThan(targets.get("ŚPD")!);
});

test("a defensive club rates them the other way round", () => {
  const targets = formationTargetOvr(FORMACJE["4-3-3"], { attack: 0.9, defence: 1.15 });
  expect(targets.get("N")!).toBeLessThan(targets.get("ŚO")!);
});

test("every position of the formation gets a target and nothing else does", () => {
  for (const formation of all()) {
    const targets = formationTargetOvr(formation, { attack: 1.05, defence: 0.95 });
    const expected = new Set(formation.pozycje.map((p) => p.kod));
    expect(new Set(targets.keys()), formation.id).toEqual(expected);
  }
});

const snapshot = (): MatchRating[] =>
  TEAM_RATINGS.clubs.map((club) => ({ attack: club.attack, defence: club.defence }));

test("the age shift is never more than a single year either way", () => {
  for (const rating of snapshot()) {
    const shift = ageShiftFor(rating);
    expect(Number.isInteger(shift)).toBe(true);
    expect(shift).toBeGreaterThanOrEqual(-1);
    expect(shift).toBeLessThanOrEqual(1);
  }
});

test("the strongest club fields a younger squad than the weakest", () => {
  const byStrength = [...snapshot()].sort(
    (a, b) => Math.sqrt(b.attack * b.defence) - Math.sqrt(a.attack * a.defence)
  );
  expect(ageShiftFor(byStrength[0]!)).toBeLessThan(ageShiftFor(byStrength[byStrength.length - 1]!));
});

test("most of the league sits at no shift at all", () => {
  // The measured effect is 0.6 years between the top and bottom five, so
  // only the extremes should round to a whole year. If most clubs moved,
  // the slope would be overstating a correlation of -0.345.
  const shifts = snapshot().map(ageShiftFor);
  const unmoved = shifts.filter((shift) => shift === 0).length;
  expect(unmoved).toBeGreaterThan(shifts.length / 2);
});

test("a club at the league average is not shifted", () => {
  const mean =
    snapshot().reduce((total, r) => total + Math.sqrt(r.attack * r.defence), 0) /
    TEAM_RATINGS.clubs.length;
  expect(ageShiftFor({ attack: mean, defence: mean })).toBe(0);
});
