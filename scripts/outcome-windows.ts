import { writeFileSync } from "node:fs";

import { MATCH_BASE_GOALS, MATCH_HOME_ADVANTAGE } from "../src/data/balance";
import { renderTable, type TableFormat } from "./balance-report";
import { parseFlags } from "./cli-args";
import { calibratedLambdaFit } from "./match-engine-audit-core";
import {
  ALL_SEASONS,
  CALIBRATION_WINDOW,
  PANDEMIC_SEASON,
  matchOutcomeReferenceFrom,
  readPinnedResults,
  summarizeMatchOutcomeReference,
  type MatchOutcomeSeasonReference,
} from "./match-engine-audit-reference";
import { mean, sampleStandardDeviation } from "./stats";

/**
 * Says what each candidate window of real seasons would imply, WITHOUT moving
 * the one the engine is calibrated against.
 *
 * The eight-season window was never a measurement result: until 2026-08-26 it
 * was simply whatever the old parser managed to read. The data now covers ten
 * seasons, so the range of the data and the range of the calibration are two
 * separate questions. This tool answers the second one in numbers.
 *
 * On 2026-08-28 the product owner answered it: the window is nine seasons,
 * everything but the pandemic one. The tool keeps reporting all three,
 * including the retired eight-season range, so that reverting the decision
 * costs a command rather than an archaeology session.
 *
 * A report nobody can regenerate is a screenshot, which is why this is a
 * command and not a note.
 */

type Cli = { md: string | null };

const KNOWN_FLAGS = ["--md"];

/** Frozen decision 5: |z| > 2 is described as an outlier, |z| <= 2 is not. */
const OUTLIER_Z = 2;

const pl = (value: number, digits: number): string => value.toFixed(digits).replace(".", ",");
const percent = (fraction: number): string => `${pl(fraction * 100, 2)}%`;

type Window = { label: string; seasons: readonly string[] };

const RETIRED_WINDOW: readonly string[] = ALL_SEASONS.filter(
  (season) => season !== PANDEMIC_SEASON && season !== "2015/16"
);

const windowsToCompare = (): Window[] => [
  {
    label: `dziewięć sezonów (okno kalibracji, bez ${PANDEMIC_SEASON})`,
    seasons: CALIBRATION_WINDOW,
  },
  { label: "dziesięć sezonów (wszystkie dane)", seasons: ALL_SEASONS },
  { label: "osiem sezonów (okno do 2026-08-28)", seasons: RETIRED_WINDOW },
];

const windowTable = (
  windows: readonly { window: Window; reference: readonly MatchOutcomeSeasonReference[] }[],
  format: TableFormat
): string =>
  renderTable(
    [
      "okno",
      "sezony",
      "mecze",
      "gole/mecz",
      "gole gosp.",
      "gole gości",
      "wygrane gosp.",
      "remisy",
      "wygrane gości",
      "przewaga gosp. (pkt/mecz)",
    ],
    windows.map(({ window, reference }) => {
      const summary = summarizeMatchOutcomeReference(reference);
      return [
        window.label,
        String(summary.seasons),
        String(summary.matches),
        pl(summary.pooled.goalsPerMatch, 4),
        pl(summary.pooled.homeGoalsPerMatch, 4),
        pl(summary.pooled.awayGoalsPerMatch, 4),
        percent(summary.pooled.homeWinRate),
        percent(summary.pooled.drawRate),
        percent(summary.pooled.awayWinRate),
        pl(summary.pooled.homePointAdvantage, 4),
      ];
    }),
    format
  );

/** Full precision on purpose: these are values somebody would paste. */
const constantsBlock = (
  windows: readonly { window: Window; reference: readonly MatchOutcomeSeasonReference[] }[]
): string =>
  windows
    .flatMap(({ window, reference }) => {
      const fit = calibratedLambdaFit(reference);
      return [
        `${window.label}:`,
        `  MATCH_BASE_GOALS     = ${fit.impliedConstants.baseGoals}`,
        `  MATCH_HOME_ADVANTAGE = ${fit.impliedConstants.homeAdvantage}`,
        "",
      ];
    })
    .join("\n");

const seasonTable = (
  reference: readonly MatchOutcomeSeasonReference[],
  format: TableFormat
): string =>
  renderTable(
    [
      "sezon",
      "mecze",
      "gole/mecz",
      "wygrane gosp.",
      "remisy",
      "wygrane gości",
      "przewaga gosp. (pkt/mecz)",
      "0:0",
      "1:0",
      "0:1",
      "1:1",
    ],
    reference.map((season) => [
      season.season,
      String(season.matches),
      pl(season.goals / season.matches, 3),
      percent(season.homeWins / season.matches),
      percent(season.draws / season.matches),
      percent(season.awayWins / season.matches),
      pl((3 * (season.homeWins - season.awayWins)) / season.matches, 3),
      String(season.scorelines.zeroZero),
      String(season.scorelines.oneZero),
      String(season.scorelines.zeroOne),
      String(season.scorelines.oneOne),
    ]),
    format
  );

const homeAdvantage = (season: MatchOutcomeSeasonReference): number =>
  (3 * (season.homeWins - season.awayWins)) / season.matches;

const pandemicDiagnostics = (reference: readonly MatchOutcomeSeasonReference[]): string => {
  const pandemic = reference.find((season) => season.season === PANDEMIC_SEASON);
  if (!pandemic) throw new Error(`No ${PANDEMIC_SEASON} season in the pinned results`);
  const others = reference.filter((season) => season.season !== PANDEMIC_SEASON).map(homeAdvantage);
  const average = mean(others);
  const spread = sampleStandardDeviation(others);
  const z = (homeAdvantage(pandemic) - average) / spread;
  const verdict = Math.abs(z) > OUTLIER_Z ? "odstaje" : "nie odstaje";
  return [
    `- przewaga gospodarza w ${PANDEMIC_SEASON}: **${pl(homeAdvantage(pandemic), 4)}** pkt/mecz`,
    `- średnia pozostałych dziewięciu sezonów: **${pl(average, 4)}** pkt/mecz`,
    `- odchylenie standardowe między tymi sezonami: **${pl(spread, 4)}**`,
    `- **z = ${pl(z, 2)}**, przy progu |z| > ${OUTLIER_Z} sezon **${verdict}**`,
  ].join("\n");
};

const calibrationDrift = (): string => {
  const fit = calibratedLambdaFit(
    matchOutcomeReferenceFrom(readPinnedResults(), CALIBRATION_WINDOW)
  );
  const rows: [string, number, number][] = [
    ["MATCH_BASE_GOALS", MATCH_BASE_GOALS, fit.impliedConstants.baseGoals],
    ["MATCH_HOME_ADVANTAGE", MATCH_HOME_ADVANTAGE, fit.impliedConstants.homeAdvantage],
  ];
  return rows
    .map(([name, current, implied]) => {
      const relative = Math.abs(implied - current) / current;
      return `- \`${name}\`: w \`balance.ts\` ${current}, implikowana ${implied} — różnica względna ${relative.toExponential(2)}`;
    })
    .join("\n");
};

const renderReport = (format: TableFormat): string => {
  const rows = readPinnedResults();
  const windows = windowsToCompare().map((window) => ({
    window,
    reference: matchOutcomeReferenceFrom(rows, window.seasons),
  }));
  const everySeason = matchOutcomeReferenceFrom(rows, ALL_SEASONS);

  return [
    `# Okna kalibracji i diagnostyka sezonów — ${new Date().toISOString().slice(0, 10)}`,
    "",
    "Odtworzenie: `pnpm audit:outcome-windows --md <plik>`. Wszystkie liczby są policzone z `scripts/data/ekstraklasa-results.csv` (2944 mecze, dziesięć sezonów), nie przepisane.",
    "",
    "## 1. Trzy okna",
    "",
    windowTable(windows, format),
    "",
    "Stałe implikowane przez każde okno, tą samą arytmetyką co `calibratedLambdaFit`:",
    "",
    "```",
    constantsBlock(windows).trimEnd(),
    "```",
    "",
    "**Okno kalibracji stoi na dziewięciu sezonach od 2026-08-28.** Ten raport mówi, co dałyby pozostałe dwa; sama komenda niczego nie zmienia, a każda zmiana okna należy do właściciela produktu i pociąga za sobą przeliczenie obu lambd.",
    "",
    "## 2. Dziesięć sezonów osobno",
    "",
    seasonTable(everySeason, format),
    "",
    `## 3. Czy ${PANDEMIC_SEASON} odstaje?`,
    "",
    pandemicDiagnostics(everySeason),
    "",
    "Zasada raportowania, wiążąca dla przyszłego badania zależności wyników: **wynik główny liczy się zawsze na wszystkich dziesięciu sezonach**, a dziewięć sezonów bez pandemicznego jest **opisaną z góry analizą wrażliwości**, nigdy wynikiem głównym. Oba raportuje się razem, niezależnie od tego, który wypadnie korzystniej. Ta liczba jest przesłanką do dyskusji o reżimie pandemicznym, nie automatycznym wykluczeniem — i nie jest podstawą do dopasowania jakiegokolwiek modelu zależności wyników.",
    "",
    "## 4. Czy stałe nadążają za oknem?",
    "",
    calibrationDrift(),
    "",
    "Okno kalibracji zostało **poszerzone do dziewięciu sezonów 2026-08-28**, a stałe w `balance.ts` przepisane na wartości, które ono implikuje. Ta sekcja jest odtąd testem punktu stałego: dopasowanie do tego samego okna musi zwracać te same stałe. Różnica rzędu 1e-15 to resztka podwójnej precyzji z przejścia dopasowanie → wklejenie stałej → ponowne dopasowanie, czyli ostatnie dwa bity liczby. Cokolwiek większego znaczy, że stała i okno się rozjechały.",
    "",
    "Agregaty **wycofanego** okna ośmiu sezonów (2408 meczów, 6425 goli, 3622 gole gospodarzy, 2803 gole gości) zostały wcześniej przypięte testem i po naprawie parsera wyszły identyczne — dlatego wiadomo, że usterka nigdy nie dotknęła danych, do których stałe były wtedy dopasowane. Poszerzenie okna było więc decyzją, a nie naprawą.",
  ].join("\n");
};

const main = (): void => {
  const flags = parseFlags(process.argv.slice(2), KNOWN_FLAGS);
  const cli: Cli = { md: flags.get("--md") ?? null };
  process.stdout.write(`${renderReport("ascii")}\n`);
  if (cli.md) {
    writeFileSync(cli.md, `${renderReport("markdown")}\n`, "utf8");
    process.stdout.write(`\nZapisano raport: ${cli.md}\n`);
  }
};

main();
