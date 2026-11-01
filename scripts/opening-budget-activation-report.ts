import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  BOARD_REINVESTMENT_RATE,
  INITIAL_BUDGET_SHARE,
  LEGACY_KASA,
  LEGACY_WARTOSC_KADRY,
  MIN_INITIAL_BUDGET,
  USEFUL_UPGRADE_OVR_DELTA,
  VERDICT_KASA,
} from "../src/data/balance";
import { clubIdForShortName } from "../src/data/clubs";
import { ENGINE_REVISION } from "../src/logic/engine-version";
import { openingBudgetComponentsForClub } from "../src/logic/opening-budget";
import { representativeUsefulPurchaseCost } from "../src/logic/opening-budget-model";
import { pl } from "../src/logic/format";
import { ACTIVE_CLUBS } from "./balance-cli";
import { parseFlags } from "./cli-args";
import {
  BACKED_CLUBS,
  CASH_DRIFT_TOLERANCE,
  EUROPEAN_STARTER_CLUBS,
  EXPECTED_FLOOR_CLUBS,
  LEGACY_TOLERANCE,
  MONEY_SCALE_TOLERANCE,
  REPORT_SCHEMA_VERSION,
  attributeRng,
  cashAtHandoverPerCareer,
  cashDrift,
  legacyMultiplierCandidate,
  legacyUnit,
  moneyScaleGate,
  parseCareerDump,
  parseSeasonDump,
  playability,
  pooledMedian,
  type CareerRow,
  type Gate,
  type SeasonRow,
} from "./opening-budget-activation-report-core";
import { readSnapshotCareer, validateSnapshot } from "./opening-budget-rng-snapshot";
import { median } from "./stats";

/**
 * The acceptance report for the opening-budget activation: reads the dumps a
 * measurement run produced, checks them against the criteria of the plan of
 * 2026-09-12, and writes down what it found.
 *
 * Simulates nothing. Every figure in the note comes from a file that is kept,
 * so a claim can always be chased back to the run that produced it. The one
 * exception is the cost of a representative useful upgrade, which is a closed
 * form of the club's rating rather than an observation - it is read from the
 * same module the game reads, never transcribed.
 *
 * Exit code 2 is a criterion that was measured and not met. Exit code 1 is an
 * input that could not be read, or a `--require-feasible` run whose inputs
 * were incomplete. Code 0 means the measurement was taken.
 */

/** The thirteen policies the activation's active cohort is measured on -
 * the same set, in the same order, as the pinned baseline. */
const ACTIVE_POLICIES = [
  "youngOnly",
  "primeOnly",
  "veteranOnly",
  "youngOnlyBuy",
  "primeOnlyBuy",
  "veteranOnlyBuy",
  "youngBuySellAlways",
  "alwaysTake",
  "alwaysHaggle",
  "stallThenTake",
  "depthFirst",
  "analystEdgeBuy",
  "mixed",
] as const;

const CONTROL_POLICIES = ["alwaysPass"] as const;
const RUNS_PER_CELL = 1000;

const KNOWN_FLAGS = [
  "--control-raw",
  "--control-seasons",
  "--active-raw",
  "--active-seasons",
  "--preactivation-rng",
  "--baseline",
  "--json",
  "--md",
  "--require-feasible",
  "--help",
];
const VALUELESS_FLAGS = ["--require-feasible", "--help"];

const HELP = `pnpm audit:opening-budget-activation --control-raw <csv> --control-seasons <csv> --baseline <json> [...]

Sprawdza aktywowany budżet pierwszego okna i stopę reinwestycji wobec sześciu
bramek planu z 2026-09-12. Niczego nie symuluje: czyta zapisane dumpy.

  --control-raw <csv>       wiersze karier przebiegu --finance-control (wymagane)
  --control-seasons <csv>   wiersze sezonowe tego samego przebiegu (wymagane)
  --active-raw <csv>        wiersze karier przebiegu aktywnego (tryb pełny)
  --active-seasons <csv>    wiersze sezonowe przebiegu aktywnego (tryb pełny)
  --preactivation-rng <json>  przypięty snapshot sprzed aktywacji (tryb pełny)
  --baseline <json>         przypięte iloczyny dziedzictwa (wymagane)
  --json <plik>, --md <plik>
  --require-feasible        wymaga kompletu wejść i sześciu rozstrzygniętych bramek

Tryb częściowy (bez --active-* i --preactivation-rng) liczy wyłącznie metryki
dostępne z przebiegu kontrolnego; brakujące bramki są \`notMeasured\`, nigdy
\`passed\`.

Kody wyjścia: 0 pomiar wykonany, 1 błąd wejścia lub niekompletny pomiar pod
--require-feasible, 2 niespełniona bramka pod --require-feasible.`;

const sha256Of = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

type Artefact = { path: string; sha256: string; rows: number };

const artefact = (path: string, rows: number): Artefact => ({
  path: path.replace(/\\/g, "/"),
  sha256: sha256Of(path),
  rows,
});

/** The historical cash product, read from the pinned baseline rather than
 * from a rounded `16.55` typed into this file. */
const historicalCashProduct = (baselinePath: string): number => {
  const parsed = JSON.parse(readFileSync(baselinePath, "utf8")) as {
    invariants?: { cash?: { product?: number }; squadValue?: { product?: number } };
  };
  const product = parsed.invariants?.cash?.product;
  if (typeof product !== "number" || !Number.isFinite(product) || product <= 0) {
    throw new Error(`${baselinePath}: invariants.cash.product is not a usable number`);
  }
  return product;
};

const historicalSquadValueProduct = (baselinePath: string): number => {
  const parsed = JSON.parse(readFileSync(baselinePath, "utf8")) as {
    invariants?: { squadValue?: { product?: number } };
  };
  const product = parsed.invariants?.squadValue?.product;
  if (typeof product !== "number" || !Number.isFinite(product) || product <= 0) {
    throw new Error(`${baselinePath}: invariants.squadValue.product is not a usable number`);
  }
  return product;
};

/** The budget each club was actually handed, read off the dump the engine
 * wrote rather than recomputed from the formula under test. */
const budgetsFromDump = (rows: readonly SeasonRow[]): Map<string, number> => {
  const budgets = new Map<string, number>();
  for (const row of rows) {
    const known = budgets.get(row.clubShortName);
    if (known === undefined) budgets.set(row.clubShortName, row.initialBudget);
    else if (known !== row.initialBudget) {
      throw new Error(
        `${row.clubShortName}: the dump carries two opening budgets (${known} and ${row.initialBudget})`
      );
    }
  }
  return budgets;
};

const seasonsByCareer = (rows: readonly SeasonRow[]): Map<string, SeasonRow[]> => {
  const map = new Map<string, SeasonRow[]>();
  for (const row of rows) {
    const key = `${row.clubShortName}\0${row.policyName}\0${row.seed}`;
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
};

type Summary = ReturnType<typeof buildSummary>;

const buildSummary = (input: {
  controlRawPath: string;
  controlSeasonsPath: string;
  activeRawPath?: string;
  activeSeasonsPath?: string;
  preactivationRngPath?: string;
  baselinePath: string;
  /**
   * The matrix the dumps are required to cover. Defaulted to the production
   * run rather than taken from a flag: the CLI's interface is closed, and a
   * `--runs` flag would let a smaller measurement pass the same gates. Tests
   * override it so a fixture need not be eighteen thousand careers long.
   */
  matrix?: {
    readonly clubs: readonly string[];
    readonly controlPolicies: readonly string[];
    readonly activePolicies: readonly string[];
    readonly runsPerCell: number;
  };
}) => {
  const matrix = input.matrix ?? {
    clubs: ACTIVE_CLUBS,
    controlPolicies: CONTROL_POLICIES,
    activePolicies: ACTIVE_POLICIES,
    runsPerCell: RUNS_PER_CELL,
  };
  const controlExpectation = {
    incomeMode: "finance-control",
    clubs: matrix.clubs,
    policies: [...matrix.controlPolicies],
    runsPerCell: matrix.runsPerCell,
  };
  const controlCareers = parseCareerDump(
    readFileSync(input.controlRawPath, "utf8"),
    controlExpectation
  );
  const controlSeasons = parseSeasonDump(
    readFileSync(input.controlSeasonsPath, "utf8"),
    controlExpectation
  );

  const activeExpectation = {
    incomeMode: "normal",
    clubs: matrix.clubs,
    policies: [...matrix.activePolicies],
    runsPerCell: matrix.runsPerCell,
  };
  const activeCareers: CareerRow[] | null =
    input.activeRawPath === undefined
      ? null
      : parseCareerDump(readFileSync(input.activeRawPath, "utf8"), activeExpectation);
  const activeSeasons: SeasonRow[] | null =
    input.activeSeasonsPath === undefined
      ? null
      : parseSeasonDump(readFileSync(input.activeSeasonsPath, "utf8"), activeExpectation);

  const historicalCash = historicalCashProduct(input.baselinePath);
  const historicalSquadValue = historicalSquadValueProduct(input.baselinePath);

  // -- money scale -------------------------------------------------------
  const scale = moneyScaleGate(controlSeasons);

  // -- cash drift --------------------------------------------------------
  const drift = cashDrift(controlSeasons, BOARD_REINVESTMENT_RATE);

  // -- budgets, floor and playability -------------------------------------
  const budgets = budgetsFromDump(controlSeasons);
  const budgetRows = [...budgets.entries()]
    .map(([clubShortName, budget]) => ({
      clubShortName,
      budget,
      cost: representativeUsefulPurchaseCost(
        clubIdForShortName(clubShortName),
        USEFUL_UPGRADE_OVR_DELTA
      ),
    }))
    .sort((a, b) => b.budget - a.budget);
  const playabilityRows = playability(budgetRows);
  const clubsOnFloor = budgetRows.filter(
    (row) => Math.abs(row.budget - MIN_INITIAL_BUDGET) <= 1e-9
  );

  // -- cash units ---------------------------------------------------------
  const handover = cashAtHandoverPerCareer(controlSeasons);
  const pooledMedianCashAtHandover = pooledMedian(handover.map((entry) => entry.cash));
  const pooledMedianFinalCash = pooledMedian(controlCareers.map((row) => row.kasa));
  const verdictKasaCandidate = legacyMultiplierCandidate(
    historicalCash,
    pooledMedianCashAtHandover
  );
  const legacyKasaCandidate = legacyMultiplierCandidate(historicalCash, pooledMedianFinalCash);
  const verdictUnit = legacyUnit(
    "kasa przy werdykcie",
    historicalCash,
    pooledMedianCashAtHandover,
    VERDICT_KASA
  );
  const legacyUnitCash = legacyUnit(
    "kasa po epilogu",
    historicalCash,
    pooledMedianFinalCash,
    LEGACY_KASA
  );

  // -- squad value, reported and never gated ------------------------------
  const squadValue =
    activeCareers === null
      ? null
      : (() => {
          const newMedian = pooledMedian(activeCareers.map((row) => row.wartoscKadryMoj));
          return {
            pooledMedian: newMedian,
            multiplier: LEGACY_WARTOSC_KADRY,
            rebuiltProduct: LEGACY_WARTOSC_KADRY * newMedian,
            historicalProduct: historicalSquadValue,
            relativeShift:
              (LEGACY_WARTOSC_KADRY * newMedian - historicalSquadValue) / historicalSquadValue,
          };
        })();

  // -- RNG attribution ----------------------------------------------------
  const rng =
    input.preactivationRngPath === undefined
      ? null
      : (() => {
          const snapshot = validateSnapshot(
            JSON.parse(readFileSync(input.preactivationRngPath, "utf8"))
          );
          return {
            snapshot: {
              path: input.preactivationRngPath.replace(/\\/g, "/"),
              baseSha: snapshot.baseSha,
              toolSha: snapshot.toolSha,
              engineVersion: snapshot.run.engineVersion,
              careerCount: snapshot.careerCount,
            },
            attribution: attributeRng(
              (club, seed) => readSnapshotCareer(snapshot, club, seed),
              snapshot.careerCount,
              controlCareers,
              seasonsByCareer(controlSeasons)
            ),
          };
        })();

  const gates: Gate[] = [
    {
      name: "skala pieniądza",
      status: scale.withinTolerance ? "passed" : "failed",
      detail: `mediana klubowych median bilansu ${pl(scale.balanceMedianOfClubMedians, 4)} mln, tolerancja ±${pl(MONEY_SCALE_TOLERANCE)}`,
    },
    {
      name: "dryf gotówki",
      status: drift.every((row) => row.withinTolerance) ? "passed" : "failed",
      detail: `${drift.filter((row) => row.withinTolerance).length}/${drift.length} klubów w granicy ${pl(CASH_DRIFT_TOLERANCE)} mln wobec sum(prognoza × ${pl(BOARD_REINVESTMENT_RATE)})`,
    },
    {
      name: "grywalność",
      status: playabilityRows.every((row) => row.affordable) ? "passed" : "failed",
      detail: `${playabilityRows.filter((row) => row.affordable).length}/${playabilityRows.length} klubów stać na reprezentatywne wzmocnienie z pierwszym rokiem płacy`,
    },
    {
      name: "podłoga",
      status: clubsOnFloor.length === EXPECTED_FLOOR_CLUBS ? "passed" : "failed",
      detail: `MIN_INITIAL_BUDGET wiąże u ${clubsOnFloor.length} klubów, oczekiwano ${EXPECTED_FLOOR_CLUBS} (${clubsOnFloor.map((row) => row.clubShortName).join(", ")})`,
    },
    {
      name: "jednostki gotówki",
      status: verdictUnit.withinTolerance && legacyUnitCash.withinTolerance ? "passed" : "failed",
      detail: `VERDICT_KASA błąd ${pl(verdictUnit.relativeError * 100, 2)}%, LEGACY_KASA błąd ${pl(legacyUnitCash.relativeError * 100, 2)}%, tolerancja ±${pl(LEGACY_TOLERANCE * 100)}%`,
    },
    {
      name: "atrybucja RNG",
      status: rng === null ? "notMeasured" : rng.attribution.allAttributed ? "passed" : "failed",
      detail:
        rng === null
          ? "brak --preactivation-rng: pomiar niewykonany"
          : `${rng.attribution.identicalDraws} identycznych, ${rng.attribution.explainedByVerdictClass} przypisanych klasie werdyktu, ${rng.attribution.unexplainedDrawCount} nieprzypisanych`,
    },
  ];

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    engineRevision: ENGINE_REVISION,
    measuredAt: new Date().toISOString().slice(0, 10),
    mode: activeCareers === null || rng === null ? "partial" : "full",
    constants: {
      INITIAL_BUDGET_SHARE,
      USEFUL_UPGRADE_OVR_DELTA,
      BOARD_REINVESTMENT_RATE,
      MIN_INITIAL_BUDGET,
      VERDICT_KASA,
      LEGACY_KASA,
      LEGACY_WARTOSC_KADRY,
    },
    artefacts: {
      controlRaw: artefact(input.controlRawPath, controlCareers.length),
      controlSeasons: artefact(input.controlSeasonsPath, controlSeasons.length),
      activeRaw:
        input.activeRawPath === undefined
          ? null
          : artefact(input.activeRawPath, activeCareers?.length ?? 0),
      activeSeasons:
        input.activeSeasonsPath === undefined
          ? null
          : artefact(input.activeSeasonsPath, activeSeasons?.length ?? 0),
      baseline: input.baselinePath.replace(/\\/g, "/"),
    },
    moneyScale: scale,
    cashDrift: drift,
    budgets: budgetRows,
    playability: playabilityRows,
    clubsOnFloor: clubsOnFloor.map((row) => row.clubShortName),
    backedClubs: BACKED_CLUBS.map((clubShortName) => {
      const row = budgetRows.find((entry) => entry.clubShortName === clubShortName);
      const components =
        row === undefined
          ? null
          : openingBudgetComponentsForClub(clubIdForShortName(clubShortName));
      return {
        clubShortName,
        budget: row?.budget ?? null,
        /** Whether the club has a documented backer floor at all. Motor
         * deliberately does not, and that absence is the point. */
        hasBackerFloor: components === null ? null : components.backerSupportFloor !== null,
        /** Whether that floor is what DECIDES the budget. "Present but not
         * binding" is the case the report has to name rather than round away:
         * Widzew's expensive squad costs more to upgrade than its floor. */
        backerFloorBinds:
          components === null ? null : components.binding.includes("backerSupportFloor"),
        absoluteFloorBinds:
          components === null ? null : components.binding.includes("absoluteFloor"),
      };
    }),
    europeanStarters: EUROPEAN_STARTER_CLUBS.map((clubShortName) => {
      const rows = controlSeasons.filter((row) => row.clubShortName === clubShortName);
      // Null rather than a median of nothing: a club the dump does not carry
      // is an absent measurement, and zero would read as a measured zero.
      const balances = rows.map((row) => row.actualBalanceWithoutTransfersAndCups);
      return {
        clubShortName,
        budget: budgets.get(clubShortName) ?? null,
        medianSeasonBalance: balances.length === 0 ? null : median(balances),
        medianBudgetChange:
          balances.length === 0
            ? null
            : median(balances.map((balance) => balance * BOARD_REINVESTMENT_RATE)),
      };
    }),
    cashUnits: {
      historicalProduct: historicalCash,
      pooledMedianCashAtHandover,
      pooledMedianFinalCash,
      verdictKasaCandidate,
      legacyKasaCandidate,
      verdictUnit,
      legacyUnit: legacyUnitCash,
    },
    squadValue,
    rng,
    gates,
  };
};

const gateMark = (gate: Gate): string =>
  gate.status === "passed" ? "tak" : gate.status === "failed" ? "NIE" : "niezmierzone";

const renderMarkdown = (summary: Summary): string => {
  const lines: string[] = [];
  lines.push("# Aktywacja budżetu pierwszego okna i reinwestycji — pomiar kontrolny");
  lines.push("");
  lines.push(
    `Wygenerowane przez \`pnpm audit:opening-budget-activation\`, silnik \`${summary.engineRevision}\`, tryb **${summary.mode === "full" ? "pełny" : "częściowy"}**.`
  );
  lines.push(
    "Nic tu nie jest ponownie symulowane: każda liczba pochodzi z zapisanego pliku albo z modułu, który czyta sama gra."
  );
  lines.push("");

  lines.push("## Bramki");
  lines.push("");
  lines.push("| bramka | wynik | szczegóły |");
  lines.push("| --- | --- | --- |");
  for (const gate of summary.gates) {
    lines.push(`| ${gate.name} | ${gateMark(gate)} | ${gate.detail} |`);
  }
  lines.push("");

  lines.push("## Wdrożone wartości");
  lines.push("");
  lines.push("| stała | wartość |");
  lines.push("| --- | ---: |");
  for (const [name, value] of Object.entries(summary.constants)) {
    lines.push(`| \`${name}\` | ${value} |`);
  }
  lines.push("");

  lines.push("## Budżety pierwszego okna");
  lines.push("");
  lines.push("| klub | budżet | koszt wzmocnienia | stać |");
  lines.push("| --- | ---: | ---: | --- |");
  // The affordability column is the GATE's own answer, not a second
  // comparison written out here. Both sides are taken to the two decimals the
  // game settles money at, so a club whose budget the reducer rounded down by
  // half a grosz is not printed as unable to buy anything.
  const affordable = new Map(summary.playability.map((row) => [row.clubShortName, row.affordable]));
  for (const row of summary.budgets) {
    lines.push(
      `| ${row.clubShortName} | ${pl(row.budget, 3)} | ${pl(row.cost, 3)} | ${affordable.get(row.clubShortName) ? "tak" : "NIE"} |`
    );
  }
  lines.push("");
  lines.push(
    `Podłoga \`MIN_INITIAL_BUDGET\` wiąże u ${summary.clubsOnFloor.length} klubów: ${summary.clubsOnFloor.join(", ") || "—"}.`
  );
  lines.push("");

  lines.push("## Kluby z klasą wsparcia");
  lines.push("");
  lines.push(
    "| klub | budżet | ma podłogę wsparcia | wsparcie wiąże | podłoga bezwzględna wiąże |"
  );
  lines.push("| --- | ---: | --- | --- | --- |");
  const yesNo = (value: boolean | null): string => (value === null ? "—" : value ? "tak" : "nie");
  for (const row of summary.backedClubs) {
    lines.push(
      `| ${row.clubShortName} | ${row.budget === null ? "—" : pl(row.budget, 3)} | ${yesNo(row.hasBackerFloor)} | ${yesNo(row.backerFloorBinds)} | ${yesNo(row.absoluteFloorBinds)} |`
    );
  }
  lines.push("");

  lines.push("## Startowi uczestnicy Europy");
  lines.push("");
  lines.push("| klub | budżet | mediana bilansu sezonu | mediana zmiany budżetu |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const row of summary.europeanStarters) {
    lines.push(
      `| ${row.clubShortName} | ${row.budget === null ? "—" : pl(row.budget, 3)} | ${row.medianSeasonBalance === null ? "—" : pl(row.medianSeasonBalance, 3)} | ${row.medianBudgetChange === null ? "—" : pl(row.medianBudgetChange, 3)} |`
    );
  }
  lines.push("");

  lines.push("## Jednostki gotówki");
  lines.push("");
  lines.push(
    `Historyczny iloczyn odczytany z baseline'u: **${summary.cashUnits.historicalProduct}**.`
  );
  lines.push("");
  lines.push("| wielkość | nowa mediana | kandydat mnożnika | wpisana stała | iloczyn | błąd |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  lines.push(
    `| kasa przy werdykcie | ${summary.cashUnits.pooledMedianCashAtHandover} | ${summary.cashUnits.verdictKasaCandidate} | ${summary.constants.VERDICT_KASA} | ${summary.cashUnits.verdictUnit.rebuiltProduct} | ${pl(summary.cashUnits.verdictUnit.relativeError * 100, 2)}% |`
  );
  lines.push(
    `| kasa po epilogu | ${summary.cashUnits.pooledMedianFinalCash} | ${summary.cashUnits.legacyKasaCandidate} | ${summary.constants.LEGACY_KASA} | ${summary.cashUnits.legacyUnit.rebuiltProduct} | ${pl(summary.cashUnits.legacyUnit.relativeError * 100, 2)}% |`
  );
  lines.push("");

  if (summary.squadValue === null) {
    lines.push("Przesunięcie `wartoscKadryMoj` niezmierzone: przebieg aktywny nie został podany.");
  } else {
    lines.push(
      `Przesunięcie \`wartoscKadryMoj\` (raportowane, nie bramkujące): nowa mediana ${summary.squadValue.pooledMedian}, iloczyn ${summary.squadValue.rebuiltProduct} wobec historycznego ${summary.squadValue.historicalProduct}, czyli ${pl(summary.squadValue.relativeShift * 100, 2)}%. \`LEGACY_WARTOSC_KADRY\` pozostaje bit-identyczne.`
    );
  }
  lines.push("");

  lines.push("## Dryf gotówki");
  lines.push("");
  lines.push("| klub | kariery | mediana rezyduum | w granicy |");
  lines.push("| --- | ---: | ---: | --- |");
  for (const row of summary.cashDrift) {
    lines.push(
      `| ${row.clubShortName} | ${row.careers} | ${pl(row.medianResidual, 3)} | ${row.withinTolerance ? "tak" : "NIE"} |`
    );
  }
  lines.push("");

  lines.push("## Atrybucja RNG");
  lines.push("");
  if (summary.rng === null) {
    lines.push("Niezmierzona: `--preactivation-rng` nie został podany.");
  } else {
    const a = summary.rng.attribution;
    lines.push(
      `Snapshot \`${summary.rng.snapshot.path}\`, silnik \`${summary.rng.snapshot.engineVersion}\`, commit dumpów \`${summary.rng.snapshot.baseSha}\`, commit narzędzia \`${summary.rng.snapshot.toolSha}\`.`
    );
    lines.push("");
    lines.push("| wielkość | liczba |");
    lines.push("| --- | ---: |");
    lines.push(`| pary | ${a.pairs} |`);
    lines.push(`| brak odpowiednika w snapshocie | ${a.missingBefore} |`);
    lines.push(`| identyczne pola prewerdyktowe | ${a.identicalPrelude} |`);
    lines.push(`| zmieniony składnik trofeów po epilogu | ${a.changedTrofea} |`);
    lines.push(`| z tego bez zmiany klasy werdyktu | ${a.unexplainedTrofeaCount} |`);
    lines.push(`| zmieniony pełny tytuł werdyktu | ${a.changedVerdictTitle} |`);
    lines.push(`| zmieniona klasa losowania werdyktu | ${a.changedVerdictClass} |`);
    lines.push(`| identyczny licznik losowań | ${a.identicalDraws} |`);
    lines.push(`| różnica przypisana klasie werdyktu | ${a.explainedByVerdictClass} |`);
    lines.push(`| różnica nieprzypisana | ${a.unexplainedDrawCount} |`);
    lines.push(`| rozjazd liczby sezonów | ${a.seasonCountMismatchCount} |`);
    lines.push(`| rozjazd bilansu albo wpływu pucharowego | ${a.seasonBalanceMismatchCount} |`);
    lines.push(`| rozjazd sezonowego licznika losowań | ${a.seasonDrawMismatchCount} |`);
    lines.push(`| zmienione pola prewerdyktowe | ${a.changedPreludeCount} |`);
    if (a.unexplainedTrofea.length > 0) {
      lines.push("");
      lines.push(`Trofea zmienione bez zmiany klasy werdyktu: ${a.unexplainedTrofea.join(", ")}.`);
    }
    if (a.changedPrelude.length > 0) {
      lines.push("");
      lines.push(
        `Zmienione pola prewerdyktowe (${a.changedPreludeCount}, do dwudziestu wypisanych): ${a.changedPrelude.join(", ")}.`
      );
    }
    if (a.unexplainedDraws.length > 0) {
      lines.push("");
      lines.push(
        `Nieprzypisane różnice (do dwudziestu): ${a.unexplainedDraws.map((row) => `${row.key} ${row.before}→${row.after}`).join(", ")}.`
      );
    }
  }
  lines.push("");

  lines.push("## Artefakty");
  lines.push("");
  lines.push("| plik | wiersze | sha256 |");
  lines.push("| --- | ---: | --- |");
  for (const [name, value] of Object.entries(summary.artefacts)) {
    if (value === null || typeof value === "string") continue;
    lines.push(`| \`${value.path}\` (${name}) | ${value.rows} | \`${value.sha256}\` |`);
  }
  lines.push("");
  lines.push(`Baseline: \`${summary.artefacts.baseline}\`.`);
  lines.push("");

  return lines.join("\n");
};

const main = (argv: readonly string[]): number => {
  const flags = parseFlags([...argv], KNOWN_FLAGS, VALUELESS_FLAGS);
  if (flags.has("--help")) {
    console.log(HELP);
    return 0;
  }
  for (const flag of ["--control-raw", "--control-seasons", "--baseline"]) {
    if (!flags.has(flag)) throw new Error(`${flag} is required`);
  }
  const requireFeasible = flags.has("--require-feasible");
  const activeRawPath = flags.get("--active-raw");
  const activeSeasonsPath = flags.get("--active-seasons");
  const preactivationRngPath = flags.get("--preactivation-rng");

  if (
    requireFeasible &&
    (activeRawPath === undefined ||
      activeSeasonsPath === undefined ||
      preactivationRngPath === undefined)
  ) {
    console.error(
      "--require-feasible wymaga --active-raw, --active-seasons i --preactivation-rng: niekompletny pomiar nie może przejść bramki"
    );
    return 1;
  }
  if ((activeRawPath === undefined) !== (activeSeasonsPath === undefined)) {
    throw new Error("--active-raw i --active-seasons idą razem albo wcale");
  }

  const summary = buildSummary({
    controlRawPath: flags.get("--control-raw")!,
    controlSeasonsPath: flags.get("--control-seasons")!,
    activeRawPath,
    activeSeasonsPath,
    preactivationRngPath,
    baselinePath: flags.get("--baseline")!,
  });

  const jsonPath = flags.get("--json");
  if (jsonPath !== undefined) writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  const mdPath = flags.get("--md");
  if (mdPath !== undefined) writeFileSync(mdPath, renderMarkdown(summary), "utf8");

  for (const gate of summary.gates) {
    console.log(`${gate.name}: ${gateMark(gate)} — ${gate.detail}`);
  }

  if (requireFeasible) {
    if (summary.gates.some((gate) => gate.status === "notMeasured")) return 1;
    if (summary.gates.some((gate) => gate.status === "failed")) return 2;
  }
  return 0;
};

export { buildSummary, renderMarkdown, main };

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
