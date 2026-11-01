import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseFlags } from "../cli-args";
import { UECL_ACCESSED_AT, UECL_SOURCES } from "../data/uecl-sources";
import {
  buildSeason,
  clubProfiles,
  clubsToCsv,
  toCsv,
  type CohortRow,
  type SeasonLedger,
} from "./dataset";

/**
 * Builds scripts/data/uecl-q2-cohort.csv from LOCAL copies of the pinned
 * pages. Downloads nothing, ever: a rebuild that could fetch would silently
 * follow a page edited after the revision in the manifest, and the pinned CSV
 * would stop meaning what its manifest says it means.
 *
 * Expects <dir>/qual-<season>.html and <dir>/main-<season>.html for every
 * season in UECL_SOURCES, and prints the exact URLs and revisions to fetch
 * when a file is missing.
 */

const HELP = `Usage:
  pnpm data:parse-uecl --in <directory> --out <csv> [--clubs <csv>]

Expects, for every season in scripts/data/uecl-sources.ts:
  <dir>/qual-<season>.html   the qualifying article
  <dir>/main-<season>.html   the competition article

--clubs writes a de-duplicated roster of the real clubs in the cohort, with
their UEFA club coefficients. That cohort is an access-list position, not a
class of club: it spans coefficients from 1.3 to 63.8 across 44 associations,
with a median of 6.5. Reference data for later work, and the coefficient is
NOT the game's strength scale.

Downloads nothing. Fetch the pinned revisions yourself, e.g.
  curl -o qual-2024-25.html "https://en.wikipedia.org/w/index.php?oldid=1333497489"

Run this only when the data is deliberately changing, never routinely: the
CSV it writes is the pinned source of truth for pnpm audit:uecl.`;

const main = (): void => {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  const flags = parseFlags(argv, ["--in", "--out", "--clubs", "--help"], ["--help"]);
  const dir = flags.get("--in");
  const out = flags.get("--out");
  if (!dir) throw new Error("--in <directory> is required");
  if (!out) throw new Error("--out <csv> is required");

  const missing: string[] = [];
  for (const source of UECL_SOURCES) {
    for (const [prefix, page] of [
      ["qual", source.qualifying],
      ["main", source.competition],
    ] as const) {
      const path = join(dir, `${prefix}-${source.season}.html`);
      if (!existsSync(path)) {
        missing.push(`${path}\n    ${page.url}\n    revision ${page.revision} (${page.tier})`);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.length} local page(s). This command never downloads; fetch these and re-run:\n  ${missing.join("\n  ")}`
    );
  }

  const rows: CohortRow[] = [];
  const ledgers: SeasonLedger[] = [];
  for (const source of UECL_SOURCES) {
    const qualHtml = readFileSync(join(dir, `qual-${source.season}.html`), "utf8");
    const mainHtml = readFileSync(join(dir, `main-${source.season}.html`), "utf8");
    const season = buildSeason(source, qualHtml, mainHtml);
    rows.push(...season.rows);
    ledgers.push(season.ledger);
  }

  writeFileSync(out, `${toCsv(rows)}\n`, "utf8");
  const clubsOut = flags.get("--clubs");
  if (clubsOut) {
    const profiles = clubProfiles(rows);
    writeFileSync(
      clubsOut,
      `${clubsToCsv(profiles)}
`,
      "utf8"
    );
    console.log(`Zapisano ${profiles.length} klubów do ${clubsOut}`);
  }

  console.log(
    `Zapisano ${rows.length} wierszy do ${out} (dostęp do źródeł: ${UECL_ACCESSED_AT})\n`
  );
  for (const ledger of ledgers) {
    console.log(
      `${ledger.season}: wejść do Q2 ${ledger.q2Entries} → kohorta ${ledger.cohort}` +
        ` | wykluczono transferów ${ledger.excludedTransfers.length}` +
        ` (${ledger.excludedTransfers.map((entry) => `${entry.club} ${entry.marker}`).join(", ") || "brak"})` +
        ` | ścieżka mistrzowska Q2 ${ledger.excludedChampionsPath}` +
        ` | Q2 ścieżki głównej razem ${ledger.q2MainPathTeams}` +
        ` | faza główna ${ledger.mainPhaseClubs}`
    );
    for (const [label, list] of [
      ["bez podstawy krajowej", ledger.missingDomesticBasis],
      ["bez rozstawienia", ledger.missingSeeding],
      ["bez rangi związku", ledger.missingAssociationRank],
    ] as const) {
      if (list.length > 0) console.log(`    ${label}: ${list.join(", ")}`);
    }
  }
};

main();
