import { readFileSync, writeFileSync } from "node:fs";

import { compareRuns, renderComparison } from "./balance-compare-core";
import { parseFlags } from "./cli-args";

/**
 * CLI over balance-compare-core: takes two `pnpm balance --dump-raw` dumps
 * that went through the SAME seeds and prints the paired difference per
 * `klub x polityka` cell. Compare the two `--md` summaries instead and the
 * difference is unpaired - which is exactly the mistake this tool removes.
 */

type Cli = { before: string; after: string; md: string | null };

const KNOWN_FLAGS = ["--before", "--after", "--md"];

const parseCompareCli = (argv: string[]): Cli => {
  const flags = parseFlags(argv, KNOWN_FLAGS);
  const cli: Cli = {
    before: flags.get("--before") ?? "",
    after: flags.get("--after") ?? "",
    md: flags.get("--md") ?? null,
  };
  if (!cli.before) throw new Error("--before <csv> is required");
  if (!cli.after) throw new Error("--after <csv> is required");
  return cli;
};

const main = (): void => {
  const cli = parseCompareCli(process.argv.slice(2));
  const cells = compareRuns(readFileSync(cli.before, "utf8"), readFileSync(cli.after, "utf8"));
  const ascii = renderComparison(cells, "ascii");
  process.stdout.write(`${ascii}\n`);
  if (cli.md) {
    writeFileSync(cli.md, `${renderComparison(cells, "markdown")}\n`, "utf8");
    process.stdout.write(`\nZapisano raport: ${cli.md}\n`);
  }
};

main();
