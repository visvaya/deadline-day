import { ACTIVE_CLUBS, resolveClubArg } from "./club-args";

export { ACTIVE_CLUBS };
import type { Policy } from "../src/logic/simulate";
import {
  alwaysHaggle,
  alwaysPass,
  alwaysTake,
  cycle,
  depthFirst,
  analystEdgeBuy,
  primeOnly,
  primeOnlyBuy,
  stallThenTake,
  veteranOnly,
  veteranOnlyBuy,
  youngBuySellAlways,
  youngBuySellStars,
  youngOnly,
  youngOnlyBuy,
} from "../src/logic/simulate-policies";
import { parseFlags } from "./cli-args";

/**
 * The balance simulator's argument surface, split out of balance.ts so it can
 * be imported and tested without running the simulator - the same split
 * legacy-scan-core.ts and balance-compare-core.ts use. Importing this module
 * must have no side effect beyond building the tables below.
 */

export const POLICIES: Record<string, Policy> = {
  alwaysPass,
  youngOnly,
  primeOnly,
  veteranOnly,
  youngOnlyBuy,
  primeOnlyBuy,
  veteranOnlyBuy,
  youngBuySellAlways,
  alwaysTake,
  alwaysHaggle,
  stallThenTake,
  depthFirst,
  analystEdgeBuy,
  mixed: cycle(["bierz", "pas", "targ"]),
  youngBuySellStars,
};

/** Pivots for the age-dilemma table: which policy is compared against which.
 * Two independent comparisons - the raw age filters (contaminated by
 * self-sale on SPRZEDAZ) and the
 * buy-only variants that answer the same question cleanly. */
export const AGE_DILEMMAS: { pivot: string; against: string[] }[] = [
  { pivot: "youngOnly", against: ["primeOnly", "veteranOnly"] },
  { pivot: "youngOnlyBuy", against: ["primeOnlyBuy", "veteranOnlyBuy"] },
];

export const DEFAULT_SEED = 0x5eed_0001;

/**
 * The four clubs of the day-to-day quick scan: one from each rough tier of
 * the old three-difficulty world, so a
 * default `pnpm balance` run still sees a spread of club strengths without
 * running the full eighteen. A full measurement requires an explicit
 * `--clubs all`: the full measurement needs every club.
 */
export const ANCHOR_CLUB_IDS: readonly string[] = [
  "legia-warszawa",
  "zaglebie-lubin",
  "wisla-krakow",
  "wieczysta-krakow",
];

export type BalanceCli = {
  runs: number;
  seed: number;
  md: string | null;
  dumpRaw: string | null;
  dumpSignings: string | null;
  /** One row per SPRZEDAZ card observed by simulateGame's onCard hook,
   * before/after Task 7's buyer-choice change. */
  dumpSales: string | null;
  /** One row per CAREER, summarising the external-signing and sale dilemmas
   * simulateGame's onCard hook observed - see scripts/dilemma-observations.ts. */
  dumpDilemmas: string | null;
  /** One row per PLAYED SEASON, not per career: the money scale is measured
   * on seasons, and a career aggregate cannot answer whether an ordinary
   * season came out even. */
  dumpSeasons: string | null;
  policies: string[];
  /** The cells the run plays, one per club: the anchor four by default, the
   * full eighteen with `--clubs all`, or an explicit list. Never null and
   * never empty - `--clubs` is the only dimension a cell has left. */
  clubs: string[];
  financeControl: boolean;
};

const KNOWN_FLAGS = [
  "--runs",
  "--seed",
  "--md",
  "--dump-raw",
  "--dump-signings",
  "--dump-sales",
  "--dump-dilemmas",
  "--dump-seasons",
  "--levels",
  "--policies",
  "--clubs",
  "--finance-control",
];

/** Flags that stand alone. Left out of this list, --finance-control would
 * swallow the next argument as its value. */
const VALUELESS_FLAGS = ["--finance-control"];

const parseSeed = (raw: string): number => {
  const n = raw.startsWith("0x") || raw.startsWith("0X") ? parseInt(raw, 16) : parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid --seed value: "${raw}"`);
  return n >>> 0;
};

const parseClubs = (value: string): string[] => {
  const raw = value.trim();
  if (raw === "all") return [...ACTIVE_CLUBS];
  const names = raw.split(",").map((name) => name.trim());
  if (names.some((name) => name === "")) {
    throw new Error(`Invalid --clubs value: "${value}"`);
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const name of names) {
    // Normalises id or short name to an id BEFORE the duplicate check, so
    // "Legia" and "legia-warszawa" in the same list are caught as the same
    // club rather than silently producing two cells for one.
    const id = resolveClubArg(name);
    if (seen.has(id)) throw new Error(`Duplicate club in --clubs: "${name}"`);
    seen.add(id);
    ids.push(id);
  }
  return ids;
};

export const parseBalanceCli = (argv: string[]): BalanceCli => {
  const cli: BalanceCli = {
    runs: 200,
    seed: DEFAULT_SEED,
    md: null,
    dumpRaw: null,
    dumpSignings: null,
    dumpSales: null,
    dumpDilemmas: null,
    dumpSeasons: null,
    policies: Object.keys(POLICIES),
    clubs: [...ANCHOR_CLUB_IDS],
    financeControl: false,
  };

  const flags = parseFlags(argv, KNOWN_FLAGS, VALUELESS_FLAGS);

  // --levels named a difficulty pool that no longer exists: a club names its
  // own strength now, so there is nothing left for the flag to select.
  if (flags.has("--levels")) {
    throw new Error("--levels was removed; use --clubs <id,...> or --clubs all");
  }

  for (const [flag, value] of flags) {
    if (flag === "--runs") {
      const runs = parseInt(value, 10);
      if (!Number.isFinite(runs) || runs <= 0) throw new Error(`Invalid --runs value: "${value}"`);
      cli.runs = runs;
    } else if (flag === "--seed") {
      cli.seed = parseSeed(value);
    } else if (flag === "--md") {
      cli.md = value;
    } else if (flag === "--dump-raw") {
      cli.dumpRaw = value;
    } else if (flag === "--dump-signings") {
      cli.dumpSignings = value;
    } else if (flag === "--dump-sales") {
      cli.dumpSales = value;
    } else if (flag === "--dump-dilemmas") {
      cli.dumpDilemmas = value;
    } else if (flag === "--dump-seasons") {
      cli.dumpSeasons = value;
    } else if (flag === "--policies") {
      cli.policies = value.split(",");
    } else if (flag === "--clubs") {
      cli.clubs = parseClubs(value);
    } else if (flag === "--finance-control") {
      cli.financeControl = true;
    }
  }

  for (const policy of cli.policies) {
    if (!(policy in POLICIES)) {
      throw new Error(
        `Unknown policy "${policy}". Known policies: ${Object.keys(POLICIES).join(", ")}`
      );
    }
  }

  return cli;
};
