/**
 * Deterministic seed derivation using FNV-1a 32-bit hash.
 * Never uses Math.random() - all seeding is pure and reproducible.
 */

/**
 * FNV-1a 32-bit hash of a JSON string.
 * Used to derive deterministic seeds from composite keys.
 */
export const deriveSeed = (...parts: readonly (string | number)[]): number => {
  const json = JSON.stringify(parts);

  // FNV-1a 32-bit: FNV offset basis and prime
  let hash = 2166136261;
  const FNV_PRIME = 16777619;

  for (let i = 0; i < json.length; i += 1) {
    const charCode = json.charCodeAt(i);
    hash ^= charCode;
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
};
