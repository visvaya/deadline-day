import { LEGACY_KASA, LEGACY_SPADEK, LEGACY_WARTOSC_KADRY } from "../src/data/balance";
import { TYTULY } from "../src/logic/epilogue";
import type { CellAggregate, GameMetrics, PairMetricComparison } from "./balance-metrics";
import { WERDYKTY } from "./balance-metrics";
import { at, recordAt } from "../src/logic/invariant";

export type RunError = {
  seed: number;
  /** The cell's club - every run in a cell fails or succeeds against one
   * club, so a failure has to say WHICH one, or the eighteen possible cells
   * report one indistinguishable failure. */
  klub: string;
  polityka: string;
  komunikat: string;
};

/**
 * The unit a paired comparison may be made within: one club. `--clubs` is the
 * run's only dimension now, so a cell's scope is exactly its club id.
 */
export type CellScope = { clubId: string };

/** No escaping needed: a club id cannot contain a NUL, and there is nothing
 * else left to join it with now that the level dimension is gone. */
export const scopeKey = (scope: CellScope): string => scope.clubId;

export type TableFormat = "ascii" | "markdown";

const num = (value: number, digits = 1): string => value.toFixed(digits);
/** A metric a cell may legitimately have no sample for - every career there
 * ended before the epilogue, so there is no average place to print. */
const numOrDash = (value: number | null, digits = 1): string =>
  value === null ? "–" : num(value, digits);
const pct = (value: number): string => `${num(value)}%`;

export const renderTable = (headers: string[], rows: string[][], format: TableFormat): string => {
  if (format === "markdown") {
    const headerRow = `| ${headers.join(" | ")} |`;
    const sepRow = `| ${headers.map(() => "---").join(" | ")} |`;
    const bodyRows = rows.map((r) => `| ${r.join(" | ")} |`);
    return [headerRow, sepRow, ...bodyRows].join("\n");
  }
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => at(r, i, "table cell").length))
  );
  const renderRow = (cells: string[]): string =>
    cells.map((c, i) => c.padEnd(at(widths, i, "column width"))).join(" | ");
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  return [renderRow(headers), sep, ...rows.map(renderRow)].join("\n");
};

export const renderSummaryTable = (cells: readonly CellAggregate[], format: TableFormat): string =>
  renderTable(
    ["klub", "polityka", "n", "min", "P25", "mediana", "P75", "max", "srednia"],
    cells.map((c) => [
      c.klub,
      c.policyName,
      String(c.n),
      num(c.dziedzictwo.min),
      num(c.dziedzictwo.p25),
      num(c.dziedzictwo.median),
      num(c.dziedzictwo.p75),
      num(c.dziedzictwo.max),
      num(c.dziedzictwo.mean),
    ]),
    format
  );

export const renderBreakdownTable = (
  cells: readonly CellAggregate[],
  format: TableFormat
): string =>
  renderTable(
    [
      "klub",
      "polityka",
      "pktA",
      "pktB",
      "trofea",
      `kasa*${LEGACY_KASA}`,
      `wartoscKadryMoj*${LEGACY_WARTOSC_KADRY}`,
      `-spadki*${LEGACY_SPADEK}`,
      "mojKadry/Kadry",
    ],
    cells.map((c) => [
      c.klub,
      c.policyName,
      `${num(c.breakdownMedian.pktA)} (${pct(c.breakdownSharePct.pktA)})`,
      `${num(c.breakdownMedian.pktB)} (${pct(c.breakdownSharePct.pktB)})`,
      `${num(c.breakdownMedian.trofea)} (${pct(c.breakdownSharePct.trofea)})`,
      `${num(c.breakdownMedian.kasa)} (${pct(c.breakdownSharePct.kasa)})`,
      `${num(c.breakdownMedian.wartoscKadryMoj)} (${pct(c.breakdownSharePct.wartoscKadryMoj)})`,
      `${num(c.breakdownMedian.spadki)} (${pct(c.breakdownSharePct.spadki)})`,
      pct(c.breakdownMedian.wartoscKadryMojRatio * 100),
    ]),
    format
  );

export const renderTytulTable = (cells: readonly CellAggregate[], format: TableFormat): string =>
  renderTable(
    ["klub", "polityka", ...TYTULY],
    cells.map((c) => [
      c.klub,
      c.policyName,
      ...TYTULY.map((t) => pct(recordAt(c.tytulPct, t, "title share"))),
    ]),
    format
  );

export const renderWerdyktTable = (cells: readonly CellAggregate[], format: TableFormat): string =>
  renderTable(
    ["klub", "polityka", ...WERDYKTY, "ocenaKadencjaMediana"],
    cells.map((c) => [
      c.klub,
      c.policyName,
      ...WERDYKTY.map((w) => pct(recordAt(c.werdyktPct, w, "verdict share"))),
      num(c.ocenaKadencjaMedian),
    ]),
    format
  );

export const renderRiskTable = (cells: readonly CellAggregate[], format: TableFormat): string =>
  renderTable(
    [
      "klub",
      "polityka",
      "spadek%",
      "kasa<0%",
      ">=1 mistrz%",
      "srednie bierz%",
      "miejsce s1-5",
      "miejsce s6-10",
      "kadra S5",
      "kadra koniec",
      "sezony",
    ],
    cells.map((c) => [
      c.klub,
      c.policyName,
      pct(c.spadekPct),
      pct(c.kasaNegativePct),
      pct(c.mistrzPct),
      pct(c.udzialBierzMean),
      num(c.miejsceSezonyMean),
      numOrDash(c.miejsceEpilogMean),
      num(c.squadSizeAtHandoverMedian, 0),
      num(c.squadSizeEndMedian, 0),
      num(c.sezonyRozegraneMedian, 0),
    ]),
    format
  );

export type PolicyVsPassRow = {
  klub: string;
  policyName: string;
  cmp: PairMetricComparison;
};

export const renderVsPassTable = (rows: readonly PolicyVsPassRow[], format: TableFormat): string =>
  renderTable(
    ["klub", "polityka", "n sparowane", "mediana roznicy dziedzictwa", "% wygranych z alwaysPass"],
    rows.map((r) => [
      r.klub,
      r.policyName,
      String(r.cmp.pairedSeeds),
      num(r.cmp.medianDiff),
      pct(r.cmp.winRate),
    ]),
    format
  );

export type AgeDilemmaRow = {
  klub: string;
  pivot: string;
  against: string;
  dziedzictwo: PairMetricComparison;
  pktA: PairMetricComparison;
  pktB: PairMetricComparison;
};

export const renderAgeDilemmaTable = (
  rows: readonly AgeDilemmaRow[],
  format: TableFormat
): string =>
  renderTable(
    [
      "klub",
      "polityka",
      "vs",
      "n",
      "dziedzictwo: mediana roznicy",
      "dziedzictwo: % wygranych",
      "pktA: mediana roznicy",
      "pktB: mediana roznicy",
    ],
    rows.map((r) => [
      r.klub,
      r.pivot,
      r.against,
      String(r.dziedzictwo.pairedSeeds),
      num(r.dziedzictwo.medianDiff),
      pct(r.dziedzictwo.winRate),
      num(r.pktA.medianDiff),
      num(r.pktB.medianDiff),
    ]),
    format
  );

export const renderErrorSummary = (errors: readonly RunError[]): string => {
  if (errors.length === 0) return "Brak bledow.";
  const lines = errors
    .slice(0, 20)
    .map((e) => `  seed=${e.seed} klub=${e.klub} polityka=${e.polityka}: ${e.komunikat}`);
  const more = errors.length > 20 ? `\n  ... i ${errors.length - 20} kolejnych` : "";
  return `${errors.length} bledow:\n${lines.join("\n")}${more}`;
};

export type RunInfo = {
  totalGames: number;
  seedBase: number;
  runsPerCell: number;
  errorCount: number;
  durationSeconds: number;
};

export const renderFooter = (info: RunInfo): string =>
  [
    `Partii rozegranych: ${info.totalGames}`,
    `Ziarno bazowe: 0x${info.seedBase.toString(16)}`,
    `--runs: ${info.runsPerCell}`,
    `Bledow: ${info.errorCount}`,
    `Czas: ${info.durationSeconds.toFixed(1)}s`,
  ].join("\n");

export const groupCellsByComparability = (
  cells: readonly CellAggregate[]
): Map<string, CellAggregate[]> => {
  const map = new Map<string, CellAggregate[]>();
  for (const cell of cells) {
    const key = scopeKey(cell);
    const list = map.get(key) ?? [];
    list.push(cell);
    map.set(key, list);
  }
  return map;
};

export type GamesByScopeAndPolicy = Map<string, Map<string, readonly GameMetrics[]>>;
