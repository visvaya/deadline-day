import { expect, test } from "vitest";

import { renderReport, type Report } from "../../scripts/spec4-control-render";

const firstWindowRow = () => ({
  clubId: "legia-warszawa",
  windows: 4,
  shareWithUseful: 0.5,
  shareWithUsefulHaggle: 0.75,
  medianUsefulAffordable: 1,
  failedOnPrice: 1,
  failedOnPriceButHaggleReachable: 1,
  failedOnTargeting: 1,
  passesShare: false,
  passesMedian: true,
});

const shareRow = (dimension: "club" | "policy", key: string) => ({
  key,
  dimension,
  externalCards: 10,
  share: 0.5,
  atPriceCapShareOfExternal: 0.1,
  atPriceCapShareOfPaidCards: 0.2,
});

const pressureRow = () => ({
  clubId: "legia-warszawa",
  windowsUnderPressureShare: null,
  thresholdCrossingSalesPer100Sales: null,
  thresholdCrossingSalesPerCareer: 0,
});

const pairedDiff = (meanDiff: number, pairedSeeds: number) => ({
  meanDiff,
  standardError: 0.1,
  pairedSeeds,
});

const starRow = () => ({
  clubId: "legia-warszawa",
  pairedSeeds: 10,
  careersWithStarSale: 2,
  legacy: pairedDiff(1, 10),
  cash: pairedDiff(1, 10),
  legacyWhenSold: pairedDiff(1, 2),
  titlesKeep: {},
  titlesSell: {},
});

const buildReport = (overrides: Partial<Report> = {}): Report => ({
  reportSchemaVersion: 1,
  measurementMode: "full",
  firstWindow: [firstWindowRow()],
  affordableShare: [shareRow("club", "legia-warszawa"), shareRow("policy", "alwaysPass")],
  pressure: [pressureRow()],
  stars: [starRow()],
  freeAgents: [],
  reinvestment: [
    {
      clubId: "legia-warszawa",
      medianRawResultSum: 1,
      medianBudgetChange: 1,
      medianRateResidual: 0,
    },
  ],
  quartiles: [
    {
      label: "Q1 (najniższy advantageScore)",
      clubIds: ["legia-warszawa"],
      careers: 4,
      titles: { MISTRZ: 2, ARCHITEKT: 2 },
      titleShares: { MISTRZ: 0.5, ARCHITEKT: 0.5 },
    },
    {
      label: "Q3",
      clubIds: ["wisla-krakow"],
      careers: 0,
      titles: {},
      titleShares: {},
    },
  ],
  ...overrides,
});

test("section 1 renders the haggle share and the haggle-reachable failure count", () => {
  const markdown = renderReport(buildReport());
  expect(markdown).toContain("udział z targowaniem");
  expect(markdown).toContain("brak ceny, osiągalne targowaniem");
  // shareWithUsefulHaggle 0.75 rendered as a percentage with a comma.
  expect(markdown).toContain("75,0%");
});

test("section 1's threshold note uses a Polish decimal comma, not a dot", () => {
  const markdown = renderReport(buildReport());
  const section1 = markdown.split("## 2.")[0];
  expect(section1).toContain("0,75");
  expect(section1).not.toMatch(/>= 0\.75/);
});

test("section 2 renders clubs and policies as two separate tables", () => {
  const markdown = renderReport(buildReport());
  const section2 = markdown.split("## 2.")[1]!.split("## 3.")[0];
  expect(section2).toContain("### Kluby");
  expect(section2).toContain("### Polityki");
  const clubHeadingIndex = section2!.indexOf("### Kluby");
  const policyHeadingIndex = section2!.indexOf("### Polityki");
  const clubRowIndex = section2!.indexOf("legia-warszawa");
  const policyRowIndex = section2!.indexOf("alwaysPass");
  expect(clubHeadingIndex).toBeLessThan(clubRowIndex);
  expect(clubRowIndex).toBeLessThan(policyHeadingIndex);
  expect(policyHeadingIndex).toBeLessThan(policyRowIndex);
});

test("section 3 renders a missing pressure share as 'brak obserwacji', not a zero", () => {
  const markdown = renderReport(buildReport());
  const section3 = markdown.split("## 3.")[1]!.split("## 4.")[0];
  expect(section3).toContain("brak obserwacji");
});

test("section 7 reports per-group careers and title shares, and notes the pooling", () => {
  const markdown = renderReport(buildReport());
  const section7 = markdown.split("## 7.")[1];
  expect(section7).toContain("pulą wszystkich 15 polityk");
  expect(section7).toContain("kariery");
  // Q1: 4 careers, 2 MISTRZ -> 50,0%.
  expect(section7).toContain("50,0%");
  // Q3 has zero careers: shares render as "brak obserwacji", not "0,0%".
  const q3Row = section7!
    .split("\n")
    .find((line) => line.includes("| Q3 |") || line.startsWith("| Q3 "));
  expect(q3Row).toBeDefined();
  expect(q3Row).toContain("brak obserwacji");
});

test("a full-mode report has no mode note and no doubled blank line under the title", () => {
  const markdown = renderReport(buildReport({ measurementMode: "full" }));
  const lines = markdown.split("\n");
  expect(lines[0]).toBe("# Pomiar kontrolny speka 4");
  expect(lines[1]).toBe("");
  expect(lines[2]).not.toBe("");
  expect(markdown).not.toContain("\n\n\n");
});

test("a smoke-mode report appends the mode note to the title line only", () => {
  const markdown = renderReport(buildReport({ measurementMode: "smoke" }));
  const lines = markdown.split("\n");
  expect(lines[0]).toBe("# Pomiar kontrolny speka 4 (tryb dymu: measurementMode: smoke)");
  expect(lines[1]).toBe("");
});
