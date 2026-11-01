import { describe, expect, test } from "vitest";

import {
  checkDump,
  checkSignings,
  parseBaselineDump,
  parseSignings,
  summarise,
} from "../../scripts/finance-baseline-core";
import type { BaselineRow, SigningRow } from "../../scripts/finance-baseline-core";

/**
 * The gate a finance baseline has to pass before anything is written down.
 * A baseline with one career missing is not a slightly smaller baseline: the
 * next stage pairs against it seed by seed, and a gap drops that pair from
 * every comparison it appears in without saying so.
 */

const CLUBS = ["Legia", "Widzew"];
const SEEDS = [11, 22];

const dumpRow = (
  klub: string,
  polityka: string,
  seed: number,
  overrides: Partial<BaselineRow> = {}
): BaselineRow => ({
  poziom: klub === "Legia" ? "latwy" : "sredni",
  klub,
  polityka,
  seed,
  incomeMode: "normal",
  signingCount: 0,
  kasa: 1,
  wartoscKadryMoj: 2,
  dziedzictwo: 500,
  sezonyRozegrane: 5,
  ...overrides,
});

const fullDump = (policies: readonly string[], overrides: Partial<BaselineRow> = {}) =>
  CLUBS.flatMap((klub) =>
    policies.flatMap((polityka) => SEEDS.map((seed) => dumpRow(klub, polityka, seed, overrides)))
  );

const expectation = (policies: readonly string[], incomeMode = "normal") => ({
  clubs: CLUBS,
  policies,
  incomeMode,
});

describe("checkDump", () => {
  test("a complete dump has nothing to report", () => {
    expect(checkDump(fullDump(["alwaysTake"]), expectation(["alwaysTake"]))).toEqual([]);
  });

  test("a missing club is named", () => {
    const rows = fullDump(["alwaysTake"]).filter((r) => r.klub !== "Widzew");
    expect(checkDump(rows, expectation(["alwaysTake"])).join(" ")).toMatch(/Missing clubs.*Widzew/);
  });

  test("a missing policy is named", () => {
    const rows = fullDump(["alwaysTake", "alwaysPass"]).filter((r) => r.polityka !== "alwaysPass");
    expect(checkDump(rows, expectation(["alwaysTake", "alwaysPass"])).join(" ")).toMatch(
      /Missing policies.*alwaysPass/
    );
  });

  test("one missing career invalidates the set", () => {
    const rows = fullDump(["alwaysTake"]).slice(0, -1);
    expect(checkDump(rows, expectation(["alwaysTake"])).join(" ")).toMatch(
      /do not share one seed series/
    );
  });

  test("a duplicated career is an error", () => {
    const rows = fullDump(["alwaysTake"]);
    rows.push(dumpRow("Legia", "alwaysTake", 11));
    expect(checkDump(rows, expectation(["alwaysTake"])).join(" ")).toMatch(/Duplicate career/);
  });

  test("the wrong economy is an error", () => {
    const rows = fullDump(["alwaysPass"], { incomeMode: "normal" });
    expect(checkDump(rows, expectation(["alwaysPass"], "finance-control")).join(" ")).toMatch(
      /Expected incomeMode "finance-control"/
    );
  });

  test("a fractional signing count is not a count", () => {
    const rows = fullDump(["alwaysTake"]);
    rows[0] = { ...rows[0]!, signingCount: 1.5 };
    expect(checkDump(rows, expectation(["alwaysTake"])).join(" ")).toMatch(/is not a count/);
  });

  test("an empty dump is reported rather than passing vacuously", () => {
    expect(checkDump([], expectation(["alwaysTake"]))).toEqual(["The dump has no rows at all."]);
  });
});

const signingRow = (
  klub: string,
  seed: number,
  decisionIndex: number,
  overrides: Partial<SigningRow> = {}
): SigningRow => ({
  clubShortName: klub,
  policyName: "alwaysTake",
  seed,
  decisionIndex,
  season: 1,
  offerType: "KUPNO",
  position: "ŚP",
  age: 24,
  ovr: 68,
  fee: 1,
  annualWage: 0.2,
  baseAnnualWage: 0.2,
  ...overrides,
});

describe("checkSignings", () => {
  const rows = fullDump(["alwaysTake"], { signingCount: 2 });
  const signings = rows.flatMap((r) => [
    signingRow(r.klub, r.seed, 1),
    signingRow(r.klub, r.seed, 2),
  ]);

  test("a matching export has nothing to report", () => {
    expect(checkSignings(rows, signings)).toEqual([]);
  });

  test("removing one signing invalidates the set", () => {
    expect(checkSignings(rows, signings.slice(1)).join(" ")).toMatch(
      /reports 2 signings but 1 were exported/
    );
  });

  test("an empty export against a positive count invalidates the set", () => {
    expect(checkSignings(rows, []).join(" ")).toMatch(/reports 2 signings but 0 were exported/);
  });

  test("an empty export is correct only when nothing was signed", () => {
    expect(checkSignings(fullDump(["alwaysPass"], { signingCount: 0 }), [])).toEqual([]);
  });

  test("a repeated decision index is an error", () => {
    const repeated = [...signings, signingRow(rows[0]!.klub, rows[0]!.seed, 1)];
    expect(checkSignings(rows, repeated).join(" ")).toMatch(/Duplicate signing at decision 1/);
  });

  test("a signing for a career the dump does not have is an error", () => {
    expect(checkSignings(rows, [...signings, signingRow("Lech", 11, 1)]).join(" ")).toMatch(
      /career the dump does not have/
    );
  });
});

describe("summarise", () => {
  test("medians come from the rows, and an empty set has none", () => {
    const control = fullDump(["alwaysPass"], { incomeMode: "finance-control", kasa: -3 });
    const active = fullDump(["alwaysTake"], { kasa: 5 });
    const summary = summarise(control, active, []);

    expect(summary.controlKasaMedian).toBe(-3);
    expect(summary.activeKasaMedian).toBe(5);
    expect(summary.signingRows).toBe(0);
    expect(summary.byOfferType).toEqual([]);
    for (const club of summary.perClub) {
      expect(club.controlKasa).toBe(-3);
      expect(club.activeKasa).toBe(5);
    }
  });

  test("a fee median is a median, not a mean", () => {
    const active = fullDump(["alwaysTake"], { signingCount: 0 });
    const fees = [1, 2, 9];
    const signings = fees.map((fee, i) => signingRow("Legia", 11, i + 1, { fee }));
    const summary = summarise([], active, signings);
    const kupno = summary.byOfferType.find((t) => t.offerType === "KUPNO")!;
    expect(kupno.count).toBe(3);
    expect(kupno.feeMedian).toBe(2);
  });

  test("free signings and purchases are reported apart", () => {
    const signings = [
      signingRow("Legia", 11, 1, { offerType: "WOLNY", fee: 0 }),
      signingRow("Legia", 11, 2, { offerType: "KUPNO", fee: 4 }),
    ];
    const summary = summarise([], fullDump(["alwaysTake"]), signings);
    expect(summary.byOfferType.map((t) => t.offerType)).toEqual(["KUPNO", "WOLNY"]);
    expect(summary.byOfferType.find((t) => t.offerType === "WOLNY")!.feeMedian).toBe(0);
  });
});

describe("parsers", () => {
  const DUMP =
    "poziom,polityka,seed,kasa,wartoscKadryMoj,dziedzictwo,sezonyRozegrane,clubShortName,incomeMode,signingCount\n" +
    "latwy,alwaysTake,11,1.5,2.5,500,5,Legia,normal,3";

  test("reads by header name", () => {
    const { rows, identity } = parseBaselineDump(DUMP);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ klub: "Legia", kasa: 1.5, signingCount: 3 });
    expect(identity.mode).toBe("club");
  });

  test("a missing column is named rather than shifting every value", () => {
    expect(() => parseBaselineDump("poziom,polityka\nlatwy,alwaysTake")).toThrow(/is missing/);
  });

  test("a non-numeric field is rejected with its column", () => {
    expect(() => parseBaselineDump(DUMP.replace(",1.5,", ",x,"))).toThrow(/"kasa"/);
  });

  test("signings read by header too", () => {
    const text =
      "clubShortName,policyName,seed,decisionIndex,season,offerType,playerId,position,age,ovr,fee,annualWage,baseAnnualWage,payrollDelta\n" +
      "Legia,alwaysTake,11,2,1,WOLNY,abc,ŚP,24,68,0,0.2,0.25,0.2";
    const rows = parseSignings(text);
    expect(rows[0]).toMatchObject({ offerType: "WOLNY", fee: 0, baseAnnualWage: 0.25 });
  });
});
