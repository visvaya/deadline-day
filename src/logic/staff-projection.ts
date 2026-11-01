/**
 * The conservative envelope of a player's OVR when he arrives at his peak.
 *
 * This is the one place that answers "how good can he still get, at worst and
 * at best" - shared by the staff report and by the scanner that measures what
 * that report reveals. Two implementations of the same walk would drift, and
 * the guarantee behind a `high` potential verdict is only worth as much as the
 * range it is checked against.
 *
 * The walk mirrors `develop()` and `ageSquad()`'s form step exactly: same
 * order, same rounding, growth only while the gap to the ceiling is positive,
 * the ceiling clamp on a form bonus and FORM_PENALTY_FLOOR on a form penalty.
 * The minimum trajectory takes AGE_GROWTH_MIN with a -1 form correction every
 * season, the maximum takes AGE_GROWTH_MAX with +1. Both steps are monotone in
 * OVR and in the growth rate, so every real path lies between them.
 */

import {
  AGE_GROWTH_MAX,
  AGE_GROWTH_MIN,
  AGE_PROFILES,
  AGE_PROFILE_DEFAULT,
  FORM_PENALTY_FLOOR,
} from "../data/balance";
import type { Player, PositionCode } from "../data/types";

export type PeakOvrRange = { minOvr: number; maxOvr: number };

/** One season of growth, with exactly develop()'s rounding and gap guard. */
const grow = (ovr: number, ceiling: number, growth: number): number => {
  const gap = ceiling - ovr;
  return gap > 0 ? Math.round(ovr + gap * growth) : ovr;
};

/**
 * The three outcomes one season of form can produce, exactly as ageSquad
 * sequences them: neutral, bonus clamped to the ceiling, penalty guarded by
 * FORM_PENALTY_FLOOR.
 *
 * Both ends have to consider all three, not one each. The bonus clamp is the
 * reason: for a player sitting ABOVE his ceiling, `min(sufit, ovr + 1)` drags
 * him DOWN to the ceiling, so the "good" outcome is the worst one there. An
 * envelope built from one branch per end is not an envelope.
 */
const formOutcomes = (ovr: number, ceiling: number): readonly number[] => [
  ovr,
  Math.min(ceiling, ovr + 1),
  ovr >= FORM_PENALTY_FLOOR ? Math.max(FORM_PENALTY_FLOOR, ovr - 1) : ovr - 1,
];

const worstForm = (ovr: number, ceiling: number): number => Math.min(...formOutcomes(ovr, ceiling));

const bestForm = (ovr: number, ceiling: number): number => Math.max(...formOutcomes(ovr, ceiling));

/** How many seasons of growth a player has left before his position's peak. */
export const seasonsToPeak = (age: number, pos: PositionCode): number => {
  const { peakStart } = AGE_PROFILES[pos] ?? AGE_PROFILE_DEFAULT;
  return Math.max(0, peakStart - age);
};

/**
 * Lowest and highest OVR this player can hold once he reaches peakStart.
 *
 * A player already at or past his peak has no growth seasons left, so both
 * ends collapse onto his visible OVR.
 */
export const peakOvrRange = (player: Player): PeakOvrRange => {
  const pos = player.poz;
  const { peakStart } = AGE_PROFILES[pos] ?? AGE_PROFILE_DEFAULT;
  const ceiling = player.sufit;

  let minOvr = player.ovr;
  let maxOvr = player.ovr;

  for (let year = player.wiek; year < peakStart; year += 1) {
    minOvr = worstForm(grow(minOvr, ceiling, AGE_GROWTH_MIN), ceiling);
    maxOvr = bestForm(grow(maxOvr, ceiling, AGE_GROWTH_MAX), ceiling);
  }

  return { minOvr, maxOvr };
};
