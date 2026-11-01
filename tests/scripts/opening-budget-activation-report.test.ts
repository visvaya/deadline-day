import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { testTempRoot } from "../temp-dir";
import { BOARD_REINVESTMENT_RATE, MIN_INITIAL_BUDGET } from "../../src/data/balance";
import { clubIdForShortName } from "../../src/data/clubs";
import {
  NO_DRAW_VERDICT,
  PINNED_DUMP_SCHEMA,
} from "../../scripts/opening-budget-activation-report-core";
import { CAREER_HEADER, SEASON_HEADER, type CellOverrides } from "./opening-budget-dump-fixtures";
import { buildSummary, renderMarkdown } from "../../scripts/opening-budget-activation-report";
import { buildSnapshot, serialiseSnapshot } from "../../scripts/opening-budget-rng-snapshot";

const line = (header: string, values: CellOverrides): string =>
  header
    .split(",")
    .map((column) => String(values[column] ?? ""))
    .join(",");

/**
 * The CLI's own arithmetic, exercised on a two-club fixture.
 *
 * The point of these tests is the PARTIAL mode contract: a measurement taken
 * without the active run and without the snapshot must mark the gates it
 * could not ask as `notMeasured`, never as `passed`. A report that quietly
 * called an unasked question answered would be worse than no report.
 */

const dir = mkdtempSync(join(testTempRoot(), "dd-opening-budget-report-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const CLUBS = ["Legia", "Piast"] as const;
/** `MATRIX.clubs` and the snapshot's `clubs` field are matched against the
 * dump's `clubShortName` through `clubIdForShortName`, so they need the
 * canonical id, not the display name the fixtures below write. */
const CLUB_IDS = CLUBS.map(clubIdForShortName);
const MATRIX = {
  clubs: CLUB_IDS,
  controlPolicies: ["alwaysPass"],
  activePolicies: ["mixed"],
  runsPerCell: 1,
};

/** A budget that clears the cost of a useful upgrade for the club, so the
 * playability gate has something to pass on. */
const generousBudget = (club: string): number => (club === "Piast" ? MIN_INITIAL_BUDGET : 1000);

const controlSeasonsCsv = (): string => {
  const rows = [SEASON_HEADER];
  for (const club of CLUBS) {
    for (const season of [1, 2]) {
      rows.push(
        line(SEASON_HEADER, {
          dumpSchemaVersion: PINNED_DUMP_SCHEMA,
          engineVersion: "2026-09-12.1",
          incomeMode: "finance-control",
          clubShortName: club,
          policyName: "alwaysPass",
          seed: 1,
          season,
          initialBudget: generousBudget(club),
          preseasonForecastBalanceWithoutTransfersAndCups: 1,
          actualBalanceWithoutTransfersAndCups: 0,
          scaledRecurringRevenue: 9,
          leaguePositionPrize: 0.3,
          totalPayroll: 2,
          fixedCosts: 1.1,
          cashAtHandover: season === 2 ? generousBudget(club) + 2 * BOARD_REINVESTMENT_RATE : "",
          creditedCupIncome: 0,
          rngDrawCount: season * 100,
        })
      );
    }
  }
  return rows.join("\n");
};

const controlRawCsv = (): string => {
  const rows = [CAREER_HEADER];
  for (const club of CLUBS) {
    rows.push(
      line(CAREER_HEADER, {
        polityka: "alwaysPass",
        seed: 1,
        kasa: 0.84,
        wartoscKadryMoj: 0,
        clubShortName: club,
        incomeMode: "finance-control",
        dumpSchemaVersion: PINNED_DUMP_SCHEMA,
        rngDrawCount: 200,
        werdykt: club === "Piast" ? NO_DRAW_VERDICT : "KLUB Z CZOŁÓWKI",
        sezonyRozegrane: 2,
        pktA: 250,
        trofea: 1,
        sezonyLM: 0,
        sezonyLE: 0,
        sezonyLK: 0,
        handoverSeason: 5,
        spadkiKadencja: 0,
        pierwszySpadekSezon: 0,
      })
    );
  }
  return rows.join("\n");
};

const write = (name: string, content: string): string => {
  const path = join(dir, name);
  writeFileSync(path, content, "utf8");
  return path;
};

const controlSeasonsPath = write("control-seasons.csv", controlSeasonsCsv());
const controlRawPath = write("control-raw.csv", controlRawCsv());
const baselinePath = "scripts/data/legacy-unit-baseline.json";

const snapshotPath = (): string => {
  const snapshot = buildSnapshot({
    rawCsv: controlRawCsv(),
    seasonsCsv: controlSeasonsCsv(),
    rawPath: "control-raw.csv",
    seasonsPath: "control-seasons.csv",
    rawSha256: "a".repeat(64),
    seasonsSha256: "b".repeat(64),
    baseSha: "0".repeat(40),
    toolSha: "1".repeat(40),
    seed: "0x5eed0001",
    clubs: CLUB_IDS,
    runsPerCell: 1,
  });
  return write("preactivation-rng.json", serialiseSnapshot(snapshot));
};

const partial = () =>
  buildSummary({
    controlRawPath,
    controlSeasonsPath,
    baselinePath,
    matrix: MATRIX,
  });

describe("partial mode", () => {
  it("marks the gates it could not ask as notMeasured, never as passed", () => {
    const summary = partial();
    expect(summary.mode).toBe("partial");
    const rng = summary.gates.find((gate) => gate.name === "atrybucja RNG");
    expect(rng?.status).toBe("notMeasured");
    expect(summary.rng).toBeNull();
    expect(summary.squadValue).toBeNull();
  });

  it("still answers the questions the control run can answer", () => {
    const summary = partial();
    for (const name of ["skala pieniądza", "dryf gotówki", "grywalność", "podłoga"]) {
      expect(summary.gates.find((gate) => gate.name === name)?.status).not.toBe("notMeasured");
    }
    expect(summary.moneyScale.balanceMedianOfClubMedians).toBe(0);
    expect(summary.cashDrift.every((row) => row.withinTolerance)).toBe(true);
  });

  it("reads the historical product from the pinned baseline, not from a literal", () => {
    const summary = partial();
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      invariants: { cash: { product: number } };
    };
    expect(summary.cashUnits.historicalProduct).toBe(baseline.invariants.cash.product);
    // And the candidate really is the product over the measured median.
    expect(
      summary.cashUnits.verdictKasaCandidate * summary.cashUnits.pooledMedianCashAtHandover
    ).toBeCloseTo(summary.cashUnits.historicalProduct, 9);
  });

  it("takes the opening budget off the dump rather than recomputing it", () => {
    const summary = partial();
    const legia = summary.budgets.find((row) => row.clubShortName === "Legia");
    expect(legia?.budget).toBe(1000);
    // The cost, by contrast, is a closed form of the club's rating - there is
    // no column for it to come from.
    expect(legia?.cost).toBeGreaterThan(0);
    expect(clubIdForShortName("Legia")).toBe("legia-warszawa");
  });

  it("counts the clubs the absolute floor binds for", () => {
    expect(partial().clubsOnFloor).toEqual(["Piast"]);
  });

  it("writes a markdown note that names each gate and its verdict", () => {
    const md = renderMarkdown(partial());
    for (const name of [
      "skala pieniądza",
      "dryf gotówki",
      "grywalność",
      "podłoga",
      "jednostki gotówki",
      "atrybucja RNG",
    ]) {
      expect(md).toContain(name);
    }
    expect(md).toContain("niezmierzone");
    expect(md).toContain("Kluby z klasą wsparcia");
    expect(md).toContain("Startowi uczestnicy Europy");
    expect(existsSync(baselinePath)).toBe(true);
  });
});

describe("full mode", () => {
  it("resolves the RNG gate once the snapshot is supplied", () => {
    const summary = buildSummary({
      controlRawPath,
      controlSeasonsPath,
      preactivationRngPath: snapshotPath(),
      baselinePath,
      matrix: MATRIX,
    });
    const rng = summary.gates.find((gate) => gate.name === "atrybucja RNG");
    // Paired against itself, so every career is identical - which is exactly
    // what the gate should call a pass.
    expect(rng?.status).toBe("passed");
    expect(summary.rng?.attribution.identicalDraws).toBe(2);
    expect(summary.rng?.attribution.unexplainedDrawCount).toBe(0);
    expect(summary.rng?.snapshot.baseSha).not.toBe(summary.rng?.snapshot.toolSha);
  });
});
