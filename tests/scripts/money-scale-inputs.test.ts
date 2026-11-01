import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { describe, expect, test } from "vitest";

import { makeTestTempDir, testTempRoot } from "../temp-dir";
import { AGE_PROFILES } from "../../src/data/balance";
import { KUPNO_MEDIAN_PRICE_DEVIATION } from "../../scripts/money-scale-core";
import { marketValueAt, type ValueCurveParams } from "../../scripts/value-curve-core";

import { CLUBS } from "../../src/data/clubs";
import { REPORTED_CLUB_FINANCES } from "../../src/data/club-finance-sources";
import { financeProfileFor } from "../../src/data/club-finance-profiles";
import {
  FIRST_TEAM_WAGE_SHARE,
  PLAYER_WAGE_SHARE_OF_FIRST_TEAM,
  PROMOTED_COHORT_2023_24,
  allReportedPlayable,
  compareWithPinnedCurve,
  convertedLegacyMultiplier,
  FINANCE_BASELINE_SHA256,
  HISTORICAL_LEGACY_MULTIPLIERS,
  legacyUnitInvariant,
  measureLegacyUnit,
  type CareerRow,
  counterfactualKupnoFee,
  fitFreeAgentPremium,
  fittedValueCurve,
  PINNED_VALUE_CURVE,
  PINNED_VALUE_CURVE_KNEE,
  loadSignings,
  summariseSigningCohort,
  targetPlayerPayrollPln,
  wagePopulation,
  validateLegacyBaseline,
  type SigningRow,
} from "../../scripts/money-scale-inputs";

/** A curve of the step-3a family with hand-picked parameters: these tests
 * are about the premium arithmetic, and running the whole 3a grid for them
 * would spend minutes proving nothing extra. */
const TEST_CURVE: ValueCurveParams = {
  vmax: 13,
  slope: 6.6,
  midpoint: 87.6,
  youngShift: 5.2,
  peakEndShift: -3,
  latePlusThreeShift: -7.2,
  latePlusSixShift: -11.4,
};

describe("targetPlayerPayrollPln", () => {
  test("is the spec's four-factor product", () => {
    expect(targetPlayerPayrollPln(100_000_000, 0.5)).toBeCloseTo(
      100_000_000 * 0.5 * FIRST_TEAM_WAGE_SHARE * PLAYER_WAGE_SHARE_OF_FIRST_TEAM,
      6
    );
  });

  test("keeps the two shares separate, one reported and one estimated", () => {
    expect(FIRST_TEAM_WAGE_SHARE).toBe(0.764);
    expect(PLAYER_WAGE_SHARE_OF_FIRST_TEAM).toBe(0.85);
  });

  test("rejects a non-positive or non-finite input", () => {
    expect(() => targetPlayerPayrollPln(0, 0.5)).toThrow();
    expect(() => targetPlayerPayrollPln(-1, 0.5)).toThrow();
    expect(() => targetPlayerPayrollPln(100, 0)).toThrow();
    expect(() => targetPlayerPayrollPln(Number.NaN, 0.5)).toThrow();
  });
});

describe("wagePopulation", () => {
  const population = wagePopulation();

  test("every member is playable and carries a reported row", () => {
    const playable = new Set(CLUBS.map((club) => club.clubId));
    const reported = new Set(REPORTED_CLUB_FINANCES.map((row) => row.clubId));
    for (const member of allReportedPlayable(population)) {
      expect(playable.has(member.clubId)).toBe(true);
      expect(reported.has(member.clubId)).toBe(true);
    }
  });

  test("main, sensitivity and excluded together account for every playable club", () => {
    const named = new Set([
      ...allReportedPlayable(population).map((member) => member.clubId),
      ...population.excluded.map((entry) => entry.clubId),
    ]);
    for (const club of CLUBS) expect(named.has(club.clubId)).toBe(true);
  });

  test("no club appears in two buckets", () => {
    const ids = [
      ...allReportedPlayable(population).map((member) => member.clubId),
      ...population.excluded.map((entry) => entry.clubId),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the main fit sees only Ekstraklasa report rows outside the promoted cohort", () => {
    for (const member of population.main) {
      expect(member.report).toBe("gt-ekstraklasa-2024-25");
      expect(PROMOTED_COHORT_2023_24).not.toContain(member.clubId);
    }
  });

  test("the promoted cohort and both Wisłas are held out with a stated reason", () => {
    const held = new Set(population.sensitivity.map((entry) => entry.member.clubId));
    expect(held.has("motor-lublin")).toBe(true);
    expect(held.has("gks-katowice")).toBe(true);
    expect(held.has("wisla-krakow")).toBe(true);
    expect(held.has("wisla-plock")).toBe(true);
    for (const entry of population.sensitivity) expect(entry.reason.length).toBeGreaterThan(10);
  });

  test("Lechia is excluded one rule earlier, as an unplayable club", () => {
    // It carries the same 2023/24 asterisk as Motor and GKS, but no career
    // starts there, so it never reaches the comparability question.
    expect(PROMOTED_COHORT_2023_24).toContain("lechia-gdansk");
    const excluded = population.excluded.find((entry) => entry.clubId === "lechia-gdansk");
    expect(excluded?.reason).toContain("not playable");
  });

  test("every constructed record is excluded with its reason", () => {
    const excludedIds = new Set(population.excluded.map((entry) => entry.clubId));
    expect(excludedIds.has("wieczysta-krakow")).toBe(true);
    const wieczysta = population.excluded.find((e) => e.clubId === "wieczysta-krakow");
    expect(wieczysta?.reason).toContain("constructed");
  });

  test("every reported figure is finite, positive and in PLN", () => {
    for (const member of allReportedPlayable(population)) {
      expect(Number.isFinite(member.totalRevenuePln)).toBe(true);
      expect(Number.isFinite(member.targetPayrollPln)).toBe(true);
      expect(member.targetPayrollPln).toBeGreaterThan(0);
      expect(member.targetPayrollPln).toBeLessThan(member.totalRevenuePln);
      // PLN, so every reported club clears a million; none reaches a billion.
      expect(member.totalRevenuePln).toBeGreaterThan(1_000_000);
      expect(member.totalRevenuePln).toBeLessThan(1_000_000_000);
      expect(member.recurringRevenuePln).toBe(financeProfileFor(member.clubId).recurringRevenuePln);
      expect(member.recurringRevenuePln).toBeGreaterThan(0);
    }
  });

  test("every member carries a finite, positive rating pair", () => {
    for (const member of allReportedPlayable(population)) {
      expect(member.rating.attack).toBeGreaterThan(0);
      expect(member.rating.defence).toBeGreaterThan(0);
      expect(Number.isFinite(member.rating.attack)).toBe(true);
      expect(Number.isFinite(member.rating.defence)).toBe(true);
    }
  });

  test("the main population is a stated list, checked by name rather than by size", () => {
    // Pinned explicitly: a length assertion would pass just as happily on the
    // wrong fifteen clubs as on the right thirteen.
    expect([...population.main.map((m) => m.clubId)].sort()).toEqual(
      [
        "cracovia",
        "gornik-zabrze",
        "jagiellonia-bialystok",
        "korona-kielce",
        "lech-poznan",
        "legia-warszawa",
        "piast-gliwice",
        "pogon-szczecin",
        "radomiak-radom",
        "rakow-czestochowa",
        "slask-wroclaw",
        "widzew-lodz",
        "zaglebie-lubin",
      ].sort()
    );
  });
});
const SIGNINGS_FIXTURE_HEADER =
  "clubShortName,policyName,seed,decisionIndex,season,offerType,playerId,position,age,ovr,fee,annualWage,baseAnnualWage,payrollDelta";

const signingLine = (over: Partial<Record<string, string>> = {}): string => {
  const base: Record<string, string> = {
    clubShortName: "Legia",
    policyName: "alwaysTake",
    seed: "1",
    decisionIndex: "3",
    season: "1",
    offerType: "WOLNY",
    playerId: "abc1234",
    position: "ŚP",
    age: "32",
    ovr: "74",
    fee: "0",
    annualWage: "0.43",
    baseAnnualWage: "0.43",
    payrollDelta: "0.43",
  };
  return SIGNINGS_FIXTURE_HEADER.split(",")
    .map((column) => over[column] ?? base[column])
    .join(",");
};

const writeFixture = async (name: string, lines: readonly string[]): Promise<string> => {
  const dir = makeTestTempDir("money-scale");
  const path = join(dir, name);
  const body = `${[SIGNINGS_FIXTURE_HEADER, ...lines].join("\n")}\n`;
  if (name.endsWith(".gz")) await writeFile(path, gzipSync(Buffer.from(body, "utf8")));
  else await writeFile(path, body, "utf8");
  return path;
};

const sha256Of = (lines: readonly string[]): string =>
  createHash("sha256")
    .update(`${[SIGNINGS_FIXTURE_HEADER, ...lines].join("\n")}\n`, "utf8")
    .digest("hex");

describe("streamDump and loadSignings", () => {
  test("reads a plain CSV and hashes its bytes", async () => {
    const lines = [signingLine(), signingLine({ offerType: "KUPNO", fee: "0.32" })];
    const path = await writeFixture("signings.csv", lines);
    const { rows, digest } = await loadSignings(path, "WOLNY");
    expect(rows.length).toBe(1);
    expect(rows[0]!.ovr).toBe(74);
    expect(rows[0]!.position).toBe("ŚP");
    expect(digest.rowCount).toBe(2);
    expect(digest.compressed).toBe(false);
    expect(digest.sha256).toBe(sha256Of(lines));
  });

  test("a gzip of the same rows hashes to the same digest as the CSV", async () => {
    const lines = [signingLine(), signingLine({ ovr: "70", age: "30" })];
    const plain = await loadSignings(await writeFixture("s.csv", lines), "WOLNY");
    const zipped = await loadSignings(await writeFixture("s.csv.gz", lines), "WOLNY");
    expect(zipped.digest.compressed).toBe(true);
    expect(zipped.digest.sha256).toBe(plain.digest.sha256);
    expect(zipped.rows).toEqual(plain.rows);
  });

  test("a missing artefact throws instead of yielding a default", async () => {
    await expect(loadSignings(join(testTempRoot(), "no-such-dump.csv"), "WOLNY")).rejects.toThrow(
      /Missing dump/
    );
  });

  test("a wrong pinned hash is refused as a different measurement", async () => {
    const path = await writeFixture("signings.csv", [signingLine()]);
    await expect(loadSignings(path, "WOLNY", "0".repeat(64))).rejects.toThrow(
      /does not match the pinned/
    );
  });

  test("rejects an unknown position, a bad number and a short row", async () => {
    await expect(
      loadSignings(await writeFixture("a.csv", [signingLine({ position: "QQ" })]), "WOLNY")
    ).rejects.toThrow(/unknown position/);
    await expect(
      loadSignings(await writeFixture("b.csv", [signingLine({ ovr: "many" })]), "WOLNY")
    ).rejects.toThrow(/not a finite number/);
    await expect(
      loadSignings(await writeFixture("c.csv", [signingLine({ annualWage: "0" })]), "WOLNY")
    ).rejects.toThrow(/non-positive/);
    await expect(
      loadSignings(await writeFixture("d.csv", ["Legia,alwaysTake,1"]), "WOLNY")
    ).rejects.toThrow(/fields, header has/);
  });

  test("an offer type with no rows is an error, not an empty cohort", async () => {
    const path = await writeFixture("e.csv", [signingLine({ offerType: "KUPNO", fee: "0.3" })]);
    await expect(loadSignings(path, "WOLNY")).rejects.toThrow(/no WOLNY rows/);
  });
});

describe("summariseSigningCohort", () => {
  const rows: SigningRow[] = [
    {
      clubShortName: "Legia",
      policyName: "alwaysTake",
      season: 1,
      offerType: "WOLNY",
      position: "ŚP",
      age: 30,
      ovr: 70,
      fee: 0,
      annualWage: 0.4,
    },
    {
      clubShortName: "Legia",
      policyName: "alwaysTake",
      season: 2,
      offerType: "WOLNY",
      position: "ŚO",
      age: 32,
      ovr: 74,
      fee: 0,
      annualWage: 0.5,
    },
    {
      clubShortName: "Lech",
      policyName: "mixed",
      season: 2,
      offerType: "WOLNY",
      position: "N",
      age: 34,
      ovr: 78,
      fee: 0,
      annualWage: 0.6,
    },
  ];

  test("reports the cohort's shape and where its rows come from", () => {
    const summary = summariseSigningCohort(rows, ["alwaysTake", "mixed", "youngOnly"]);
    expect(summary.count).toBe(3);
    expect(summary.medianOvr).toBe(74);
    expect(summary.medianAge).toBe(32);
    expect(summary.byPolicy.get("alwaysTake")).toBe(2);
    expect(summary.byClub.get("Lech")).toBe(1);
    expect(summary.bySeason.get(2)).toBe(2);
  });

  test("names the policies that signed nobody, so the selection is visible", () => {
    const summary = summariseSigningCohort(rows, ["alwaysTake", "mixed", "youngOnly"]);
    expect(summary.policiesWithoutSignings).toEqual(["youngOnly"]);
  });

  test("an even cohort's median interpolates between the two middle values", () => {
    const summary = summariseSigningCohort(rows.slice(0, 2));
    expect(summary.medianOvr).toBe(72);
    expect(summary.medianAge).toBe(31);
  });

  test("rejects an empty cohort", () => {
    expect(() => summariseSigningCohort([])).toThrow();
  });
});

describe("fitFreeAgentPremium", () => {
  const wageParams = { wageAtPivot: 0.13, wageSlope: 14.5 };
  const row = (over: Partial<SigningRow>): SigningRow => ({
    clubShortName: "Legia",
    policyName: "alwaysTake",
    season: 1,
    offerType: "WOLNY",
    position: "ŚP",
    age: 32,
    ovr: 74,
    fee: 0,
    annualWage: 0.43,
    ...over,
  });

  test("solves the two-season identity exactly at the target ratio", () => {
    const rows = [row({}), row({ ovr: 70 }), row({ ovr: 78 })];
    const fit = fitFreeAgentPremium(rows, wageParams, () => 1.0, 0.5);
    expect(fit.achievedRatio).toBeCloseTo(0.5, 12);
    expect(fit.premium).toBeCloseTo(1 + 0.5 / fit.medianUnitShare, 12);
    expect(fit.withinSpecBand).toBe(true);
  });

  test("the unit share is two seasons of base wage over the reference fee", () => {
    const rows = [row({ ovr: 70 })];
    const fit = fitFreeAgentPremium(rows, wageParams, () => 2.0, 0.5);
    expect(fit.medianUnitShare).toBeCloseTo((2 * 0.13) / 2.0, 12);
    expect(fit.medianBaseWage).toBeCloseTo(0.13, 12);
    expect(fit.medianCounterfactualFee).toBeCloseTo(2, 12);
  });

  test("does not cap the premium at any value the criterion never implies", () => {
    // An EXPENSIVE reference fee makes the required premium large: the same
    // half-a-fee of overpay then has to come out of two seasons of a wage
    // that is small next to it. That is the measurement; clipping it at 2
    // would report a number nothing produced.
    const fit = fitFreeAgentPremium([row({ ovr: 74 })], wageParams, () => 3.0, 0.5);
    expect(fit.premium).toBeGreaterThan(2);
    expect(fit.achievedRatio).toBeCloseTo(0.5, 12);
  });

  test("the equal-club-weight fit differs when one club dominates the rows", () => {
    const rows = [
      ...Array.from({ length: 20 }, () => row({ clubShortName: "Legia", ovr: 78 })),
      row({ clubShortName: "Puszcza", ovr: 60 }),
    ];
    const fit = fitFreeAgentPremium(rows, wageParams, (r) => (r.ovr > 70 ? 2 : 0.3), 0.5);
    expect(fit.premium).not.toBeCloseTo(fit.premiumEqualClubWeight, 6);
  });

  test("the age profile changes the reference fee and therefore the premium", () => {
    const reference = (r: SigningRow): number =>
      marketValueAt(r.ovr, r.age, AGE_PROFILES[r.position], TEST_CURVE) *
      KUPNO_MEDIAN_PRICE_DEVIATION;
    const keeper = fitFreeAgentPremium([row({ position: "BR" })], wageParams, reference, 0.5);
    const winger = fitFreeAgentPremium([row({ position: "LS" })], wageParams, reference, 0.5);
    // A 32-year-old keeper is still near his peak band; a winger of the same
    // age is three years past his, so the two reference fees differ.
    expect(keeper.medianCounterfactualFee).not.toBeCloseTo(winger.medianCounterfactualFee, 6);
    expect(keeper.premium).not.toBeCloseTo(winger.premium, 6);
  });

  test("is deterministic: the same rows give the same fit", () => {
    const rows = [row({}), row({ ovr: 70 }), row({ ovr: 66 })];
    const once = fitFreeAgentPremium(rows, wageParams, () => 1.1, 0.5);
    const twice = fitFreeAgentPremium([...rows], wageParams, () => 1.1, 0.5);
    expect(once).toEqual(twice);
  });

  test("the five-season diagnostic is a diagnostic, not the fitted quantity", () => {
    const fit = fitFreeAgentPremium([row({})], wageParams, () => 1.1, 0.5);
    expect(fit.fiveSeasonOverpayShare).toBeCloseTo(fit.achievedRatio * 2.5, 12);
    expect(fit.achievedRatio).toBeCloseTo(0.5, 12);
  });

  test("rejects an empty cohort, a bad target or a non-positive reference fee", () => {
    expect(() => fitFreeAgentPremium([], wageParams, () => 1)).toThrow();
    expect(() => fitFreeAgentPremium([row({})], wageParams, () => 1, 0)).toThrow();
    expect(() => fitFreeAgentPremium([row({})], wageParams, () => 0)).toThrow();
    expect(() => fitFreeAgentPremium([row({})], wageParams, () => Number.NaN)).toThrow();
  });
});

describe("the step-3a curve, derived rather than transcribed", () => {
  test("the search reproduces the pinned report exactly", () => {
    const fit = fittedValueCurve();
    const comparison = compareWithPinnedCurve(fit);
    expect(comparison.differences).toEqual([]);
    expect(comparison.matches).toBe(true);
    expect(fit.params).toEqual(PINNED_VALUE_CURVE);
    expect(fit.knee).toBe(PINNED_VALUE_CURVE_KNEE);
  });

  test("the search is memoised, so the grid is walked once per process", () => {
    // Same object identity, not merely equal values: a second walk would
    // build a fresh one and cost another half second per consumer.
    expect(fittedValueCurve()).toBe(fittedValueCurve());
  });

  test("a drifted parameter is named rather than silently accepted", () => {
    const comparison = compareWithPinnedCurve({
      params: { ...PINNED_VALUE_CURVE, slope: 7 },
      knee: 5.5,
    });
    expect(comparison.matches).toBe(false);
    expect(comparison.differences).toEqual([
      "slope: fitted 7, pinned 6.6",
      "knee: fitted 5.5, pinned 6",
    ]);
  });
});

describe("counterfactualKupnoFee", () => {
  test("is the market value times the median deviation and the market state", () => {
    const { params } = fittedValueCurve();
    const fee = counterfactualKupnoFee(74, 32, "ŚP", params, 1);
    expect(fee).toBeCloseTo(
      marketValueAt(74, 32, AGE_PROFILES["ŚP"], params) * KUPNO_MEDIAN_PRICE_DEVIATION,
      12
    );
    expect(counterfactualKupnoFee(74, 32, "ŚP", params, 1.4)).toBeCloseTo(fee * 1.4, 12);
  });

  test("two positions of the same age get different fees, through their peaks", () => {
    const { params } = fittedValueCurve();
    expect(counterfactualKupnoFee(74, 32, "BR", params, 1)).not.toBeCloseTo(
      counterfactualKupnoFee(74, 32, "LS", params, 1),
      6
    );
  });

  test("rejects a non-positive market multiplier", () => {
    const { params } = fittedValueCurve();
    expect(() => counterfactualKupnoFee(74, 32, "ŚP", params, 0)).toThrow();
  });
});
describe("multi-byte characters across a read boundary", () => {
  /** Node's default file read size. The fixture below puts a two-byte "Ś"
   * astride exactly this offset, which is how the real signings dump broke:
   * decoding each chunk on its own split the character in half and produced
   * a position code no table contains. */
  const READ_CHUNK_BYTES = 65536;
  const byteLength = (text: string): number => Buffer.byteLength(text, "utf8");

  test("a position code straddling the boundary survives the read", async () => {
    const rowTail = ",alwaysTake,1,3,1,WOLNY,abc1234,";
    let body = `${SIGNINGS_FIXTURE_HEADER}\n`;
    while (byteLength(body) < READ_CHUNK_BYTES - 1024) {
      body += `${signingLine({ position: "ŚO" })}\n`;
    }
    const padLength = READ_CHUNK_BYTES - 1 - byteLength(body) - byteLength(rowTail);
    expect(padLength).toBeGreaterThan(0);
    const straddling = signingLine({
      clubShortName: "L".repeat(padLength),
      position: "ŚO",
      ovr: "63",
    });
    // The pad puts the "Ś" of this row's position at byte 65535, so its two
    // bytes land one on each side of the boundary.
    expect(byteLength(`${body}${"L".repeat(padLength)}${rowTail}`)).toBe(READ_CHUNK_BYTES - 1);
    body += `${straddling}\n${signingLine({ position: "ŚP", ovr: "81" })}\n`;

    const dir = makeTestTempDir("money-scale-utf8");
    const path = join(dir, "straddle.csv");
    await writeFile(path, body, "utf8");

    const { rows, digest } = await loadSignings(path, "WOLNY");
    expect(rows.every((row) => row.position === "ŚO" || row.position === "ŚP")).toBe(true);
    expect(rows.some((row) => row.ovr === 63)).toBe(true);
    expect(rows.some((row) => row.ovr === 81)).toBe(true);
    expect(digest.sha256).toBe(createHash("sha256").update(body, "utf8").digest("hex"));
  });

  test("the gzip of that fixture reads back identically", async () => {
    let body = `${SIGNINGS_FIXTURE_HEADER}\n`;
    for (let i = 0; i < 4000; i += 1) body += `${signingLine({ position: "ŚO" })}\n`;
    const dir = makeTestTempDir("money-scale-utf8-gz");
    const plainPath = join(dir, "wide.csv");
    const zipPath = join(dir, "wide.csv.gz");
    await writeFile(plainPath, body, "utf8");
    await writeFile(zipPath, gzipSync(Buffer.from(body, "utf8")));

    const plain = await loadSignings(plainPath, "WOLNY");
    const zipped = await loadSignings(zipPath, "WOLNY");
    expect(zipped.digest.sha256).toBe(plain.digest.sha256);
    expect(zipped.rows.length).toBe(4000);
    expect(zipped.rows.every((row) => row.position === "ŚO")).toBe(true);
  });
});
describe("measureLegacyUnit", () => {
  const career = (club: string, kasa: number, wartoscKadryMoj: number): CareerRow => ({
    clubShortName: club,
    policyName: "alwaysPass",
    seed: 1,
    incomeMode: "finance-control",
    dumpSchemaVersion: "2",
    kasa,
    wartoscKadryMoj,
  });

  test("pools every career and also reports the median of club medians", () => {
    const rows = [career("A", 1, 0), career("A", 2, 0), career("A", 3, 0), career("B", 100, 0)];
    // Pooled: the four values are 1, 2, 3, 100, so the median is 2.5.
    expect(measureLegacyUnit(rows, (row) => row.kasa).pooledMedian).toBeCloseTo(2.5, 12);
    // Club medians: 2 for A and 100 for B, whose median is 51.
    expect(measureLegacyUnit(rows, (row) => row.kasa).medianOfClubMedians).toBeCloseTo(51, 12);
  });

  test("reports each club's own median and count", () => {
    const rows = [career("A", 1, 0), career("A", 3, 0), career("B", 7, 0)];
    const measurement = measureLegacyUnit(rows, (row) => row.kasa);
    expect(measurement.count).toBe(3);
    expect(measurement.perClub).toEqual([
      { club: "A", median: 2, count: 2 },
      { club: "B", median: 7, count: 1 },
    ]);
  });

  test("rejects an empty population or a non-finite value", () => {
    expect(() => measureLegacyUnit([], (row) => row.kasa)).toThrow();
    expect(() => measureLegacyUnit([career("A", Number.NaN, 0)], (row) => row.kasa)).toThrow();
  });
});

describe("legacyUnitInvariant and convertedLegacyMultiplier", () => {
  const rows: CareerRow[] = [1, 2, 3, 4].map((kasa) => ({
    clubShortName: "A",
    policyName: "alwaysPass",
    seed: kasa,
    incomeMode: "finance-control",
    dumpSchemaVersion: "2",
    kasa,
    wartoscKadryMoj: kasa / 2,
  }));

  test("the product uses the historical multiplier, not the current constant", () => {
    const invariant = legacyUnitInvariant("kasa", "finance-control", rows);
    expect(invariant.historicalMultiplier).toBe(5);
    expect(invariant.measurement.pooledMedian).toBeCloseTo(2.5, 12);
    expect(invariant.product).toBeCloseTo(12.5, 12);
  });

  test("the conversion preserves the product exactly", () => {
    const invariant = legacyUnitInvariant("wartoscKadryMoj", "active", rows);
    const converted = convertedLegacyMultiplier(invariant, 0.5, 0.05);
    expect(converted.ok).toBe(true);
    if (!converted.ok) throw new Error("expected a conversion");
    expect(converted.multiplier * 0.5).toBeCloseTo(invariant.product, 12);
  });

  test("refuses a zero, negative or unstable new median instead of dividing", () => {
    const invariant = legacyUnitInvariant("kasa", "finance-control", rows);
    expect(convertedLegacyMultiplier(invariant, 0, 0.05)).toEqual({
      ok: false,
      reason: "new median 0 is not positive; no unit conversion",
    });
    expect(convertedLegacyMultiplier(invariant, -1, 0.05).ok).toBe(false);
    expect(convertedLegacyMultiplier(invariant, Number.NaN, 0.05).ok).toBe(false);
    expect(convertedLegacyMultiplier(invariant, 0.01, 0.05).ok).toBe(false);
    expect(() => convertedLegacyMultiplier(invariant, 1, 0)).toThrow();
  });
});

describe("the pinned legacy-unit baseline", () => {
  /** Read as data, never imported from balance.ts: step 4 changes both
   * constants, and importing them here would turn this into an assertion that
   * the NEW economy reproduces itself. */
  const artefact = JSON.parse(
    readFileSync(join(process.cwd(), "scripts/data/legacy-unit-baseline.json"), "utf8")
  );

  test("accepts the full-precision pinned artefact without changing it", () => {
    expect(validateLegacyBaseline(artefact)).toBe(artefact);
  });

  test.each([
    ["schemaVersion", 2],
    ["aggregation.definition", "medianOfClubMedians"],
    ["source.engineCommit", "wrong"],
    ["source.seed", "0x1234"],
    ["source.runsPerCell", 999],
    ["artefacts.control.sha256", "0".repeat(64)],
    ["artefacts.active.sha256", "0".repeat(64)],
    ["artefacts.active.policies.0", "alwaysPass"],
    ["artefacts.active.clubs.0", "Unknown"],
    ["artefacts.active.rowCount", 1],
    ["artefacts.control.incomeModes.0", "normal"],
    ["artefacts.active.dumpSchemaVersions.0", "1"],
    ["invariants.cash.quantity", "wartoscKadryMoj"],
    ["invariants.cash.run", "active"],
    ["invariants.cash.historicalMultiplier", 6],
    ["invariants.squadValue.product", 3.98],
    ["invariants.squadValue.measurement.pooledMedian", Number.NaN],
    ["invariants.cash.measurement.count", 17999],
    ["invariants.cash.measurement.perClub.0.count", 999],
    ["invariants.cash.measurement.perClub.0.club", "GKS"],
    ["invariants.cash.measurement.perClub.0.median", Number.POSITIVE_INFINITY],
    ["invariants.cash.measurement.medianOfClubMedians", 999],
  ])("rejects corrupted baseline field %s", (path, value) => {
    const changed = structuredClone(artefact);
    const parts = path.split(".");
    const key = parts.pop()!;
    const target = parts.reduce((entry, part) => entry[part], changed);
    target[key] = value;
    expect(() => validateLegacyBaseline(changed)).toThrow(/legacy baseline/i);
  });

  test("rejects a jointly rewritten median and legacy product", () => {
    const changed = structuredClone(artefact);
    changed.invariants.squadValue.measurement.pooledMedian = 2;
    changed.invariants.squadValue.product = 4;
    expect(() => validateLegacyBaseline(changed)).toThrow(/legacy baseline/i);
  });

  test.each([[null], [[]], [{}], [{ schemaVersion: 1 }]])("rejects incomplete input %j", (raw) => {
    expect(() => validateLegacyBaseline(raw)).toThrow(/legacy baseline/i);
  });

  test("names its own aggregation, so step 4 can reuse the same one", () => {
    expect(artefact.aggregation.definition).toBe("pooledMedian");
    expect(artefact.schemaVersion).toBe(1);
  });

  test("carries the provenance a rerun would need", () => {
    expect(artefact.source.engineCommit).toBe("81d611a6c50e2e7c718e7c949aba2339ea4a8d15");
    expect(artefact.source.engineRevision).toBe("2026-09-07.1");
    expect(artefact.source.dumpSchemaVersion).toBe(2);
    expect(artefact.source.seed).toBe("0x5eed0001");
    expect(artefact.source.runsPerCell).toBe(1000);
  });

  test("cash comes from the control run and squad value from the active one", () => {
    expect(artefact.invariants.cash.run).toBe("finance-control");
    expect(artefact.artefacts.control.policies).toEqual(["alwaysPass"]);
    expect(artefact.artefacts.control.incomeModes).toEqual(["finance-control"]);
    expect(artefact.invariants.cash.measurement.count).toBe(18000);

    expect(artefact.invariants.squadValue.run).toBe("active");
    expect(artefact.artefacts.active.policies).toHaveLength(13);
    expect(artefact.artefacts.active.policies).not.toContain("alwaysPass");
    expect(artefact.invariants.squadValue.measurement.count).toBe(234000);
  });

  test("both artefacts hash to the pinned baseline", () => {
    expect(artefact.artefacts.control.sha256).toBe(FINANCE_BASELINE_SHA256.control);
    expect(artefact.artefacts.active.sha256).toBe(FINANCE_BASELINE_SHA256.active);
  });

  test("the squad-value product is twice the RAW median, not twice 1.99", () => {
    const raw = artefact.invariants.squadValue.measurement.pooledMedian;
    expect(raw).toBeGreaterThan(1.99);
    expect(raw).toBeLessThan(2.0);
    expect(artefact.invariants.squadValue.product).toBeCloseTo(2 * raw, 12);
    // The note's rounded 3.99 is this product rounded, and 2 x 1.99 = 3.98
    // is a different number. Rebuilding it that way would change the unit.
    expect(Number(artefact.invariants.squadValue.product.toFixed(2))).toBe(3.99);
    expect(2 * 1.99).toBeCloseTo(3.98, 12);
    expect(artefact.roundedInTheBaselineNote.squadValueProduct).toBe(3.99);
  });

  test("the cash product matches the note once rounded", () => {
    const raw = artefact.invariants.cash.measurement.pooledMedian;
    expect(Number(raw.toFixed(2))).toBe(artefact.roundedInTheBaselineNote.cashMedian);
    expect(artefact.invariants.cash.product).toBeCloseTo(5 * raw, 12);
    expect(Number(artefact.invariants.cash.product.toFixed(2))).toBe(16.55);
  });

  test("every club in both dumps has its own median recorded", () => {
    expect(artefact.invariants.cash.measurement.perClub).toHaveLength(18);
    expect(artefact.invariants.squadValue.measurement.perClub).toHaveLength(18);
    for (const entry of artefact.invariants.cash.measurement.perClub) {
      expect(entry.count).toBe(1000);
    }
  });

  test("the historical multipliers are recorded as historical", () => {
    expect(artefact.invariants.cash.historicalMultiplier).toBe(5);
    expect(artefact.invariants.squadValue.historicalMultiplier).toBe(2);
    expect(HISTORICAL_LEGACY_MULTIPLIERS).toEqual({
      kasa: 5,
      wartoscKadryMoj: 2,
    });
  });
});
