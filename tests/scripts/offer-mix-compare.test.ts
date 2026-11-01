import { describe, expect, test } from "vitest";

import { compareOfferMix, parseOfferDump } from "../../scripts/offer-mix-compare-core";

/**
 * Pins the parser and the per-game share arithmetic. The tool exists to
 * answer one question - did filtering unusable signings change what the
 * player actually sees - and an average of counts rather than of per-game
 * shares would answer it wrong whenever careers differ in length.
 */

const HEADER =
  "poziom,polityka,seed,ofertyKupno,ofertySprzedaz,ofertyPrzedluzenie,ofertyWolny,ofertyPanic";

const dump = (...rows: string[]): string => [HEADER, ...rows].join("\n");

describe("offer mix dump parsing", () => {
  test("a missing offer column is named in the error", () => {
    const withoutPanic =
      "poziom,polityka,seed,ofertyKupno,ofertySprzedaz,ofertyPrzedluzenie,ofertyWolny\ntrudny,alwaysPass,1,1,1,1,1";

    expect(() => parseOfferDump(withoutPanic)).toThrow(/ofertyPanic/);
  });

  test("a missing key column is named in the error", () => {
    const withoutSeed =
      "poziom,polityka,ofertyKupno,ofertySprzedaz,ofertyPrzedluzenie,ofertyWolny,ofertyPanic\ntrudny,alwaysPass,1,1,1,1,1";

    expect(() => parseOfferDump(withoutSeed)).toThrow(/seed/);
  });

  test("a duplicate level/policy/seed row is rejected", () => {
    expect(() =>
      parseOfferDump(dump("trudny,alwaysPass,1,4,2,2,1,1", "trudny,alwaysPass,1,4,2,2,1,1"))
    ).toThrow(/duplicate/);
  });

  test("a non-numeric count is rejected with its column name", () => {
    expect(() => parseOfferDump(dump("trudny,alwaysPass,1,4,x,2,1,1"))).toThrow(/ofertySprzedaz/);
  });

  test("shares are per game and sum to one", () => {
    const [row] = parseOfferDump(dump("trudny,alwaysPass,1,5,3,1,1,0")).rows;

    expect(row!.shares.KUPNO).toBeCloseTo(0.5, 10);
    expect(row!.shares.SPRZEDAZ).toBeCloseTo(0.3, 10);
    expect(row!.shares.PANIC).toBe(0);
    expect(Object.values(row!.shares).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
  });

  test("a game that showed no cards gets zero shares rather than NaN", () => {
    const [row] = parseOfferDump(dump("trudny,alwaysPass,1,0,0,0,0,0")).rows;

    expect(Object.values(row!.shares).every((value) => value === 0)).toBe(true);
  });
});

describe("paired offer mix comparison", () => {
  test("games of different length still contribute equal weight", () => {
    // Seed 1 shows 10 cards, seed 2 shows 2. Averaging counts would let the
    // long career dominate; averaging per-game shares must not.
    const before = dump("trudny,alwaysPass,1,5,5,0,0,0", "trudny,alwaysPass,2,1,1,0,0,0");
    // KUPNO goes 50% -> 0% on the long game and 50% -> 100% on the short one.
    // Per-game shares average those two moves to exactly zero.
    const after = dump("trudny,alwaysPass,1,0,10,0,0,0", "trudny,alwaysPass,2,2,0,0,0,0");

    const [cell] = compareOfferMix(before, after);

    expect(cell!.pairedSeeds).toBe(2);
    expect(cell!.shares.KUPNO.meanBefore).toBeCloseTo(0.5, 10);
    expect(cell!.shares.KUPNO.meanAfter).toBeCloseTo(0.5, 10);
    expect(cell!.shares.KUPNO.meanDiff).toBeCloseTo(0, 10);
    // The two per-seed deltas are -0.5 and +0.5: a zero mean with a real
    // spread, which is exactly what the standard error must report.
    expect(cell!.shares.KUPNO.standardError).toBeCloseTo(0.5, 10);
  });

  test("an exact paired delta is reported in fractions, not points", () => {
    const before = dump("sredni,alwaysTake,7,2,2,0,0,0");
    const after = dump("sredni,alwaysTake,7,1,3,0,0,0");

    const [cell] = compareOfferMix(before, after);

    expect(cell!.shares.KUPNO.meanBefore).toBeCloseTo(0.5, 10);
    expect(cell!.shares.KUPNO.meanAfter).toBeCloseTo(0.25, 10);
    expect(cell!.shares.KUPNO.meanDiff).toBeCloseTo(-0.25, 10);
    expect(cell!.shares.SPRZEDAZ.meanDiff).toBeCloseTo(0.25, 10);
    // A single pair has no spread to estimate.
    expect(cell!.shares.KUPNO.standardError).toBe(0);
  });

  test("a seed present on only one side is dropped, not paired", () => {
    const before = dump("latwy,alwaysPass,1,2,2,0,0,0", "latwy,alwaysPass,2,2,2,0,0,0");
    const after = dump("latwy,alwaysPass,1,4,0,0,0,0");

    const [cell] = compareOfferMix(before, after);

    expect(cell!.pairedSeeds).toBe(1);
    expect(cell!.droppedSeeds).toEqual([2]);
    expect(cell!.shares.KUPNO.meanDiff).toBeCloseTo(0.5, 10);
  });

  test("cells are compared separately per level and policy", () => {
    const before = dump("latwy,alwaysPass,1,2,2,0,0,0", "trudny,alwaysTake,1,2,2,0,0,0");
    const after = dump("latwy,alwaysPass,1,4,0,0,0,0", "trudny,alwaysTake,1,0,4,0,0,0");

    const cells = compareOfferMix(before, after);

    expect(cells).toHaveLength(2);
    expect(cells.map((cell) => `${cell.poziom}/${cell.polityka}`).sort()).toEqual([
      "latwy/alwaysPass",
      "trudny/alwaysTake",
    ]);
    expect(cells.find((cell) => cell.poziom === "latwy")!.shares.KUPNO.meanDiff).toBeCloseTo(
      0.5,
      10
    );
    expect(cells.find((cell) => cell.poziom === "trudny")!.shares.KUPNO.meanDiff).toBeCloseTo(
      -0.5,
      10
    );
  });
});
