import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { initialClubBudget, scaledRecurringRevenue } from "../src/logic/finance";
import { parseFlags } from "./cli-args";
import { parseSeasonDump } from "./finance-activation-report-core";
import { FIT_CLUB_IDS, shortNameForClubId } from "./opening-budget-fit-core";
import { renderReport, type NamedRateSweep, type NamedSlice } from "./opening-budget-fit-report";
import {
  assertPairedInputs,
  buildGrid,
  careerIncomes,
  evaluateCandidate,
  medianSeasonBalanceDrift,
  paretoFront,
  parseCareerDump,
  type VariantResult,
} from "./opening-budget-fit-scan";
import { at } from "../src/logic/invariant";

/**
 * `pnpm fit:opening-budget` - the measurement CLI.
 *
 * Reads two paired dumps, prices 2184 candidate rules, and writes one markdown
 * report and one JSON with the same stem. It simulates nothing, changes no
 * constant in `src/`, and ends with DECISION REQUIRED rather than a
 * recommendation.
 */

const FLAGS = [
  "--control-seasons",
  "--active-seasons",
  "--control-raw",
  "--active-raw",
  "--md",
  "--json",
  "--baseline",
  "--base-sha",
  "--help",
] as const;

const HELP = `pnpm fit:opening-budget — opening-budget and reinvestment fit

Required:
  --control-seasons <csv>  season dump of the --finance-control run
  --active-seasons  <csv>  season dump of the paired normal run
  --control-raw     <csv>  career dump of the --finance-control run
  --active-raw      <csv>  career dump of the paired normal run
  --md              <file> markdown report to write
  --json            <file> full-precision JSON to write

Optional:
  --baseline <json>  pinned activation summary for the drift control
                     (default scripts/data/finance-activation-2026-09-10/summary.json)
  --base-sha <sha>   commit the measurement was taken on
  --help             this screen

Exit codes: 0 measurement taken, 1 bad input.`;

/** The largest per-club difference the drift control tolerates between the
 * measured median season balance and the pinned one. */
const DRIFT_TOLERANCE = 0.0001;

const DEFAULT_BASELINE = "scripts/data/finance-activation-2026-09-10/summary.json";

const sha256 = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

/**
 * The file's name without its directory.
 *
 * The dumps live in a scratch directory outside the repo, so recording the
 * path as given would write somebody's home directory into a committed
 * artefact - a privacy leak the repo's own pre-commit hook blocks in source
 * files, and which the sha256 beside it makes pointless anyway: the hash is
 * the identity, the path is where one person happened to put it.
 */
const basename = (path: string): string => path.split(/[\\/]/).pop() ?? path;

const required = (flags: Map<string, string>, flag: string): string => {
  const value = flags.get(flag);
  if (value === undefined || value === "") throw new Error(`${flag} is required`);
  return value;
};

/**
 * Three named cross-sections of the Pareto front. Names describe where a
 * variant sits on the axes, never what anybody should choose: the whole point
 * of handing over the front undecided is that the choice is not the script's.
 */
const namedSlices = (front: readonly VariantResult[]): NamedSlice[] => {
  if (front.length === 0) return [];
  const byDelta = [...front].sort(
    (a, b) => a.aggregate.totalBudgetDeltaVsCurrent - b.aggregate.totalBudgetDeltaVsCurrent
  );
  const conservative = at(byDelta, 0, "most conservative front variant");
  const generous = at(byDelta, byDelta.length - 1, "most generous front variant");
  const middle = at(byDelta, Math.floor(byDelta.length / 2), "middle front variant");
  return [
    {
      label: "zachowawczy",
      rationale:
        "Najmniejsza suma różnic wobec dzisiejszych budżetów na całym froncie — najmniej rusza to, co już zmierzone.",
      variant: conservative,
    },
    {
      label: "środkowy",
      rationale:
        "Mediana frontu po tej samej osi: ani najmniejsza, ani największa zmiana budżetów.",
      variant: middle,
    },
    {
      label: "hojny",
      rationale:
        "Największa suma różnic na froncie — najwięcej pieniędzy w pierwszym oknie, i największa dalsza kalibracja do wykonania.",
      variant: generous,
    },
  ];
};

export const main = (argv: readonly string[]): number => {
  const flags = parseFlags([...argv], [...FLAGS], ["--help"]);
  if (flags.has("--help")) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  const controlSeasonsPath = required(flags, "--control-seasons");
  const activeSeasonsPath = required(flags, "--active-seasons");
  const controlRawPath = required(flags, "--control-raw");
  const activeRawPath = required(flags, "--active-raw");
  const mdPath = required(flags, "--md");
  const jsonPath = required(flags, "--json");
  const baselinePath = flags.get("--baseline") ?? DEFAULT_BASELINE;

  const controlSeasons = parseSeasonDump(readFileSync(controlSeasonsPath, "utf8"), {
    incomeMode: "finance-control",
  });
  const activeSeasons = parseSeasonDump(readFileSync(activeSeasonsPath, "utf8"), {
    incomeMode: "normal",
  });
  const controlCareers = parseCareerDump(readFileSync(controlRawPath, "utf8"), {
    incomeMode: "finance-control",
  });
  const activeCareers = parseCareerDump(readFileSync(activeRawPath, "utf8"), {
    incomeMode: "normal",
  });

  const rngPairing = assertPairedInputs({
    controlSeasons,
    activeSeasons,
    controlCareers,
    activeCareers,
  });

  const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
    metrics: { ladderShares: { clubShortName: string; medianSeasonBalance: number }[] };
  };
  const drift = medianSeasonBalanceDrift(controlSeasons, baseline.metrics.ladderShares);
  for (const entry of drift) {
    if (Math.abs(entry.difference) > DRIFT_TOLERANCE) {
      throw new Error(
        `${entry.clubShortName}: median season balance drifted from ${entry.pinned} to ${entry.measured}; the input is not the run the pinned report was built on`
      );
    }
  }

  const incomes = careerIncomes(activeSeasons);
  const grid = buildGrid();
  if (grid.length !== 2184) {
    throw new Error(`the grid has ${grid.length} variants, expected 2184`);
  }

  const variants = grid.map((candidate) =>
    evaluateCandidate({
      candidate,
      incomes,
      currentInitialBudget: initialClubBudget,
      scaledRecurringRevenue,
    })
  );
  const feasible = variants.filter((variant) => variant.feasible);
  const front = paretoFront(feasible);

  const generatedAt = new Date().toISOString().slice(0, 10);
  const stem = mdPath.replace(/\\/g, "/").split("/").pop()?.replace(/\.md$/, "") ?? "fit";

  const slices = namedSlices(front);
  // Sweep the rate separately at every named cross-section. A single sweep
  // would prove why the Pareto front collapses, but would not let the owner
  // inspect the rate after choosing a different opening-budget rule.
  const rateSweeps: NamedRateSweep[] = slices.map((slice) => ({
    label: slice.label,
    variants: variants.filter(
      (variant) =>
        variant.candidate.budgetShare === slice.variant.candidate.budgetShare &&
        variant.candidate.usefulUpgradeOvrDelta === slice.variant.candidate.usefulUpgradeOvrDelta &&
        variant.candidate.strongBackerPercentile ===
          slice.variant.candidate.strongBackerPercentile &&
        variant.candidate.activeBackerPercentile === slice.variant.candidate.activeBackerPercentile
    ),
  }));
  // The variants whose eighteen club rows are worth carrying into the JSON.
  const detailed = new Set([
    ...front.map((variant) => variant.key),
    ...slices.map((slice) => slice.variant.key),
    ...rateSweeps.flatMap((sweep) => sweep.variants.map((variant) => variant.key)),
  ]);

  const markdown = renderReport({
    stem,
    generatedAt,
    inputs: [
      { path: basename(controlSeasonsPath), sha256: sha256(controlSeasonsPath) },
      { path: basename(activeSeasonsPath), sha256: sha256(activeSeasonsPath) },
      { path: basename(controlRawPath), sha256: sha256(controlRawPath) },
      { path: basename(activeRawPath), sha256: sha256(activeRawPath) },
      { path: basename(baselinePath), sha256: sha256(baselinePath) },
    ],
    baseSha: flags.get("--base-sha") ?? "nie podano",
    engineVersions: [...new Set(activeSeasons.map((row) => row.engineVersion))],
    careers: activeCareers.length,
    seasons: activeSeasons.length,
    drift,
    driftTolerance: DRIFT_TOLERANCE,
    rngPairing,
    gridSize: grid.length,
    feasibleCount: feasible.length,
    front,
    rateSweeps,
    slices,
    current: at(variants, 0, "current variant").clubs,
  });

  writeFileSync(mdPath, markdown, "utf8");
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: "DECISION REQUIRED",
        generatedAt,
        baseSha: flags.get("--base-sha") ?? null,
        inputs: {
          controlSeasons: {
            path: basename(controlSeasonsPath),
            sha256: sha256(controlSeasonsPath),
          },
          activeSeasons: { path: basename(activeSeasonsPath), sha256: sha256(activeSeasonsPath) },
          controlRaw: { path: basename(controlRawPath), sha256: sha256(controlRawPath) },
          activeRaw: { path: basename(activeRawPath), sha256: sha256(activeRawPath) },
          baseline: { path: basename(baselinePath), sha256: sha256(baselinePath) },
        },
        drift,
        driftTolerance: DRIFT_TOLERANCE,
        rngPairing,
        gridSize: grid.length,
        feasibleCount: feasible.length,
        currentInitialBudgets: FIT_CLUB_IDS.map((clubId) => ({
          clubId,
          shortName: shortNameForClubId(clubId),
          initialBudget: initialClubBudget(clubId),
        })),
        paretoFront: front.map((variant) => variant.key),
        rateSweeps: rateSweeps.map((sweep) => ({
          label: sweep.label,
          variants: sweep.variants.map((variant) => variant.key),
        })),
        /**
         * Every variant, at full precision - nothing here is rounded, because
         * a rounded JSON would be a second, disagreeing copy of the report's
         * tables rather than the source the activation plan reads.
         *
         * The eighteen per-club rows are carried only for the variants a
         * reader actually needs them for: the Pareto front and the three named
         * slices. Carrying them for all 2184 produced a 34 MB artefact, which
         * is not a file anybody commits or reads; the club rows of any other
         * variant are reproducible by re-running this command, and the
         * aggregates that decide feasibility and the front are here in full.
         */
        variants: variants.map((variant) =>
          detailed.has(variant.key) ? variant : { ...variant, clubs: null }
        ),
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  process.stdout.write(
    `${grid.length} variants scanned, ${feasible.length} feasible, ${front.length} on the Pareto front.\n` +
      `Wrote ${mdPath} and ${jsonPath}. Status: DECISION REQUIRED.\n`
  );
  return 0;
};

/* c8 ignore start - the entry guard is exercised by running the script */
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
/* c8 ignore stop */
