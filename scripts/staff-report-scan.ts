/**
 * What a staff report reveals about the hidden ceiling, and how useful it is.
 *
 * The historical separation of 3.01 / 4.06 / 5.20 / 6.72 OVR between the
 * extreme signal terciles at 1, 2, 4 and 10 reads - but the tool that measured
 * it was never committed, so nobody could say whether a change to the report
 * helped or hurt. This is that tool.
 *
 * Two things are measured, not one. A frozen WRONG verdict lowers separation
 * and would sail through a leak gate while making the product worse, so the
 * report's usefulness - accuracy, mean error in bands, and whether confidence
 * orders accuracy at all - is measured beside the leak.
 *
 * Usage:
 *   pnpm audit:staff-reports --schedules a1,a2,a3,b --reads 1,2,4,5,10 \
 *     --players 20000 --batches 5 --seasons 5 --seed 0xce110001 \
 *     --dump-raw <csv> [--before <csv>] [--md <file>]
 */

import { readFileSync, writeFileSync } from "node:fs";

import { AGE_PROFILES, FORM_PENALTY_FLOOR } from "../src/data/balance";
import { selectPotentialSpread } from "../src/data/potential-variance";
import type {
  Player,
  PositionCode,
  ReportPeriod,
  StaffAssessment,
  StaffConfidence,
  StaffMemo,
  StaffOutlook,
  StaffSource,
} from "../src/data/types";
import { develop, formAdjustment } from "../src/logic/development";
import { createRng, rand, randInt, type Rng } from "../src/logic/rng";
import {
  createStaffAssessment,
  staffMemoOf,
  staffOutlookBoundaryReason,
  staffOutlookFromOvr,
  type StaffOutlookBoundaryReason,
} from "../src/logic/staff-assessment";
import { peakOvrRange, seasonsToPeak } from "../src/logic/staff-projection";
import { deriveSeed } from "../src/logic/stable-seed";
import { parseFlags } from "./cli-args";
import { formatCsvRow, parseCsvLine } from "./csv";
import { mean, standardError } from "./stats";
import { at } from "../src/logic/invariant";

// ---------------------------------------------------------------------------
// Cohort
// ---------------------------------------------------------------------------

/** The band order, so an outlook can be averaged and a band error counted. */
export const OUTLOOK_STEP: Record<StaffOutlook, number> = {
  limited: 0,
  leagueLevel: 1,
  leadingLeague: 2,
  aboveLeague: 3,
};

const DEFAULT_BATCHES = 5;

/** The youngest a player can be in this game: createPlayer's academy debutant. */
const YOUNGEST_AGE = 16;

/**
 * The ceiling distribution createPlayer gives a "mlody" prospect, conditioned
 * on a fixed ovr. Holding ovr and age still is not a convenience: without it
 * the separation would mostly measure that better players have higher
 * ceilings, which is not a leak.
 */
const drawCeiling = (rng: Rng, ovr: number): number => {
  const spread = selectPotentialSpread(rng);
  const raw = Math.round(ovr + randInt(rng, 6, 14) + rand(rng, -spread, spread));
  return Math.max(ovr, Math.min(94, raw));
};

export type CohortSpec = {
  ovr: number;
  wiek: number;
  poz: PositionCode;
  players: number;
  seed: number;
  batches?: number;
};

const buildCohort = (spec: CohortSpec, batchSeed: number): Player[] => {
  const rng = createRng(batchSeed);
  const players: Player[] = [];
  for (let i = 0; i < spec.players; i += 1) {
    players.push({
      id: `scan-${batchSeed}-${i}`,
      nazwa: "Scan",
      poz: spec.poz,
      wiek: spec.wiek,
      ovr: spec.ovr,
      sufit: drawCeiling(rng, spec.ovr),
      moj: false,
      cenaZakupu: null,
      ageAtSigning: null,
      mnoznikPlacy: 1,
      wKlubieOd: 0,
      kontraktOd: 0,
      wygasa: false,
    });
  }
  return players;
};

const batchSeeds = (spec: CohortSpec): number[] =>
  Array.from({ length: spec.batches ?? DEFAULT_BATCHES }, (_, batch) =>
    deriveSeed(spec.seed, batch, "staff-report-scan")
  );

// ---------------------------------------------------------------------------
// Read schedules
// ---------------------------------------------------------------------------

export type ScheduleId = "a1" | "a2" | "a3";

type ReadContext = { period: ReportPeriod; source: StaffSource };

/**
 * A1's ceiling: two windows times two sources and no more. Asking for a fifth
 * read would not be a fifth observation even today, so the schedule caps
 * itself and the report says so rather than inventing reads.
 */
export const A1_CEILING = 4;

const a1Contexts = (reads: number, season: number): ReadContext[] => {
  const combos: ReadContext[] = [];
  for (const window of ["summer", "winter"] as const) {
    for (const source of ["scout", "coach"] as const) {
      combos.push({ period: { season, window }, source });
    }
  }
  return combos.slice(0, Math.min(reads, A1_CEILING));
};

/**
 * A2 - the equivalent of the historical 1/2/4/10, spread over five seasons and
 * two windows in the order (s1 summer), (s1 winter), (s2 summer)... The player
 * does NOT develop between reads, so the only variable is the schedule. This
 * is the ONLY measurement comparable with the historical numbers.
 */
const a2Contexts = (reads: number): ReadContext[] =>
  Array.from({ length: reads }, (_, i) => ({
    period: {
      season: Math.floor(i / 2) + 1,
      window: i % 2 === 0 ? "summer" : "winter",
    },
    source: "coach" as StaffSource,
  }));

/**
 * A3 - the longitudinal run that actually happens in a career: one read per
 * season, with develop() and a form correction in between, so age and ovr move
 * exactly as they do in the game.
 */
const a3Contexts = (reads: number): ReadContext[] =>
  Array.from({ length: reads }, (_, i) => ({
    period: { season: i + 1, window: "summer" },
    source: "coach" as StaffSource,
  }));

export const scheduleContexts = (schedule: ScheduleId, reads: number): ReadContext[] => {
  if (schedule === "a1") return a1Contexts(reads, 1);
  if (schedule === "a2") return a2Contexts(reads);
  return a3Contexts(reads);
};

/**
 * One season of real development, as ageSquad sequences it: develop() and then
 * the form step. Playing time and club form come from the stream, because a
 * cohort a club's worth of players wide sees both.
 */
const advanceOneSeason = (rng: Rng, player: Player): Player => {
  const profile = AGE_PROFILES[player.poz];
  const aged = develop(rng, player, profile);
  const played = rng.next() < 0.6;
  const overperformed = rng.next() < 0.5;
  const formAdj = formAdjustment(rng, played, overperformed);
  const withForm =
    formAdj > 0
      ? Math.min(aged.sufit, aged.ovr + formAdj)
      : formAdj < 0
        ? aged.ovr >= FORM_PENALTY_FLOOR
          ? Math.max(FORM_PENALTY_FLOOR, aged.ovr + formAdj)
          : aged.ovr + formAdj
        : aged.ovr;
  return { ...aged, ovr: withForm };
};

/** Develop a player all the way to his peak, taking no further readings. */
const runToPeak = (rng: Rng, player: Player): Player => {
  let current = player;
  const { peakStart } = AGE_PROFILES[current.poz];
  while (current.wiek < peakStart) current = advanceOneSeason(rng, current);
  return current;
};

// ---------------------------------------------------------------------------
// Leak scan
// ---------------------------------------------------------------------------

export type SignalFn = (_player: Player, _rng: Rng) => number;

export type LeakSpec = CohortSpec & {
  reads: number;
  schedule?: ScheduleId;
  /** Override the signal under test. Used by the scan's own control tests. */
  signal?: SignalFn;
};

export type Separation = {
  /** Difference in mean ceiling between the top and bottom signal tercile. */
  value: number;
  standardError: number;
  /** Reads the schedule could actually distinguish, which may be fewer than asked. */
  effectiveReads: number;
};

/**
 * The scanner leads the memo chain itself, and this is the part where it is
 * easiest to accidentally measure something the game never does: within one
 * season a read is handed THAT season's entry (so a repeat read returns the
 * same report, as reopening a drawer does), and a later season is handed the
 * previous season's entry.
 */
const runSchedule = (
  spec: LeakSpec,
  player: Player,
  contexts: readonly ReadContext[],
  schedule: ScheduleId,
  rng: Rng
): { signals: number[]; reports: { assessment: StaffAssessment; ovr: number }[] } => {
  const signals: number[] = [];
  const reports: { assessment: StaffAssessment; ovr: number }[] = [];
  let current = player;
  let memo: StaffMemo | null = null;
  for (const context of contexts) {
    const assessment = createStaffAssessment(current, context.period, context.source, memo);
    reports.push({ assessment, ovr: current.ovr });
    signals.push(spec.signal ? spec.signal(current, rng) : OUTLOOK_STEP[assessment.outlook]);
    memo = staffMemoOf(assessment, context.period.season, memo);
    // A3 is the only schedule where the player moves between reads.
    if (schedule === "a3") current = advanceOneSeason(rng, current);
  }
  return { signals, reports };
};

/**
 * Mean signal per player over one schedule, then the ceiling gap between the
 * extreme terciles of that signal.
 */
const batchSeparation = (spec: LeakSpec, batchSeed: number): number => {
  const schedule = spec.schedule ?? "a2";
  const contexts = scheduleContexts(schedule, spec.reads);
  const rows = buildCohort(spec, batchSeed).map((player, index) => {
    const rng = createRng(deriveSeed(batchSeed, index, "scan-read"));
    const { signals } = runSchedule(spec, player, contexts, schedule, rng);
    return { signal: mean(signals), ceiling: player.sufit };
  });

  rows.sort((a, b) => a.signal - b.signal);
  const size = Math.floor(rows.length / 3);
  const bottom = rows.slice(0, size).map((row) => row.ceiling);
  const top = rows.slice(rows.length - size).map((row) => row.ceiling);
  return mean(top) - mean(bottom);
};

export type CohortSeparations = {
  /** Every player in the cohort. */
  all: Separation;
  /** Players whose schedule produced at least one guaranteed potential `high`. */
  guaranteed: Separation;
  /** Players it never did - the ordinary noisy low/medium report. */
  plain: Separation;
  /** Share of players in the guaranteed group. */
  guaranteedShare: number;
};

const separationOf = (rows: readonly { signal: number; ceiling: number }[]): number | null => {
  if (rows.length < 3) return null;
  const sorted = [...rows].sort((a, b) => a.signal - b.signal);
  const size = Math.floor(sorted.length / 3);
  if (size === 0) return null;
  return (
    mean(sorted.slice(sorted.length - size).map((row) => row.ceiling)) -
    mean(sorted.slice(0, size).map((row) => row.ceiling))
  );
};

const summariseSeparations = (values: readonly (number | null)[], effectiveReads: number) => {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0
    ? { value: Number.NaN, standardError: Number.NaN, effectiveReads }
    : { value: mean(present), standardError: standardError(present), effectiveReads };
};

/**
 * The leak split by cohort, because the two halves are gated differently.
 *
 * The ordinary noisy report must not reveal more than it did before. The
 * guaranteed `high` is a deliberately accepted new channel and may reveal
 * more - what it owes instead is 100% category accuracy. Reporting one blended
 * number would let a rise in the first hide behind the second.
 */
export const leakScanByCohort = (spec: LeakSpec): CohortSeparations => {
  const schedule = spec.schedule ?? "a2";
  const contexts = scheduleContexts(schedule, spec.reads);
  const perBatch = batchSeeds(spec).map((batchSeed) => {
    const all: { signal: number; ceiling: number }[] = [];
    const guaranteed: { signal: number; ceiling: number }[] = [];
    const plain: { signal: number; ceiling: number }[] = [];
    buildCohort(spec, batchSeed).forEach((player, index) => {
      const rng = createRng(deriveSeed(batchSeed, index, "scan-read"));
      const { signals, reports } = runSchedule(spec, player, contexts, schedule, rng);
      const row = { signal: mean(signals), ceiling: player.sufit };
      all.push(row);
      const anyGuaranteed = reports.some(
        (entry) => entry.assessment.focus === "potential" && entry.assessment.confidence === "high"
      );
      (anyGuaranteed ? guaranteed : plain).push(row);
    });
    return {
      all: separationOf(all),
      guaranteed: separationOf(guaranteed),
      plain: separationOf(plain),
      share: guaranteed.length / all.length,
    };
  });

  return {
    all: summariseSeparations(
      perBatch.map((batch) => batch.all),
      contexts.length
    ),
    guaranteed: summariseSeparations(
      perBatch.map((batch) => batch.guaranteed),
      contexts.length
    ),
    plain: summariseSeparations(
      perBatch.map((batch) => batch.plain),
      contexts.length
    ),
    guaranteedShare: mean(perBatch.map((batch) => batch.share)),
  };
};

export const leakScan = (spec: LeakSpec): Separation => {
  const perBatch = batchSeeds(spec).map((batchSeed) => batchSeparation(spec, batchSeed));
  return {
    value: mean(perBatch),
    standardError: standardError(perBatch),
    effectiveReads: scheduleContexts(spec.schedule ?? "a2", spec.reads).length,
  };
};

// ---------------------------------------------------------------------------
// Usefulness scan
// ---------------------------------------------------------------------------

export type UsefulnessSpec = CohortSpec & { seasons: number };

export type UsefulnessScan = {
  /** Share of reports whose band matched the band at peakStart, per season. */
  accuracyBySeason: number[];
  accuracyByConfidence: Record<StaffConfidence, number>;
  reportsByConfidence: Record<StaffConfidence, number>;
  /** Mean absolute error in outlook bands. */
  meanBandError: number;
  /** Share of reports off by two bands or more. */
  twoBandErrorRate: number;
  accuracyOverall: number;
  /** Accuracy and volume per channel. `current` is a control: it reads visible
   * OVR, so its accuracy is 100% by construction and would inflate any blend. */
  byKind: Record<ReportKind, { reports: number; accuracy: number }>;
  /** medium against low, inside the plain potential cohort alone. */
  plainAccuracyByConfidence: Record<"medium" | "low", number>;
  /**
   * Accuracy per batch seed. The paired before/after comparison subtracts
   * matching seeds, so a single figure repeated on every row would make the
   * accuracy delta identically zero and hide a real regression.
   */
  accuracyByBatch: { batchSeed: number; accuracy: number }[];
};

/** Which of the three channels produced a report - they are gated apart. */
export type ReportKind = "guaranteedHigh" | "plainPotential" | "current";

type UsefulnessRow = {
  season: number;
  confidence: StaffConfidence;
  kind: ReportKind;
  bandError: number;
};

/**
 * Accuracy is judged against the band the player holds AT peakStart, not after
 * five seasons: the outlook describes a REACHABLE level, and a cohort of
 * eighteen-year-olds has not finished growing in five seasons. Measuring the
 * unfinished career would measure the wrong thing.
 */
const usefulnessRows = (spec: UsefulnessSpec, batchSeed: number): UsefulnessRow[] => {
  const rows: UsefulnessRow[] = [];
  buildCohort(spec, batchSeed).forEach((player, index) => {
    const rng = createRng(deriveSeed(batchSeed, index, "scan-useful"));
    const reports: {
      season: number;
      outlook: StaffOutlook;
      confidence: StaffConfidence;
      kind: ReportKind;
    }[] = [];
    let current = player;
    let memo: StaffMemo | null = null;
    for (let season = 1; season <= spec.seasons; season += 1) {
      const report = createStaffAssessment(current, { season, window: "summer" }, "coach", memo);
      reports.push({
        season,
        outlook: report.outlook,
        confidence: report.confidence,
        kind:
          report.focus === "current"
            ? "current"
            : report.confidence === "high"
              ? "guaranteedHigh"
              : "plainPotential",
      });
      memo = staffMemoOf(report, season, memo);
      current = advanceOneSeason(rng, current);
    }
    const truth = staffOutlookFromOvr(runToPeak(rng, current).ovr);
    for (const report of reports) {
      rows.push({
        season: report.season,
        confidence: report.confidence,
        kind: report.kind,
        bandError: Math.abs(OUTLOOK_STEP[report.outlook] - OUTLOOK_STEP[truth]),
      });
    }
  });
  return rows;
};

const kindSummary = (
  rows: readonly UsefulnessRow[],
  kind: ReportKind
): { reports: number; accuracy: number } => {
  const subset = rows.filter((row) => row.kind === kind);
  return { reports: subset.length, accuracy: shareCorrect(subset) };
};

const shareCorrect = (rows: readonly UsefulnessRow[]): number =>
  rows.length === 0 ? 0 : rows.filter((row) => row.bandError === 0).length / rows.length;

export const usefulnessScan = (spec: UsefulnessSpec): UsefulnessScan => {
  const perBatch = batchSeeds(spec).map((batchSeed) => ({
    batchSeed,
    rows: usefulnessRows(spec, batchSeed),
  }));
  const rows = perBatch.flatMap((batch) => batch.rows);
  const byConfidence = (confidence: StaffConfidence) =>
    rows.filter((row) => row.confidence === confidence);
  return {
    accuracyBySeason: Array.from({ length: spec.seasons }, (_, i) =>
      shareCorrect(rows.filter((row) => row.season === i + 1))
    ),
    accuracyByConfidence: {
      high: shareCorrect(byConfidence("high")),
      medium: shareCorrect(byConfidence("medium")),
      low: shareCorrect(byConfidence("low")),
    },
    reportsByConfidence: {
      high: byConfidence("high").length,
      medium: byConfidence("medium").length,
      low: byConfidence("low").length,
    },
    byKind: {
      guaranteedHigh: kindSummary(rows, "guaranteedHigh"),
      plainPotential: kindSummary(rows, "plainPotential"),
      current: kindSummary(rows, "current"),
    },
    plainAccuracyByConfidence: {
      medium: shareCorrect(
        rows.filter((row) => row.kind === "plainPotential" && row.confidence === "medium")
      ),
      low: shareCorrect(
        rows.filter((row) => row.kind === "plainPotential" && row.confidence === "low")
      ),
    },
    meanBandError: mean(rows.map((row) => row.bandError)),
    twoBandErrorRate: rows.filter((row) => row.bandError >= 2).length / rows.length,
    accuracyOverall: shareCorrect(rows),
    accuracyByBatch: perBatch.map((batch) => ({
      batchSeed: batch.batchSeed,
      accuracy: shareCorrect(batch.rows),
    })),
  };
};

// ---------------------------------------------------------------------------
// Boundary-warning diagnostics
// ---------------------------------------------------------------------------

export type BoundaryReasonCounts = Record<StaffOutlookBoundaryReason | "none", number> & {
  highReports: number;
};

const emptyBoundaryCounts = (): BoundaryReasonCounts => ({
  currentUp: 0,
  currentDown: 0,
  potentialFloorUp: 0,
  none: 0,
  highReports: 0,
});

/**
 * How often a high-confidence report carries a boundary warning, on the real
 * longitudinal schedule. UX diagnostics rather than a balance gate: the point
 * is to find out whether the warning stays an exceptional explanation or
 * starts dominating what `high` says.
 *
 * Calls the SAME staffOutlookBoundaryReason the UI calls, and hands it only a
 * finished assessment and the visible OVR - no thresholds reimplemented here,
 * and nothing about the hidden potential involved in classifying a warning.
 */
export const boundaryReasonScan = (spec: CohortSpec, reads: number): BoundaryReasonCounts => {
  const counts = emptyBoundaryCounts();
  const contexts = scheduleContexts("a3", reads);
  for (const batchSeed of batchSeeds(spec)) {
    buildCohort(spec, batchSeed).forEach((player, index) => {
      const rng = createRng(deriveSeed(batchSeed, index, "scan-boundary"));
      const { reports } = runSchedule(
        { ...spec, reads, schedule: "a3" },
        player,
        contexts,
        "a3",
        rng
      );
      for (const report of reports) {
        if (report.assessment.confidence !== "high") continue;
        counts.highReports += 1;
        const reason = staffOutlookBoundaryReason(report.assessment, report.ovr);
        counts[reason ?? "none"] += 1;
      }
    });
  }
  return counts;
};

// ---------------------------------------------------------------------------
// Measurement C - is the tenure reward reachable at all?
// ---------------------------------------------------------------------------

export type GuaranteeCoverage = {
  overall: number;
  /** Share of players whose whole peak range sits in one band, by years to peak. */
  byYearsToPeak: { years: number; players: number; share: number }[];
};

/**
 * After two completed seasons of development a player reaches his third season
 * of observation. For everyone still at least two years from his peak - the
 * group the nearPeak gate does not already cover - how often does the whole
 * conservative range fall inside a single band? If the answer is "almost
 * never", the tenure gate is a promise the game cannot keep.
 */
export const guaranteeCoverage = (spec: CohortSpec): GuaranteeCoverage => {
  const buckets = new Map<number, { players: number; single: number }>();
  const { peakStart } = AGE_PROFILES[spec.poz];
  // Sweep the whole young age range rather than the leak cohort's single age:
  // the gate has to be reachable for a sixteen-year-old and for a player three
  // years out, and one age produces exactly one years-to-peak bucket.
  for (let wiek = YOUNGEST_AGE; wiek < peakStart; wiek += 1) {
    for (const batchSeed of batchSeeds(spec)) {
      buildCohort({ ...spec, wiek }, batchSeed).forEach((player, index) => {
        const rng = createRng(deriveSeed(batchSeed, index, wiek, "scan-guarantee"));
        let current = player;
        for (let season = 0; season < 2; season += 1) current = advanceOneSeason(rng, current);
        const years = seasonsToPeak(current.wiek, current.poz);
        if (years < 2) return;
        const { minOvr, maxOvr } = peakOvrRange(current);
        const single = staffOutlookFromOvr(minOvr) === staffOutlookFromOvr(maxOvr);
        const bucket = buckets.get(years) ?? { players: 0, single: 0 };
        bucket.players += 1;
        if (single) bucket.single += 1;
        buckets.set(years, bucket);
      });
    }
  }
  const byYearsToPeak = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([years, bucket]) => ({
      years,
      players: bucket.players,
      share: bucket.single / bucket.players,
    }));
  const players = byYearsToPeak.reduce((sum, row) => sum + row.players, 0);
  const single = byYearsToPeak.reduce((sum, row) => sum + row.share * row.players, 0);
  return { overall: players === 0 ? 0 : single / players, byYearsToPeak };
};

// ---------------------------------------------------------------------------
// Paired before/after comparison
// ---------------------------------------------------------------------------

export type RawRow = {
  batchSeed: number;
  schedule: string;
  reads: number;
  separation: number;
  accuracy: number;
};

export type PairedDelta = { meanDelta: number; standardError: number };

export type PairedComparisonResult = {
  pairs: number;
  separation: PairedDelta;
  accuracy: PairedDelta;
};

const rowKey = (row: Pick<RawRow, "batchSeed" | "schedule" | "reads">): string =>
  `${row.batchSeed}|${row.schedule}|${row.reads}`;

const indexRows = (rows: readonly RawRow[], label: string): Map<string, RawRow> => {
  const byKey = new Map<string, RawRow>();
  for (const row of rows) {
    const key = rowKey(row);
    if (byKey.has(key)) throw new Error(`duplicate key ${key} in the ${label} rows`);
    byKey.set(key, row);
  }
  return byKey;
};

/**
 * Paired differences by (batchSeed, schedule, reads). Both runs go through the
 * same seeds, and the whole value of that lies in subtracting them pairwise -
 * an unpaired difference of two run averages sinks into seed variance.
 */
export const comparePairedBatches = (
  before: readonly RawRow[],
  after: readonly RawRow[]
): PairedComparisonResult => {
  const beforeByKey = indexRows(before, "before");
  const afterByKey = indexRows(after, "after");
  for (const key of beforeByKey.keys()) {
    if (!afterByKey.has(key)) throw new Error(`missing pair for ${key} in the after rows`);
  }
  for (const key of afterByKey.keys()) {
    if (!beforeByKey.has(key)) throw new Error(`missing pair for ${key} in the before rows`);
  }
  const keys = [...beforeByKey.keys()];
  const delta = (read: (_row: RawRow) => number): PairedDelta => {
    const diffs = keys.map((key) => read(afterByKey.get(key)!) - read(beforeByKey.get(key)!));
    return { meanDelta: mean(diffs), standardError: standardError(diffs) };
  };
  return {
    pairs: keys.length,
    separation: delta((row) => row.separation),
    accuracy: delta((row) => row.accuracy),
  };
};

const RAW_HEADER = ["batchSeed", "schedule", "reads", "separation", "accuracy"] as const;

export const formatRawCsv = (rows: readonly RawRow[]): string =>
  [
    formatCsvRow([...RAW_HEADER]),
    ...rows.map((row) =>
      formatCsvRow([
        String(row.batchSeed),
        row.schedule,
        String(row.reads),
        row.separation.toFixed(6),
        row.accuracy.toFixed(6),
      ])
    ),
  ].join("\n");

export const parseRawCsv = (text: string): RawRow[] => {
  const lines = text.trim().split(/\r?\n/);
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  if (header.join(",") !== RAW_HEADER.join(",")) {
    throw new Error(`unexpected raw CSV header: ${header.join(",")}`);
  }
  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    const [batchSeed, , reads, separation, accuracy] = fields;
    return {
      batchSeed: Number(batchSeed),
      schedule: at(fields, 1, "schedule column"),
      reads: Number(reads),
      separation: Number(separation),
      accuracy: Number(accuracy),
    };
  });
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const KNOWN_FLAGS = [
  "--schedules",
  "--reads",
  "--players",
  "--batches",
  "--seasons",
  "--seed",
  "--ovr",
  "--age",
  "--pos",
  "--dump-raw",
  "--before",
  "--md",
  "--help",
] as const;

const HELP = [
  "pnpm audit:staff-reports - what a staff report reveals, and how useful it is",
  "",
  "  --schedules  a1,a2,a3,b   which measurements to run (default a1,a2,a3,b)",
  "  --reads      1,2,4,5,10   reads per player for the leak schedules",
  "  --players    N            players per batch (default 20000)",
  "  --batches    N            independent cohorts, for the standard error (default 5)",
  "  --seasons    N            seasons of reports in the usefulness scan (default 5)",
  "  --seed       0x...        base seed",
  "  --ovr/--age/--pos         the fixed cohort (default 62 / 18 / SP)",
  "  --dump-raw   <csv>        one row per batch x schedule x reads",
  "  --before     <csv>        a previous dump, for the paired comparison",
  "  --md         <file>       write the report",
  "",
].join("\n");

const numberFlag = (flags: Map<string, string>, flag: string, fallback: number): number => {
  const raw = flags.get(flag);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${flag} needs a number, got "${raw}"`);
  return value;
};

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;

/** One point of a schedule - a single `reads` count, aggregated over batches. */
export type SchedulePoint = {
  reads: number;
  /** Mean separation across the batches at this reads count. */
  mean: number;
  standardError: number;
  batches: number;
};

/**
 * The raw per-batch rows folded into the points the report actually talks
 * about: one entry per (schedule, reads), averaged over batches.
 *
 * This exists so that everything comparing against a budget aggregates the
 * SAME way the budget does. It did not, and the two sides silently measured
 * different things: the budget averaged the batches at a point, while the
 * "highest point now" column picked the single largest batch row. On the same
 * data that printed A2@10 as 11.09 in the measurement table and 11.23 in the
 * budget table - the second being one lucky cohort rather than the point. It
 * did not change the decision that was taken, but it could pass or fail a
 * future measurement for a reason that is not in the data.
 */
export const schedulePoints = (rows: readonly RawRow[]): Map<string, SchedulePoint[]> => {
  const bySchedule = new Map<string, Map<number, number[]>>();
  for (const row of rows) {
    const byReads = bySchedule.get(row.schedule) ?? new Map<number, number[]>();
    byReads.set(row.reads, [...(byReads.get(row.reads) ?? []), row.separation]);
    bySchedule.set(row.schedule, byReads);
  }

  const points = new Map<string, SchedulePoint[]>();
  for (const [schedule, byReads] of bySchedule) {
    points.set(
      schedule,
      [...byReads.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([reads, separations]) => ({
          reads,
          mean: mean(separations),
          standardError: standardError(separations),
          batches: separations.length,
        }))
    );
  }
  return points;
};

/** The point a schedule peaks at, by mean separation. */
export const worstSchedulePoint = (points: readonly SchedulePoint[]): SchedulePoint =>
  points.reduce((worst, point) => (point.mean > worst.mean ? point : worst));

/**
 * The accepted leak ceiling, PER SCHEDULE: the highest mean separation that
 * schedule reached in the baseline run, plus two standard errors.
 *
 * One number taken from A2@10 was the first draft, and the baseline run itself
 * disproved it: A3 already sat at 11.21 / 12.79 / 14.83 BEFORE any change, so
 * an A2-derived ceiling could never have been an upper bound for it, and a gate
 * written that way cannot tell a regression from the starting point. The three
 * schedules read different things - repeat entries inside one season, a static
 * player watched for five, and a career that actually develops - so each
 * carries its own budget. Product owner's call, 2026-08-26.
 *
 * Computed from the raw per-batch rows so the "after" run reads it out of the
 * "before" artifact rather than recomputing it from its own data: a budget
 * chosen after seeing the result is not a budget.
 */
export const careerLeakBudget = (rows: readonly RawRow[]): Map<string, number> =>
  new Map(
    [...schedulePoints(rows)].map(([schedule, points]) => [
      schedule,
      Math.max(...points.map((point) => point.mean + 2 * point.standardError)),
    ])
  );

type LeakSection = { lines: string[]; rows: RawRow[] };

const leakSection = (
  spec: CohortSpec,
  schedules: readonly ScheduleId[],
  reads: readonly number[]
): LeakSection => {
  const lines = ["## Wyciek - separacja sufitu miedzy skrajnymi tercylami sygnalu", ""];
  const rows: RawRow[] = [];
  for (const schedule of schedules) {
    lines.push(`### Harmonogram ${schedule.toUpperCase()}`, "");
    lines.push(
      "| odczyty | efektywne | calosc | SE | bez gwarancji | SE | gwarantowane high | SE | udzial gwarancji |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"
    );
    for (const read of reads) {
      const spread = leakScanByCohort({ ...spec, schedule, reads: read });
      const cell = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : "-");
      lines.push(
        `| ${read} | ${spread.all.effectiveReads} | ${cell(spread.all.value)} | ` +
          `${cell(spread.all.standardError)} | ${cell(spread.plain.value)} | ` +
          `${cell(spread.plain.standardError)} | ${cell(spread.guaranteed.value)} | ` +
          `${cell(spread.guaranteed.standardError)} | ${pct(spread.guaranteedShare)} |`
      );
      for (const batchSeed of batchSeeds(spec)) {
        rows.push({
          batchSeed,
          schedule,
          reads: read,
          separation: batchSeparation({ ...spec, schedule, reads: read }, batchSeed),
          accuracy: 0,
        });
      }
    }
    if (schedule === "a1") {
      lines.push("", `Sufit rozroznialnych kombinacji okno x zrodlo wynosi ${A1_CEILING}.`);
    }
    lines.push("");
  }
  return { lines, rows };
};

const usefulnessSection = (
  spec: CohortSpec,
  seasons: number
): { lines: string[]; scan: UsefulnessScan } => {
  const scan = usefulnessScan({ ...spec, seasons });
  const lines = [
    "## Uzytecznosc - trafnosc wobec pasma przy peakStart",
    "",
    `Trafnosc ogolem: ${pct(scan.accuracyOverall)}`,
    `Sredni blad w pasmach: ${scan.meanBandError.toFixed(3)}`,
    `Udzial bledow o co najmniej dwa pasma: ${pct(scan.twoBandErrorRate)}`,
    "",
    "| sezon | trafnosc |",
    "| --- | --- |",
    ...scan.accuracyBySeason.map((value, i) => `| ${i + 1} | ${pct(value)} |`),
    "",
    "| pewnosc | raporty | trafnosc |",
    "| --- | --- | --- |",
    ...(["high", "medium", "low"] as const).map(
      (level) =>
        `| ${level} | ${scan.reportsByConfidence[level]} | ${pct(scan.accuracyByConfidence[level])} |`
    ),
    "",
    "### Wedlug kanalu",
    "",
    "`current` jest kontrola: czyta widoczne OVR, wiec ma 100% z definicji.",
    "",
    "| kanal | raporty | trafnosc |",
    "| --- | --- | --- |",
    ...(["guaranteedHigh", "plainPotential", "current"] as const).map(
      (kind) => `| ${kind} | ${scan.byKind[kind].reports} | ${pct(scan.byKind[kind].accuracy)} |`
    ),
    "",
    `W kohorcie bez gwarancji: medium ${pct(scan.plainAccuracyByConfidence.medium)} ` +
      `wobec low ${pct(scan.plainAccuracyByConfidence.low)}.`,
    "",
  ];
  return { lines, scan };
};

/**
 * The historical separations for 1 / 2 / 4 / 10 reads. The tool that
 * produced them is not in the repo, so these cannot be reproduced to the
 * decimal - they are printed beside A2 so a reader can check the one thing
 * that must hold: same order of magnitude, rising with the number of reads.
 */
const HISTORICAL_A2_BASELINE: readonly { reads: number; separation: number }[] = [
  { reads: 1, separation: 3.01 },
  { reads: 2, separation: 4.06 },
  { reads: 4, separation: 5.2 },
  { reads: 10, separation: 6.72 },
];

const baselineSection = (): string[] => [
  "## Zestawienie z historycznymi liczbami (tylko A2)",
  "",
  "| odczyty | historycznie | ten pomiar |",
  "| --- | --- | --- |",
  ...HISTORICAL_A2_BASELINE.map(
    (entry) => `| ${entry.reads} | ${entry.separation.toFixed(2)} | patrz tabela A2 |`
  ),
  "",
  "Tamte liczby powstaly innym, niezachowanym narzedziem i inna kohorta, wiec",
  "nie musza sie zgadzac co do setnych. Wymagane jest to, co widac: ten sam rzad",
  "wielkosci i wzrost separacji z liczba odczytow.",
  "",
];

const boundarySection = (spec: CohortSpec, reads: number): string[] => {
  const counts = boundaryReasonScan(spec, reads);
  const share = (value: number) =>
    counts.highReports === 0 ? "-" : pct(value / counts.highReports);
  return [
    "## Czestosc ostrzezen granicznych (A3, raporty high)",
    "",
    `Raporty z wysoka pewnoscia: ${counts.highReports}`,
    "",
    "| powod | udzial |",
    "| --- | --- |",
    `| currentUp | ${share(counts.currentUp)} |`,
    `| currentDown | ${share(counts.currentDown)} |`,
    `| potentialFloorUp | ${share(counts.potentialFloorUp)} |`,
    `| bez ostrzezenia | ${share(counts.none)} |`,
    "",
  ];
};

const coverageSection = (spec: CohortSpec): string[] => {
  const coverage = guaranteeCoverage(spec);
  return [
    "## Pokrycie bramki stazu (pomiar C)",
    "",
    "Po dwoch zakonczonych rozwojach, dla zawodnikow co najmniej dwa lata od szczytu,",
    `caly zakres peakOvrRange miesci sie w jednym pasmie w ${pct(coverage.overall)} przypadkow.`,
    "",
    "| lata do szczytu | zawodnicy | udzial jednego pasma |",
    "| --- | --- | --- |",
    ...coverage.byYearsToPeak.map((row) => `| ${row.years} | ${row.players} | ${pct(row.share)} |`),
    "",
  ];
};

const main = (): void => {
  const flags = parseFlags(process.argv.slice(2), [...KNOWN_FLAGS]);
  if (flags.has("--help")) {
    process.stdout.write(HELP);
    return;
  }

  const spec: CohortSpec = {
    ovr: numberFlag(flags, "--ovr", 62),
    wiek: numberFlag(flags, "--age", 18),
    poz: (flags.get("--pos") ?? "ŚP") as PositionCode,
    players: numberFlag(flags, "--players", 20_000),
    seed: numberFlag(flags, "--seed", 0xce11_0001),
    batches: numberFlag(flags, "--batches", DEFAULT_BATCHES),
  };
  const requested = (flags.get("--schedules") ?? "a1,a2,a3,b").split(",");
  const schedules = requested.filter(
    (s): s is ScheduleId => s === "a1" || s === "a2" || s === "a3"
  );
  const reads = (flags.get("--reads") ?? "1,2,4,5,10").split(",").map(Number);
  const seasons = numberFlag(flags, "--seasons", 5);

  const leak = leakSection(spec, schedules, reads);
  const usefulness = requested.includes("b") ? usefulnessSection(spec, seasons) : null;
  const accuracyByBatch = new Map(
    (usefulness?.scan.accuracyByBatch ?? []).map((row) => [row.batchSeed, row.accuracy])
  );
  const rows = leak.rows.map((row) => ({
    ...row,
    accuracy: accuracyByBatch.get(row.batchSeed) ?? 0,
  }));

  const sections = [
    `# Raport sztabu - pomiar (${new Date().toISOString().slice(0, 10)})`,
    "",
    `Kohorta: OVR ${spec.ovr}, wiek ${spec.wiek}, pozycja ${spec.poz}, ` +
      `${spec.players} zawodnikow x ${spec.batches} kohort, ziarno 0x${spec.seed.toString(16)}.`,
    "",
    ...leak.lines,
    ...(usefulness ? usefulness.lines : []),
    ...baselineSection(),
    ...boundarySection(spec, seasons),
    ...coverageSection(spec),
  ];

  const beforePath = flags.get("--before");
  if (beforePath === undefined) {
    const budgets = careerLeakBudget(rows);
    sections.push(
      "## careerLeakBudget (per harmonogram)",
      "",
      "| harmonogram | budzet (OVR) |",
      "| --- | --- |",
      ...[...budgets.entries()].map(
        ([schedule, budget]) => `| ${schedule.toUpperCase()} | ${budget.toFixed(3)} |`
      ),
      "",
      "Najwyzsza srednia separacja tego harmonogramu plus dwa bledy standardowe.",
      "Przebieg 'po' wczytuje te wartosci z artefaktu 'przed' przez --before",
      "i nigdy nie przelicza ich z wlasnych danych.",
      ""
    );
  } else {
    const beforeRows = parseRawCsv(readFileSync(beforePath, "utf8"));
    const budgets = careerLeakBudget(beforeRows);
    // Aggregated exactly as the budget is - the mean over batches at a point,
    // never the single largest batch row. Comparing a one-cohort maximum
    // against an averaged ceiling would be two different measurements either
    // side of the same inequality.
    const pointsNow = schedulePoints(rows);
    sections.push(
      "## careerLeakBudget (z pliku 'przed', per harmonogram)",
      "",
      "Obie kolumny to srednia po kohortach w danym punkcie, nie pojedynczy batch.",
      "",
      "| harmonogram | budzet | najwyzszy punkt teraz | odczyty | w budzecie |",
      "| --- | --- | --- | --- | --- |",
      ...[...budgets.entries()].map(([schedule, budget]) => {
        const points = pointsNow.get(schedule);
        if (points === undefined || points.length === 0) {
          return `| ${schedule.toUpperCase()} | ${budget.toFixed(3)} | - | - | - |`;
        }
        const worst = worstSchedulePoint(points);
        return (
          `| ${schedule.toUpperCase()} | ${budget.toFixed(3)} | ${worst.mean.toFixed(2)} | ` +
          `${worst.reads} | ${worst.mean <= budget ? "tak" : "**NIE**"} |`
        );
      }),
      ""
    );

    const comparison = comparePairedBatches(beforeRows, rows);
    sections.push(
      "## Porownanie sparowane wzgledem przebiegu 'przed'",
      "",
      `Pary: ${comparison.pairs}`,
      `Separacja: ${comparison.separation.meanDelta.toFixed(3)} +/- ` +
        `${comparison.separation.standardError.toFixed(3)} OVR`,
      `Trafnosc: ${comparison.accuracy.meanDelta.toFixed(4)} +/- ${comparison.accuracy.standardError.toFixed(4)}`,
      ""
    );
  }

  const markdown = sections.join("\n");
  const mdPath = flags.get("--md");
  if (mdPath !== undefined) writeFileSync(mdPath, markdown, "utf8");
  else process.stdout.write(markdown);

  const dumpPath = flags.get("--dump-raw");
  if (dumpPath !== undefined) writeFileSync(dumpPath, formatRawCsv(rows), "utf8");
};

// Only run when invoked as a CLI, so the tests can import the scan functions.
if (process.argv[1] !== undefined && process.argv[1].includes("staff-report-scan")) main();
