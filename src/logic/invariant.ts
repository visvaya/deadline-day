/**
 * Small helpers for indexed access that is provably safe but that
 * `noUncheckedIndexedAccess` cannot prove on its own (index derived from the
 * same array's length, a table keyed by a closed union, and so on).
 *
 * Never used to paper over a genuinely missing value: a missing value here
 * means a bug upstream, so these throw instead of returning a fallback that
 * the old code never produced.
 */

/** Reads `items[index]`, throwing if the element is missing. */
export const at = <T>(items: readonly T[], index: number, what: string): T => {
  const value = items[index];
  if (value === undefined) {
    throw new Error(`invariant violated: ${what} (index ${index} out of ${items.length})`);
  }
  return value;
};

/** Reads `map.get(key)`, throwing if the key is missing. */
export const mapAt = <K, V>(map: ReadonlyMap<K, V>, key: K, what: string): V => {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`invariant violated: ${what} (key ${String(key)} missing)`);
  }
  return value;
};

/**
 * Returns `value`, throwing if it is null or undefined. For state the current
 * phase guarantees (a club once the career has started, a card while a window
 * is open) where the type cannot follow the phase.
 */
export const defined = <T>(value: T | null | undefined, what: string): T => {
  if (value === null || value === undefined) {
    throw new Error(`invariant violated: ${what} is missing`);
  }
  return value;
};

/**
 * Reads `record[key]` from a string-keyed record (a parsed CSV row, a table
 * keyed by an open string), throwing if the key is missing.
 */
export const recordAt = <V>(record: Readonly<Record<string, V>>, key: string, what: string): V => {
  const value = record[key];
  if (value === undefined) {
    throw new Error(`invariant violated: ${what} (key ${key} missing)`);
  }
  return value;
};
