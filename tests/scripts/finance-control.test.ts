import { describe, expect, test } from "vitest";

import { parseBalanceCli } from "../../scripts/balance-cli";
import {
  KOSZTY_STALE,
  MONEY_SCALE_PLN_PER_GAME_MILLION,
  PUCHAR_POLSKI_PREMIA,
  SUPERPUCHAR_PREMIA,
} from "../../src/data/balance";
import {
  ACCEPTED_DUMP_SCHEMA_VERSIONS,
  CUP_INCOME_SCHEMA_VERSION,
  DUMP_COLUMNS,
  DUMP_SCHEMA_VERSION,
  extractFinanceSeasons,
  extractMetrics,
} from "../../scripts/balance-metrics";
import { alwaysPass } from "../../src/logic/simulate-policies";
import { playHeadless } from "../golden/headless";

/**
 * The path from the flag to the money, checked end to end: a run started with
 * --finance-control must reach the settlement with the control on. The flag
 * is parsed in one place and mapped onto the reducer context in one place, so
 * this is the join between them.
 */

describe("--finance-control reaches the settlement", () => {
  test("the flag is off by default and stands alone when given", () => {
    expect(parseBalanceCli([]).financeControl).toBe(false);
    expect(parseBalanceCli(["--finance-control"]).financeControl).toBe(true);
  });

  test("a controlled run banks no european money at all", () => {
    const controlled = playHeadless({
      seed: 0x5eed0001,
      clubId: "lech-poznan",
      policy: alwaysPass,
      financeControl: true,
    });
    const seasons = controlled.state.trace.filter((e) => e.type === "season");
    expect(seasons.length).toBeGreaterThan(0);
    for (const season of seasons) {
      if (season.type !== "season") continue;
      expect(season.kasaEuro).toBe(0);
    }
  });

  test("the same run without the flag does bank some", () => {
    // Lech starts the career already in Europe (EUROPEAN_BERTHS_2026), so an
    // uncontrolled career there earns campaign money - without which the
    // assertion above would hold for a reason that has nothing to do with
    // the control.
    const normal = playHeadless({ seed: 0x5eed0001, clubId: "lech-poznan", policy: alwaysPass });
    const earned = normal.state.trace.some((e) => e.type === "season" && e.kasaEuro > 0);
    expect(earned).toBe(true);
  });

  test("the controlled career ends poorer", () => {
    const normal = playHeadless({ seed: 0x5eed0001, clubId: "lech-poznan", policy: alwaysPass });
    const controlled = playHeadless({
      seed: 0x5eed0001,
      clubId: "lech-poznan",
      policy: alwaysPass,
      financeControl: true,
    });
    expect(controlled.state.finalne!.kasa).toBeLessThan(normal.state.finalne!.kasa);
  });
});

/**
 * The RNG evidence the activation rests on. A career's final draw tally is
 * the one number that says whether a change moved the random stream, and the
 * raw dump is where it has to be readable from - so the metric must be the
 * engine's own tally rather than a recount that could agree by construction.
 */
describe("the career's final rng tally reaches the dump row", () => {
  test("extractMetrics carries the engine's own rngDrawCount", () => {
    const result = playHeadless({
      seed: 0x5eed0001,
      clubId: "lech-poznan",
      policy: alwaysPass,
      financeControl: true,
    });

    const metrics = extractMetrics(result, "alwaysPass");

    expect(metrics.rngDrawCount).toBe(result.state.rngDrawCount);
    // A zero would satisfy the equality above while proving nothing.
    expect(metrics.rngDrawCount).toBeGreaterThan(0);
  });

  test("a season row is exported for every played season, and only the last carries the handover", () => {
    // The unit the money scale is measured in. Both shapes have to work: a
    // tenure that ran its five seasons, and one relegation cut short.
    const seeds = [0x5eed0001, 0x5eed0002, 0x5eed0003, 0x5eed0004, 0x5eed0005];
    let sawFullTenure = false;
    let sawCutShort = false;

    for (const seed of seeds) {
      const result = playHeadless({
        seed,
        clubId: "wisla-plock",
        policy: alwaysPass,
        financeControl: true,
      });
      const seasons = extractFinanceSeasons(result, "alwaysPass", "finance-control");
      const played = result.state.historia.length;

      expect(seasons).toHaveLength(played);
      expect(seasons.map((s) => s.season)).toEqual(Array.from({ length: played }, (_, i) => i + 1));
      // Exactly one handover, on the last season played.
      const withHandover = seasons.filter((s) => s.cashAtHandover !== null);
      expect(withHandover).toHaveLength(1);
      expect(withHandover[0]!.season).toBe(seasons[seasons.length - 1]!.season);

      for (const season of seasons) {
        expect(season.incomeMode).toBe("finance-control");
        expect(season.fixedCosts).toBe(KOSZTY_STALE);
        // The balance equation, checked against its own components rather
        // than recomputed from the engine - which would agree by construction.
        expect(season.actualBalanceWithoutTransfersAndCups).toBeCloseTo(
          season.scaledRecurringRevenue +
            season.leaguePositionPrize -
            season.totalPayroll -
            season.fixedCosts,
          3
        );
        expect(season.scalableNetPln).toBeCloseTo(
          MONEY_SCALE_PLN_PER_GAME_MILLION *
            (season.scaledRecurringRevenue + season.leaguePositionPrize - season.totalPayroll),
          0
        );
      }

      if (played === 5) sawFullTenure = true;
      else sawCutShort = true;
    }

    expect(sawFullTenure).toBe(true);
    // alwaysPass at Wisła Płock goes down often enough that five seeds cover
    // both shapes; if this ever stops holding, the fixture needs more seeds
    // rather than a weaker assertion.
    expect(sawCutShort).toBe(true);
  });

  test("the controlled run exports no european money into the season rows", () => {
    const result = playHeadless({
      seed: 0x5eed0001,
      clubId: "lech-poznan",
      policy: alwaysPass,
      financeControl: true,
    });
    const seasons = extractFinanceSeasons(result, "alwaysPass", "finance-control");

    // The recurring base and the ladder are never controlled; the campaign is.
    for (const season of seasons) {
      expect(season.scaledRecurringRevenue).toBeGreaterThan(0);
      expect(season.leaguePositionPrize).toBeGreaterThanOrEqual(0);
    }
    for (const event of result.state.trace) {
      if (event.type === "season") expect(event.kasaEuro).toBe(0);
    }
  });

  test("the dump schema announces the columns it gained", () => {
    expect(DUMP_SCHEMA_VERSION).toBe(5);
    // The cup-income columns were added in schema 4 and schema 5 kept them,
    // only dropping `poziom` and renaming the club join column - so this
    // constant stays behind DUMP_SCHEMA_VERSION rather than tracking it.
    expect(CUP_INCOME_SCHEMA_VERSION).toBe(4);
    // Every reader here reads by header name, never positionally, so the
    // dump's last column carries no contract of its own.
    expect(DUMP_COLUMNS).toContain("rngDrawCount");
    expect(DUMP_COLUMNS).toContain("clubId");
    expect(DUMP_COLUMNS).not.toContain("poziom");
    // All three versions stay readable. The 2026-09-10 activation artefacts
    // are schema 3 and are never regenerated, so dropping 3 here would make
    // that report unreproducible.
    expect([...ACCEPTED_DUMP_SCHEMA_VERSIONS]).toEqual([3, 4, 5]);
    expect(ACCEPTED_DUMP_SCHEMA_VERSIONS).toContain(DUMP_SCHEMA_VERSION);
  });

  test("a controlled run credits no cup money, and a normal one sums the three", () => {
    const controlled = extractFinanceSeasons(
      playHeadless({
        seed: 0x5eed0001,
        clubId: "lech-poznan",
        policy: alwaysPass,
        financeControl: true,
      }),
      "alwaysPass",
      "finance-control"
    );
    expect(controlled.length).toBeGreaterThan(0);
    for (const season of controlled) {
      expect(season.europeanPrizeIncome).toBe(0);
      expect(season.polishCupPrizeIncome).toBe(0);
      expect(season.superCupPrizeIncome).toBe(0);
      expect(season.creditedCupIncome).toBe(0);
    }

    const normal = extractFinanceSeasons(
      playHeadless({ seed: 0x5eed0001, clubId: "lech-poznan", policy: alwaysPass }),
      "alwaysPass",
      "normal"
    );
    expect(normal.length).toBeGreaterThan(0);
    let sawAnyCupMoney = false;
    for (const season of normal) {
      expect(season.creditedCupIncome).toBeCloseTo(
        season.europeanPrizeIncome + season.polishCupPrizeIncome + season.superCupPrizeIncome,
        6
      );
      // The two domestic prizes are the constants, never a scaled fraction.
      expect([0, PUCHAR_POLSKI_PREMIA]).toContain(season.polishCupPrizeIncome);
      expect([0, SUPERPUCHAR_PREMIA]).toContain(season.superCupPrizeIncome);
      if (season.creditedCupIncome > 0) sawAnyCupMoney = true;
    }
    // A normal run that banked nothing at all would make the assertions above
    // vacuous; this seed reaches Europe or a domestic cup at least once.
    expect(sawAnyCupMoney).toBe(true);
  });
});
