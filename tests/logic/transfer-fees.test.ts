import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import {
  FOREIGN_FEE_SOFT_KNEE,
  HAGGLE_SALE_BONUS,
  MAX_DOMESTIC_FEE,
  MAX_FOREIGN_FEE,
  MAX_UNHAGGLED_FOREIGN_FEE,
} from "../../src/data/balance";
import { softCapForeignOffer, softCapForeignOfferWithParams } from "../../src/logic/transfer-fees";
import { sellPrice } from "../../src/logic/offers";
import type { Offer } from "../../src/data/types";
import { makeTestPlayer } from "./fixtures";

/**
 * The soft cap as a function, before anything calls it.
 *
 * There is no foreign buyer in the game yet - every SPRZEDAZ card draws from
 * the current Ekstraklasa - so the last block here proves the function is
 * NOT wired into the domestic path. Applying it there would cap a price that
 * has no reason to be capped.
 */

describe("softCapForeignOffer - shape", () => {
  test("is the identity up to the knee", () => {
    for (let fee = 0; fee <= FOREIGN_FEE_SOFT_KNEE; fee += 0.05) {
      expect(softCapForeignOffer(fee)).toBeCloseTo(fee, 12);
    }
    expect(softCapForeignOffer(FOREIGN_FEE_SOFT_KNEE)).toBe(FOREIGN_FEE_SOFT_KNEE);
  });

  test("is continuous in value and in first derivative at the knee", () => {
    const h = 1e-6;
    const below = softCapForeignOffer(FOREIGN_FEE_SOFT_KNEE - h);
    const above = softCapForeignOffer(FOREIGN_FEE_SOFT_KNEE + h);
    expect(above - below).toBeCloseTo(0, 5);
    // The identity's slope is 1, so the branch above the knee has to start
    // at 1 as well - otherwise there is a visible kink where saturation
    // begins.
    const slopeAbove = (softCapForeignOffer(FOREIGN_FEE_SOFT_KNEE + h) - FOREIGN_FEE_SOFT_KNEE) / h;
    expect(slopeAbove).toBeCloseTo(1, 4);
  });

  test("rises for every raw fee and never reaches the asymptote", () => {
    let previous = -1;
    for (let fee = 0; fee <= 200; fee += 0.25) {
      const capped = softCapForeignOffer(fee);
      expect(capped).toBeGreaterThan(previous);
      expect(capped).toBeLessThan(MAX_UNHAGGLED_FOREIGN_FEE);
      previous = capped;
    }
  });

  test("leaves room for a full successful haggle under the hard ceiling", () => {
    for (const fee of [6.5, 8, 12, 40, 1000]) {
      expect(softCapForeignOffer(fee) * (1 + HAGGLE_SALE_BONUS)).toBeLessThan(MAX_FOREIGN_FEE);
    }
  });

  test("the constants sit in the order the spec requires", () => {
    expect(MAX_DOMESTIC_FEE).toBeLessThanOrEqual(FOREIGN_FEE_SOFT_KNEE);
    expect(FOREIGN_FEE_SOFT_KNEE).toBeLessThan(MAX_UNHAGGLED_FOREIGN_FEE);
    expect(MAX_UNHAGGLED_FOREIGN_FEE).toBeCloseTo(MAX_FOREIGN_FEE / (1 + HAGGLE_SALE_BONUS), 12);
  });
});

/** A SPRZEDAZ offer whose buyer is foreign, priced above the domestic
 * ceiling - the shape sellPrice sees once the card generator has already
 * soft-capped the quote inside buyers.ts. */
const foreignSaleFixture = (): Offer => ({
  typ: "SPRZEDAZ",
  zawodnik: makeTestPlayer("target"),
  cena: 9.1,
  sourceClub: null,
  buyer: { clubId: "ajax", name: "Ajax", origin: "foreign" },
  staffAssessment: {
    source: "coach",
    focus: "potential",
    outlook: "leagueLevel",
    confidence: "medium",
    isFirstObservation: true,
  },
  analystReport: {
    metrics: [
      { metricId: "goalsPreventedPer90", percentile: 50, value: 0 },
      { metricId: "positioningErrorAverage", percentile: 50, value: 2.06 },
    ],
    minutes: 900,
    sampleTier: "medium",
    period: { season: 1, window: "summer" },
    contextTier: "mid",
  },
});

describe("the soft cap is applied once, while pricing foreign candidates", () => {
  test("buyers.ts is the only caller in src", () => {
    // Task 4 adds src/logic/buyers.ts, which calls softCapForeignOffer as
    // part of pure buyer pricing; Task 7 wires that pricing into the card
    // generator's SPRZEDAZ branch, through buyers.ts's own exports, never by
    // calling softCapForeignOffer a second time. A second caller would mean
    // a foreign fee gets capped twice, which is not the same curve.
    const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../src");
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const isTransferFees = full.endsWith("transfer-fees.ts");
        const isBuyers = full.endsWith("buyers.ts");
        const source = readFileSync(full, "utf8");
        if (!isTransferFees && !isBuyers && /softCapForeignOffer/.test(source)) {
          offenders.push(full);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  test("selling never caps a foreign price again", () => {
    const offer = foreignSaleFixture();
    expect(sellPrice(offer, 0)).toBe(offer.cena);
  });
});

describe("softCapForeignOfferWithParams - the scanning kernel", () => {
  test("the production wrapper is the kernel at the pinned constants", () => {
    for (const fee of [0, 3, 6, 7.5, 20]) {
      expect(softCapForeignOffer(fee)).toBe(
        softCapForeignOfferWithParams(fee, FOREIGN_FEE_SOFT_KNEE, MAX_UNHAGGLED_FOREIGN_FEE)
      );
    }
  });

  test("a higher knee saturates later", () => {
    const low = softCapForeignOfferWithParams(8, 5.5, MAX_UNHAGGLED_FOREIGN_FEE);
    const high = softCapForeignOfferWithParams(8, 6.9, MAX_UNHAGGLED_FOREIGN_FEE);
    expect(high).toBeGreaterThan(low);
  });

  test("refuses inputs that would make the curve meaningless", () => {
    expect(() => softCapForeignOfferWithParams(-1, 6, 9)).toThrow(/raw fee/);
    expect(() => softCapForeignOfferWithParams(Number.NaN, 6, 9)).toThrow(/raw fee/);
    // Below the domestic limit the foreign path would price the same raw fee
    // BELOW the domestic one across the whole domestic band.
    expect(() => softCapForeignOfferWithParams(7, MAX_DOMESTIC_FEE - 0.1, 9)).toThrow(/knee/);
    expect(() => softCapForeignOfferWithParams(7, 9, 9)).toThrow(/cap/);
  });
});
