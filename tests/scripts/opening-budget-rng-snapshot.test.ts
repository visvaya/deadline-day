import { describe, expect, it } from "vitest";

import { clubIdForShortName } from "../../src/data/clubs";
import { ENGINE_REVISION } from "../../src/logic/engine-version";
import { NO_DRAW_VERDICT } from "../../scripts/opening-budget-activation-report-core";
import {
  CAREER_COLUMNS,
  OPENING_BUDGET_SNAPSHOT_SCHEMA_VERSION,
  SEASON_COLUMNS,
  buildSnapshot,
  readSnapshotCareer,
  serialiseSnapshot,
  validateSnapshot,
} from "../../scripts/opening-budget-rng-snapshot";
import { CAREER_HEADER, SEASON_HEADER, careerRow, seasonRow } from "./opening-budget-dump-fixtures";

/**
 * The snapshot is the left-hand side of the RNG gate, so it is worth nothing
 * if it can be built from a run that is not the pinned one. Most of what is
 * tested here is therefore a refusal.
 */

// buildSnapshot's `clubs` feeds `DumpExpectation.clubs`, which is matched
// against a club id resolved from the dump's own `clubShortName` - never
// the display name itself. The fixtures below write `clubShortName: "Legia"`
// (opening-budget-dump-fixtures.ts), so the expected matrix has to carry
// its id, the same pattern as opening-budget-activation-report.test.ts.
const LEGIA_ID = clubIdForShortName("Legia");
const LECH_ID = clubIdForShortName("Lech");

const input = (overrides: Partial<Parameters<typeof buildSnapshot>[0]> = {}) => ({
  rawCsv: [CAREER_HEADER, careerRow()].join("\n"),
  seasonsCsv: [SEASON_HEADER, seasonRow({ season: 1 }), seasonRow({ season: 2 })].join("\n"),
  rawPath: "tmp/raw.csv",
  seasonsPath: "tmp/seasons.csv",
  rawSha256: "a".repeat(64),
  seasonsSha256: "b".repeat(64),
  baseSha: "0".repeat(40),
  toolSha: "1".repeat(40),
  seed: "0x5eed0001",
  clubs: [LEGIA_ID],
  runsPerCell: 1,
  ...overrides,
});

describe("buildSnapshot", () => {
  it("records the career and its seasons", () => {
    const snapshot = buildSnapshot(input());
    expect(snapshot.schemaVersion).toBe(OPENING_BUDGET_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.careerCount).toBe(1);
    expect(snapshot.careerColumns).toEqual([...CAREER_COLUMNS]);
    expect(snapshot.seasonColumns).toEqual([...SEASON_COLUMNS]);
    const career = readSnapshotCareer(snapshot, "Legia", 7);
    expect(career?.pktA).toBe(255);
    expect(career?.trofea).toBe(3);
    expect(career?.sezonyLM).toBe(1);
    expect(career?.handoverSeason).toBe(5);
    expect(career?.werdykt).toBe("KLUB Z CZOŁÓWKI");
    expect(career?.verdictDraws).toBe(1);
    expect(career?.rngDrawCount).toBe(12461);
    expect(career?.seasons).toHaveLength(2);
    expect(career?.seasons[0]!.season).toBe(1);
  });

  it("keeps the two commit identifiers apart", () => {
    const snapshot = buildSnapshot(input());
    expect(snapshot.baseSha).toBe("0".repeat(40));
    expect(snapshot.toolSha).toBe("1".repeat(40));
    expect(snapshot.baseSha).not.toBe(snapshot.toolSha);
  });

  it("takes the engine version from the dump, not from the constant", () => {
    // The dumps are produced BEFORE the activation, so their engine version
    // is the old one on purpose. Writing ENGINE_REVISION here would label the
    // preactivation evidence with the revision that replaced it - which is
    // why this row carries a version the current tree no longer ships.
    const preactivation = buildSnapshot(
      input({
        seasonsCsv: [
          SEASON_HEADER,
          seasonRow({ season: 1, engineVersion: "2026-09-10.1" }),
          seasonRow({ season: 2, engineVersion: "2026-09-10.1" }),
        ].join("\n"),
      })
    );
    expect(preactivation.run.engineVersion).toBe("2026-09-10.1");
    expect(preactivation.run.engineVersion).not.toBe(ENGINE_REVISION);
  });

  it("refuses a career whose season count disagrees with its own dump", () => {
    expect(() =>
      buildSnapshot(
        input({ rawCsv: [CAREER_HEADER, careerRow({ sezonyRozegrane: 5 })].join("\n") })
      )
    ).toThrow(/2 season rows against sezonyRozegrane 5/);
  });

  it("refuses a career with no seasons at all", () => {
    expect(() =>
      buildSnapshot(
        input({
          rawCsv: [CAREER_HEADER, careerRow({ seed: 9, sezonyRozegrane: 2 })].join("\n"),
          clubs: [LEGIA_ID],
        })
      )
    ).toThrow(/has 1 seeds, expected 1|no rows for|has no seasons/);
  });

  it("refuses a policy that signs and an uncontrolled economy", () => {
    expect(() =>
      buildSnapshot(input({ rawCsv: [CAREER_HEADER, careerRow({ polityka: "mixed" })].join("\n") }))
    ).toThrow(/policy "mixed"/);
    expect(() =>
      buildSnapshot(
        input({ rawCsv: [CAREER_HEADER, careerRow({ incomeMode: "normal" })].join("\n") })
      )
    ).toThrow(/incomeMode/);
  });

  it("refuses a short matrix", () => {
    expect(() => buildSnapshot(input({ runsPerCell: 2 }))).toThrow(/expected 2/);
    expect(() => buildSnapshot(input({ clubs: [LEGIA_ID, LECH_ID] }))).toThrow(
      new RegExp(`no rows for ${LECH_ID}`)
    );
  });

  it("indexes the no-draw verdict when one occurs", () => {
    const snapshot = buildSnapshot(
      input({ rawCsv: [CAREER_HEADER, careerRow({ werdykt: NO_DRAW_VERDICT })].join("\n") })
    );
    expect(snapshot.verdicts).toContain(NO_DRAW_VERDICT);
    expect(readSnapshotCareer(snapshot, "Legia", 7)?.verdictDraws).toBe(0);
  });
});

describe("serialiseSnapshot", () => {
  it("round-trips through JSON with one line per career", () => {
    const snapshot = buildSnapshot(
      input({ rawCsv: [CAREER_HEADER, careerRow({ werdykt: NO_DRAW_VERDICT })].join("\n") })
    );
    const text = serialiseSnapshot(snapshot);
    expect(JSON.parse(text)).toEqual(snapshot);
    const careerLines = text.split("\n").filter((row) => row.trim().startsWith('"7":'));
    expect(careerLines).toHaveLength(1);
  });
});

describe("validateSnapshot", () => {
  const good = () =>
    JSON.parse(
      serialiseSnapshot(
        buildSnapshot(
          input({ rawCsv: [CAREER_HEADER, careerRow({ werdykt: NO_DRAW_VERDICT })].join("\n") })
        )
      )
    ) as Record<string, unknown>;

  it("accepts a snapshot it wrote itself", () => {
    expect(() => validateSnapshot(good())).not.toThrow();
  });

  it("refuses another schema, another economy and a missing draw class", () => {
    expect(() => validateSnapshot({ ...good(), schemaVersion: 99 })).toThrow(/schema 99/);
    expect(() =>
      validateSnapshot({ ...good(), run: { ...(good().run as object), incomeMode: "normal" } })
    ).toThrow(/is not controlled/);
    expect(() => validateSnapshot({ ...good(), verdicts: ["KLUB Z CZOŁÓWKI"] })).toThrow(
      /draw class is unusable/
    );
    expect(() => validateSnapshot({ ...good(), careerCount: 0 })).toThrow(/no careers/);
  });
});
