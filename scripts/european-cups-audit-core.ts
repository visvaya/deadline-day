import { EUROPEAN_ADVANCE_ODDS, EUROPEAN_PRIZE_MONEY } from "../src/data/balance";
import { FORMACJE } from "../src/data/positions";
import { TEAM_RATINGS } from "../src/data/team-ratings";
import type { EuropeanCup, EuropeanStage, FormationId } from "../src/data/types";
import type { MatchRating } from "../src/logic/match";
import { advanceProbabilities, resolveEuropeanCampaign } from "../src/logic/european-cups";
import { createRng, pick, type Rng } from "../src/logic/rng";
import { createSquadFromFormation, squadStrength } from "../src/logic/squad";
import { collectCampaigns, type CareerRun } from "./european-cups-careers";
import { seedSeries } from "./seed-series";
import { mean, median, quantile, standardError } from "./stats";
import { at } from "../src/logic/invariant";

/**
 * Reproducible, offline audit of the european-cup model - chapter 9 of
 * docs/decisions/european-cups-audit.md.
 *
 * It measures; it decides nothing. EUROPEAN_ADVANCE_ODDS is imported, never
 * written, and the variants below live in this file precisely so a candidate
 * set of constants can be measured WITHOUT editing src/data/balance.ts.
 *
 * Two layers, deliberately built twice:
 * - analytic: closed-form probabilities straight from the odds table;
 * - empirical: campaigns drawn through the same rng the game uses.
 * A disagreement between them is an implementation bug, which is the only
 * reason to pay for the second layer at all. For the baseline variant the
 * empirical layer additionally runs the REAL resolveEuropeanCampaign on the
 * same seeds and compares leg for leg - so the local re-implementation this
 * file needs for variants can never quietly drift from the engine.
 */

export type AdvanceOdds = {
  pQualifyBase: number;
  pQualifySlope: number;
  pKnockoutBase: number;
  pKnockoutSlope: number;
};

export type OddsTable = Record<EuropeanCup, AdvanceOdds>;

export const CUPS: readonly EuropeanCup[] = ["LM", "LE", "LK"];

/** The grid docs/decisions/european-cups-audit.md reports on. 62 is edge 0 (an average
 * Ekstraklasa squad, per the comment on advanceProbabilities) and 80 is
 * edge 1, so the two ends pin the whole linear model. */
export const STRENGTH_GRID: readonly number[] = [62, 65, 68, 70, 74, 77, 80];

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export type Variant = { id: string; opis: string; odds: OddsTable };

/**
 * The strength at which the measurement actually lands: the median squad the
 * engine sends into the Conference League, measured on whole careers
 * (docs/decisions/european-cups-audit.md chapter 11). Reading the curve anywhere else - at the
 * construction point 62, say - answers a question nobody asked.
 */
export const LK_ENTRANT_STRENGTH = 68.4;

/**
 * Candidate probabilities AT THAT STRENGTH, for the product decision on the
 * LK qualifying odds (2026-09-02).
 *
 * These are targets to choose between, not estimates. The observed rate in
 * the closest structurally observable cohort is 37.5% with a Wilson interval
 * of 21-57%, which brackets all three and separates none of them; picking one
 * is a product call about how much realism to trade for pace and finances.
 */
export const LOWERING_TARGETS = [0.3, 0.4, 0.5] as const;

/**
 * Solves pQualifyBase so the curve passes through `target` at the entrant's
 * strength, LEAVING THE SLOPE ALONE.
 *
 * Holding the slope is a stated design assumption, not a result: one observed
 * rate is one equation in two unknowns, so the slope is unidentified and any
 * value fitted to it would be invented. Keeping today's slope is the choice
 * that changes the least.
 */
export const loweringVariant = (target: number): Variant => {
  const edge = clamp01((LK_ENTRANT_STRENGTH - 62) / 18);
  // Two decimals, not four. Solving the equation gives 0.3111 for a 40%
  // target, but the entrant's median strength is known to a tenth and the
  // target is a round number a person chose - four digits would advertise a
  // precision nothing behind them has. 0.31 delivers 39.9%, which is the same
  // decision.
  const pQualifyBase =
    Math.round((target - EUROPEAN_ADVANCE_ODDS.LK.pQualifySlope * edge) * 100) / 100;
  return {
    id: `lk${Math.round(target * 100)}`,
    opis: `LK ok. ${Math.round(target * 100)}% przy sile ${LK_ENTRANT_STRENGTH}, nachylenie bez zmian (pQualifyBase ${pQualifyBase.toFixed(2)})`,
    odds: {
      ...EUROPEAN_ADVANCE_ODDS,
      LK: { ...EUROPEAN_ADVANCE_ODDS.LK, pQualifyBase },
    },
  };
};

/** Baseline plus the two exploratory sets from chapter 4. Neither variant is
 * a recommendation - A is the fit from the deleted docs/puchary.md, B moves
 * a single parameter - and both are here only so their consequences can be
 * measured instead of argued about. */
export const VARIANTS: readonly Variant[] = [
  {
    id: "baseline",
    opis: "EUROPEAN_ADVANCE_ODDS bez zmian (src/data/balance.ts)",
    odds: EUROPEAN_ADVANCE_ODDS,
  },
  {
    id: "A",
    opis: "LK pQualifyBase 0,15 / pQualifySlope 0,80 - fit z usuniętego docs/puchary.md",
    odds: {
      ...EUROPEAN_ADVANCE_ODDS,
      LK: { ...EUROPEAN_ADVANCE_ODDS.LK, pQualifyBase: 0.15, pQualifySlope: 0.8 },
    },
  },
  {
    id: "B",
    opis: "LK pQualifyBase 0,20, nachylenie bez zmian - eksperyment jednoparametrowy",
    odds: {
      ...EUROPEAN_ADVANCE_ODDS,
      LK: { ...EUROPEAN_ADVANCE_ODDS.LK, pQualifyBase: 0.2 },
    },
  },
  ...LOWERING_TARGETS.map(loweringVariant),
];

export const variantById = (id: string): Variant => {
  const found = VARIANTS.find((v) => v.id === id);
  if (!found)
    throw new Error(`Unknown variant "${id}". Known: ${VARIANTS.map((v) => v.id).join(", ")}`);
  return found;
};

/**
 * The model's own formula, RAW - the result is deliberately not clamped.
 * advanceProbabilities in src/logic clamps `edge` and not the output, so a
 * slope above `1 - base` produces pQualify > 1 and passes silently
 * (chapter 2, "usterka odporności"). An audit that clamped here would be
 * unable to see the very defect it exists to catch.
 */
export const rawAdvance = (
  odds: OddsTable,
  cup: EuropeanCup,
  strength: number
): { pQualify: number; pKnockout: number } => {
  const o = odds[cup];
  const edge = clamp01((strength - 62) / 18);
  return {
    pQualify: o.pQualifyBase + o.pQualifySlope * edge,
    pKnockout: o.pKnockoutBase + o.pKnockoutSlope * edge,
  };
};

/** Same cascade as src/logic/european-cups.ts. Duplicated rather than
 * imported because the engine reads the constants directly and a variant
 * has to be able to travel the cascade too. */
const CASCADE: Record<EuropeanCup, EuropeanCup | null> = { LM: "LE", LE: "LK", LK: null };

export type AnalyticCell = {
  cup: EuropeanCup;
  strength: number;
  /** Raw, unclamped - see rawAdvance. */
  pQualify: number;
  pKnockout: number;
  /** After the cascade: any league phase, in any of the competitions the
   * club can still fall into. */
  reachLeague: number;
  reachKnockout: number;
  expectedIncome: number;
  expectedDraws: number;
  /** P(campaign lasted exactly 1 / 2 / 3 legs). */
  legShares: readonly number[];
};

type Probabilities = { pQualify: number; pKnockout: number };

const cascadeReach = (
  odds: OddsTable,
  cup: EuropeanCup,
  strength: number,
  own: (_probabilities: Probabilities) => number
): number => {
  const p = rawAdvance(odds, cup, strength);
  const next = CASCADE[cup];
  const rest = next ? (1 - p.pQualify) * cascadeReach(odds, next, strength, own) : 0;
  return own(p) + rest;
};

const expectedIncomeOf = (odds: OddsTable, cup: EuropeanCup, strength: number): number => {
  const { pQualify, pKnockout } = rawAdvance(odds, cup, strength);
  const money = EUROPEAN_PRIZE_MONEY[cup];
  const own =
    (1 - pQualify) * money.qualifying +
    pQualify * (1 - pKnockout) * money.league +
    pQualify * pKnockout * money.knockout;
  const next = CASCADE[cup];
  return next ? own + (1 - pQualify) * expectedIncomeOf(odds, next, strength) : own;
};

const expectedDrawsOf = (odds: OddsTable, cup: EuropeanCup, strength: number): number => {
  const { pQualify } = rawAdvance(odds, cup, strength);
  const next = CASCADE[cup];
  return next ? 1 + (1 - pQualify) * expectedDrawsOf(odds, next, strength) : 1;
};

const legSharesOf = (odds: OddsTable, cup: EuropeanCup, strength: number): number[] => {
  const shares: number[] = [];
  let reached = 1;
  let current: EuropeanCup | null = cup;
  while (current) {
    const { pQualify } = rawAdvance(odds, current, strength);
    const next: EuropeanCup | null = CASCADE[current];
    // The bottom competition terminates the cascade whatever its result, so
    // its whole remaining mass lands on this leg count.
    shares.push(next ? reached * pQualify : reached);
    reached *= 1 - pQualify;
    current = next;
  }
  return shares;
};

export const analyticCell = (
  odds: OddsTable,
  cup: EuropeanCup,
  strength: number
): AnalyticCell => ({
  cup,
  strength,
  ...rawAdvance(odds, cup, strength),
  reachLeague: cascadeReach(odds, cup, strength, (p) => p.pQualify),
  reachKnockout: cascadeReach(odds, cup, strength, (p) => p.pQualify * p.pKnockout),
  expectedIncome: expectedIncomeOf(odds, cup, strength),
  expectedDraws: expectedDrawsOf(odds, cup, strength),
  legShares: legSharesOf(odds, cup, strength),
});

type Leg = { cup: EuropeanCup; stage: EuropeanStage; money: number };

/** Local twin of resolveEuropeanRun + resolveEuropeanCampaign, parameterised
 * by an odds table. One rng.next() per leg, same comparison order - the
 * parity check below is what keeps that promise honest. */
const simulateCampaign = (rng: Rng, odds: OddsTable, cup: EuropeanCup, strength: number): Leg[] => {
  const legs: Leg[] = [];
  let current: EuropeanCup | null = cup;
  while (current) {
    const { pQualify, pKnockout } = rawAdvance(odds, current, strength);
    const r = rng.next();
    const stage: EuropeanStage =
      r < pQualify * pKnockout ? "knockout" : r < pQualify ? "league" : "qualifying";
    legs.push({ cup: current, stage, money: EUROPEAN_PRIZE_MONEY[current][stage] });
    current = stage === "qualifying" ? CASCADE[current] : null;
  }
  return legs;
};

/** Counts rng.next() calls without touching the stream: the draw count is
 * the RNG contract chapter 7 rests on, and it has to be observed rather than
 * derived from the same formula that is under test. */
const countingRng = (inner: Rng): { rng: Rng; draws: () => number } => {
  let draws = 0;
  return {
    rng: {
      next() {
        draws += 1;
        return inner.next();
      },
      state: () => inner.state(),
      draws: () => draws,
    },
    draws: () => draws,
  };
};

export type EmpiricalCell = {
  cup: EuropeanCup;
  strength: number;
  n: number;
  /** From the FIRST leg only, so it measures the competition the club
   * actually started in rather than wherever the cascade dropped it. */
  pQualify: number;
  /** Conditional on having passed qualifying, matching the model's meaning. */
  pKnockout: number;
  qualified: number;
  reachLeague: number;
  reachKnockout: number;
  meanIncome: number;
  seIncome: number;
  meanDraws: number;
  minDraws: number;
  maxDraws: number;
  legCounts: readonly number[];
};

export type CellAudit = {
  analytic: AnalyticCell;
  empirical: EmpiricalCell;
  /** Only for the baseline variant: legs from the real engine matched the
   * local twin on every seed. Null when a variant makes the comparison
   * meaningless (the engine cannot be given other constants). */
  engineParity: boolean | null;
};

export const simulateCell = (
  baseSeed: number,
  runs: number,
  odds: OddsTable,
  cup: EuropeanCup,
  strength: number,
  compareWithEngine: boolean
): { empirical: EmpiricalCell; engineParity: boolean | null } => {
  const seeds = seedSeries(baseSeed, runs);
  let qualified = 0;
  let knockoutAfterQualifying = 0;
  let reachedLeague = 0;
  let reachedKnockout = 0;
  let drawsTotal = 0;
  let minDraws = Number.POSITIVE_INFINITY;
  let maxDraws = 0;
  const legCounts = [0, 0, 0];
  const incomes: number[] = [];
  let parity = compareWithEngine ? true : null;

  for (const seed of seeds) {
    const counting = countingRng(createRng(seed));
    const legs = simulateCampaign(counting.rng, odds, cup, strength);
    const draws = counting.draws();

    if (compareWithEngine) {
      const engineLegs = resolveEuropeanCampaign(createRng(seed), cup, strength);
      if (JSON.stringify(engineLegs) !== JSON.stringify(legs)) parity = false;
    }

    const first = at(legs, 0, "first campaign leg");
    if (first.stage !== "qualifying") qualified += 1;
    if (first.stage === "knockout") knockoutAfterQualifying += 1;
    const last = at(legs, legs.length - 1, "last campaign leg");
    if (last.stage !== "qualifying") reachedLeague += 1;
    if (last.stage === "knockout") reachedKnockout += 1;

    drawsTotal += draws;
    minDraws = Math.min(minDraws, draws);
    maxDraws = Math.max(maxDraws, draws);
    legCounts[legs.length - 1] = at(legCounts, legs.length - 1, "leg count bucket") + 1;
    incomes.push(legs.reduce((sum, leg) => sum + leg.money, 0));
  }

  return {
    empirical: {
      cup,
      strength,
      n: runs,
      pQualify: qualified / runs,
      pKnockout: qualified === 0 ? 0 : knockoutAfterQualifying / qualified,
      qualified,
      reachLeague: reachedLeague / runs,
      reachKnockout: reachedKnockout / runs,
      meanIncome: mean(incomes),
      seIncome: standardError(incomes),
      meanDraws: drawsTotal / runs,
      minDraws,
      maxDraws,
      legCounts,
    },
    engineParity: parity,
  };
};

// --- Reference: where an average Ekstraklasa squad actually sits ----------

export type ClubStrength = {
  krotko: string;
  n: number;
  /** squadStrength of a freshly generated starting squad, bench weighted as
   * a club playing no european football. */
  median: number;
  p25: number;
  p75: number;
};

export type StrengthReference = {
  samplesPerClub: number;
  clubs: readonly ClubStrength[];
  /** Median over clubs of the per-club median - the league's median
   * season-one squad. Not "the average European entrant" and not a
   * calibration target. */
  leagueMedian: number;
};

const ratingOf = (krotko: string): MatchRating => {
  const rated = TEAM_RATINGS.clubs.find((c) => c.krotko === krotko);
  if (!rated) throw new Error(`No pinned rating for ${krotko}`);
  return { attack: rated.attack, defence: rated.defence };
};

/**
 * Where SEASON-ONE squads sit on the strength axis, per club: draw a
 * formation, then createSquadFromFormation off the pinned rating, exactly as
 * CHOOSE_DIFFICULTY does.
 *
 * READ IT AS NOTHING ELSE. It is bench-weighted for a club playing no
 * european football, it is the squad before any transfer or development, and
 * a strength rank here is NOT a finishing position - the match engine plays
 * the table and has its own randomness. Mapping rank 4 onto the Conference
 * League berth was the first version's mistake. Who actually plays in Europe,
 * and with what strength, is measured on whole careers in
 * european-cups-careers.ts.
 */
export const measureLeagueStrength = (
  baseSeed: number,
  samplesPerClub: number
): StrengthReference => {
  const formationIds = Object.keys(FORMACJE) as FormationId[];
  const perClub = new Map<string, number[]>();

  const seeds = seedSeries(baseSeed, samplesPerClub);
  for (const seed of seeds) {
    const rng = createRng(seed);
    for (const club of TEAM_RATINGS.clubs) {
      const formacja = pick(rng, formationIds);
      const kadra = createSquadFromFormation(rng, FORMACJE[formacja], ratingOf(club.krotko));
      const strength = squadStrength(kadra, null, FORMACJE[formacja]);
      const bucket = perClub.get(club.krotko) ?? [];
      bucket.push(strength);
      perClub.set(club.krotko, bucket);
    }
  }

  const clubs = TEAM_RATINGS.clubs.map((club) => {
    const values = perClub.get(club.krotko)!;
    return {
      krotko: club.krotko,
      n: values.length,
      median: median(values),
      p25: quantile(values, 0.25),
      p75: quantile(values, 0.75),
    };
  });

  return {
    samplesPerClub,
    clubs: [...clubs].sort((a, b) => b.median - a.median),
    leagueMedian: median(clubs.map((c) => c.median)),
  };
};

// --- Acceptance checks ---------------------------------------------------

export type Check = { id: string; opis: string; passed: boolean; detail: string };

const isMonotone = (values: readonly number[]): boolean =>
  values.every((value, i) => i === 0 || value >= at(values, i - 1, "previous value") - 1e-12);

/**
 * The thresholds from chapter 9. Every one of them is INTERNAL: it asks
 * whether the model does what the model claims. None compares the game with
 * the outside world, because the audit established there is no external
 * number fit to be a threshold.
 */
export const runChecks = (cells: readonly CellAudit[], runs: number): Check[] => {
  const checks: Check[] = [];

  const outOfRange = cells.filter(
    (c) =>
      c.analytic.pQualify < 0 ||
      c.analytic.pQualify > 1 ||
      c.analytic.pKnockout < 0 ||
      c.analytic.pKnockout > 1
  );
  checks.push({
    id: "zakres",
    opis: "pQualify i pKnockout w [0, 1] na całej siatce (bez klampowania wyniku)",
    passed: outOfRange.length === 0,
    detail:
      outOfRange.length === 0
        ? "wszystkie wartości w zakresie"
        : outOfRange
            .map(
              (c) =>
                `${c.analytic.cup}@${c.analytic.strength}: pQ=${c.analytic.pQualify.toFixed(3)}, pKO=${c.analytic.pKnockout.toFixed(3)}`
            )
            .join("; "),
  });

  const nonMonotone: string[] = [];
  for (const cup of CUPS) {
    const byStrength = cells
      .filter((c) => c.analytic.cup === cup)
      .sort((a, b) => a.analytic.strength - b.analytic.strength);
    const series: [string, number[]][] = [
      ["pQualify", byStrength.map((c) => c.analytic.pQualify)],
      ["pKnockout", byStrength.map((c) => c.analytic.pKnockout)],
      ["fazaLigowa", byStrength.map((c) => c.analytic.reachLeague)],
      ["knockout", byStrength.map((c) => c.analytic.reachKnockout)],
      ["przychód", byStrength.map((c) => c.analytic.expectedIncome)],
    ];
    for (const [name, values] of series) {
      if (!isMonotone(values)) nonMonotone.push(`${cup}/${name}`);
    }
  }
  checks.push({
    id: "monotonicznosc",
    opis: "monotoniczność po sile dla obu prawdopodobieństw, obu agregatów kaskady i przychodu",
    passed: nonMonotone.length === 0,
    detail: nonMonotone.length === 0 ? "wszystkie serie rosnące" : nonMonotone.join(", "),
  });

  const lkDraws = cells.filter((c) => c.analytic.cup === "LK");
  const badDraws = lkDraws.filter((c) => c.empirical.minDraws !== 1 || c.empirical.maxDraws !== 1);
  checks.push({
    id: "losowania-lk",
    opis: "start w LK pobiera dokładnie jedno losowanie, niezależnie od siły",
    passed: badDraws.length === 0,
    detail:
      badDraws.length === 0
        ? `min = max = 1 w ${lkDraws.length} komórkach`
        : badDraws
            .map((c) => `${c.analytic.strength}: ${c.empirical.minDraws}-${c.empirical.maxDraws}`)
            .join("; "),
  });

  // Four standard errors: at 20000 runs that is a band of well under a
  // percentage point, and a genuine implementation bug shifts the value by
  // far more than that. Tighter would make the audit flaky, wider would let
  // a real defect through.
  const tolerated = (p: number): number => 4 * Math.sqrt(Math.max(p * (1 - p), 1e-6) / runs);
  const mismatched = cells.filter((c) => {
    const expectedQualify = clamp01(c.analytic.pQualify);
    const expectedKnockout = clamp01(c.analytic.pQualify) === 0 ? 0 : clamp01(c.analytic.pKnockout);
    return (
      Math.abs(c.empirical.pQualify - expectedQualify) > tolerated(expectedQualify) ||
      Math.abs(c.empirical.reachLeague - clamp01(c.analytic.reachLeague)) >
        tolerated(clamp01(c.analytic.reachLeague)) ||
      Math.abs(c.empirical.pKnockout - expectedKnockout) > tolerated(expectedKnockout) ||
      Math.abs(c.empirical.meanIncome - c.analytic.expectedIncome) > 4 * c.empirical.seIncome + 1e-9
    );
  });
  checks.push({
    id: "analityka-vs-empiria",
    opis: "wartości analityczne zgodne z empirycznymi w granicy 4 błędów standardowych",
    passed: mismatched.length === 0,
    detail:
      mismatched.length === 0
        ? `zgodność w ${cells.length} komórkach przy n=${runs}`
        : mismatched.map((c) => `${c.analytic.cup}@${c.analytic.strength}`).join(", "),
  });

  const parityCells = cells.filter((c) => c.engineParity !== null);
  if (parityCells.length > 0) {
    const broken = parityCells.filter((c) => c.engineParity === false);
    checks.push({
      id: "parytet-silnika",
      opis: "lokalna symulacja zgodna z resolveEuropeanCampaign noga po nodze na tych samych ziarnach",
      passed: broken.length === 0,
      detail:
        broken.length === 0
          ? `zgodność w ${parityCells.length} komórkach`
          : broken.map((c) => `${c.analytic.cup}@${c.analytic.strength}`).join(", "),
    });
  }

  return checks;
};

// --- Top level -----------------------------------------------------------

export type AuditCli = {
  runs: number;
  seed: number;
  md: string | null;
  variant: string;
  strengthSamples: number;
  /** Whole headless careers per club x policy cell. Zero skips the
   * career layer, which is the only slow part of the tool. */
  careers: number;
};

export type EuropeanCupsAudit = {
  cli: AuditCli;
  variant: Variant;
  cells: readonly CellAudit[];
  checks: readonly Check[];
  strength: StrengthReference;
  /** Null when --careers 0: the report then says so rather than falling back
   * to the season-one proxy the first version wrongly leaned on. */
  campaigns: CareerRun | null;
};

export const runEuropeanCupsAudit = (cli: AuditCli): EuropeanCupsAudit => {
  const variant = variantById(cli.variant);
  const isBaseline = variant.id === "baseline";
  const cells: CellAudit[] = [];

  for (const cup of CUPS) {
    for (const strength of STRENGTH_GRID) {
      // A distinct seed per cell, derived from the one root, so a cell can be
      // re-run in isolation and land on the same sample.
      const cellSeed = (cli.seed + CUPS.indexOf(cup) * 1000 + strength) >>> 0;
      const { empirical, engineParity } = simulateCell(
        cellSeed,
        cli.runs,
        variant.odds,
        cup,
        strength,
        isBaseline
      );
      cells.push({ analytic: analyticCell(variant.odds, cup, strength), empirical, engineParity });
    }
  }

  return {
    cli,
    variant,
    cells,
    checks: runChecks(cells, cli.runs),
    strength: measureLeagueStrength(cli.seed, cli.strengthSamples),
    campaigns: cli.careers > 0 ? collectCampaigns(cli.seed, cli.careers) : null,
  };
};

/** Sanity guard for the audit's own inputs: the engine's exported formula and
 * the local one must agree at baseline. Cheap, and it fails loudly the day
 * someone edits one of the two. */
export const assertFormulaParity = (): void => {
  for (const cup of CUPS) {
    for (const strength of [40, 62, 70, 80, 120]) {
      const engine = advanceProbabilities(cup, strength);
      const local = rawAdvance(EUROPEAN_ADVANCE_ODDS, cup, strength);
      if (
        Math.abs(engine.pQualify - local.pQualify) > 1e-12 ||
        Math.abs(engine.pKnockout - local.pKnockout) > 1e-12
      ) {
        throw new Error(`Formula drift for ${cup} at strength ${strength}`);
      }
    }
  }
};
