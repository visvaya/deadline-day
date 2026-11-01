import { parseFlags } from "./cli-args";
import type { AuditCli } from "./european-cups-audit-core";

/** Flag parsing for pnpm audit:european-cups, split from the entry point so
 * tests can import it without running main(). */
const KNOWN_FLAGS = [
  "--runs",
  "--seed",
  "--variant",
  "--strength-samples",
  "--careers",
  "--md",
  "--help",
];

const positiveInteger = (raw: string, flag: string): number => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer, got "${raw}"`);
  }
  return value;
};

export const parseEuropeanCupsCli = (argv: string[]): AuditCli => {
  const flags = parseFlags(argv, KNOWN_FLAGS, ["--help"]);
  const runs = flags.has("--runs") ? positiveInteger(flags.get("--runs")!, "--runs") : 20_000;
  const strengthSamples = flags.has("--strength-samples")
    ? positiveInteger(flags.get("--strength-samples")!, "--strength-samples")
    : 200;
  const careers = flags.has("--careers") ? Number(flags.get("--careers")) : 200;
  if (!Number.isInteger(careers) || careers < 0) {
    throw new Error(`--careers must be a non-negative integer, got "${flags.get("--careers")}"`);
  }
  const rawSeed = flags.get("--seed");
  const seed = rawSeed === undefined ? 0x4e05_7c01 : Number(rawSeed);
  if (!Number.isFinite(seed)) throw new Error(`--seed must be a number, got "${rawSeed}"`);
  const variant = flags.get("--variant") ?? "baseline";
  return {
    runs,
    seed: seed >>> 0,
    md: flags.get("--md") ?? null,
    variant,
    strengthSamples,
    careers,
  };
};
