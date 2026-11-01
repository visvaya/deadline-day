import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { ENGINE_REVISION } from "../src/logic/engine-version";
import { ACTIVE_CLUBS } from "./balance-cli";
import { ACCEPTED_DUMP_SCHEMA_VERSIONS } from "./balance-metrics";
import { parseFlags } from "./cli-args";
import { parseCsvLine } from "./csv";
import { at, recordAt } from "../src/logic/invariant";

/**
 * Pins the RNG evidence the economy activation is judged against.
 *
 * The activation changes money, not draws. The only way to say so rather than
 * hope it is to record, before the change, how many times every controlled
 * career touched the generator - and to pair those tallies with the same
 * careers afterwards. Once the activation lands, the code that produced these
 * numbers is gone from the working tree, so the snapshot has to be a
 * committed artefact rather than something recomputed on demand.
 *
 * This tool simulates nothing. It reads one dump, refuses anything that is
 * not the run the plan specifies, and writes the tallies down.
 */

export const RNG_SNAPSHOT_SCHEMA_VERSION = 2;

/**
 * The verdict title whose branch draws NOTHING.
 *
 * `computeVerdict` (src/logic/scoring.ts) has four branches: the first
 * returns before touching the generator, the other three each `pick` one
 * value. The verdict score reads the club's cash, so activating the economy
 * moves careers across that boundary - and a career that crosses it consumes
 * one draw more or fewer than before, which then shifts the whole epilogue.
 *
 * Recording it here is what lets a later difference be ATTRIBUTED rather than
 * merely observed. Without it the snapshot can say two runs differ but not
 * why, and "why" is the entire question.
 */
export const NO_DRAW_VERDICT = "ROZWIĄZANIE KONTRAKTU";

/** The only policy and economy a preactivation RNG snapshot may come from.
 * alwaysPass never signs, so its careers are the ones where a moved draw
 * cannot be explained away by a different decision. */
const REQUIRED_POLICY = "alwaysPass";
const REQUIRED_INCOME_MODE = "finance-control";

const REQUIRED_COLUMNS = [
  "polityka",
  "seed",
  "clubShortName",
  "incomeMode",
  "dumpSchemaVersion",
  "rngDrawCount",
  "werdykt",
  "sezonyRozegrane",
  "spadkiKadencja",
  "kasa",
  "pktA",
] as const;

export type RngSnapshotRun = {
  readonly seed: string;
  readonly runsPerCell: number;
  readonly policies: readonly string[];
  readonly clubs: readonly string[];
  readonly incomeMode: string;
  readonly dumpSchemaVersion: number;
  readonly engineRevision: string;
};

export type RngSnapshot = {
  readonly schemaVersion: number;
  /** Why the file exists, so a reader who finds it in a year knows what it
   * is evidence of without reconstructing the plan. */
  readonly purpose: string;
  /** The commit the tallies were produced on. */
  readonly baseSha: string;
  readonly dump: { readonly path: string; readonly sha256: string };
  readonly run: RngSnapshotRun;
  readonly careerCount: number;
  /** What the four numbers of each career tuple mean, in order. Written into
   * the file so it reads without this source. */
  readonly columns: readonly string[];
  /**
   * club -> seed (as a string key) -> `[rngDrawCount, verdictDraws,
   * seasonsPlayed, tenureRelegations, kasa, leaguePoints]`.
   *
   * A tuple rather than four maps, and four numbers rather than one: the
   * tally alone can say two runs differ but not why. `verdictDraws` is 0 for
   * the single verdict branch that returns before touching the generator and
   * 1 for the other three, and the two tenure figures are what let a later
   * report claim - rather than assume - that the activated economy left the
   * played seasons alone.
   */
  readonly careers: Record<string, Record<string, readonly number[]>>;
};

export const CAREER_COLUMNS = [
  "rngDrawCount",
  "verdictDraws",
  "seasonsPlayed",
  "tenureRelegations",
  "kasa",
  "leaguePoints",
] as const;

export type RngSnapshotInput = {
  readonly csv: string;
  readonly dumpPath: string;
  readonly sha256: string;
  readonly baseSha: string;
  readonly engineRevision: string;
  readonly seed: string;
  readonly clubs: readonly string[];
  readonly runsPerCell: number;
};

const PURPOSE =
  "Preaktywacyjne liczniki losowań RNG (alwaysPass, finance-control). Parowane po (klub, seed) w raporcie aktywacji ekonomii; verdictDraws pozwala przypisać różnicę do gałęzi werdyktu, która jako jedyna nie losuje.";

/**
 * Reads the tallies off a raw balance dump, refusing every shape that is not
 * the pinned run. Each refusal is a case where the file would still look like
 * a snapshot: a normal-economy run, a policy that signs, a short matrix, a
 * career counted twice.
 */
export const buildRngSnapshot = (input: RngSnapshotInput): RngSnapshot => {
  const lines = input.csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) throw new Error("The dump is empty: no header row");
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  for (const column of REQUIRED_COLUMNS) {
    if (!header.includes(column)) {
      throw new Error(`The dump is missing the "${column}" column`);
    }
  }

  const careers: Record<string, Record<string, readonly number[]>> = {};
  const expected = new Set(input.clubs);
  let careerCount = 0;
  let observedSchema: number | null = null;

  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(at(lines, i, "CSV line"));
    const cell = (column: string): string => fields[header.indexOf(column)] ?? "";
    const club = cell("clubShortName");
    const seed = cell("seed");

    if (cell("polityka") !== REQUIRED_POLICY) {
      throw new Error(
        `Row ${i}: policy "${cell("polityka")}" is not ${REQUIRED_POLICY}; the snapshot only records the passive run`
      );
    }
    if (cell("incomeMode") !== REQUIRED_INCOME_MODE) {
      throw new Error(
        `Row ${i}: incomeMode "${cell("incomeMode")}" is not ${REQUIRED_INCOME_MODE}; the snapshot only records the control economy`
      );
    }
    const rowSchema = Number(cell("dumpSchemaVersion"));
    if (!ACCEPTED_DUMP_SCHEMA_VERSIONS.includes(rowSchema)) {
      throw new Error(
        `Row ${i}: dump schema ${cell("dumpSchemaVersion")} is not one of ${ACCEPTED_DUMP_SCHEMA_VERSIONS.join(", ")}; only a dump that carries rngDrawCount can be snapshotted`
      );
    }
    // Recorded from the rows rather than from the constant. Two versions are
    // accepted now, so writing the constant into the snapshot would label a
    // schema-3 dump as whatever the code happened to be compiled against.
    if (observedSchema !== null && observedSchema !== rowSchema) {
      throw new Error(
        `Row ${i}: dump mixes schema ${observedSchema} and ${rowSchema}; a snapshot must come from one run`
      );
    }
    observedSchema = rowSchema;
    if (!expected.has(club)) {
      throw new Error(`Row ${i}: club "${club}" is not in the pinned club list`);
    }
    const draws = Number(cell("rngDrawCount"));
    if (!Number.isSafeInteger(draws) || draws <= 0) {
      throw new Error(`Row ${i}: rngDrawCount "${cell("rngDrawCount")}" is not a positive integer`);
    }

    const verdict = cell("werdykt");
    if (verdict === "") throw new Error(`Row ${i}: missing verdict`);
    const seasonsPlayed = Number(cell("sezonyRozegrane"));
    const relegations = Number(cell("spadkiKadencja"));
    const kasa = Number(cell("kasa"));
    if (!Number.isFinite(kasa)) {
      throw new Error(`Row ${i}: kasa "${cell("kasa")}" is not a finite number`);
    }
    const leaguePoints = Number(cell("pktA"));
    if (!Number.isFinite(leaguePoints)) {
      throw new Error(`Row ${i}: pktA "${cell("pktA")}" is not a finite number`);
    }
    if (!Number.isSafeInteger(seasonsPlayed) || seasonsPlayed <= 0) {
      throw new Error(
        `Row ${i}: sezonyRozegrane "${cell("sezonyRozegrane")}" is not a positive integer`
      );
    }
    if (!Number.isSafeInteger(relegations) || relegations < 0) {
      throw new Error(`Row ${i}: spadkiKadencja "${cell("spadkiKadencja")}" is not a whole count`);
    }

    const perClub = (careers[club] ??= {});
    if (seed in perClub) {
      throw new Error(`Row ${i}: duplicate career (${club}, seed ${seed})`);
    }
    perClub[seed] = [
      draws,
      verdict === NO_DRAW_VERDICT ? 0 : 1,
      seasonsPlayed,
      relegations,
      kasa,
      leaguePoints,
    ];
    careerCount += 1;
  }

  if (careerCount === 0) throw new Error("The dump has no career rows");
  if (observedSchema === null) throw new Error("The dump declared no schema version");

  for (const club of input.clubs) {
    const perClub = careers[club];
    if (!perClub) throw new Error(`No careers for club "${club}"`);
    const n = Object.keys(perClub).length;
    if (n !== input.runsPerCell) {
      throw new Error(
        `Club "${club}" has ${n} career${n === 1 ? "" : "s"}, expected ${input.runsPerCell}`
      );
    }
  }

  return {
    schemaVersion: RNG_SNAPSHOT_SCHEMA_VERSION,
    purpose: PURPOSE,
    baseSha: input.baseSha,
    dump: { path: input.dumpPath, sha256: input.sha256 },
    run: {
      seed: input.seed,
      runsPerCell: input.runsPerCell,
      policies: [REQUIRED_POLICY],
      clubs: [...input.clubs].sort(),
      incomeMode: REQUIRED_INCOME_MODE,
      dumpSchemaVersion: observedSchema,
      engineRevision: input.engineRevision,
    },
    careerCount,
    columns: [...CAREER_COLUMNS],
    careers,
  };
};

/**
 * Serialises the snapshot with each career's tuple on one line.
 *
 * `JSON.stringify(x, null, 2)` puts every array element on its own line, which
 * would turn eighteen thousand four-number tuples into a file five times the
 * size and unreadable besides. Everything else keeps the usual indentation, so
 * the header of the file still reads like a document.
 */
export const serialiseSnapshot = (snapshot: RngSnapshot): string => {
  const { careers, ...header } = snapshot;
  const head = JSON.stringify(header, null, 2);
  const clubs = Object.keys(careers)
    .sort()
    .map((club) => {
      const clubCareers = recordAt(careers, club, "snapshot club");
      const entries = Object.keys(clubCareers)
        .sort((a, b) => Number(a) - Number(b))
        .map(
          (seed) => `      "${seed}": [${recordAt(clubCareers, seed, "snapshot seed").join(", ")}]`
        )
        .join(",\n");
      return `    ${JSON.stringify(club)}: {\n${entries}\n    }`;
    })
    .join(",\n");
  // Splice the careers block in before the closing brace of the header.
  return `${head.slice(0, -2)},\n  "careers": {\n${clubs}\n  }\n}\n`;
};

const KNOWN_FLAGS = ["--input", "--output", "--base-sha", "--seed", "--runs", "--help"];
const VALUELESS_FLAGS = ["--help"];

const HELP = `pnpm exec tsx scripts/rng-control-snapshot.ts --input <csv> --output <json> --base-sha <sha> [--seed 0x5eed0001] [--runs 1000]

Zapisuje preaktywacyjne liczniki losowań z dumpu \`--finance-control alwaysPass\`.
Niczego nie symuluje: czyta jeden plik i odmawia, gdy to nie ten przebieg.`;

const main = (argv: readonly string[]): void => {
  const flags = parseFlags([...argv], KNOWN_FLAGS, VALUELESS_FLAGS);
  if (flags.has("--help")) {
    console.log(HELP);
    return;
  }
  for (const flag of ["--input", "--output", "--base-sha"]) {
    if (!flags.has(flag)) throw new Error(`${flag} is required`);
  }
  const inputPath = flags.get("--input")!;
  const outputPath = flags.get("--output")!;
  const runsRaw = flags.get("--runs") ?? "1000";
  const runsPerCell = Number(runsRaw);
  if (!Number.isSafeInteger(runsPerCell) || runsPerCell <= 0) {
    throw new Error(`Invalid --runs value: "${runsRaw}"`);
  }

  const bytes = readFileSync(inputPath);
  const snapshot = buildRngSnapshot({
    csv: bytes.toString("utf8"),
    dumpPath: inputPath.replace(/\\/g, "/"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    baseSha: flags.get("--base-sha")!,
    engineRevision: ENGINE_REVISION,
    seed: flags.get("--seed") ?? "0x5eed0001",
    clubs: ACTIVE_CLUBS,
    runsPerCell,
  });

  writeFileSync(outputPath, serialiseSnapshot(snapshot), "utf8");
  console.log(
    `Zapisano ${snapshot.careerCount} liczników z ${snapshot.run.clubs.length} klubów do ${outputPath}`
  );
};

/** Nothing runs on import: the test above builds small dumps by hand and must
 * not read a real one to do it. */
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
