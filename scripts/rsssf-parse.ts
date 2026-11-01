import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseFlags } from "./cli-args";
import { formatCsvRow } from "./csv";
import { EKSTRAKLASA_RETRIEVED, EKSTRAKLASA_SOURCES } from "./data/ekstraklasa-sources";
import {
  extractLeagueSection,
  parseLeagueSection,
  verifySeasonAgainstTable,
} from "./rsssf-parse-core";
import { at } from "../src/logic/invariant";

/**
 * Turns local RSSSF season pages into scripts/data/ekstraklasa-results.csv.
 *
 * It downloads nothing. The pages are somebody else's and change without
 * notice, so a run that silently refetched them could move an aggregate the
 * match engine is calibrated against without a single line of the repository
 * changing. Missing files are reported with the address to fetch them from,
 * and the run stops.
 *
 * Every season is checked against the table published in its own page before
 * anything is written - see verifySeasonAgainstTable. A CSV that reached the
 * repository unverified would be the very thing this tool exists to prevent.
 */

type Cli = { in: string; out: string };

const KNOWN_FLAGS = ["--in", "--out"];

const parseParseCli = (argv: string[]): Cli => {
  const flags = parseFlags(argv, KNOWN_FLAGS);
  const cli: Cli = { in: flags.get("--in") ?? "", out: flags.get("--out") ?? "" };
  if (!cli.in) throw new Error("--in <dir> is required (a directory holding polYYYY.html)");
  if (!cli.out) throw new Error("--out <csv> is required");
  return cli;
};

const main = (): void => {
  const cli = parseParseCli(process.argv.slice(2));

  const missing = EKSTRAKLASA_SOURCES.filter((s) => !existsSync(join(cli.in, s.file)));
  if (missing.length > 0) {
    const list = missing.map((s) => `  ${s.season}  ${s.file}  ${s.url}`).join("\n");
    throw new Error(
      `${missing.length} of ${EKSTRAKLASA_SOURCES.length} season pages are missing from ${cli.in}.\n` +
        `Download them yourself - this tool never fetches:\n${list}`
    );
  }

  const rows: string[] = ["season,round,home,away,homeGoals,awayGoals"];
  let total = 0;
  for (const source of EKSTRAKLASA_SOURCES) {
    const parsed = parseLeagueSection(
      extractLeagueSection(readFileSync(join(cli.in, source.file)))
    );
    const resolved = verifySeasonAgainstTable(parsed);
    for (const match of parsed.matches) {
      rows.push(
        formatCsvRow([
          source.season,
          String(match.round),
          // The canonical full name from the table, not the abbreviation the
          // match list prints: "Zagłębie Lubin", never "Zagłębie L".
          resolved.get(match.home)!,
          resolved.get(match.away)!,
          String(match.homeGoals),
          String(match.awayGoals),
        ])
      );
    }
    total += parsed.matches.length;
    const rounds = Math.max(...parsed.matches.map((match) => match.round));
    process.stdout.write(
      `${source.season}: ${parsed.matches.length} meczów, ${parsed.table.length} klubów, ` +
        `${rounds} kolejek, po ${at(parsed.table, 0, "first table row").played} występów\n`
    );
  }

  writeFileSync(cli.out, `${rows.join("\n")}\n`, "utf8");
  process.stdout.write(
    `\nRazem ${total} meczów w ${EKSTRAKLASA_SOURCES.length} sezonach ` +
      `(strony pobrane ${EKSTRAKLASA_RETRIEVED}).\nZapisano: ${cli.out}\n`
  );
};

main();
