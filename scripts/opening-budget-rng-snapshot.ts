import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { ACTIVE_CLUBS } from "./balance-cli";
import { parseFlags } from "./cli-args";
import {
  NO_DRAW_VERDICT,
  PINNED_DUMP_SCHEMA,
  parseCareerDump,
  parseSeasonDump,
  type CareerRow,
  type SeasonRow,
} from "./opening-budget-activation-report-core";
import { at, recordAt } from "../src/logic/invariant";

/**
 * Pins the RNG evidence the opening-budget activation is judged against.
 *
 * The activation changes what a club can BUY on day one and how much of a
 * season's result reaches the budget. In the controlled passive run it must
 * therefore change money and nothing else - and the only way to say so rather
 * than hope it is to record, before the change, exactly what every career did,
 * then pair the same careers afterwards. Once the activation lands, the code
 * that produced these numbers is gone from the working tree, so the snapshot
 * has to be a committed artefact rather than something recomputed on demand.
 *
 * This tool simulates nothing. It reads two dumps, refuses anything that is
 * not the run the plan specifies, and writes what it found.
 */

export const OPENING_BUDGET_SNAPSHOT_SCHEMA_VERSION = 1;

const REQUIRED_POLICY = "alwaysPass";
const REQUIRED_INCOME_MODE = "finance-control";

const PURPOSE =
  "Preaktywacyjny ślad karier kontrolnych (alwaysPass, finance-control) przed aktywacją budżetu pierwszego okna i stopy reinwestycji. Parowany po (klub, seed): pola prewerdyktowe muszą zostać identyczne, a różnica licznika losowań jest dozwolona wyłącznie po zmianie klasy losowania werdyktu.";

/** What each career tuple means, in order. Written into the file so it reads
 * without this source. */
export const CAREER_COLUMNS = [
  "sezonyRozegrane",
  "pktA",
  "trofea",
  "sezonyLM",
  "sezonyLE",
  "sezonyLK",
  "handoverSeason",
  "spadkiKadencja",
  "pierwszySpadekSezon",
  "verdictIndex",
  "verdictDraws",
  "rngDrawCount",
] as const;

/** What each season tuple means, in order. */
export const SEASON_COLUMNS = [
  "season",
  "actualBalanceWithoutTransfersAndCups",
  "creditedCupIncome",
  "rngDrawCount",
] as const;

export type OpeningBudgetRngSnapshot = {
  readonly schemaVersion: number;
  readonly purpose: string;
  /**
   * Two identifiers, kept apart rather than pretended to be one.
   *
   * `baseSha` is the commit whose engine PRODUCED the dumps; `toolSha` is the
   * commit that carried the code which BUILT this file. They are different by
   * construction - the tool is committed after the dumps are taken - and
   * collapsing them would misname the evidence.
   */
  readonly baseSha: string;
  readonly toolSha: string;
  readonly dumps: {
    readonly raw: { readonly path: string; readonly sha256: string };
    readonly seasons: { readonly path: string; readonly sha256: string };
  };
  readonly run: {
    readonly seed: string;
    readonly runsPerCell: number;
    readonly policies: readonly string[];
    readonly clubs: readonly string[];
    readonly incomeMode: string;
    readonly dumpSchemaVersion: number;
    readonly engineVersion: string;
  };
  readonly careerCount: number;
  /** The verdict titles, indexed. Career tuples carry the index so the file
   * stays numeric; the full title is what the report compares. */
  readonly verdicts: readonly string[];
  readonly careerColumns: readonly string[];
  readonly seasonColumns: readonly string[];
  /** club -> seed -> `{ c: career tuple, s: [season tuple, ...] }`. */
  readonly careers: Record<
    string,
    Record<string, { readonly c: readonly number[]; readonly s: readonly (readonly number[])[] }>
  >;
};

export type SnapshotInput = {
  readonly rawCsv: string;
  readonly seasonsCsv: string;
  readonly rawPath: string;
  readonly seasonsPath: string;
  readonly rawSha256: string;
  readonly seasonsSha256: string;
  readonly baseSha: string;
  readonly toolSha: string;
  readonly seed: string;
  readonly clubs: readonly string[];
  readonly runsPerCell: number;
};

/**
 * Reads both dumps of the pinned control run and writes the tallies down,
 * refusing every shape that is not that run: a normal economy, a policy that
 * signs, a short matrix, a career whose seasons do not line up with itself.
 */
export const buildSnapshot = (input: SnapshotInput): OpeningBudgetRngSnapshot => {
  const expectation = {
    incomeMode: REQUIRED_INCOME_MODE,
    clubs: input.clubs,
    policies: [REQUIRED_POLICY],
    runsPerCell: input.runsPerCell,
  };
  const careerRows: CareerRow[] = parseCareerDump(input.rawCsv, expectation);
  const seasonRows: SeasonRow[] = parseSeasonDump(input.seasonsCsv, expectation);

  const seasonsByCareer = new Map<string, SeasonRow[]>();
  for (const row of seasonRows) {
    const key = `${row.clubShortName}\0${row.policyName}\0${row.seed}`;
    const list = seasonsByCareer.get(key);
    if (list) list.push(row);
    else seasonsByCareer.set(key, [row]);
  }

  const verdicts: string[] = [];
  const verdictIndex = (title: string): number => {
    const found = verdicts.indexOf(title);
    if (found !== -1) return found;
    verdicts.push(title);
    return verdicts.length - 1;
  };

  const careers: Record<
    string,
    Record<string, { c: readonly number[]; s: readonly (readonly number[])[] }>
  > = {};

  for (const row of careerRows) {
    const key = `${row.clubShortName}\0${row.policyName}\0${row.seed}`;
    const seasons = seasonsByCareer.get(key);
    if (seasons === undefined) {
      throw new Error(`${row.clubShortName}/${row.seed}: the career has no seasons in the dump`);
    }
    // The two dumps are written by separate paths through the same trace, so
    // an inconsistency between them is real evidence of a broken run rather
    // than a formality.
    if (seasons.length !== row.sezonyRozegrane) {
      throw new Error(
        `${row.clubShortName}/${row.seed}: ${seasons.length} season rows against sezonyRozegrane ${row.sezonyRozegrane}`
      );
    }
    const perClub = (careers[row.clubShortName] ??= {});
    perClub[String(row.seed)] = {
      c: [
        row.sezonyRozegrane,
        row.pktA,
        row.trofea,
        row.sezonyLM,
        row.sezonyLE,
        row.sezonyLK,
        row.handoverSeason,
        row.spadkiKadencja,
        row.pierwszySpadekSezon,
        verdictIndex(row.werdykt),
        row.verdictDraws,
        row.rngDrawCount,
      ],
      s: [...seasons]
        .sort((a, b) => a.season - b.season)
        .map((season) => [
          season.season,
          season.actualBalanceWithoutTransfersAndCups,
          season.creditedCupIncome,
          season.rngDrawCount,
        ]),
    };
  }

  const engineVersions = [...new Set(seasonRows.map((row) => row.engineVersion))];
  if (engineVersions.length !== 1) {
    throw new Error(`season dump declares ${engineVersions.length} engine versions`);
  }

  return {
    schemaVersion: OPENING_BUDGET_SNAPSHOT_SCHEMA_VERSION,
    purpose: PURPOSE,
    baseSha: input.baseSha,
    toolSha: input.toolSha,
    dumps: {
      raw: { path: input.rawPath, sha256: input.rawSha256 },
      seasons: { path: input.seasonsPath, sha256: input.seasonsSha256 },
    },
    run: {
      seed: input.seed,
      runsPerCell: input.runsPerCell,
      policies: [REQUIRED_POLICY],
      clubs: [...input.clubs].sort(),
      incomeMode: REQUIRED_INCOME_MODE,
      dumpSchemaVersion: PINNED_DUMP_SCHEMA,
      engineVersion: at(engineVersions, 0, "the single engine version"),
    },
    careerCount: careerRows.length,
    verdicts,
    careerColumns: [...CAREER_COLUMNS],
    seasonColumns: [...SEASON_COLUMNS],
    careers,
  };
};

/**
 * Serialises the snapshot with each tuple on one line.
 *
 * `JSON.stringify(x, null, 2)` puts every array element on its own line,
 * which would turn eighteen thousand careers into a file many times the size
 * and unreadable besides. Everything above `careers` keeps the usual
 * indentation, so the header still reads like a document.
 */
export const serialiseSnapshot = (snapshot: OpeningBudgetRngSnapshot): string => {
  const { careers, ...header } = snapshot;
  const head = JSON.stringify(header, null, 2);
  const clubs = Object.keys(careers)
    .sort()
    .map((club) => {
      const clubCareers = recordAt(careers, club, "snapshot club");
      const entries = Object.keys(clubCareers)
        .sort((a, b) => Number(a) - Number(b))
        .map((seed) => {
          const entry = recordAt(clubCareers, seed, "snapshot seed");
          const seasons = entry.s.map((tuple) => `[${tuple.join(", ")}]`).join(", ");
          return `      "${seed}": { "c": [${entry.c.join(", ")}], "s": [${seasons}] }`;
        })
        .join(",\n");
      return `    ${JSON.stringify(club)}: {\n${entries}\n    }`;
    })
    .join(",\n");
  return `${head.slice(0, -2)},\n  "careers": {\n${clubs}\n  }\n}\n`;
};

/** The shape the report reads back, with the tuples resolved into names. */
export const readSnapshotCareer = (
  snapshot: OpeningBudgetRngSnapshot,
  club: string,
  seed: number
):
  | {
      sezonyRozegrane: number;
      pktA: number;
      trofea: number;
      sezonyLM: number;
      sezonyLE: number;
      sezonyLK: number;
      handoverSeason: number;
      spadkiKadencja: number;
      pierwszySpadekSezon: number;
      werdykt: string;
      verdictDraws: 0 | 1;
      rngDrawCount: number;
      seasons: {
        season: number;
        actualBalanceWithoutTransfersAndCups: number;
        creditedCupIncome: number;
        rngDrawCount: number;
      }[];
    }
  | undefined => {
  const entry = snapshot.careers[club]?.[String(seed)];
  if (entry === undefined) return undefined;
  const c = entry.c;
  if (c.length !== CAREER_COLUMNS.length) {
    throw new Error(`${club}/${seed}: career tuple has ${c.length} values`);
  }
  const cell = (index: number): number => at(c, index, `${club}/${seed} career tuple`);
  const verdict = snapshot.verdicts[cell(9)];
  if (verdict === undefined) throw new Error(`${club}/${seed}: unknown verdict index ${cell(9)}`);
  return {
    sezonyRozegrane: cell(0),
    pktA: cell(1),
    trofea: cell(2),
    sezonyLM: cell(3),
    sezonyLE: cell(4),
    sezonyLK: cell(5),
    handoverSeason: cell(6),
    spadkiKadencja: cell(7),
    pierwszySpadekSezon: cell(8),
    werdykt: verdict,
    verdictDraws: cell(10) === 0 ? 0 : 1,
    rngDrawCount: cell(11),
    seasons: entry.s.map((tuple) => {
      if (tuple.length !== SEASON_COLUMNS.length) {
        throw new Error(`${club}/${seed}: season tuple has ${tuple.length} values`);
      }
      const value = (index: number): number => at(tuple, index, `${club}/${seed} season tuple`);
      return {
        season: value(0),
        actualBalanceWithoutTransfersAndCups: value(1),
        creditedCupIncome: value(2),
        rngDrawCount: value(3),
      };
    }),
  };
};

/** Loads and shape-checks a snapshot file's parsed contents. A file that
 * declares another schema is refused rather than read optimistically. */
export const validateSnapshot = (parsed: unknown): OpeningBudgetRngSnapshot => {
  const snapshot = parsed as OpeningBudgetRngSnapshot;
  if (snapshot?.schemaVersion !== OPENING_BUDGET_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(
      `snapshot schema ${String(snapshot?.schemaVersion)} is not ${OPENING_BUDGET_SNAPSHOT_SCHEMA_VERSION}`
    );
  }
  if (snapshot.run?.incomeMode !== REQUIRED_INCOME_MODE) {
    throw new Error(`snapshot incomeMode "${snapshot.run?.incomeMode}" is not controlled`);
  }
  if (!snapshot.verdicts?.includes(NO_DRAW_VERDICT)) {
    throw new Error(`snapshot records no "${NO_DRAW_VERDICT}" verdict; the draw class is unusable`);
  }
  if (!Number.isSafeInteger(snapshot.careerCount) || snapshot.careerCount <= 0) {
    throw new Error("snapshot records no careers");
  }
  return snapshot;
};

const KNOWN_FLAGS = ["--raw", "--seasons", "--output", "--base-sha", "--tool-sha", "--help"];
const VALUELESS_FLAGS = ["--help"];

const HELP = `pnpm exec tsx scripts/opening-budget-rng-snapshot.ts --raw <csv> --seasons <csv> --output <json> --base-sha <sha> --tool-sha <sha>

Zapisuje preaktywacyjny ślad karier z pary dumpów \`--finance-control alwaysPass\`.
Niczego nie symuluje: czyta dwa pliki i odmawia, gdy to nie ten przebieg.

  --raw <csv>       dump karier (--dump-raw)
  --seasons <csv>   dump sezonów (--dump-seasons)
  --output <json>   plik wynikowy
  --base-sha <sha>  commit, na którym powstały dumpy
  --tool-sha <sha>  commit z tym narzędziem`;

const main = (argv: readonly string[]): void => {
  const flags = parseFlags([...argv], KNOWN_FLAGS, VALUELESS_FLAGS);
  if (flags.has("--help")) {
    console.log(HELP);
    return;
  }
  for (const flag of ["--raw", "--seasons", "--output", "--base-sha", "--tool-sha"]) {
    if (!flags.has(flag)) throw new Error(`${flag} is required`);
  }
  const rawPath = flags.get("--raw")!;
  const seasonsPath = flags.get("--seasons")!;
  const rawBytes = readFileSync(rawPath);
  const seasonBytes = readFileSync(seasonsPath);
  // Only the file NAME goes into the artefact. The dumps live in a temporary
  // directory, and an absolute path out of one machine's home would be both
  // a privacy leak and a lie to the next reader - the sha256 beside it is
  // what identifies the file anyway.
  const nameOf = (path: string): string => path.replace(/\\/g, "/").split("/").pop() ?? path;

  const snapshot = buildSnapshot({
    rawCsv: rawBytes.toString("utf8"),
    seasonsCsv: seasonBytes.toString("utf8"),
    rawPath: nameOf(rawPath),
    seasonsPath: nameOf(seasonsPath),
    rawSha256: createHash("sha256").update(rawBytes).digest("hex"),
    seasonsSha256: createHash("sha256").update(seasonBytes).digest("hex"),
    baseSha: flags.get("--base-sha")!,
    toolSha: flags.get("--tool-sha")!,
    seed: "0x5eed0001",
    clubs: ACTIVE_CLUBS,
    runsPerCell: 1000,
  });

  writeFileSync(flags.get("--output")!, serialiseSnapshot(snapshot), "utf8");
  console.log(
    `Zapisano ${snapshot.careerCount} karier z ${snapshot.run.clubs.length} klubów (silnik ${snapshot.run.engineVersion}) do ${flags.get("--output")}`
  );
};

/** Nothing runs on import: the tests build small dumps by hand and must not
 * read a real one to do it. */
const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    main(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
