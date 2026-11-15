import { describe, expect, test } from "vitest";

import type { ChangelogEntry } from "../../src/data/changelog";
import {
  groupChangelog,
  groupDateLabel,
  groupVersionLabel,
} from "../../src/logic/changelog-groups";

const TECH = "Drobne poprawki techniczne.";
const entry = (
  version: string,
  date: string,
  notes: readonly string[] = [TECH]
): ChangelogEntry => ({
  version,
  date,
  notes,
});

describe("groupChangelog", () => {
  test("a run of technical-only entries becomes one group, newest first", () => {
    const groups = groupChangelog(
      [
        entry("0.37.13", "2026-11-15"),
        entry("0.37.12", "2026-11-15"),
        entry("0.37.3", "2026-11-14"),
        entry("0.37.2", "2026-11-02", ["Pasek stanu w kolorze nagłówka."]),
        entry("0.37.1", "2026-11-02"),
      ],
      TECH
    );
    expect(groups).toEqual([
      {
        newest: "0.37.13",
        oldest: "0.37.3",
        newestDate: "2026-11-15",
        oldestDate: "2026-11-14",
        notes: [TECH],
      },
      {
        newest: "0.37.2",
        oldest: "0.37.2",
        newestDate: "2026-11-02",
        oldestDate: "2026-11-02",
        notes: ["Pasek stanu w kolorze nagłówka."],
      },
      {
        newest: "0.37.1",
        oldest: "0.37.1",
        newestDate: "2026-11-02",
        oldestDate: "2026-11-02",
        notes: [TECH],
      },
    ]);
  });

  test("an entry that mentions something besides the technical note is never merged", () => {
    const groups = groupChangelog(
      [entry("0.2", "2026-01-02", [TECH, "Nowy ekran."]), entry("0.1", "2026-01-01")],
      TECH
    );
    expect(groups).toHaveLength(2);
  });
});

describe("labels", () => {
  test("a single version and a single date stay as they are", () => {
    const group = groupChangelog([entry("0.37.2", "2026-11-02")], TECH)[0]!;
    expect(groupVersionLabel(group)).toBe("v0.37.2");
    expect(groupDateLabel(group)).toBe("2026-11-02");
  });

  test("a range reads oldest to newest, and a shared month is written once", () => {
    const group = groupChangelog(
      [entry("0.37.13", "2026-11-15"), entry("0.37.3", "2026-11-14")],
      TECH
    )[0]!;
    expect(groupVersionLabel(group)).toBe("v0.37.3–0.37.13");
    expect(groupDateLabel(group)).toBe("2026-11-14–15");
  });

  test("a range across months keeps both dates whole", () => {
    const group = groupChangelog(
      [entry("0.5", "2026-12-01"), entry("0.4", "2026-11-30")],
      TECH
    )[0]!;
    expect(groupDateLabel(group)).toBe("2026-11-30 – 2026-12-01");
  });
});
