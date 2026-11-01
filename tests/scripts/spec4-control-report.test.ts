import { expect, test } from "vitest";

import {
  affordableStrengtheningShare,
  financialPressure,
  firstWindowGate,
  starDilemma,
} from "../../scripts/spec4-control-dilemmas-core";
import {
  rawResultVsBudget,
  titlesByAdvantageQuartile,
} from "../../scripts/spec4-control-finance-core";
import { assertUniqueSeasonRows, toSeasonRow } from "../../scripts/spec4-control-inputs";

const dilemma = (over: Partial<Record<string, number | string>>) => ({
  dilemmaSchemaVersion: 1,
  engineVersion: "2026-09-22.2",
  incomeMode: "normal",
  clubId: "legia-warszawa",
  policyName: "alwaysPass",
  seed: 1,
  usefulPurchaseCost: 1,
  externalCards: 0,
  paidExternalCards: 0,
  externalAffordable: 0,
  externalStrengthening: 0,
  externalAffordableStrengthening: 0,
  atPriceCapCards: 0,
  windows: 10,
  windowsUnderPressure: 0,
  salesAccepted: 0,
  pressureSales: 0,
  ownStarSaleCards: 0,
  ownStarSalesAccepted: 0,
  firstWindowKupno: 2,
  firstWindowUsefulKupno: 1,
  firstWindowUsefulAffordableKupno: 1,
  firstWindowUsefulHaggleAffordableKupno: 1,
  ...over,
});

test("first window gate splits failures into price and targeting", () => {
  const rows = [
    dilemma({ seed: 1 }),
    dilemma({ seed: 2, firstWindowUsefulAffordableKupno: 0 }),
    dilemma({ seed: 3, firstWindowUsefulKupno: 0, firstWindowUsefulAffordableKupno: 0 }),
    dilemma({ seed: 4, firstWindowUsefulKupno: 2, firstWindowUsefulAffordableKupno: 2 }),
    dilemma({ seed: 5, policyName: "alwaysTake", firstWindowUsefulKupno: 0 }),
  ];
  const [legia] = firstWindowGate(rows as never);
  expect(legia).toMatchObject({
    windows: 4,
    shareWithUseful: 0.5,
    failedOnPrice: 1,
    failedOnTargeting: 1,
    passesShare: false,
  });
  // alwaysPass windows carry 1, 0, 0, 2 affordable useful cards: median 0.5 under R-7 interpolation.
  expect(legia!.medianUsefulAffordable).toBe(0.5);
  expect(legia!.passesMedian).toBe(false);
});

test("first window gate also reports the haggle-reachable path", () => {
  const rows = [
    // Success on the list price already.
    dilemma({
      seed: 1,
      firstWindowUsefulKupno: 1,
      firstWindowUsefulAffordableKupno: 1,
      firstWindowUsefulHaggleAffordableKupno: 1,
    }),
    // Failed on price, but a haggle would have reached it.
    dilemma({
      seed: 2,
      firstWindowUsefulKupno: 1,
      firstWindowUsefulAffordableKupno: 0,
      firstWindowUsefulHaggleAffordableKupno: 1,
    }),
    // Failed on price, unreachable even with a haggle.
    dilemma({
      seed: 3,
      firstWindowUsefulKupno: 1,
      firstWindowUsefulAffordableKupno: 0,
      firstWindowUsefulHaggleAffordableKupno: 0,
    }),
    // No useful KUPNO card shown at all - failedOnTargeting, not failedOnPrice.
    dilemma({
      seed: 4,
      firstWindowUsefulKupno: 0,
      firstWindowUsefulAffordableKupno: 0,
      firstWindowUsefulHaggleAffordableKupno: 0,
    }),
  ];
  const [legia] = firstWindowGate(rows as never);
  expect(legia).toMatchObject({
    windows: 4,
    failedOnPrice: 2,
    failedOnTargeting: 1,
    shareWithUsefulHaggle: 0.5,
    failedOnPriceButHaggleReachable: 1,
  });
});

test("affordable-strengthening share pools cards, not careers", () => {
  const rows = [
    dilemma({
      externalCards: 10,
      paidExternalCards: 8,
      externalAffordableStrengthening: 1,
      atPriceCapCards: 5,
    }),
    dilemma({
      seed: 2,
      externalCards: 30,
      paidExternalCards: 22,
      externalAffordableStrengthening: 9,
    }),
  ];
  const rowsResult = affordableStrengtheningShare(rows as never);
  const byClub = rowsResult.find((r) => r.key === "legia-warszawa")!;
  expect(byClub.share).toBeCloseTo(10 / 40);
  expect(byClub.atPriceCapShareOfExternal).toBeCloseTo(5 / 40);
  expect(byClub.atPriceCapShareOfPaidCards).toBeCloseTo(5 / 30);
  expect(byClub.dimension).toBe("club");
  const byPolicy = rowsResult.find((r) => r.key === "alwaysPass")!;
  expect(byPolicy.dimension).toBe("policy");
});

test("pressure sales are rated per hundred accepted sales", () => {
  const rows = [dilemma({ salesAccepted: 4, pressureSales: 1, windowsUnderPressure: 5 })];
  expect(financialPressure(rows as never)[0]).toMatchObject({
    windowsUnderPressureShare: 0.5,
    thresholdCrossingSalesPer100Sales: 25,
    thresholdCrossingSalesPerCareer: 1,
  });
});

test("a club with zero windows reports no pressure share, not zero", () => {
  const rows = [
    dilemma({ windows: 0, salesAccepted: 0, pressureSales: 0, windowsUnderPressure: 0 }),
  ];
  expect(financialPressure(rows as never)[0]).toMatchObject({
    windowsUnderPressureShare: null,
  });
});

test("star dilemma pairs the two policies by club and seed", () => {
  const raw = [
    {
      clubId: "legia-warszawa",
      polityka: "youngOnlyBuy",
      seed: 1,
      dziedzictwo: 500,
      kasa: 1,
      tytul: "A",
    },
    {
      clubId: "legia-warszawa",
      polityka: "youngBuySellStars",
      seed: 1,
      dziedzictwo: 510,
      kasa: 3,
      tytul: "B",
    },
    {
      clubId: "legia-warszawa",
      polityka: "youngOnlyBuy",
      seed: 2,
      dziedzictwo: 400,
      kasa: 1,
      tytul: "A",
    },
    {
      clubId: "legia-warszawa",
      polityka: "youngBuySellStars",
      seed: 2,
      dziedzictwo: 400,
      kasa: 1,
      tytul: "A",
    },
  ];
  const dilemmas = [
    dilemma({ policyName: "youngBuySellStars", seed: 1, ownStarSalesAccepted: 1 }),
    dilemma({ policyName: "youngBuySellStars", seed: 2 }),
  ];
  const [row] = starDilemma(raw, dilemmas as never);
  expect(row).toMatchObject({ pairedSeeds: 2, careersWithStarSale: 1 });
  expect(row!.legacy.meanDiff).toBeCloseTo(5);
  expect(row!.legacyWhenSold.meanDiff).toBeCloseTo(10);
});

test("reinvestment ratio compares the raw result with the budget change", () => {
  const season = (s: number, handover: number | null) => ({
    clubShortName: "Legia",
    clubId: "legia-warszawa",
    policyName: "alwaysPass",
    seed: 1,
    season: s,
    initialBudget: 1,
    actualBalanceWithoutTransfersAndCups: 2,
    cashAtHandover: handover,
  });
  const [row] = rawResultVsBudget([season(1, null), season(2, 2.2)] as never);
  expect(row).toMatchObject({ medianRawResultSum: 4 });
  expect(row!.medianBudgetChange).toBeCloseTo(1.2);
  expect(row!.medianRateResidual).toBeCloseTo(0);
});

test("advantage quartiles cover all eighteen clubs exactly once", () => {
  const rows = titlesByAdvantageQuartile([]);
  expect(rows.map((r) => r.clubIds.length)).toEqual([5, 5, 4, 4]);
  expect(new Set(rows.flatMap((r) => r.clubIds)).size).toBe(18);
});

test("advantage quartiles count careers and give title shares that sum to one", () => {
  const empty = titlesByAdvantageQuartile([]);
  const [q1Club, q2Club] = [empty[0]!.clubIds[0]!, empty[1]!.clubIds[0]!];
  const raw = [
    { clubId: q1Club, tytul: "MISTRZ" },
    { clubId: q1Club, tytul: "MISTRZ" },
    { clubId: q1Club, tytul: "ARCHITEKT" },
    { clubId: q2Club, tytul: "ARCHITEKT" },
  ];
  const rows = titlesByAdvantageQuartile(raw);
  const q1 = rows[0];
  expect(q1!.careers).toBe(3);
  expect(q1!.titleShares.MISTRZ).toBeCloseTo(2 / 3);
  expect(q1!.titleShares.ARCHITEKT).toBeCloseTo(1 / 3);
  const q1ShareSum = Object.values(q1!.titleShares).reduce((total, share) => total + share, 0);
  expect(q1ShareSum).toBeCloseTo(1);
  const q3 = rows[2];
  expect(q3!.careers).toBe(0);
  expect(q3!.titleShares).toEqual({});
});

const seasonRow = (over: Partial<Record<string, string>>): Record<string, string> => ({
  dumpSchemaVersion: "5",
  incomeMode: "finance-control",
  clubShortName: "Legia",
  policyName: "alwaysPass",
  seed: "1",
  season: "1",
  actualBalanceWithoutTransfersAndCups: "2",
  initialBudget: "1",
  cashAtHandover: "",
  ...over,
});

test("a malformed cashAtHandover throws instead of becoming NaN", () => {
  expect(() => toSeasonRow(seasonRow({ cashAtHandover: "not-a-number" }))).toThrow(
    /cashAtHandover.*not a finite number/
  );
});

test("a duplicated season row within a career throws", () => {
  const seasons = [
    { clubId: "legia-warszawa", policyName: "alwaysPass", seed: 1, season: 1 },
    { clubId: "legia-warszawa", policyName: "alwaysPass", seed: 1, season: 1 },
  ];
  expect(() => assertUniqueSeasonRows(seasons)).toThrow(/duplicate season row/);
});
