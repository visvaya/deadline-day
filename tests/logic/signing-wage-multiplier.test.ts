import { describe, expect, test } from "vitest";

import { KARA_PLACA, WOLNY_WAGE_PREMIUM } from "../../src/data/balance";
import type { OfferType } from "../../src/data/types";
import { signingWageMultiplier } from "../../src/logic/wages";

/**
 * The multiplier a signing lands on, which used to be written out twice: once
 * in the reducer that charges it and once in the offer window that previews
 * it. The two agreed, and a comment said they had to - which named the
 * relationship without enforcing it. These tests are the enforcement.
 */
describe("signingWageMultiplier", () => {
  test("only WOLNY carries the signing premium", () => {
    for (const typ of ["KUPNO", "PANIC", "PRZEDLUZENIE", "SPRZEDAZ"] as OfferType[]) {
      expect(signingWageMultiplier(typ, 0), typ).toBe(1);
    }
    expect(signingWageMultiplier("WOLNY", 0)).toBe(WOLNY_WAGE_PREMIUM);
  });

  test("each stall adds its penalty, on top of the premium", () => {
    expect(signingWageMultiplier("KUPNO", 2)).toBeCloseTo(1 + 2 * KARA_PLACA, 12);
    expect(signingWageMultiplier("WOLNY", 2)).toBeCloseTo(
      WOLNY_WAGE_PREMIUM * (1 + 2 * KARA_PLACA),
      12
    );
  });

  test("rises with stalls and never falls below one", () => {
    for (const typ of ["KUPNO", "WOLNY"] as OfferType[]) {
      for (let stalls = 0; stalls < 5; stalls += 1) {
        expect(signingWageMultiplier(typ, stalls + 1)).toBeGreaterThan(
          signingWageMultiplier(typ, stalls)
        );
        expect(signingWageMultiplier(typ, stalls)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test("carries no haggle discount: that belongs to the concluded transfer", () => {
    // A preview has nothing to apply it to, so the helper must not know about
    // it. If this ever starts failing, the discount leaked into the preview.
    expect(signingWageMultiplier("WOLNY", 0)).toBe(WOLNY_WAGE_PREMIUM);
    expect(signingWageMultiplier("KUPNO", 0)).toBe(1);
  });
});
