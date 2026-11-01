/**
 * Pure HTML -> ratings parser, split from the CLI the same way
 * legacy-scan-core.ts is split from legacy-scan.ts: the network and the
 * filesystem stay in the caller so the parsing contract is unit-testable
 * against a fixture.
 *
 * Deliberately regex-based rather than DOM-based: adding a DOM parser
 * dependency to scrape one table is not worth it, and the failure mode we
 * care about (the page changing shape) must be a loud throw either way.
 */

import { at } from "../src/logic/invariant";
export type ParsedRating = {
  rank: number;
  krotko: string;
  nazwa: string;
  strength: number;
  attack: number;
  defence: number;
};

const TABLE = /<table class="weights-table">([\s\S]*?)<\/table>/;

const ROW =
  /<tr><td class="rank">(\d+)<\/td><td class="team-name">[\s\S]*?<span class="team-label">([^<]+)<\/span>[\s\S]*?<td class="number weight">([\d.]+)<\/td><td class="number detail">([\d.]+)<\/td><td class="number detail">([\d.]+)<\/td>([\s\S]*?)<\/tr>/g;

const FULL_NAME = /<strong>([^·<]+)\s·/;

export const parseTeamRatings = (html: string): ParsedRating[] => {
  const table = TABLE.exec(html);
  if (!table) throw new Error('sync-ratings: no <table class="weights-table"> in the page');

  const ratings: ParsedRating[] = [];
  ROW.lastIndex = 0;
  let match: RegExpExecArray | null;
  const body = at(table, 1, "ratings table body");
  while ((match = ROW.exec(body)) !== null) {
    const [, rank, , strength, attack, defence] = match;
    const krotko = at(match, 2, "short club name");
    const fullName = FULL_NAME.exec(at(match, 6, "row tail"));
    ratings.push({
      rank: Number(rank),
      krotko: krotko.trim(),
      nazwa: (fullName?.[1] ?? krotko).trim(),
      strength: Number(strength),
      attack: Number(attack),
      defence: Number(defence),
    });
  }

  const rows = (body.match(/<tr><td/g) ?? []).length;
  if (ratings.length === 0 || ratings.length !== rows) {
    throw new Error(
      `sync-ratings: parsed ${ratings.length} of ${rows} row(s) - the page structure changed`
    );
  }
  return ratings;
};
