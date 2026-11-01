import { parseCsvLine } from "./csv";
import { assertComparable, cellKeyOf, dumpIdentityOf, rowKeyOf } from "./dump-identity";
import type { DumpIdentity } from "./dump-identity";
import { renderTable, type TableFormat } from "./balance-report";
import { mean, median, standardError } from "./stats";
import { at } from "../src/logic/invariant";

/**
 * Compares two `pnpm balance --dump-raw` dumps PAIRED BY SEED. The aggregate
 * `--md` tables of the two runs cannot answer this: they carry separate
 * medians and quartiles per run, so any difference read off them is unpaired
 * and drowns in seed variance. Both dumps went through the same seeds, and
 * only a paired difference uses that.
 *
 * Split from the CLI (balance-compare.ts) so tests can import it without
 * triggering main() - the same split legacy-scan-core.ts uses.
 *
 * UNIT CONTRACT, binding for the whole tool: every rate here - `spadekRate`
 * and every band of `tytulRates` - is a FRACTION in 0..1 inside the core.
 * Multiplication by 100 happens only in renderComparison, and it applies to
 * the standard error as well as the value, so both halves of a row share a
 * unit. Legacy is not a rate and is never converted. A threshold read as
 * "5 p.p." is therefore `0.05` against `meanDiff`.
 */

export type PairedDiff = {
  /** Mean of `after - before` over the seeds present in both runs. */
  meanDiff: number;
  standardError: number;
  pairedSeeds: number;
};

export type ComparisonCell = {
  poziom: string;
  /** Null in a level-mode dump. Carried through so the dropped-pair report
   * can name the club a lost career belonged to. */
  klub: string | null;
  polityka: string;
  pairedSeeds: number;
  /** Seeds present in exactly one of the two runs, from either side. A run
   * that lost a game to an exception shows up here rather than silently
   * shifting the pairing. */
  droppedSeeds: number[];
  dziedzictwo: PairedDiff;
  /** Binary `spadkiKadencja > 0`, matching what `pnpm balance` prints as
   * `spadek%`. The `spadki` column is a different quantity: it counts the
   * epilogue seasons too, which the player no longer manages. */
  spadekRate: PairedDiff;
  tytulRates: Record<string, PairedDiff>;
  sezonyRozegraneMedianBefore: number;
  sezonyRozegraneMedianAfter: number;
};

type Row = {
  poziom: string;
  /** Empty in a level-mode dump, where the cell pinned no club, or in a
   * schema-5 dump that carries only `clubId`. */
  klub: string;
  /** Canonical club id, schema 5 only. Empty otherwise. */
  clubId: string;
  incomeMode: string;
  polityka: string;
  seed: number;
  dziedzictwo: number;
  tytul: string;
  spadkiKadencja: number;
  sezonyRozegrane: number;
};

const REQUIRED_COLUMNS = [
  "polityka",
  "seed",
  "dziedzictwo",
  "tytul",
  "spadkiKadencja",
  "sezonyRozegrane",
] as const;

const numberField = (raw: string, column: string, line: number): number => {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Column "${column}" on line ${line} is not a number: "${raw}"`);
  }
  return value;
};

/**
 * Reads the dump BY HEADER NAME, never positionally: `balance.ts` appends
 * columns over time, and a positional reader would silently shift the day a
 * column lands anywhere but the end.
 */
export const parseDump = (text: string): { rows: Row[]; identity: DumpIdentity } => {
  const lines = text.trim().split(/\r?\n/);
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  const indexOf = new Map(header.map((name, index) => [name, index]));
  for (const column of REQUIRED_COLUMNS) {
    if (!indexOf.has(column)) throw new Error(`Dump is missing the "${column}" column`);
  }
  // Exactly one club-identity column is required, not both: "poziom" alone
  // (a level-mode dump), "clubShortName" (schema 2-4) or "clubId" (schema 5).
  if (!indexOf.has("poziom") && !indexOf.has("clubShortName") && !indexOf.has("clubId")) {
    throw new Error('Dump is missing the "poziom" column');
  }
  // clubShortName and incomeMode are read optionally on purpose: a schema-1
  // dump predates both, and reading it must keep working rather than force a
  // re-run of a measurement that has already been taken.
  const field = (fields: string[], column: string): string => {
    const index = indexOf.get(column);
    return index === undefined ? "" : (fields[index] ?? "");
  };
  const rows = lines.slice(1).map((line, offset) => {
    const fields = parseCsvLine(line);
    const lineNumber = offset + 2;
    return {
      poziom: field(fields, "poziom"),
      klub: field(fields, "clubShortName"),
      clubId: field(fields, "clubId"),
      incomeMode: field(fields, "incomeMode") || "normal",
      polityka: field(fields, "polityka"),
      seed: numberField(field(fields, "seed"), "seed", lineNumber),
      dziedzictwo: numberField(field(fields, "dziedzictwo"), "dziedzictwo", lineNumber),
      tytul: field(fields, "tytul"),
      spadkiKadencja: numberField(field(fields, "spadkiKadencja"), "spadkiKadencja", lineNumber),
      sezonyRozegrane: numberField(field(fields, "sezonyRozegrane"), "sezonyRozegrane", lineNumber),
    };
  });
  const identity = dumpIdentityOf(header, rows[0] ?? null);
  const seen = new Set<string>();
  for (const row of rows) {
    const key = rowKeyOf(row, identity);
    if (seen.has(key)) {
      throw new Error(
        `Dump has a duplicate row for ${row.klub || row.clubId || row.poziom}/${row.polityka}/${row.seed}`
      );
    }
    seen.add(key);
  }
  return { rows, identity };
};

const groupByCell = (
  rows: readonly Row[],
  identity: DumpIdentity
): Map<string, Map<number, Row>> => {
  const cells = new Map<string, Map<number, Row>>();
  for (const row of rows) {
    const key = cellKeyOf(row, identity);
    const bySeed = cells.get(key) ?? new Map<number, Row>();
    bySeed.set(row.seed, row);
    cells.set(key, bySeed);
  }
  return cells;
};

/**
 * Mean of the per-seed differences with its standard error. `pairedComparison`
 * in stats.ts answers a different question (median difference and win rate),
 * and `pairBySeed` in balance-metrics.ts is built on it, so this lands beside
 * them rather than reshaping either.
 */
export const pairedDiff = (before: readonly number[], after: readonly number[]): PairedDiff => {
  if (before.length !== after.length) {
    throw new Error("paired difference needs the same number of values on both sides");
  }
  if (before.length === 0) return { meanDiff: 0, standardError: 0, pairedSeeds: 0 };
  const diffs = after.map((value, index) => value - at(before, index, "paired before value"));
  return {
    meanDiff: mean(diffs),
    standardError: standardError(diffs),
    pairedSeeds: diffs.length,
  };
};

export const compareRuns = (beforeText: string, afterText: string): ComparisonCell[] => {
  const beforeDump = parseDump(beforeText);
  const afterDump = parseDump(afterText);
  assertComparable(beforeDump.identity, afterDump.identity);
  const identity = beforeDump.identity;
  const before = groupByCell(beforeDump.rows, identity);
  const after = groupByCell(afterDump.rows, identity);
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();

  return keys.map((key) => {
    const beforeSeeds = before.get(key) ?? new Map<number, Row>();
    const afterSeeds = after.get(key) ?? new Map<number, Row>();
    const shared = [...beforeSeeds.keys()]
      .filter((seed) => afterSeeds.has(seed))
      .sort((a, b) => a - b);
    const dropped = [
      ...[...beforeSeeds.keys()].filter((seed) => !afterSeeds.has(seed)),
      ...[...afterSeeds.keys()].filter((seed) => !beforeSeeds.has(seed)),
    ].sort((a, b) => a - b);

    const beforeRows = shared.map((seed) => beforeSeeds.get(seed)!);
    const afterRows = shared.map((seed) => afterSeeds.get(seed)!);
    const sample =
      beforeRows[0] ?? afterRows[0] ?? [...beforeSeeds.values(), ...afterSeeds.values()][0];
    if (sample === undefined) throw new Error(`comparison group ${key} has no rows on either side`);

    const titles = [
      ...new Set([
        ...[...beforeSeeds.values()].map((row) => row.tytul),
        ...[...afterSeeds.values()].map((row) => row.tytul),
      ]),
    ].sort();
    const tytulRates: Record<string, PairedDiff> = {};
    for (const title of titles) {
      tytulRates[title] = pairedDiff(
        beforeRows.map((row) => (row.tytul === title ? 1 : 0)),
        afterRows.map((row) => (row.tytul === title ? 1 : 0))
      );
    }

    return {
      poziom: sample.poziom,
      klub: sample.klub || sample.clubId || null,
      polityka: sample.polityka,
      pairedSeeds: shared.length,
      droppedSeeds: dropped,
      dziedzictwo: pairedDiff(
        beforeRows.map((row) => row.dziedzictwo),
        afterRows.map((row) => row.dziedzictwo)
      ),
      spadekRate: pairedDiff(
        beforeRows.map((row) => (row.spadkiKadencja > 0 ? 1 : 0)),
        afterRows.map((row) => (row.spadkiKadencja > 0 ? 1 : 0))
      ),
      tytulRates,
      sezonyRozegraneMedianBefore: beforeRows.length
        ? median(beforeRows.map((row) => row.sezonyRozegrane))
        : 0,
      sezonyRozegraneMedianAfter: afterRows.length
        ? median(afterRows.map((row) => row.sezonyRozegrane))
        : 0,
    };
  });
};

const pl = (value: number, digits = 2): string => value.toFixed(digits).replace(".", ",");
const signed = (value: number, digits = 2): string => `${value < 0 ? "" : "+"}${pl(value, digits)}`;

/** Points, never a rate: legacy stays in legacy points on both sides. */
const points = (diff: PairedDiff): string => `${signed(diff.meanDiff)} ± ${pl(diff.standardError)}`;

/** The single place a fraction becomes percentage points - and it converts the
 * standard error too, so the value and its error never leave in different
 * units. */
const percentagePoints = (diff: PairedDiff): string =>
  `${signed(diff.meanDiff * 100)} p.p. ± ${pl(diff.standardError * 100)} p.p.`;

export const renderComparison = (
  cells: readonly ComparisonCell[],
  format: TableFormat = "markdown"
): string => {
  const titles = [...new Set(cells.flatMap((cell) => Object.keys(cell.tytulRates)))].sort();
  // Club-mode dumps (schema 2 on) leave `poziom` empty; a level-mode dump
  // leaves `klub` empty. This column shows whichever the pair actually
  // pinned, so a club-mode comparison never prints a blank first column.
  const scopeLabel = (cell: ComparisonCell): string => cell.klub ?? cell.poziom;
  const mainTable = renderTable(
    [
      "klub/poziom",
      "polityka",
      "n par",
      "Δ dziedzictwo",
      "Δ spadek",
      "mediana sezonów przed",
      "mediana sezonów po",
    ],
    cells.map((cell) => [
      scopeLabel(cell),
      cell.polityka,
      String(cell.pairedSeeds),
      points(cell.dziedzictwo),
      percentagePoints(cell.spadekRate),
      pl(cell.sezonyRozegraneMedianBefore, 1),
      pl(cell.sezonyRozegraneMedianAfter, 1),
    ]),
    format
  );
  const titleTable = renderTable(
    ["klub/poziom", "polityka", ...titles.map((title) => `Δ ${title}`)],
    cells.map((cell) => [
      scopeLabel(cell),
      cell.polityka,
      ...titles.map((title) =>
        cell.tytulRates[title]
          ? percentagePoints(cell.tytulRates[title])
          : percentagePoints({ meanDiff: 0, standardError: 0, pairedSeeds: cell.pairedSeeds })
      ),
    ]),
    format
  );
  const droppedLines = cells
    .filter((cell) => cell.droppedSeeds.length > 0)
    .map(
      (cell) =>
        `- ${cell.klub ?? cell.poziom} / ${cell.polityka}: ${cell.droppedSeeds.length} porzuconych ziaren — ${cell.droppedSeeds.join(", ")}`
    );

  return [
    "# Sparowane porównanie dwóch przebiegów balansu",
    "",
    "Różnice liczone po ziarnie jako `po − przed`, więc dodatnia Δ spadku znaczy „po zmianie spada więcej klubów”. Stopy są w punktach procentowych wraz z ich błędem standardowym; dziedzictwo jest w punktach dziedzictwa i nie podlega przeliczeniu.",
    "",
    "## Dziedzictwo, spadek i długość kadencji",
    "",
    mainTable,
    "",
    "## Pasma tytułów",
    "",
    titleTable,
    "",
    "## Porzucone ziarna",
    "",
    droppedLines.length > 0
      ? droppedLines.join("\n")
      : "Brak — każda komórka sparowała komplet ziaren z obu przebiegów.",
  ].join("\n");
};
