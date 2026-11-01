import { readFileSync } from "node:fs";

import { resolveClubArg } from "./club-args";
import { TYTULY } from "../src/logic/epilogue";
import { parseFlags } from "./cli-args";
import {
  DEFAULT_THRESHOLDS,
  defaultHandicapFor,
  hypotheticalLegacy,
  parseCsv,
  tierFor,
  type LegacyRow,
  type Multiplier,
} from "./legacy-scan-core";
import { distribution, median, percent, quantile } from "./stats";

type Cli = {
  input: string;
  multipliers: Multiplier[];
  /** Per-club overrides, keyed by canonical id. A club named here wins over
   * `defaultHandicapFor`; every other club still gets its own continuous
   * default. */
  handicapOverrides: Map<string, number>;
  thresholds: number[];
  excludePolicies: string[];
};

const KNOWN_FLAGS = ["--in", "--multipliers", "--handicaps", "--thresholds", "--exclude-policy"];

const parseHandicaps = (raw: string): Map<string, number> => {
  const result = new Map<string, number>();
  for (const pair of raw.split(",")) {
    const [name, value] = pair.split("=");
    if (!name || value === undefined) throw new Error(`Invalid --handicaps entry "${pair}"`);
    const clubId = resolveClubArg(name);
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw new Error(`Invalid --handicaps value for "${name}": "${value}"`);
    }
    result.set(clubId, n);
  }
  return result;
};

const parseCli = (argv: string[]): Cli => {
  const cli: Cli = {
    input: "",
    multipliers: [],
    handicapOverrides: new Map(),
    thresholds: DEFAULT_THRESHOLDS,
    excludePolicies: [],
  };

  const flags = parseFlags(argv, KNOWN_FLAGS);
  for (const [flag, value] of flags) {
    if (flag === "--in") cli.input = value;
    else if (flag === "--multipliers") {
      cli.multipliers = value.split(",").map((v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new Error(`Invalid --multipliers value: "${v}"`);
        return n;
      });
    } else if (flag === "--handicaps") cli.handicapOverrides = parseHandicaps(value);
    else if (flag === "--thresholds") {
      cli.thresholds = value.split(",").map((v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new Error(`Invalid --thresholds value: "${v}"`);
        return n;
      });
    } else if (flag === "--exclude-policy") cli.excludePolicies = value.split(",");
  }

  if (!cli.input) throw new Error("--in <csv> is required");
  return cli;
};

const PERCENTILES = [
  { label: "P10", p: 0.1 },
  { label: "P35", p: 0.35 },
  { label: "P67", p: 0.67 },
  { label: "P89", p: 0.89 },
  { label: "P97", p: 0.97 },
];

/** The handicap this scan applies to a row: the override if its club is
 * named in `--handicaps`, else `buildCareerBaseline(clubId).legacyHandicap`. */
const handicapFor = (cli: Cli, clubId: string): number =>
  cli.handicapOverrides.get(clubId) ?? defaultHandicapFor(clubId);

const main = (): void => {
  const cli = parseCli(process.argv.slice(2));
  const allRows = parseCsv(readFileSync(cli.input, "utf8"));
  const rows = cli.excludePolicies.length
    ? allRows.filter((r) => !cli.excludePolicies.includes(r.polityka))
    : allRows;

  if (rows.length === 0) throw new Error("No rows left after filtering - check --exclude-policy");

  const multiplierList: Multiplier[] = ["current", ...cli.multipliers];

  console.log(`Wejscie: ${cli.input} (${allRows.length} wierszy, ${rows.length} po wykluczeniach)`);
  console.log(`Wykluczone polityki: ${cli.excludePolicies.join(", ") || "brak"}`);
  console.log(
    `Handicapy: domyslnie buildCareerBaseline(clubId).legacyHandicap${
      cli.handicapOverrides.size > 0
        ? `, nadpisania: ${[...cli.handicapOverrides.entries()].map(([id, v]) => `${id}=${v}`).join(", ")}`
        : ""
    }`
  );
  console.log(`Progi bazowe: ${cli.thresholds.join(", ")}`);
  console.log("");

  for (const m of multiplierList) {
    const adjusted = rows.map((r) => hypotheticalLegacy(r, m) + handicapFor(cli, r.clubId));

    console.log(`== M = ${m} ==`);
    const pctRow = PERCENTILES.map(
      ({ label, p }) => `${label}=${quantile(adjusted, p).toFixed(1)}`
    );
    console.log(`Percentyle (po handicapie): ${pctRow.join(" ")}`);

    const tiers = adjusted.map((v) => tierFor(v, cli.thresholds));
    const tierCounts = distribution(tiers);
    for (const tytul of TYTULY) {
      console.log(`  ${tytul}: ${percent(tierCounts[tytul] ?? 0, tiers.length).toFixed(1)}%`);
    }

    const byClubPolicy = new Map<string, LegacyRow[]>();
    for (const r of rows) {
      const key = `${r.clubId}/${r.polityka}`;
      const list = byClubPolicy.get(key) ?? [];
      list.push(r);
      byClubPolicy.set(key, list);
    }
    console.log("  mediana raw (bez handicapu), obecna vs hipotetyczna, per klub/polityka:");
    for (const [key, group] of [...byClubPolicy.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    )) {
      const currentMedian = median(group.map((r) => r.dziedzictwo));
      const hypotheticalMedian = median(group.map((r) => hypotheticalLegacy(r, m)));
      console.log(
        `    ${key}: obecna=${currentMedian.toFixed(1)} hipotetyczna=${hypotheticalMedian.toFixed(1)} delta=${(hypotheticalMedian - currentMedian).toFixed(1)}`
      );
    }
    console.log("");
  }
};

main();
