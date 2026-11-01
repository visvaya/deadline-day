import { writeFileSync } from "node:fs";

import { parseEuropeanCupsCli } from "./european-cups-audit-cli";
import { VARIANTS, assertFormulaParity, runEuropeanCupsAudit } from "./european-cups-audit-core";
import { renderEuropeanCupsAudit } from "./european-cups-audit-report";

const HELP = `Usage:
  pnpm audit:european-cups [--runs N] [--seed 0xHEX] [--variant ID] [--strength-samples N] [--md FILE]

Defaults:
  --runs 20000              campaigns per grid cell (strength x starting cup)
  --seed 0x4e057c01         independent from pnpm balance and audit:match-engine
  --variant baseline        ${VARIANTS.map((v) => v.id).join(" | ")}
  --strength-samples 200    starting squads generated per club for the auxiliary table
  --careers 200             whole headless careers per club x policy cell (0 skips them)

Examples:
  pnpm audit:european-cups --runs 2000
  pnpm audit:european-cups --variant B --md european-cups-variant-b.md

Offline and read-only: nothing in src/, tests/ or the golden files is touched,
and EUROPEAN_ADVANCE_ODDS is read, never written. Variants live in
scripts/european-cups-audit-core.ts so a candidate set of constants can be
measured without editing balance.ts.`;

const main = (): void => {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  const cli = parseEuropeanCupsCli(argv);
  // Fails before any measurement if the engine's formula and the audit's twin
  // have drifted apart - a report from two different models is worse than no
  // report at all.
  assertFormulaParity();
  const startedAt = performance.now();
  const audit = runEuropeanCupsAudit(cli);
  const durationSeconds = (performance.now() - startedAt) / 1_000;
  const report = `${renderEuropeanCupsAudit(audit)}\n\nCzas obliczeń: ${durationSeconds.toFixed(1)} s\n`;
  console.log(report);
  if (cli.md) {
    writeFileSync(cli.md, report, "utf8");
    console.log(`Raport markdown zapisany do ${cli.md}`);
  }
  if (audit.checks.some((check) => !check.passed)) process.exitCode = 1;
};

main();
