import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { ENGINE_REVISION } from "../src/logic/engine-version";
import { ACTIVE_CLUBS } from "./balance-cli";
import { parseFlags } from "./cli-args";
import {
  checkDump,
  checkSignings,
  parseBaselineDump,
  parseSignings,
  renderSummary,
  summarise,
} from "./finance-baseline-core";
import type { ArtefactFact } from "./finance-baseline-core";

/**
 * Turns the saved artefacts of a finance baseline into the note that goes
 * into docs/decisions. Reads files, checks them, prints a summary - and
 * simulates nothing, so no number in the note can come from anywhere but a
 * file that is kept.
 */

const KNOWN_FLAGS = ["--control", "--active", "--signings", "--output", "--help"];
const VALUELESS_FLAGS = ["--help"];

const CONTROL_POLICIES = ["alwaysPass"];
const ACTIVE_POLICIES = [
  "youngOnly",
  "primeOnly",
  "veteranOnly",
  "youngOnlyBuy",
  "primeOnlyBuy",
  "veteranOnlyBuy",
  "youngBuySellAlways",
  "alwaysTake",
  "alwaysHaggle",
  "stallThenTake",
  "depthFirst",
  "analystEdgeBuy",
  "mixed",
];

const HELP = `pnpm exec tsx scripts/finance-baseline.ts --control <csv> --active <csv> --signings <csv> --output <md>

Sprawdza komplet artefaktow baseline'u finansowego i zapisuje notatke.
Niczego nie symuluje ponownie.`;

const factsFor = (path: string): ArtefactFact => {
  const bytes = statSync(path).size;
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  return { path, bytes, sha256 };
};

const commitHash = (): string => {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    // A note that cannot name the code it measured is still worth writing;
    // it just has to say that it could not.
    return "unknown";
  }
};

const main = (): void => {
  const flags = parseFlags(process.argv.slice(2), KNOWN_FLAGS, VALUELESS_FLAGS);
  if (flags.has("--help")) {
    console.log(HELP);
    return;
  }
  for (const flag of ["--control", "--active", "--signings", "--output"]) {
    if (!flags.has(flag)) throw new Error(`${flag} is required`);
  }
  const controlPath = flags.get("--control")!;
  const activePath = flags.get("--active")!;
  const signingsPath = flags.get("--signings")!;
  const outputPath = flags.get("--output")!;

  const control = parseBaselineDump(readFileSync(controlPath, "utf8"));
  const active = parseBaselineDump(readFileSync(activePath, "utf8"));
  const signings = parseSignings(readFileSync(signingsPath, "utf8"));

  const problems = [
    ...checkDump(control.rows, {
      clubs: ACTIVE_CLUBS,
      policies: CONTROL_POLICIES,
      incomeMode: "finance-control",
    }).map((p) => `control: ${p}`),
    ...checkDump(active.rows, {
      clubs: ACTIVE_CLUBS,
      policies: ACTIVE_POLICIES,
      incomeMode: "normal",
    }).map((p) => `active: ${p}`),
    ...checkSignings(active.rows, signings).map((p) => `signings: ${p}`),
  ];

  if (problems.length > 0) {
    // Refuses rather than writing a note with a hole in it: a baseline that
    // is missing careers is not a smaller baseline, it is an unusable one.
    console.error(`Baseline is incomplete (${problems.length} problem(s)):`);
    for (const problem of problems.slice(0, 40)) console.error(`  - ${problem}`);
    if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
    process.exitCode = 1;
    return;
  }

  const summary = summarise(control.rows, active.rows, signings);
  const seeds = [...new Set(active.rows.map((r) => r.seed))].length;
  const note = renderSummary(summary, {
    commit: commitHash(),
    engineRevision: ENGINE_REVISION,
    dumpSchemaVersion: "2",
    seedBase: "0x5eed0001",
    runs: String(seeds),
    clubs: ACTIVE_CLUBS,
    controlPolicies: CONTROL_POLICIES,
    activePolicies: ACTIVE_POLICIES,
    artefacts: [controlPath, activePath, signingsPath].map(factsFor),
  });
  writeFileSync(outputPath, note, "utf8");
  console.log(`Notatka zapisana do ${outputPath}`);
};

main();
