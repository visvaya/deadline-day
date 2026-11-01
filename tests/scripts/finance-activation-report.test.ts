import { describe, expect, test } from "vitest";

import { KOSZTY_STALE, WOLNY_WAGE_PREMIUM } from "../../src/data/balance";
import {
  DUMP_SCHEMA_VERSION,
  SEASON_COLUMNS as DUMP_SEASON_COLUMNS,
} from "../../scripts/balance-metrics";
import {
  CASH_DRIFT_TOLERANCE,
  FREE_AGENT_BAND,
  LEGACY_TOLERANCE,
  MONEY_SCALE_TOLERANCE,
  cashDrift,
  careerLengths,
  freeAgentRatios,
  ladderShares,
  legacyUnit,
  medianOfClubMedians,
  moneyScaleStep,
  pairRngCounts,
  parseSeasonDump,
  playability,
  verdictKasaShift,
} from "../../scripts/finance-activation-report-core";

/**
 * The activation report's arithmetic, on rows built by hand.
 *
 * Every gate here is one the plan can be stopped by, so each is checked on a
 * case where it must pass AND one where it must block. A gate that only ever
 * sees good data is not a gate.
 */

/** The writer's own column list, imported rather than copied: a fixture that
 * restated the header would keep passing the day a column was appended. */
const SEASON_COLUMNS = [...DUMP_SEASON_COLUMNS];

/** The header as schema 3 wrote it: none of the columns schema 4 appended. */
const SEASON_COLUMNS_V3 = SEASON_COLUMNS.slice(0, -5);

type SeasonOverrides = Partial<{
  schema: number;
  engineVersion: string;
  incomeMode: string;
  club: string;
  policy: string;
  seed: number;
  season: number;
  budget: number;
  forecastBalance: number;
  actualBalance: number;
  revenue: number;
  ladder: number;
  payroll: number;
  scalablePln: number;
  handover: number | null;
  europeanPrize: number;
  polishCupPrize: number;
  superCupPrize: number;
  draws: number;
}>;

const seasonRow = (o: SeasonOverrides = {}): string =>
  [
    String(o.schema ?? DUMP_SCHEMA_VERSION),
    o.engineVersion ?? "2026-09-10.1",
    o.incomeMode ?? "finance-control",
    o.club ?? "Legia",
    o.policy ?? "alwaysPass",
    String(o.seed ?? 1),
    String(o.season ?? 1),
    String(o.budget ?? 7),
    String(o.forecastBalance ?? 1),
    String(o.actualBalance ?? 1),
    String(o.revenue ?? 9),
    String(o.ladder ?? 0.2),
    String(o.payroll ?? 7),
    String(KOSZTY_STALE),
    String(o.scalablePln ?? 1_000_000),
    o.handover === undefined ? "" : o.handover === null ? "" : String(o.handover),
    String(o.europeanPrize ?? 0),
    String(o.polishCupPrize ?? 0),
    String(o.superCupPrize ?? 0),
    String((o.europeanPrize ?? 0) + (o.polishCupPrize ?? 0) + (o.superCupPrize ?? 0)),
    String(o.draws ?? 1000 + (o.season ?? 1)),
  ].join(",");

/** The same row as schema 3 wrote it: every field up to cashAtHandover and
 * nothing after. Proves the pinned 2026-09-10 artefacts still read. */
const seasonRowV3 = (o: SeasonOverrides = {}): string =>
  seasonRow({ ...o, schema: o.schema ?? 3 })
    .split(",")
    .slice(0, SEASON_COLUMNS_V3.length)
    .join(",");

const seasonDump = (rows: readonly string[]): string =>
  [SEASON_COLUMNS.join(","), ...rows].join("\n");

const seasonDumpV3 = (rows: readonly string[]): string =>
  [SEASON_COLUMNS_V3.join(","), ...rows].join("\n");

describe("parseSeasonDump - what it refuses", () => {
  test("reads a well-formed dump", () => {
    const rows = parseSeasonDump(seasonDump([seasonRow(), seasonRow({ season: 2 })]), {
      incomeMode: "finance-control",
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.clubShortName).toBe("Legia");
    expect(rows[0]!.cashAtHandover).toBeNull();
  });

  test("a dump written by an older schema", () => {
    expect(() =>
      parseSeasonDump(seasonDump([seasonRow({ schema: 2 })]), { incomeMode: "finance-control" })
    ).toThrow(/schema/);
  });

  test("still reads the pinned schema-3 artefacts, with the cups absent rather than zero", () => {
    // The 2026-09-10 activation dumps are schema 3 and are never regenerated.
    // An equality check against the current version would have made that
    // report unreproducible the moment the schema moved.
    const rows = parseSeasonDump(seasonDumpV3([seasonRowV3(), seasonRowV3({ season: 2 })]), {
      incomeMode: "finance-control",
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.dumpSchemaVersion).toBe(3);
    // Null, NOT zero: schema 3 did not measure the cups, and a zero would turn
    // an absent measurement into a measured absence.
    expect(rows[0]!.europeanPrizeIncome).toBeNull();
    expect(rows[0]!.polishCupPrizeIncome).toBeNull();
    expect(rows[0]!.superCupPrizeIncome).toBeNull();
    expect(rows[0]!.creditedCupIncome).toBeNull();
    expect(rows[0]!.rngDrawCount).toBeNull();
  });

  test("reads the cups off a schema-4 row, and sums them", () => {
    const rows = parseSeasonDump(
      seasonDump([
        seasonRow({ incomeMode: "normal", europeanPrize: 2.5, polishCupPrize: 1.4 }),
        seasonRow({ incomeMode: "normal", season: 2, superCupPrize: 0.3 }),
      ]),
      { incomeMode: "normal" }
    );
    expect(rows[0]!.creditedCupIncome).toBeCloseTo(3.9, 9);
    expect(rows[1]!.creditedCupIncome).toBeCloseTo(0.3, 9);
  });

  test("refuses a schema-4 row whose credited cup total disagrees with its components", () => {
    const cells = seasonRow({
      incomeMode: "normal",
      europeanPrize: 2.5,
      polishCupPrize: 1.4,
    }).split(",");
    cells[SEASON_COLUMNS.indexOf("creditedCupIncome")] = "0";
    expect(() => parseSeasonDump(seasonDump([cells.join(",")]), { incomeMode: "normal" })).toThrow(
      /creditedCupIncome.*sum/
    );
  });

  test("refuses a schema-4 row whose cup column is missing", () => {
    // The one shape that must never be read as a zero: a truncated schema-4
    // row looks exactly like a season in which nothing was won.
    const truncated = [SEASON_COLUMNS.join(","), seasonRowV3({ schema: 4 })].join("\n");
    expect(() => parseSeasonDump(truncated, { incomeMode: "finance-control" })).toThrow(
      /requires the "europeanPrizeIncome" column/
    );
    // The per-season draw tally is required on schema 4 for the same reason:
    // a zero there would read as a career that never touched the generator.
    const noDraws = [SEASON_COLUMNS.join(","), seasonRow().split(",").slice(0, -1).join(",")].join(
      "\n"
    );
    expect(() => parseSeasonDump(noDraws, { incomeMode: "finance-control" })).toThrow(
      /requires the "rngDrawCount" column/
    );
  });

  test("a dump from the wrong economy", () => {
    // Pairing a controlled run with a normal one would compare the very thing
    // under measurement against itself.
    expect(() =>
      parseSeasonDump(seasonDump([seasonRow({ incomeMode: "normal" })]), {
        incomeMode: "finance-control",
      })
    ).toThrow(/incomeMode/);
  });

  test("the same season twice", () => {
    expect(() =>
      parseSeasonDump(seasonDump([seasonRow(), seasonRow()]), { incomeMode: "finance-control" })
    ).toThrow(/duplicate/);
  });

  test("two engine versions in one file", () => {
    expect(() =>
      parseSeasonDump(
        seasonDump([seasonRow(), seasonRow({ season: 2, engineVersion: "2026-09-07.1" })]),
        { incomeMode: "finance-control" }
      )
    ).toThrow(/engine versions/);
  });

  test("a missing column", () => {
    const header = SEASON_COLUMNS.filter((c) => c !== "scalableNetPln").join(",");
    expect(() => parseSeasonDump(header, { incomeMode: "finance-control" })).toThrow(
      /scalableNetPln/
    );
  });
});

describe("medianOfClubMedians", () => {
  test("weights every club equally, whatever its number of careers", () => {
    // Widzew has one season at 10; Legia has nine at 0. Pooling would give 0;
    // weighting clubs equally gives 5.
    const rows = parseSeasonDump(
      seasonDump([
        ...Array.from({ length: 9 }, (_, i) =>
          seasonRow({ club: "Legia", seed: i + 1, actualBalance: 0 })
        ),
        seasonRow({ club: "Widzew", seed: 1, actualBalance: 10 }),
      ]),
      { incomeMode: "finance-control" }
    );

    expect(medianOfClubMedians(rows, (r) => r.actualBalanceWithoutTransfersAndCups)).toBe(5);
  });
});

describe("moneyScaleStep", () => {
  test("passes a league centred on zero and derives the scale the seasons imply", () => {
    const rows = parseSeasonDump(
      seasonDump([
        seasonRow({ club: "Legia", actualBalance: 0.1, scalablePln: 1_100_000 }),
        seasonRow({ club: "Widzew", actualBalance: -0.1, scalablePln: 1_100_000 }),
      ]),
      { incomeMode: "finance-control" }
    );
    const step = moneyScaleStep(rows);

    expect(step.balanceMedian).toBeCloseTo(0, 12);
    expect(step.withinTolerance).toBe(true);
    // Dcandidate = median scalable PLN / KOSZTY_STALE: the scale at which the
    // median ordinary season would come out exactly even.
    expect(step.dCandidate).toBeCloseTo(1_100_000 / KOSZTY_STALE, 6);
  });

  test("blocks a league that is off centre", () => {
    const rows = parseSeasonDump(
      seasonDump([
        seasonRow({ club: "Legia", actualBalance: MONEY_SCALE_TOLERANCE + 0.01 }),
        seasonRow({ club: "Widzew", actualBalance: MONEY_SCALE_TOLERANCE + 0.01 }),
      ]),
      { incomeMode: "finance-control" }
    );

    expect(moneyScaleStep(rows).withinTolerance).toBe(false);
  });
});

describe("cashDrift", () => {
  /** A five-season career: cash at handover minus the budget minus the sum of
   * the preseason forecasts. */
  const career = (club: string, seed: number, forecast: number, handover: number): string[] =>
    Array.from({ length: 5 }, (_, i) =>
      seasonRow({
        club,
        seed,
        season: i + 1,
        budget: 2,
        forecastBalance: forecast,
        handover: i === 4 ? handover : undefined,
      })
    );

  test("a career that ended exactly where its forecasts said has no residual", () => {
    const rows = parseSeasonDump(seasonDump(career("Legia", 1, 1, 2 + 5)), {
      incomeMode: "finance-control",
    });
    const [drift] = cashDrift(rows);

    expect(drift!.medianResidual).toBeCloseTo(0, 12);
    expect(drift!.withinTolerance).toBe(true);
    expect(drift!.careers).toBe(1);
  });

  test("blocks a career that quietly accumulated cash", () => {
    const rows = parseSeasonDump(
      seasonDump(career("Legia", 1, 1, 2 + 5 + CASH_DRIFT_TOLERANCE + 0.01)),
      { incomeMode: "finance-control" }
    );

    expect(cashDrift(rows)[0]!.withinTolerance).toBe(false);
  });

  test("sums only the seasons a shortened career actually played", () => {
    // Relegation ends the tenure after three seasons: three forecasts, not five.
    const rows = parseSeasonDump(
      seasonDump(
        Array.from({ length: 3 }, (_, i) =>
          seasonRow({
            club: "Legia",
            seed: 1,
            season: i + 1,
            budget: 2,
            forecastBalance: 1,
            handover: i === 2 ? 5 : undefined,
          })
        )
      ),
      { incomeMode: "finance-control" }
    );

    expect(cashDrift(rows)[0]!.medianResidual).toBeCloseTo(0, 12);
  });

  test("a career with no handover row is an error, not a zero", () => {
    const rows = parseSeasonDump(seasonDump([seasonRow({ handover: undefined })]), {
      incomeMode: "finance-control",
    });
    expect(() => cashDrift(rows)).toThrow(/handover/);
  });
});

describe("ladderShares", () => {
  test("the same ladder is a bigger share of a smaller club's season", () => {
    const rows = parseSeasonDump(
      seasonDump([
        seasonRow({ club: "Legia", revenue: 9 }),
        seasonRow({ club: "Korona", revenue: 1 }),
      ]),
      { incomeMode: "finance-control" }
    );
    const shares = ladderShares(rows, (place) => 0.02 * (19 - place));
    const byClub = new Map(shares.map((s) => [s.clubShortName, s]));

    expect(byClub.get("Korona")!.shareAsChampion).toBeGreaterThan(
      byClub.get("Legia")!.shareAsChampion
    );
    // Nothing in the code does this: the ladder is identical, the bases differ.
    expect(byClub.get("Legia")!.shareAsChampion).toBeLessThan(0.05);
  });
});

describe("careerLengths", () => {
  test("counts seasons per career and the share cut short", () => {
    const rows = parseSeasonDump(
      seasonDump([
        ...Array.from({ length: 5 }, (_, i) => seasonRow({ seed: 1, season: i + 1 })),
        ...Array.from({ length: 2 }, (_, i) => seasonRow({ seed: 2, season: i + 1 })),
      ]),
      { incomeMode: "finance-control" }
    );
    const lengths = careerLengths(rows, 5);

    expect(lengths.careers).toBe(2);
    expect(lengths.medianSeasons).toBe(3.5);
    expect(lengths.shareCutShort).toBe(0.5);
  });
});

describe("freeAgentRatios", () => {
  /** The overpay is `(premium - 1) x two seasons of base wage / reference fee`.
   * Choosing the fee makes the expected ratio exact. */
  const rowsFor = (ratio: number) => {
    const baseAnnualWage = 1;
    const referenceFee = (2 * baseAnnualWage * (WOLNY_WAGE_PREMIUM - 1)) / ratio;
    return [
      { policyName: "alwaysTake", baseAnnualWage, referenceFee },
      { policyName: "alwaysTake", baseAnnualWage, referenceFee },
    ];
  };

  test("passes inside the spec's band", () => {
    const [row] = freeAgentRatios(rowsFor(0.5));
    expect(row!.achievedRatio).toBeCloseTo(0.5, 12);
    expect(row!.withinBand).toBe(true);
    expect(row!.signings).toBe(2);
  });

  test("blocks below the band, where the card is still a gift", () => {
    expect(freeAgentRatios(rowsFor(FREE_AGENT_BAND.lo - 0.01))[0]!.withinBand).toBe(false);
  });

  test("blocks above the band, where the card stops being an opportunity", () => {
    expect(freeAgentRatios(rowsFor(FREE_AGENT_BAND.hi + 0.01))[0]!.withinBand).toBe(false);
  });

  test("a signing without a usable reference fee is an error", () => {
    expect(() =>
      freeAgentRatios([{ policyName: "alwaysTake", baseAnnualWage: 1, referenceFee: 0 }])
    ).toThrow(/reference fee/);
  });
});

describe("playability", () => {
  test("names the clubs that cannot afford a median card", () => {
    const rows = playability(
      [
        { clubShortName: "Legia", budget: 3 },
        { clubShortName: "Korona", budget: 0.5 },
      ],
      0.75
    );

    expect(rows[0]!.clubShortName).toBe("Korona");
    expect(rows[0]!.affordable).toBe(false);
    expect(rows[1]!.affordable).toBe(true);
  });
});

describe("legacyUnit", () => {
  test("a multiplier that reproduces the historical product passes", () => {
    const unit = legacyUnit("kasa", 16.55, 3.31, 5);
    expect(unit.rebuiltProduct).toBeCloseTo(16.55, 12);
    expect(unit.relativeError).toBeCloseTo(0, 12);
    expect(unit.withinTolerance).toBe(true);
  });

  test("blocks once the product drifts past the tolerance", () => {
    const unit = legacyUnit("kasa", 16.55, 3.31 * (1 + LEGACY_TOLERANCE + 0.01), 5);
    expect(unit.withinTolerance).toBe(false);
  });

  test("a median of zero has no sensible conversion and must not be divided", () => {
    expect(() => legacyUnit("wartoscKadryMoj", 3.98, 0, 2)).toThrow(/no sensible/);
    expect(() => legacyUnit("wartoscKadryMoj", 3.98, -1, 2)).toThrow(/no sensible/);
  });
});

describe("verdictKasaShift", () => {
  test("reports changes in the observable verdict class as a lower bound", () => {
    const before = [
      { key: "Legia\0one", verdict: "lowest", kasa: 3, hasBerth: false },
      { key: "Legia\0two", verdict: "one of the upper three", kasa: 4, hasBerth: false },
    ];
    const after = [
      { key: "Legia\0one", verdict: "one of the upper three", kasa: 1, hasBerth: false },
      { key: "Legia\0two", verdict: "one of the upper three", kasa: 2, hasBerth: false },
    ];

    const result = verdictKasaShift(before, after, 5, ["lowest", "one of the upper three"]);

    expect(result.changedClass).toBe(1);
    expect(result.changedClassWithoutBerth).toBe(1);
    expect(result.careers).toBe(2);
  });
});

describe("pairRngCounts", () => {
  const BERTHS = new Set(["Lech"]);
  /** `[draws, verdictDraws, seasonsPlayed, tenureRelegations, leaguePoints]` -
   * the pinned snapshot's tuple, minus the cash column the pairing never
   * reads. */
  const before =
    (rows: Record<string, [number, number, number, number, number]>) =>
    (club: string, seed: number) => {
      const tuple = rows[`${club} ${seed}`];
      if (!tuple) return undefined;
      return {
        draws: tuple[0],
        verdictDraws: tuple[1],
        seasonsPlayed: tuple[2],
        tenureRelegations: tuple[3],
        leaguePoints: tuple[4],
      };
    };

  test("identical tallies are attributed and pass", () => {
    const result = pairRngCounts(
      before({ "Legia 1": [100, 1, 5, 0, 200] }),
      [
        {
          club: "Legia",
          seed: 1,
          draws: 100,
          verdictDraws: 1,
          seasonsPlayed: 5,
          tenureRelegations: 0,
          leaguePoints: 200,
        },
      ],
      BERTHS
    );

    expect(result.identical).toBe(1);
    expect(result.allAttributed).toBe(true);
  });

  test("a berth club's difference is attributed to its season-one campaign", () => {
    const result = pairRngCounts(
      before({ "Lech 1": [100, 1, 5, 0, 200] }),
      [
        {
          club: "Lech",
          seed: 1,
          draws: 137,
          verdictDraws: 1,
          seasonsPlayed: 4,
          tenureRelegations: 1,
          leaguePoints: 200,
        },
      ],
      BERTHS
    );

    expect(result.explainedByBerth).toBe(1);
    expect(result.unexplained).toEqual([]);
    // A berth club's tenure IS allowed to move: the cup changes squad strength.
    expect(result.tenureMovedWithoutBerth).toBe(0);
    expect(result.allAttributed).toBe(true);
  });

  test("a crossed verdict branch is attributed", () => {
    const result = pairRngCounts(
      before({ "Legia 1": [100, 0, 5, 0, 200] }),
      [
        {
          club: "Legia",
          seed: 1,
          draws: 143,
          verdictDraws: 1,
          seasonsPlayed: 5,
          tenureRelegations: 0,
          leaguePoints: 200,
        },
      ],
      BERTHS
    );

    expect(result.explainedByVerdict).toBe(1);
    expect(result.allAttributed).toBe(true);
  });

  test("blocks a difference nothing accounts for", () => {
    const result = pairRngCounts(
      before({ "Legia 1": [100, 1, 5, 0, 200] }),
      [
        {
          club: "Legia",
          seed: 1,
          draws: 101,
          verdictDraws: 1,
          seasonsPlayed: 5,
          tenureRelegations: 0,
          leaguePoints: 200,
        },
      ],
      BERTHS
    );

    expect(result.unexplained).toHaveLength(1);
    expect(result.allAttributed).toBe(false);
  });

  test("blocks a non-berth club whose tenure moved, even with the tally intact", () => {
    // The stronger claim: the economy must not reorder the game itself. A
    // career that played a different number of seasons did, whether or not
    // the totals happen to land on the same number.
    const result = pairRngCounts(
      before({ "Legia 1": [100, 1, 5, 0, 200] }),
      [
        {
          club: "Legia",
          seed: 1,
          draws: 100,
          verdictDraws: 1,
          seasonsPlayed: 4,
          tenureRelegations: 1,
          leaguePoints: 200,
        },
      ],
      BERTHS
    );

    expect(result.identical).toBe(1);
    expect(result.tenureMovedWithoutBerth).toBe(1);
    expect(result.allAttributed).toBe(false);
  });

  test("separates a berth career that never diverged from one that re-converged", () => {
    // A season-one campaign consumes a VARIABLE number of values, so a berth
    // career can land back on the same total two different ways. League
    // points tell them apart: they depend on squad strength and the match
    // RNG, never on money.
    const result = pairRngCounts(
      before({
        "Lech 1": [100, 1, 5, 0, 200],
        "Lech 2": [100, 1, 5, 0, 200],
        "Lech 3": [100, 1, 5, 0, 200],
      }),
      [
        // Same tally, same points: the stream never diverged.
        {
          club: "Lech",
          seed: 1,
          draws: 100,
          verdictDraws: 1,
          seasonsPlayed: 5,
          tenureRelegations: 0,
          leaguePoints: 200,
        },
        // Same tally, different points: diverged and re-converged by chance.
        {
          club: "Lech",
          seed: 2,
          draws: 100,
          verdictDraws: 1,
          seasonsPlayed: 5,
          tenureRelegations: 0,
          leaguePoints: 187,
        },
        // Different tally, same points.
        {
          club: "Lech",
          seed: 3,
          draws: 137,
          verdictDraws: 1,
          seasonsPlayed: 5,
          tenureRelegations: 0,
          leaguePoints: 200,
        },
      ],
      BERTHS
    );

    expect(result.berth.careers).toBe(3);
    expect(result.berth.unchangedTally).toBe(2);
    expect(result.berth.unchangedTallyAndPoints).toBe(1);
    expect(result.berth.movedTallySamePoints).toBe(1);
    expect(result.berth.deltaMedian).toBe(0);
    expect(result.allAttributed).toBe(true);
  });

  test("blocks a career the snapshot never recorded", () => {
    const result = pairRngCounts(
      before({}),
      [
        {
          club: "Legia",
          seed: 9,
          draws: 100,
          verdictDraws: 1,
          seasonsPlayed: 5,
          tenureRelegations: 0,
          leaguePoints: 200,
        },
      ],
      BERTHS
    );

    expect(result.missing).toBe(1);
    expect(result.allAttributed).toBe(false);
  });
});
