import { describe, expect, test } from "vitest";

import { compareRuns, renderComparison } from "../../scripts/balance-compare-core";

const csv = (rows: readonly string[]): string =>
  ["poziom,polityka,seed,dziedzictwo,tytul,spadkiKadencja,sezonyRozegrane", ...rows].join("\n");

describe("paired balance comparison", () => {
  test("pairs by seed and reports the mean difference with its standard error", () => {
    const before = csv([
      'trudny,mixed,1,100,"ZAPOMNIANY",0,5',
      'trudny,mixed,2,200,"UCZCIWY WYROBNIK",1,4',
    ]);
    const after = csv([
      // Deliberately reversed order: pairing is by seed, not by row position.
      'trudny,mixed,2,180,"UCZCIWY WYROBNIK",1,4',
      'trudny,mixed,1,110,"ZAPOMNIANY",1,3',
    ]);

    const [cell] = compareRuns(before, after);

    expect(cell!.poziom).toBe("trudny");
    expect(cell!.pairedSeeds).toBe(2);
    // Differences are +10 and -20, so the mean is -5 and the SE is 15.
    expect(cell!.dziedzictwo.meanDiff).toBeCloseTo(-5, 10);
    expect(cell!.dziedzictwo.standardError).toBeCloseTo(15, 10);
    // Relegation is the BINARY spadkiKadencja > 0, matching what balance
    // reports as spadek% - seed 1 gained one, seed 2 already had one.
    expect(cell!.spadekRate.meanDiff).toBeCloseTo(0.5, 10);
    expect(cell!.sezonyRozegraneMedianAfter).toBe(3.5);
  });

  test("reads a quoted title containing a comma without shifting the columns", () => {
    // This title is real (epilogue.ts) and every column the decision rests on
    // sits AFTER it, so a naive split on "," would corrupt all of them.
    const before = csv(['trudny,mixed,1,10,"CZŁOWIEK, KTÓRY ZRUJNOWAŁ KLUB",1,2']);
    const after = csv(['trudny,mixed,1,20,"CZŁOWIEK, KTÓRY ZRUJNOWAŁ KLUB",1,2']);

    const [cell] = compareRuns(before, after);

    expect(cell!.dziedzictwo.meanDiff).toBeCloseTo(10, 10);
    expect(cell!.sezonyRozegraneMedianAfter).toBe(2);
    expect(cell!.tytulRates["CZŁOWIEK, KTÓRY ZRUJNOWAŁ KLUB"]!.meanDiff).toBeCloseTo(0, 10);
  });

  test("drops a seed missing from the after run", () => {
    const before = csv([
      'trudny,mixed,1,100,"ZAPOMNIANY",0,5',
      'trudny,mixed,9,300,"ARCHITEKT",0,5',
    ]);
    const after = csv(['trudny,mixed,1,110,"ZAPOMNIANY",0,5']);

    const [cell] = compareRuns(before, after);

    expect(cell!.pairedSeeds).toBe(1);
    expect(cell!.droppedSeeds).toEqual([9]);
  });

  test("drops a seed present only in the after run", () => {
    const before = csv(['trudny,mixed,1,100,"ZAPOMNIANY",0,5']);
    const after = csv([
      'trudny,mixed,1,110,"ZAPOMNIANY",0,5',
      'trudny,mixed,7,400,"LEGENDA GABINETU",0,5',
    ]);

    const [cell] = compareRuns(before, after);

    expect(cell!.pairedSeeds).toBe(1);
    expect(cell!.droppedSeeds).toEqual([7]);
  });

  test("renders rates as percentage points, converting both the value and its error", () => {
    const before = csv([
      'trudny,mixed,1,100,"ZAPOMNIANY",0,5',
      'trudny,mixed,2,100,"ZAPOMNIANY",0,5',
    ]);
    const after = csv([
      'trudny,mixed,1,110,"ZAPOMNIANY",1,5',
      'trudny,mixed,2,110,"ZAPOMNIANY",0,5',
    ]);

    const rendered = renderComparison(compareRuns(before, after));

    // The core holds 0.5 +/- 0.5 as a fraction; the report must convert both
    // halves, never just one of them.
    expect(rendered).toContain("+50,00 p.p.");
    expect(rendered).toContain("± 50,00 p.p.");
    // Legacy is not a rate: +10 points stays +10, and must never become +1000.
    expect(rendered).toContain("+10,00");
    expect(rendered).not.toContain("+1000");
  });
});
