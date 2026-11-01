import { describe, expect, test } from "vitest";

import { ACTIVE_CLUBS, ANCHOR_CLUB_IDS, parseBalanceCli } from "../../scripts/balance-cli";
import { compareRuns, parseDump } from "../../scripts/balance-compare-core";

/**
 * The club dimension of the balance matrix, and the pairing rules that keep
 * it honest. Two dumps that share seeds and policy names are not
 * automatically comparable: they also have to be the same careers, run under
 * the same economy.
 */

describe("parseBalanceCli", () => {
  test("no --clubs flag runs the four-club anchor set", () => {
    const cli = parseBalanceCli([]);
    expect(cli.clubs).toEqual([...ANCHOR_CLUB_IDS]);
    expect(cli.financeControl).toBe(false);
    expect(cli.dumpSignings).toBeNull();
  });

  test("--clubs all is the full eighteen active clubs", () => {
    const cli = parseBalanceCli(["--clubs", "all"]);
    expect(cli.clubs).toHaveLength(18);
    expect(new Set(cli.clubs).size).toBe(18);
    expect(cli.clubs).toEqual([...ACTIVE_CLUBS]);
  });

  test("a list is trimmed and normalised to ids", () => {
    expect(parseBalanceCli(["--clubs", " Widzew , Legia "]).clubs).toEqual([
      "widzew-lodz",
      "legia-warszawa",
    ]);
  });

  test("an id passes through unchanged", () => {
    expect(parseBalanceCli(["--clubs", "widzew-lodz"]).clubs).toEqual(["widzew-lodz"]);
  });

  test.each([
    ["a duplicate short name", "Widzew,Widzew", /Duplicate club/],
    ["a duplicate id and short name for the same club", "widzew-lodz,Widzew", /Duplicate club/],
    ["an empty entry", "Widzew,", /Invalid --clubs/],
    ["an empty list", "", /Invalid --clubs/],
    ["an unknown club", "Barcelona", /Unknown club/],
  ])("%s is rejected", (_label, value, pattern) => {
    expect(() => parseBalanceCli(["--clubs", value])).toThrow(pattern);
  });

  test("--levels was removed and throws a specific message", () => {
    expect(() => parseBalanceCli(["--levels", "sredni"])).toThrow(
      "--levels was removed; use --clubs <id,...> or --clubs all"
    );
  });

  test("--finance-control stands alone and does not eat the next flag", () => {
    const cli = parseBalanceCli(["--finance-control", "--runs", "7"]);
    expect(cli.financeControl).toBe(true);
    expect(cli.runs).toBe(7);
  });

  test("--dump-seasons needs a path and is off by default", () => {
    expect(parseBalanceCli([]).dumpSeasons).toBeNull();
    expect(parseBalanceCli(["--dump-seasons", "seasons.csv"]).dumpSeasons).toBe("seasons.csv");
    expect(() => parseBalanceCli(["--dump-seasons"])).toThrow(/requires a value/);
  });

  test("--dump-signings needs a path", () => {
    expect(parseBalanceCli(["--dump-signings", "out.csv"]).dumpSignings).toBe("out.csv");
    expect(() => parseBalanceCli(["--dump-signings"])).toThrow(/requires a value/);
  });

  test("--dump-sales needs a path and is off by default", () => {
    expect(parseBalanceCli([]).dumpSales).toBeNull();
    expect(parseBalanceCli(["--dump-sales", "sales.csv"]).dumpSales).toBe("sales.csv");
    expect(() => parseBalanceCli(["--dump-sales"])).toThrow(/requires a value/);
  });

  test("every active club resolves to itself", () => {
    for (const clubId of ACTIVE_CLUBS) {
      expect(parseBalanceCli(["--clubs", clubId]).clubs).toEqual([clubId]);
    }
  });
});

const HEADER =
  "clubId,polityka,seed,dziedzictwo,tytul,spadkiKadencja,sezonyRozegrane,clubShortName,incomeMode,dumpSchemaVersion,signingCount";

const clubRow = (
  clubId: string,
  policy: string,
  seed: number,
  legacy: number,
  incomeMode = "normal"
): string => `${clubId},${policy},${seed},${legacy},TEST,0,5,,${incomeMode},5,3`;

const clubDump = (rows: readonly string[]): string => [HEADER, ...rows].join("\n");

const LEGACY_HEADER = "poziom,polityka,seed,dziedzictwo,tytul,spadkiKadencja,sezonyRozegrane";
const legacyDump = (rows: readonly string[]): string => [LEGACY_HEADER, ...rows].join("\n");

describe("club-aware pairing", () => {
  test("two clubs on one policy and seed stay two cells", () => {
    // Before club ids existed, the cell key could collapse two clubs into
    // one row; this pins that a schema-5 dump never does.
    const before = clubDump([
      clubRow("legia-warszawa", "alwaysTake", 1, 100),
      clubRow("widzew-lodz", "alwaysTake", 1, 200),
    ]);
    const after = clubDump([
      clubRow("legia-warszawa", "alwaysTake", 1, 101),
      clubRow("widzew-lodz", "alwaysTake", 1, 210),
    ]);

    const cells = compareRuns(before, after);
    expect(cells).toHaveLength(2);
    const byClub = new Map(cells.map((c) => [c.klub, c]));
    expect(byClub.get("legia-warszawa")!.dziedzictwo.meanDiff).toBeCloseTo(1, 10);
    expect(byClub.get("widzew-lodz")!.dziedzictwo.meanDiff).toBeCloseTo(10, 10);
    for (const cell of cells) {
      expect(cell.pairedSeeds).toBe(1);
      expect(cell.droppedSeeds).toEqual([]);
    }
  });

  test("a duplicated career in one file is an error", () => {
    expect(() =>
      parseDump(
        clubDump([
          clubRow("legia-warszawa", "alwaysTake", 1, 100),
          clubRow("legia-warszawa", "alwaysTake", 1, 100),
        ])
      )
    ).toThrow(/duplicate/);
  });

  test("the same seed at different clubs is not a duplicate", () => {
    const parsed = parseDump(
      clubDump([
        clubRow("legia-warszawa", "alwaysTake", 1, 100),
        clubRow("widzew-lodz", "alwaysTake", 1, 100),
      ])
    );
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.identity.mode).toBe("clubId");
  });

  test("an old level dump still reads", () => {
    const parsed = parseDump(legacyDump(["sredni,alwaysTake,1,100,TEST,0,5"]));
    expect(parsed.identity).toEqual({ mode: "level", incomeMode: "normal" });
    expect(parsed.rows[0]!.klub).toBe("");
  });

  test("a level dump cannot be paired with a club dump", () => {
    expect(() =>
      compareRuns(
        legacyDump(["sredni,alwaysTake,1,100,TEST,0,5"]),
        clubDump([clubRow("legia-warszawa", "alwaysTake", 1, 100)])
      )
    ).toThrow(/not the same careers/);
  });

  test("a normal dump cannot be paired with a finance-control one", () => {
    expect(() =>
      compareRuns(
        clubDump([clubRow("legia-warszawa", "alwaysTake", 1, 100)]),
        clubDump([clubRow("legia-warszawa", "alwaysTake", 1, 100, "finance-control")])
      )
    ).toThrow(/different economies/);
  });

  test("an old short-name dump pairs with a new clubId dump for the same club", () => {
    const OLD_HEADER =
      "poziom,polityka,seed,dziedzictwo,tytul,spadkiKadencja,sezonyRozegrane,clubShortName,incomeMode,dumpSchemaVersion,signingCount";
    const oldDump = [OLD_HEADER, "sredni,alwaysTake,1,100,TEST,0,5,Legia,normal,4,3"].join("\n");
    const newDump = clubDump([clubRow("legia-warszawa", "alwaysTake", 1, 110)]);

    const [cell] = compareRuns(oldDump, newDump);
    expect(cell!.pairedSeeds).toBe(1);
    expect(cell!.dziedzictwo.meanDiff).toBeCloseTo(10, 10);
  });
});
