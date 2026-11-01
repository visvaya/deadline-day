import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { readStoredJson, writeStoredJson } from "./local-storage";

export type ActionBarMode = "autoHide" | "alwaysVisible";

/**
 * `actionBarMode` is optional: an unset field means the player hasn't made
 * an explicit choice yet, which is distinct from having chosen one of the
 * two modes - see `resolveActionBarMode` in `action-bar-query.ts`, which is
 * where "unset" turns into an effective mode (the live viewport default).
 * Owner decision, 2026-09-18: "wszędzie pokazujmy ten div wyboru ukrywania
 * paska akcji. Tylko na desktopach domyślnie nie będzie się ukrywać, a na
 * mobile będzie się domyślnie ukrywać."
 */
export type StoredUiPreferences = {
  schemaVersion: 2;
  actionBarMode?: ActionBarMode;
};

/** Superseded by `StoredUiPreferences` (schemaVersion 2) on 2026-09-18, when
 * the setting stopped being phone-only and its field was renamed to match.
 * Kept here only as the migration's input type. */
type StoredUiPreferencesV1 = {
  schemaVersion: 1;
  mobileActionBarMode: ActionBarMode;
};

type UiPreferencesContextValue = {
  actionBarMode: ActionBarMode | undefined;
  setActionBarMode: (_mode: ActionBarMode) => void;
};

export const UI_PREFERENCES_STORAGE_KEY = "deadline-day:ui-preferences";

const DEFAULT_PREFERENCES: StoredUiPreferences = {
  schemaVersion: 2,
};

const isActionBarMode = (value: unknown): value is ActionBarMode =>
  value === "autoHide" || value === "alwaysVisible";

/**
 * Migrates a raw parsed value from storage to the current schema, or falls
 * back to "unset" (schemaVersion 2, no `actionBarMode`). Exported (rather
 * than folded into `readUiPreferences`) so the migration itself - not just
 * the end-to-end read - is unit-testable without going through
 * `localStorage`.
 *
 * Add the next migration above the `schemaVersion === 2` branch, in the
 * same "read the old shape, carry over what still makes sense" style.
 */
export const migrateStoredUiPreferences = (stored: unknown): StoredUiPreferences => {
  const candidate = stored as
    | Partial<StoredUiPreferences>
    | Partial<StoredUiPreferencesV1>
    | null
    | undefined;

  if (candidate?.schemaVersion === 2) {
    if (candidate.actionBarMode === undefined) return DEFAULT_PREFERENCES;
    return isActionBarMode(candidate.actionBarMode)
      ? { schemaVersion: 2, actionBarMode: candidate.actionBarMode }
      : DEFAULT_PREFERENCES;
  }

  // v1 -> v2 (2026-09-18): `mobileActionBarMode` renamed to `actionBarMode`,
  // and the setting stopped being phone-only. A v1 payload only ever exists
  // because a player explicitly picked a mode (v1 had no "unset" state), so
  // it carries over as an explicit choice rather than being read as a
  // viewport default.
  if (candidate?.schemaVersion === 1 && isActionBarMode(candidate.mobileActionBarMode)) {
    return { schemaVersion: 2, actionBarMode: candidate.mobileActionBarMode };
  }

  return DEFAULT_PREFERENCES;
};

const readUiPreferences = (): StoredUiPreferences => {
  const stored = readStoredJson(UI_PREFERENCES_STORAGE_KEY);
  return migrateStoredUiPreferences(stored);
};

const writeUiPreferences = (preferences: StoredUiPreferences): void => {
  writeStoredJson(UI_PREFERENCES_STORAGE_KEY, preferences);
};

const UiPreferencesContext = createContext<UiPreferencesContextValue>({
  actionBarMode: undefined,
  setActionBarMode: () => undefined,
});

export const UiPreferencesProvider = ({ children }: { children: ReactNode }) => {
  const [preferences, setPreferences] = useState(readUiPreferences);

  const setActionBarMode = useCallback((mode: ActionBarMode): void => {
    const next: StoredUiPreferences = { schemaVersion: 2, actionBarMode: mode };
    setPreferences(next);
    writeUiPreferences(next);
  }, []);

  return (
    <UiPreferencesContext.Provider
      value={{
        actionBarMode: preferences.actionBarMode,
        setActionBarMode,
      }}
    >
      {children}
    </UiPreferencesContext.Provider>
  );
};

export const useUiPreferences = (): UiPreferencesContextValue => useContext(UiPreferencesContext);
