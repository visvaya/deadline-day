import { clubById } from "../data/clubs";
import { readStoredJson, removeStoredKey, writeStoredJson } from "./local-storage";

/**
 * Draft of whatever the player has entered or chosen on the two setup
 * screens (manager-screen.tsx, club-select-screen.tsx) BEFORE a career
 * exists - a separate key from `deadline-day:game-save` (game-save.ts),
 * never the same one. game-save's schema-13 guard requires a complete
 * `club`, `manager` and `careerBaseline`, which setup by definition lacks;
 * loosening that guard to accommodate setup would weaken the guard for
 * every other caller too. See docs/decisions/autosave.md for the sibling keys this joins.
 *
 * Deliberately holds only the player's raw inputs - never anything derived
 * from the engine (a `CareerBaseline`, a generated squad, a seed). The
 * hidden-ceiling rule does not apply here (nothing about a player's
 * potential is computed before a career exists), but the same instinct that
 * motivates it - store only what the player actually typed or picked -
 * applies anyway.
 */
export const SETUP_DRAFT_STORAGE_KEY = "deadline-day:setup-draft";

type SetupDraftStep = "manager" | "club";

export type SetupDraft = {
  readonly schemaVersion: 1;
  readonly firstName: string;
  readonly lastName: string;
  readonly timerWl: boolean;
  readonly step: SetupDraftStep;
  readonly clubId: string | null;
};

const DEFAULT_DRAFT: SetupDraft = {
  schemaVersion: 1,
  firstName: "",
  lastName: "",
  timerWl: true,
  step: "manager",
  clubId: null,
};

/**
 * Generous relative to `MAX_CODE_POINTS` (30) in manager-identity.ts - this
 * is unvalidated draft text a player is still typing, not a finished
 * identity, so it must not reject a value `validateManagerIdentity` itself
 * would still call malformed for an ordinary reason (too long, wrong
 * shape). It exists only to keep a pathologically large stored string from
 * being carried around and re-rendered into an input's `value`.
 */
const MAX_RAW_NAME_LENGTH = 200;

const isValidClubId = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    clubById(value);
    return true;
  } catch {
    return false;
  }
};

const sanitizeRawName = (value: unknown): string =>
  typeof value === "string" && value.length <= MAX_RAW_NAME_LENGTH ? value : "";

const sanitizeStep = (value: unknown): SetupDraftStep => (value === "club" ? "club" : "manager");

/**
 * Validates a raw parsed value against the schema-1 shape, discarding
 * INDIVIDUAL fields that don't check out rather than the whole draft -
 * an unknown `clubId`, a `firstName` of the wrong type or a `step` outside
 * the two known values all fall back to their own default field by field,
 * never a crash and never resurrected as something else. Only a value that
 * is not an object at all, or carries the wrong `schemaVersion`, discards
 * the whole draft - there is exactly one schema version today; the next one
 * adds a branch here in the same style as
 * `migrateStoredUiPreferences` (ui-preferences.tsx), not a rewrite of this
 * function.
 */
export const parseSetupDraft = (value: unknown): SetupDraft | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) return null;

  return {
    schemaVersion: 1,
    firstName: sanitizeRawName(record.firstName),
    lastName: sanitizeRawName(record.lastName),
    timerWl: typeof record.timerWl === "boolean" ? record.timerWl : DEFAULT_DRAFT.timerWl,
    step: sanitizeStep(record.step),
    clubId: isValidClubId(record.clubId) ? record.clubId : null,
  };
};

export const readSetupDraft = (): SetupDraft | null =>
  parseSetupDraft(readStoredJson(SETUP_DRAFT_STORAGE_KEY));

/**
 * Read-modify-write merge, so a screen that only knows PART of the draft
 * (manager-screen.tsx never learns the chosen club; club-select-screen.tsx
 * never re-types the manager's name) can update its own fields without
 * overwriting what the other screen already wrote. Falls back to
 * `DEFAULT_DRAFT` rather than refusing to write when nothing valid is
 * stored yet (first-ever write) or the existing entry was discarded on
 * read (corrupt/hand-edited) - a merge onto defaults is exactly what a
 * fresh write should look like in both cases.
 */
export const writeSetupDraftFields = (patch: Partial<Omit<SetupDraft, "schemaVersion">>): void => {
  const current = readSetupDraft() ?? DEFAULT_DRAFT;
  const next: SetupDraft = { ...current, ...patch, schemaVersion: 1 };
  writeStoredJson(SETUP_DRAFT_STORAGE_KEY, next);
};

export const clearSetupDraft = (): void => removeStoredKey(SETUP_DRAFT_STORAGE_KEY);
