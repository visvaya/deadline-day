import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { testTempRoot } from "../temp-dir";
import { AGE_PROFILE_DEFAULT, AGE_PROFILES } from "../../src/data/balance";

const CLI = "scripts/value-curve-fit.ts";

const run = (args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], { encoding: "utf8" });

const withTempDir = (body: (_dir: string) => void): void => {
  const dir = mkdtempSync(join(testTempRoot(), "value-curve-fit-"));
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("--help exits clean without fitting or writing", () => {
  const result = run(["--help"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("pnpm fit:value-curve");
  expect(result.stdout).not.toContain("Dopasowanie krzywej wartości");
}, 30_000);

test("an unknown flag fails instead of running the fit", () => {
  const result = run(["--nope"]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Unknown flag");
}, 30_000);

test("--md without a value fails", () => {
  const result = run(["--md"]);
  expect(result.status).not.toBe(0);
}, 30_000);

test("--md followed by another flag fails and writes nothing", () => {
  const result = run(["--md", "--help"]);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("--md requires a non-empty output path");
}, 30_000);

test("the report records age inputs and each qualified tier's price interval", () => {
  const result = run([]);
  expect(result.status).toBe(0);
  const blocks = [...result.stdout.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) =>
    JSON.parse(match[1]!)
  );
  expect(blocks[0].ageModel).toEqual({
    defaultProfile: AGE_PROFILE_DEFAULT,
    positionProfiles: AGE_PROFILES,
    ratioReferenceOvr: 70,
    ratioReferenceAge: 24,
    ratioBands: [
      { label: "19/peakStart", ageForDefaultProfile: 19, min: 1.9, max: 2.3 },
      { label: "peakEnd/peakStart", ageForDefaultProfile: 29, min: 0.55, max: 0.7 },
      { label: "peakEnd+3", ageForDefaultProfile: 32, min: 0.28, max: 0.4 },
      { label: "peakEnd+6", ageForDefaultProfile: 35, min: 0.12, max: 0.2 },
    ],
  });
  expect(blocks[0].constraintThresholds.minMarketValue).toBe(0.05);
  expect(blocks[1].upperAnchorSpreads).toHaveLength(2);
  expect(blocks[1].upperAnchorSpreads[0].spread.tiers).toEqual([
    { name: "very-high", low: expect.any(Number), high: 7.5 },
    { name: "legendary", low: expect.any(Number), high: expect.any(Number) },
  ]);
}, 120_000);

test("two runs write byte-identical reports and keep the inactive notice", () => {
  withTempDir((dir) => {
    const first = join(dir, "first.md");
    const second = join(dir, "second.md");
    expect(run(["--md", first]).status).toBe(0);
    expect(run(["--md", second]).status).toBe(0);
    const a = readFileSync(first);
    const b = readFileSync(second);
    expect(a.equals(b)).toBe(true);
    expect(a.toString("utf8")).toContain("Parametry nie są aktywne");
  });
}, 120_000);

test("the pinned report matches what the tool produces today", () => {
  withTempDir((dir) => {
    const fresh = join(dir, "fresh.md");
    expect(run(["--md", fresh]).status).toBe(0);
    const pinned = readFileSync("docs/decisions/value-curve-fit-2026-09-07.md");
    expect(readFileSync(fresh).equals(pinned)).toBe(true);
  });
}, 120_000);
