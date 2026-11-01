/**
 * Where the Conference League qualifying benchmark comes from, pinned.
 *
 * SOURCE TIER MATTERS AND IS RECORDED PER PAGE. UEFA is the primary source
 * for what actually happened, but two things this measurement needs are not
 * reachable there: the access list (documents.uefa.com serves the season
 * folder but not the annex) and the association ranking (uefa.com renders it
 * with a script, kassiesa.net answers 403). Both are therefore taken from
 * Wikipedia and marked `secondary`, with the exact revision pinned, and both
 * are validated against UEFA output that IS reachable - see CROSS_CHECKS.
 *
 * Nothing in this repository fetches these pages. `pnpm data:parse-uecl`
 * reads local copies and refuses to run without them, exactly as
 * scripts/rsssf-parse.ts does, so a rebuild cannot silently pick up a page
 * that has been edited since.
 */

/** Primary means UEFA itself. Nothing in this manifest is primary yet - the
 * two things this measurement needs are not machine-reachable there - and the
 * distinction is kept in the type so a future primary source can be added
 * without changing the shape of the file. */
type SourceTier = "primary" | "secondary";

export type UeclSource = {
  season: string;
  /** How the main phase was played: 36-club league phase from 2024/25, a
   * 32-club group stage before it. Three qualifying ties either way, which is
   * what makes the older seasons comparable at all - but the number of places
   * on the other side of them changed, so the report keeps them apart. */
  format: "leaguePhase36" | "groupStage32";
  mainPhaseClubs: 32 | 36;
  qualifying: { url: string; revision: number; tier: SourceTier };
  competition: { url: string; revision: number; tier: SourceTier };
};

export const UECL_ACCESSED_AT = "2026-09-02";

export const UECL_SOURCES: readonly UeclSource[] = [
  {
    season: "2021-22",
    format: "groupStage32",
    mainPhaseClubs: 32,
    qualifying: {
      url: "https://en.wikipedia.org/wiki/2021%E2%80%9322_UEFA_Europa_Conference_League_qualifying_phase_and_play-off_round",
      revision: 1304428801,
      tier: "secondary",
    },
    competition: {
      url: "https://en.wikipedia.org/wiki/2021%E2%80%9322_UEFA_Europa_Conference_League",
      revision: 1371439259,
      tier: "secondary",
    },
  },
  {
    season: "2022-23",
    format: "groupStage32",
    mainPhaseClubs: 32,
    qualifying: {
      url: "https://en.wikipedia.org/wiki/2022%E2%80%9323_UEFA_Europa_Conference_League_qualifying_phase_and_play-off_round",
      revision: 1304425445,
      tier: "secondary",
    },
    competition: {
      url: "https://en.wikipedia.org/wiki/2022%E2%80%9323_UEFA_Europa_Conference_League",
      revision: 1368163699,
      tier: "secondary",
    },
  },
  {
    season: "2023-24",
    format: "groupStage32",
    mainPhaseClubs: 32,
    qualifying: {
      url: "https://en.wikipedia.org/wiki/2023%E2%80%9324_UEFA_Europa_Conference_League_qualifying_phase_and_play-off_round",
      revision: 1304428898,
      tier: "secondary",
    },
    competition: {
      url: "https://en.wikipedia.org/wiki/2023%E2%80%9324_UEFA_Europa_Conference_League",
      revision: 1368163718,
      tier: "secondary",
    },
  },
  {
    season: "2024-25",
    format: "leaguePhase36",
    mainPhaseClubs: 36,
    qualifying: {
      url: "https://en.wikipedia.org/wiki/2024%E2%80%9325_UEFA_Conference_League_qualifying_phase_and_play-off_round",
      revision: 1333497489,
      tier: "secondary",
    },
    competition: {
      url: "https://en.wikipedia.org/wiki/2024%E2%80%9325_UEFA_Conference_League",
      revision: 1372673954,
      tier: "secondary",
    },
  },
  {
    season: "2025-26",
    format: "leaguePhase36",
    mainPhaseClubs: 36,
    qualifying: {
      url: "https://en.wikipedia.org/wiki/2025%E2%80%9326_UEFA_Conference_League_qualifying_phase_and_play-off_round",
      revision: 1366326782,
      tier: "secondary",
    },
    competition: {
      url: "https://en.wikipedia.org/wiki/2025%E2%80%9326_UEFA_Conference_League",
      revision: 1372807544,
      tier: "secondary",
    },
  },
  {
    season: "2026-27",
    format: "leaguePhase36",
    mainPhaseClubs: 36,
    qualifying: {
      url: "https://en.wikipedia.org/wiki/2026%E2%80%9327_UEFA_Conference_League_qualifying_phase_and_play-off_round",
      revision: 1371789645,
      tier: "secondary",
    },
    competition: {
      url: "https://en.wikipedia.org/wiki/2026%E2%80%9327_UEFA_Conference_League",
      revision: 1372674186,
      tier: "secondary",
    },
  },
];

export type CrossCheck = {
  season: string;
  /** What UEFA itself published, transcribed from the page named below. */
  statement: string;
  url: string;
  /** The parsed quantity this pins down, checked by the parser. */
  check: "q2MainPathTeams" | "leaguePhaseClubs";
  value: number;
};

/**
 * UEFA's own numbers, used to check the secondary source rather than to
 * replace it. Each one is a sentence UEFA published, not a derived figure:
 * if the parser disagrees with any of them, the build fails.
 */
export const UECL_CROSS_CHECKS: readonly CrossCheck[] = [
  {
    season: "2024-25",
    statement:
      "86 teams played in the second qualifying round Main Path (55 entering at this stage, 25 first-qualifying-round winners, six from the Europa League first qualifying round main path)",
    url: "https://www.uefa.com/uefaconferenceleague/news/028e-1b0f4308db4a-ea117723be2f-1000--uefa-conference-league-second-qualifying-round-draw/",
    check: "q2MainPathTeams",
    value: 86,
  },
  {
    season: "2024-25",
    statement: "Conference League league phase draw: all 36 teams learn their opponents",
    url: "https://www.uefa.com/uefaconferenceleague/news/0290-1bbc58786450-9f803690829b-1000--conference-league-league-phase-draw-all-36-teams-learn-their/",
    check: "leaguePhaseClubs",
    value: 36,
  },
];
