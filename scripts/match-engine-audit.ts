import { writeFileSync } from "node:fs";

import { parseAuditCli, runMatchEngineAudit } from "./match-engine-audit-core";
import { renderMatchEngineAudit } from "./match-engine-audit-report";

const HELP = `Usage:
  pnpm audit:match-engine [--runs N] [--batches N] [--seed 0xHEX] [--md FILE] [--outcome-experiments]

Defaults:
  --runs 20000       full seasons per reported scenario
  --batches 3        deterministic seed batches inside the total sample
  --seed 0x1ea6e001 independent from pnpm balance
  --outcome-experiments optional paired match-outcome model matrix

Examples:
  pnpm audit:match-engine --runs 1000
  pnpm audit:match-engine --runs 20000 --outcome-experiments
  pnpm audit:match-engine --runs 20000 --md match-engine-baseline.md

The command never changes balance constants or golden-master files.`;

const main = (): void => {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  const cli = parseAuditCli(argv);
  const startedAt = performance.now();
  const audit = runMatchEngineAudit(cli);
  const durationSeconds = (performance.now() - startedAt) / 1_000;
  const report = `${renderMatchEngineAudit(audit)}\n\nCzas obliczeń: ${durationSeconds.toFixed(1)} s\n`;
  console.log(report);
  if (cli.md) {
    writeFileSync(cli.md, report, "utf8");
    console.log(`Raport markdown zapisany do ${cli.md}`);
  }
};

main();
