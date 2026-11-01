/**
 * Staff and analyst reports for a player already in the user's squad.
 *
 * The generators themselves are shared with offers - this module only supplies
 * the inputs an offer gets from `rollOffer` and a squad player has nowhere to
 * get from:
 *
 * - the source is always `coach`. A scout watches players elsewhere; the
 *   coach is the one who sees this player every day.
 * - the analyst context is the user's own club, exactly as it is for SPRZEDAZ
 *   and PRZEDLUZENIE offers, and it is computed from `baseSquadStrength` -
 *   never `squadStrength`. Feeding the hidden marketEdge back in would let a
 *   player's own edge shift the report that reveals it.
 *
 * Pure and RNG-free at the call site: both generators seed themselves from
 * deriveSeed(id, season, window, ...), so opening, closing and switching
 * between players draws nothing and cannot move the main stream. Within one
 * season and window the same player always reads the same.
 */

import type {
  AnalystReport,
  Formation,
  Player,
  PlayingTime,
  ReportPeriod,
  StaffAssessment,
  StaffMemo,
} from "../data/types";
import { FORM_ROTATION_SLOTS } from "../data/balance";
import { analystContextTier } from "./analyst-context";
import { createAnalystReport } from "./analyst-report";
import { createStaffAssessment } from "./staff-assessment";
import { baseSquadStrength, startingXi, substitutes } from "./squad";

/**
 * How much football each player in the squad actually gets.
 *
 * The same three tiers ageSquad uses for season form: the automatic XI, then
 * FORM_ROTATION_SLOTS substitutes, then everyone else. Sharing the definition
 * is the point - the minutes a player reads in his report and the minutes
 * that move his development have to mean the same thing.
 *
 * Built once for the whole squad, not per player: startingXi and substitutes
 * both sort the entire roster.
 */
export const squadPlayingTime = (
  squad: readonly Player[],
  formation: Formation
): ReadonlyMap<string, PlayingTime> => {
  const byPlayer = new Map<string, PlayingTime>();
  for (const player of startingXi(squad, formation)) byPlayer.set(player.id, "starter");
  substitutes(squad, formation).forEach((player, index) => {
    byPlayer.set(player.id, index < FORM_ROTATION_SLOTS ? "rotation" : "reserve");
  });
  return byPlayer;
};

export type SquadReports = {
  staffAssessment: StaffAssessment;
  analystReport: AnalystReport;
};

/**
 * The club context every report in one squad review shares. Computed once by
 * the caller and passed down, rather than recomputed per row: it aggregates
 * the whole squad, and a position list can be a dozen rows long.
 *
 * Deliberately NOT the european-cup-weighted strength. The analyst context is
 * a statement about the level a player is being watched at, and it has to
 * match what an offer for the same player would use.
 */
export const squadReportContextOvr = (squad: readonly Player[], formation: Formation): number =>
  baseSquadStrength(squad, null, formation);

/**
 * Both reports for one player in the squad, for the given season and window.
 */
export const createSquadReports = (
  player: Player,
  period: ReportPeriod,
  contextOvr: number,
  playingTime: PlayingTime,
  /** What the club already remembers about him. Required, never defaulted:
   * a default would silently restart the confidence chain every render. */
  memo: StaffMemo | null
): SquadReports => ({
  staffAssessment: createStaffAssessment(player, period, "coach", memo),
  analystReport: createAnalystReport(player, period, analystContextTier(contextOvr), playingTime),
});
