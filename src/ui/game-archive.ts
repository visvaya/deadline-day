import type { GameState, ManagerIdentity } from "../data/types";
import { ENGINE_REVISION } from "../logic/engine-version";
import { readStoredJson, writeStoredJson } from "./local-storage";

const GAME_ARCHIVE_STORAGE_KEY = "deadline-day:game-archive";

const MAX_ENTRIES = 50;

/** The literal difficulty labels a v1 (pre-club-model) archive row can still
 * carry - never written by new code, only read back from old storage. */
type LegacyDifficultyId = "latwy" | "sredni" | "trudny";

/**
 * A row written before Task 6 (2026-09-15): keyed by the drawn difficulty,
 * not a chosen club, and with no manager identity to show - the setup form
 * did not exist yet. Kept readable and displayed (never dropped), but never
 * replayable: the reducer no longer has a CHOOSE_DIFFICULTY action to feed
 * its replay through.
 */
export type ArchiveEntryV1 = {
  readonly kind: "v1";
  readonly id: string;
  readonly finishedAt: number;
  readonly difficulty: LegacyDifficultyId;
  readonly clubName: string;
  readonly legacyTitle: string;
  readonly legacyScore: number;
  readonly signedPlayers: number;
  readonly replay: {
    readonly seed: number;
    readonly difficulty: LegacyDifficultyId;
    readonly actions: readonly string[];
    readonly engineVersion: string;
  };
};

/**
 * The replay shape a v2 archive entry carries: the manager and the chosen
 * club instead of a drawn difficulty, and `actions` holding only the
 * decisions made after START_CAREER; the seed, club and manager are carried
 * as their own fields and never appear inside `actions` itself. See
 * docs/decisions/golden-master.md.
 *
 * Also the shape tests/golden/record.test.ts writes (Task 6F) - the v2
 * recorder is not run before step 8, but it is type-checked against this
 * same contract so the two never drift apart.
 */
export type ReplayV2 = {
  readonly seed: number;
  readonly clubId: string;
  readonly manager: ManagerIdentity;
  readonly actions: readonly string[];
  readonly engineVersion: string;
};

/**
 * A row written by the club-choice model. Carries no difficulty label, no
 * `advantageScore` and no handicaps - those all follow from the versioned
 * engine data behind `clubId` and `engineVersion`, and duplicating them here
 * would be a second source of truth that drifts the day either changes.
 *
 * @internal Consumed by the archive-replay screen of a later task in this
 * in-progress feature (career model and club choice), not yet implemented.
 */
export type ArchiveEntryV2 = {
  readonly kind: "v2";
  readonly id: string;
  readonly finishedAt: number;
  readonly clubId: string;
  readonly clubName: string;
  readonly manager: ManagerIdentity;
  readonly legacyTitle: string;
  readonly legacyScore: number;
  readonly signedPlayers: number;
  readonly replay: ReplayV2;
};

export type ArchiveEntry = ArchiveEntryV1 | ArchiveEntryV2;

export type StoredGameArchive = {
  schemaVersion: 2;
  entries: ArchiveEntry[];
};

const DEFAULT_ARCHIVE: StoredGameArchive = {
  schemaVersion: 2,
  entries: [],
};

/**
 * FNV-1a, 32-bit, over the UTF-16 code units of the input string - no Node
 * API, since this runs in the browser. `Math.imul` keeps the multiply
 * exactly 32-bit without ever going through a BigInt or a manual overflow
 * mask.
 */
const FNV_OFFSET_BASIS = 0x811c_9dc5;
const FNV_PRIME = 0x0100_0193;

const fnv1a32Hex = (input: string): string => {
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

/**
 * The id of a v2 archive entry. `engineVersion`, `seed` and `clubId` alone
 * are not unique - the same seed and club can be played through many
 * different decision sequences - so the FNV-1a digest of the joined actions
 * (never Node's crypto, see above) is what actually distinguishes two
 * careers that share everything else.
 */
export const archiveEntryId = ({
  engineVersion,
  seed,
  clubId,
  actions,
}: {
  readonly engineVersion: string;
  readonly seed: number;
  readonly clubId: string;
  readonly actions: readonly string[];
}): string => `${engineVersion}-${seed}-${clubId}-${fnv1a32Hex(actions.join("\0"))}`;

const isLegacyDifficultyId = (value: unknown): value is LegacyDifficultyId =>
  value === "latwy" || value === "sredni" || value === "trudny";

const isArchiveEntryV1Shape = (entry: Record<string, unknown>): boolean => {
  const replay = entry.replay as Record<string, unknown> | undefined;
  return (
    typeof entry.id === "string" &&
    typeof entry.finishedAt === "number" &&
    isLegacyDifficultyId(entry.difficulty) &&
    typeof entry.clubName === "string" &&
    typeof entry.legacyTitle === "string" &&
    typeof entry.legacyScore === "number" &&
    typeof entry.signedPlayers === "number" &&
    !!replay &&
    typeof replay.seed === "number" &&
    isLegacyDifficultyId(replay.difficulty) &&
    Array.isArray(replay.actions) &&
    replay.actions.every((action) => typeof action === "string") &&
    typeof replay.engineVersion === "string"
  );
};

/**
 * Retention checks SHAPE only - types, never today's catalogue or today's
 * name validator. A finished career is a historical record: `CLUBS` changes
 * between seasons and `validateManagerIdentity` has already been tightened
 * once, and a row failing either check would otherwise be filtered out here
 * and then erased for good by the next `saveFinishedGame`, which writes the
 * filtered list back. The row is displayed from its own stored `clubName`
 * and manager strings, so it never needs the catalogue to render.
 *
 * Rendering those strings is safe without the name validator: the archive
 * screen shows them as React text children, which are escaped, never as
 * HTML. Whether a row can be REPLAYED is a separate, stricter question
 * (`clubId` must still resolve and the manager must still validate) that
 * belongs to whatever consumer replays it - the archive offers no replay
 * action today, so no such check runs here.
 */
const isManagerShape = (value: unknown): value is ManagerIdentity => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.firstName === "string" && typeof record.lastName === "string";
};

const isReplayV2Shape = (value: unknown): value is ReplayV2 => {
  if (!value || typeof value !== "object") return false;
  const replay = value as Record<string, unknown>;
  return (
    typeof replay.seed === "number" &&
    typeof replay.clubId === "string" &&
    isManagerShape(replay.manager) &&
    Array.isArray(replay.actions) &&
    replay.actions.every((action) => typeof action === "string") &&
    typeof replay.engineVersion === "string"
  );
};

const isArchiveEntryV2Shape = (entry: Record<string, unknown>): boolean =>
  typeof entry.id === "string" &&
  typeof entry.finishedAt === "number" &&
  typeof entry.clubId === "string" &&
  typeof entry.clubName === "string" &&
  isManagerShape(entry.manager) &&
  typeof entry.legacyTitle === "string" &&
  typeof entry.legacyScore === "number" &&
  typeof entry.signedPlayers === "number" &&
  isReplayV2Shape(entry.replay);

/** Guards a schema-2 wrapper's own entries, which already carry `kind`. */
const isArchiveEntry = (value: unknown): value is ArchiveEntry => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  if (entry.kind === "v1") return isArchiveEntryV1Shape(entry);
  if (entry.kind === "v2") return isArchiveEntryV2Shape(entry);
  return false;
};

/** Normalises one row from a schema-1 wrapper (no `kind` field at all) into
 * a tagged ArchiveEntryV1, or drops it if it fails even the old shape check. */
const migrateLegacyEntry = (value: unknown): ArchiveEntryV1 | null => {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  if (!isArchiveEntryV1Shape(entry)) return null;
  const replay = entry.replay as Record<string, unknown>;
  return {
    kind: "v1",
    id: entry.id as string,
    finishedAt: entry.finishedAt as number,
    difficulty: entry.difficulty as LegacyDifficultyId,
    clubName: entry.clubName as string,
    legacyTitle: entry.legacyTitle as string,
    legacyScore: entry.legacyScore as number,
    signedPlayers: entry.signedPlayers as number,
    replay: {
      seed: replay.seed as number,
      difficulty: replay.difficulty as LegacyDifficultyId,
      actions: replay.actions as readonly string[],
      engineVersion: replay.engineVersion as string,
    },
  };
};

/**
 * Reads the archive, migrating a schema-1 wrapper's rows to tagged
 * ArchiveEntryV1 on the way in. Always returns schema 2: the next
 * `saveFinishedGame` call persists whatever this returned, plus the new
 * entry, as a schema-2 wrapper - which is what turns this read-time
 * normalisation into a real migration without ever discarding v1 rows.
 */
export const readGameArchive = (): StoredGameArchive => {
  const stored = readStoredJson(GAME_ARCHIVE_STORAGE_KEY) as {
    schemaVersion?: unknown;
    entries?: unknown;
  } | null;

  if (stored?.schemaVersion === 2 && Array.isArray(stored.entries)) {
    return { schemaVersion: 2, entries: stored.entries.filter(isArchiveEntry) };
  }

  if (stored?.schemaVersion === 1 && Array.isArray(stored.entries)) {
    const migrated = stored.entries
      .map(migrateLegacyEntry)
      .filter((entry): entry is ArchiveEntryV1 => entry !== null);
    return { schemaVersion: 2, entries: migrated };
  }

  return DEFAULT_ARCHIVE;
};

const writeGameArchive = (archive: StoredGameArchive): boolean =>
  writeStoredJson(GAME_ARCHIVE_STORAGE_KEY, archive);

/**
 * The label a card of entries sharing one `engineVersion` is grouped under.
 * The current engine keeps the plain "best score first" caption; anything
 * older is labelled with its own revision, because rescaled legacy
 * multipliers changed the unit of the raw score across versions - sorting
 * across groups would rank two incomparable numbers against each other.
 *
 * The separator here is `·` (middle dot), not an em dash: the code layer bans
 * it (check:text and oxlint) in every player-facing string under `src/**`, no
 * exception for this caption.
 */
const archiveGroupCaption = (engineVersion: string): string =>
  engineVersion === ENGINE_REVISION
    ? "Posortowane od najlepszego wyniku"
    : `Wyniki ze starszej wersji · ${engineVersion}`;

export type ArchiveGroup = {
  readonly engineVersion: string;
  readonly caption: string;
  readonly entries: readonly ArchiveEntry[];
};

/**
 * Groups by `engineVersion` and sorts only WITHIN each group - never across
 * groups, for the reason `archiveGroupCaption` documents. The current
 * engine's group always sorts first (when present), followed by older
 * groups newest-finished-first, so a player scrolling down moves backward
 * through time rather than through an arbitrary version ordering.
 */
export const groupArchiveEntries = (entries: readonly ArchiveEntry[]): ArchiveGroup[] => {
  const byVersion = new Map<string, ArchiveEntry[]>();
  for (const entry of entries) {
    const version = entry.replay.engineVersion;
    const bucket = byVersion.get(version);
    if (bucket) bucket.push(entry);
    else byVersion.set(version, [entry]);
  }

  const groups: ArchiveGroup[] = Array.from(byVersion.entries()).map(([engineVersion, group]) => ({
    engineVersion,
    caption: archiveGroupCaption(engineVersion),
    entries: [...group].sort((a, b) => b.legacyScore - a.legacyScore),
  }));

  const mostRecentFinish = (group: ArchiveGroup): number =>
    Math.max(...group.entries.map((entry) => entry.finishedAt));

  return groups.sort((a, b) => {
    if (a.engineVersion === ENGINE_REVISION) return -1;
    if (b.engineVersion === ENGINE_REVISION) return 1;
    return mostRecentFinish(b) - mostRecentFinish(a);
  });
};

/**
 * Records a finished game exactly once. Idempotent by construction (id is
 * derived from the engine, seed, club and action sequence, not a counter),
 * so a double-invoked effect (React StrictMode) or a re-render simply
 * overwrites the same entry instead of duplicating it.
 *
 * Returns `false` only when an attempted write failed. Every early return
 * (no finished game to record, or an entry already stored under this id)
 * reports `true` without writing anything - there was nothing to lose, so
 * it is a success, not a failure. app.tsx reads this to warn the player once
 * per run of failures; nothing else depends on the return value.
 */
export const saveFinishedGame = (state: GameState): boolean => {
  if (state.faza !== "final" || !state.finalne || !state.club || !state.manager) return true;
  if (state.seed === null) return true;

  const replay: ReplayV2 = {
    seed: state.seed,
    clubId: state.club.clubId,
    manager: state.manager,
    actions: state.akcje,
    engineVersion: ENGINE_REVISION,
  };
  const id = archiveEntryId(replay);
  const archive = readGameArchive();
  if (archive.entries.some((entry) => entry.id === id)) return true;

  // Player rosters carry the hidden ceiling and run to several KB each -
  // neither belongs in a device-local scoreboard, so only the count survives.
  const entry: ArchiveEntryV2 = {
    kind: "v2",
    id,
    finishedAt: Date.now(),
    clubId: state.club.clubId,
    clubName: state.club.name,
    manager: state.manager,
    legacyTitle: state.finalne.tytul,
    legacyScore: state.finalne.dziedzictwo,
    signedPlayers: state.moje.length,
    replay,
  };

  return writeGameArchive({
    schemaVersion: 2,
    entries: [entry, ...archive.entries].slice(0, MAX_ENTRIES),
  });
};
