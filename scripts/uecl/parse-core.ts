import {
  anchorText,
  articleKey,
  articleKeys,
  associationCode,
  cells,
  decimal,
  markers,
  rowColour,
  rows,
  section,
  text,
} from "./html";

/**
 * Turns two pinned Wikipedia pages per season - the competition article and
 * its qualifying article - into one row per club that entered the Conference
 * League at the second qualifying round of the Main Path.
 *
 * That club is the real-world counterpart of what this game hands its player:
 * a berth that must survive three two-legged ties to reach the league phase.
 * See docs/decisions/european-cups-audit.md chapter 12.
 *
 * NOTHING HERE FETCHES. The CLI reads local files, exactly like
 * scripts/rsssf-parse.ts, so the measurement is reproducible offline and the
 * pinned CSV is the only thing the analysis ever reads.
 */

export type Path = "champions" | "main";

/** Where a club started this competition, as the article's own Teams table
 * groups them. */
type EntryRound = "Q1" | "Q2" | "Q3" | "PO" | "LP";

export type TeamEntry = {
  articleKey: string;
  club: string;
  association: string;
  clubCoefficient: number | null;
  entryRound: EntryRound;
  path: Path;
  /** Footnotes like "UEL MP Q1": the club did not enter here, it was
   * transferred in after losing elsewhere. */
  markers: string[];
  /** The article shades a club green once it reaches the league phase. Used
   * as one of two independent readings of the outcome - the other is the
   * league-phase table on the competition article - and the parser refuses to
   * emit a season where the two disagree. */
  reachedLeaguePhase: boolean;
};

/** "Winners of play-off round advanced to the league phase" in the article's
 * own key to colours. */
const ADVANCED_COLOUR = "#BBF3BB";

const ROUND_LABELS: { label: string; round: EntryRound }[] = [
  { label: "First qualifying round", round: "Q1" },
  { label: "Second qualifying round", round: "Q2" },
  { label: "Third qualifying round", round: "Q3" },
  { label: "Play-off round", round: "PO" },
  { label: "League phase", round: "LP" },
  { label: "Group stage", round: "LP" },
];

/**
 * Reads the Teams section, which groups every participant by the round it
 * starts in. Round headings are plain header cells inside a layout table, so
 * the round of a club row is the nearest heading above it - simpler and far
 * more robust than trying to match nested <table> tags with a regex.
 */
export const parseTeamEntries = (qualHtml: string, path: Path): TeamEntry[] => {
  const block =
    path === "champions"
      ? section(qualHtml, "Champions_Path", "Main_Path")
      : section(qualHtml, "Main_Path", "First_qualifying_round");

  const headings: { at: number; round: EntryRound }[] = [];
  for (const { label, round } of ROUND_LABELS) {
    let at = block.indexOf(`>${label}<`);
    while (at !== -1) {
      headings.push({ at, round });
      at = block.indexOf(`>${label}<`, at + 1);
    }
  }
  if (headings.length === 0) throw new Error(`No round headings in the ${path} path Teams block`);
  headings.sort((a, b) => a.at - b.at);

  const entries: TeamEntry[] = [];
  let cursor = 0;
  for (const row of rows(block)) {
    const at = block.indexOf(row, cursor);
    if (at === -1) throw new Error("Row vanished while scanning the Teams block");
    cursor = at + row.length;
    const association = associationCode(row);
    if (!association) continue;

    const heading = [...headings].reverse().find((h) => h.at < at);
    if (!heading) throw new Error(`Club row before any round heading in the ${path} path`);

    for (const cell of cells(row)) {
      const key = articleKey(cell);
      if (!key) continue;
      const cellAssociation = associationCode(cell) ?? association;
      const coefficientCell = cells(row).find((c) => decimal(c) !== null);
      entries.push({
        articleKey: key,
        club: anchorText(cell) ?? key.replace(/_/g, " "),
        association: cellAssociation,
        clubCoefficient: coefficientCell ? decimal(coefficientCell) : null,
        entryRound: heading.round,
        path,
        markers: markers(cell),
        reachedLeaguePhase: rowColour(row) === ADVANCED_COLOUR,
      });
    }
  }
  return entries;
};

/**
 * Every club that played a given round, read off that round's summary of ties.
 * Used only for membership - who was still in the competition - so no winner
 * has to be parsed out of an aggregate score, with its extra time, away goals
 * and penalty shoot-outs. Advancing from a round means appearing in the next
 * one.
 */
export const parseRoundParticipants = (
  qualHtml: string,
  summaryId: string,
  matchesId: string
): { path: Path; articleKey: string }[] => {
  const block = section(qualHtml, summaryId, matchesId);
  const found: { path: Path; articleKey: string }[] = [];
  let path: Path | null = null;
  for (const row of rows(block)) {
    const label = text(row);
    if (label === "Champions Path") {
      path = "champions";
      continue;
    }
    if (label === "Main Path") {
      path = "main";
      continue;
    }
    if (path === null) continue;
    for (const cell of cells(row)) {
      // Only cells carrying a flag are team cells. Score cells link out too -
      // "5-4 (p)" links the penalty shoot-out article - and counting those put
      // the 2024/25 Main Path at 89 teams where UEFA published 86.
      if (!cell.includes('class="flagicon"')) continue;
      const key = articleKey(cell);
      if (key) found.push({ path, articleKey: key });
    }
  }
  if (found.length === 0) throw new Error(`No participants parsed from ${summaryId}`);
  return found;
};

/**
 * Seeded or unseeded in the second qualifying round draw. The Main Path table
 * is a grid of "Group N" blocks whose columns alternate Seeded / Unseeded, so
 * the header row decides what each column means; a club's own cell never says.
 */
export const parseSecondRoundSeeding = (qualHtml: string): Map<string, boolean> => {
  const block = section(qualHtml, "Seeding_2", "Summary_2");
  const mainAt = block.indexOf(">Main Path<");
  if (mainAt === -1) throw new Error("No Main Path seeding table");
  const mainBlock = block.slice(mainAt);

  const seeding = new Map<string, boolean>();
  let columns: boolean[] | null = null;
  for (const row of rows(mainBlock)) {
    const labels = cells(row).map((cell) => text(cell));
    if (labels.length > 0 && labels.every((label) => label === "Seeded" || label === "Unseeded")) {
      columns = labels.map((label) => label === "Seeded");
      continue;
    }
    if (!columns) continue;
    cells(row).forEach((cell, index) => {
      const seeded = columns![index];
      if (seeded === undefined) return;
      // One cell is a whole column of clubs, not a single one.
      for (const key of articleKeys(cell)) seeding.set(key, seeded);
    });
  }
  if (seeding.size === 0) throw new Error("Main Path seeding parsed empty");
  return seeding;
};

/**
 * How each club qualified at home - "3rd", "Cup winners", "UEL PO" and so on -
 * from the competition article's own Teams table. Recorded because a berth is
 * not just a round: two clubs entering the same round off a third and a fifth
 * domestic place are not the same observation.
 */
export const parseDomesticBasis = (mainHtml: string): Map<string, string> => {
  const block = section(mainHtml, "Teams", "Schedule");
  const basis = new Map<string, string>();
  const anchor = /<a\b[^>]*\/wiki\/([^"#]+)"[^>]*title="[^"]*"[^>]*>(?!<img)/g;
  for (const cell of rows(block).flatMap((row) => cells(row))) {
    const positions: { key: string; at: number }[] = [];
    anchor.lastIndex = 0;
    let match = anchor.exec(cell);
    while (match) {
      const encoded = match[1];
      if (encoded === undefined) throw new Error("club anchor matched without an article path");
      positions.push({ key: decodeURIComponent(encoded), at: match.index });
      match = anchor.exec(cell);
    }
    positions.forEach((position) => {
      // The label follows the club as rendered text - "Legia Warsaw (3rd)" -
      // and the FIRST bracket after a club belongs to that club, whatever
      // links sit inside it. Slicing to "the next anchor" instead would fail
      // on exactly the common case, because the label itself is a link to the
      // domestic season.
      const label = text(cell.slice(position.at)).match(/\(([^()]{1,40})\)/);
      const labelText = label?.[1];
      if (label && labelText === undefined) throw new Error("bracket label matched without text");
      if (labelText !== undefined && !basis.has(position.key)) {
        basis.set(position.key, labelText.trim());
      }
    });
  }
  // Season articles ("2023-24 Ekstraklasa") are linked from inside the labels
  // themselves; they are never looked up by a caller, but dropping them keeps
  // the map honest about what it contains.
  for (const key of [...basis.keys()]) {
    if (/^\d{4}/.test(key)) basis.delete(key);
  }
  if (basis.size === 0) throw new Error("Domestic qualification basis parsed empty");
  return basis;
};

export type AssociationRank = { association: string; rank: number; coefficient: number | null };

/**
 * The association ranking that governed this season's access list. Read from
 * the competition article because UEFA's own ranking page is script-rendered
 * and its access-list document is not reachable - see the manifest, where
 * this is flagged as a secondary source.
 */
export const parseAssociationRanking = (mainHtml: string): AssociationRank[] => {
  const block = section(mainHtml, "Association_ranking", "Distribution");
  const ranking: AssociationRank[] = [];
  for (const row of rows(block)) {
    const association = associationCode(row);
    if (!association) continue;
    const values = cells(row)
      .map((cell) => text(cell))
      .filter((value) => value.length > 0);
    const rank = values
      .map((value) => Number(value))
      .find((value) => Number.isInteger(value) && value > 0);
    const coefficient = cells(row)
      .map((cell) => decimal(cell))
      .find((value) => value !== null && !Number.isInteger(value));
    if (rank === undefined) continue;
    ranking.push({ association, rank, coefficient: coefficient ?? null });
  }
  if (ranking.length === 0) throw new Error("Association ranking parsed empty");
  return ranking;
};

/**
 * Clubs in the league phase (or, before 2024/25, the group stage), read off
 * the competition article's standings. The season in progress has no table
 * yet, so the caller gets null and falls back to the qualifying article's own
 * colour legend rather than to an empty set that would read as "nobody
 * qualified".
 */
export const parseLeaguePhaseClubs = (mainHtml: string): Set<string> | null => {
  if (!mainHtml.includes('id="Table"')) return null;
  const block = section(mainHtml, "Table", "Results");
  const clubs = new Set<string>();
  for (const row of rows(block)) {
    // One club per standings row, and it is the first article linked there.
    // Taking every link instead picks up "round of 16" and friends from the
    // qualification legend, which would quietly add a club that never played.
    // A standings row starts with a finishing position; the header row and the
    // qualification legend do not, and skipping them is what keeps the count
    // at exactly 36.
    const first = cells(row)[0];
    if (!first || !/^\d{1,2}$/.test(text(first))) continue;
    const key = cells(row)
      .map((cell) => articleKey(cell))
      .find((candidate) => candidate !== null);
    if (key) clubs.add(key);
  }
  return clubs.size === 0 ? null : clubs;
};

/**
 * Clubs that entered the competition proper without playing a qualifying tie,
 * from the competition article's own Teams table. Needed for the integrity
 * check: they plus the play-off winners must be exactly the 36 (before
 * 2024/25, 32) clubs of the main phase.
 */
export const parseDirectMainPhaseEntrants = (mainHtml: string): Set<string> => {
  const block = section(mainHtml, "Teams", "Schedule");
  const found = new Set<string>();
  for (const entry of parseTeamsSectionRounds(block)) {
    if (entry.round === "LP") found.add(entry.articleKey);
  }
  return found;
};

const parseTeamsSectionRounds = (block: string): { articleKey: string; round: EntryRound }[] => {
  const headings: { at: number; round: EntryRound }[] = [];
  for (const { label, round } of ROUND_LABELS) {
    let at = block.indexOf(`>${label}<`);
    while (at !== -1) {
      headings.push({ at, round });
      at = block.indexOf(`>${label}<`, at + 1);
    }
  }
  headings.sort((a, b) => a.at - b.at);
  const found: { articleKey: string; round: EntryRound }[] = [];
  let cursor = 0;
  for (const row of rows(block)) {
    const at = block.indexOf(row, cursor);
    cursor = at + row.length;
    const heading = [...headings].reverse().find((h) => h.at < at);
    if (!heading) continue;
    for (const cell of cells(row)) {
      for (const key of articleKeys(cell)) {
        // Domestic-season links live inside the qualification labels.
        if (!/^\d{4}/.test(key)) found.push({ articleKey: key, round: heading.round });
      }
    }
  }
  return found;
};
