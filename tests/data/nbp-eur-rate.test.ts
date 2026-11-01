import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { EUR_PLN_SOURCE_SEASON } from "../../src/data/balance";

type NbpFile = { rates: { effectiveDate: string; mid: number }[] };

const file = JSON.parse(
  readFileSync(join(process.cwd(), "scripts", "data", "nbp-eur-2024-07-2025-06.json"), "utf8")
) as NbpFile;

test("the pinned NBP file covers the source financial year once per publication day", () => {
  const dates = file.rates.map((r) => r.effectiveDate);
  expect(dates.length).toBe(251);
  expect(new Set(dates).size).toBe(251);
  expect(dates[0]! >= "2024-07-01" && dates.at(-1)! <= "2025-06-30").toBe(true);
});

test("EUR_PLN_SOURCE_SEASON is the mean of the pinned rates to four places", () => {
  const mean = file.rates.reduce((sum, r) => sum + r.mid, 0) / file.rates.length;
  expect(Number(mean.toFixed(4))).toBe(EUR_PLN_SOURCE_SEASON);
});
