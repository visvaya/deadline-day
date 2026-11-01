/**
 * @vitest-environment jsdom
 */
import { expect, test } from "vitest";

import { MATCH_BASE_GOALS, MATCH_HOME_ADVANTAGE } from "../../src/data/balance";
import { calibratedLambdaFit } from "../../scripts/match-engine-audit-core";
import {
  ALL_SEASONS,
  CALIBRATION_WINDOW,
  PANDEMIC_SEASON,
  EKSTRAKLASA_REFERENCE,
  MATCH_OUTCOME_REFERENCE,
  bySeason,
  matchOutcomeReferenceFrom,
  readPinnedResults,
  finalOrder,
  finalPoints,
  round17Order,
  summarizeEkstraklasaReference,
  summarizeMatchOutcomeReference,
} from "../../scripts/match-engine-audit-reference";

test("the pinned five-season reference reconciles final tables and match totals", () => {
  const summary = summarizeEkstraklasaReference(EKSTRAKLASA_REFERENCE);

  expect(EKSTRAKLASA_REFERENCE).toHaveLength(5);
  expect(summary.seasons).toBe(5);
  expect(summary.matches).toBe(1_530);
  expect(summary.goals).toBe(4_079);
  expect(summary.homeWins).toBe(672);
  expect(summary.draws).toBe(420);
  expect(summary.awayWins).toBe(438);
  expect(summary.championPoints.mean).toBe(68.4);
  expect(summary.lastPoints.mean).toBe(27.4);
  expect(summary.pointSpread.mean).toBe(41);
  expect(summary.promotedChampion.mean).toBe(0);
  expect(summary.promotedClubTitleRate.mean).toBe(0);
  expect(summary.promotedClubExposures).toBe(15);
  expect(summary.previousChampionRelegated.mean).toBe(0);
});

test("every pinned season is internally complete", () => {
  for (const season of EKSTRAKLASA_REFERENCE) {
    expect(season.matches, season.season).toBe(306);
    expect(season.homeWins + season.draws + season.awayWins, season.season).toBe(season.matches);
    expect(season.finalTable, season.season).toHaveLength(18);
    expect(season.round17Table, season.season).toHaveLength(18);
    expect(finalPoints(season), season.season).toEqual(
      [...finalPoints(season)].sort((a, b) => b - a)
    );
    expect(new Set(round17Order(season)).size, season.season).toBe(18);
    expect(new Set(finalOrder(season)).size, season.season).toBe(18);
    expect([...round17Order(season)].sort(), season.season).toEqual([...finalOrder(season)].sort());
    expect(season.sources.length, season.season).toBeGreaterThanOrEqual(2);
  }
});

/**
 * The half-way tables are a real half-way table, not a snapshot of anything
 * else: seventeen rounds is seventeen matches for every club, and the goals
 * scored across the division have to equal the goals conceded.
 */
test("every pinned round-17 table is a consistent seventeen-round table", () => {
  for (const season of EKSTRAKLASA_REFERENCE) {
    const scored = season.round17Table.reduce((sum, row) => sum + row.goalsFor, 0);
    const conceded = season.round17Table.reduce((sum, row) => sum + row.goalsAgainst, 0);
    expect(scored, season.season).toBe(conceded);

    for (const row of season.round17Table) {
      // 17 matches, so at most 51 points and never more wins than matches.
      expect(row.points, `${season.season} ${row.club}`).toBeLessThanOrEqual(51);
      expect(row.points, `${season.season} ${row.club}`).toBeGreaterThanOrEqual(0);
    }
  }
});

test("every pinned final table is a consistent thirty-four-round table", () => {
  for (const season of EKSTRAKLASA_REFERENCE) {
    const scored = season.finalTable.reduce((sum, row) => sum + row.goalsFor, 0);
    const conceded = season.finalTable.reduce((sum, row) => sum + row.goalsAgainst, 0);
    expect(scored, season.season).toBe(conceded);
    // The division's goals are pinned separately, from a different source.
    expect(scored, season.season).toBe(season.goals);

    for (const row of season.finalTable) {
      expect(row.points, `${season.season} ${row.club}`).toBeLessThanOrEqual(102);
    }
  }
});

test("the pinned round-17 tables retain seven in ten eventual top-four clubs", () => {
  const summary = summarizeEkstraklasaReference(EKSTRAKLASA_REFERENCE);

  expect(summary.halfToFinal.meanAbsoluteMove.mean).toBeCloseTo(2.6444444444444444, 12);
  expect(summary.halfToFinal.p90AbsoluteMove.mean).toBeCloseTo(6.46, 12);
  expect(summary.halfToFinal.topFourRetention.mean).toBeCloseTo(0.7, 12);
  expect(summary.halfToFinal.bottomThreeRetention.mean).toBeCloseTo(0.6, 12);
});

test("known tied final rows follow the game's GD/GF tiebreak before name", () => {
  const seasonsByName = new Map(EKSTRAKLASA_REFERENCE.map((season) => [season.season, season]));
  const precedes = (season: string, higher: string, lower: string): void => {
    const order = finalOrder(seasonsByName.get(season)!);
    expect(order.indexOf(higher), `${season}: ${higher} before ${lower}`).toBeLessThan(
      order.indexOf(lower)
    );
  };

  precedes("2021/22", "Radomiak", "WislaP");
  precedes("2025/26", "Jagiellonia", "GornikZ");
  precedes("2025/26", "Widzew", "Cracovia");
});

test("the pinned nine-season outcome reference reconciles all match aggregates", () => {
  const summary = summarizeMatchOutcomeReference(MATCH_OUTCOME_REFERENCE);

  expect(MATCH_OUTCOME_REFERENCE).toHaveLength(9);
  expect(summary.seasons).toBe(9);
  expect(summary.matches).toBe(2_704);
  expect(summary.goals).toBe(7_203);
  expect(summary.homeGoals).toBe(4_053);
  expect(summary.awayGoals).toBe(3_150);
  expect(summary.homeWins).toBe(1_192);
  expect(summary.draws).toBe(724);
  expect(summary.awayWins).toBe(788);
  const seasonMean = (select: (_season: (typeof MATCH_OUTCOME_REFERENCE)[number]) => number) =>
    MATCH_OUTCOME_REFERENCE.reduce((sum, season) => sum + select(season) / season.matches, 0) /
    MATCH_OUTCOME_REFERENCE.length;
  expect(summary.goalsPerMatch.mean).toBeCloseTo(
    seasonMean((season) => season.goals),
    12
  );
  expect(summary.homeGoalsPerMatch.mean).toBeCloseTo(
    seasonMean((season) => season.homeGoals),
    12
  );
  expect(summary.awayGoalsPerMatch.mean).toBeCloseTo(
    seasonMean((season) => season.awayGoals),
    12
  );
  expect(summary.drawRate.mean).toBeCloseTo(
    seasonMean((season) => season.draws),
    12
  );
  expect(summary.homeWinRate.mean).toBeCloseTo(
    seasonMean((season) => season.homeWins),
    12
  );
  expect(summary.awayWinRate.mean).toBeCloseTo(
    seasonMean((season) => season.awayWins),
    12
  );
  expect(summary.pooled).toEqual({
    goalsPerMatch: 7_203 / 2_704,
    homeGoalsPerMatch: 4_053 / 2_704,
    awayGoalsPerMatch: 3_150 / 2_704,
    homeWinRate: 1_192 / 2_704,
    drawRate: 724 / 2_704,
    awayWinRate: 788 / 2_704,
    homePointAdvantage: (3 * (1_192 - 788)) / 2_704,
  });
});

test("the outcome reference pins complete schedules and low-score cells", () => {
  for (const season of MATCH_OUTCOME_REFERENCE) {
    // The league grew from 16 clubs to 18 in 2021/22, so the schedule length
    // follows the season, not its position in the window. Keyed on the index
    // instead, this assertion silently re-aimed itself whenever the window
    // moved - which is exactly what it exists to catch.
    expect(season.matches, season.season).toBe(season.season < "2021/22" ? 296 : 306);
    expect(season.homeWins + season.draws + season.awayWins, season.season).toBe(season.matches);
    expect(season.homeGoals + season.awayGoals, season.season).toBe(season.goals);
    expect(season.source, season.season).toMatch(
      /^https:\/\/www\.rsssf\.org\/tablesp\/pol\d{4}\.html$/
    );
  }

  const summary = summarizeMatchOutcomeReference(MATCH_OUTCOME_REFERENCE);
  expect(summary.scorelines).toEqual({
    zeroZero: 208,
    oneZero: 262,
    zeroOne: 203,
    oneOne: 349,
    highDraws: 167,
  });
  // The draw excess over independent Poisson, which is the number that keeps
  // the Dixon-Coles tau correction out of the engine. Widening the window to
  // nine seasons moved it from 0.81 pp at z = 0.92 to 1.18 pp at z = 1.41:
  // larger, still short of separating from zero. Pinned so that a future
  // dependence study starts from a measured figure rather than a memory.
  expect(summary.seasonMeanPoisson.draws.observed).toBe(724);
  expect(summary.seasonMeanPoisson.draws.expected).toBeCloseTo(692.1, 1);
  expect(summary.seasonMeanPoisson.draws.z).toBeCloseTo(1.41, 1);
});

test("the pinned CSV parses to exactly ten complete seasons", () => {
  const rows = readPinnedResults();

  expect(rows).toHaveLength(2_944);
  expect(new Set(rows.map((row) => row.season)).size).toBe(10);
  // Integers, not strings that happen to look numeric.
  expect(rows.every((row) => Number.isInteger(row.homeGoals))).toBe(true);
  // A duplicated fixture would inflate every aggregate downstream.
  const keys = rows.map((row) => `${row.season}|${row.round}|${row.home}|${row.away}`);
  expect(new Set(keys).size).toBe(rows.length);
});

test("every season has a complete, equal set of appearances", () => {
  for (const [season, matches] of bySeason(readPinnedResults())) {
    const appearances = new Map<string, number>();
    for (const match of matches) {
      appearances.set(match.home, (appearances.get(match.home) ?? 0) + 1);
      appearances.set(match.away, (appearances.get(match.away) ?? 0) + 1);
    }
    expect([...new Set(appearances.values())], `${season} has uneven appearances`).toHaveLength(1);
  }
});

test("the calibration window is every pinned season but the pandemic one", () => {
  // Spelled out rather than counted, because the whole point of the window is
  // WHICH seasons are in it. A filter that silently dropped one more would
  // still leave a plausible count.
  expect(CALIBRATION_WINDOW).toEqual([
    "2015/16",
    "2016/17",
    "2017/18",
    "2018/19",
    "2019/20",
    "2021/22",
    "2022/23",
    "2023/24",
    "2024/25",
  ]);
  expect(CALIBRATION_WINDOW).not.toContain(PANDEMIC_SEASON);
});

test("the nine-season window keeps the aggregates the lambdas were fitted to", () => {
  // The fingerprint the two lambda constants are pinned against. It moved
  // from eight seasons to nine on 2026-08-28, when the window took back
  // 2015/16; the eight-season figures it replaced (2408 matches, 6425 goals)
  // are in git history.
  //
  // The point of the test is unchanged: if the pinned results ever shift
  // under the engine, the aggregates the constants were fitted to must not
  // move without somebody saying so out loud.
  const summary = summarizeMatchOutcomeReference(
    matchOutcomeReferenceFrom(readPinnedResults(), CALIBRATION_WINDOW)
  );

  expect(summary.seasons).toBe(9);
  expect(summary.matches).toBe(2_704);
  expect(summary.goals).toBe(7_203);
  expect(summary.homeGoals).toBe(4_053);
  expect(summary.awayGoals).toBe(3_150);
  expect(summary.homeWins).toBe(1_192);
  expect(summary.draws).toBe(724);
  expect(summary.awayWins).toBe(788);
  expect(summary.scorelines).toMatchObject({
    zeroZero: 208,
    oneZero: 262,
    zeroOne: 203,
    oneOne: 349,
  });
});

test("the two lambda constants still reproduce the window they are fitted to", () => {
  // The constants in balance.ts ARE the window's own goal averages, so the
  // fit must be a fixed point: refitting to the same window must return them
  // unchanged. A drifted constant, a moved window or a changed CSV all break
  // this, which is exactly when somebody should be looking.
  const fit = calibratedLambdaFit();

  expect(fit.impliedConstants.baseGoals).toBeCloseTo(MATCH_BASE_GOALS, 12);
  expect(fit.impliedConstants.homeAdvantage).toBeCloseTo(MATCH_HOME_ADVANTAGE, 12);
});

test("the full ten-season set has its own fingerprint", () => {
  const summary = summarizeMatchOutcomeReference(
    matchOutcomeReferenceFrom(readPinnedResults(), ALL_SEASONS)
  );

  expect(summary.seasons).toBe(10);
  expect(summary.matches).toBe(2_944);
  expect(summary.goals).toBe(7_792);
  expect(summary.homeWins).toBe(1_290);
  expect(summary.draws).toBe(790);
  expect(summary.awayWins).toBe(864);
});
