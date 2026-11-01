import { createRng } from "../../src/logic/rng";
import { parseCsvLine } from "../csv";
import { mean, wilsonInterval } from "../stats";
import { COHORT_COLUMNS, type CohortRow } from "./dataset";
import { at } from "../../src/logic/invariant";

/**
 * What share of the clubs that entered the Conference League at the second
 * qualifying round of the Main Path reached the main phase - measured on the
 * pinned CSV, never on a live page.
 *
 * The share is the easy part. The honest part is the uncertainty: these
 * observations are not independent draws. Clubs from one season share a draw
 * and a field, associations repeat across seasons, and the same club shows up
 * in several editions. Wilson describes the share; it does not price that
 * dependence, so the bootstrap below resamples whole seasons and whole
 * associations, and a separate pass keeps one season per club.
 */

export type Rate = {
  label: string;
  n: number;
  advanced: number;
  share: number;
  wilsonLower: number;
  wilsonUpper: number;
};

export const rateOf = (label: string, rows: readonly CohortRow[]): Rate | null => {
  if (rows.length === 0) return null;
  const advanced = rows.filter((row) => row.reachedLeaguePhase).length;
  const interval = wilsonInterval(advanced, rows.length);
  return {
    label,
    n: rows.length,
    advanced,
    share: advanced / rows.length,
    wilsonLower: interval.lower,
    wilsonUpper: interval.upper,
  };
};

export type BootstrapResult = {
  /** Which unit was resampled - "sezon" or "związek". */
  unit: string;
  replications: number;
  clusters: number;
  mean: number;
  lower: number;
  upper: number;
};

/**
 * Cluster bootstrap: resample whole clusters with replacement, recompute the
 * share, and read the percentile interval off the replications. Resampling
 * clubs one by one would assume exactly the independence this data does not
 * have, and would report an interval far tighter than the evidence supports.
 */
export const clusterBootstrap = (
  rows: readonly CohortRow[],
  unit: string,
  keyOf: (_row: CohortRow) => string,
  replications: number,
  seed: number
): BootstrapResult => {
  const clusters = new Map<string, CohortRow[]>();
  for (const row of rows) {
    const key = keyOf(row);
    clusters.set(key, [...(clusters.get(key) ?? []), row]);
  }
  const pool = [...clusters.values()];
  if (pool.length < 2) throw new Error(`Cluster bootstrap needs at least two ${unit} clusters`);

  const rng = createRng(seed);
  const shares: number[] = [];
  for (let replication = 0; replication < replications; replication += 1) {
    const drawn: CohortRow[] = [];
    for (let i = 0; i < pool.length; i += 1) {
      drawn.push(...at(pool, Math.floor(rng.next() * pool.length), "bootstrap cluster"));
    }
    if (drawn.length === 0) continue;
    shares.push(drawn.filter((row) => row.reachedLeaguePhase).length / drawn.length);
  }
  const sorted = [...shares].sort((a, b) => a - b);
  const quantileAt = (quantile: number): number =>
    at(sorted, Math.min(sorted.length - 1, Math.floor(quantile * sorted.length)), "share quantile");
  return {
    unit,
    replications: shares.length,
    clusters: pool.length,
    mean: mean(shares),
    lower: quantileAt(0.025),
    upper: quantileAt(0.975),
  };
};

/**
 * The same share with each club counted once, keeping its earliest season.
 * A club that keeps finishing third or fourth enters this round year after
 * year, so the pooled share partly measures how often a handful of clubs
 * recur rather than how a berth fares.
 */
export const oneSeasonPerClub = (rows: readonly CohortRow[]): CohortRow[] => {
  const seen = new Set<string>();
  const kept: CohortRow[] = [];
  for (const row of [...rows].sort((a, b) => a.season.localeCompare(b.season))) {
    if (seen.has(row.articleKey)) continue;
    seen.add(row.articleKey);
    kept.push(row);
  }
  return kept;
};

export const repeatedClubs = (rows: readonly CohortRow[]): { club: string; seasons: number }[] => {
  const counts = new Map<string, { club: string; seasons: number }>();
  for (const row of rows) {
    const entry = counts.get(row.articleKey) ?? { club: row.club, seasons: 0 };
    counts.set(row.articleKey, { club: entry.club, seasons: entry.seasons + 1 });
  }
  return [...counts.values()]
    .filter((entry) => entry.seasons > 1)
    .sort((a, b) => b.seasons - a.seasons);
};

/**
 * The narrowing from "everyone who entered at this round" to the CLOSEST
 * STRUCTURALLY OBSERVABLE COHORT.
 *
 * That name is deliberate and the weaker of the two candidates. The berth is
 * matched on structure - an association ranked where Poland sits in the cycle
 * the game models, holding a berth that enters at this round, seeded in this
 * draw - and structure is all that is matched. Calling it "the Polish-type
 * cohort", or "the closest to the game", would claim the clubs resemble what
 * the game sends into Europe, and nothing here maps a real club onto the
 * game's `strength` axis. Until something does, this is the closest cohort
 * that can be OBSERVED, not the closest that can be COMPARED.
 *
 * The broad cohort stays a benchmark, not the target: it mixes the champion
 * of Andorra with the third team of the Netherlands. Each narrowing step is a
 * separate claim about comparability, so each is reported with its own n
 * rather than folded into one number.
 */
export const OBSERVABLE_COHORT_RANKS = { from: 10, to: 15 } as const;

export const isClosestObservable = (row: CohortRow): boolean =>
  row.associationRank !== null &&
  row.associationRank >= OBSERVABLE_COHORT_RANKS.from &&
  row.associationRank <= OBSERVABLE_COHORT_RANKS.to;

/** Association rank bands. The game's own berth is Poland's single Conference
 * League place in a cycle where it sits around twelfth, so the band around it
 * is the one to read; the others are there to show the gradient rather than to
 * be averaged into it. */
export const RANK_BANDS: { label: string; from: number; to: number }[] = [
  { label: "1-9", from: 1, to: 9 },
  { label: "10-15", from: 10, to: 15 },
  { label: "16-24", from: 16, to: 24 },
  { label: "25-39", from: 25, to: 39 },
  { label: "40-55", from: 40, to: 55 },
];

export const bandOf = (rank: number | null): string | null =>
  rank === null
    ? null
    : (RANK_BANDS.find((band) => rank >= band.from && rank <= band.to)?.label ?? null);

/** `seeded` belongs here as much as the outcome does: reading it back as the
 * string "1" made every `row.seeded === true` test fail silently, and the
 * seeding breakdown reported one row instead of a hundred and sixty-five. */
const BOOLEAN_COLUMNS = new Set(["reachedLeaguePhase", "seeded"]);
const NUMBER_COLUMNS = new Set(["associationRank", "associationCoefficient", "clubCoefficient"]);

export const parseCohortCsv = (text: string): CohortRow[] => {
  const lines = text.trim().split(/\r?\n/);
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  for (const column of COHORT_COLUMNS) {
    if (!header.includes(column)) throw new Error(`Cohort CSV is missing column "${column}"`);
  }
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    if (values.length !== header.length) {
      throw new Error(
        `Cohort CSV line ${index + 2} has ${values.length} fields, expected ${header.length}`
      );
    }
    const raw = Object.fromEntries(header.map((column, position) => [column, values[position]]));
    const row: Record<string, unknown> = {};
    for (const column of COHORT_COLUMNS) {
      const value = raw[column] ?? "";
      // An empty boolean is genuinely unknown (a club the seeding table does
      // not list), which is not the same as false.
      if (BOOLEAN_COLUMNS.has(column)) row[column] = value === "" ? null : value === "1";
      else if (NUMBER_COLUMNS.has(column)) row[column] = value === "" ? null : Number(value);
      else row[column] = value === "" ? null : value;
    }
    // `season`, `format`, `club`, `articleKey` and `association` are never
    // empty in a file this parser wrote; a blank one means the CSV was edited
    // by hand into something the analysis cannot interpret.
    for (const column of ["season", "format", "club", "articleKey", "association"] as const) {
      if (row[column] === null)
        throw new Error(`Cohort CSV line ${index + 2} has an empty ${column}`);
    }
    return row as CohortRow;
  });
};
