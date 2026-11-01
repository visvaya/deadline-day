/**
 * Hidden potential variance selector.
 *
 * This module encapsulates the spread selection logic that was previously
 * exposed as player-facing labels (pewny/nierówny/loteria). The selector
 * returns only the numeric spread value, with no semantic information that
 * could leak ceiling information to the UI.
 *
 * Thresholds and spread values mirror those from SCOUT_LABELS, but this
 * module exports no labels or player-facing semantics.
 */

/**
 * Minimal RNG interface for spread selection. Defined locally to avoid
 * importing from src/logic (src/data is a leaf). Structurally compatible
 * with src/logic/rng.Rng.
 */
export interface RngInterface {
  next(): number;
  state?(): number; // Optional: used by tests, not required by selectPotentialSpread
}

/**
 * Selects a potential spread based on a single RNG draw.
 *
 * Uses cumulative thresholds:
 * - [0.00, 0.35) => spread 3
 * - [0.35, 0.75) => spread 11
 * - [0.75, 1.00] => spread 24
 *
 * This is an internal implementation detail with no correlation exposed to
 * the player-facing layer. The spread is used only in player generation
 * (ceiling calculation) and development (form modifier).
 *
 * @param rng Deterministic random number generator instance
 * @returns Numeric spread value (3, 11, or 24)
 */
export const selectPotentialSpread = (rng: RngInterface): number => {
  const r = rng.next();

  if (r < 0.35) {
    return 3;
  } else if (r < 0.75) {
    return 11;
  } else {
    return 24;
  }
};
