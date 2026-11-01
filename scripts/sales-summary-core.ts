import type { SaleObservation } from "./balance-metrics";
import { parseCsvLine } from "./csv";
import { median } from "./stats";
import { at } from "../src/logic/invariant";

/**
 * Pure summariser for `pnpm balance --dump-sales` dumps: groups the observed
 * SPRZEDAZ cards by `clubId x policyName` and reports the domestic/foreign
 * split of both offers shown and deals actually closed. Split from
 * sales-summary.ts (the CLI) so it can be imported and tested without a
 * process - the same split every other *-core.ts module in this directory
 * uses.
 *
 * `foreignOfferShare` and `foreignDealShare` are deliberately separate
 * quantities: an offer the player declined never became a deal, and a market
 * that shows more foreign offers without ever closing more foreign deals is
 * a different finding from one that does both.
 */

export type SalesSummaryRow = {
  clubId: string;
  policyName: string;
  offers: number;
  foreignOfferShare: number;
  deals: number;
  foreignDealShare: number;
  medianOfferPrice: number;
  /** Null when the cell closed no deals - a median of zero observations. */
  medianRealisedFee: number | null;
};

const cellKey = (clubId: string, policyName: string): string => `${clubId}|${policyName}`;

export const summarizeSales = (rows: readonly SaleObservation[]): SalesSummaryRow[] => {
  const byCell = new Map<string, SaleObservation[]>();
  for (const row of rows) {
    const key = cellKey(row.clubId, row.policyName);
    const bucket = byCell.get(key);
    if (bucket) bucket.push(row);
    else byCell.set(key, [row]);
  }

  const summaries: SalesSummaryRow[] = [];
  for (const [, bucket] of byCell) {
    const { clubId, policyName } = at(bucket, 0, "first sale of the cell");
    const deals = bucket.filter((row) => row.realisedFee !== null);
    const foreignOffers = bucket.filter((row) => row.buyerOrigin === "foreign").length;
    const foreignDeals = deals.filter((row) => row.buyerOrigin === "foreign").length;
    summaries.push({
      clubId,
      policyName,
      offers: bucket.length,
      foreignOfferShare: bucket.length > 0 ? foreignOffers / bucket.length : 0,
      deals: deals.length,
      foreignDealShare: deals.length > 0 ? foreignDeals / deals.length : 0,
      medianOfferPrice: median(bucket.map((row) => row.offerPrice)),
      medianRealisedFee:
        deals.length > 0 ? median(deals.map((row) => row.realisedFee as number)) : null,
    });
  }

  summaries.sort(
    (a, b) => a.clubId.localeCompare(b.clubId) || a.policyName.localeCompare(b.policyName)
  );
  return summaries;
};

const REQUIRED_COLUMNS = [
  "clubId",
  "policyName",
  "seed",
  "decisionIndex",
  "season",
  "offerPrice",
  "realisedFee",
  "buyerOrigin",
  "buyerClubId",
] as const;

const parseNumberColumn = (raw: string, column: string): number => {
  const value = Number(raw);
  if (Number.isNaN(value)) throw new Error(`Column "${column}" is not numeric: "${raw}"`);
  return value;
};

/**
 * Parses a `--dump-sales` CSV by header name, the same discipline
 * legacy-scan-core.ts's parseCsv uses: a column can land anywhere in the
 * file, and a missing one is named in the error rather than shifting every
 * later value by one.
 */
export const parseSalesCsv = (text: string): SaleObservation[] => {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0 || lines[0] === "") return [];
  const header = parseCsvLine(at(lines, 0, "CSV header"));
  const indexOf = new Map(header.map((name, index) => [name, index]));
  for (const column of REQUIRED_COLUMNS) {
    if (!indexOf.has(column)) throw new Error(`Dump is missing the "${column}" column`);
  }
  const unknown = header.find((name) => !(REQUIRED_COLUMNS as readonly string[]).includes(name));
  if (unknown !== undefined) throw new Error(`Dump has an unknown column: "${unknown}"`);

  const field = (fields: string[], column: (typeof REQUIRED_COLUMNS)[number]): string =>
    fields[indexOf.get(column)!] ?? "";

  return lines
    .slice(1)
    .filter((line) => line.length > 0)
    .map((line) => {
      const fields = parseCsvLine(line);
      const realisedFeeRaw = field(fields, "realisedFee");
      const buyerClubIdRaw = field(fields, "buyerClubId");
      const buyerOrigin = field(fields, "buyerOrigin");
      if (buyerOrigin !== "domestic" && buyerOrigin !== "foreign") {
        throw new Error(`Column "buyerOrigin" is neither domestic nor foreign: "${buyerOrigin}"`);
      }
      return {
        clubId: field(fields, "clubId"),
        policyName: field(fields, "policyName"),
        seed: parseNumberColumn(field(fields, "seed"), "seed"),
        decisionIndex: parseNumberColumn(field(fields, "decisionIndex"), "decisionIndex"),
        season: parseNumberColumn(field(fields, "season"), "season"),
        offerPrice: parseNumberColumn(field(fields, "offerPrice"), "offerPrice"),
        realisedFee:
          realisedFeeRaw === "" ? null : parseNumberColumn(realisedFeeRaw, "realisedFee"),
        buyerOrigin,
        buyerClubId: buyerClubIdRaw === "" ? null : buyerClubIdRaw,
      };
    });
};
