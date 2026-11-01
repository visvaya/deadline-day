import { describe, expect, test } from "vitest";

import { EUROPEAN_ADVANCE_ODDS } from "../../src/data/balance";
import { europeanExpectedIncome } from "../../src/logic/european-cups";
import {
  CUPS,
  STRENGTH_GRID,
  analyticCell,
  measureLeagueStrength,
  rawAdvance,
  runChecks,
  simulateCell,
  variantById,
  type CellAudit,
  type OddsTable,
} from "../../scripts/european-cups-audit-core";
import { parseEuropeanCupsCli } from "../../scripts/european-cups-audit-cli";
import { EUROPEAN_REFERENCE } from "../../scripts/european-cups-audit-reference";

const SEED = 0x4e05_7c01;

describe("analityka", () => {
  test("oczekiwany przychód zgadza się z silnikiem na całej siatce", () => {
    for (const cup of CUPS) {
      for (const strength of STRENGTH_GRID) {
        const cell = analyticCell(EUROPEAN_ADVANCE_ODDS, cup, strength);
        expect(cell.expectedIncome).toBeCloseTo(europeanExpectedIncome(cup, strength), 12);
      }
    }
  });

  test("rozkład długości kampanii sumuje się do jedynki", () => {
    for (const cup of CUPS) {
      const cell = analyticCell(EUROPEAN_ADVANCE_ODDS, cup, 65);
      expect(cell.legShares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    }
  });

  test("start w LK to zawsze dokładnie jedno losowanie", () => {
    for (const strength of STRENGTH_GRID) {
      expect(analyticCell(EUROPEAN_ADVANCE_ODDS, "LK", strength).expectedDraws).toBe(1);
    }
  });
});

describe("empiria", () => {
  test("lokalna symulacja jest zgodna z resolveEuropeanCampaign", () => {
    const { engineParity } = simulateCell(SEED, 500, EUROPEAN_ADVANCE_ODDS, "LM", 68, true);
    expect(engineParity).toBe(true);
  });

  test("podmiana samych stałych LK nie zmienia liczby losowań", () => {
    const baseline = variantById("baseline").odds;
    const variantB = variantById("B").odds;
    for (const cup of CUPS) {
      const before = simulateCell(SEED, 400, baseline, cup, 68, false).empirical;
      const after = simulateCell(SEED, 400, variantB, cup, 68, false).empirical;
      expect(after.meanDraws).toBe(before.meanDraws);
      expect(after.minDraws).toBe(before.minDraws);
      expect(after.maxDraws).toBe(before.maxDraws);
    }
  }, 30_000);

  test("empiryczny przychód trafia w wartość oczekiwaną modelu", () => {
    const { empirical } = simulateCell(SEED, 3000, EUROPEAN_ADVANCE_ODDS, "LE", 70, false);
    expect(empirical.meanIncome).toBeCloseTo(europeanExpectedIncome("LE", 70), 1);
  });
});

describe("progi", () => {
  const auditWith = (odds: OddsTable, runs: number): CellAudit[] =>
    CUPS.flatMap((cup) =>
      STRENGTH_GRID.map((strength) => ({
        analytic: analyticCell(odds, cup, strength),
        empirical: simulateCell(SEED, runs, odds, cup, strength, false).empirical,
        engineParity: null,
      }))
    );

  test("baseline przechodzi wszystkie progi wewnętrzne", () => {
    const checks = runChecks(auditWith(EUROPEAN_ADVANCE_ODDS, 1000), 1000);
    expect(checks.filter((c) => !c.passed)).toEqual([]);
  }, 30_000);

  /** The defect chapter 2 found: only `edge` is clamped, so a slope above
   * `1 - base` produces pQualify > 1 and every draw passes silently. The
   * audit has to see it, which is why rawAdvance does not clamp. */
  test("nachylenie wypychające pQualify ponad 1 zapala próg zakresu", () => {
    const broken: OddsTable = {
      ...EUROPEAN_ADVANCE_ODDS,
      LK: { ...EUROPEAN_ADVANCE_ODDS.LK, pQualifyBase: 0.7, pQualifySlope: 0.9 },
    };
    expect(rawAdvance(broken, "LK", 80).pQualify).toBeGreaterThan(1);
    const range = runChecks(auditWith(broken, 200), 200).find((c) => c.id === "zakres")!;
    expect(range.passed).toBe(false);
    expect(range.detail).toContain("LK@80");
  });

  test("niemonotoniczne nachylenie zapala próg monotoniczności", () => {
    const broken: OddsTable = {
      ...EUROPEAN_ADVANCE_ODDS,
      LE: { ...EUROPEAN_ADVANCE_ODDS.LE, pQualifySlope: -0.3 },
    };
    const monotone = runChecks(auditWith(broken, 200), 200).find((c) => c.id === "monotonicznosc")!;
    expect(monotone.passed).toBe(false);
  });
});

describe("referencja siły", () => {
  test("pomiar jest deterministyczny wobec ziarna", () => {
    const first = measureLeagueStrength(SEED, 12);
    const second = measureLeagueStrength(SEED, 12);
    expect(second).toEqual(first);
  });

  test("obejmuje wszystkie osiemnaście klubów i porządkuje je po sile", () => {
    const reference = measureLeagueStrength(SEED, 12);
    expect(reference.clubs).toHaveLength(18);
    const medians = reference.clubs.map((c) => c.median);
    expect([...medians].sort((a, b) => b - a)).toEqual(medians);
  });
});

describe("materiał zewnętrzny", () => {
  /** The single rule the deleted docs/puchary.md broke: a projection printed
   * in the same column as model output, with no event definition. Nothing
   * pinned here may ever become a pass threshold. */
  test("żaden przypięty punkt nie jest progiem i każdy definiuje zdarzenie", () => {
    expect(EUROPEAN_REFERENCE.length).toBeGreaterThan(0);
    for (const point of EUROPEAN_REFERENCE) {
      expect(point.usableAsThreshold).toBe(false);
      expect(point.eventDefinition.length).toBeGreaterThan(20);
      expect(point.entryRound.length).toBeGreaterThan(0);
      expect(point.caveat.length).toBeGreaterThan(20);
    }
  });
});

describe("cli", () => {
  test("domyślne wartości", () => {
    expect(parseEuropeanCupsCli([])).toEqual({
      runs: 20_000,
      seed: SEED,
      md: null,
      variant: "baseline",
      strengthSamples: 200,
      careers: 200,
    });
  });

  test("odrzuca nieznane flagi i niepoprawne liczby", () => {
    expect(() => parseEuropeanCupsCli(["--nope", "1"])).toThrow(/Unknown flag/);
    expect(() => parseEuropeanCupsCli(["--runs", "0"])).toThrow(/positive integer/);
    expect(() => variantById("C")).toThrow(/Unknown variant/);
  });
});
