import { at } from "../logic/invariant";

/**
 * Fresh seed for a game the player did not seed themselves. The one place the
 * game reads entropy; it lives in the UI layer so that src/logic stays
 * deterministic and takes every seed as a parameter.
 */
export const randomSeed = (): number => {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return at(Array.from(buffer), 0, "randomSeed buffer");
};
