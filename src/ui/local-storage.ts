/**
 * Shared localStorage access for game-archive.ts, ui-preferences.tsx and
 * game-save.ts. A damaged or blocked entry (private tab, quota, manual
 * tampering) must never prevent the game from starting - a read always
 * collapses to a no-op, and a write never throws back at the caller. A write
 * failure is no longer silent everywhere, though: `writeStoredJson` reports
 * it through its return value, and the two callers the player would actually
 * notice losing (the career autosave, the finished-game archive) surface it
 * as a notice. Setup draft and UI preferences ignore the return value on
 * purpose - see docs/decisions/autosave.md for why.
 */

/**
 * The three ways reading a stored entry can go, kept apart because the
 * caller has to react to them differently: `empty` (no key, or storage is
 * inaccessible entirely - a private tab, a blocked API) is silent and
 * unsurprising, while `invalid` (the key exists but its JSON does not parse)
 * is a corrupt or hand-edited entry the caller may want to tell the player
 * about before clearing it.
 *
 * `readStoredJson` below collapses `invalid` into the same `null` as
 * `empty`, which is fine for callers that only ever overwrite a bad entry
 * silently (the archive, UI preferences). `game-save.ts`'s `inspectGameSave`
 * needs the distinction, which is why this lives here rather than being
 * folded into a single boolean.
 */
export type StoredEntryResult =
  | { readonly kind: "empty" }
  | { readonly kind: "parsed"; readonly value: unknown }
  | { readonly kind: "invalid" };

export const readStoredEntry = (key: string): StoredEntryResult => {
  if (typeof window === "undefined") return { kind: "empty" };

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // Storage inaccessible entirely (private tab, disabled API) - treated the
    // same as "nothing stored", never as a corrupt entry: there is nothing to
    // warn the player about.
    return { kind: "empty" };
  }
  if (raw === null) return { kind: "empty" };

  try {
    return { kind: "parsed", value: JSON.parse(raw) };
  } catch {
    return { kind: "invalid" };
  }
};

/**
 * Compatible wrapper kept for game-archive.ts and ui-preferences.tsx, which
 * only ever want "is there something usable here" and already treat a
 * missing key and a parse failure the same way (overwrite silently on the
 * next write).
 */
export const readStoredJson = (key: string): unknown => {
  const result = readStoredEntry(key);
  return result.kind === "parsed" ? result.value : null;
};

/**
 * Returns `true` when the write actually landed in storage, `false` when
 * `setItem` threw (private tab, quota) or `window` is undefined. Existing
 * callers that only cared about "never throws" keep compiling unchanged -
 * they simply ignore the result, same as before this returned anything.
 */
export const writeStoredJson = (key: string, value: unknown): boolean => {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Storage unavailable (private tab, quota) - the game still plays fine this session.
    return false;
  }
};

export const removeStoredKey = (key: string): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage unavailable - nothing to clean up.
  }
};
