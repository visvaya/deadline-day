import type { EuropeanCup } from "./types";

/**
 * Who Poland actually sent to Europe in 2026/27, as the real season ended.
 *
 * The first season of a career deliberately uses this real layout - LM, LM,
 * LE, LK, LK - rather than the one the allocator produces. The allocator in
 * src/logic/european-cups.ts hands out the NEXT cycle's layout (2027/28) and
 * stays as it is; the two are separate contracts, versioned and tested
 * apart, because the access list genuinely changed between the cycles.
 *
 * Source: the end of the 2025/26 Ekstraklasa season - Lech champion, Górnik
 * runner-up, Jagiellonia third and taking the Europa League place after the
 * cup winner, Raków and GKS taking the Conference League places. See the
 * spec (2026-09-03-finanse-i-wybor-klubu-design.md, chapter 6.3) for the
 * links; this file is the pinned result, not the research.
 *
 * Nothing reads it yet. It does not change the allocator, the qualification
 * odds, or the cup a career starts in.
 */

/**
 * Which route into the competition a club takes. The champions' path exists
 * precisely so that a champion's odds differ from a runner-up's -
 * `EUROPEAN_ADVANCE_ODDS` has one `pQualifyBase` per competition today and
 * therefore cannot see the difference. Recorded from day one anyway, so that
 * deciding to model it later needs no re-recording and no save migration.
 *
 * A path, not a round number: "champions" says which bracket, never which
 * qualifying round the club entered at.
 */
export type EuropeanEntryPath = "champions" | "league";

export type EuropeanBerth = {
  readonly clubId: string;
  readonly cup: EuropeanCup;
  readonly path: EuropeanEntryPath;
};

export const EUROPEAN_BERTHS_2026: readonly EuropeanBerth[] = [
  { clubId: "lech-poznan", cup: "LM", path: "champions" },
  { clubId: "gornik-zabrze", cup: "LM", path: "league" },
  { clubId: "jagiellonia-bialystok", cup: "LE", path: "league" },
  { clubId: "rakow-czestochowa", cup: "LK", path: "league" },
  { clubId: "gks-katowice", cup: "LK", path: "league" },
];

/** The berth a club starts the first season with, or null for the thirteen
 * clubs that start it at home. */
export const initialEuropeanBerth = (clubId: string): EuropeanBerth | null =>
  EUROPEAN_BERTHS_2026.find((berth) => berth.clubId === clubId) ?? null;
