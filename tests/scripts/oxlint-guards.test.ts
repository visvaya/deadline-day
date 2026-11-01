import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import config from "../../oxlint.config";
import { makeTestTempDir } from "../temp-dir";

/**
 * The repository's own lint guards, run through the real oxlint binary.
 *
 * Several of them are the reason this project lints at all: no Math.random
 * outside the seeded RNG, no React or UI import in the engine, src/data as a
 * leaf, no import cycles, no em dash in player text, no classes, no DOM XSS
 * sinks. Some run through a local JS plugin (scripts/oxlint-plugin-deadline-
 * day.mjs) on an API oxlint still calls alpha. A tool upgrade that stopped
 * reporting any of them would look exactly like a clean lint, so each guard
 * gets a fixture that must trip it, and one allowed shape that must not.
 */

const EM_DASH = String.fromCodePoint(0x2014);
const repoRoot = process.cwd();
const oxlintBin = path.join(repoRoot, "node_modules", "oxlint", "bin", "oxlint");
const pluginPath = path.join(repoRoot, "scripts", "oxlint-plugin-deadline-day.mjs");

type Diagnostic = { code: string; filename: string; message: string };

const FIXTURES: Record<string, string> = {
  "src/ui/sinks.tsx": [
    "export const write = (el: HTMLElement, html: string) => {",
    "  el.innerHTML = html;",
    "  document.write(html);",
    "};",
    `export const label = "Kadra ${EM_DASH} rezerwa";`,
    "export class Tile {}",
    "export class SaveError extends Error {}",
    "export const roll = () => Math.random();",
    "export const Box = ({ go }: { go: () => void }) => <div onClick={go}>x</div>;",
    "",
  ].join("\n"),
  "src/logic/engine.ts": [
    'import { useState } from "react";',
    'import { label } from "../ui/sinks";',
    "export const both = [useState, label];",
    "export const roll = () => Math.random();",
    "export const width = () => window.innerWidth;",
    "",
  ].join("\n"),
  "src/data/leaf.ts": [
    'import { roll } from "../logic/engine";',
    "export const r = roll;",
    "",
  ].join("\n"),
  "src/logic/cycle-a.ts": [
    'import { b } from "./cycle-b";',
    "export const a = () => b();",
    "",
  ].join("\n"),
  "src/logic/cycle-b.ts": [
    'import { a } from "./cycle-a";',
    "export const b = () => a();",
    "",
  ].join("\n"),
  "tests/logic/helper-user.test.ts": [
    'import { walk } from "./walker.test";',
    'import { other } from "./walker";',
    "export const both = [walk, other];",
    "",
  ].join("\n"),
  "scripts/report.ts": [`export const heading = "Raport ${EM_DASH} sezon";`, ""].join("\n"),
};

const lintFixtures = (): Diagnostic[] => {
  const dir = makeTestTempDir("oxlint-guards");
  for (const [relative, source] of Object.entries(FIXTURES)) {
    const file = path.join(dir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  // The TypeScript config resolves its JS plugin relative to itself; a JSON
  // copy next to the fixtures points at the repository's plugin instead, so
  // the override globs (src/**, src/logic/**) match the fixture tree.
  const configFile = path.join(dir, ".oxlintrc.json");
  writeFileSync(configFile, JSON.stringify({ ...config, jsPlugins: [pluginPath] }));

  const result = spawnSync(process.execPath, [oxlintBin, "-c", configFile, "-f", "json", "."], {
    cwd: dir,
    encoding: "utf8",
    windowsHide: true,
  });
  expect(result.error).toBeUndefined();
  const parsed = JSON.parse(result.stdout) as { diagnostics: Diagnostic[] };
  return parsed.diagnostics.map((d) => ({ ...d, filename: d.filename.replaceAll("\\", "/") }));
};

const hits = (diagnostics: Diagnostic[], file: string, code: string): Diagnostic[] =>
  diagnostics.filter((d) => d.filename.endsWith(file) && d.code.includes(code));

describe("oxlint guards", () => {
  test("every repository guard reports on its fixture", { timeout: 60_000 }, () => {
    const diagnostics = lintFixtures();
    const restricted = (file: string) => hits(diagnostics, file, "restricted-syntax");

    expect(restricted("src/ui/sinks.tsx").map((d) => d.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("innerHTML"),
        expect.stringContaining("document.write"),
        expect.stringContaining("Em dash"),
        expect.stringContaining("Classes are allowed only"),
      ])
    );
    // Error subclasses are the allowed exception; only `Tile` is reported.
    expect(restricted("src/ui/sinks.tsx").filter((d) => d.message.includes("Classes")).length).toBe(
      1
    );
    // The em dash is house style in scripts/, which write Polish reports.
    expect(restricted("scripts/report.ts")).toEqual([]);

    expect(hits(diagnostics, "src/ui/sinks.tsx", "no-restricted-properties")).toHaveLength(1);
    expect(hits(diagnostics, "src/ui/sinks.tsx", "no-static-element-interactions")).toHaveLength(1);

    expect(hits(diagnostics, "src/logic/engine.ts", "no-restricted-imports")).toHaveLength(2);
    expect(hits(diagnostics, "src/logic/engine.ts", "no-restricted-properties")).toHaveLength(1);
    expect(hits(diagnostics, "src/logic/engine.ts", "no-restricted-globals")).toHaveLength(1);
    expect(hits(diagnostics, "src/data/leaf.ts", "no-restricted-imports")).toHaveLength(1);

    // Importing a test file reruns its tests; a plain helper module is fine.
    expect(
      hits(diagnostics, "tests/logic/helper-user.test.ts", "no-restricted-imports")
    ).toHaveLength(1);

    expect(hits(diagnostics, "src/logic/cycle-a.ts", "no-cycle")).toHaveLength(1);
    expect(hits(diagnostics, "src/logic/cycle-b.ts", "no-cycle")).toHaveLength(1);
  });
});
