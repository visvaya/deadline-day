import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  KOSZTY_STALE,
  LEGACY_KASA,
  LEGACY_WARTOSC_KADRY,
  MONEY_SCALE_PLN_PER_GAME_MILLION,
  SEZONY_GRY,
  WAGE_AT_PIVOT,
  WAGE_AT_PIVOT_PLN,
  WAGE_SLOPE,
  WOLNY_WAGE_PREMIUM,
  MIN_BUDGET_SHARE,
  MIN_INITIAL_BUDGET,
  LEAGUE_PRIZE_RATE,
  PURCHASE_PRICE_CAP,
  VERDICT_KASA,
  leaguePositionPrize,
} from "../src/data/balance";
import { CLUBS } from "../src/data/clubs";
import { EUROPEAN_BERTHS_2026 } from "../src/data/european-berths-2026";
import { RYNEK_OPIS } from "../src/data/market-states";
import type { PositionCode } from "../src/data/types";
import { ENGINE_REVISION } from "../src/logic/engine-version";
import { initialClubBudget } from "../src/logic/finance";
import { marketValue } from "../src/logic/player";
import { baseWage } from "../src/logic/wages";
import { pl } from "../src/logic/format";
import { ACTIVE_CLUBS } from "./balance-cli";
import { parseFlags } from "./cli-args";
import { parseCsvLine } from "./csv";
import {
  ANCHOR_CLUBS,
  READY_BAND,
  REPORT_SCHEMA_VERSION,
  bandReach,
  cashDrift,
  careerLengths,
  freeAgentRatios,
  ladderShares,
  legacyUnit,
  moneyScaleStep,
  pairRngCounts,
  parseSeasonDump,
  playability,
  priceCapReach,
  verdictKasaShift,
  type SeasonRow,
} from "./finance-activation-report-core";
import { KUPNO_MEDIAN_PRICE_DEVIATION } from "./money-scale-core";
import { NO_DRAW_VERDICT, RNG_SNAPSHOT_SCHEMA_VERSION } from "./rng-control-snapshot";
import { validateLegacyBaseline } from "./money-scale-inputs";
import { median } from "./stats";
import { at, recordAt } from "../src/logic/invariant";

/**
 * The acceptance report for the economy activation: reads the dumps a
 * measurement run produced, checks them against the criteria of the spec's
 * chapters 5.2 and 12.2, and writes down what it found.
 *
 * Simulates nothing. Every number in the note comes from a file that is kept,
 * so a claim in the report can always be chased back to the run that produced
 * it. Exit code 2 is a criterion that was measured and not met; exit code 1 is
 * an input that could not be read.
 */

const KNOWN_FLAGS = [
  "--control-raw",
  "--control-seasons",
  "--active-raw",
  "--active-seasons",
  "--signings",
  "--preactivation-rng",
  "--baseline",
  "--json",
  "--md",
  "--require-feasible",
  "--help",
];
const VALUELESS_FLAGS = ["--require-feasible", "--help"];

const HELP = `pnpm audit:finance-activation --control-seasons <csv> [...]

Sprawdza aktywowaną ekonomię wobec kryteriów speka 4 (§5.2 i §12.2).
Niczego nie symuluje: czyta zapisane dumpy i pisze notatkę.

  --control-seasons <csv>   wiersze sezonowe przebiegu --finance-control (wymagane)
  --control-raw <csv>       wiersze karier tego samego przebiegu
  --active-seasons <csv>    wiersze sezonowe przebiegu aktywnego
  --active-raw <csv>        wiersze karier przebiegu aktywnego
  --signings <csv>          eksport podpisań przebiegu aktywnego
  --preactivation-rng <json>  przypięty snapshot liczników RNG sprzed aktywacji
  --baseline <json>         przypięte iloczyny dziedzictwa
  --json <plik>, --md <plik>
  --require-feasible        kod 2, gdy którakolwiek bramka nie przechodzi`;

const sha256Of = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

type Artefact = { path: string; sha256: string; rows: number };

const artefact = (path: string, rows: number): Artefact => ({
  path: path.replace(/\\/g, "/"),
  sha256: sha256Of(path),
  rows,
});

/** The career dump's columns this report needs, read by header. */
type CareerRow = {
  clubShortName: string;
  policyName: string;
  seed: number;
  incomeMode: string;
  kasa: number;
  wartoscKadryMoj: number;
  rngDrawCount: number;
  werdykt: string;
  seasonsPlayed: number;
  tenureRelegations: number;
  leaguePoints: number;
};

const parseCareerDump = (csv: string, expectedIncomeMode: string): CareerRow[] => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  const need = [
    "polityka",
    "seed",
    "kasa",
    "wartoscKadryMoj",
    "clubShortName",
    "incomeMode",
    "rngDrawCount",
    "werdykt",
    "sezonyRozegrane",
    "spadkiKadencja",
    "pktA",
  ];
  for (const column of need) {
    if (!header.includes(column)) throw new Error(`career dump is missing the "${column}" column`);
  }
  const rows: CareerRow[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(at(lines, i, "CSV line"));
    const cell = (column: string): string => fields[header.indexOf(column)] ?? "";
    if (cell("incomeMode") !== expectedIncomeMode) {
      throw new Error(
        `career row ${i}: incomeMode "${cell("incomeMode")}" is not the expected one`
      );
    }
    const row: CareerRow = {
      clubShortName: cell("clubShortName"),
      policyName: cell("polityka"),
      seed: Number(cell("seed")),
      incomeMode: cell("incomeMode"),
      kasa: Number(cell("kasa")),
      wartoscKadryMoj: Number(cell("wartoscKadryMoj")),
      rngDrawCount: Number(cell("rngDrawCount")),
      werdykt: cell("werdykt"),
      seasonsPlayed: Number(cell("sezonyRozegrane")),
      tenureRelegations: Number(cell("spadkiKadencja")),
      leaguePoints: Number(cell("pktA")),
    };
    const key = `${row.clubShortName}\0${row.policyName}\0${row.seed}`;
    if (seen.has(key)) throw new Error(`career row ${i}: duplicate career`);
    seen.add(key);
    rows.push(row);
  }
  return rows;
};

type SigningRow = {
  clubShortName: string;
  policyName: string;
  offerType: string;
  position: PositionCode;
  age: number;
  ovr: number;
  fee: number;
  annualWage: number;
  baseAnnualWage: number;
};

const parseSignings = (csv: string): SigningRow[] => {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  const rows: SigningRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(at(lines, i, "CSV line"));
    const cell = (column: string): string => fields[header.indexOf(column)] ?? "";
    rows.push({
      clubShortName: cell("clubShortName"),
      policyName: cell("policyName"),
      offerType: cell("offerType"),
      position: cell("position") as PositionCode,
      age: Number(cell("age")),
      ovr: Number(cell("ovr")),
      fee: Number(cell("fee")),
      annualWage: Number(cell("annualWage")),
      baseAnnualWage: Number(cell("baseAnnualWage")),
    });
  }
  return rows;
};

/**
 * The fee the SAME player would have carried on a KUPNO card, at the median
 * price deviation and in the reference market state.
 *
 * Both factors are named rather than implied: the market value is not the
 * median fee of a KUPNO card, and treating the two as one would understate
 * the reference by a fifth.
 */
const REFERENCE_MARKET_MULTIPLIER = RYNEK_OPIS.spokoj.mnoznikCeny;

/** The position the reach measurement is pinned to. AGE_PROFILE_DEFAULT's own
 * peak band, so age 26 sits two years into the prime rather than somewhere
 * that depends on which position happened to be picked. */
const REACH_POSITION: PositionCode = "LO";

/** Stands for the three verdict branches that each draw exactly one value.
 * The snapshot can tell them apart from the lowest branch and not from each
 * other, so it establishes only a lower bound on verdict-tier changes. */
const ANY_DRAWING_VERDICT = "GAŁĄŹ Z LOSOWANIEM";

/** The five clubs whose first season replays a real 2026/27 european berth.
 * Derived from the pinned snapshot, never listed again here. */
const BERTH_CLUBS = new Set(
  EUROPEAN_BERTHS_2026.map((berth) => CLUBS.find((club) => club.clubId === berth.clubId)!.shortName)
);

const counterfactualFee = (row: SigningRow): number =>
  marketValue(row.ovr, row.age, row.position) *
  KUPNO_MEDIAN_PRICE_DEVIATION *
  REFERENCE_MARKET_MULTIPLIER;

type Gate = { name: string; passed: boolean; detail: string };

const num = (value: number, digits = 3): string => value.toFixed(digits);

const main = (argv: readonly string[]): number => {
  const flags = parseFlags([...argv], KNOWN_FLAGS, VALUELESS_FLAGS);
  if (flags.has("--help")) {
    console.log(HELP);
    return 0;
  }
  if (!flags.has("--control-seasons")) throw new Error("--control-seasons is required");

  const gates: Gate[] = [];
  const artefacts: Record<string, Artefact> = {};

  const controlSeasonsPath = flags.get("--control-seasons")!;
  const controlSeasons = parseSeasonDump(readFileSync(controlSeasonsPath, "utf8"), {
    incomeMode: "finance-control",
  });
  artefacts.controlSeasons = artefact(controlSeasonsPath, controlSeasons.length);

  const scale = moneyScaleStep(controlSeasons);
  gates.push({
    name: "money scale",
    passed: scale.withinTolerance,
    detail: `mediana klubowych median bilansu ${num(scale.balanceMedian)} mln (tolerancja 0,25); D implikowane ${Math.round(scale.dCandidate)}`,
  });

  const drift = cashDrift(controlSeasons);
  const anchorDrift = drift.filter((row) =>
    (ANCHOR_CLUBS as readonly string[]).includes(row.clubShortName)
  );
  gates.push({
    name: "cash drift",
    passed: anchorDrift.length > 0 && anchorDrift.every((row) => row.withinTolerance),
    detail: anchorDrift.map((row) => `${row.clubShortName} ${num(row.medianResidual)}`).join("; "),
  });

  const ladder = ladderShares(controlSeasons, leaguePositionPrize);
  const lengths = careerLengths(controlSeasons, SEZONY_GRY);

  // Budgets are a property of the constants, not of a dump: computed here so
  // the playability question is asked of all eighteen clubs whether or not
  // every one of them appears in the run.
  const budgets = CLUBS.map((club) => ({
    clubShortName: club.shortName,
    budget: initialClubBudget(club.clubId),
  }));

  let controlCareers: CareerRow[] | null = null;
  if (flags.has("--control-raw")) {
    const path = flags.get("--control-raw")!;
    controlCareers = parseCareerDump(readFileSync(path, "utf8"), "finance-control");
    artefacts.controlRaw = artefact(path, controlCareers.length);
  }

  let rngPairing: ReturnType<typeof pairRngCounts> | null = null;
  let verdictShift: ReturnType<typeof verdictKasaShift> | null = null;
  if (flags.has("--preactivation-rng")) {
    const path = flags.get("--preactivation-rng")!;
    const snapshot = JSON.parse(readFileSync(path, "utf8")) as {
      schemaVersion: number;
      careers: Record<string, Record<string, number[]>>;
    };
    if (snapshot.schemaVersion !== RNG_SNAPSHOT_SCHEMA_VERSION) {
      throw new Error(
        `preactivation snapshot schema ${snapshot.schemaVersion} is not ${RNG_SNAPSHOT_SCHEMA_VERSION}: an older snapshot cannot attribute a difference, only observe one`
      );
    }
    if (!controlCareers) {
      throw new Error("--preactivation-rng needs --control-raw to pair against");
    }
    rngPairing = pairRngCounts(
      (club, seed) => {
        const tuple = snapshot.careers[club]?.[String(seed)];
        if (tuple === undefined) return undefined;
        const value = (index: number): number => at(tuple, index, `${club}/${seed} rng tuple`);
        return {
          draws: value(0),
          verdictDraws: value(1),
          seasonsPlayed: value(2),
          tenureRelegations: value(3),
          leaguePoints: value(5),
        };
      },
      controlCareers.map((row) => ({
        club: row.clubShortName,
        seed: row.seed,
        draws: row.rngDrawCount,
        verdictDraws: row.werdykt === NO_DRAW_VERDICT ? 0 : 1,
        seasonsPlayed: row.seasonsPlayed,
        tenureRelegations: row.tenureRelegations,
        leaguePoints: row.leaguePoints,
      })),
      BERTH_CLUBS
    );
    // The verdict shift, measured on the two CLASSES the snapshot can recover.
    // Three of the four actual titles draw once, so a career that moved among
    // them is invisible. Only moves in and out of the lowest branch show up,
    // making this a lower bound rather than a full tier count.
    verdictShift = verdictKasaShift(
      Object.entries(snapshot.careers).flatMap(([club, seeds]) =>
        Object.entries(seeds).map(([seed, tuple]) => ({
          key: `${club}\0${seed}`,
          // The snapshot records whether the verdict drew, not its title, so
          // the two titles it can distinguish are the lowest branch and
          // "one of the other three". A career that stayed inside the upper
          // three drew the same number of values either way and cannot be
          // separated further.
          verdict:
            at(tuple, 1, `${club}/${seed} rng tuple`) === 0 ? NO_DRAW_VERDICT : ANY_DRAWING_VERDICT,
          kasa: at(tuple, 4, `${club}/${seed} rng tuple`),
          hasBerth: BERTH_CLUBS.has(club),
        }))
      ),
      controlCareers.map((row) => ({
        key: `${row.clubShortName}\0${row.seed}`,
        verdict: row.werdykt === NO_DRAW_VERDICT ? NO_DRAW_VERDICT : ANY_DRAWING_VERDICT,
        kasa: row.kasa,
        hasBerth: BERTH_CLUBS.has(row.clubShortName),
      })),
      VERDICT_KASA,
      [NO_DRAW_VERDICT, ANY_DRAWING_VERDICT]
    );
    artefacts.preactivationRng = artefact(path, rngPairing.pairs);
    gates.push({
      name: "rng attribution",
      passed: rngPairing.allAttributed,
      detail:
        `${rngPairing.identical}/${rngPairing.pairs} identycznych; ` +
        `${rngPairing.explainedByBerth} z pucharu sezonu 1, ${rngPairing.explainedByVerdict} z gałęzi werdyktu; ` +
        `${rngPairing.unexplained.length} niewyjaśnionych, ${rngPairing.missing} braków, ` +
        `${rngPairing.tenureMovedWithoutBerth} zmian kadencji bez pucharu`,
    });
  }

  let activeCareers: CareerRow[] | null = null;
  if (flags.has("--active-raw")) {
    const path = flags.get("--active-raw")!;
    activeCareers = parseCareerDump(readFileSync(path, "utf8"), "normal");
    artefacts.activeRaw = artefact(path, activeCareers.length);
  }
  let activeSeasons: SeasonRow[] | null = null;
  if (flags.has("--active-seasons")) {
    const path = flags.get("--active-seasons")!;
    activeSeasons = parseSeasonDump(readFileSync(path, "utf8"), { incomeMode: "normal" });
    artefacts.activeSeasons = artefact(path, activeSeasons.length);
  }

  let freeAgents: ReturnType<typeof freeAgentRatios> | null = null;
  let medianFirstYearCost: number | null = null;
  if (flags.has("--signings")) {
    const path = flags.get("--signings")!;
    const signings = parseSignings(readFileSync(path, "utf8"));
    artefacts.signings = artefact(path, signings.length);

    const purchases = signings.filter((row) => row.offerType === "KUPNO");
    if (purchases.length === 0) throw new Error("the signing export contains no KUPNO cards");
    medianFirstYearCost = median(purchases.map((row) => row.fee + row.annualWage));

    const measuredPolicies = ["alwaysTake", "alwaysHaggle", "mixed"];
    freeAgents = freeAgentRatios(
      signings
        .filter((row) => row.offerType === "WOLNY" && measuredPolicies.includes(row.policyName))
        .map((row) => ({
          policyName: row.policyName,
          baseAnnualWage: row.baseAnnualWage,
          referenceFee: counterfactualFee(row),
        }))
    );
    gates.push({
      name: "free agent overpay",
      passed:
        freeAgents.length === measuredPolicies.length && freeAgents.every((row) => row.withinBand),
      detail: freeAgents.map((row) => `${row.policyName} ${num(row.achievedRatio)}`).join("; "),
    });
  }

  // Two measurements with no threshold, computed analytically from the
  // parameter family and the budgets rather than from a dump. The first asks
  // how far up the ready-made band a club can reach; the second asks how much
  // of that reach is `capPurchasePrice` flattering the answer.
  const readyFee = (ovr: number): number =>
    marketValue(ovr, READY_BAND.midAge, REACH_POSITION) *
    KUPNO_MEDIAN_PRICE_DEVIATION *
    REFERENCE_MARKET_MULTIPLIER;
  const reach = bandReach(budgets, readyFee, (ovr) => baseWage(ovr));
  const priceCap = priceCapReach(budgets, readyFee, PURCHASE_PRICE_CAP);

  const playable = playability(budgets, medianFirstYearCost ?? Number.POSITIVE_INFINITY);
  if (medianFirstYearCost !== null) {
    const affordable = playable.filter((row) => row.affordable).length;
    gates.push({
      name: "playability",
      passed: affordable === playable.length,
      detail: `${affordable}/${playable.length} klubów stać na medianową kartę KUPNO z rocznej płacy (${num(medianFirstYearCost)} mln)`,
    });
  }

  let legacy: ReturnType<typeof legacyUnit>[] | null = null;
  if (flags.has("--baseline")) {
    const path = flags.get("--baseline")!;
    const baseline = validateLegacyBaseline(JSON.parse(readFileSync(path, "utf8"))) as {
      invariants: Record<string, { product: number; historicalMultiplier: number }>;
    };
    artefacts.baseline = artefact(path, 1);
    if (!controlCareers || !activeCareers) {
      throw new Error("--baseline needs both --control-raw and --active-raw");
    }
    // The invariant is the PRODUCT the old economy scored, not the old
    // multiplier. Read from the pinned baseline rather than rebuilt from a
    // rounded median: `2 x 1.99` is not the product this component actually
    // contributed.
    legacy = [
      legacyUnit(
        "kasa",
        recordAt(baseline.invariants, "cash", "baseline invariant").product,
        median(controlCareers.map((row) => row.kasa)),
        LEGACY_KASA
      ),
      legacyUnit(
        "wartoscKadryMoj",
        recordAt(baseline.invariants, "squadValue", "baseline invariant").product,
        median(activeCareers.map((row) => row.wartoscKadryMoj)),
        LEGACY_WARTOSC_KADRY
      ),
    ];
    gates.push({
      name: "legacy unit",
      passed: legacy.every((row) => row.withinTolerance),
      detail: legacy
        .map(
          (row) =>
            `${row.quantity} ${num(row.rebuiltProduct)} (${num(row.relativeError * 100, 1)}%)`
        )
        .join("; "),
    });
  }

  const constants = {
    ENGINE_REVISION,
    MONEY_SCALE_PLN_PER_GAME_MILLION,
    WAGE_SLOPE,
    WAGE_AT_PIVOT,
    WAGE_AT_PIVOT_PLN,
    LEAGUE_PRIZE_RATE,
    KOSZTY_STALE,
    WOLNY_WAGE_PREMIUM,
    MIN_BUDGET_SHARE,
    MIN_INITIAL_BUDGET,
    LEGACY_KASA,
    LEGACY_WARTOSC_KADRY,
  };

  const summary = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedFrom: artefacts,
    constants,
    clubs: ACTIVE_CLUBS,
    metrics: {
      moneyScale: scale,
      cashDrift: drift,
      ladderShares: ladder,
      careerLengths: lengths,
      budgets,
      playability: playable,
      reach,
      priceCap,
      freeAgents,
      legacy,
      rng: rngPairing,
      verdictShift,
    },
    gates,
    allGatesPassed: gates.every((gate) => gate.passed),
  };

  const jsonPath = flags.get("--json");
  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const report = renderReport(summary);
  console.log(report);
  const mdPath = flags.get("--md");
  if (mdPath) writeFileSync(mdPath, `${report}\n`, "utf8");

  // A measured failure is still a completed measurement. Only the explicit
  // gate turns it into a non-zero status.
  return flags.has("--require-feasible") && !summary.allGatesPassed ? 2 : 0;
};

const renderReport = (summary: {
  constants: Record<string, number | string>;
  generatedFrom: Record<string, Artefact>;
  metrics: {
    moneyScale: ReturnType<typeof moneyScaleStep>;
    cashDrift: ReturnType<typeof cashDrift>;
    ladderShares: ReturnType<typeof ladderShares>;
    careerLengths: ReturnType<typeof careerLengths>;
    budgets: { clubShortName: string; budget: number }[];
    playability: ReturnType<typeof playability>;
    reach: ReturnType<typeof bandReach>;
    priceCap: ReturnType<typeof priceCapReach>;
    freeAgents: ReturnType<typeof freeAgentRatios> | null;
    legacy: ReturnType<typeof legacyUnit>[] | null;
    rng: ReturnType<typeof pairRngCounts> | null;
    verdictShift: ReturnType<typeof verdictKasaShift> | null;
  };
  gates: Gate[];
  allGatesPassed: boolean;
}): string => {
  const lines: string[] = [];
  lines.push("# Aktywacja ekonomii — pomiar kontrolny (2026-09-10)");
  lines.push("");
  lines.push(
    "Wygenerowane przez `pnpm audit:finance-activation`. Nic tutaj nie jest symulowane ponownie —"
  );
  lines.push("każda liczba pochodzi z zapisanego dumpu wymienionego niżej.");
  lines.push("");

  lines.push("## Werdykty");
  lines.push("");
  lines.push("| bramka | wynik | szczegóły |");
  lines.push("| --- | --- | --- |");
  for (const gate of summary.gates) {
    lines.push(`| ${gate.name} | ${gate.passed ? "OK" : "BLOKUJE"} | ${gate.detail} |`);
  }
  lines.push("");
  lines.push(
    summary.allGatesPassed
      ? "**Wszystkie zmierzone bramki przechodzą.**"
      : "**Co najmniej jedna bramka nie przechodzi — patrz tabela wyżej.**"
  );
  lines.push("");

  lines.push("## Stałe, na których to leciało");
  lines.push("");
  lines.push("| stała | wartość |");
  lines.push("| --- | ---: |");
  for (const [key, value] of Object.entries(summary.constants)) {
    lines.push(`| \`${key}\` | ${typeof value === "number" ? value : value} |`);
  }
  lines.push("");

  lines.push("## Artefakty");
  lines.push("");
  lines.push("| plik | wierszy | sha256 |");
  lines.push("| --- | ---: | --- |");
  for (const item of Object.values(summary.generatedFrom)) {
    lines.push(`| \`${item.path}\` | ${item.rows} | \`${item.sha256}\` |`);
  }
  lines.push("");

  const scale = summary.metrics.moneyScale;
  lines.push("## Skala pieniądza");
  lines.push("");
  lines.push(
    `Mediana klubowych median rocznego bilansu bez transferów i pucharów: **${pl(scale.balanceMedian)} mln €**.`
  );
  lines.push(
    `Ta sama mediana przeliczona na PLN: ${Math.round(scale.scalableMedianPln)}; implikowane \`D\` = ${Math.round(scale.dCandidate)}.`
  );
  lines.push("");

  lines.push("## Dryf gotówki po pięciu sezonach");
  lines.push("");
  lines.push("| klub | karier | mediana residuum | w tolerancji 0,50 |");
  lines.push("| --- | ---: | ---: | --- |");
  for (const row of summary.metrics.cashDrift) {
    lines.push(
      `| ${row.clubShortName} | ${row.careers} | ${pl(row.medianResidual)} | ${row.withinTolerance ? "tak" : "**nie**"} |`
    );
  }
  lines.push("");

  lines.push("## Udział drabinki w przychodzie sezonu");
  lines.push("");
  lines.push(
    "| klub | przychód powtarzalny | udział jako mistrz | udział jako 18. | mediana bilansu |"
  );
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const row of summary.metrics.ladderShares) {
    lines.push(
      `| ${row.clubShortName} | ${pl(row.recurringRevenue)} | ${pl(row.shareAsChampion * 100, 1)}% | ${pl(row.shareAsLast * 100, 1)}% | ${pl(row.medianSeasonBalance)} |`
    );
  }
  lines.push("");

  const lengths = summary.metrics.careerLengths;
  lines.push("## Długość karier");
  lines.push("");
  lines.push(
    `Karier: ${lengths.careers}. Mediana rozegranych sezonów: ${lengths.medianSeasons}, kwartyl dolny ${lengths.p25Seasons}.`
  );
  lines.push(`Udział karier przerwanych spadkiem: ${pl(lengths.shareCutShort * 100, 1)}%.`);
  lines.push("");

  lines.push("## Budżety startowe i grywalność");
  lines.push("");
  lines.push("| klub | budżet | medianowa karta KUPNO z płacą | stać |");
  lines.push("| --- | ---: | ---: | --- |");
  for (const row of summary.metrics.playability) {
    lines.push(
      `| ${row.clubShortName} | ${pl(row.budget)} | ${Number.isFinite(row.medianFirstYearCost) ? pl(row.medianFirstYearCost) : "—"} | ${row.affordable ? "tak" : "**nie**"} |`
    );
  }
  lines.push("");

  lines.push("## Zasięg pasma `KUPNO` — obserwacja bez progu");
  lines.push("");
  lines.push(
    `Bramka grywalności pyta o **medianową** kartę i przeszłaby nawet wtedy, gdyby cała górna połowa`
  );
  lines.push(
    `archetypu \`gotowy\` (OVR ${READY_BAND.minOvr}–${READY_BAND.maxOvr}, wiek 24–28) była poza zasięgiem wszystkich osiemnastu klubów.`
  );
  lines.push(
    `Tabela niżej pyta o coś innego: nie „czy każdego stać na cokolwiek", tylko „czy kogokolwiek stać na kogoś dobrego".`
  );
  lines.push(
    `Liczone analitycznie, przy medianowym modyfikatorze ceny \`KUPNO\`, spokojnym rynku, wieku ${READY_BAND.midAge} lat`
  );
  lines.push(
    "i przypiętym profilu pozycji. **Bez progu** — gdzie ma leżeć góra pasma, jest decyzją właściciela produktu."
  );
  lines.push("");
  lines.push("| klub | budżet | najwyższy OVR (samo odstępne) | najwyższy OVR (z rocznej płacy) |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const row of summary.metrics.reach) {
    lines.push(
      `| ${row.clubShortName} | ${pl(row.budget)} | ${row.highestByFee ?? "—"} | ${row.highestByFirstYear ?? "—"} |`
    );
  }
  const noReach = summary.metrics.reach.filter((row) => row.highestByFee === null).length;
  lines.push("");
  lines.push(
    `Klubów nieosiągających **żadnego** OVR z pasma: **${noReach}** z ${summary.metrics.reach.length}.`
  );
  lines.push("");

  lines.push("## Ile z tego maskuje `capPurchasePrice`");
  lines.push("");
  lines.push(
    "Limit tnie cenę karty `KUPNO`/`PANIC` do `kasa × PURCHASE_PRICE_CAP`, więc klub bez pieniędzy widzi"
  );
  lines.push(
    "mocnego zawodnika za grosze — wyświetlana cena przestaje znaczyć „ile on jest wart”, a zaczyna znaczyć"
  );
  lines.push(
    "„ile masz”. **Spek 5 §6 ten mechanizm usuwa**, więc ten raport go nie naprawia ani nie przypina jako"
  );
  lines.push(
    "poprawnego. Liczba niżej jest bazą: gdy limit zniknie, ten sam pomiar pokaże, jak duży klif się odsłania."
  );
  lines.push("");
  lines.push("| klub | budżet | ilu OVR z pasma limit tnie | najgłębsze cięcie |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const row of summary.metrics.priceCap) {
    lines.push(
      `| ${row.clubShortName} | ${pl(row.budget)} | ${row.cutCount} / ${READY_BAND.maxOvr - READY_BAND.minOvr + 1} | ${pl(row.deepestCutShare * 100, 1)}% |`
    );
  }
  lines.push("");

  if (summary.metrics.verdictShift) {
    const shift = summary.metrics.verdictShift;
    lines.push("## `VERDICT_KASA` — pomiar, nie decyzja");
    lines.push("");
    lines.push(
      "`computeVerdict` liczy `ocena = pkt + trofea × VERDICT_TROFEUM + kasa × VERDICT_KASA − spadki × VERDICT_SPADEK`"
    );
    lines.push(
      "i porównuje ją z `PROGI_WERDYKTU`. `VERDICT_KASA = 5` to **ta sama liczba co historyczne `LEGACY_KASA`**"
    );
    lines.push(
      "i z tego samego powodu: obie przeliczały gotówkę na punkty przy starej skali. Ani plan, ani spek nie"
    );
    lines.push(
      "wymieniały jej wśród stałych, które aktywacja przecenia — więc **została nietknięta**, a to jest pomiar,"
    );
    lines.push("który zamienia tę nietykalność w decyzję do podjęcia, nie w przeoczenie.");
    lines.push("");
    lines.push("| wielkość | przed | po |");
    lines.push("| --- | ---: | ---: |");
    lines.push(
      `| mediana gotówki końcowej | ${pl(shift.medianCashBefore)} | ${pl(shift.medianCashAfter)} |`
    );
    lines.push(
      `| wkład \`kasa × VERDICT_KASA\` do \`ocena\` | ${pl(shift.contributionBefore, 1)} | ${pl(shift.contributionAfter, 1)} |`
    );
    for (const row of shift.distribution) {
      lines.push(`| kariery: ${row.title} | ${row.before} | ${row.after} |`);
    }
    lines.push("");
    lines.push(
      `Karier, które **na pewno** zmieniły szczebel werdyktu: **${shift.changedClass}** z ${shift.careers} — to przejścia między najniższą gałęzią a jedną z trzech wyższych.`
    );
    lines.push(
      `Wśród klubów **bez** miejsca europejskiego, gdzie zmieniły się wyłącznie pieniądze: co najmniej **${shift.changedClassWithoutBerth}** z ${shift.careersWithoutBerth}.`
    );
    lines.push(
      "Ta druga liczba jest właściwym odczytem wpływu `VERDICT_KASA` — werdykt klubu z pucharem rusza się także"
    );
    lines.push(
      "dlatego, że kampania sezonu 1 zmienia siłę kadry, a przez nią tabelę i punkty, na których werdykt stoi."
    );
    lines.push("");
    lines.push(
      "Rozdzielczość tego pomiaru jest ograniczona i trzeba to powiedzieć wprost: snapshot preaktywacyjny"
    );
    lines.push(
      "zapisuje, **czy** werdykt losował, a nie jego tytuł, więc odróżnia najniższą gałąź od pozostałych trzech,"
    );
    lines.push(
      "ale nie tych trzech od siebie. Liczba wyżej jest zatem **podłogą** liczby zmian szczebla, nie jej"
    );
    lines.push(
      "dokładną wartością — kariera, która przeszła z drugiej gałęzi na trzecią, jest tu niewidoczna."
    );
    lines.push("");
    lines.push(
      "**Decyzja należy do właściciela produktu.** Jeżeli `VERDICT_KASA` jest **jednostką**, konwersja należy do"
    );
    lines.push(
      "commita aktywacyjnego, tak jak oba mnożniki dziedzictwa. Jeżeli jest **pokrętłem kalibracyjnym**, czeka na"
    );
    lines.push(
      "wspólną kalibrację po speku 5, razem z `handicapKadencja` i `PROGI_WERDYKTU`. Ten plan jej nie przelicza."
    );
    lines.push("");
  }

  if (summary.metrics.freeAgents) {
    lines.push("## Obciążenie płacowe karty WOLNY");
    lines.push("");
    lines.push(
      "| polityka | podpisań | mediana udziału jednostkowego | nadpłata / odstępne | w paśmie 0,40–0,60 |"
    );
    lines.push("| --- | ---: | ---: | ---: | --- |");
    for (const row of summary.metrics.freeAgents) {
      lines.push(
        `| ${row.policyName} | ${row.signings} | ${pl(row.medianUnitShare, 4)} | ${pl(row.achievedRatio, 4)} | ${row.withinBand ? "tak" : "**nie**"} |`
      );
    }
    lines.push("");
  }

  if (summary.metrics.legacy) {
    lines.push("## Jednostka dziedzictwa");
    lines.push("");
    lines.push(
      "| wielkość | iloczyn historyczny | nowa mediana | mnożnik | iloczyn odtworzony | błąd |"
    );
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
    for (const row of summary.metrics.legacy) {
      lines.push(
        `| \`${row.quantity}\` | ${pl(row.historicalProduct, 4)} | ${pl(row.newMedian, 4)} | ${pl(row.multiplier, 4)} | ${pl(row.rebuiltProduct, 4)} | ${pl(row.relativeError * 100, 2)}% |`
      );
    }
    lines.push("");
  }

  if (summary.metrics.rng) {
    const rng = summary.metrics.rng;
    lines.push("## Parowanie liczników RNG");
    lines.push("");
    lines.push(
      "Aktywacja zmienia to, ile pieniądz jest wart, a nie ile wartości kariera losuje — z dwoma"
    );
    lines.push(
      "wyjątkami, obydwoma wymuszonymi przez sam plan. Pierwszy sezon odtwarza prawdziwe miejsca"
    );
    lines.push(
      "europejskie 2026/27, więc pięć klubów rozgrywa kampanię, której wcześniej nie było, a kampania"
    );
    lines.push(
      "losuje. Drugi: `computeVerdict` punktuje kadencję **także z gotówki**, a najniższa z jego"
    );
    lines.push(
      "czterech gałęzi jako jedyna wraca bez losowania — kariera, którą gotówka przesunęła przez tę"
    );
    lines.push(
      "granicę, zużywa o jedno losowanie więcej lub mniej i przestawia cały epilog za sobą."
    );
    lines.push("");
    lines.push("| wielkość | wartość |");
    lines.push("| --- | ---: |");
    lines.push(`| sparowanych po (klub, seed) | ${rng.pairs} |`);
    lines.push(`| identycznych | ${rng.identical} |`);
    lines.push(`| wyjaśnione pucharem sezonu 1 | ${rng.explainedByBerth} |`);
    lines.push(`| wyjaśnione gałęzią werdyktu | ${rng.explainedByVerdict} |`);
    lines.push(`| **niewyjaśnionych** | **${rng.unexplained.length}** |`);
    lines.push(`| braków w snapshocie | ${rng.missing} |`);
    lines.push(`| **zmian kadencji w klubie bez pucharu** | **${rng.tenureMovedWithoutBerth}** |`);
    lines.push("");
    lines.push(
      `Kariery pięciu klubów z pucharem: ${rng.berth.careers}. Kampania zużywa **zmienną** liczbę losowań, więc różnica jest`
    );
    lines.push(
      `szerokim rozkładem, nie stałym przesunięciem: p05 ${rng.berth.deltaP05}, mediana ${rng.berth.deltaMedian}, p95 ${rng.berth.deltaP95}.`
    );
    lines.push(
      `Z tego **${rng.berth.unchangedTally}** karier ma niezmieniony licznik — i to nie jest osobna kategoria wymagająca własnej`
    );
    lines.push(
      `przyczyny, tylko środek tego rozkładu. Rozstrzyga je \`pktA\`, które zależy od siły kadry i losowości meczu,`
    );
    lines.push(
      `ale nigdy od pieniędzy: **${rng.berth.unchangedTallyAndPoints}** z nich zachowało identyczne punkty, czyli ich strumień faktycznie się nie`
    );
    lines.push(
      `rozszedł, a pozostałe rozeszły się i wróciły do tej samej sumy przypadkiem. W drugą stronę **${rng.berth.movedTallySamePoints}** karier ma`
    );
    lines.push("inną sumę przy identycznych punktach.");
    lines.push("");
    lines.push(
      "Dwa ostatnie wiersze tabeli są bramką. Zero w drugim z nich mówi więcej niż sama zgodność liczników:"
    );
    lines.push(
      "kadencja klubu bez pucharu — liczba rozegranych sezonów i liczba spadków — jest nietknięta,"
    );
    lines.push("czyli nowa ekonomia nie przestawiła po cichu samej rozgrywki.");
    if (rng.unexplained.length > 0) {
      lines.push("");
      lines.push("| klub | seed | przed | po |");
      lines.push("| --- | ---: | ---: | ---: |");
      for (const row of rng.unexplained) {
        lines.push(`| ${row.club} | ${row.seed} | ${row.before} | ${row.after} |`);
      }
    }
    lines.push("");
  }

  // No trailing blank: the caller adds the closing newline, so ending on an
  // empty line here makes `git diff --check` flag the committed report.
  return lines.join("\n").trimEnd();
};

/** Nothing runs on import: the tests build small dumps by hand and must not
 * read a real one to do it. */
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

export { main as runFinanceActivationReport, counterfactualFee, parseCareerDump, parseSignings };
