import { clubById, CLUBS } from "../data/clubs";
import { FIRST_DIVISION } from "../data/first-division";
import { FOREIGN_CLUBS } from "../data/foreign-clubs";
import type {
  AnalystReport,
  CareerBaseline,
  ClubRecord,
  GameState,
  LeagueClub,
  LeagueMembership,
  ManagerIdentity,
  Phase,
  SaleBuyer,
  StaffMemo,
} from "../data/types";
import { ANALYST_METRICS } from "../data/analyst-metrics";
import { analystMetricValueFromPercentile } from "../logic/analyst-report";
import { buildCareerBaseline } from "../logic/career-baseline";
import { ENGINE_REVISION } from "../logic/engine-version";
import { validateManagerIdentity } from "../logic/manager-identity";
import { readStoredEntry, removeStoredKey, writeStoredJson } from "./local-storage";
import { defined } from "../logic/invariant";

export const GAME_SAVE_STORAGE_KEY = "deadline-day:game-save";

/**
 * Schema 13 (2026-09-15, Task 6B) replaces the drawn difficulty with the
 * chosen club: `GameState` carries `club`, `manager` and `careerBaseline`
 * instead of `poziom`/`klub`. Schemas 7-12 are NOT migrated - deleted along
 * with their migration code and tests, rather than cast forward. A pre-13
 * save has no chosen club and no frozen baseline; there is nothing to
 * repair it onto, only to refuse. See docs/decisions/golden-master.md.
 *
 * `engineVersion` still catches a save whose shape is fine but whose
 * meaning has moved: same fields, different reducer behind them. See
 * src/logic/engine-version.ts.
 *
 * Completed careers are unaffected - game-archive.ts stores results, not
 * squads, and has its own schema (see game-archive.ts's ArchiveEntryV1/V2).
 *
 * 14: LeagueClub carries clubId (buyer-capacity plan, Task 1).
 * 15: Offer carries buyer: SaleBuyer | null, checked by isActiveCard - a
 * SPRZEDAZ card must name a buyer, every other card must not (buyer-capacity
 * plan, Task 7).
 */
export type StoredGameSave = {
  schemaVersion: 16;
  engineVersion: string;
  savedAt: number;
  state: GameState;
};

const CURRENT_SCHEMA_VERSION = 16;

/**
 * Phases worth resuming. "start"/"wybor" have no career yet.
 *
 * "final" was excluded until 2026-09-14, on the grounds that game-archive.ts
 * already captures a finished game. It does not capture the SCREEN: an archive
 * entry holds the club, the title, the score and the replay, and nothing of
 * the legacy screen the career was played for - not the line about the player
 * turned down, not the headlines, not the exceptional histories. So backgrounding
 * the tab on that screen threw away the payoff of eight to twelve minutes and
 * left a summary row behind, in exactly the situation this save exists for: a
 * mobile browser evicting the tab. It is now saved like any other phase, and
 * starting the next career clears it through "start"/"wybor" as before.
 */
const RESUMABLE_PHASES: readonly Phase[] = [
  "przeglad",
  "okno",
  "polSezonu",
  "koniecSezonu",
  "werdykt",
  "epilog",
  "final",
];

export const isResumable = (state: GameState): boolean =>
  RESUMABLE_PHASES.includes(state.faza) &&
  state.club !== null &&
  state.manager !== null &&
  state.careerBaseline !== null &&
  state.seed !== null;

const KNOWN_PHASES: readonly Phase[] = [
  "start",
  "wybor",
  "przeglad",
  "okno",
  "polSezonu",
  "koniecSezonu",
  "werdykt",
  "epilog",
  "final",
];

const KNOWN_CLUB_IDS: ReadonlySet<string> = new Set([
  ...CLUBS.map((c) => c.clubId),
  ...FIRST_DIVISION.map((c) => c.clubId),
]);

const isLeagueClub = (v: unknown): v is LeagueClub => {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.clubId === "string" &&
    KNOWN_CLUB_IDS.has(c.clubId) &&
    typeof c.name === "string" &&
    typeof c.shortName === "string" &&
    typeof c.baseAttack === "number" &&
    typeof c.baseDefence === "number" &&
    (c.tier === "league" || c.tier === "pool") &&
    typeof c.swaps === "number"
  );
};

/** Eighteen up, eighteen down, and no two clubs sharing a short name or a
 * clubId - the same invariants tests/data/roster-ratings.test.ts pins for
 * fresh data, checked again here because a save can arrive hand-edited.
 * Unlike the shallow trust the squad gets below, a broken membership would
 * not surface until the middle of a season. */
const isMembership = (v: unknown): v is LeagueMembership => {
  if (!v || typeof v !== "object") return false;
  const clubs = (v as Record<string, unknown>).clubs;
  if (!Array.isArray(clubs) || !clubs.every(isLeagueClub)) return false;
  const inLeague = clubs.filter((c) => c.tier === "league");
  const names = clubs.map((c) => c.shortName);
  const ids = clubs.map((c) => c.clubId);
  return (
    inLeague.length === 18 &&
    clubs.length === 36 &&
    new Set(names).size === names.length &&
    new Set(ids).size === ids.length
  );
};

/**
 * Shallow shape check, in the style of game-archive.ts's isArchiveEntry: just
 * enough to reject a truncated write or hand-edited storage entry, not a
 * proof of correctness. Player rosters and nested objects are trusted once
 * the surrounding scalars and array fields check out.
 */
const OUTLOOKS = ["limited", "leagueLevel", "leadingLeague", "aboveLeague"];
const CONFIDENCES = ["low", "medium", "high"];

/**
 * A record of memos, possibly empty - but never null, never an array, and
 * never carrying an entry the report code could not read back.
 */
const isStaffMemory = (value: unknown): value is Record<string, StaffMemo> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const memo = entry as Record<string, unknown>;
    return (
      typeof memo.season === "number" &&
      Number.isInteger(memo.season) &&
      memo.season > 0 &&
      typeof memo.seasonsObserved === "number" &&
      Number.isInteger(memo.seasonsObserved) &&
      memo.seasonsObserved >= 0 &&
      typeof memo.outlook === "string" &&
      OUTLOOKS.includes(memo.outlook) &&
      typeof memo.confidence === "string" &&
      CONFIDENCES.includes(memo.confidence)
    );
  });
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * The club record must be the CURRENT `clubById(clubId)`, field for field -
 * not merely shaped like one. A save cannot be trusted to carry a club's
 * presentational fields (name, shortName, character) forward across a data
 * change; only the id is trusted, and everything else is re-derived from it.
 */
const isCurrentClubRecord = (value: unknown): value is ClubRecord => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.clubId !== "string" ||
    typeof record.name !== "string" ||
    typeof record.shortName !== "string" ||
    typeof record.character !== "string" ||
    Object.keys(record).length !== 4
  ) {
    return false;
  }
  let canonical: ClubRecord;
  try {
    canonical = clubById(record.clubId);
  } catch {
    return false;
  }
  return (
    record.name === canonical.name &&
    record.shortName === canonical.shortName &&
    record.character === canonical.character
  );
};

/**
 * The manager must already be in the exact form `validateManagerIdentity`
 * returns - not merely a value that WOULD normalise to something valid. A
 * save is data at rest, and re-normalising it on read would let a
 * hand-edited "  jan  " quietly become "Jan" instead of being refused.
 */
const isNormalizedManagerIdentity = (value: unknown): value is ManagerIdentity => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.firstName !== "string" ||
    typeof record.lastName !== "string" ||
    Object.keys(record).length !== 2
  ) {
    return false;
  }
  const result = validateManagerIdentity(record);
  return (
    result.ok &&
    result.value.firstName === record.firstName &&
    result.value.lastName === record.lastName
  );
};

/**
 * The baseline must equal `buildCareerBaseline(clubId)` for the CURRENT
 * `ENGINE_REVISION` - not merely have finite handicaps. The engine-version
 * check above already refuses a save from a different revision, so if we
 * get here the revision matches and the baseline is a pure function of
 * `clubId` alone: any divergence from what that function returns today means
 * the save was hand-edited or the anchors moved, either of which must be
 * refused rather than trusted.
 */
const isFrozenCareerBaseline = (value: unknown, clubId: string): value is CareerBaseline => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (
    record.clubId !== clubId ||
    !isFiniteNumber(record.baselineExpectedSeasonPoints) ||
    !isFiniteNumber(record.advantageScore) ||
    !isFiniteNumber(record.tenureHandicap) ||
    !isFiniteNumber(record.legacyHandicap) ||
    !(record.initialEuropeanCup === null || typeof record.initialEuropeanCup === "string") ||
    Object.keys(record).length !== 6
  ) {
    return false;
  }

  let expected: CareerBaseline;
  try {
    expected = buildCareerBaseline(clubId);
  } catch {
    return false;
  }
  return (
    record.baselineExpectedSeasonPoints === expected.baselineExpectedSeasonPoints &&
    record.advantageScore === expected.advantageScore &&
    record.tenureHandicap === expected.tenureHandicap &&
    record.legacyHandicap === expected.legacyHandicap &&
    record.initialEuropeanCup === expected.initialEuropeanCup
  );
};

/**
 * A buyer must resolve to a real club, not merely have the right shape: a
 * domestic buyer's clubId and name must point to the SAME entry in the
 * current LeagueMembership, and that entry cannot be the player's own club
 * (a club cannot buy from itself); a foreign buyer's clubId and name must
 * point to the SAME record in FOREIGN_CLUBS. A save whose clubId and name
 * come from two different clubs is exactly the kind of hand-edited or
 * stale value this guard exists to reject (buyer-capacity spec §6).
 */
const isSaleBuyer = (
  v: unknown,
  membership: LeagueMembership,
  ownClubId: string
): v is SaleBuyer => {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  if (typeof b.clubId !== "string" || typeof b.name !== "string") return false;
  if (b.origin === "domestic") {
    return (
      b.clubId !== ownClubId &&
      membership.clubs.some((c) => c.clubId === b.clubId && c.shortName === b.name)
    );
  }
  if (b.origin === "foreign") {
    return FOREIGN_CLUBS.some((c) => c.clubId === b.clubId && c.name === b.name);
  }
  return false;
};

/** The active card, checked where it used to be trusted as "some object":
 * a SPRZEDAZ card must name its buyer, every other card must not. */
const isActiveCard = (v: unknown, membership: LeagueMembership, ownClubId: string): boolean => {
  if (v === null) return true;
  if (!v || typeof v !== "object") return false;
  const card = v as Record<string, unknown>;
  if (!("buyer" in card)) return false;
  return card.typ === "SPRZEDAZ"
    ? isSaleBuyer(card.buyer, membership, ownClubId)
    : card.buyer === null;
};

/**
 * The full schema-15 shape guard. Deliberately does not trust ANY
 * presentational field carried in `localStorage`: the club record, the
 * manager and the baseline are all re-checked against what the engine would
 * produce today from `clubId` alone, not merely shape-checked. A save that
 * merely looks plausible - the right fields, the right types - is not
 * enough; the point of this guard is that a stale or hand-edited save cannot
 * smuggle in values the engine would never produce.
 *
 * The name carries no schema number on purpose: the number is checked
 * separately against CURRENT_SCHEMA_VERSION in readStoredState, and a
 * numbered name (it was V13 through schemas 14 and 15) drifts out of date
 * with every bump.
 */
const isCurrentGameStateShape = (value: unknown): value is GameState => {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;

  // The old difficulty/manual-budget fields must be gone entirely - not
  // merely ignored. Their presence means this save predates the club model
  // (or was hand-edited to imitate one) and must be refused rather than
  // silently stripped.
  if ("poziom" in s || "budzet" in s) return false;

  const isKnownPhase = typeof s.faza === "string" && KNOWN_PHASES.includes(s.faza as Phase);
  const numberFields = [
    "krok",
    "ruchy",
    "czas",
    "maxCzas",
    "przeciagniecia",
    "epilogIdx",
    "decisionIndex",
    "kasa",
    "polowa1",
    "rngState",
  ];
  const arrayFields = [
    "kadra",
    "moje",
    "odrzuceni",
    "kroki",
    "historia",
    "epilog",
    "log",
    "akcje",
    "cardActions",
    "trace",
  ];
  const booleanFields = ["timerWl", "pytamRestart", "relegated"];

  if (
    !isKnownPhase ||
    !numberFields.every((field) => typeof s[field] === "number") ||
    !arrayFields.every((field) => Array.isArray(s[field])) ||
    !booleanFields.every((field) => typeof s[field] === "boolean") ||
    typeof s.rynek !== "object" ||
    s.rynek === null ||
    !isMembership(s.membership) ||
    !isStaffMemory(s.staffMemory)
  ) {
    return false;
  }

  if (!isCurrentClubRecord(s.club)) return false;
  const clubId = s.club.clubId;
  const membership = s.membership;

  return (
    membership.clubs.some((c) => c.clubId === clubId) &&
    isActiveCard(s.karta, membership, clubId) &&
    isNormalizedManagerIdentity(s.manager) &&
    isFrozenCareerBaseline(s.careerBaseline, clubId) &&
    s.careerBaseline.clubId === clubId
  );
};

/**
 * A draw tally that a resumed career can honestly carry on from: present, a
 * whole number, not negative, and small enough to still be exact. `typeof
 * === "number"` alone would accept NaN and Infinity, both of which would
 * poison every later total in silence, because nothing reads the counter
 * back into the simulation to notice.
 */
const hasRngDrawCount = (value: unknown): value is GameState => {
  const count = (value as Record<string, unknown>).rngDrawCount;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
};

/**
 * The two frozen forecast fields: present and finite. A missing pair would
 * silently forecast a season from place zero, which reads as a plausible
 * number rather than as a broken save.
 */
const hasFrozenForecast = (value: unknown): value is GameState => {
  const record = value as Record<string, unknown>;
  return (
    typeof record.seasonForecastExpectedPlace === "number" &&
    Number.isFinite(record.seasonForecastExpectedPlace) &&
    typeof record.seasonForecastEuropeanIncome === "number" &&
    Number.isFinite(record.seasonForecastEuropeanIncome)
  );
};

const normalizeAnalystReport = (report: unknown): AnalystReport | null => {
  if (!report || typeof report !== "object") return null;
  const candidate = report as Record<string, unknown>;
  if (!Array.isArray(candidate.metrics) || candidate.metrics.length !== 2) return null;

  const metrics: AnalystReport["metrics"][number][] = [];
  for (const rawMetric of candidate.metrics) {
    if (!rawMetric || typeof rawMetric !== "object") return null;
    const metric = rawMetric as Record<string, unknown>;
    const metricId = metric.metricId;
    if (
      typeof metricId !== "string" ||
      !Object.prototype.hasOwnProperty.call(ANALYST_METRICS, metricId) ||
      typeof metric.percentile !== "number" ||
      !Number.isInteger(metric.percentile) ||
      metric.percentile < 3 ||
      metric.percentile > 99
    ) {
      return null;
    }
    metrics.push({
      metricId: metricId as AnalystReport["metrics"][number]["metricId"],
      percentile: metric.percentile,
      value: analystMetricValueFromPercentile(
        metric.percentile,
        metricId as AnalystReport["metrics"][number]["metricId"]
      ),
    });
  }

  return {
    ...candidate,
    metrics,
  } as AnalystReport;
};

const normalizeAnalystMetricValues = (state: GameState): GameState | null => {
  if (state.karta === null) return state;
  const analystReport = normalizeAnalystReport(state.karta.analystReport);
  if (analystReport === null) return null;
  return {
    ...state,
    karta: {
      ...state.karta,
      analystReport,
    },
  };
};

/**
 * The version-specific half of the read: validate the raw value against the
 * schema-15 contract, then re-check the tally/forecast/analyst fields that
 * are checked on every write as well as every read - no migration path
 * exists any more, so anything that fails is simply not a schema-15 save.
 */
const readStoredState = (stored: Partial<StoredGameSave> | null): GameState | null => {
  if (!stored || stored.engineVersion !== ENGINE_REVISION) return null;
  if (typeof stored.savedAt !== "number") return null;
  if (stored.schemaVersion !== CURRENT_SCHEMA_VERSION) return null;
  if (!isCurrentGameStateShape(stored.state)) return null;
  if (!hasRngDrawCount(stored.state) || !hasFrozenForecast(stored.state)) return null;
  return normalizeAnalystMetricValues(stored.state);
};

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
