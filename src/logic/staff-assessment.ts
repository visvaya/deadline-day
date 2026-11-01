/**
 * Staff assessment: honest signals about a player's potential or current level,
 * with confidence that rises over a career and never falls.
 *
 * For young players (before peakStart), assesses hidden ceiling with noise.
 * For mature players (peakStart and beyond), reads only visible OVR with high
 * confidence.
 *
 * The club REMEMBERS its last report on a player. A verdict for season N is
 * one draw constrained by that memo, not a replay of the whole history:
 * `reachableLevel` iterates from CURRENT ovr and nobody keeps an ovr history,
 * so a "recomputed previous verdict" would be built from today's ovr and could
 * walk backwards for a player who developed worse than the projection assumed.
 * A freeze that lets go exactly when the player is watching closest is not a
 * freeze.
 */

import { AGE_GROWTH_MAX, AGE_GROWTH_MIN, AGE_PROFILES, AGE_PROFILE_DEFAULT } from "../data/balance";
import type {
  Player,
  PositionCode,
  ReportPeriod,
  StaffAssessment,
  StaffConfidence,
  StaffFocus,
  StaffMemo,
  StaffOutlook,
  StaffSource,
} from "../data/types";
import { createRng, type Rng } from "./rng";
import { peakOvrRange } from "./staff-projection";
import { deriveSeed } from "./stable-seed";
import { at } from "./invariant";

/**
 * Clamp a value to [min, max].
 */
const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Determine the career phase of a player based on age and position.
 * Before peakStart: potential (young player)
 * At peakStart and beyond: current (mature player)
 */
const determineFocus = (age: number, pos: PositionCode): StaffFocus => {
  const profile = AGE_PROFILES[pos];
  return age < profile.peakStart ? "potential" : "current";
};

/**
 * Convert a ceiling value to a percentile on the observation scale.
 * Base formula: clamp(round((ceiling - 56) * 4), 3, 99)
 */
const ceilingToBasePercentile = (ceiling: number): number =>
  clamp(Math.round((ceiling - 56) * 4), 3, 99);

/** Mean growth step, from the same constants develop() draws between. */
const GROWTH_RATE = (AGE_GROWTH_MIN + AGE_GROWTH_MAX) / 2;

/**
 * Where this player can actually get to, rather than what his ceiling says.
 *
 * develop() grows a player only while `wiek < peakStart`, closing the gap to
 * his ceiling by a fraction each season - so the ceiling is a limit, not a
 * destination, and how much of it is still in reach depends entirely on how
 * many seasons are left. A 24-year-old midfielder rated 66 with a ceiling of
 * 78 has one growth season and will finish around 70; reporting him as
 * "klasa europejska" describes a level he can no longer arrive at.
 *
 * Reads visible age and position plus the ceiling - and the ceiling is what
 * this channel exists to report, so nothing new is exposed. What changes is
 * that the report converges on the truth as the player runs out of seasons,
 * which is also when there is least left to hide.
 */
const reachableLevel = (ovr: number, ceiling: number, age: number, pos: PositionCode): number => {
  const { peakStart } = AGE_PROFILES[pos] ?? AGE_PROFILE_DEFAULT;
  let projected = ovr;
  for (let year = age; year < peakStart; year += 1) {
    projected += (ceiling - projected) * GROWTH_RATE;
  }
  return projected;
};

/**
 * How much the noise radius is worth scaling by, given the seasons left.
 *
 * A seventeen-year-old is genuinely hard to read; a player one season from
 * his peak has almost finished becoming whatever he was going to be, and a
 * scout who cannot tell by then is not a scout. Keyed on years-to-peak, which
 * follows from visible age and position, so it reveals nothing on its own.
 */
const yearsToPeak = (age: number, pos: PositionCode): number => {
  const { peakStart } = AGE_PROFILES[pos] ?? AGE_PROFILE_DEFAULT;
  return Math.max(0, peakStart - age);
};

const yearsToPeakScale = (age: number, pos: PositionCode): number => {
  const years = yearsToPeak(age, pos);
  if (years >= 6) return 1;
  if (years >= 4) return 0.85;
  if (years >= 2) return 0.62;
  return 0.4;
};

/**
 * Convert an OVR value to a percentile on the observation scale.
 * Same formula as ceiling but with visible OVR instead.
 */
const ovrToBasePercentile = (ovr: number): number => clamp(Math.round((ovr - 56) * 4), 3, 99);

/**
 * Map a percentile [0, 100] to an outlook category.
 * Thresholds on the percentile scale, chosen to land on the same OVR
 * boundaries the rating colour uses - one scale, one meaning:
 * ≤24  (OVR ≤62)   limited        - red
 * 25-59 (OVR 63-70) leagueLevel    - amber
 * 60-79 (OVR 71-75) leadingLeague  - green
 * ≥80  (OVR ≥76)   aboveLeague    - green
 *
 * The first boundary used to sit at 34, which put OVR 63-64 in "lower
 * league" while the same player's rating was already amber.
 */
const percentileToOutlook = (percentile: number): StaffOutlook => {
  if (percentile <= 24) return "limited";
  if (percentile <= 59) return "leagueLevel";
  if (percentile <= 79) return "leadingLeague";
  return "aboveLeague";
};

/**
 * The outlook band a visible OVR falls into - the single source of the
 * thresholds, shared by the report, the floor and anything that has to reason
 * about band boundaries. A second copy of these numbers anywhere would be a
 * second definition of what "zawodnik niższej ligi" means.
 */
export const staffOutlookFromOvr = (ovr: number): StaffOutlook =>
  percentileToOutlook(ovrToBasePercentile(ovr));

/**
 * How often each confidence appears once `high` is off the table, by seasons
 * left before the peak.
 *
 * `high` is no longer drawn at all. It is EARNED: a `current` report reads
 * visible OVR and is exact, and a `potential` report may claim it only behind
 * a visible gate (a season from the peak, or three observed seasons) AND an
 * internal guarantee that the whole conservative peak range falls inside one
 * band. So this table hands out the two remaining levels directly rather than
 * renormalising the old three - hand-picked, with more weight on `low` than a
 * plain renormalisation would give, because a report that can no longer say
 * "high" should not silently promote every one of those readings to "medium".
 *
 * Still keyed only on years-to-peak, which follows from visible age and
 * position. Given what the reader can already see, the confidence label stays
 * independent of the draw: confidence never depends on the draw.
 *
 * Exactly one rng.next() in every branch, so the stream length is fixed.
 */
const NO_HIGH_CONFIDENCE_ODDS: readonly { within: number; low: number }[] = [
  // A season from his peak, a player has all but finished becoming whatever he
  // was going to be, and "niska pewność" there would be the scout saying he
  // cannot read a player standing in front of him.
  { within: 1, low: 0 },
  { within: 3, low: 0.41 },
  { within: 5, low: 0.5 },
  { within: Infinity, low: 0.55 },
];

const drawConfidence = (rng: Rng, yearsLeft: number): StaffConfidence => {
  const roll = rng.next();
  const odds =
    NO_HIGH_CONFIDENCE_ODDS.find((entry) => yearsLeft <= entry.within) ??
    at(NO_HIGH_CONFIDENCE_ODDS, NO_HIGH_CONFIDENCE_ODDS.length - 1, "no-high-confidence fallback");
  return roll < odds.low ? "low" : "medium";
};

/** Confidence is a one-way ladder: it may rise between seasons, never fall. */
const CONFIDENCE_LADDER: Record<StaffConfidence, number> = { low: 0, medium: 1, high: 2 };

const higherConfidence = (a: StaffConfidence, b: StaffConfidence): StaffConfidence =>
  CONFIDENCE_LADDER[a] >= CONFIDENCE_LADDER[b] ? a : b;

/** Band order, so a verdict's movement between seasons can be counted. */
const OUTLOOK_STEP: Record<StaffOutlook, number> = {
  limited: 0,
  leagueLevel: 1,
  leadingLeague: 2,
  aboveLeague: 3,
};

const OUTLOOK_BY_STEP: readonly StaffOutlook[] = [
  "limited",
  "leagueLevel",
  "leadingLeague",
  "aboveLeague",
];

/**
 * How far a verdict may move, given the confidence of the REMEMBERED report.
 *
 * The direction matters and is easy to get backwards: it is the confidence the
 * club had LAST time that limits how far its mind may change now, not the
 * confidence of the fresh draw. A staff that said "we are sure" last season
 * does not get to quietly rewrite that because this season's observation
 * happened to land elsewhere.
 */
const MAX_OUTLOOK_STEPS: Record<StaffConfidence, number> = { low: 2, medium: 1, high: 0 };

const capOutlook = (
  remembered: StaffOutlook,
  drawn: StaffOutlook,
  confidence: StaffConfidence
): StaffOutlook => {
  const limit = MAX_OUTLOOK_STEPS[confidence];
  const anchor = OUTLOOK_STEP[remembered];
  return at(
    OUTLOOK_BY_STEP,
    clamp(OUTLOOK_STEP[drawn], anchor - limit, anchor + limit),
    "capped outlook step"
  );
};

/**
 * Seasons the club has been able to watch this player, counting the report
 * being produced right now.
 *
 * One helper, two callers - the report's tenure gate and the memo the reducer
 * writes - so the two can never disagree about what "three seasons" means.
 * Deliberately NOT re-derived from wKlubieOd anywhere else: wKlubieOd is a
 * display field that dates the arrival, and a starting squad carries 0 while
 * its first report belongs to season 1.
 */
export const observedSeasons = (memo: StaffMemo | null, reportSeason: number): number => {
  if (memo === null) return 1;
  if (memo.season >= reportSeason) return memo.seasonsObserved;
  return memo.seasonsObserved + (reportSeason - memo.season);
};

/** The two visible gates that let a potential report claim `high` at all. */
const TENURE_SEASONS_FOR_HIGH = 3;
const YEARS_TO_PEAK_FOR_HIGH = 1;

/**
 * Draw an observed percentile around a base value with noise radius dependent on confidence.
 * Confidence determines the radius in percentage points:
 * - high: 32 pp
 * - medium: 56 pp
 * - low: 96 pp
 *
 * The interval is pre-clamped to [max(3, basePercentile - radius), min(99, basePercentile + radius)]
 * before drawing, then a uniform draw is taken from that clamped interval.
 * This ensures no artificial pile-up at boundaries 3 or 99.
 */
const drawObservedPercentile = (
  rng: Rng,
  basePercentile: number,
  confidence: StaffConfidence,
  radiusScale: number
): number => {
  const base = confidence === "high" ? 32 : confidence === "medium" ? 56 : 96;
  const radius = base * radiusScale;
  const min = Math.max(3, basePercentile - radius);
  const max = Math.min(99, basePercentile + radius);
  return min + rng.next() * (max - min);
};

/**
 * Create a staff assessment for a player, given what the club already
 * remembers about him.
 *
 * The fourth argument is REQUIRED and has no default. A default would produce
 * exactly today's behaviour with no signal that a caller had forgotten it -
 * the trap `formation` set in squad.ts, where four call sites silently rated a
 * club on a fifth of its squad.
 *
 * Only `period.season` is read. The window deliberately left the identity of
 * an opinion: summer and winter are no longer two independent observations of
 * the same player, and neither are the scout and the coach. `source` still
 * names who is speaking, because the card says so; it no longer changes what
 * is said.
 */
export const createStaffAssessment = (
  player: Player,
  period: ReportPeriod,
  source: StaffSource,
  memo: StaffMemo | null
): StaffAssessment => {
  const pos = player.poz;
  const age = player.wiek;
  const focus = determineFocus(age, pos);
  const observed = observedSeasons(memo, period.season);

  // The shortcut belongs to the potential report only. A player who has just
  // reached peakStart reports his CURRENT level, read deterministically from
  // visible OVR - handing him a remembered potential verdict would keep a
  // teenager's projection on screen after it stopped being the question.
  //
  // Focus FIRST, then the shortcut. Never the other way round.
  if (focus === "potential" && memo !== null && memo.season === period.season) {
    // Handed back verbatim, not recomputed. The remembered verdict was itself
    // produced by capping a draw against the PREVIOUS memo; capping it a
    // second time against its own result would move it again inside one
    // season - and position-reports.tsx rebuilds this report on every render,
    // so it would be visible immediately.
    return {
      source,
      focus,
      outlook: memo.outlook,
      confidence: memo.confidence,
      isFirstObservation: memo.seasonsObserved === 1,
    };
  }

  if (focus === "current") {
    return {
      source,
      focus,
      outlook: staffOutlookFromOvr(player.ovr),
      confidence: "high",
      isFirstObservation: observed === 1,
    };
  }

  const yearsLeft = yearsToPeak(age, pos);
  const range = peakOvrRange(player);
  const lowBand = staffOutlookFromOvr(range.minOvr);
  // The one place a `potential` report is allowed to consult the ceiling
  // beyond the noisy channel: when the WHOLE conservative range of future OVR
  // falls inside one band, the staff can name that band and be right. This is
  // a deliberate widening of the closed catalogue - a noiseless signal, paid
  // for by a visible gate and measured separately - not an accident.
  const guaranteed = lowBand === staffOutlookFromOvr(range.maxOvr);
  const gateOpen = yearsLeft <= YEARS_TO_PEAK_FOR_HIGH || observed >= TENURE_SEASONS_FOR_HIGH;
  // Checked BEFORE the remembered cap, and it outranks it for the same reason
  // the OVR floor does: this is a proof, not an observation. The freeze exists
  // so a noisy draw cannot overturn a confident verdict; a range that provably
  // ends inside one band is not a noisy draw, and a frozen verdict contradicting
  // it would be wrong rather than merely cautious.
  if (gateOpen && guaranteed) {
    return {
      source,
      focus,
      outlook: lowBand,
      confidence: "high",
      isFirstObservation: observed === 1,
    };
  }

  // Two streams, never one. A shared stream would couple confidence to the
  // observation through nothing but the order of rng.next() calls, and that
  // coupling is precisely the leak the independence rule exists to stop.
  const confidenceRng = createRng(deriveSeed(player.id, period.season, "staff-confidence-v2"));
  const outlookRng = createRng(deriveSeed(player.id, period.season, "staff-outlook-v2"));

  const confidence = higherConfidence(
    drawConfidence(confidenceRng, yearsLeft),
    memo?.confidence ?? "low"
  );

  const basePercentile = ceilingToBasePercentile(
    reachableLevel(player.ovr, player.sufit, age, pos)
  );
  const observedPercentile = drawObservedPercentile(
    outlookRng,
    basePercentile,
    confidence,
    yearsToPeakScale(age, pos)
  );
  const drawn = percentileToOutlook(observedPercentile);

  // Order is the rule, and the first draft of this plan had it backwards:
  // cap against the REMEMBERED verdict first, and only then apply the floor.
  const capped = memo === null ? drawn : capOutlook(memo.outlook, drawn, memo.confidence);

  // The observation may never claim less than the player has already shown.
  //
  // The noise radii are wide on purpose - they are what stops the report being
  // a ceiling read-out - but nothing stopped a draw landing below the player's
  // CURRENT level, and then the card said "zawodnik niższej ligi" beside a
  // visible 66. The floor OUTRANKS the freeze and may push through it: a
  // verdict frozen at "limited" beside a visible 74 is a wrong signal, not a
  // confident one.
  //
  // Leaks nothing: the floor is computed from the OVR already on screen, so it
  // adds no information about sufit. It can only ever raise.
  const floor = staffOutlookFromOvr(player.ovr);
  const outlook = OUTLOOK_STEP[floor] > OUTLOOK_STEP[capped] ? floor : capped;

  return { source, focus, outlook, confidence, isFirstObservation: observed === 1 };
};

/** The memo a freshly produced report becomes once the club writes it down. */
export const staffMemoOf = (
  assessment: StaffAssessment,
  season: number,
  previous: StaffMemo | null
): StaffMemo => ({
  season,
  outlook: assessment.outlook,
  confidence: assessment.confidence,
  seasonsObserved: observedSeasons(previous, season),
});

/**
 * The club's memory for a squad at a given season.
 *
 * Three things at once, and all three have to happen together: players who
 * have left lose their entry (nothing reads it any more, and keeping it only
 * grows the save), players already remembered for THIS season keep what they
 * have (so a signing inherits the scout's card verdict verbatim rather than
 * being re-rolled), and everyone else gets this season's report.
 */
export const rememberSquad = (
  memory: Readonly<Record<string, StaffMemo>>,
  squad: readonly Player[],
  season: number
): Record<string, StaffMemo> => {
  const next: Record<string, StaffMemo> = {};
  for (const player of squad) {
    const previous = memory[player.id] ?? null;
    if (previous !== null && previous.season === season) {
      next[player.id] = previous;
      continue;
    }
    const assessment = createStaffAssessment(
      player,
      { season, window: "summer" },
      "coach",
      previous
    );
    next[player.id] = staffMemoOf(assessment, season, previous);
  }
  return next;
};

export type StaffOutlookBoundaryReason = "currentUp" | "currentDown" | "potentialFloorUp";

/**
 * Why a high-confidence verdict might still move by one band - or null when it
 * would not.
 *
 * Takes the finished assessment and the visible OVR, never the Player: the
 * helper must not be able to reach `sufit` even by accident, and the tooltip
 * it feeds explains general mechanics rather than this player's prospects.
 */
export const staffOutlookBoundaryReason = (
  assessment: Pick<StaffAssessment, "confidence" | "focus" | "outlook">,
  currentOvr: number
): StaffOutlookBoundaryReason | null => {
  if (assessment.confidence !== "high") return null;

  const currentBand = staffOutlookFromOvr(currentOvr);
  if (assessment.focus === "potential") {
    // BOTH conditions, not just the second. The first proves the frozen
    // forecast is sitting exactly on today's floor; the second that +1 lifts
    // that floor into the next band. Checking only whether +1 differs from the
    // outlook would warn about OVR 62 under a remembered "leadingLeague",
    // where the new floor "leagueLevel" still does not reach the forecast.
    return assessment.outlook === currentBand && staffOutlookFromOvr(currentOvr + 1) !== currentBand
      ? "potentialFloorUp"
      : null;
  }

  if (assessment.outlook !== currentBand) return null;
  if (staffOutlookFromOvr(currentOvr + 1) !== currentBand) return "currentUp";
  if (staffOutlookFromOvr(currentOvr - 1) !== currentBand) return "currentDown";
  return null;
};
