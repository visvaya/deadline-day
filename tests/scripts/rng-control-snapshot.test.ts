import { describe, expect, test } from "vitest";

import { DUMP_SCHEMA_VERSION } from "../../scripts/balance-metrics";
import {
  NO_DRAW_VERDICT,
  RNG_SNAPSHOT_SCHEMA_VERSION,
  buildRngSnapshot,
  serialiseSnapshot,
} from "../../scripts/rng-control-snapshot";

/**
 * The snapshot is the only preactivation fact the activation commit cannot
 * recreate: once the economy is on, the code that produced these tallies is
 * gone from the working tree. So the builder refuses anything but the exact
 * run the plan specifies - a snapshot taken from the wrong policy, the wrong
 * economy or a short matrix would look like evidence and be none.
 */

const CLUBS = ["Legia", "Widzew", "Wieczysta"];

const HEADER = [
  "polityka",
  "seed",
  "clubShortName",
  "incomeMode",
  "dumpSchemaVersion",
  "rngDrawCount",
  "werdykt",
  "sezonyRozegrane",
  "spadkiKadencja",
  "kasa",
  "pktA",
].join(",");

const row = (
  club: string,
  seed: number,
  draws: number,
  overrides: Partial<{
    policy: string;
    incomeMode: string;
    schema: number;
    verdict: string;
    seasons: number;
    relegations: number;
    kasa: number;
    points: number;
  }> = {}
): string =>
  [
    overrides.policy ?? "alwaysPass",
    String(seed),
    club,
    overrides.incomeMode ?? "finance-control",
    String(overrides.schema ?? DUMP_SCHEMA_VERSION),
    String(draws),
    overrides.verdict ?? "KLUB Z CZOŁÓWKI",
    String(overrides.seasons ?? 5),
    String(overrides.relegations ?? 0),
    String(overrides.kasa ?? 3.5),
    String(overrides.points ?? 210),
  ].join(",");

/** Two seeds per club, so "one seed per club" cannot pass by accident. */
const dumpOf = (rows: readonly string[]): string => [HEADER, ...rows].join("\n");

const wellFormed = (): string =>
  dumpOf([
    row("Legia", 1, 4111),
    row("Legia", 2, 4222),
    row("Widzew", 1, 4333),
    row("Widzew", 2, 4444),
    row("Wieczysta", 1, 4555),
    row("Wieczysta", 2, 4666),
  ]);

const build = (csv: string, overrides: Partial<Parameters<typeof buildRngSnapshot>[0]> = {}) =>
  buildRngSnapshot({
    csv,
    dumpPath: "scripts/data/x/preactivation-control-raw.csv",
    sha256: "a".repeat(64),
    baseSha: "b".repeat(40),
    engineRevision: "2026-09-07.1",
    seed: "0x5eed0001",
    clubs: CLUBS,
    runsPerCell: 2,
    ...overrides,
  });

describe("buildRngSnapshot - what it records", () => {
  test("keys every career by club and seed", () => {
    const snapshot = build(wellFormed());

    expect(snapshot.schemaVersion).toBe(RNG_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.careerCount).toBe(6);
    expect(Object.keys(snapshot.careers).sort()).toEqual([...CLUBS].sort());
    expect(snapshot.careers.Legia!["1"]).toEqual([4111, 1, 5, 0, 3.5, 210]);
    expect(snapshot.careers.Wieczysta!["2"]![0]!).toBe(4666);
  });

  test("records whether the verdict itself drew, which is what attributes a later difference", () => {
    // Three of computeVerdict's four branches pick one value; the first
    // returns before touching the generator. The verdict score reads cash, so
    // activating the economy moves careers across that boundary - and without
    // this column a later report could see a difference but not explain it.
    const snapshot = build(
      dumpOf([
        row("Legia", 1, 10, { verdict: NO_DRAW_VERDICT }),
        row("Legia", 2, 20),
        row("Widzew", 1, 30),
        row("Widzew", 2, 40),
        row("Wieczysta", 1, 50),
        row("Wieczysta", 2, 60),
      ])
    );

    expect(snapshot.careers.Legia!["1"]![1]!).toBe(0);
    expect(snapshot.careers.Legia!["2"]![1]!).toBe(1);
  });

  test("records the tenure, so a later report can claim rather than assume it held", () => {
    const snapshot = build(
      dumpOf([
        row("Legia", 1, 10, { seasons: 3, relegations: 1 }),
        row("Legia", 2, 20),
        row("Widzew", 1, 30),
        row("Widzew", 2, 40),
        row("Wieczysta", 1, 50),
        row("Wieczysta", 2, 60),
      ])
    );

    expect(snapshot.columns).toEqual([
      "rngDrawCount",
      "verdictDraws",
      "seasonsPlayed",
      "tenureRelegations",
      "kasa",
      "leaguePoints",
    ]);
    expect(snapshot.careers.Legia!["1"]).toEqual([10, 1, 3, 1, 3.5, 210]);
    expect(snapshot.careers.Legia!["2"]).toEqual([20, 1, 5, 0, 3.5, 210]);
  });

  test("serialises each career on one line, so the file stays readable and small", () => {
    const text = serialiseSnapshot(build(wellFormed()));

    expect(text).toContain('"1": [4111, 1, 5, 0, 3.5, 210]');
    expect(JSON.parse(text).careers.Legia["1"]).toEqual([4111, 1, 5, 0, 3.5, 210]);
    expect(text.endsWith("}\n")).toBe(true);
  });

  test("a career without a verdict is refused", () => {
    expect(() => build(dumpOf([row("Legia", 1, 10, { verdict: "" })]))).toThrow(/verdict/);
  });

  test("carries the identity of the run it came from", () => {
    const snapshot = build(wellFormed());

    expect(snapshot.dump).toEqual({
      path: "scripts/data/x/preactivation-control-raw.csv",
      sha256: "a".repeat(64),
    });
    expect(snapshot.baseSha).toBe("b".repeat(40));
    expect(snapshot.run).toEqual({
      seed: "0x5eed0001",
      runsPerCell: 2,
      policies: ["alwaysPass"],
      clubs: [...CLUBS].sort(),
      incomeMode: "finance-control",
      dumpSchemaVersion: DUMP_SCHEMA_VERSION,
      engineRevision: "2026-09-07.1",
    });
  });

  test("records the schema the rows actually carry, not the current constant", () => {
    // The pinned 2026-09-10 snapshot came off a schema-3 dump. Writing the
    // constant here would relabel that file as whatever the code was last
    // compiled against, which is the one error a snapshot cannot survive:
    // it exists precisely to say what the run was.
    const seeds = [1, 2];
    const rows = CLUBS.flatMap((club) => seeds.map((seed) => row(club, seed, 10, { schema: 3 })));
    const snapshot = build(dumpOf(rows));
    expect(snapshot.run.dumpSchemaVersion).toBe(3);
    expect(snapshot.run.dumpSchemaVersion).not.toBe(DUMP_SCHEMA_VERSION);
  });
});

describe("buildRngSnapshot - what it refuses", () => {
  test("a dump missing the tally column", () => {
    const csv = [
      "polityka,seed,clubShortName,incomeMode,dumpSchemaVersion",
      "alwaysPass,1,Legia,finance-control,3",
    ].join("\n");
    expect(() => build(csv)).toThrow(/rngDrawCount/);
  });

  test("a run that was not the control", () => {
    const csv = dumpOf([row("Legia", 1, 1, { incomeMode: "normal" })]);
    expect(() => build(csv)).toThrow(/finance-control/);
  });

  test("a policy other than alwaysPass", () => {
    const csv = dumpOf([row("Legia", 1, 1, { policy: "alwaysTake" })]);
    expect(() => build(csv)).toThrow(/alwaysPass/);
  });

  test("a dump written by an older schema", () => {
    const csv = dumpOf([row("Legia", 1, 1, { schema: 2 })]);
    expect(() => build(csv)).toThrow(/schema/i);
  });

  test("a dump that mixes two accepted schemas", () => {
    // Both 3 and 4 are readable on their own; a file carrying both did not
    // come from one run, and pairing careers across it would pair nothing.
    const csv = dumpOf([row("Legia", 1, 10, { schema: 3 }), row("Legia", 2, 10, { schema: 4 })]);
    expect(() => build(csv)).toThrow(/mixes schema/);
  });

  test("a club the run was not supposed to cover", () => {
    const csv = dumpOf([...wellFormed().split("\n").slice(1), row("Lech", 1, 9)]);
    expect(() => build(csv)).toThrow(/Lech/);
  });

  test("a club short of its seeds", () => {
    const csv = dumpOf([row("Legia", 1, 1), row("Widzew", 1, 1), row("Wieczysta", 1, 1)]);
    expect(() => build(csv)).toThrow(/1 career/);
  });

  test("a club missing entirely", () => {
    const csv = dumpOf([
      row("Legia", 1, 1),
      row("Legia", 2, 2),
      row("Widzew", 1, 3),
      row("Widzew", 2, 4),
    ]);
    expect(() => build(csv)).toThrow(/Wieczysta/);
  });

  test("the same career twice", () => {
    const csv = dumpOf([
      row("Legia", 1, 4111),
      row("Legia", 1, 4111),
      row("Widzew", 1, 1),
      row("Widzew", 2, 2),
      row("Wieczysta", 1, 3),
      row("Wieczysta", 2, 4),
    ]);
    expect(() => build(csv)).toThrow(/duplicate/i);
  });

  test("a tally that is not a positive whole number", () => {
    expect(() => build(dumpOf([row("Legia", 1, 0)]))).toThrow(/rngDrawCount/);
    const fractional = dumpOf([
      [
        "alwaysPass",
        "1",
        "Legia",
        "finance-control",
        String(DUMP_SCHEMA_VERSION),
        "12.5",
        "KLUB Z CZOŁÓWKI",
        "5",
        "0",
        "3.5",
        "210",
      ].join(","),
    ]);
    expect(() => build(fractional)).toThrow(/rngDrawCount/);
  });

  test("a tenure length that is not a positive whole number", () => {
    expect(() => build(dumpOf([row("Legia", 1, 10, { seasons: 0 })]))).toThrow(/sezonyRozegrane/);
    expect(() => build(dumpOf([row("Legia", 1, 10, { relegations: -1 })]))).toThrow(
      /spadkiKadencja/
    );
  });

  test("an empty dump", () => {
    expect(() => build(dumpOf([]))).toThrow(/no career rows/);
  });
});
