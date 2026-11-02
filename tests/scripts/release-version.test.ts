import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";
import { CHANGELOG, CURRENT_VERSION } from "../../src/data/changelog";
import {
  bumpOfTitle,
  nextReleaseVersion,
  releaseNotes,
  releaseTagProblems,
  shipsTheGame,
  toChangelogVersion,
  toReleaseVersion,
  versionProblems,
} from "../../scripts/release-version";

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

  test("reads a fix release with its third number", () => {
    expect(toReleaseVersion("0.35.1")).toBe("0.35.1");
    expect(toReleaseVersion("0.35.12")).toBe("0.35.12");
  });

  test("rejects anything else, a written-out .0 included, so each version has one spelling", () => {
    expect(() => toReleaseVersion("0.35.0")).toThrow();
    expect(() => toReleaseVersion("0.35.01")).toThrow();
    expect(() => toReleaseVersion("v0.34")).toThrow();
    expect(() => toReleaseVersion("0.345")).toThrow();
  });
});

describe("toChangelogVersion", () => {
  test("is the other way round", () => {
    expect(toChangelogVersion("0.36.0")).toBe("0.36");
    expect(toChangelogVersion("0.35.2")).toBe("0.35.2");
    expect(toChangelogVersion("1.5.0")).toBe("1.05");
    ["0.34", "0.35.1"].forEach((version) =>
      expect(toChangelogVersion(toReleaseVersion(version))).toBe(version)
    );
  });

  test("rejects what is not a version", () => {
    expect(() => toChangelogVersion("0.36")).toThrow();
  });
});

describe("the step a pull request title asks for", () => {
  test("a new feature moves the middle number, anything else the last one", () => {
    expect(bumpOfTitle("feat(pwa): make the game installable")).toBe("minor");
    expect(bumpOfTitle("fix(ui): keep buttons clear of the home indicator")).toBe("patch");
    expect(bumpOfTitle("perf: draw the squad once")).toBe("patch");
  });

  test("a breaking change moves the first number, and before 1.0 the middle one", () => {
    expect(bumpOfTitle("feat(save)!: drop the old save format")).toBe("major");
    expect(nextReleaseVersion("0.35.1", "major")).toBe("0.36.0");
    expect(nextReleaseVersion("1.2.3", "major")).toBe("2.0.0");
  });

  test("the next version after each step", () => {
    expect(nextReleaseVersion("0.35.0", "minor")).toBe("0.36.0");
    expect(nextReleaseVersion("0.35.2", "minor")).toBe("0.36.0");
    expect(nextReleaseVersion("0.35.0", "patch")).toBe("0.35.1");
  });

  test("refuses a title that is not a Conventional Commit", () => {
    expect(() => bumpOfTitle("Make the game installable")).toThrow();
  });
});

describe("what ships", () => {
  test("the game's source, its static files and its build", () => {
    [
      "src/ui/app.tsx",
      "public/_headers",
      "scripts/service-worker-template.js",
      "pnpm-lock.yaml",
    ].forEach((path) => expect(shipsTheGame([path]), path).toBe(true));
  });

  test("not tests, notes, CI, the balance tooling or package.json on its own", () => {
    expect(
      shipsTheGame([
        "tests/ui/app.test.tsx",
        "docs/decisions/x.md",
        ".github/workflows/ci.yml",
        "scripts/balance.ts",
        "package.json",
      ])
    ).toBe(false);
  });
});

describe("versionProblems", () => {
  const base = { name: "deadline-day", version: "0.35.0" };
  const at = (version: string) => ({ ...base, version });

  test("a change to the game moves the version by the title's step", () => {
    const pr = { title: "fix(ui): even spacing", changedPaths: ["src/ui/styles.css"] };
    expect(versionProblems({ ...pr, basePackage: base, headPackage: at("0.35.1") })).toEqual([]);
    expect(versionProblems({ ...pr, basePackage: base, headPackage: base })).toEqual([
      expect.stringContaining("0.35.1"),
    ]);
    expect(
      versionProblems({
        ...pr,
        title: "feat(ui): a new screen",
        basePackage: base,
        headPackage: at("0.35.1"),
      })
    ).toEqual([expect.stringContaining("0.36.0")]);
  });

  test("a change that ships nothing keeps the version", () => {
    const pr = { title: "docs: explain the gate", changedPaths: ["docs/decisions/commands.md"] };
    expect(versionProblems({ ...pr, basePackage: base, headPackage: base })).toEqual([]);
    expect(versionProblems({ ...pr, basePackage: base, headPackage: at("0.35.1") })).toEqual([
      expect.stringContaining("0.35.0"),
    ]);
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

  // `pnpm version:bump` adds an entry with no notes; this is what makes somebody write them.
  test("every entry tells the player at least one thing", () => {
    CHANGELOG.forEach((entry) => expect(entry.notes.length, entry.version).toBeGreaterThan(0));
  });

  test("entries run newest first: versions strictly decrease, dates never increase", () => {
    const order = (version: string): number[] => toReleaseVersion(version).split(".").map(Number);
    const isNewer = (a: string, b: string): boolean => {
      const [aMajor = 0, aMinor = 0, aPatch = 0] = order(a);
      const [bMajor = 0, bMinor = 0, bPatch = 0] = order(b);
      if (aMajor !== bMajor) return aMajor > bMajor;
      return aMinor !== bMinor ? aMinor > bMinor : aPatch > bPatch;
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
      CHANGELOG.find((entry) => entry.version === "0.34")?.notes.length ?? -1
    );
  });

  test("fails loudly for a version with no entry", () => {
    expect(() => releaseNotes("0.99", CHANGELOG)).toThrow();
  });
});
