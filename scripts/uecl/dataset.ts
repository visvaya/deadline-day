import {
  parseAssociationRanking,
  parseDirectMainPhaseEntrants,
  parseDomesticBasis,
  parseLeaguePhaseClubs,
  parseRoundParticipants,
  parseSecondRoundSeeding,
  parseTeamEntries,
} from "./parse-core";
import { UECL_CROSS_CHECKS, type UeclSource } from "../data/uecl-sources";

/**
 * One season of pages in, one row per Conference League second-qualifying-round
 * Main Path entrant out, plus the ledger of everything that was left out and
 * why.
 *
 * The ledger is not decoration. UEFA says 55 clubs entered the 2024/25 Main
 * Path at this round; a first, hand-counted pass at this cohort said 53 and
 * could not say which two were missing. A sample nobody can reconcile with the
 * published total is not a sample, so every exclusion is counted here and
 * printed in the report.
 */

export type CohortRow = {
  season: string;
  format: UeclSource["format"];
  club: string;
  articleKey: string;
  association: string;
  associationRank: number | null;
  associationCoefficient: number | null;
  /** Domestic route into Europe, as the competition article labels it: "3rd",
   * "Cup winners", "2nd" and so on. Null when the article does not say. */
  domesticBasis: string | null;
  /** Seeded in the Q2 draw. Derived from the club coefficient, and therefore
   * fixed before a ball is kicked - a predictor, not an outcome. */
  seeded: boolean | null;
  /** UEFA club coefficient at the time of the draw. Fixed before the season
   * under study, so it is a legitimate predictor and stratifier; it is NOT an
   * equivalent of the game's squad strength. */
  clubCoefficient: number | null;
  /** Footnote the article attaches to this entry, when it has one - a
   * replacement after the draw, say. Kept verbatim rather than interpreted. */
  entryNote: string | null;
  reachedLeaguePhase: boolean;
};

export type SeasonLedger = {
  season: string;
  /** Everything the Main Path Teams table lists as starting at Q2. */
  q2Entries: number;
  /** Of those, clubs transferred in from another competition rather than
   * entering here - they took a different road to the same round. */
  excludedTransfers: { club: string; marker: string }[];
  /** Champions Path clubs: a different draw with a different opponent pool. */
  excludedChampionsPath: number;
  /** Kept rows. */
  cohort: number;
  /** Teams that actually played the round, both paths, for the UEFA check. */
  q2MainPathTeams: number;
  mainPhaseClubs: number;
  /** Cohort clubs with no domestic label on the competition article. */
  missingDomesticBasis: string[];
  missingSeeding: string[];
  missingAssociationRank: string[];
};

const rankIndex = (
  ranking: ReturnType<typeof parseAssociationRanking>
): Map<string, { rank: number; coefficient: number | null }> => {
  const index = new Map<string, { rank: number; coefficient: number | null }>();
  for (const entry of ranking) {
    if (!index.has(entry.association)) {
      index.set(entry.association, { rank: entry.rank, coefficient: entry.coefficient });
    }
  }
  return index;
};

export const buildSeason = (
  source: UeclSource,
  qualHtml: string,
  mainHtml: string
): { rows: CohortRow[]; ledger: SeasonLedger } => {
  const mainPath = parseTeamEntries(qualHtml, "main");
  const championsPath = parseTeamEntries(qualHtml, "champions");
  const q2Entries = mainPath.filter((team) => team.entryRound === "Q2");
  // Only a marker naming another competition means the club took a different
  // road to this round. Other footnotes are notes about the same berth: in
  // 2025/26 a dagger on Kosice records that they replaced DAC Dunajska Streda
  // after the draw, which is still a club entering here, and excluding it on
  // the presence of any footnote would have dropped a valid observation.
  const transferred = (team: (typeof q2Entries)[number]): string | null =>
    team.markers.find((marker) => /^(UEL|UCL) /.test(marker)) ?? null;
  const transfers = q2Entries.filter((team) => transferred(team) !== null);
  const direct = q2Entries.filter((team) => transferred(team) === null);

  const seeding = parseSecondRoundSeeding(qualHtml);
  const basis = parseDomesticBasis(mainHtml);
  const ranking = rankIndex(parseAssociationRanking(mainHtml));

  // Two independent readings of the same outcome: the qualifying article
  // shades a club green once it reaches the main phase, and the competition
  // article lists the clubs that played there. The season in progress has no
  // standings yet, so the second reading can be absent - never contradictory.
  const standings = parseLeaguePhaseClubs(mainHtml);
  const disagreements = standings
    ? direct.filter((team) => team.reachedLeaguePhase !== standings.has(team.articleKey))
    : [];
  if (disagreements.length > 0) {
    throw new Error(
      `${source.season}: the qualifying article and the standings disagree on ${disagreements
        .map((team) => team.club)
        .join(", ")}`
    );
  }

  const rows: CohortRow[] = direct.map((team) => {
    const association = ranking.get(team.association) ?? null;
    return {
      season: source.season,
      format: source.format,
      club: team.club,
      articleKey: team.articleKey,
      association: team.association,
      associationRank: association?.rank ?? null,
      associationCoefficient: association?.coefficient ?? null,
      domesticBasis: basis.get(team.articleKey) ?? null,
      seeded: seeding.get(team.articleKey) ?? null,
      clubCoefficient: team.clubCoefficient,
      entryNote: team.markers.join("+") || null,
      reachedLeaguePhase: team.reachedLeaguePhase,
    };
  });

  const q2MainPathTeams = parseRoundParticipants(qualHtml, "Summary_2", "Matches_2").filter(
    (participant) => participant.path === "main"
  ).length;

  const advanced = [...mainPath, ...championsPath].filter((team) => team.reachedLeaguePhase).length;
  const directEntrants = parseDirectMainPhaseEntrants(mainHtml).size;
  if (advanced + directEntrants !== source.mainPhaseClubs) {
    throw new Error(
      `${source.season}: ${advanced} play-off winners plus ${directEntrants} direct entrants is not ${source.mainPhaseClubs}`
    );
  }
  if (standings && standings.size !== source.mainPhaseClubs) {
    throw new Error(
      `${source.season}: standings hold ${standings.size} clubs, expected ${source.mainPhaseClubs}`
    );
  }

  for (const crossCheck of UECL_CROSS_CHECKS.filter((entry) => entry.season === source.season)) {
    const observed =
      crossCheck.check === "q2MainPathTeams" ? q2MainPathTeams : advanced + directEntrants;
    if (observed !== crossCheck.value) {
      throw new Error(
        `${source.season}: UEFA states ${crossCheck.check} = ${crossCheck.value}, parsed ${observed} (${crossCheck.url})`
      );
    }
  }

  return {
    rows,
    ledger: {
      season: source.season,
      q2Entries: q2Entries.length,
      excludedTransfers: transfers.map((team) => ({
        club: team.club,
        marker: transferred(team) ?? "",
      })),
      excludedChampionsPath: championsPath.filter((team) => team.entryRound === "Q2").length,
      cohort: rows.length,
      q2MainPathTeams,
      mainPhaseClubs: advanced + directEntrants,
      missingDomesticBasis: rows.filter((row) => row.domesticBasis === null).map((row) => row.club),
      missingSeeding: rows.filter((row) => row.seeded === null).map((row) => row.club),
      missingAssociationRank: rows
        .filter((row) => row.associationRank === null)
        .map((row) => row.club),
    },
  };
};

export const COHORT_COLUMNS = [
  "season",
  "format",
  "club",
  "articleKey",
  "association",
  "associationRank",
  "associationCoefficient",
  "domesticBasis",
  "seeded",
  "clubCoefficient",
  "entryNote",
  "reachedLeaguePhase",
] as const;

const field = (value: string | number | boolean | null): string => {
  if (value === null) return "";
  const text = typeof value === "boolean" ? (value ? "1" : "0") : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (rows: readonly CohortRow[]): string =>
  [
    COHORT_COLUMNS.join(","),
    ...rows.map((row) => COHORT_COLUMNS.map((column) => field(row[column])).join(",")),
  ].join("\n");

/**
 * A by-product worth keeping: the clubs themselves.
 *
 * The game's `FOREIGN_CLUBS` list (src/data/foreign-clubs.ts) is 24 clubs with
 * documented tiers, used as buyers and destinations when a player leaves. This
 * roster is raw material for a wider one, and NOT a drop-in replacement.
 *
 * What it actually is: the clubs of this cohort, which is an ACCESS-LIST
 * POSITION rather than a class of club. It therefore spans coefficients from
 * 1.3 to 63.8 across 44 associations with a median of 6.5 - Ajax and Basel sit
 * beside UNA Strassen - and it is skewed low, so swapping it in wholesale
 * would weaken the destinations rather than enrich them. It also contains
 * Polish clubs, which a "foreign" list has to filter out, and membership is
 * conditioned on outcome: a club is here because its league and finish handed
 * it this round that year.
 *
 * THE COEFFICIENT IS NOT THE GAME'S `strength`, though it is a legitimate
 * predictor of the outcome: it is fixed before the season, and the Q2 seeding
 * is derived from it. What it is not is an equivalent of squad strength - it
 * records five years of European results on a scale of its own, where
 * `strength` is a mean OVR over the XI and the bench. No conversion between
 * them exists, and building one is the open question this whole audit stops
 * short of. Ship this as reference data; do not feed it to `edge`.
 */
type ClubProfile = {
  club: string;
  articleKey: string;
  association: string;
  appearances: number;
  /** Highest coefficient the club carried across the seasons observed. */
  peakCoefficient: number | null;
  latestCoefficient: number | null;
  latestSeason: string;
  /** How often this club reached the main phase from this round. */
  advanced: number;
};

export const clubProfiles = (rows: readonly CohortRow[]): ClubProfile[] => {
  const profiles = new Map<string, ClubProfile>();
  for (const row of [...rows].sort((a, b) => a.season.localeCompare(b.season))) {
    const existing = profiles.get(row.articleKey);
    const peak =
      row.clubCoefficient === null
        ? (existing?.peakCoefficient ?? null)
        : Math.max(row.clubCoefficient, existing?.peakCoefficient ?? row.clubCoefficient);
    profiles.set(row.articleKey, {
      club: row.club,
      articleKey: row.articleKey,
      association: row.association,
      appearances: (existing?.appearances ?? 0) + 1,
      peakCoefficient: peak,
      latestCoefficient: row.clubCoefficient ?? existing?.latestCoefficient ?? null,
      latestSeason: row.season,
      advanced: (existing?.advanced ?? 0) + (row.reachedLeaguePhase ? 1 : 0),
    });
  }
  return [...profiles.values()].sort(
    (a, b) => (b.peakCoefficient ?? 0) - (a.peakCoefficient ?? 0) || a.club.localeCompare(b.club)
  );
};

const CLUB_COLUMNS = [
  "club",
  "articleKey",
  "association",
  "appearances",
  "peakCoefficient",
  "latestCoefficient",
  "latestSeason",
  "advanced",
] as const;

export const clubsToCsv = (profiles: readonly ClubProfile[]): string =>
  [
    CLUB_COLUMNS.join(","),
    ...profiles.map((profile) => CLUB_COLUMNS.map((column) => field(profile[column])).join(",")),
  ].join("\n");
