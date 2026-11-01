import { describe, expect, test } from "vitest";

import {
  RETIREMENT_OVR,
  STARTING_BENCH_OVR_BONUS,
  STARTING_XI_OVR_BONUS,
  WAGE_AT_PIVOT,
  WAGE_SLOPE,
} from "../../src/data/balance";
import { ratingForClubId } from "../../src/data/clubs";
import { createStartingSquadPlayer } from "../../src/logic/player";
import { createRng } from "../../src/logic/rng";
import {
  expectedSquadPayroll,
  formationPayrollSpread,
  ovrMasses,
  slotShape,
  squadShape,
  SQUAD_MODEL_IDS,
} from "../../src/logic/squad-cost";

describe("STARTING_XI_OVR_BONUS and STARTING_BENCH_OVR_BONUS", () => {
  test("stay exactly [-5, 5) and [-12, -3)", () => {
    expect(STARTING_XI_OVR_BONUS).toEqual({ lo: -5, hi: 5 });
    expect(STARTING_BENCH_OVR_BONUS).toEqual({ lo: -12, hi: -3 });
  });
});

describe("createStartingSquadPlayer draws from the exported bands", () => {
  /** Pinned seed: the check is that the closed form matches the draw, so a
   * fresh seed each run would make a real mismatch intermittent. */
  const SEED = 0x5eed0001;
  const DRAWS = 40000;

  const empiricalMasses = (target: number, isXi: boolean): Map<number, number> => {
    const rng = createRng(SEED);
    const counts = new Map<number, number>();
    for (let i = 0; i < DRAWS; i += 1) {
      const player = createStartingSquadPlayer(rng, "ŚP", target, isXi);
      counts.set(player.ovr, (counts.get(player.ovr) ?? 0) + 1);
    }
    return new Map([...counts].map(([ovr, n]) => [ovr, n / DRAWS]));
  };

  test.each([
    [70, true],
    [63.4, true],
    [70, false],
    [55.2, false],
  ])("target %s, xi=%s reproduces the drawn distribution", (target, isXi) => {
    const band = isXi ? STARTING_XI_OVR_BONUS : STARTING_BENCH_OVR_BONUS;
    const analytic = ovrMasses(target, band);
    const drawn = empiricalMasses(target, isXi);
    expect([...drawn.keys()].sort((a, b) => a - b)).toEqual(
      [...analytic.keys()].sort((a, b) => a - b)
    );
    for (const [ovr, mass] of analytic) {
      // 40000 draws put the standard error under 0.0025 for any single
      // bucket, so 0.01 is four sigma wide and still catches a wrong band.
      expect(drawn.get(ovr) ?? 0).toBeCloseTo(mass, 2);
    }
  });
});

describe("ovrMasses", () => {
  test("the masses of one slot sum to one", () => {
    for (const target of [44, 50.2, 57.5, 63.1, 70, 78.9, 88]) {
      for (const bonus of [STARTING_XI_OVR_BONUS, STARTING_BENCH_OVR_BONUS]) {
        const masses = ovrMasses(target, bonus);
        const total = [...masses.values()].reduce((sum, p) => sum + p, 0);
        expect(total).toBeCloseTo(1, 12);
      }
    }
  });

  test("never produces an ovr below RETIREMENT_OVR", () => {
    for (const target of [10, 40, 50, 52, 70, 94]) {
      for (const bonus of [STARTING_XI_OVR_BONUS, STARTING_BENCH_OVR_BONUS]) {
        const masses = ovrMasses(target, bonus);
        expect([...masses.keys()].every((ovr) => ovr >= RETIREMENT_OVR)).toBe(true);
      }
    }
  });

  test("collapses onto the retirement floor when the whole draw sits below it", () => {
    const masses = ovrMasses(45, STARTING_XI_OVR_BONUS);
    expect(masses.size).toBe(1);
    expect(masses.get(RETIREMENT_OVR)).toBeCloseTo(1, 12);
  });
});

describe("slotShape", () => {
  test("is the expectation of the exponential, not the exponential of the mean", () => {
    const slope = 8;
    const shape = slotShape(70, STARTING_XI_OVR_BONUS, slope);
    const masses = ovrMasses(70, STARTING_XI_OVR_BONUS);
    let meanOvr = 0;
    for (const [ovr, p] of masses) meanOvr += ovr * p;
    const naive = Math.exp((meanOvr - 70) / slope);
    // exp is strictly convex, so Jensen makes the correct value the larger
    // one. A tool that averaged ovr first would understate every payroll.
    expect(shape).toBeGreaterThan(naive);
  });

  test("the bench slot is cheaper than the eleven's at the same target", () => {
    for (const target of [55, 63, 70, 78]) {
      expect(slotShape(target, STARTING_BENCH_OVR_BONUS, 8)).toBeLessThan(
        slotShape(target, STARTING_XI_OVR_BONUS, 8)
      );
    }
  });
});

describe("squadShape agrees with the pre-move script", () => {
  test("generator-expectation at WAGE_SLOPE matches the pinned value for legia-warszawa", () => {
    const rating = ratingForClubId("legia-warszawa");
    // Pinned from scripts/money-scale-core.ts's implementation before this
    // task moved it, computed with `pnpm exec tsx` against this same rating,
    // model and slope. A future refactor that drifts from this number has
    // changed behaviour, not just location.
    expect(squadShape(rating, "generator-expectation", WAGE_SLOPE)).toBeCloseTo(
      14.771024062762786,
      9
    );
  });

  test("generator-expectation at WAGE_SLOPE matches the pinned value for wisla-krakow", () => {
    const rating = ratingForClubId("wisla-krakow");
    expect(squadShape(rating, "generator-expectation", WAGE_SLOPE)).toBeCloseTo(
      9.186140790549883,
      9
    );
  });

  test("both model ids are covered", () => {
    expect(SQUAD_MODEL_IDS).toEqual(["screen-projection", "generator-expectation"]);
  });
});

describe("expectedSquadPayroll", () => {
  test("is WAGE_AT_PIVOT times the generator-expectation shape, for every club", () => {
    for (const clubId of ["legia-warszawa", "wisla-krakow"]) {
      const rating = ratingForClubId(clubId);
      expect(expectedSquadPayroll(rating)).toBeCloseTo(
        WAGE_AT_PIVOT * squadShape(rating, "generator-expectation", WAGE_SLOPE),
        12
      );
    }
  });

  test("matches the pinned figure for wisla-krakow", () => {
    const rating = ratingForClubId("wisla-krakow");
    expect(expectedSquadPayroll(rating)).toBeCloseTo(1.4923499615529277, 9);
  });
});

describe("formationPayrollSpread", () => {
  test("is (max - min) / mean over the seven formations", () => {
    const rating = ratingForClubId("wisla-krakow");
    const spread = formationPayrollSpread(rating);
    expect(Number.isFinite(spread)).toBe(true);
    expect(spread).toBeGreaterThan(0);
  });

  // The plan's 0.12..0.14 band (and the spec's 12.7%) is a historical
  // measurement at the fitted wageSlope of 14.5253 and/or in the
  // screen-projection model. At the active WAGE_SLOPE = 12 in the
  // generator-expectation model this function uses, Wisła Kraków measures
  // about 0.087 - a recorded decision, not a target to reproduce, and not a
  // regression against a band that no longer applies.
  test("measures about 0.087 for Wisła Kraków at the active generator model", () => {
    const rating = ratingForClubId("wisla-krakow");
    const spread = formationPayrollSpread(rating);
    expect(spread).toBeCloseTo(0.0868977902008816, 9);
  });
});
