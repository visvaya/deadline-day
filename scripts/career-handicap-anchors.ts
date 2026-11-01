import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { advantageScoreFor, projectedSeasonBalance } from "../src/logic/club-projection";
import { initialClubProjection } from "../src/logic/league-projection";
import { structuralPurchasingPower } from "../src/logic/opening-budget";
import { parseFlags } from "./cli-args";
import { at } from "../src/logic/invariant";

/**
 * Derives, from the ACTIVE economy, the point every former difficulty pool's
 * `advantageScore` would land on today - and freezes it as the anchor a
 * career's `tenureHandicap`/`legacyHandicap` interpolates between.
 *
 * The three former pools (`src/data/difficulty-levels.ts`) are gone as a
 * player-facing choice, but the numeric handicap LEVELS they used to hand
 * out - 0/55/110 and 0/85/130 - are not being re-tuned by this task. What
 * moves is only WHERE on the new `advantageScore` axis those levels sit,
 * because that axis did not exist when the levels were picked. This script
 * measures that position and nothing else: it never touches the levels
 * themselves.
 *
 * The historical pool membership is copied here as club ids rather than
 * imported from `difficulty-levels.ts`, so this script's anchors survive
 * that file's eventual removal and do not silently change if it is ever
 * edited for an unrelated reason.
 */

export type CareerHandicapPool = "latwy" | "sredni" | "trudny";

const POOL_ORDER: readonly CareerHandicapPool[] = ["latwy", "sredni", "trudny"];

/** The numeric levels the three former difficulty pools handed out. Frozen -
 * this task derives an anchor POSITION, never a level. */
const HANDICAP_LEVELS: Readonly<
  Record<CareerHandicapPool, { tenureHandicap: number; legacyHandicap: number }>
> = {
  latwy: { tenureHandicap: 0, legacyHandicap: 0 },
  sredni: { tenureHandicap: 55, legacyHandicap: 85 },
  trudny: { tenureHandicap: 110, legacyHandicap: 130 },
};

/**
 * Which club ids belonged to each pool, transcribed from
 * `src/data/difficulty-levels.ts` (`POZIOMY`) as it stood before club choice
 * replaced difficulty selection. A local, historical copy rather than an
 * import: `difficulty-levels.ts` is kept around only for that history and may
 * be removed later, and this script's anchors must not move when it is.
 */
export const HISTORICAL_POOL_CLUB_IDS: Readonly<Record<CareerHandicapPool, readonly string[]>> = {
  latwy: ["legia-warszawa", "lech-poznan", "rakow-czestochowa", "jagiellonia-bialystok"],
  sredni: [
    "pogon-szczecin",
    "gornik-zabrze",
    "cracovia",
    "widzew-lodz",
    "slask-wroclaw",
    "piast-gliwice",
  ],
  trudny: [
    "radomiak-radom",
    "korona-kielce",
    "motor-lublin",
    "zaglebie-lubin",
    "wisla-krakow",
    "wieczysta-krakow",
    "gks-katowice",
    "wisla-plock",
  ],
};

/** Linear-interpolated quantile: sorted array, index `(n - 1) * p`,
 * interpolated between floor and ceiling - the repo's usual local copy of
 * this helper (see `src/logic/opening-budget.ts`, `src/logic/club-projection.ts`). */
const quantile = (sorted: readonly number[], p: number): number => {
  if (sorted.length === 0) throw new Error("quantile of an empty sample");
  const position = (sorted.length - 1) * p;
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  const low = at(sorted, lo, "quantile lower");
  return lo === hi ? low : low + (position - lo) * (at(sorted, hi, "quantile upper") - low);
};

const median = (values: readonly number[]): number =>
  quantile(
    [...values].sort((a, b) => a - b),
    0.5
  );
const iqr = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return quantile(sorted, 0.75) - quantile(sorted, 0.25);
};

/** The three quantities the script reads for one club - injected as a
 * function so the test can price a small fixture instead of the real
 * eighteen-club economy. */
export type ClubAdvantageInputs = {
  readonly advantageScore: number;
  readonly expectedSeasonPoints: number;
  readonly structuralPurchasingPower: number;
};

export type CareerHandicapAnchorRow = {
  readonly pool: CareerHandicapPool;
  readonly tenureHandicap: number;
  readonly legacyHandicap: number;
  readonly advantageScore: number;
  readonly advantageScoreIqr: number;
  readonly pointsMedian: number;
  readonly pointsIqr: number;
  readonly purchasingPowerMedian: number;
  readonly purchasingPowerIqr: number;
  readonly clubCount: number;
};

/**
 * Builds the three anchor rows, sorted from the greatest advantage to the
 * least - the same order `latwy` (highest advantageScore, lowest handicap)
 * to `trudny` (lowest advantageScore, highest handicap) already puts them
 * in, but computed from the data rather than assumed.
 *
 * `clubInputs` is called once per club and is expected to throw on an
 * unknown id (every lookup this repo has follows that convention), which is
 * exactly what should happen for a pool listing a club the active economy
 * does not know about.
 */
export const buildCareerHandicapAnchors = (input: {
  readonly pools: Readonly<Record<CareerHandicapPool, readonly string[]>>;
  readonly clubInputs: (_clubId: string) => ClubAdvantageInputs;
}): readonly CareerHandicapAnchorRow[] => {
  const rows = POOL_ORDER.map((pool) => {
    const clubIds = input.pools[pool];
    if (!clubIds || clubIds.length === 0) {
      throw new Error(`buildCareerHandicapAnchors: pool "${pool}" has no clubs`);
    }
    const clubRows = clubIds.map((clubId) => input.clubInputs(clubId));
    const advantageScores = clubRows.map((row) => row.advantageScore);
    const points = clubRows.map((row) => row.expectedSeasonPoints);
    const purchasingPowers = clubRows.map((row) => row.structuralPurchasingPower);
    return {
      pool,
      ...HANDICAP_LEVELS[pool],
      advantageScore: median(advantageScores),
      advantageScoreIqr: iqr(advantageScores),
      pointsMedian: median(points),
      pointsIqr: iqr(points),
      purchasingPowerMedian: median(purchasingPowers),
      purchasingPowerIqr: iqr(purchasingPowers),
      clubCount: clubIds.length,
    };
  });
  return [...rows].sort((a, b) => b.advantageScore - a.advantageScore);
};

const NUMBER_KEYS: readonly (keyof CareerHandicapAnchorRow)[] = [
  "tenureHandicap",
  "legacyHandicap",
  "advantageScore",
  "advantageScoreIqr",
  "pointsMedian",
  "pointsIqr",
  "purchasingPowerMedian",
  "purchasingPowerIqr",
  "clubCount",
];

/**
 * Renders the generated `src/data/career-handicap-anchors.ts` deterministically:
 * the same anchors always produce the same bytes, so `--check` can compare
 * the committed file against a fresh render without ever writing to disk.
 */
export const renderCareerHandicapAnchorsFile = (input: {
  readonly anchors: readonly CareerHandicapAnchorRow[];
  readonly sourceSha256: string;
}): string => {
  const rows = input.anchors
    .map((anchor) => {
      const fields = [
        `pool: ${JSON.stringify(anchor.pool)}`,
        ...NUMBER_KEYS.map((key) => `${key}: ${anchor[key]}`),
      ];
      return `  {\n    ${fields.join(",\n    ")},\n  },`;
    })
    .join("\n");

  return `// GENERATED by \`pnpm exec tsx scripts/career-handicap-anchors.ts --out src/data/career-handicap-anchors.ts\`.
// Do not edit by hand and do not hand-type these numbers - regenerate instead.
//
// Anchors the internal advantageScore axis (src/logic/club-projection.ts) to
// the three former difficulty pools (src/data/difficulty-levels.ts). What is
// preserved across the club-choice redesign is the numeric HANDICAP LEVELS -
// tenureHandicap 0/55/110 and legacyHandicap 0/85/130 - never the old
// per-club pool assignments themselves. Those assignments exist only so this
// script can locate, on the ACTIVE economy's advantageScore axis, the point
// each level used to sit at.
//
// Budget activation report SHA-256
// (docs/decisions/opening-budget-activation-2026-09-12.md):
// ${input.sourceSha256}

export type CareerHandicapPool = "latwy" | "sredni" | "trudny";

export type CareerHandicapAnchor = {
  readonly pool: CareerHandicapPool;
  readonly tenureHandicap: number;
  readonly legacyHandicap: number;
  readonly advantageScore: number;
  readonly advantageScoreIqr: number;
  readonly pointsMedian: number;
  readonly pointsIqr: number;
  readonly purchasingPowerMedian: number;
  readonly purchasingPowerIqr: number;
  readonly clubCount: number;
};

export const CAREER_HANDICAP_ANCHORS_SOURCE_SHA256 =
  ${JSON.stringify(input.sourceSha256)};

/** Sorted from the greatest advantage (lowest handicap) to the least
 * (highest handicap) - the order tenureHandicapFor/legacyHandicapFor
 * (src/logic/career-baseline.ts) interpolate across. */
export const CAREER_HANDICAP_ANCHORS: readonly CareerHandicapAnchor[] = [
${rows}
];
`;
};

/** The report whose SHA-256 anchors this generation - see the comment in the
 * rendered file. Recorded here, not recomputed: this script reads the active
 * economy, not the report's bytes. */
const BUDGET_ACTIVATION_REPORT_SHA256 =
  "C78AD60CA0A0ED6E1483A207C7FA3FDBB4A80C14A11542EBD43913CCF353D26E";

const activeClubInputs = (clubId: string): ClubAdvantageInputs => ({
  advantageScore: advantageScoreFor(clubId),
  expectedSeasonPoints: initialClubProjection(clubId).expectedSeasonPoints,
  structuralPurchasingPower: structuralPurchasingPower({
    clubId,
    projectedOperatingBalanceWithoutTransfersAndCups: projectedSeasonBalance(clubId),
  }),
});

const generateActiveFile = (): string =>
  renderCareerHandicapAnchorsFile({
    anchors: buildCareerHandicapAnchors({
      pools: HISTORICAL_POOL_CLUB_IDS,
      clubInputs: activeClubInputs,
    }),
    sourceSha256: BUDGET_ACTIVATION_REPORT_SHA256,
  });

const DEFAULT_OUTPUT_PATH = fileURLToPath(
  new URL("../src/data/career-handicap-anchors.ts", import.meta.url)
);

const KNOWN_FLAGS = ["--out", "--check", "--help"];
const VALUELESS_FLAGS = ["--check", "--help"];

const HELP = `pnpm exec tsx scripts/career-handicap-anchors.ts --out src/data/career-handicap-anchors.ts
pnpm exec tsx scripts/career-handicap-anchors.ts --check

Wyprowadza z aktywnej ekonomii advantageScore trzech dawnych pul trudnosci i
zapisuje je jako kotwice interpolacji tenureHandicap/legacyHandicap. --check
regeneruje plik w pamieci i porownuje bajt po bajcie z ${DEFAULT_OUTPUT_PATH};
nic nie zapisuje.`;

const main = (argv: readonly string[]): void => {
  const flags = parseFlags([...argv], KNOWN_FLAGS, VALUELESS_FLAGS);
  if (flags.has("--help")) {
    console.log(HELP);
    return;
  }

  const content = generateActiveFile();

  if (flags.has("--check")) {
    const existing = readFileSync(DEFAULT_OUTPUT_PATH, "utf8");
    if (existing !== content) {
      throw new Error(
        `career-handicap-anchors.ts is stale - regenerate with ` +
          `"pnpm exec tsx scripts/career-handicap-anchors.ts --out ${DEFAULT_OUTPUT_PATH}"`
      );
    }
    console.log("career-handicap-anchors.ts is up to date");
    return;
  }

  const outPath = flags.get("--out") ?? DEFAULT_OUTPUT_PATH;
  writeFileSync(outPath, content, "utf8");
  console.log(`Zapisano ${outPath}`);
};

/** Nothing runs on import: the test builds a small fixture by hand and must
 * not touch the real economy or the filesystem to do it. */
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
