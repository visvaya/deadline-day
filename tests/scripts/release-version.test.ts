import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";
import { CHANGELOG, CURRENT_VERSION } from "../../src/data/changelog";
import { releaseNotes, releaseTagProblems, toReleaseVersion } from "../../scripts/release-version";

const packageVersion = (): string =>
  (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;

describe("toReleaseVersion", () => {
  test("reads a two-digit minor as it is", () => {
    expect(toReleaseVersion("0.34")).toBe("0.34.0");
    expect(toReleaseVersion("0.11")).toBe("0.11.0");
  });

  test("rejects a one-digit minor, which would sort 0.3 before 0.29", () => {
    expect(() => toReleaseVersion("0.3")).toThrow();
    expect(() => toReleaseVersion("0.4")).toThrow();
  });

  test("rejects anything that is not major.minor", () => {
    expect(() => toReleaseVersion("0.34.1")).toThrow();
    expect(() => toReleaseVersion("v0.34")).toThrow();
    expect(() => toReleaseVersion("0.345")).toThrow();
  });
});

describe("changelog and package.json agree", () => {
  test("CURRENT_VERSION is the newest changelog entry", () => {
    expect(CHANGELOG[0]?.version).toBe(CURRENT_VERSION);
  });

  test("package.json carries the release form of CURRENT_VERSION", () => {
    expect(packageVersion()).toBe(toReleaseVersion(CURRENT_VERSION));
  });

  test("every entry has a version the release mapping accepts", () => {
    CHANGELOG.forEach((entry) => expect(() => toReleaseVersion(entry.version)).not.toThrow());
  });

  test("entries run newest first: versions strictly decrease, dates never increase", () => {
    const order = (version: string): number[] => toReleaseVersion(version).split(".").map(Number);
    const isNewer = (a: string, b: string): boolean => {
      const [aMajor = 0, aMinor = 0] = order(a);
      const [bMajor = 0, bMinor = 0] = order(b);
      return aMajor > bMajor || (aMajor === bMajor && aMinor > bMinor);
    };
    CHANGELOG.slice(1).forEach((older, index) => {
      const newer = CHANGELOG[index];
      expect(newer && isNewer(newer.version, older.version)).toBe(true);
      expect(newer && newer.date >= older.date).toBe(true);
    });
  });
});

describe("releaseTagProblems", () => {
  test("accepts the tag that matches both sources", () => {
    expect(
      releaseTagProblems("v0.34.0", { packageVersion: "0.34.0", currentVersion: "0.34" })
    ).toEqual([]);
  });

  test("names every source the tag disagrees with", () => {
    expect(
      releaseTagProblems("v0.35.0", { packageVersion: "0.34.0", currentVersion: "0.34" })
    ).toEqual([
      expect.stringContaining("package.json"),
      expect.stringContaining("CURRENT_VERSION"),
    ]);
  });
});

describe("releaseNotes", () => {
  test("renders the changelog entry of the tagged version", () => {
    const notes = releaseNotes("0.34", CHANGELOG);
    expect(notes).toContain("2026-09-23");
    expect(notes.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(
      CHANGELOG[0]?.notes.length ?? -1
    );
  });

  test("fails loudly for a version with no entry", () => {
    expect(() => releaseNotes("0.99", CHANGELOG)).toThrow();
  });
});
