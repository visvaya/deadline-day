/**
 * Power, false-alarm calibration and interval coverage for the rho estimator.
 *
 * The rho study puts this deliberately OUTSIDE `pnpm verify`, next to `pnpm balance` and
 * `pnpm test:e2e`: it takes an hour, and a gate nobody can afford to run is
 * not a gate. The seconds-long half of the validation lives in
 * tests/scripts/dixon-coles.test.ts.
 *
 * The point of running it BEFORE the real measurement: if power at
 * rho = -0.04 turns out to be poor, verdict B is likely and the study has to
 * know that in advance rather than explain it afterwards.
 *
 * Every dataset here is synthetic, but it is synthesised ON THE REAL DESIGN:
 * the actual fixture list, and club strengths and home effects taken from the
 * constrained fit at rho = 0. An earlier version invented a league instead -
 * seventeen evenly spread clubs and a flat home effect of 0.25 - and it was
 * not close enough to stand in for the real one. Measured on one fit, the
 * real design carries about 17.5% more Fisher information about rho (1748
 * against 1488), a mean rate of 1.32 against 1.19 and a maximum of 4.21
 * against 2.72. Power measured on the invented league was therefore an
 * answer about a different league.
 *
 * The goals are still drawn by dixon-coles-simulate.ts, which shares no code
 * with the likelihood - a shared tau would let a sign error agree with itself
 * and pass every test.
 */
import { writeFileSync } from "node:fs";

import { renderTable, type TableFormat } from "../balance-report";
import { parseFlags } from "../cli-args";
import { devianceAt, type ProfileFit } from "./dixon-coles-profile";
import { ALL_SEASONS } from "../match-engine-audit-reference";
import { BLOCK_GRID, separableBlockBootstrap } from "./dixon-coles-blocks";
import { stderrProgress } from "./progress";
import {
  buildWindow,
  fitWithRetries,
  conservativePercentileInterval,
  redrawFrom,
  truthFromFit,
  type RhoWindow,
} from "./audit-core";
import { mean, quantile, sampleStandardDeviation, standardError } from "../stats";
import { at } from "../../src/logic/invariant";

/** The four points the plan names. Zero is not a control here - it IS the
 * false-alarm arm, and it also supplies the calibrated critical value that
 * the other three are judged against. */
const RHO_POINTS = [0, -0.04, -0.08, -0.12] as const;

/** docs/decisions/rho-estimator-method.md fixes both the counts and the base. */
const DEFAULT_NULL_DATASETS = 2000;
const DEFAULT_DATASETS = 500;
const BASE_POWER_SEED = 0x1d3c0de + 2_000_000;
/**
 * Matches `pnpm audit:rho` exactly, and that is the whole point. A percentile
 * interval at 99% built from 200 resamples rests each tail on essentially one
 * extreme value; at 2000 it rests on ten. Measuring coverage at 200 would
 * validate a different and much noisier procedure than the audit runs, which
 * is worse than not measuring it - it would produce a number that looks like
 * an answer to a question nobody asked.
 */
const DEFAULT_BLOCK_RESAMPLES = 2000;

/** chi-square(1) at 99%. The whole question of this run is whether it is the
 * right threshold for a model with 347 parameters and a bounded domain. */
const ASYMPTOTIC_99 = 6.634896601021214;

type Arm = {
  rho: number;
  estimates: number[];
  /** Deviance against rho = 0. Under H0 this is the null distribution; away
   * from it, the fraction above the threshold is power. */
  testStatistics: number[];
  /** Deviance of the TRUE rho against the optimum. The true value lies inside
   * the profile interval exactly when this is below the quantile, which is
   * coverage - a different question from power, and the two were briefly the
   * same array here, which made power read as one minus coverage. */
  coverageStatistics: number[];
  failures: number;
};

const KNOWN_FLAGS = [
  "--datasets",
  "--null-datasets",
  "--md",
  "--seed",
  "--block-datasets",
  "--block-resamples",
  "--block-rhos",
  "--help",
];

const runArm = (
  window: RhoWindow,
  design: ProfileFit,
  rho: number,
  datasets: number,
  baseSeed: number
): Arm => {
  const truth = truthFromFit(design.layout, design.nullParams, rho);
  const estimates: number[] = [];
  const testStatistics: number[] = [];
  const coverageStatistics: number[] = [];
  let failures = 0;
  const progress = stderrProgress(`ramię ρ = ${rho.toFixed(2)}`);
  for (let replicate = 0; replicate < datasets; replicate += 1) {
    const league = redrawFrom(baseSeed + replicate, truth, window.matches);
    try {
      // One start, warm from the real fit: a stronger start than any of the
      // five random ones, and the five-start check belongs to the one fit
      // that decides something.
      const fit = fitWithRetries(league, {
        starts: 1,
        start: design.nullParams,
        seed: baseSeed + replicate,
      });
      estimates.push(fit.rho);
      // The profile already produced the deviance against zero, so power
      // costs nothing extra.
      testStatistics.push(fit.likelihoodRatio);
      // Coverage needs one more inner fit, and only away from the null:
      // at rho = 0 the two statistics are the same number.
      coverageStatistics.push(rho === 0 ? fit.likelihoodRatio : devianceAt(league, fit, rho));
    } catch {
      failures += 1;
    }
    progress(replicate + 1, datasets);
  }
  return { rho, estimates, testStatistics, coverageStatistics, failures };
};

export type BlockCoverage = {
  rho: number;
  datasets: number;
  covered: number;
  failures: number;
  /** Datasets whose own block bootstrap lost a tail. Neither covered nor
   * uncovered - they produced no interval at all. */
  unestimable: number;
};

/**
 * Coverage of the BLOCK bootstrap interval, which the profile interval's own
 * coverage says nothing about.
 *
 * It matters because 2.2 makes the conservative envelope of the two decide
 * verdict A against B, and the block interval is built from ten blocks at a
 * 99% level - the kind of place a percentile interval is least trustworthy.
 * A well-calibrated profile interval sitting beside a badly calibrated block
 * interval would still produce a report reading 99%.
 *
 * Off by default because it is datasets x resamples full fits: 100 x 200 is
 * about five hours. Turning it on is a deliberate act, like every other slow
 * measurement in this repository.
 */
const measureBlockCoverage = (
  window: RhoWindow,
  design: ProfileFit,
  rho: number,
  datasets: number,
  resamples: number,
  baseSeed: number
): BlockCoverage => {
  const truth = truthFromFit(design.layout, design.nullParams, rho);
  let covered = 0;
  let failures = 0;
  let unestimable = 0;
  const progress = stderrProgress(`pokrycie blokowe ρ = ${rho.toFixed(2)}`);
  for (let replicate = 0; replicate < datasets; replicate += 1) {
    const league = redrawFrom(baseSeed + replicate, truth, window.matches);
    try {
      // The separable path, which is the one pnpm audit:rho runs. Validating
      // the direct implementation instead would measure a procedure the
      // audit does not use - and would cost hundreds of thousands of full
      // fits, which is why this measurement was out of reach until now.
      const run = separableBlockBootstrap(
        { seasons: window.seasons, matches: league, clubs: window.clubs },
        resamples,
        baseSeed + 500_000 + replicate * resamples,
        BLOCK_GRID
      );
      const interval = conservativePercentileInterval(run, 0.99);
      // A dataset whose own resampling lost enough replications to leave a
      // tail unestimable has not produced an interval, and counting it as
      // covered because infinity contains everything would be the same
      // omission this study keeps having to repair.
      if (!interval.estimable) {
        unestimable += 1;
      } else if (interval.lower <= rho && rho <= interval.upper) {
        covered += 1;
      }
    } catch {
      failures += 1;
    }
    progress(replicate + 1, datasets);
  }
  return { rho, datasets, covered, failures, unestimable };
};

const rate = (values: readonly number[], threshold: number): number =>
  (values.filter((value) => value > threshold).length / values.length) * 100;

const num = (value: number, digits = 4): string => value.toFixed(digits);

const buildReport = (
  arms: readonly Arm[],
  nullRatios: readonly number[],
  format: TableFormat
): string => {
  const calibrated = quantile(nullRatios, 0.99);
  const lines: string[] = [];

  lines.push("### Rozkład statystyki testowej pod hipotezą zerową", "");
  lines.push(
    renderTable(
      ["wielkość", "wartość"],
      [
        ["zbiorów danych", String(nullRatios.length)],
        ["średnia LRT", num(mean(nullRatios), 3)],
        ["mediana", num(quantile(nullRatios, 0.5), 3)],
        ["kwantyl 90%", num(quantile(nullRatios, 0.9), 3)],
        ["kwantyl 95%", num(quantile(nullRatios, 0.95), 3)],
        ["**kwantyl 99% (skalibrowany próg)**", `**${num(calibrated, 3)}**`],
        ["χ²(1) przy 99% (próg asymptotyczny)", num(ASYMPTOTIC_99, 3)],
        [
          "**błąd I rodzaju przy progu asymptotycznym**",
          `**${num(rate(nullRatios, ASYMPTOTIC_99), 2)}%**`,
        ],
      ],
      format
    ),
    ""
  );

  lines.push("### Obciążenie i rozrzut estymaty", "");
  lines.push(
    renderTable(
      ["ρ prawdziwe", "n", "odrzucone", "średnia ρ̂", "obciążenie", "SD ρ̂", "SE średniej"],
      arms.map((arm) => [
        num(arm.rho, 2),
        String(arm.estimates.length),
        String(arm.failures),
        num(mean(arm.estimates)),
        num(mean(arm.estimates) - arm.rho),
        num(sampleStandardDeviation(arm.estimates)),
        num(standardError(arm.estimates)),
      ]),
      format
    ),
    "",
    "**SD ρ̂ jest błędem standardowym, jaki estymata będzie miała na jednym zbiorze danych** — czyli na prawdziwych danych. Czytać razem z szerokością okna, jakie dopuszcza bramka remisów z 2.3: ma ono 0,036 szerokości.",
    ""
  );

  lines.push("### Moc i pokrycie", "");
  lines.push(
    renderTable(
      ["ρ prawdziwe", "moc (próg asympt.)", "moc (próg skalibr.)", "pokrycie przedziału 99%"],
      arms.map((arm) => [
        num(arm.rho, 2),
        `${num(rate(arm.testStatistics, ASYMPTOTIC_99), 1)}%`,
        `${num(rate(arm.testStatistics, calibrated), 1)}%`,
        `${num(100 - rate(arm.coverageStatistics, ASYMPTOTIC_99), 1)}%`,
      ]),
      format
    ),
    "",
    "**To są dwie różne statystyki i tak muszą być liczone.** Moc bierze dewiancję wobec `ρ = 0`, czyli tę, na której stoi test; pokrycie bierze dewiancję prawdziwego ρ wobec optimum. Policzenie obu z jednej tablicy sprawia, że moc wychodzi jako `100% − pokrycie` i potrafi wyjść niżej niż błąd I rodzaju — ten raport przewrócił się na tym raz, w wersji z 31 sierpnia.",
    "",
    "Wiersz `ρ = 0` w kolumnach mocy jest z definicji **błędem I rodzaju**, nie mocą.",
    ""
  );
  return lines.join("\n");
};

const main = (): void => {
  const cli = parseFlags(process.argv.slice(2), KNOWN_FLAGS, ["--help"]);
  if (cli.has("--help")) {
    console.log(
      [
        "pnpm audit:rho-power [--datasets N] [--null-datasets N] [--seed N] [--md <plik>]",
        "                     [--block-datasets N] [--block-resamples N]",
        "",
        `  --datasets         zbiorów na każde niezerowe ρ (domyślnie ${DEFAULT_DATASETS})`,
        `  --null-datasets    zbiorów pod H0 (domyślnie ${DEFAULT_NULL_DATASETS})`,
        `  --seed             baza ziarna (domyślnie ${BASE_POWER_SEED})`,
        "  --block-datasets   pokrycie przedziału BLOKOWEGO: ile zbiorów (domyślnie 0, wyłączone)",
        `  --block-rhos       które ρ mierzyć, po przecinku (domyślnie wszystkie: ${RHO_POINTS.join(",")})`,
        `  --block-resamples  ile losowań blokowych na zbiór (domyślnie ${DEFAULT_BLOCK_RESAMPLES})`,
        "  --md               zapis raportu w markdownie zamiast wypisania na konsolę",
        "",
        "Pokrycie blokowe kosztuje `--block-datasets × --block-resamples` pełnych",
        "dopasowań: 100 × 200 to około pięciu godzin. Dlatego jest wyłączone domyślnie.",
      ].join("\n")
    );
    return;
  }
  const datasets = Number(cli.get("--datasets") ?? DEFAULT_DATASETS);
  const nullDatasets = Number(cli.get("--null-datasets") ?? DEFAULT_NULL_DATASETS);
  const baseSeed = Number(cli.get("--seed") ?? BASE_POWER_SEED);
  const blockDatasets = Number(cli.get("--block-datasets") ?? 0);
  const blockResamples = Number(cli.get("--block-resamples") ?? DEFAULT_BLOCK_RESAMPLES);
  const blockRhoFilter = cli.get("--block-rhos");
  const blockRhos = blockRhoFilter
    ? blockRhoFilter.split(",").map((raw) => {
        const value = Number(raw);
        if (!RHO_POINTS.includes(value as (typeof RHO_POINTS)[number])) {
          throw new Error(`--block-rhos accepts only ${RHO_POINTS.join(", ")}, got "${raw}"`);
        }
        return value;
      })
    : [...RHO_POINTS];
  if (!Number.isInteger(datasets) || datasets < 1)
    throw new Error("--datasets must be a positive integer");
  if (!Number.isInteger(nullDatasets) || nullDatasets < 1) {
    throw new Error("--null-datasets must be a positive integer");
  }
  if (!Number.isInteger(blockDatasets) || blockDatasets < 0) {
    throw new Error("--block-datasets must be a non-negative integer");
  }

  const started = Date.now();
  // The design the study actually has: the real fixture list, with club
  // strengths and home effects from the constrained fit at rho = 0. Only the
  // goals are synthetic.
  const window = buildWindow(ALL_SEASONS);
  const design = fitWithRetries(window.matches, { starts: 5 });
  const arms = RHO_POINTS.map((rho, index) =>
    runArm(window, design, rho, rho === 0 ? nullDatasets : datasets, baseSeed + index * 1_000_000)
  );
  const nullArm = at(arms, 0, "null arm");
  if (nullArm.testStatistics.length === 0)
    throw new Error("the null arm produced no usable replications");
  const blockCoverage =
    blockDatasets > 0
      ? blockRhos.map((rho) =>
          measureBlockCoverage(
            window,
            design,
            rho,
            blockDatasets,
            blockResamples,
            baseSeed +
              7_000_000 +
              RHO_POINTS.indexOf(rho as (typeof RHO_POINTS)[number]) * 1_000_000
          )
        )
      : [];
  const elapsed = (Date.now() - started) / 1000;

  const target = cli.get("--md");
  const format: TableFormat = target ? "markdown" : "ascii";
  let body = buildReport(arms, nullArm.testStatistics, format);
  if (blockCoverage.length > 0) {
    body += [
      "### Pokrycie przedziału bootstrapu blokowego",
      "",
      renderTable(
        ["ρ prawdziwe", "zbiorów", "pokrycie 99%", "odrzucone", "bez przedziału"],
        blockCoverage.map((row) => {
          const decided = row.datasets - row.failures - row.unestimable;
          return [
            row.rho.toFixed(2),
            String(row.datasets),
            decided > 0 ? `${((row.covered / decided) * 100).toFixed(1)}%` : "—",
            String(row.failures),
            String(row.unestimable),
          ];
        }),
        format
      ),
      "",
      `Po ${blockResamples} losowaniach blokowych na zbiór. To przedział, który wraz z profilowym tworzy konserwatywną obwiednię z 2.2, a więc współdecyduje o werdykcie A wobec B — i buduje się go z dziesięciu bloków przy poziomie 99%, czyli tam, gdzie percentylowy przedział jest najmniej wiarygodny.`,
      "",
    ].join("\n");
  }
  const header = [
    `# Moc estymatora ρ (${new Date().toISOString().slice(0, 10)})`,
    "",
    `Odtworzenie: \`pnpm audit:rho-power --datasets ${datasets} --null-datasets ${nullDatasets} --seed ${baseSeed}${blockDatasets > 0 ? ` --block-datasets ${blockDatasets} --block-resamples ${blockResamples}` : ""}\`.`,
    "",
    `Zbiory syntetyczne generowane na **prawdziwym układzie**: ${window.seasons.length} sezonów, ${window.matches.length} meczów z przypiętego CSV, siły klubów i efekty gospodarza z dopasowania ograniczonego przy ρ = 0. Losowe są wyłącznie bramki, i losuje je \`dixon-coles-simulate.ts\`, który nie dzieli kodu z funkcją wiarygodności. Czas obliczeń: ${(elapsed / 60).toFixed(1)} min.`,
    "",
  ].join("\n");

  if (target) {
    writeFileSync(target, `${header}${body}`, "utf8");
    console.log(`Raport zapisany: ${target}`);
    return;
  }
  console.log(header + body);
};

main();
