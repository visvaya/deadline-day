/**
 * Reads the Ekstraklasa section of an RSSSF season page into raw match rows.
 *
 * Split from the CLI (rsssf-parse.ts) so tests can import it without running
 * main() - the same split legacy-scan-core.ts uses.
 *
 * The parser this replaces required TWO spaces before a score, because that is
 * what column padding usually leaves. "Podbeskidzie" is twelve characters and
 * fills the name column exactly, leaving one - so every home match it ever
 * played was dropped, and the two seasons it played in (2015/16 and 2020/21)
 * were written off as "incomplete at the source". They were not. Nothing here
 * counts spaces, and nothing here skips a line it does not understand.
 */

import { at } from "../src/logic/invariant";

/** One result, exactly as the file prints it: the short match-list club names,
 * not the full names the final table uses. resolveClubNames() bridges the two. */
export type LeagueMatch = {
  round: number;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
};

/** One line of a published table. Points are read but deliberately NOT used by
 * verifySeasonAgainstTable - see the comment there. */
export type LeagueTableRow = {
  club: string;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export type ParsedSeason = {
  matches: readonly LeagueMatch[];
  /** The deepest tables the section publishes, merged. */
  table: readonly LeagueTableRow[];
};

const ANCHOR = 'name="ekstra"';

/**
 * Cuts the Ekstraklasa block out of a season page and makes it readable.
 *
 * Three things stand between the bytes and a line of text, and the order
 * matters: the file is ISO-8859-2 (reading it as UTF-8 turns "Raków" into
 * "Rak?w"), Polish letters above that are numeric HTML entities, and the block
 * carries navigation links whose text would otherwise look like content.
 *
 * The block runs from the `name="ekstra"` anchor to the next `</pre>`, NOT to
 * the next heading: in 2015/16-2019/20 the championship and relegation playoffs
 * are rounds 31-37 of the same league and sit under their own sub-headings
 * inside that one block.
 */
export const extractLeagueSection = (bytes: Uint8Array): string => {
  const html = new TextDecoder("iso-8859-2").decode(bytes);
  const anchor = html.indexOf(ANCHOR);
  if (anchor === -1) throw new Error(`No ${ANCHOR} anchor in this page`);
  const open = html.indexOf("<pre>", anchor);
  const close = html.indexOf("</pre>", open);
  if (open === -1 || close === -1)
    throw new Error("The Ekstraklasa anchor is not followed by <pre>");
  return (
    html
      .slice(open + "<pre>".length, close)
      // Link, bold and underline elements carry ONLY navigation text here
      // ("Playoff Stage", "Relegation Playoff"), never a club or a score, so
      // their contents go with them. What survives on such a line is
      // punctuation, which classifies as blank below.
      .replace(/<(a|b|u)\b[^>]*>[\s\S]*?<\/\1>/g, "")
      .replace(/<[^>]*>/g, "")
      .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
  );
};

/**
 * Everything inside square brackets is an editorial footnote, never data. The
 * second pass takes an UNCLOSED footnote off the end of the line: those exist
 * (2022/23 round 30 breaks one after "due"), and leaving it attached turns the
 * away club into "Lechia       [awarded 3-0; abandoned at 0-1 in 80' due".
 */
const withoutFootnotes = (line: string): string =>
  line.replace(/\[[^\]]*\]/g, " ").replace(/\[[^\]]*$/, " ");

const MATCH_LINE = /^(.*?)\s+(\d{1,2}-\d{1,2}|awd|abd)\s+(.+?)\s*$/;
const TABLE_LINE =
  /^\s*(\d+)\.(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*-\s*(\d+)\s+(\d+)(?:\s+[A-Za-z].*)?\s*$/;
const AWARDED = /\[awarded (\d+)-(\d+)/;

/** Index of the last run of two or more spaces, or -1. */
const lastGap = (text: string): number => {
  let found = -1;
  for (const gap of text.matchAll(/\s{2,}/g)) found = gap.index;
  return found;
};

/**
 * Takes the tail of a footnote that spilled onto this line back off it.
 *
 * RSSSF lays the block out in fixed columns, so a footnote too long for its
 * line simply continues in the right margin of the NEXT one - which is a
 * different match. In 2022/23 the Piast-Lechia note breaks after "due" and
 * "to crowd trouble]" lands glued to Pogoń-Radomiak. The tail runs from the
 * last column gap up to the closing bracket; what is left is the real row.
 */
const stripFootnoteTail = (line: string, round: number): string => {
  const close = line.indexOf("]");
  if (close === -1) {
    throw new Error(`A footnote opened before round ${round} never closes: "${line.trim()}"`);
  }
  const head = line.slice(0, close + 1);
  const gap = lastGap(head);
  return gap === -1 ? line.slice(close + 1) : head.slice(0, gap) + line.slice(close + 1);
};

const readTableRow = (line: string, round: number): LeagueTableRow => {
  const parsed = TABLE_LINE.exec(withoutFootnotes(line));
  if (!parsed) {
    throw new Error(`Unreadable table row near round ${round}: "${line.trim()}"`);
  }
  return {
    club: at(parsed, 2, "table club").trim(),
    played: Number(parsed[3]),
    goalsFor: Number(parsed[7]),
    goalsAgainst: Number(parsed[8]),
    points: Number(parsed[9]),
  };
};

/**
 * Keeps the tables that cover the whole season and merges them.
 *
 * A split season publishes four different tables - after 30 rounds, at the
 * halfway point, and one per playoff group after 37 matches - and republishes
 * the playoff ones at both ends of their round list. Taking the deepest ones by
 * matches played picks the right set in every format, split or not; a club
 * appearing twice with the same figures is that republication, and a club
 * appearing twice with DIFFERENT figures means the assumption broke.
 */
const deepestTable = (rows: readonly LeagueTableRow[]): LeagueTableRow[] => {
  if (rows.length === 0) return [];
  const deepest = Math.max(...rows.map((row) => row.played));
  const byClub = new Map<string, LeagueTableRow>();
  for (const row of rows.filter((candidate) => candidate.played === deepest)) {
    const seen = byClub.get(row.club);
    if (!seen) {
      byClub.set(row.club, row);
      continue;
    }
    if (
      seen.goalsFor !== row.goalsFor ||
      seen.goalsAgainst !== row.goalsAgainst ||
      seen.points !== row.points
    ) {
      throw new Error(
        `Club "${row.club}" appears twice in the deepest tables with different figures: ` +
          `${seen.goalsFor}-${seen.goalsAgainst}/${seen.points} and ` +
          `${row.goalsFor}-${row.goalsAgainst}/${row.points}`
      );
    }
  }
  return [...byClub.values()];
};

/**
 * Classifies EVERY line of the section into one explicit state and throws on
 * anything left over.
 *
 * "A line with digits and a dash is a result" is the kind of heuristic that
 * both swallows an abandoned fixture and trips over a note, and silent
 * degradation is worse here than a crash: it produces figures that look right.
 */
export const parseLeagueSection = (text: string): ParsedSeason => {
  const matches: LeagueMatch[] = [];
  const tableRows: LeagueTableRow[] = [];
  let round = 0;
  let inNote = false;
  let pendingFootnote = false;

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine;
    if (pendingFootnote) {
      line = stripFootnoteTail(line, round);
      pendingFootnote = false;
    }
    const trimmed = line.trim();

    // Blank, or all that is left of a row of navigation links.
    if (/^[|\s]*$/.test(trimmed)) {
      inNote = false;
      continue;
    }
    const roundHeading = /^Round\s+(\d+)\b/.exec(trimmed);
    if (roundHeading) {
      round = Number(roundHeading[1]);
      inNote = false;
      continue;
    }
    // A date heading: "[Aug 21]". Never carries a result.
    if (/^\[[A-Z][a-z]{2}\b/.test(trimmed)) continue;
    if (/Table:$/.test(trimmed)) {
      inNote = false;
      continue;
    }
    // The rule separating relegation places from the rest.
    if (/^[-\s]+$/.test(trimmed)) continue;
    if (/^(NB|Note|Promoted|Relegated)\b/.test(trimmed)) {
      inNote = true;
      continue;
    }
    // Notes wrap onto indented lines and end at the next blank line.
    if (inNote) continue;
    if (/^\s*\d+\./.test(line)) {
      tableRows.push(readTableRow(line, round));
      continue;
    }

    const parsed = MATCH_LINE.exec(withoutFootnotes(line));
    const home = parsed ? at(parsed, 1, "home club").trim() : "";
    const away = parsed ? at(parsed, 3, "away club").trim() : "";
    if (!parsed || home === "" || away === "") {
      throw new Error(`Unclassified line in round ${round}: "${trimmed}"`);
    }
    if (round === 0) throw new Error(`A result appears before any round heading: "${trimmed}"`);

    // An unclosed bracket means this line's footnote continues on the next one.
    pendingFootnote = (line.match(/\[/g)?.length ?? 0) > (line.match(/\]/g)?.length ?? 0);

    const token = at(parsed, 2, "score token");
    // An abandoned fixture is not a result. Its replay is a separate line with
    // a real score, and counting both would give a 306-match season 307 rows.
    if (token === "abd") continue;
    const score = token === "awd" ? AWARDED.exec(line)?.slice(1, 3) : token.split("-");
    if (!score) {
      throw new Error(`Walkover without an awarded score in round ${round}: "${trimmed}"`);
    }
    matches.push({
      round,
      home,
      away,
      homeGoals: Number(score[0]),
      awayGoals: Number(score[1]),
    });
  }

  if (pendingFootnote) throw new Error("A footnote at the end of the section never closes");
  return { matches, table: deepestTable(tableRows) };
};

const tokens = (name: string): string[] => name.split(/\s+/).filter((part) => part !== "");

/** Do the short name's words appear, in order, among the full name's words? */
const wordsAppearInOrder = (
  short: readonly string[],
  full: readonly string[],
  same: (_short: string, _full: string) => boolean
): boolean => {
  let next = 0;
  for (const word of full)
    if (next < short.length && same(at(short, next, "short name word"), word)) next += 1;
  return next === short.length;
};

/**
 * Match lists print "Zagłębie L" where the table prints "Zagłębie Lubin", so
 * the two have to be tied together before anything can be compared.
 *
 * Two rounds, and the order between them is the whole trick. The first asks
 * for the short name's words to appear WHOLE among the full name's, in order;
 * only if nothing matches that way does the second let a word be shortened to
 * an initial. Both directions of abbreviation are real - RSSSF writes "GKS
 * Katowice" as "Katowice" and "Zagłębie Lubin" as "Zagłębie L" - but a single
 * loose pass would read "Lech" as Lechia Gdańsk just as readily as Lech
 * Poznań, and 2024/25 fielded both.
 *
 * Anything resolving to no club, or to more than one, is an error. A quiet
 * guess here would defeat the check this exists to feed.
 */
export const resolveClubNames = (parsed: ParsedSeason): Map<string, string> => {
  const full = parsed.table.map((row) => row.club);
  const short = new Set(parsed.matches.flatMap((match) => [match.home, match.away]));
  const resolved = new Map<string, string>();
  for (const name of short) {
    if (full.includes(name)) {
      resolved.set(name, name);
      continue;
    }
    const parts = tokens(name);
    const matching = (same: (_short: string, _full: string) => boolean): string[] =>
      full.filter((candidate) => wordsAppearInOrder(parts, tokens(candidate), same));
    const whole = matching((a, b) => a === b);
    const candidates = whole.length === 0 ? matching((a, b) => b.startsWith(a)) : whole;
    if (candidates.length !== 1) {
      throw new Error(
        `Club "${name}" from the match list resolves to ${candidates.length} clubs in the table${
          candidates.length > 1 ? `: ${candidates.join(", ")}` : ""
        }`
      );
    }
    resolved.set(name, at(candidates, 0, "resolved club"));
  }
  return resolved;
};

/**
 * Makes the season's own published table check the season's own match list.
 *
 * No outside source is needed: RSSSF computes the table, we compute the
 * matches, and appearances plus goals for and against have to agree club by
 * club. This is exactly the check that would have caught the dropped
 * Podbeskidzie home matches the day it happened - the league's total goals
 * still looked perfectly plausible, which is why nothing did.
 *
 * POINTS ARE NOT COMPARED, and that is not an oversight to finish off later.
 * When the league split, clubs carried half their regular-stage points into
 * the playoff round, rounded down, so points summed from results legitimately
 * disagree with the published table. Appearances and goals are immune to it.
 */
export const verifySeasonAgainstTable = (parsed: ParsedSeason): Map<string, string> => {
  if (parsed.table.length === 0)
    throw new Error("This section publishes no table to check against");
  const resolved = resolveClubNames(parsed);
  const tally = new Map<string, { played: number; goalsFor: number; goalsAgainst: number }>();
  const add = (club: string, scored: number, conceded: number): void => {
    const current = tally.get(club) ?? { played: 0, goalsFor: 0, goalsAgainst: 0 };
    tally.set(club, {
      played: current.played + 1,
      goalsFor: current.goalsFor + scored,
      goalsAgainst: current.goalsAgainst + conceded,
    });
  };
  for (const match of parsed.matches) {
    add(resolved.get(match.home)!, match.homeGoals, match.awayGoals);
    add(resolved.get(match.away)!, match.awayGoals, match.homeGoals);
  }

  const disagreements = parsed.table
    .map((row) => {
      const counted = tally.get(row.club) ?? { played: 0, goalsFor: 0, goalsAgainst: 0 };
      const parts = [
        counted.played === row.played ? "" : `played ${counted.played} vs ${row.played}`,
        counted.goalsFor === row.goalsFor ? "" : `scored ${counted.goalsFor} vs ${row.goalsFor}`,
        counted.goalsAgainst === row.goalsAgainst
          ? ""
          : `conceded ${counted.goalsAgainst} vs ${row.goalsAgainst}`,
      ].filter((part) => part !== "");
      return parts.length === 0 ? "" : `${row.club}: ${parts.join(", ")}`;
    })
    .filter((line) => line !== "");

  if (disagreements.length > 0) {
    throw new Error(
      `The match list disagrees with the published table (counted vs table): ${disagreements.join("; ")}`
    );
  }
  return resolved;
};
