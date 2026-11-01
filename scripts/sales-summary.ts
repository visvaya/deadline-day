import { readFileSync, writeFileSync } from "node:fs";

import { renderTable, type TableFormat } from "./balance-report";
import { parseSalesCsv, summarizeSales } from "./sales-summary-core";
import type { SalesSummaryRow } from "./sales-summary-core";
import { parseFlags } from "./cli-args";
import { at } from "../src/logic/invariant";

/**
 * CLI over sales-summary-core: takes two `pnpm balance --dump-sales` dumps -
 * a before and an after - and prints the domestic/foreign split of both
 * offers shown and deals closed, per `clubId x policyName` cell. Task 5
 * builds this before Task 7 changes the buyer, so today's before and after
 * are expected to be identical; the tool exists to measure the change once
 * it lands, not to prove anything about the engine yet.
 */

type Cli = { before: string; after: string; md: string | null };

const KNOWN_FLAGS = ["--before", "--after", "--md"];

const parseSalesSummaryCli = (argv: string[]): Cli => {
  const flags = parseFlags(argv, KNOWN_FLAGS);
  const cli: Cli = {
    before: flags.get("--before") ?? "",
    after: flags.get("--after") ?? "",
    md: flags.get("--md") ?? null,
  };
  if (!cli.before) throw new Error("--before <csv> is required");
  if (!cli.after) throw new Error("--after <csv> is required");
  return cli;
};

const pl = (value: number, digits = 2): string => value.toFixed(digits).replace(".", ",");
const pct = (value: number): string => `${pl(value * 100, 1)}%`;
const money = (value: number | null): string => (value === null ? "–" : `${pl(value)} mln`);
const diff = (before: number | null, after: number | null): string =>
  before === null || after === null ? "–" : pl(after - before);

const cellKey = (row: SalesSummaryRow): string => `${row.clubId}|${row.policyName}`;

export const renderSalesSummary = (
  before: readonly SalesSummaryRow[],
  after: readonly SalesSummaryRow[],
  format: TableFormat = "markdown"
): string => {
  const beforeByKey = new Map(before.map((row) => [cellKey(row), row]));
  const afterByKey = new Map(after.map((row) => [cellKey(row), row]));
  const keys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])].sort();

  const rows = keys.map((key) => {
    const b = beforeByKey.get(key) ?? null;
    const a = afterByKey.get(key) ?? null;
    const parts = key.split("|");
    return [
      at(parts, 0, "cell key club"),
      at(parts, 1, "cell key policy"),
      b ? pct(b.foreignOfferShare) : "–",
      a ? pct(a.foreignOfferShare) : "–",
      b ? pct(b.foreignDealShare) : "–",
      a ? pct(a.foreignDealShare) : "–",
      b ? money(b.medianOfferPrice) : "–",
      a ? money(a.medianOfferPrice) : "–",
      diff(b?.medianOfferPrice ?? null, a?.medianOfferPrice ?? null),
      b ? money(b.medianRealisedFee) : "–",
      a ? money(a.medianRealisedFee) : "–",
      diff(b?.medianRealisedFee ?? null, a?.medianRealisedFee ?? null),
    ];
  });

  const table = renderTable(
    [
      "clubId",
      "polityka",
      "zagranica ofert (przed)",
      "zagranica ofert (po)",
      "zagranica transakcji (przed)",
      "zagranica transakcji (po)",
      "mediana ceny oferty (przed)",
      "mediana ceny oferty (po)",
      "Δ mediana ceny oferty",
      "mediana zrealizowanej kwoty (przed)",
      "mediana zrealizowanej kwoty (po)",
      "Δ mediana zrealizowanej kwoty",
    ],
    rows,
    format
  );

  return [
    "# Podsumowanie obserwatora sprzedaży: przed / po",
    "",
    table,
    "",
    "Mediany zrealizowanych kwot są liczone na próbach wyselekcjonowanych przez politykę i odrzucenia; nie porównuje się pojedynczych kart po indeksie.",
  ].join("\n");
};

const main = (): void => {
  const cli = parseSalesSummaryCli(process.argv.slice(2));
  const before = summarizeSales(parseSalesCsv(readFileSync(cli.before, "utf8")));
  const after = summarizeSales(parseSalesCsv(readFileSync(cli.after, "utf8")));

  const ascii = renderSalesSummary(before, after, "ascii");
  process.stdout.write(`${ascii}\n`);

  if (cli.md) {
    writeFileSync(cli.md, `${renderSalesSummary(before, after, "markdown")}\n`, "utf8");
    process.stdout.write(`\nZapisano raport: ${cli.md}\n`);
  }
};

main();
