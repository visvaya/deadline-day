/**
 * peakOvrRange has to be a real bound, not an estimate: a guaranteed `high`
 * verdict is only correct because every path a player can actually take ends
 * inside this range. So the test walks real develop() and form steps rather
 * than checking a handful of examples.
 */
import { describe, expect, test } from "vitest";

import {
  AGE_GROWTH_MAX,
  AGE_GROWTH_MIN,
  AGE_PROFILES,
  FORM_PENALTY_FLOOR,
} from "../../src/data/balance";
import type { Player, PositionCode } from "../../src/data/types";
import { develop, formAdjustment } from "../../src/logic/development";
import { createRng } from "../../src/logic/rng";
import { peakOvrRange, seasonsToPeak } from "../../src/logic/staff-projection";

const basePlayer = (overrides: Partial<Player>): Player => ({
  id: "projection-test",
  nazwa: "Test",
  poz: "ŚP",
  wiek: 18,
  ovr: 62,
  sufit: 78,
  moj: false,
  cenaZakupu: null,
  ageAtSigning: null,
  mnoznikPlacy: 1,
  wKlubieOd: 0,
  kontraktOd: 0,
  wygasa: false,
  ...overrides,
});

/**
 * One real career to peakStart: develop() then the form step, exactly as
 * ageSquad sequences them, with playing time and club form left to the seed.
 */
const walkToPeak = (player: Player, seed: number): number => {
  const rng = createRng(seed);
  const profile = AGE_PROFILES[player.poz];
  let current = player;
  while (current.wiek < profile.peakStart) {
    const aged = develop(rng, current, profile);
    const played = rng.next() < 0.5;
    const overperformed = rng.next() < 0.5;
    const formAdj = formAdjustment(rng, played, overperformed);
    const withForm =
      formAdj > 0
        ? Math.min(aged.sufit, aged.ovr + formAdj)
        : formAdj < 0
          ? aged.ovr >= FORM_PENALTY_FLOOR
            ? Math.max(FORM_PENALTY_FLOOR, aged.ovr + formAdj)
            : aged.ovr + formAdj
          : aged.ovr;
    current = { ...aged, ovr: withForm };
  }
  return current.ovr;
};

const POSITIONS: readonly PositionCode[] = ["BR", "ŚO", "ŚPD", "ŚP", "LS", "N"];

describe("peakOvrRange", () => {
  test("every real development path lands inside the range", () => {
    let checked = 0;
    for (const poz of POSITIONS) {
      for (const wiek of [16, 17, 18, 20, 22, 23, 24]) {
        for (const ovr of [52, 58, 62, 68, 74]) {
          for (const sufit of [58, 64, 70, 76, 82, 88]) {
            const player = basePlayer({ poz, wiek, ovr, sufit });
            const { minOvr, maxOvr } = peakOvrRange(player);
            expect(minOvr).toBeLessThanOrEqual(maxOvr);
            for (let seed = 1; seed <= 12; seed += 1) {
              const finalOvr = walkToPeak(player, seed * 7919 + ovr * 31 + sufit);
              expect(
                finalOvr,
                `${poz} age ${wiek} ovr ${ovr} ceiling ${sufit} seed ${seed}: ${finalOvr} outside [${minOvr}, ${maxOvr}]`
              ).toBeGreaterThanOrEqual(minOvr);
              expect(finalOvr).toBeLessThanOrEqual(maxOvr);
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10_000);
  });

  test("a player already at his peak has no range left", () => {
    const poz: PositionCode = "ŚP";
    const player = basePlayer({ poz, wiek: AGE_PROFILES[poz].peakStart, ovr: 71 });

    expect(peakOvrRange(player)).toEqual({ minOvr: 71, maxOvr: 71 });
    expect(seasonsToPeak(player.wiek, poz)).toBe(0);
  });

  test("a player past his peak has no range left either", () => {
    const poz: PositionCode = "ŚO";
    const player = basePlayer({ poz, wiek: AGE_PROFILES[poz].peakEnd + 2, ovr: 69 });

    expect(peakOvrRange(player)).toEqual({ minOvr: 69, maxOvr: 69 });
  });

  test("a player already at his ceiling only moves by the form correction", () => {
    // No growth left (the gap is zero), so the range is exactly what a season
    // of best and worst form can do - and the bonus clamps at the ceiling.
    const poz: PositionCode = "ŚP";
    const player = basePlayer({ poz, wiek: AGE_PROFILES[poz].peakStart - 1, ovr: 72, sufit: 72 });

    expect(peakOvrRange(player)).toEqual({ minOvr: 71, maxOvr: 72 });
  });

  test("the form penalty never pushes the minimum below the floor from above it", () => {
    const poz: PositionCode = "ŚP";
    const player = basePlayer({
      poz,
      wiek: AGE_PROFILES[poz].peakStart - 3,
      ovr: FORM_PENALTY_FLOOR,
      sufit: FORM_PENALTY_FLOOR,
    });

    expect(peakOvrRange(player).minOvr).toBe(FORM_PENALTY_FLOOR);
  });

  test("the two trajectories use the two growth constants, with develop()'s rounding", () => {
    const poz: PositionCode = "ŚP";
    const player = basePlayer({ poz, wiek: AGE_PROFILES[poz].peakStart - 1, ovr: 60, sufit: 80 });
    const { minOvr, maxOvr } = peakOvrRange(player);

    expect(minOvr).toBe(Math.max(FORM_PENALTY_FLOOR, Math.round(60 + 20 * AGE_GROWTH_MIN) - 1));
    expect(maxOvr).toBe(Math.min(80, Math.round(60 + 20 * AGE_GROWTH_MAX) + 1));
  });
});
