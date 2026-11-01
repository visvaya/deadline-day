import { describe, expect, test } from "vitest";

import { hypotheticalLegacy, parseCsv, tierFor } from "../../scripts/legacy-scan-core";

describe("hypotheticalLegacy", () => {
  const row = { dziedzictwo: 600, wartoscKadry: 30, wartoscKadryMoj: 5 };

  test('"current" returns the dumped value unchanged', () => {
    expect(hypotheticalLegacy(row, "current")).toBe(600);
  });

  test("swaps the squad-value term for wartoscKadryMoj * M", () => {
    // dziedzictwo already contains wartoscKadryMoj * 2 (epilogue.ts), so the
    // swap removes that term, not wartoscKadry * 2: 600 - 5*2 + 5*4 = 610.
    expect(hypotheticalLegacy(row, 4)).toBe(610);
  });

  test("degenerate case: M=2 returns current value unchanged", () => {
    const allSigned = { dziedzictwo: 600, wartoscKadry: 30, wartoscKadryMoj: 30 };
    expect(hypotheticalLegacy(allSigned, 2)).toBe(600);
  });

  test("rounds the result", () => {
    const fractional = { dziedzictwo: 600, wartoscKadry: 30.4, wartoscKadryMoj: 5.6 };
    // 600 - 5.6*2 + 5.6*3 = 600 - 11.2 + 16.8 = 605.6 → 606
    expect(hypotheticalLegacy(fractional, 3)).toBe(606);
  });
});

describe("tierFor", () => {
  const thresholds = [520, 650, 760, 870, 980];

  test("below the first threshold is the bottom tier", () => {
    expect(tierFor(400, thresholds)).toBe("CZŁOWIEK, KTÓRY ZRUJNOWAŁ KLUB");
  });

  test("exactly on a threshold clears it", () => {
    expect(tierFor(650, thresholds)).toBe("UCZCIWY WYROBNIK");
  });

  test("above the top threshold is the top tier", () => {
    expect(tierFor(1200, thresholds)).toBe("LEGENDA GABINETU");
  });

  test("one below a threshold stays in the lower tier", () => {
    expect(tierFor(649, thresholds)).toBe("ZAPOMNIANY");
  });
});

describe("parseCsv", () => {
  test("parses a well-formed dump, including the quoted tytul column", () => {
    const csv = [
      "clubId,polityka,seed,dziedzictwo,dziedzictwoZHandicapem,tytul,werdykt,ocena,wartoscKadry,wartoscKadryMoj",
      'lech-poznan,mixed,123,600,740,"UCZCIWY WYROBNIK",PRZEDŁUŻONY,250,30.5,5.2',
    ].join("\n");
    const rows = parseCsv(csv);
    expect(rows).toEqual([
      {
        clubId: "lech-poznan",
        polityka: "mixed",
        seed: 123,
        dziedzictwo: 600,
        tytul: "UCZCIWY WYROBNIK",
        werdykt: "PRZEDŁUŻONY",
        ocena: 250,
        wartoscKadry: 30.5,
        wartoscKadryMoj: 5.2,
      },
    ]);
  });

  test("handles a tytul containing a literal comma", () => {
    const csv = [
      "clubId,polityka,seed,dziedzictwo,dziedzictwoZHandicapem,tytul,werdykt,ocena,wartoscKadry,wartoscKadryMoj",
      'wisla-plock,alwaysPass,7,300,300,"CZŁOWIEK, KTÓRY ZRUJNOWAŁ KLUB",ZWOLNIONY,15,32.2,0',
    ].join("\n");
    const rows = parseCsv(csv);
    expect(rows[0]!.tytul).toBe("CZŁOWIEK, KTÓRY ZRUJNOWAŁ KLUB");
  });
});
