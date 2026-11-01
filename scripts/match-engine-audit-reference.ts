import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sortStandings } from "../src/logic/league";
import { parseCsvLine } from "./csv";
import { EKSTRAKLASA_SOURCES } from "./data/ekstraklasa-sources";
import { mean, quantile, sampleStandardDeviation, standardError, summarize } from "./stats";
import { at } from "../src/logic/invariant";

/** One club's line in a real league table, transcribed exactly as the source
 * prints it. The ORDER of the array is not load-bearing - orderOf() sorts it. */
export type EkstraklasaTableRow = {
  club: string;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export type EkstraklasaSeasonReference = {
  season: string;
  matches: number;
  goals: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  promotedClubs: number;
  promotedChampion: boolean;
  previousChampionRelegated: boolean;
  round17Table: readonly EkstraklasaTableRow[];
  finalTable: readonly EkstraklasaTableRow[];
  sources: readonly string[];
};

/**
 * Five completed Ekstraklasa seasons, pinned so repeated audits are offline
 * and reviewable. Final tables come from RSSSF; the round-17 tables from
 * Transfermarkt, which is the only source that publishes half-way standings
 * for all five; aggregate result counts are cross-checked against Soccer
 * Association.
 *
 * Every club carries its points and goals, and the finishing ORDER is
 * computed from them - see orderOf() below for why that matters.
 */
export const EKSTRAKLASA_REFERENCE: readonly EkstraklasaSeasonReference[] = [
  {
    season: "2021/22",
    matches: 306,
    goals: 818,
    homeWins: 135,
    draws: 84,
    awayWins: 87,
    promotedClubs: 3,
    promotedChampion: false,
    previousChampionRelegated: false,
    round17Table: [
      { club: "Lech", goalsFor: 34, goalsAgainst: 10, points: 38 },
      { club: "Pogon", goalsFor: 32, goalsAgainst: 13, points: 35 },
      { club: "Lechia", goalsFor: 32, goalsAgainst: 20, points: 33 },
      { club: "Rakow", goalsFor: 30, goalsAgainst: 22, points: 29 },
      { club: "Radomiak", goalsFor: 23, goalsAgainst: 15, points: 29 },
      { club: "GornikZ", goalsFor: 24, goalsAgainst: 22, points: 27 },
      { club: "Slask", goalsFor: 29, goalsAgainst: 26, points: 24 },
      { club: "StalM", goalsFor: 24, goalsAgainst: 25, points: 24 },
      { club: "WislaP", goalsFor: 27, goalsAgainst: 26, points: 23 },
      { club: "Cracovia", goalsFor: 23, goalsAgainst: 24, points: 23 },
      { club: "Piast", goalsFor: 25, goalsAgainst: 24, points: 22 },
      { club: "Jagiellonia", goalsFor: 22, goalsAgainst: 25, points: 21 },
      { club: "WislaK", goalsFor: 17, goalsAgainst: 28, points: 18 },
      { club: "Legia", goalsFor: 23, goalsAgainst: 27, points: 18 },
      { club: "Zaglebie", goalsFor: 17, goalsAgainst: 33, points: 17 },
      { club: "Warta", goalsFor: 11, goalsAgainst: 22, points: 12 },
      { club: "Termalica", goalsFor: 21, goalsAgainst: 32, points: 12 },
      { club: "GornikL", goalsFor: 15, goalsAgainst: 35, points: 12 },
    ],
    finalTable: [
      { club: "Lech", goalsFor: 67, goalsAgainst: 24, points: 74 },
      { club: "Rakow", goalsFor: 60, goalsAgainst: 30, points: 69 },
      { club: "Pogon", goalsFor: 63, goalsAgainst: 31, points: 65 },
      { club: "Lechia", goalsFor: 52, goalsAgainst: 39, points: 57 },
      { club: "Piast", goalsFor: 45, goalsAgainst: 37, points: 54 },
      { club: "WislaP", goalsFor: 48, goalsAgainst: 51, points: 48 },
      { club: "Radomiak", goalsFor: 42, goalsAgainst: 40, points: 48 },
      { club: "GornikZ", goalsFor: 55, goalsAgainst: 55, points: 47 },
      { club: "Cracovia", goalsFor: 40, goalsAgainst: 42, points: 46 },
      { club: "Legia", goalsFor: 46, goalsAgainst: 48, points: 43 },
      { club: "Warta", goalsFor: 35, goalsAgainst: 38, points: 42 },
      { club: "Jagiellonia", goalsFor: 39, goalsAgainst: 50, points: 40 },
      { club: "Zaglebie", goalsFor: 43, goalsAgainst: 59, points: 38 },
      { club: "StalM", goalsFor: 39, goalsAgainst: 52, points: 37 },
      { club: "Slask", goalsFor: 42, goalsAgainst: 52, points: 35 },
      { club: "Termalica", goalsFor: 36, goalsAgainst: 56, points: 32 },
      { club: "WislaK", goalsFor: 37, goalsAgainst: 54, points: 31 },
      { club: "GornikL", goalsFor: 29, goalsAgainst: 60, points: 28 },
    ],
    sources: [
      "https://www.rsssf.org/tablesp/pol2022.html",
      "https://www.soccerassociation.com/28/2122/index0.htm",
      "https://www.transfermarkt.pl/pko-ekstraklasa/spieltagtabelle/wettbewerb/PL1/saison_id/2021/spieltag/17",
    ],
  },
  {
    season: "2022/23",
    matches: 306,
    goals: 758,
    homeWins: 129,
    draws: 81,
    awayWins: 96,
    promotedClubs: 3,
    promotedChampion: false,
    previousChampionRelegated: false,
    round17Table: [
      { club: "Rakow", goalsFor: 35, goalsAgainst: 12, points: 41 },
      { club: "Legia", goalsFor: 24, goalsAgainst: 19, points: 32 },
      { club: "Lech", goalsFor: 22, goalsAgainst: 17, points: 29 },
      { club: "Pogon", goalsFor: 29, goalsAgainst: 25, points: 29 },
      { club: "Widzew", goalsFor: 22, goalsAgainst: 17, points: 29 },
      { club: "WislaP", goalsFor: 29, goalsAgainst: 24, points: 28 },
      { club: "StalM", goalsFor: 25, goalsAgainst: 22, points: 27 },
      { club: "Warta", goalsFor: 18, goalsAgainst: 16, points: 25 },
      { club: "Cracovia", goalsFor: 18, goalsAgainst: 12, points: 25 },
      { club: "Radomiak", goalsFor: 21, goalsAgainst: 23, points: 23 },
      { club: "Slask", goalsFor: 17, goalsAgainst: 22, points: 21 },
      { club: "GornikZ", goalsFor: 26, goalsAgainst: 28, points: 20 },
      { club: "Jagiellonia", goalsFor: 25, goalsAgainst: 26, points: 18 },
      { club: "Lechia", goalsFor: 18, goalsAgainst: 30, points: 17 },
      { club: "Zaglebie", goalsFor: 13, goalsAgainst: 27, points: 17 },
      { club: "Piast", goalsFor: 18, goalsAgainst: 22, points: 16 },
      { club: "Miedz", goalsFor: 20, goalsAgainst: 29, points: 13 },
      { club: "Korona", goalsFor: 17, goalsAgainst: 26, points: 13 },
    ],
    finalTable: [
      { club: "Rakow", goalsFor: 63, goalsAgainst: 24, points: 75 },
      { club: "Legia", goalsFor: 57, goalsAgainst: 37, points: 66 },
      { club: "Lech", goalsFor: 51, goalsAgainst: 29, points: 61 },
      { club: "Pogon", goalsFor: 57, goalsAgainst: 46, points: 60 },
      { club: "Piast", goalsFor: 40, goalsAgainst: 31, points: 53 },
      { club: "GornikZ", goalsFor: 45, goalsAgainst: 43, points: 48 },
      { club: "Cracovia", goalsFor: 41, goalsAgainst: 35, points: 46 },
      { club: "Warta", goalsFor: 37, goalsAgainst: 35, points: 45 },
      { club: "Zaglebie", goalsFor: 35, goalsAgainst: 44, points: 45 },
      { club: "Radomiak", goalsFor: 34, goalsAgainst: 41, points: 44 },
      { club: "StalM", goalsFor: 36, goalsAgainst: 40, points: 43 },
      { club: "Widzew", goalsFor: 38, goalsAgainst: 47, points: 41 },
      { club: "Korona", goalsFor: 39, goalsAgainst: 48, points: 41 },
      { club: "Jagiellonia", goalsFor: 48, goalsAgainst: 49, points: 41 },
      { club: "Slask", goalsFor: 35, goalsAgainst: 48, points: 38 },
      { club: "WislaP", goalsFor: 41, goalsAgainst: 50, points: 37 },
      { club: "Lechia", goalsFor: 28, goalsAgainst: 56, points: 30 },
      { club: "Miedz", goalsFor: 33, goalsAgainst: 55, points: 23 },
    ],
    sources: [
      "https://www.rsssf.org/tablesp/pol2023.html",
      "https://www.soccerassociation.com/28/2223/index0.htm",
      "https://www.transfermarkt.pl/pko-ekstraklasa/spieltagtabelle/wettbewerb/PL1/saison_id/2022/spieltag/17",
    ],
  },
  {
    season: "2023/24",
    matches: 306,
    goals: 823,
    homeWins: 133,
    draws: 93,
    awayWins: 80,
    promotedClubs: 3,
    promotedChampion: false,
    previousChampionRelegated: false,
    round17Table: [
      { club: "Slask", goalsFor: 29, goalsAgainst: 14, points: 37 },
      { club: "Jagiellonia", goalsFor: 38, goalsAgainst: 22, points: 34 },
      { club: "Lech", goalsFor: 30, goalsAgainst: 22, points: 32 },
      { club: "Rakow", goalsFor: 34, goalsAgainst: 18, points: 32 },
      { club: "Legia", goalsFor: 26, goalsAgainst: 22, points: 28 },
      { club: "Pogon", goalsFor: 29, goalsAgainst: 19, points: 26 },
      { club: "StalM", goalsFor: 24, goalsAgainst: 24, points: 24 },
      { club: "Zaglebie", goalsFor: 19, goalsAgainst: 27, points: 24 },
      { club: "Radomiak", goalsFor: 21, goalsAgainst: 20, points: 22 },
      { club: "GornikZ", goalsFor: 18, goalsAgainst: 20, points: 22 },
      { club: "Widzew", goalsFor: 21, goalsAgainst: 24, points: 22 },
      { club: "Piast", goalsFor: 15, goalsAgainst: 14, points: 21 },
      { club: "Cracovia", goalsFor: 20, goalsAgainst: 24, points: 20 },
      { club: "Warta", goalsFor: 17, goalsAgainst: 20, points: 18 },
      { club: "Korona", goalsFor: 19, goalsAgainst: 22, points: 17 },
      { club: "Puszcza", goalsFor: 20, goalsAgainst: 32, points: 16 },
      { club: "Ruch", goalsFor: 19, goalsAgainst: 31, points: 11 },
      { club: "LKS", goalsFor: 11, goalsAgainst: 35, points: 8 },
    ],
    finalTable: [
      { club: "Jagiellonia", goalsFor: 77, goalsAgainst: 45, points: 63 },
      { club: "Slask", goalsFor: 50, goalsAgainst: 31, points: 63 },
      { club: "Legia", goalsFor: 51, goalsAgainst: 39, points: 59 },
      { club: "Pogon", goalsFor: 59, goalsAgainst: 38, points: 55 },
      { club: "Lech", goalsFor: 47, goalsAgainst: 41, points: 53 },
      { club: "GornikZ", goalsFor: 45, goalsAgainst: 41, points: 53 },
      { club: "Rakow", goalsFor: 54, goalsAgainst: 39, points: 52 },
      { club: "Zaglebie", goalsFor: 43, goalsAgainst: 50, points: 47 },
      { club: "Widzew", goalsFor: 45, goalsAgainst: 46, points: 46 },
      { club: "Piast", goalsFor: 38, goalsAgainst: 35, points: 43 },
      { club: "StalM", goalsFor: 42, goalsAgainst: 48, points: 43 },
      { club: "Puszcza", goalsFor: 39, goalsAgainst: 49, points: 40 },
      { club: "Cracovia", goalsFor: 45, goalsAgainst: 46, points: 39 },
      { club: "Korona", goalsFor: 40, goalsAgainst: 44, points: 38 },
      { club: "Radomiak", goalsFor: 41, goalsAgainst: 58, points: 38 },
      { club: "Warta", goalsFor: 33, goalsAgainst: 43, points: 37 },
      { club: "Ruch", goalsFor: 40, goalsAgainst: 55, points: 32 },
      { club: "LKS", goalsFor: 34, goalsAgainst: 75, points: 24 },
    ],
    sources: [
      "https://www.rsssf.org/tablesp/pol2024.html",
      "https://www.soccerassociation.com/28/2324/index0.htm",
      "https://www.transfermarkt.pl/pko-ekstraklasa/spieltagtabelle/wettbewerb/PL1/saison_id/2023/spieltag/17",
    ],
  },
  {
    season: "2024/25",
    matches: 306,
    goals: 843,
    homeWins: 137,
    draws: 77,
    awayWins: 92,
    promotedClubs: 3,
    promotedChampion: false,
    previousChampionRelegated: false,
    round17Table: [
      { club: "Lech", goalsFor: 32, goalsAgainst: 12, points: 38 },
      { club: "Rakow", goalsFor: 23, goalsAgainst: 9, points: 35 },
      { club: "Jagiellonia", goalsFor: 31, goalsAgainst: 24, points: 34 },
      { club: "Cracovia", goalsFor: 36, goalsAgainst: 28, points: 30 },
      { club: "Legia", goalsFor: 33, goalsAgainst: 23, points: 29 },
      { club: "GornikZ", goalsFor: 24, goalsAgainst: 19, points: 27 },
      { club: "Motor", goalsFor: 25, goalsAgainst: 28, points: 27 },
      { club: "Pogon", goalsFor: 25, goalsAgainst: 21, points: 26 },
      { club: "Katowice", goalsFor: 26, goalsAgainst: 24, points: 22 },
      { club: "Widzew", goalsFor: 22, goalsAgainst: 24, points: 22 },
      { club: "Piast", goalsFor: 18, goalsAgainst: 18, points: 21 },
      { club: "Radomiak", goalsFor: 22, goalsAgainst: 25, points: 19 },
      { club: "StalM", goalsFor: 18, goalsAgainst: 22, points: 19 },
      { club: "Zaglebie", goalsFor: 16, goalsAgainst: 24, points: 19 },
      { club: "Puszcza", goalsFor: 16, goalsAgainst: 25, points: 17 },
      { club: "Korona", goalsFor: 15, goalsAgainst: 27, points: 17 },
      { club: "Lechia", goalsFor: 17, goalsAgainst: 33, points: 11 },
      { club: "Slask", goalsFor: 14, goalsAgainst: 27, points: 10 },
    ],
    finalTable: [
      { club: "Lech", goalsFor: 68, goalsAgainst: 31, points: 70 },
      { club: "Rakow", goalsFor: 51, goalsAgainst: 23, points: 69 },
      { club: "Jagiellonia", goalsFor: 56, goalsAgainst: 42, points: 61 },
      { club: "Pogon", goalsFor: 59, goalsAgainst: 40, points: 58 },
      { club: "Legia", goalsFor: 60, goalsAgainst: 45, points: 54 },
      { club: "Cracovia", goalsFor: 58, goalsAgainst: 53, points: 51 },
      { club: "Motor", goalsFor: 48, goalsAgainst: 59, points: 49 },
      { club: "Katowice", goalsFor: 49, goalsAgainst: 47, points: 49 },
      { club: "GornikZ", goalsFor: 43, goalsAgainst: 39, points: 47 },
      { club: "Piast", goalsFor: 37, goalsAgainst: 36, points: 45 },
      { club: "Korona", goalsFor: 37, goalsAgainst: 45, points: 45 },
      { club: "Radomiak", goalsFor: 48, goalsAgainst: 52, points: 41 },
      { club: "Widzew", goalsFor: 38, goalsAgainst: 49, points: 40 },
      { club: "Lechia", goalsFor: 44, goalsAgainst: 59, points: 37 },
      { club: "Zaglebie", goalsFor: 33, goalsAgainst: 51, points: 36 },
      { club: "StalM", goalsFor: 39, goalsAgainst: 56, points: 31 },
      { club: "Slask", goalsFor: 38, goalsAgainst: 53, points: 30 },
      { club: "Puszcza", goalsFor: 37, goalsAgainst: 63, points: 28 },
    ],
    sources: [
      "https://www.rsssf.org/tablesp/pol2025.html",
      "https://www.soccerassociation.com/28/2425/index0.htm",
      "https://umpire-esa-images-production.s3.eu-central-1.amazonaws.com/de5a136b-59d1-40ce-8b51-c043a004751b/Raport_Ekstraklasa_2024_25_wersja_angielska.pdf",
      "https://www.transfermarkt.pl/pko-ekstraklasa/spieltagtabelle/wettbewerb/PL1/saison_id/2024/spieltag/17",
    ],
  },
  {
    season: "2025/26",
    matches: 306,
    goals: 837,
    homeWins: 138,
    draws: 85,
    awayWins: 83,
    promotedClubs: 3,
    promotedChampion: false,
    previousChampionRelegated: false,
    round17Table: [
      { club: "Jagiellonia", goalsFor: 30, goalsAgainst: 20, points: 32 },
      { club: "GornikZ", goalsFor: 27, goalsAgainst: 19, points: 30 },
      { club: "WislaP", goalsFor: 20, goalsAgainst: 11, points: 29 },
      { club: "Cracovia", goalsFor: 23, goalsAgainst: 19, points: 26 },
      { club: "Rakow", goalsFor: 25, goalsAgainst: 23, points: 26 },
      { club: "Zaglebie", goalsFor: 29, goalsAgainst: 23, points: 25 },
      { club: "Radomiak", goalsFor: 33, goalsAgainst: 28, points: 25 },
      { club: "Lech", goalsFor: 27, goalsAgainst: 25, points: 25 },
      { club: "Korona", goalsFor: 20, goalsAgainst: 18, points: 23 },
      { club: "Motor", goalsFor: 23, goalsAgainst: 27, points: 21 },
      { club: "Widzew", goalsFor: 25, goalsAgainst: 26, points: 20 },
      { club: "Piast", goalsFor: 18, goalsAgainst: 19, points: 20 },
      { club: "Pogon", goalsFor: 26, goalsAgainst: 30, points: 20 },
      { club: "Katowice", goalsFor: 24, goalsAgainst: 29, points: 20 },
      { club: "Legia", goalsFor: 19, goalsAgainst: 19, points: 19 },
      { club: "Arka", goalsFor: 14, goalsAgainst: 32, points: 18 },
      { club: "Lechia", goalsFor: 32, goalsAgainst: 35, points: 17 },
      { club: "Termalica", goalsFor: 22, goalsAgainst: 34, points: 16 },
    ],
    finalTable: [
      { club: "Lech", goalsFor: 62, goalsAgainst: 45, points: 60 },
      { club: "GornikZ", goalsFor: 50, goalsAgainst: 38, points: 56 },
      { club: "Jagiellonia", goalsFor: 56, goalsAgainst: 41, points: 56 },
      { club: "Rakow", goalsFor: 51, goalsAgainst: 40, points: 55 },
      { club: "Katowice", goalsFor: 51, goalsAgainst: 45, points: 50 },
      { club: "Legia", goalsFor: 42, goalsAgainst: 37, points: 49 },
      { club: "Zaglebie", goalsFor: 45, goalsAgainst: 38, points: 48 },
      { club: "WislaP", goalsFor: 34, goalsAgainst: 38, points: 46 },
      { club: "Pogon", goalsFor: 47, goalsAgainst: 49, points: 45 },
      { club: "Radomiak", goalsFor: 52, goalsAgainst: 53, points: 44 },
      { club: "Korona", goalsFor: 40, goalsAgainst: 40, points: 43 },
      { club: "Motor", goalsFor: 46, goalsAgainst: 53, points: 43 },
      { club: "Cracovia", goalsFor: 39, goalsAgainst: 42, points: 42 },
      { club: "Widzew", goalsFor: 41, goalsAgainst: 41, points: 42 },
      { club: "Piast", goalsFor: 42, goalsAgainst: 46, points: 41 },
      { club: "Lechia", goalsFor: 62, goalsAgainst: 65, points: 38 },
      { club: "Arka", goalsFor: 34, goalsAgainst: 61, points: 36 },
      { club: "Termalica", goalsFor: 43, goalsAgainst: 65, points: 34 },
    ],
    sources: [
      "https://rsssf.org/tablesp/pol2026.html",
      "https://www.soccerassociation.com/28/2526/index0.htm",
      "https://www.transfermarkt.pl/pko-ekstraklasa/spieltagtabelle/wettbewerb/PL1/saison_id/2025/spieltag/17",
      "https://ekstraklasa.org/en/news/the-most-insane-season-in-years-summary/",
    ],
  },
] as const;

export type MatchOutcomeSeasonReference = {
  season: string;
  matches: number;
  goals: number;
  homeGoals: number;
  awayGoals: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  scorelines: {
    zeroZero: number;
    oneZero: number;
    zeroOne: number;
    oneOne: number;
    highDraws: number;
  };
  source: string;
};

/** One pinned result. The CSV is the source of truth; every aggregate below
 * is computed from it, so no figure here can be a transcription slip. */
export type PinnedResult = {
  season: string;
  round: number;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
};

const RESULTS_COLUMNS = ["season", "round", "home", "away", "homeGoals", "awayGoals"] as const;

/**
 * Resolved against this module, not the working directory: a path built from
 * process.cwd() makes the tests pass only when run from the repository root.
 *
 * Assembled with join() rather than `new URL("./data/...", import.meta.url)`,
 * which Vite rewrites into an asset URL at transform time - under Vitest that
 * form comes back as something fileURLToPath refuses.
 */
const RESULTS_CSV = join(
  dirname(fileURLToPath(import.meta.url)),
  "data",
  "ekstraklasa-results.csv"
);

const wholeNumber = (raw: string, column: string, line: number): number => {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`Column "${column}" on line ${line} is not a whole number: "${raw}"`);
  }
  return value;
};

/**
 * Reads scripts/data/ekstraklasa-results.csv and validates it on the way in:
 * the header, whole numbers where numbers belong, and no fixture appearing
 * twice. A duplicated row would inflate every aggregate downstream while
 * leaving each of them individually plausible - which is exactly how the
 * dropped Podbeskidzie rows went unnoticed, in the other direction.
 */
export const readPinnedResults = (): readonly PinnedResult[] => {
  const lines = readFileSync(RESULTS_CSV, "utf8").trim().split(/\r?\n/);
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  if (header.join(",") !== RESULTS_COLUMNS.join(",")) {
    throw new Error(`Unexpected results header: ${header.join(",")}`);
  }
  const rows = lines.slice(1).map((line, offset) => {
    const fields = parseCsvLine(line);
    const lineNumber = offset + 2;
    if (fields.length !== RESULTS_COLUMNS.length) {
      throw new Error(
        `Line ${lineNumber} has ${fields.length} fields, not ${RESULTS_COLUMNS.length}`
      );
    }
    const field = (index: number): string => at(fields, index, `results line ${lineNumber}`);
    return {
      season: field(0),
      round: wholeNumber(field(1), "round", lineNumber),
      home: field(2),
      away: field(3),
      homeGoals: wholeNumber(field(4), "homeGoals", lineNumber),
      awayGoals: wholeNumber(field(5), "awayGoals", lineNumber),
    };
  });
  const keys = new Set(rows.map((row) => `${row.season}|${row.round}|${row.home}|${row.away}`));
  if (keys.size !== rows.length) {
    throw new Error(`${rows.length - keys.size} fixtures appear more than once in the results CSV`);
  }
  return rows;
};

/** Chronological, because the season order is load-bearing for the reports. */
export const bySeason = (rows: readonly PinnedResult[]): Map<string, PinnedResult[]> => {
  const seasons = new Map<string, PinnedResult[]>();
  for (const row of rows) seasons.set(row.season, [...(seasons.get(row.season) ?? []), row]);
  return seasons;
};

/** Every season the CSV holds, oldest first. */
export const ALL_SEASONS: readonly string[] = EKSTRAKLASA_SOURCES.map((source) => source.season);

/** The pandemic season. Played behind closed doors, and it shows: home
 * advantage 0.275 pts/match against 0.463 across the seasons either side,
 * z = -2.13. Excluded for a reason that lives outside the model, which is
 * the only kind of reason that justifies dropping data. */
export const PANDEMIC_SEASON = "2020/21";

/**
 * The window the match engine's two lambda constants were fitted to.
 *
 * Nine seasons since 2026-08-28: everything the pinned results hold except
 * the pandemic one. It was eight until then, and the ninth was missing for
 * no reason at all - 2015/16 fell out of the old parser because Podbeskidzie
 * is twelve characters wide and filled the column, and the fault was blamed
 * on the source. The window was then frozen at eight on purpose, so that
 * repairing the data could not quietly move the target mid-repair. That
 * caution has served its purpose; the repair is measured and pinned.
 *
 * The obvious worry about re-admitting 2015/16 is that it carries the lowest
 * home advantage of any non-pandemic season (0.334 pts/match), so it might
 * be anomalous in its own right. It is not, by the same test 2020/21 fails:
 * z = -1.74, and 2022/23 - which never left the window - sits further out at
 * z = -1.88. Keeping it out would have been a rule applied to one season and
 * not to its neighbour.
 *
 * Narrowing or widening it again is a product decision, and
 * `pnpm audit:outcome-windows` reports what each alternative would cost.
 */
export const CALIBRATION_WINDOW: readonly string[] = ALL_SEASONS.filter(
  (season) => season !== PANDEMIC_SEASON
);

/**
 * Aggregates the pinned results into per-season match-outcome figures.
 *
 * This window is separate from EKSTRAKLASA_REFERENCE: match outcomes benefit
 * from the larger sample, while tables and half-season movement need the five
 * recent 18-club seasons and their complete standings.
 */
export const matchOutcomeReferenceFrom = (
  rows: readonly PinnedResult[],
  seasons: readonly string[]
): readonly MatchOutcomeSeasonReference[] => {
  const grouped = bySeason(rows);
  return seasons.map((season) => {
    const played = grouped.get(season);
    if (!played) throw new Error(`The results CSV holds no season "${season}"`);
    const count = (predicate: (_row: PinnedResult) => boolean): number =>
      played.filter(predicate).length;
    const source = EKSTRAKLASA_SOURCES.find((entry) => entry.season === season);
    if (!source) throw new Error(`No source page is recorded for season "${season}"`);
    return {
      season,
      matches: played.length,
      goals: played.reduce((total, row) => total + row.homeGoals + row.awayGoals, 0),
      homeGoals: played.reduce((total, row) => total + row.homeGoals, 0),
      awayGoals: played.reduce((total, row) => total + row.awayGoals, 0),
      homeWins: count((row) => row.homeGoals > row.awayGoals),
      draws: count((row) => row.homeGoals === row.awayGoals),
      awayWins: count((row) => row.homeGoals < row.awayGoals),
      scorelines: {
        zeroZero: count((row) => row.homeGoals === 0 && row.awayGoals === 0),
        oneZero: count((row) => row.homeGoals === 1 && row.awayGoals === 0),
        zeroOne: count((row) => row.homeGoals === 0 && row.awayGoals === 1),
        oneOne: count((row) => row.homeGoals === 1 && row.awayGoals === 1),
        highDraws: count((row) => row.homeGoals === row.awayGoals && row.homeGoals >= 2),
      },
      source: source.url,
    };
  });
};

/**
 * The eight seasons the lambdas are calibrated against, derived rather than
 * transcribed. Two fingerprint tests pin the totals - one for this window and
 * one for all ten seasons - so a change in the data cannot slip through
 * unnoticed, and no aggregate has to be typed by hand ever again.
 */
export const MATCH_OUTCOME_REFERENCE: readonly MatchOutcomeSeasonReference[] =
  matchOutcomeReferenceFrom(readPinnedResults(), CALIBRATION_WINDOW);

/** Summary of independent observations. `sd` is the sample standard
 * deviation and `se` is the standard error of the mean. */
export type MetricEstimate = {
  n: number;
  mean: number;
  sd: number;
  se: number;
};

/**
 * A pinned table, ordered the way the GAME orders one - never the way the
 * source happened to print it.
 *
 * This is the whole reason the tables carry points and goals instead of a
 * list of names. The real league breaks ties on head-to-head results, which
 * this game has no notion of, so the two orders genuinely differ: in 2021/22
 * Wisla Plock finished sixth ahead of Radomiak on head-to-head, while by goal
 * difference Radomiak is sixth. Pinning only the order left nobody able to
 * tell a deliberate difference from a transcription slip - and the slip would
 * have moved a benchmark the engine is tuned against.
 *
 * The name comparison at the end of sortStandings is not decoration here: in
 * 2022/23 after round 17, Lech and Widzew are level on points, goal
 * difference AND goals scored, so their order is decided by nothing else.
 */
const orderOf = (table: readonly EkstraklasaTableRow[]): string[] =>
  sortStandings(
    table.map((row) => ({
      club: row.club,
      points: row.points,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
    }))
  ).map((row) => row.club);

export const finalOrder = (season: EkstraklasaSeasonReference): string[] =>
  orderOf(season.finalTable);

export const round17Order = (season: EkstraklasaSeasonReference): string[] =>
  orderOf(season.round17Table);

/** Points, highest first. Derived, so it can never disagree with the table. */
export const finalPoints = (season: EkstraklasaSeasonReference): number[] =>
  season.finalTable.map((row) => row.points).sort((a, b) => b - a);

export const estimate = (values: readonly number[]): MetricEstimate => ({
  n: values.length,
  mean: mean(values),
  sd: sampleStandardDeviation(values),
  se: standardError(values),
});

/** One independent rate per season; mean, SD and SE share one estimand. */
const seasonRateEstimate = (
  seasons: readonly MatchOutcomeSeasonReference[],
  numerator: (_season: MatchOutcomeSeasonReference) => number
): MetricEstimate => estimate(seasons.map((season) => numerator(season) / season.matches));

const poissonProbability = (goals: number, lambda: number): number => {
  let probability = Math.exp(-lambda);
  for (let index = 1; index <= goals; index += 1) probability = (probability * lambda) / index;
  return probability;
};

type PoissonComparison = { observed: number; expected: number; z: number };

const poissonComparison = (
  seasons: readonly MatchOutcomeSeasonReference[],
  observed: (_season: MatchOutcomeSeasonReference) => number,
  probability: (_homeLambda: number, _awayLambda: number) => number
): PoissonComparison => {
  let observedTotal = 0;
  let expectedTotal = 0;
  let variance = 0;
  for (const season of seasons) {
    const homeLambda = season.homeGoals / season.matches;
    const awayLambda = season.awayGoals / season.matches;
    const p = probability(homeLambda, awayLambda);
    observedTotal += observed(season);
    expectedTotal += season.matches * p;
    variance += season.matches * p * (1 - p);
  }
  return {
    observed: observedTotal,
    expected: expectedTotal,
    z: (observedTotal - expectedTotal) / Math.sqrt(variance),
  };
};

const drawProbability = (homeLambda: number, awayLambda: number): number => {
  let probability = 0;
  for (let goals = 0; goals <= 20; goals += 1) {
    probability += poissonProbability(goals, homeLambda) * poissonProbability(goals, awayLambda);
  }
  return probability;
};

export const summarizeMatchOutcomeReference = (seasons: readonly MatchOutcomeSeasonReference[]) => {
  if (seasons.length === 0) throw new Error("Match outcome reference is empty");
  const sum = (value: (_season: MatchOutcomeSeasonReference) => number): number =>
    seasons.reduce((total, season) => total + value(season), 0);
  const scorelines = {
    zeroZero: sum((season) => season.scorelines.zeroZero),
    oneZero: sum((season) => season.scorelines.oneZero),
    zeroOne: sum((season) => season.scorelines.zeroOne),
    oneOne: sum((season) => season.scorelines.oneOne),
    highDraws: sum((season) => season.scorelines.highDraws),
  };
  const matches = sum((season) => season.matches);
  const pooled = {
    goalsPerMatch: sum((season) => season.goals) / matches,
    homeGoalsPerMatch: sum((season) => season.homeGoals) / matches,
    awayGoalsPerMatch: sum((season) => season.awayGoals) / matches,
    homeWinRate: sum((season) => season.homeWins) / matches,
    drawRate: sum((season) => season.draws) / matches,
    awayWinRate: sum((season) => season.awayWins) / matches,
    homePointAdvantage: sum((season) => 3 * (season.homeWins - season.awayWins)) / matches,
  };
  const cell =
    (homeGoals: number, awayGoals: number) =>
    (homeLambda: number, awayLambda: number): number =>
      poissonProbability(homeGoals, homeLambda) * poissonProbability(awayGoals, awayLambda);
  return {
    seasons: seasons.length,
    matches,
    goals: sum((season) => season.goals),
    homeGoals: sum((season) => season.homeGoals),
    awayGoals: sum((season) => season.awayGoals),
    homeWins: sum((season) => season.homeWins),
    draws: sum((season) => season.draws),
    awayWins: sum((season) => season.awayWins),
    pooled,
    goalsPerMatch: seasonRateEstimate(seasons, (season) => season.goals),
    homeGoalsPerMatch: seasonRateEstimate(seasons, (season) => season.homeGoals),
    awayGoalsPerMatch: seasonRateEstimate(seasons, (season) => season.awayGoals),
    homeWinRate: seasonRateEstimate(seasons, (season) => season.homeWins),
    drawRate: seasonRateEstimate(seasons, (season) => season.draws),
    awayWinRate: seasonRateEstimate(seasons, (season) => season.awayWins),
    homePointsPerMatch: seasonRateEstimate(seasons, (season) => 3 * season.homeWins + season.draws),
    awayPointsPerMatch: seasonRateEstimate(seasons, (season) => 3 * season.awayWins + season.draws),
    homePointAdvantage: seasonRateEstimate(
      seasons,
      (season) => 3 * (season.homeWins - season.awayWins)
    ),
    scorelines,
    seasonMeanPoisson: {
      zeroZero: poissonComparison(seasons, (season) => season.scorelines.zeroZero, cell(0, 0)),
      oneZero: poissonComparison(seasons, (season) => season.scorelines.oneZero, cell(1, 0)),
      zeroOne: poissonComparison(seasons, (season) => season.scorelines.zeroOne, cell(0, 1)),
      oneOne: poissonComparison(seasons, (season) => season.scorelines.oneOne, cell(1, 1)),
      draws: poissonComparison(seasons, (season) => season.draws, drawProbability),
      highDraws: poissonComparison(
        seasons,
        (season) => season.scorelines.highDraws,
        (homeLambda, awayLambda) =>
          drawProbability(homeLambda, awayLambda) -
          cell(0, 0)(homeLambda, awayLambda) -
          cell(1, 1)(homeLambda, awayLambda)
      ),
    },
  };
};

const retention = (before: readonly string[], after: readonly string[], count: number): number => {
  const selected = new Set(before.slice(0, count));
  return after.slice(0, count).filter((club) => selected.has(club)).length / count;
};

const bottomRetention = (
  before: readonly string[],
  after: readonly string[],
  count: number
): number => {
  const selected = new Set(before.slice(-count));
  return after.slice(-count).filter((club) => selected.has(club)).length / count;
};

const absoluteMoves = (before: readonly string[], after: readonly string[]): number[] => {
  const afterPlace = new Map(after.map((club, index) => [club, index + 1]));
  return before.map((club, index) => Math.abs(index + 1 - (afterPlace.get(club) ?? 0)));
};

const binaryReferenceEstimate = (values: readonly boolean[]): MetricEstimate =>
  estimate(values.map((value) => (value ? 1 : 0)));

export const summarizeEkstraklasaReference = (seasons: readonly EkstraklasaSeasonReference[]) => {
  if (seasons.length === 0) throw new Error("Ekstraklasa reference is empty");
  const champion = seasons.map((season) => at(finalPoints(season), 0, "champion points"));
  const last = seasons.map((season) => finalPoints(season).at(-1)!);
  const spread = champion.map((points, index) => points - at(last, index, "last-place points"));
  return {
    seasons: seasons.length,
    matches: seasons.reduce((sum, season) => sum + season.matches, 0),
    goals: seasons.reduce((sum, season) => sum + season.goals, 0),
    homeWins: seasons.reduce((sum, season) => sum + season.homeWins, 0),
    draws: seasons.reduce((sum, season) => sum + season.draws, 0),
    awayWins: seasons.reduce((sum, season) => sum + season.awayWins, 0),
    championPoints: estimate(champion),
    lastPoints: estimate(last),
    pointSpread: estimate(spread),
    promotedChampion: binaryReferenceEstimate(seasons.map((season) => season.promotedChampion)),
    promotedClubTitleRate: estimate(
      seasons.map((season) => (season.promotedChampion ? 1 : 0) / season.promotedClubs)
    ),
    promotedClubExposures: seasons.reduce((sum, season) => sum + season.promotedClubs, 0),
    previousChampionRelegated: binaryReferenceEstimate(
      seasons.map((season) => season.previousChampionRelegated)
    ),
    tableQuartiles: {
      p25: estimate(seasons.map((season) => quantile(finalPoints(season), 0.25))),
      median: estimate(seasons.map((season) => quantile(finalPoints(season), 0.5))),
      p75: estimate(seasons.map((season) => quantile(finalPoints(season), 0.75))),
      sd: estimate(seasons.map((season) => sampleStandardDeviation(finalPoints(season)))),
    },
    halfToFinal: {
      meanAbsoluteMove: estimate(
        seasons.map((season) => mean(absoluteMoves(round17Order(season), finalOrder(season))))
      ),
      p90AbsoluteMove: estimate(
        seasons.map((season) =>
          quantile(absoluteMoves(round17Order(season), finalOrder(season)), 0.9)
        )
      ),
      topFourRetention: estimate(
        seasons.map((season) => retention(round17Order(season), finalOrder(season), 4))
      ),
      bottomThreeRetention: estimate(
        seasons.map((season) => bottomRetention(round17Order(season), finalOrder(season), 3))
      ),
    },
    allPointValues: summarize(seasons.flatMap((season) => finalPoints(season))),
  };
};
