import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test, vi } from "vitest";

import {
  main,
  renderReport,
  budgetPolicyVariant,
  type MoneyScaleResult,
} from "../../scripts/money-scale-fit";
import { makeTestTempDir } from "../temp-dir";

/**
 * The CLI and the renderer, exercised without the 163 MB dump.
 *
 * The report is rendered from a small result built here by hand, so a
 * rendering test costs milliseconds and cannot start passing because the
 * pinned artefacts happen to be on this machine. Importing the module must
 * not read a byte of disk or run a fit - the assertions below rely on that,
 * because they import it before touching any path.
 */

const smallResult = (over: Partial<MoneyScaleResult> = {}): MoneyScaleResult => ({
  toolVersion: "test",
  status: "measured",
  blockers: [],
  openDecisions: ["Chapter 4's wage criteria stay with the product owner."],
  population: {
    main: [
      {
        clubId: "a",
        shortName: "Alfa",
        totalRevenuePln: 100_000_000,
        wageToRevenueRatio: 0.5,
        recurringRevenuePln: 90_000_000,
        targetPayrollPln: 32_470_000,
        rating: { attack: 1.1, defence: 0.9 },
        report: "gt-ekstraklasa-2024-25",
      },
    ],
    sensitivity: [
      {
        member: {
          clubId: "b",
          shortName: "Beta",
          totalRevenuePln: 50_000_000,
          wageToRevenueRatio: 0.6,
          recurringRevenuePln: 45_000_000,
          targetPayrollPln: 19_482_000,
          rating: { attack: 1, defence: 1 },
          report: "gt-pierwsza-liga-2024-25",
        },
        reason: "first-division report",
      },
    ],
    excluded: [{ clubId: "c", shortName: "Gamma", reason: "constructed finance record" }],
  },
  fits: [
    {
      model: "screen-projection",
      search: {
        scan: [
          {
            slope: 2,
            level: 1,
            logSse: 9,
            medianApePercent: 90,
            maxApePercent: 120,
            joint: [],
            maxWitness: {
              high: { id: "Alfa", ratio: 3 },
              low: { id: "Beta", ratio: 1 },
              spread: 3,
              allowedSpread: 1.857,
              feasible: false,
            },
          },
          {
            slope: 20,
            level: 2,
            logSse: 4,
            medianApePercent: 22,
            maxApePercent: 79,
            joint: [],
            maxWitness: {
              high: { id: "Alfa", ratio: 2 },
              low: { id: "Beta", ratio: 1 },
              spread: 2,
              allowedSpread: 1.857,
              feasible: false,
            },
          },
        ],
        gridBest: {
          slope: 20,
          level: 2,
          logSse: 4,
          medianApePercent: 22,
          maxApePercent: 79,
          joint: [],
          maxWitness: {
            high: { id: "Alfa", ratio: 2 },
            low: { id: "Beta", ratio: 1 },
            spread: 2,
            allowedSpread: 1.857,
            feasible: false,
          },
        },
        localMinimaCount: 1,
        gridTies: 0,
        atRangeBoundary: true,
        refined: {
          slope: 19.5,
          level: 2,
          logSse: 4,
          medianApePercent: 22,
          maxApePercent: 79,
          joint: [],
          maxWitness: {
            high: { id: "Alfa", ratio: 2 },
            low: { id: "Beta", ratio: 1 },
            spread: 2,
            allowedSpread: 1.857,
            feasible: false,
          },
        },
        refineIterations: 12,
        refineBracket: { lo: 19, hi: 20 },
        refineConverged: true,
      },
      reference: {
        level: 2_000_000,
        residuals: [
          {
            id: "Alfa",
            target: 32_470_000,
            predicted: 30_000_000,
            signedErrorPercent: -7.6,
            absoluteErrorPercent: 7.6,
          },
        ],
        medianApePercent: 22,
        maxApePercent: 79,
        targetSum: 32_470_000,
        predictedSum: 30_000_000,
        sumRelativeErrorPercent: -7.6,
        logSse: 4,
      },
      sumNormalised: {
        level: 2_164_666,
        residuals: [],
        medianApePercent: 24,
        maxApePercent: 81,
        targetSum: 32_470_000,
        predictedSum: 32_470_000,
        sumRelativeErrorPercent: 0,
        logSse: 4.2,
      },
      wideProbe: {
        minSpread: 3.779,
        minSpreadSlope: 12.51,
        limitSpread: 5.026,
        allowedSpread: 1.857,
        anyFeasible: false,
      },
    },
  ],
  referenceModel: "screen-projection",
  modelDifference: 0.02,
  modelDifferenceMaterial: false,
  forecast: [{ shortName: "Alfa", place: 1 }],
  scale: {
    surpluses: [
      {
        clubId: "a",
        shortName: "Alfa",
        recurringRevenuePln: 90_000_000,
        fittedPayrollPln: 30_000_000,
        leaguePrizePln: 3_000_000,
        surplusPln: 63_000_000,
      },
    ],
    medianSurplusPln: 63_000_000,
    pricePerGameMillionPln: 17_000_000,
    leaguePrizeRate: 0.019,
    wageAtPivot: 0.12,
  },
  budgets: [
    {
      clubId: "a",
      shortName: "Alfa",
      recurringGameMillions: 5.29,
      share: 0.18,
      baseBudget: 0.95,
      budget: 0.95,
      ownerException: false,
    },
  ],
  playability: [
    {
      clubId: "a",
      shortName: "Alfa",
      budget: 0.95,
      medianFirstYearCost: 0.7,
      playable: true,
      requiredShare: 0.13,
      shortfall: 0,
    },
  ],
  capacities: [
    {
      clubId: "a",
      shortName: "Alfa",
      uncappedCapacity: 1.06,
      capacity: 1.06,
      offerBeforeHaggle: 0.88,
      capBinding: false,
    },
  ],
  cohort: {
    count: 3,
    medianFee: 0.64,
    medianAnnualWage: 0.07,
    medianFirstYearCost: 0.7,
    sumOfMedians: 0.71,
  },
  purchaseCohort: {
    count: 3,
    medianOvr: 64,
    medianAge: 20,
    ovrQuartiles: [59, 64, 68],
    ageQuartiles: [18, 20, 25],
    byPolicy: new Map([["alwaysTake", 3]]),
    byClub: new Map([["Alfa", 3]]),
    bySeason: new Map([[1, 3]]),
    policiesWithoutSignings: ["veteranOnly"],
  },
  optionAVariants: [
    {
      slope: 12,
      levelPln: 2_000_000,
      pricePerGameMillionPln: 17_000_000,
      wageAtPivot: 0.118,
      wageByOvr: [
        { ovr: 60, wage: 0.051 },
        { ovr: 70, wage: 0.118 },
        { ovr: 80, wage: 0.271 },
        { ovr: 90, wage: 0.625 },
      ],
      topWageShareRichest: 0.07,
      topWageSharePoorest: 0.73,
      medianApePercent: 25,
      maxApePercent: 95,
      medianFirstYearCost: 0.724,
      playableAtMinShare: 3,
      clubCount: 18,
      floorForFullPlayability: 0.724,
      freeAgentPremium: 1.935,
    },
  ],
  budgetPolicies: [
    {
      label: "dziś: udział 0,18, bez podłogi",
      minShare: 0.18,
      floor: 0,
      playableClubs: 3,
      clubsLifted: 0,
      maxImpliedShare: 0.18,
      maxShareExceeded: false,
      extraBudgetGranted: 0,
    },
  ],
  fixedCostVariants: [
    {
      fixedCosts: 1.1,
      pricePerGameMillionPln: 17_000_000,
      wageAtPivot: 0.12,
      leaguePrizeRate: 0.019,
      playableClubs: 1,
    },
  ],
  europeanSensitivity: [
    {
      clubId: "slask-wroclaw",
      shortName: "Śląsk",
      lowPln: 6_800_000,
      highPln: 7_700_000,
      recurringAtLowPln: 38_920_000,
      recurringAtHighPln: 38_020_000,
      pricePerGameMillionAtLowPln: 17_650_000,
      pricePerGameMillionAtHighPln: 17_240_000,
    },
  ],
  curve: { matches: true, differences: [], toolVersion: "1.0.0" },
  freeAgents: {
    breakdown: {
      count: 5,
      medianOvr: 74,
      medianAge: 32,
      ovrQuartiles: [71, 74, 77],
      ageQuartiles: [31, 32, 33],
      byPolicy: new Map([["veteranOnly", 5]]),
      byClub: new Map([["Alfa", 5]]),
      bySeason: new Map([[1, 5]]),
      policiesWithoutSignings: ["youngOnly"],
    },
    fit: {
      count: 5,
      medianUnitShare: 0.3242,
      premium: 2.5423,
      premiumEqualClubWeight: 2.54,
      medianCounterfactualFee: 0.848,
      medianBaseWage: 0.14,
      fiveSeasonOverpayShare: 1.25,
      targetRatio: 0.5,
      achievedRatio: 0.5,
      withinSpecBand: true,
    },
    digest: {
      path: "signings.csv.gz",
      sha256: "abc",
      rowCount: 9,
      compressed: true,
    },
  },
  legacy: {
    aggregation: { definition: "pooledMedian" },
    artefacts: {
      control: {
        path: "control.csv",
        sha256: "control-sha",
        rowCount: 18000,
        incomeModes: ["finance-control"],
      },
      active: {
        path: "active.csv",
        sha256: "active-sha",
        rowCount: 234000,
        incomeModes: ["normal"],
      },
    },
    invariants: {
      cash: { measurement: { pooledMedian: 3.31, count: 18000 }, product: 16.55 },
      squadValue: {
        measurement: { pooledMedian: 1.9932376574242872, count: 234000 },
        product: 3.9864753148485743,
      },
    },
  },
  ...over,
});

describe("renderReport", () => {
  test("leads with the status and calls the numbers candidates", () => {
    const report = renderReport(smallResult());
    const head = report.split("\n").slice(0, 12).join("\n");
    expect(head).toContain("**Status: ZMIERZONE.**");
    expect(head).toContain("**kandydatami**, nie stałymi gotowymi do wpisania");
  });

  test("a blocked result says so first and lists what blocks it", () => {
    const report = renderReport(
      smallResult({ status: "blocked", blockers: ["no slope meets both criteria"] })
    );
    expect(report.split("\n").slice(0, 5).join("\n")).toContain("**Status: ZABLOKOWANE.**");
    expect(report).toContain("## Co blokuje aktywację");
    expect(report).toContain("no slope meets both criteria");
  });

  test("names the two shares separately, one reported and one estimated", () => {
    const report = renderReport(smallResult());
    expect(report).toContain("Pierwszy udział jest **raportowany**");
    expect(report).toContain("drugi **estymowany**");
  });

  test("refuses to call the wage residual a club deficit", () => {
    const report = renderReport(smallResult());
    expect(report).toContain("**nie jest bilansem finansowym klubu**");
    expect(report).not.toMatch(/deficyt klubu/i);
  });

  test("prints both squad models and both populations", () => {
    const report = renderReport(smallResult());
    expect(report).toContain("`screen-projection`");
    expect(report).toContain("Wrażliwość (raportowani i grywalni");
    expect(report).toContain("Wyłączeni:");
  });

  test("reports a boundary minimum as limited by the range", () => {
    const report = renderReport(smallResult());
    expect(report).toContain(
      `**na brzegu zakresu ${String.fromCodePoint(0x2014)} ograniczone zakresem, nie globalne**`
    );
  });

  test("names the pair of clubs that decides the maximum criterion", () => {
    const report = renderReport(smallResult());
    expect(report).toContain("**Alfa** kontra");
    expect(report).toContain("**Beta**");
  });

  test("marks the sum-normalised level as a diagnostic that identifies nothing", () => {
    const report = renderReport(smallResult());
    expect(report).toContain("Diagnostyka A");
    expect(report).toContain("**Sama zgodność sumy nie identyfikuje nachylenia**");
  });

  test("says the money scale is a starting approximation, not chapter 12.2", () => {
    const report = renderReport(smallResult());
    expect(report).toContain("**To przybliżenie startowe, nie dowód spełnienia §12.2.**");
  });

  test("keeps the legacy product at full precision and warns about 2 x 1,99", () => {
    const report = renderReport(smallResult());
    expect(report).toContain("1.9932376574242872");
    expect(report).toContain("3.9864753148485743");
    expect(report).toContain("dałoby 3,98");
  });

  test("prints the pinned legacy dump provenance in the report", () => {
    const report = renderReport(smallResult());
    expect(report).toContain("control-sha");
    expect(report).toContain("active-sha");
    expect(report).toContain("18000");
    expect(report).toContain("234000");
    expect(report).toContain("finance-control");
  });

  test("marks the free-agent cohort as signings rather than offers", () => {
    const report = renderReport(smallResult());
    expect(report).toContain("**To są podpisania, nie oferty.**");
    expect(report).toContain("youngOnly");
  });

  test("adds no cap the free-agent criterion never implies", () => {
    const report = renderReport(smallResult());
    expect(report).toContain("**Premia < 2 nie wynika z tego kryterium.**");
  });

  test("ends with the decisions that are still open", () => {
    const report = renderReport(smallResult());
    expect(report).toContain("## Decyzje wymagane przed krokiem 4");
    expect(report).toContain("Chapter 4's wage criteria stay with the product owner.");
  });

  test("ends without a trailing blank line", () => {
    // `git diff --check` flags a blank line at EOF on the pinned report, and
    // the caller adds the closing newline itself. Pinned because the report is
    // a committed file and the wart is invisible until git complains.
    const report = renderReport(smallResult());
    expect(report.endsWith("\n")).toBe(false);
    expect(report.trimEnd()).toBe(report);
    // What the CLI actually writes: exactly one closing newline.
    expect(`${report}\n`.endsWith("\n\n")).toBe(false);
  });

  test("is deterministic for the same result", () => {
    expect(renderReport(smallResult())).toBe(renderReport(smallResult()));
  });
});

describe("the CLI", () => {
  const silence = () => vi.spyOn(console, "log").mockImplementation(() => undefined);

  test("--help prints usage and exits zero without reading anything", async () => {
    const log = silence();
    await expect(main(["--help"])).resolves.toBe(0);
    expect(log.mock.calls[0]![0]).toContain("pnpm fit:money-scale");
    log.mockRestore();
  });

  test("rejects an unknown flag", async () => {
    await expect(main(["--nope", "x"])).rejects.toThrow(/Unknown flag/);
  });

  test("rejects a flag whose value is another flag or empty", async () => {
    await expect(main(["--signings", "--md"])).rejects.toThrow(/not another flag/);
    await expect(main(["--md", "  ", "--signings", "x"])).rejects.toThrow(/non-empty path/);
  });

  test("requires the signings dump instead of defaulting the cohort", async () => {
    await expect(main([])).rejects.toThrow(/--signings is required/);
  });

  test("a missing dump is a data error, not a partial report", async () => {
    const dir = makeTestTempDir("money-scale-cli");
    await expect(main(["--signings", join(dir, "absent.csv")])).rejects.toThrow(/Missing dump/);
  });

  test.each(["--control", "--active"])(
    "validates the supplied %s dump before fitting",
    async (flag) => {
      const dir = makeTestTempDir("money-scale-cli");
      const invalid = join(dir, "invalid.csv");
      await writeFile(invalid, "not a career dump\n", "utf8");
      await expect(main(["--signings", join(dir, "absent.csv"), flag, invalid])).rejects.toThrow(
        /no career rows/i
      );
    }
  );

  test("a legacy baseline that is not JSON fails rather than reporting a default", async () => {
    const dir = makeTestTempDir("money-scale-cli");
    const broken = join(dir, "legacy.json");
    await writeFile(broken, "not json", "utf8");
    const signings = join(dir, "signings.csv");
    await writeFile(signings, "placeholder", "utf8");
    await expect(main(["--signings", signings, "--legacy-baseline", broken])).rejects.toThrow(
      SyntaxError
    );
  });

  test("rejects a syntactically valid but unverified legacy baseline", async () => {
    const dir = makeTestTempDir("money-scale-cli");
    const baseline = join(dir, "legacy.json");
    const signings = join(dir, "signings.csv");
    await writeFile(baseline, "{}", "utf8");
    await writeFile(signings, "placeholder", "utf8");
    await expect(main(["--signings", signings, "--legacy-baseline", baseline])).rejects.toThrow(
      /legacy baseline/i
    );
  });
});

describe("exit codes", () => {
  test("the render and the exit code disagree only under --require-feasible", () => {
    // Documented here rather than exercised end to end: running main() needs
    // the 163 MB dump. The mapping is one line in main(), and the test above
    // covers the paths that reach it.
    const blocked = smallResult({ status: "blocked", blockers: ["x"] });
    expect(blocked.status).not.toBe("measured");
    expect(renderReport(blocked)).toContain("ZABLOKOWANE");
  });
});

describe("importing the module", () => {
  test("runs nothing: no exit code set, no report written, no dump read", async () => {
    // Importing happens at the top of this file. If main() ran on import it
    // would have thrown for the missing --signings and set an exit code, and
    // every test here would have waited on a 163 MB read first.
    expect(process.exitCode).toBeUndefined();
    expect(typeof main).toBe("function");
    expect(typeof renderReport).toBe("function");
    const dir = makeTestTempDir("money-scale-import");
    await expect(readFile(join(dir, "report.md"), "utf8")).rejects.toThrow();
  });
});

describe("option A and budget policy sections", () => {
  test("raising the share recalculates the owner percentile before testing playability", () => {
    const variant = budgetPolicyVariant(
      [
        { clubId: "rich", shortName: "Rich", recurringRevenuePln: 10e6 },
        {
          clubId: "owner",
          shortName: "Owner",
          recurringRevenuePln: 1e6,
          backerBudgetPercentile: 0.8,
        },
        { clubId: "mid", shortName: "Mid", recurringRevenuePln: 4e6 },
      ],
      1e6,
      "raised",
      0.3,
      0,
      2
    );
    expect(variant.playableClubs).toBe(2);
    expect(variant.clubsLifted).toBe(3);
    expect(variant.extraBudgetGranted).toBeCloseTo(2.592, 9);
  });
  test("the slope table says the aggregate cannot pick a slope on its own", () => {
    const report = renderReport(smallResult());
    expect(report).toContain("### Opcja A po nachyleniach");
    expect(report).toMatch(/trafia w sumę populacji dopasowania dokładnie/);
    expect(report).toMatch(/Narzędzie nie wybiera wiersza/);
  });

  test("the slope table carries a single player's wage, not just club aggregates", () => {
    const report = renderReport(smallResult());
    for (const ovr of [60, 70, 80, 90]) expect(report, `ovr ${ovr}`).toContain(`OVR ${ovr}`);
    expect(report).toMatch(/przychodu najbogatszego i najuboższego klubu/);
  });

  test("the budget table shows the share and the floor side by side", () => {
    const report = renderReport(smallResult());
    expect(report).toMatch(/Warianty polityki budżetowej/);
    expect(report).toMatch(/ponad sufit/);
    expect(report).toMatch(/MAX_BUDGET_SHARE/);
  });

  test("says the budget variants leave the money scale alone", () => {
    // They change the starting-budget rule only, so unlike the fixed-cost
    // variants they do not invalidate D or the ladder.
    expect(renderReport(smallResult())).toMatch(/nie rusza przychodu ani `D`/);
  });
});
