import { parseCsvLine } from "./csv";
import { assertComparable, cellKeyOf, dumpIdentityOf, rowKeyOf } from "./dump-identity";
import type { DumpIdentity } from "./dump-identity";
import { OFFER_TYPES } from "./balance-metrics";
import type { OfferType } from "../src/data/types";
import { mean, standardError } from "./stats";
import { at } from "../src/logic/invariant";

/**
 * Compares which card types two `pnpm balance --dump-raw` dumps actually put
 * on screen, PAIRED BY SEED.
 *
 * Shares rather than counts, computed per game and only then averaged: a
 * career cut short by relegation shows fewer cards than one played to the
 * end, and counting raw cards would silently weight the long careers more
 * heavily than the short ones. A share answers the question the offer filter
 * actually raises - "what fraction of what the player saw was a KUPNO" -
 * which is invariant to how long the career lasted.
 *
 * Split from the CLI (offer-mix-compare.ts) so tests can import it without
 * triggering main(), the same split balance-compare-core.ts uses.
 *
 * UNIT CONTRACT, binding for the whole tool: every share and every delta is
 * a FRACTION in 0..1 inside the core. Multiplication by 100 into percentage
 * points happens only in renderOfferMix, and it applies to the standard
 * error as well as the value, so both halves of a row share a unit. A
 * threshold read as "5 pp" is therefore `0.05` against `meanDiff`.
 */

export type OfferShareDiff = {
  /** Mean per-game share before, as a fraction of that game's cards. */
  meanBefore: number;
  meanAfter: number;
  /** Mean of `after - before` over the seeds present in both runs. */
  meanDiff: number;
  standardError: number;
};

export type OfferMixComparison = {
  poziom: string;
  /** Null in a level-mode dump. */
  klub: string | null;
  polityka: string;
  pairedSeeds: number;
  /** Seeds present in exactly one of the two runs. A run that lost a game to
   * an exception surfaces here rather than silently shifting the pairing. */
  droppedSeeds: number[];
  shares: Record<OfferType, OfferShareDiff>;
};

type Row = {
  poziom: string;
  klub: string;
  /** Canonical club id, schema 5 only. Empty otherwise. */
  clubId: string;
  incomeMode: string;
  polityka: string;
  seed: number;
  /** Share of this game's shown cards, per type. Sums to 1 across the five
   * types unless the game showed no cards at all. */
  shares: Record<OfferType, number>;
};

const COLUMN_OF: Record<OfferType, string> = {
  KUPNO: "ofertyKupno",
  SPRZEDAZ: "ofertySprzedaz",
  PRZEDLUZENIE: "ofertyPrzedluzenie",
  WOLNY: "ofertyWolny",
  PANIC: "ofertyPanic",
};

const KEY_COLUMNS = ["polityka", "seed"] as const;

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
export const parseOfferDump = (text: string): { rows: Row[]; identity: DumpIdentity } => {
  const lines = text.trim().split(/\r?\n/);
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  const indexOf = new Map(header.map((name, index) => [name, index]));
  for (const column of [...KEY_COLUMNS, ...OFFER_TYPES.map((type) => COLUMN_OF[type])]) {
    if (!indexOf.has(column)) throw new Error(`Dump is missing the "${column}" column`);
  }
  // Exactly one club-identity column is required: "poziom" alone (level
  // mode), "clubShortName" (schema 2-4) or "clubId" (schema 5).
  if (!indexOf.has("poziom") && !indexOf.has("clubShortName") && !indexOf.has("clubId")) {
    throw new Error('Dump is missing the "poziom" column');
  }
  // clubShortName and incomeMode are optional: a schema-1 dump predates both.
  const field = (fields: string[], column: string): string => {
    const index = indexOf.get(column);
    return index === undefined ? "" : (fields[index] ?? "");
  };

  const rows = lines.slice(1).map((line, offset) => {
    const fields = parseCsvLine(line);
    const lineNumber = offset + 2;
    const counts = OFFER_TYPES.map((type) =>
      numberField(field(fields, COLUMN_OF[type]), COLUMN_OF[type], lineNumber)
    );
    const total = counts.reduce((sum, count) => sum + count, 0);
    const shares = Object.fromEntries(
      OFFER_TYPES.map((type, index) => [
        type,
        total === 0 ? 0 : at(counts, index, "offer count") / total,
      ])
    ) as Record<OfferType, number>;
    return {
      poziom: field(fields, "poziom"),
      klub: field(fields, "clubShortName"),
      clubId: field(fields, "clubId"),
      incomeMode: field(fields, "incomeMode") || "normal",
      polityka: field(fields, "polityka"),
      seed: numberField(field(fields, "seed"), "seed", lineNumber),
      shares,
    };
  });

  const identity = dumpIdentityOf(header, rows[0] ?? null);
  const seen = new Set<string>();
  for (const row of rows) {
    const key = rowKeyOf(row, identity);
    if (seen.has(key)) {
      throw new Error(
        `Dump has a duplicate row for ${row.klub || row.clubId || row.poziom}/${row.seed}`
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

export const compareOfferMix = (beforeText: string, afterText: string): OfferMixComparison[] => {
  const beforeDump = parseOfferDump(beforeText);
  const afterDump = parseOfferDump(afterText);
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

    const shares = Object.fromEntries(
      OFFER_TYPES.map((type) => {
        const beforeShares = beforeRows.map((row) => row.shares[type]);
        const afterShares = afterRows.map((row) => row.shares[type]);
        const diffs = afterShares.map(
          (value, index) => value - at(beforeShares, index, "paired before share")
        );
        return [
          type,
          {
            meanBefore: beforeShares.length ? mean(beforeShares) : 0,
            meanAfter: afterShares.length ? mean(afterShares) : 0,
            meanDiff: diffs.length ? mean(diffs) : 0,
            standardError: diffs.length ? standardError(diffs) : 0,
          } satisfies OfferShareDiff,
        ];
      })
    ) as Record<OfferType, OfferShareDiff>;

    return {
      poziom: sample.poziom,
      klub: sample.klub || sample.clubId || null,
      polityka: sample.polityka,
      pairedSeeds: shared.length,
      droppedSeeds: dropped,
      shares,
    };
  });
};

const pl = (value: number, digits = 2): string => value.toFixed(digits).replace(".", ",");

/** Renders the comparison as Markdown. Fractions become percentage points
 * here and nowhere else - see the unit contract at the top of this file. */
export const renderOfferMix = (cells: readonly OfferMixComparison[]): string => {
  const lines = [
    "# Miks pokazanych ofert - porównanie sparowane",
    "",
    "Udział liczony **per partia** (typ / wszystkie karty tej partii), a dopiero potem",
    "uśredniony, więc kariera skrócona spadkiem nie waży mniej od dogranej do końca.",
    "Delta jest sparowana po seedzie; jednostka to punkty procentowe.",
    "",
  ];
  for (const cell of cells) {
    lines.push(`## ${cell.klub ?? cell.poziom} / ${cell.polityka}`, "");
    lines.push(`Sparowanych partii: ${cell.pairedSeeds}.`);
    if (cell.droppedSeeds.length) {
      lines.push(`Porzucone ziarna: ${cell.droppedSeeds.join(", ")}.`);
    }
    lines.push(
      "",
      "| typ | udział przed | udział po | Δ ± SE |",
      "| --- | ---: | ---: | ---: |",
      ...OFFER_TYPES.map((type) => {
        const share = cell.shares[type];
        return `| ${type} | ${pl(share.meanBefore * 100)}% | ${pl(share.meanAfter * 100)}% | ${pl(
          share.meanDiff * 100
        )} ± ${pl(share.standardError * 100)} pp |`;
      }),
      ""
    );
  }
  return lines.join("\n");
};
