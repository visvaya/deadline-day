import {
  RETIREMENT_OVR,
  STARTING_BENCH_OVR_BONUS,
  STARTING_XI_OVR_BONUS,
  WAGE_AT_PIVOT,
  WAGE_PIVOT_OVR,
  WAGE_SLOPE,
  type BonusBand,
} from "../data/balance";
import { FORMACJE } from "../data/positions";
import type { Formation } from "../data/types";
import { formationTargetOvr } from "./squad-targets";
import type { MatchRating } from "./match";

/**
 * The generator's squad-cost model, shared by the game and the money-scale
 * study that fitted it.
 *
 * Moved out of `scripts/money-scale-core.ts` on 2026-09-14 so the club
 * selection screen (a later task in this plan) and the wage fit read one
 * implementation instead of two copies that could drift apart. Everything
 * here is analytic: the squad the game draws is random, but the quantity a
 * wage projection needs is an expectation over that draw, and an expectation
 * of a bounded piecewise-uniform variable has a closed form. A sampled
 * version would have made every reported figure depend on a seed.
 */

export type { BonusBand };

const assertFiniteOvr = (ovr: number): void => {
  if (!Number.isFinite(ovr)) throw new Error(`ovr must be finite, got ${ovr}`);
};

/**
 * The probability of each integer ovr a generated slot can produce.
 *
 * `createStartingSquadPlayer` computes `Math.round(Math.max(RETIREMENT_OVR,
 * target + bonus))` with `bonus` uniform on `[lo, hi)`. Rounding sends the
 * half-open interval `[n - 0.5, n + 0.5)` to `n`, so each integer's mass is
 * the length of that interval's intersection with the support, divided by the
 * support's width. The floor is applied BEFORE rounding, so everything under
 * 50.5 lands on 50 rather than on the integers below it.
 */
export const ovrMasses = (target: number, bonus: BonusBand): Map<number, number> => {
  assertFiniteOvr(target);
  if (!Number.isFinite(bonus.lo) || !Number.isFinite(bonus.hi) || bonus.hi <= bonus.lo) {
    throw new Error(`bonus band must be finite and non-empty, got [${bonus.lo}, ${bonus.hi})`);
  }
  const low = target + bonus.lo;
  const high = target + bonus.hi;
  const width = high - low;
  const overlap = (from: number, to: number): number =>
    Math.max(0, Math.min(high, to) - Math.max(low, from)) / width;

  const masses = new Map<number, number>();
  // The floor bucket is everything below 50.5, not just [49.5, 50.5).
  const floorMass = overlap(Number.NEGATIVE_INFINITY, RETIREMENT_OVR + 0.5);
  if (floorMass > 0) masses.set(RETIREMENT_OVR, floorMass);
  const last = Math.ceil(high + 0.5);
  for (let ovr = RETIREMENT_OVR + 1; ovr <= last; ovr += 1) {
    const mass = overlap(ovr - 0.5, ovr + 0.5);
    if (mass > 0) masses.set(ovr, mass);
  }
  return masses;
};

/**
 * `E[exp((OVR - WAGE_PIVOT_OVR) / slope)]` for one generated slot: the slot's
 * payroll divided by `wageAtPivot`, so the level factors straight out of the
 * fit. Taking the expectation of the exponential rather than exponentiating
 * the mean ovr matters - exp is convex, so the naive order understates every
 * payroll, and by more the wider the band.
 */
export const slotShape = (target: number, bonus: BonusBand, slope: number): number => {
  if (!Number.isFinite(slope) || slope <= 0) {
    throw new Error(`wageSlope must be finite and positive, got ${slope}`);
  }
  let total = 0;
  for (const [ovr, mass] of ovrMasses(target, bonus)) {
    total += mass * Math.exp((ovr - WAGE_PIVOT_OVR) / slope);
  }
  return total;
};

/**
 * The two squad models the plan requires, named rather than blended.
 *
 * `screen-projection` pays every slot the position target
 * `formationTargetOvr` returns - the simplification the spec's projected wage
 * share used to describe. `generator-expectation` is what the squad the game
 * actually draws is expected to cost, and since 2026-09-09 it is the spec's
 * contract. The report carries both, so the simplification's error is visible
 * rather than assumed.
 */
export type SquadModelId = "screen-projection" | "generator-expectation";

export const SQUAD_MODEL_IDS: readonly SquadModelId[] = [
  "screen-projection",
  "generator-expectation",
];

/** One formation's payroll shape (`payroll / wageAtPivot`), never averaged.
 * Shared by `squadShape`, which averages it over all seven formations, and
 * `formationPayrollSpread`, which needs the seven totals kept apart. */
const formationShape = (
  formation: Formation,
  rating: MatchRating,
  model: SquadModelId,
  slope: number
): number => {
  const targets = formationTargetOvr(formation, rating);
  let total = 0;
  for (const slot of formation.pozycje) {
    const target = targets.get(slot.kod);
    if (target === undefined) {
      throw new Error(`${formation.id} has no target for ${slot.kod}`);
    }
    const benchCount = slot.kadra - slot.xi;
    if (model === "screen-projection") {
      total += slot.kadra * Math.exp((target - WAGE_PIVOT_OVR) / slope);
    } else {
      total += slot.xi * slotShape(target, STARTING_XI_OVR_BONUS, slope);
      total += benchCount * slotShape(target, STARTING_BENCH_OVR_BONUS, slope);
    }
  }
  return total;
};

/**
 * The club's payroll divided by `wageAtPivot`, averaged over the seven
 * formations a career can be dealt. Averaging rather than picking one is the
 * same choice the spec makes for the projected wage share: the player does
 * not choose the formation, so the club's expected cost is over all of them.
 */
export const squadShape = (rating: MatchRating, model: SquadModelId, slope: number): number => {
  if (!Number.isFinite(slope) || slope <= 0) {
    throw new Error(`wageSlope must be finite and positive, got ${slope}`);
  }
  const formations = Object.values(FORMACJE);
  let total = 0;
  for (const formation of formations) {
    total += formationShape(formation, rating, model, slope);
  }
  return total / formations.length;
};

/**
 * What the squad the generator actually draws is expected to cost this club
 * in one season, in the game's millions of euro.
 *
 * Uses the activation's own wage curve (`WAGE_AT_PIVOT`, `WAGE_SLOPE` from
 * `src/data/balance.ts`) rather than taking them as parameters, because this
 * is the figure a later task shows on the club selection screen and that
 * screen has no wage curve of its own to pass in.
 */
export const expectedSquadPayroll = (rating: MatchRating): number =>
  WAGE_AT_PIVOT * squadShape(rating, "generator-expectation", WAGE_SLOPE);

/**
 * How much the club's payroll would vary across the seven formations a
 * career can be dealt, as `(max - min) / mean`.
 *
 * Uses `generator-expectation`, matching `expectedSquadPayroll`: the spec's
 * chapter 6.2 rules that the generator model is the contract and that the
 * screen projection no longer applies, and this function measures how far
 * the on-screen wage share can drift from the squad the game actually
 * draws, so it has to read the same model that drift is measured against.
 *
 * The plan's own acceptance band (0.12..0.14) and the spec's 12.7% figure
 * are a historical measurement at the fitted wageSlope of 14.5253 and/or in
 * the screen-projection model, not a target this code must reproduce. At
 * the active `WAGE_SLOPE = 12` in the generator model, Wisła Kraków measures
 * about 0.087 - lower, and a recorded decision rather than a regression.
 */
export const formationPayrollSpread = (rating: MatchRating): number => {
  const formations = Object.values(FORMACJE);
  const payrolls = formations.map(
    (formation) =>
      WAGE_AT_PIVOT * formationShape(formation, rating, "generator-expectation", WAGE_SLOPE)
  );
  const max = Math.max(...payrolls);
  const min = Math.min(...payrolls);
  const mean = payrolls.reduce((sum, payroll) => sum + payroll, 0) / payrolls.length;
  return (max - min) / mean;
};
