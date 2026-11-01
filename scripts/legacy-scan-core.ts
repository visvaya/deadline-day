import { buildCareerBaseline } from "../src/logic/career-baseline";
import { TYTULY, PROGI_BAZOWE } from "../src/logic/epilogue";
import { parseCsvLine } from "./csv";
import { at } from "../src/logic/invariant";

/**
 * Post-processes a `pnpm balance --dump-raw` CSV to answer "what would legacy
 * look like under a different formula/handicap/thresholds" - without
 * re-running the simulator. Safe because `dziedzictwo` is pure end-of-game
 * arithmetic (epilogue.ts) that never feeds back into the RNG stream or the
 * verdict, so recomputing it from the dumped breakdown columns is exact, not
 * an approximation.
 *
 * Split from legacy-scan.ts (the CLI) so these functions can be imported by
 * tests without triggering the CLI's main() - the same split balance.ts uses
 * for balance-metrics.ts/balance-report.ts.
 */

export type LegacyRow = {
  /** The dump's club column - "clubId" from schema 5 on. Kept as a plain
   * string (not narrowed to a known id) so a scan over a slightly stale dump
   * still works; the handicap lookup below throws on a genuinely unknown id. */
  clubId: string;
  polityka: string;
  seed: number;
  dziedzictwo: number;
  tytul: string;
  werdykt: string;
  ocena: number;
  wartoscKadry: number;
  wartoscKadryMoj: number;
};

/**
 * Parses the CSV produced by `scripts/balance.ts --dump-raw`, BY HEADER NAME.
 *
 * It used to destructure the leading fields positionally, which made every
 * new column a promise that it would be appended and never inserted. Reading
 * by name retires that promise: a column can land anywhere, and a missing one
 * is named in the error rather than shifting every later value by one.
 *
 * Ignores the `dziedzictwoZHandicapem` column - the handicap used for it was
 * baked in at dump time, but this scan recomputes it fresh from `--handicaps`
 * so it can answer "what if the handicap were different".
 */
const REQUIRED_COLUMNS = [
  "clubId",
  "polityka",
  "seed",
  "dziedzictwo",
  "tytul",
  "werdykt",
  "ocena",
  "wartoscKadry",
  "wartoscKadryMoj",
] as const;

export const parseCsv = (text: string): LegacyRow[] => {
  const lines = text.trim().split(/\r?\n/);
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  const indexOf = new Map(header.map((name, index) => [name, index]));
  for (const column of REQUIRED_COLUMNS) {
    if (!indexOf.has(column)) throw new Error(`Dump is missing the "${column}" column`);
  }
  const field = (fields: string[], column: (typeof REQUIRED_COLUMNS)[number]): string =>
    fields[indexOf.get(column)!] ?? "";

  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return {
      clubId: field(fields, "clubId"),
      polityka: field(fields, "polityka"),
      seed: Number(field(fields, "seed")),
      dziedzictwo: Number(field(fields, "dziedzictwo")),
      tytul: field(fields, "tytul"),
      werdykt: field(fields, "werdykt"),
      ocena: Number(field(fields, "ocena")),
      wartoscKadry: Number(field(fields, "wartoscKadry")),
      wartoscKadryMoj: Number(field(fields, "wartoscKadryMoj")),
    };
  });
};

export type Multiplier = number | "current";

/** Recomputes raw (un-handicapped) `dziedzictwo` under a different weight for
 * the squad-value component. `"current"` returns the dumped value unchanged -
 * the formula in production today, kept as a reference row. Mirrors the
 * arithmetic in epilogue.ts:165 exactly, with only the wartoscKadryMoj
 * multiplier being swapped. */
export const hypotheticalLegacy = (
  row: Pick<LegacyRow, "dziedzictwo" | "wartoscKadryMoj">,
  multiplier: Multiplier
): number =>
  multiplier === "current"
    ? row.dziedzictwo
    : Math.round(row.dziedzictwo - row.wartoscKadryMoj * 2 + row.wartoscKadryMoj * multiplier);

/** Mirrors epilogue.ts:154-156: value must clear a threshold to earn that
 * tier (and every tier below it), so the index is how many thresholds it
 * clears. `thresholds` here are the base values (520, 650, ...) - the caller
 * is expected to have already added the handicap to `value`, matching how
 * dziedzictwoZHandicapem is compared in the current formula. */
export const tierFor = (value: number, thresholds: readonly number[]): string =>
  at(TYTULY, thresholds.filter((t) => value >= t).length, "legacy tier");

/**
 * The handicap a row's own club implies today, read from the same continuous
 * `buildCareerBaseline` the reducer uses - never a static per-difficulty
 * table, because a club's handicap is no longer one of three shared values.
 * `--handicaps clubId=value,...` overrides individual clubs; every club not
 * named there keeps this default.
 */
export const defaultHandicapFor = (clubId: string): number =>
  buildCareerBaseline(clubId).legacyHandicap;

/** Re-export the base thresholds from epilogue.ts for convenience in CLI
 * (so legacy-scan.ts can pass them directly to tierFor without mapping). */
export const DEFAULT_THRESHOLDS = PROGI_BAZOWE;
