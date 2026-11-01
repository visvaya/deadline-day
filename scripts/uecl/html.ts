/**
 * Minimal, deliberately loud HTML helpers for the Conference League parser.
 *
 * Regex over parsed Wikipedia HTML, like scripts/sync-ratings-core.ts: no new
 * dependency, and every helper throws rather than returning something empty
 * when the page stops looking the way it looked when the data was pinned. A
 * silent zero here would become a silently wrong benchmark.
 */

import { at } from "../../src/logic/invariant";

export const section = (html: string, startId: string, endId: string): string => {
  const start = html.indexOf(`id="${startId}"`);
  if (start === -1) throw new Error(`Section id="${startId}" not found`);
  const end = html.indexOf(`id="${endId}"`, start);
  if (end === -1) throw new Error(`Section id="${endId}" not found after "${startId}"`);
  return html.slice(start, end);
};

export const rows = (fragment: string): string[] => fragment.match(/<tr\b[\s\S]*?<\/tr>/g) ?? [];

export const cells = (row: string): string[] => row.match(/<t[hd]\b[\s\S]*?<\/t[hd]>/g) ?? [];

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export const text = (fragment: string): string =>
  fragment
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();

/**
 * The join key between the two Wikipedia pages, and the reason club names are
 * never used for that: the qualifying page writes "Legia Warszawa" where the
 * competition page writes "Legia Warsaw". Both link to the same article, so
 * the article path is the identity and the display names are just labels.
 */
export const articleKey = (cell: string): string | null => {
  const match = cell.match(/href="[^"]*\/wiki\/([^"#]+)"[^>]*title="[^"]*"[^>]*>(?!<img)/);
  if (!match) return null;
  return decodeURIComponent(at(match, 1, "article path"));
};

/** Display name: the text of the first club anchor in the cell. */
export const anchorText = (cell: string): string | null => {
  const match = cell.match(/<a\b[^>]*\/wiki\/[^"]*"[^>]*>([^<]+)<\/a>/);
  return match ? text(at(match, 1, "anchor text")) : null;
};

/**
 * Association code from the flag template Wikipedia wraps each club in
 * ({{fbaicon|DEN}}). Read from the template parameter rather than the flag
 * image, because the image file name is a country, not an association code,
 * and England/Great Britain style mismatches start exactly there.
 */
export const associationCode = (fragment: string): string | null => {
  // Wikipedia uses {{fbaicon|DEN}} in team lists and {{fba|ESP}} in the
  // association ranking; both carry the code in the same parameter slot.
  const match = fragment.match(/"(?:fbaicon|fba|fb)"[\s\S]{0,200}?"1":\{"wt":"([A-Z]{3})"\}/);
  return match ? at(match, 1, "association code") : null;
};

/** Every club article linked from a cell. Seeding cells hold a whole column
 * of clubs, not one, so taking only the first silently loses most of them. */
export const articleKeys = (cell: string): string[] => {
  const found: string[] = [];
  const pattern = /href="[^"]*\/wiki\/([^"#]+)"[^>]*title="[^"]*"[^>]*>(?!<img)/g;
  let match = pattern.exec(cell);
  while (match) {
    const key = decodeURIComponent(at(match, 1, "article path"));
    if (!found.includes(key)) found.push(key);
    match = pattern.exec(cell);
  }
  return found;
};

/** Row background colour, which the qualifying article uses as a legend
 * ("winners of play-off round advanced to the league phase"). */
export const rowColour = (row: string): string | null => {
  const match = row.match(/bgcolor="([^"]+)"/i);
  return match ? at(match, 1, "row colour").toUpperCase() : null;
};

/** Footnote markers Wikipedia attaches with {{Cref2|UEL MP Q1}}. */
export const markers = (fragment: string): string[] => {
  const found = new Set<string>();
  const pattern = /"Cref2"[\s\S]{0,200}?"1":\{"wt":"([^"]+)"\}/g;
  let match = pattern.exec(fragment);
  while (match) {
    found.add(at(match, 1, "footnote marker"));
    match = pattern.exec(fragment);
  }
  return [...found];
};

export const decimal = (fragment: string): number | null => {
  const match = text(fragment).match(/^-?\d+(?:\.\d+)?$/);
  return match ? Number(match[0]) : null;
};
