import { describe, expect, test } from "vitest";

import { ACTIVE_BACKER_PERCENTILE, STRONG_BACKER_PERCENTILE } from "../../src/data/balance";
import {
  CLUB_FINANCE_PROFILES,
  LEAGUE_MERIT_POOL_PLN,
  financeProfileFor,
  leaguePrizeRevenuePln,
  type ClubFinanceProfile,
  type FinanceProvenance,
} from "../../src/data/club-finance-profiles";
import {
  FINANCE_REPORTS,
  PUBLISHED_REPORT_TOTALS,
  REPORTED_CLUB_FINANCES,
  reportedFinanceFor,
} from "../../src/data/club-finance-sources";
import { CLUBS } from "../../src/data/clubs";
import { FIRST_DIVISION } from "../../src/data/first-division";

/**
 * The manifest is data, so the tests that matter are the ones a typo fails.
 *
 * Two levels. The source layer is checked against the aggregates the reports
 * publish about themselves - if a club's revenue was mistyped, the column no
 * longer sums to the printed total. The profile layer is checked against the
 * subtraction identity, so a correction can never quietly leave the base
 * inconsistent with its own components.
 *
 * Neither level can check whether a correction is the RIGHT size. That
 * judgement lives in docs/decisions/finance-manifest-sources.md
 * and is not something arithmetic can defend.
 */

const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0);
const rowsOf = (report: string) => REPORTED_CLUB_FINANCES.filter((r) => r.report === report);

describe("reported sources", () => {
  test("each report covers the club count it claims", () => {
    for (const report of FINANCE_REPORTS) {
      expect(rowsOf(report.reportId), report.reportId).toHaveLength(report.reportedClubs);
    }
  });

  test("no club appears twice", () => {
    const ids = REPORTED_CLUB_FINANCES.map((row) => row.clubId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("total minus transfers is the reported base revenue, club by club", () => {
    for (const row of REPORTED_CLUB_FINANCES) {
      // The reports round every figure to 10k PLN, so the three printed
      // numbers can disagree by one unit of their own granularity.
      expect(
        Math.abs(row.totalRevenuePln - row.transferRevenuePln - row.baseRevenuePln),
        row.clubId
      ).toBeLessThanOrEqual(10_000);
    }
  });

  test("Ekstraklasa base revenue reproduces the billion the report announces", () => {
    const published = PUBLISHED_REPORT_TOTALS["gt-ekstraklasa-2024-25"];
    const total = sum(rowsOf("gt-ekstraklasa-2024-25").map((r) => r.baseRevenuePln));
    expect(Math.abs(total - published.baseRevenuePln)).toBeLessThanOrEqual(
      published.baseRevenueTolerancePln
    );
  });

  test("first division reproduces both totals the report prints", () => {
    const published = PUBLISHED_REPORT_TOTALS["gt-pierwsza-liga-2024-25"];
    const rows = rowsOf("gt-pierwsza-liga-2024-25");
    expect(
      Math.abs(sum(rows.map((r) => r.totalRevenuePln)) - published.totalRevenuePln)
    ).toBeLessThanOrEqual(published.totalRevenueTolerancePln);
    expect(
      Math.abs(sum(rows.map((r) => r.transferRevenuePln)) - published.transferRevenuePln)
    ).toBeLessThanOrEqual(published.transferRevenueTolerancePln);
  });

  test("league places are real positions in an eighteen-club division", () => {
    for (const row of REPORTED_CLUB_FINANCES) {
      expect(row.leaguePlace, row.clubId).toBeGreaterThanOrEqual(1);
      expect(row.leaguePlace, row.clubId).toBeLessThanOrEqual(18);
    }
    for (const report of FINANCE_REPORTS) {
      const places = rowsOf(report.reportId).map((r) => r.leaguePlace);
      expect(new Set(places).size, report.reportId).toBe(places.length);
    }
  });

  test("an unknown club resolves to null rather than to a neighbour", () => {
    expect(reportedFinanceFor("barcelona")).toBeNull();
    expect(reportedFinanceFor("lech-poznan")?.leaguePlace).toBe(1);
  });
});

describe("placement money", () => {
  test("only the Ekstraklasa has a placement component", () => {
    expect(leaguePrizeRevenuePln("first-division", 1)).toBe(0);
    expect(leaguePrizeRevenuePln("second-division", 1)).toBe(0);
    expect(leaguePrizeRevenuePln("third-division", 1)).toBe(0);
    expect(leaguePrizeRevenuePln("outside-reported-league", 0)).toBe(0);
  });

  test("the ladder spans the pool and steps evenly", () => {
    const ladder = Array.from({ length: 18 }, (_, i) =>
      leaguePrizeRevenuePln("ekstraklasa", i + 1)
    );
    expect(ladder[0]).toBe(5_803_158);
    expect(ladder[17]).toBe(322_398);
    expect(Math.abs(sum(ladder) - LEAGUE_MERIT_POOL_PLN)).toBeLessThanOrEqual(18);
    for (let i = 1; i < ladder.length; i += 1) {
      expect(Math.abs(ladder[i - 1]! - ladder[i]! - 322_398)).toBeLessThanOrEqual(1);
    }
  });

  test("the pool is the 18.5% place share, not the whole sporting result", () => {
    // 96.8 mln was proposed once and was wrong: it folded in the 14% paid to
    // the four European qualifiers, a mechanic the game does not reproduce.
    expect(LEAGUE_MERIT_POOL_PLN).toBe(Math.round(0.185 * 298_000_000));
  });
});

describe("CLUB_FINANCE_PROFILES", () => {
  test("covers every club the game can name, exactly once", () => {
    const expected = [...CLUBS.map((c) => c.clubId), ...FIRST_DIVISION.map((c) => c.clubId)];
    expect(CLUB_FINANCE_PROFILES.map((p) => p.clubId)).toEqual(expected);
    expect(new Set(expected).size).toBe(expected.length);
    expect(CLUB_FINANCE_PROFILES).toHaveLength(36);
  });

  test("recurring revenue is total minus every component the game re-earns", () => {
    for (const p of CLUB_FINANCE_PROFILES) {
      expect(p.recurringRevenuePln, p.clubId).toBe(
        p.totalRevenuePln -
          p.transferRevenuePln -
          p.europeanRevenuePln -
          p.oneOffRevenuePln -
          p.leaguePrizeRevenuePln
      );
    }
  });

  test("no club ends up with a non-positive base", () => {
    for (const p of CLUB_FINANCE_PROFILES) {
      expect(p.recurringRevenuePln, p.clubId).toBeGreaterThan(0);
      expect(p.recurringRevenuePln, p.clubId).toBeLessThanOrEqual(p.totalRevenuePln);
    }
  });

  test("every component is a non-negative amount in whole PLN", () => {
    const amounts = (p: ClubFinanceProfile) => [
      p.totalRevenuePln,
      p.transferRevenuePln,
      p.europeanRevenuePln,
      p.oneOffRevenuePln,
      p.leaguePrizeRevenuePln,
    ];
    for (const p of CLUB_FINANCE_PROFILES) {
      for (const value of amounts(p)) {
        expect(Number.isInteger(value), p.clubId).toBe(true);
        expect(value, p.clubId).toBeGreaterThanOrEqual(0);
      }
      expect(p.wageToRevenueRatio, p.clubId).toBeGreaterThan(0);
    }
  });

  test("placement money is subtracted from the tier the club actually played in", () => {
    for (const p of CLUB_FINANCE_PROFILES) {
      expect(p.leaguePrizeRevenuePln, p.clubId).toBe(
        leaguePrizeRevenuePln(p.sourceTier, p.sourceLeaguePlace)
      );
    }
    // Three clubs the game promotes played the Ekstraklasa in the source
    // season, so their history is subtracted with the top flight's ladder.
    for (const clubId of ["lechia-gdansk", "stal-mielec", "puszcza-niepolomice"]) {
      expect(financeProfileFor(clubId).sourceTier).toBe("ekstraklasa");
      expect(financeProfileFor(clubId).leaguePrizeRevenuePln).toBeGreaterThan(0);
    }
  });

  test("place 0 is used only where no league finish backs the record", () => {
    for (const p of CLUB_FINANCE_PROFILES) {
      if (p.sourceLeaguePlace === 0) {
        expect(p.sourceTier, p.clubId).toBe("outside-reported-league");
        expect(p.leaguePrizeRevenuePln, p.clubId).toBe(0);
      } else {
        expect(p.sourceTier, p.clubId).not.toBe("outside-reported-league");
        expect(p.sourceLeaguePlace, p.clubId).toBeGreaterThanOrEqual(1);
        expect(p.sourceLeaguePlace, p.clubId).toBeLessThanOrEqual(18);
      }
    }
  });

  test("only the four European clubs of 2024/25 carry European income", () => {
    const european = CLUB_FINANCE_PROFILES.filter((p) => p.europeanRevenuePln > 0).map(
      (p) => p.clubId
    );
    expect(european.sort()).toEqual([
      "jagiellonia-bialystok",
      "legia-warszawa",
      "slask-wroclaw",
      "wisla-krakow",
    ]);
    // Pogoń and Górnik were named as participants once and were not; a zero
    // here is a verified fact, and the test pins it so the error cannot return.
    expect(financeProfileFor("pogon-szczecin").europeanRevenuePln).toBe(0);
    expect(financeProfileFor("gornik-zabrze").europeanRevenuePln).toBe(0);
  });

  test("provenance stays the three-value union the spec defines", () => {
    const allowed: readonly FinanceProvenance[] = ["reported", "official-statement", "estimated"];
    for (const p of CLUB_FINANCE_PROFILES) {
      expect(allowed, p.clubId).toContain(p.provenance);
    }
  });

  test("every estimate says so, and every estimate carries its method", () => {
    for (const p of CLUB_FINANCE_PROFILES) {
      if (p.provenance === "reported") continue;
      expect(p.note, p.clubId).toBeTruthy();
      expect(p.note!.length, p.clubId).toBeGreaterThan(80);
    }
    const estimated = CLUB_FINANCE_PROFILES.filter((p) => p.provenance !== "reported").map(
      (p) => p.clubId
    );
    expect(estimated.sort()).toEqual([
      "lks-nieciecza",
      "podbeskidzie-bielsko-biala",
      "pogon-grodzisk-mazowiecki",
      "polonia-bytom",
      "slask-wroclaw",
      "unia-skierniewice",
      "wieczysta-krakow",
      "wisla-krakow",
    ]);
  });

  test("no estimate outruns the reported first division's 90th percentile", () => {
    const reported = rowsOf("gt-pierwsza-liga-2024-25")
      .map((r) => r.totalRevenuePln)
      .sort((a, b) => a - b);
    const p90 = reported[Math.floor(0.9 * (reported.length - 1))];
    for (const p of CLUB_FINANCE_PROFILES) {
      if (p.provenance !== "estimated") continue;
      if (p.sourceTier === "ekstraklasa" || p.clubId === "wisla-krakow") continue;
      // Wieczysta is a documented backer exception; the decision of
      // 2026-09-12 grants it a floor at the strong percentile rather than a
      // bigger revenue base.
      if (p.clubId === "wieczysta-krakow") {
        expect(p.backerBudgetPercentile).toBe(STRONG_BACKER_PERCENTILE);
        expect(p.recurringRevenuePln).toBeLessThanOrEqual(p90!);
        continue;
      }
      expect(p.totalRevenuePln, p.clubId).toBeLessThanOrEqual(p90!);
    }
  });

  test("Wisła Płock reproduces the four figures the spec quotes", () => {
    const p = financeProfileFor("wisla-plock");
    expect(p.totalRevenuePln).toBe(15_340_000);
    expect(p.transferRevenuePln).toBe(590_000);
    expect(p.europeanRevenuePln).toBe(0);
    expect(p.wageToRevenueRatio).toBe(0.97);
    // The open question of 2026-09-07 - whether the 14.75 mln base already
    // excludes placement money - is closed: the division split its central
    // package equally, so there is nothing to subtract and the base survives.
    expect(p.leaguePrizeRevenuePln).toBe(0);
    expect(p.recurringRevenuePln).toBe(14_750_000);
  });

  test("Wieczysta keeps the base the spec fixed, not the one the filing shows", () => {
    const p = financeProfileFor("wieczysta-krakow");
    expect(p.totalRevenuePln).toBe(37_960_000);
    expect(p.recurringRevenuePln).toBe(18_000_000);
    expect(p.wageToRevenueRatio).toBe(0.95);
    expect(p.note).toMatch(/MODEL CORRECTION/);
  });

  test("an unknown club throws rather than resolving to nothing", () => {
    expect(() => financeProfileFor("barcelona")).toThrow(/No finance profile/);
  });

  test("the retired owner field cannot coexist with the backer field", () => {
    // Renaming a field is only half the migration. The other half is that no
    // record quietly keeps the old key: an extra `ownerBudgetPercentile`
    // would type-check as excess property on nothing, read as data to a
    // human, and be read by nobody at all.
    for (const p of CLUB_FINANCE_PROFILES) {
      expect(Object.hasOwn(p, "ownerBudgetPercentile"), p.clubId).toBe(false);
    }
    const backed = CLUB_FINANCE_PROFILES.filter((p) => p.backerBudgetPercentile !== undefined);
    expect(backed.length).toBeGreaterThan(0);
  });

  test("the three backed clubs carry exactly the decided percentiles", () => {
    // The manifest holds LITERALS - importing `balance.ts` here would close a
    // cycle, since `balance.ts` already imports this module for the merit
    // pool. This comparison is what catches a drift without creating one.
    expect(financeProfileFor("widzew-lodz").backerBudgetPercentile).toBe(STRONG_BACKER_PERCENTILE);
    expect(financeProfileFor("wieczysta-krakow").backerBudgetPercentile).toBe(
      STRONG_BACKER_PERCENTILE
    );
    expect(financeProfileFor("korona-kielce").backerBudgetPercentile).toBe(
      ACTIVE_BACKER_PERCENTILE
    );
  });

  test("Motor stays without a floor, as the restrained class it is", () => {
    // Its owner publicly rejected permanent funding. The absence is part of
    // the hypothesis, not a gap in the data.
    expect(financeProfileFor("motor-lublin").backerBudgetPercentile).toBeUndefined();
    const backed = CLUB_FINANCE_PROFILES.filter((p) => p.backerBudgetPercentile !== undefined).map(
      (p) => p.clubId
    );
    expect(backed.sort()).toEqual(["korona-kielce", "widzew-lodz", "wieczysta-krakow"]);
  });
});
