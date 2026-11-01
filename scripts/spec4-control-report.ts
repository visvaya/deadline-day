import { writeFileSync } from "node:fs";

import { parseFlags } from "./cli-args";
import {
  affordableStrengtheningShare,
  financialPressure,
  firstWindowGate,
  starDilemma,
} from "./spec4-control-dilemmas-core";
import {
  freeAgentWageCost,
  rawResultVsBudget,
  titlesByAdvantageQuartile,
} from "./spec4-control-finance-core";
import {
  parseDilemmaDump,
  parseRawDump,
  parseSeasonsDump,
  parseSigningsDump,
  validateInputs,
} from "./spec4-control-inputs";
import { renderReport, type Report } from "./spec4-control-render";

/**
 * The spec 4 control measurement report's CLI: reads the four dumps a
 * `pnpm balance` (career, dilemmas, signings) plus `--finance-control`
 * (seasons) pair of runs produced, via spec4-control-inputs.ts, and writes
 * down the seven-section diagnostic the plan's Task 5 asks for. Simulates
 * nothing - every figure comes from a file that was kept.
 *
 * Exit code 0 means the measurement ran, even when a section's own gate is
 * not met; exit code 1 means an input could not be read or did not have the
 * shape this report requires.
 */

const REPORT_SCHEMA_VERSION = 1;

const KNOWN_FLAGS = [
  "--raw",
  "--dilemmas",
  "--signings",
  "--control-seasons",
  "--md",
  "--json",
  "--smoke",
  "--help",
];
const VALUELESS_FLAGS = ["--smoke", "--help"];

const HELP = `pnpm audit:spec4-control --raw <csv> --dilemmas <csv> --signings <csv> --control-seasons <csv>

Raport pomiaru kontrolnego speka 4: siedem sekcji zbudowanych wyłącznie z
zapisanych dumpów "pnpm balance" (kariery, dylematy, podpisania) oraz
"pnpm balance --finance-control" (sezony). Niczego nie symuluje.

  --raw <csv>              dump karier (schema 5)
  --dilemmas <csv>         dump dylematów (dilemmaSchemaVersion 1)
  --signings <csv>         dump podpisań
  --control-seasons <csv>  dump sezonów przebiegu --finance-control
  --md <plik>              zapisuje raport markdown
  --json <plik>            zapisuje surowe wyniki jako JSON
  --smoke                  dopuszcza mniejszy, ale nadal kompletny prostokąt
                            klub x polityka x seed; oznacza measurementMode: smoke
  --help                   ten tekst`;

type Cli = {
  raw: string;
  dilemmas: string;
  signings: string;
  controlSeasons: string;
  md: string | null;
  json: string | null;
  smoke: boolean;
};

const parseCli = (argv: readonly string[]): Cli => {
  const flags = parseFlags([...argv], KNOWN_FLAGS, VALUELESS_FLAGS);
  const requiredFlag = (flag: string): string => {
    const value = flags.get(flag);
    if (!value) throw new Error(`${flag} <csv> is required`);
    return value;
  };
  const help = flags.has("--help");
  return {
    raw: help ? "" : requiredFlag("--raw"),
    dilemmas: help ? "" : requiredFlag("--dilemmas"),
    signings: help ? "" : requiredFlag("--signings"),
    controlSeasons: help ? "" : requiredFlag("--control-seasons"),
    md: flags.get("--md") ?? null,
    json: flags.get("--json") ?? null,
    smoke: flags.has("--smoke"),
  };
};

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

const main = (argv: readonly string[]): number => {
  if (argv.includes("--help")) {
    console.log(HELP);
    return 0;
  }
  const cli = parseCli(argv);

  const raw = parseRawDump(cli.raw);
  const dilemmas = parseDilemmaDump(cli.dilemmas);
  const signings = parseSigningsDump(cli.signings);
  const seasons = parseSeasonsDump(cli.controlSeasons);

  validateInputs(raw, dilemmas, signings, seasons, cli.smoke);

  const report: Report = {
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    measurementMode: cli.smoke ? "smoke" : "full",
    firstWindow: firstWindowGate(dilemmas),
    affordableShare: affordableStrengtheningShare(dilemmas),
    pressure: financialPressure(dilemmas),
    stars: starDilemma(raw, dilemmas),
    freeAgents: freeAgentWageCost(signings),
    reinvestment: rawResultVsBudget(seasons),
    quartiles: titlesByAdvantageQuartile(raw),
  };

  const markdown = renderReport(report);
  process.stdout.write(`${markdown}\n`);

  if (cli.md) {
    writeFileSync(cli.md, `${markdown}\n`, "utf8");
    process.stdout.write(`\nZapisano raport: ${cli.md}\n`);
  }
  if (cli.json) {
    writeFileSync(cli.json, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`\nZapisano JSON: ${cli.json}\n`);
  }

  return 0;
};

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
