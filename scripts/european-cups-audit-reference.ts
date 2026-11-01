import type { EuropeanCup } from "../src/data/types";

/**
 * Pinned external material for `pnpm audit:european-cups`, in the same
 * spirit as MATCH_OUTCOME_REFERENCE: the audit is OFFLINE, so anything the
 * outside world contributes has to be transcribed here, with its source, the
 * date it was read and - the part docs/puchary.md got wrong - the exact
 * event each number measures.
 *
 * Nothing in this file is a pass threshold. Every entry carries `kind` and
 * `usableAsThreshold`, and the report prints both, because the whole reason
 * the previous document had to be thrown away is that it printed projections
 * next to model output in one column and let the reader assume they were
 * comparable.
 */

/** What sort of number this is. The three are NOT interchangeable:
 * - `historical` - an observed frequency of a defined event, counted;
 * - `projection` - somebody's model output for a named club and season;
 * - `modelEstimate` - this game's own model, reported for orientation. */
export type ReferenceKind = "historical" | "projection" | "modelEstimate";

export type EuropeanReferencePoint = {
  label: string;
  kind: ReferenceKind;
  cup: EuropeanCup;
  /** Season of the competition the number refers to, not of the game. */
  season: string;
  /** The round the club actually entered at. A probability of "advancing"
   * means nothing without it - two rounds of qualifying is a different
   * event from one. */
  entryRound: string;
  /** Precisely which event the value measures, written out. */
  eventDefinition: string;
  value: number;
  /** Why it cannot be used to accept or reject a constant on its own. */
  caveat: string;
  usableAsThreshold: false;
  source: string;
  accessedAt: string;
};

/**
 * The two projections that started this audit. Both come from a screenshot of
 * a third-party qualifying simulation (accessed 2026-09-02) - a run over the
 * 2026/27 access list, in which
 * Poland held 15th place and TWO Conference League berths.
 *
 * They are kept because they are the only external numbers available at all,
 * and dropped from every threshold because the population differs from the
 * game's: the game has one LK berth, for 4th place.
 */
export const EUROPEAN_REFERENCE: readonly EuropeanReferencePoint[] = [
  {
    label: "GKS Katowice",
    kind: "projection",
    cup: "LK",
    season: "2026/27",
    entryRound: "II runda eliminacji",
    eventDefinition:
      "awans z II rundy eliminacji Ligi Konferencji do fazy ligowej (trzy dwumecze: Q2, Q3, play-off)",
    value: 0.189,
    caveat:
      "projekcja jednego klubu z cyklu o dwóch miejscach LK; nie wykazano, że klub reprezentuje przeciętną kadrę Ekstraklasy ani jak jego siła mapuje się na skalę strength",
    usableAsThreshold: false,
    source: "zrzut ekranu zewnętrznej symulacji kwalifikacji 2026/27",
    accessedAt: "2026-09-02",
  },
  {
    label: "Raków Częstochowa",
    kind: "projection",
    cup: "LK",
    season: "2026/27",
    entryRound: "II runda eliminacji",
    eventDefinition:
      "awans z II rundy eliminacji Ligi Konferencji do fazy ligowej (trzy dwumecze: Q2, Q3, play-off)",
    value: 0.457,
    caveat:
      "jak wyżej; dwa punkty z jednego cyklu nie wyznaczają nachylenia, a przypisanie klubom wartości strength w usuniętym docs/puchary.md było zmyślone (rozdział 2 audytu)",
    usableAsThreshold: false,
    source: "zrzut ekranu zewnętrznej symulacji kwalifikacji 2026/27",
    accessedAt: "2026-09-02",
  },
];

export type AccessListRow = {
  spot: string;
  cup: EuropeanCup | "—";
  entryRound: string;
  tiesToLeaguePhase: number | null;
  source: string;
};

/**
 * Prowizoryczna access lista 2027/28 - the cycle the game's season 2026/27
 * feeds into. Chapter 1 of docs/decisions/european-cups-audit.md establishes that UEFA's own
 * Annex A for this cycle is NOT published yet, so every row here is
 * secondary and provisional. It exists to let the report say how many ties
 * each berth really faces next to the single aggregated draw the game makes.
 */
export const ACCESS_LIST_2027_28: readonly AccessListRow[] = [
  {
    spot: "mistrz",
    cup: "LM",
    entryRound: "runda play-off (ścieżka mistrzowska)",
    tiesToLeaguePhase: 1,
    source: "https://en.wikipedia.org/wiki/2027%E2%80%9328_UEFA_Champions_League",
  },
  {
    spot: "wicemistrz",
    cup: "LM",
    entryRound: "II runda eliminacji (ścieżka ligowa)",
    tiesToLeaguePhase: 3,
    source: "https://en.wikipedia.org/wiki/2027%E2%80%9328_UEFA_Champions_League",
  },
  {
    spot: "zdobywca Pucharu Polski",
    cup: "LE",
    entryRound: "runda play-off",
    tiesToLeaguePhase: 1,
    source: "https://en.wikipedia.org/wiki/2027%E2%80%9328_UEFA_Europa_League",
  },
  {
    spot: "3. miejsce",
    cup: "LE",
    entryRound: "nieustalona - access lista nieopublikowana",
    tiesToLeaguePhase: null,
    source: "brak źródła pierwotnego (documents.uefa.com ma tylko cykl 2026/27)",
  },
  {
    spot: "4. miejsce",
    cup: "LK",
    entryRound: "II runda eliminacji",
    tiesToLeaguePhase: 3,
    source: "https://en.wikipedia.org/wiki/2027%E2%80%9328_UEFA_Conference_League",
  },
];

/**
 * Real prize money the repo has pinned, mln EUR. LEAGUE PHASE ONLY - there
 * is deliberately no knockout row, because none is pinned anywhere in the
 * repo. Chapter 5 of the audit turns on exactly this gap: without a real
 * amount for the knockout stage the game's 1.4x league-to-knockout ratio
 * cannot be confronted with anything, so pKnockout* stays uncalibrated.
 */
export const REAL_LEAGUE_PHASE_PRIZE: Record<EuropeanCup, number> = {
  LM: 18.6,
  LE: 4.31,
  LK: 3.17,
};
