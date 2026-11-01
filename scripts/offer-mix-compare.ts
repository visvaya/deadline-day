import { readFileSync, writeFileSync } from "node:fs";

import { compareOfferMix, renderOfferMix } from "./offer-mix-compare-core";
import { parseFlags } from "./cli-args";

/**
 * CLI over offer-mix-compare-core: takes two `pnpm balance --dump-raw` dumps
 * that went through the SAME seeds and reports how the mix of card types the
 * game actually showed shifted between them. Built for the offer filter,
 * which drops a signing nobody could keep and rolls a whole fresh card - a
 * change that can only be judged against what the player used to see.
 */

type Cli = { before: string; after: string; md: string | null };

const KNOWN_FLAGS = ["--before", "--after", "--md"];

const parseOfferMixCli = (argv: string[]): Cli => {
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
  const cli = parseOfferMixCli(process.argv.slice(2));
  const cells = compareOfferMix(readFileSync(cli.before, "utf8"), readFileSync(cli.after, "utf8"));
  const report = renderOfferMix(cells);
  process.stdout.write(`${report}\n`);
  if (cli.md) {
    writeFileSync(cli.md, `${report}\n`, "utf8");
    process.stdout.write(`\nZapisano raport: ${cli.md}\n`);
  }
};

main();
