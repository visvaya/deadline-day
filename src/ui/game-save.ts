import type { GameState } from "../data/types";
import { ENGINE_REVISION } from "../logic/engine-version";
import { readStoredEntry, removeStoredKey, writeStoredJson } from "./local-storage";
import { defined } from "../logic/invariant";
import {
  CURRENT_SCHEMA_VERSION,
  isResumable,
  readStoredState,
  type StoredGameSave,
} from "../logic/game-save-schema";

export const GAME_SAVE_STORAGE_KEY = "deadline-day:game-save";

const hasResetParam = (): boolean => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("reset");
};

export type GameSaveLoadResult =
  | { readonly kind: "empty" }
  | { readonly kind: "loaded"; readonly save: StoredGameSave }
  | { readonly kind: "discarded" };

/**
 * The non-destructive read: distinguishes "nothing to resume" from "there
 * was something, but it could not be trusted" without ever touching storage
 * during render. `discarded` never clears the entry - React StrictMode
 * double-invokes a lazy initializer, and clearing here would lose the
 * "could not resume" message before the player ever saw it. The caller
 * (App, in an effect) is responsible for calling `clearGameSave()` once it
 * has shown that message.
 *
 * `?reset` is the one exception: it clears immediately and returns `empty`,
 * never `discarded`, because there is no message to lose - the player asked
 * for a clean slate, not a diagnosis of what was wrong with the old one.
 * Matched with `new URLSearchParams(location.search).has("reset")`, never
 * `location.search.includes("reset")` - the latter also fires on
 * `?preset=1`, which must NOT reset anything.
 */
export const inspectGameSave = (): GameSaveLoadResult => {
  if (hasResetParam()) {
    clearGameSave();
    return { kind: "empty" };
  }

  const entry = readStoredEntry(GAME_SAVE_STORAGE_KEY);
  if (entry.kind === "empty") return { kind: "empty" };
  if (entry.kind === "invalid") return { kind: "discarded" };

  const stored = entry.value as Partial<StoredGameSave> | null;
  const migrated = readStoredState(stored);
  if (migrated === null || !isResumable(migrated)) return { kind: "discarded" };

  return {
    kind: "loaded",
    save: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      engineVersion: ENGINE_REVISION,
      savedAt: defined(stored, "stored save").savedAt as number,
      state: migrated,
    },
  };
};

/**
 * Destructive convenience wrapper kept for callers (and the large existing
 * test suite) that want a single synchronous "read or null, and clean up
 * anything unusable right away" call rather than the render-safe
 * `inspectGameSave`/effect-clear pair. `?reset` and a genuinely empty slot
 * already clear nothing extra; only `discarded` triggers a clear here, and
 * it does so eagerly rather than deferring to an effect, since nothing
 * about a plain function call cares about React's render/commit split.
 */
export const readGameSave = (): StoredGameSave | null => {
  const result = inspectGameSave();
  if (result.kind === "loaded") return result.save;
  if (result.kind === "discarded") clearGameSave();
  return null;
};

/** Returns whether the write actually landed - see local-storage.ts's
 * writeStoredJson. Callers that need to warn the player on failure (the
 * autosave effect and the visibilitychange flush in app.tsx) read this;
 * callers that don't care may still ignore it. */
export const writeGameSave = (state: GameState): boolean => {
  const save: StoredGameSave = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    engineVersion: ENGINE_REVISION,
    savedAt: Date.now(),
    state,
  };
  return writeStoredJson(GAME_SAVE_STORAGE_KEY, save);
};

export const clearGameSave = (): void => {
  removeStoredKey(GAME_SAVE_STORAGE_KEY);
};

/**
 * A cheap structural summary used to decide whether a render actually needs
 * a fresh write - TICK changes `czas` every second, which would otherwise
 * stringify the whole career once a second while a card sits on screen.
 */
export const saveFingerprint = (state: GameState): string =>
  [
    state.faza,
    state.krok,
    state.ruchy,
    state.decisionIndex,
    state.przeciagniecia,
    state.epilogIdx,
    state.timerWl,
    state.karta?.zawodnik.id ?? "",
  ].join("|");

const PENDING_TIMEOUT_STORAGE_KEY = "deadline-day:pending-timeout-notice";
/** Generous relative to how quickly a follow-up reload actually happens
 * (Vite's dev client reconnect, or a second tab-discard) - just long enough
 * to bridge that gap, short enough that a stale leftover can't resurface. */
const PENDING_TIMEOUT_TTL_MS = 10_000;

/**
 * Bridges a real gap: a same-session timeout (see wouldExpire/RECONCILE_TIME
 * in src/ui/app.tsx) shows its notice as in-memory React state, which a
 * reload landing moments later - Vite's dev client reconnecting, or another
 * tab-discard - would silently wipe, leaving the next mount to show the
 * generic "resumed" banner instead of the truth. Call this exactly when that
 * notice is shown, so the next mount can find out it already happened.
 */
export const markPendingTimeoutNotice = (): void => {
  writeStoredJson(PENDING_TIMEOUT_STORAGE_KEY, Date.now());
};

/** Non-destructive on purpose - safe to call from a lazy useState/useReducer
 * initializer, which React's development StrictMode invokes twice. */
export const peekPendingTimeoutNotice = (): boolean => {
  const storedAt = readStoredEntry(PENDING_TIMEOUT_STORAGE_KEY);
  return (
    storedAt.kind === "parsed" &&
    typeof storedAt.value === "number" &&
    Date.now() - storedAt.value < PENDING_TIMEOUT_TTL_MS
  );
};

/** Idempotent (a plain removeItem), so this can run unconditionally in a
 * mount effect without a StrictMode double-invoke guard. */
export const clearPendingTimeoutNotice = (): void => {
  removeStoredKey(PENDING_TIMEOUT_STORAGE_KEY);
};
