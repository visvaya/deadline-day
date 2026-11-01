import type { SquadSlot } from "../../logic/squad";
import { AGE_PROFILES, AGE_PROFILE_DEFAULT } from "../../data/balance";

export type AgeTrend = { glyph: "▲" | "≈" | "▼" | "·"; label: string };

export const getAgeTrend = (player: SquadSlot): AgeTrend => {
  if ("brak" in player || player.wiek == null || player.poz == null)
    return { glyph: "·", label: "brak danych o wieku" };

  const { peakStart, peakEnd } = AGE_PROFILES[player.poz] ?? AGE_PROFILE_DEFAULT;
  if (player.wiek < peakStart) return { glyph: "▲", label: "wiek poniżej szczytu" };
  if (player.wiek > peakEnd) return { glyph: "▼", label: "wiek powyżej szczytu" };
  return { glyph: "≈", label: "w szczytowej formie" };
};

/**
 * Which reading of the seasonal delta a screen is showing.
 *
 * `fresh` is the one place a delta is coloured: the squad overview in the
 * summer window, the first screen a player sees after development ran. `past`
 * is everywhere else it appears - the winter window, and every offer screen in
 * either window - where the same number is shown without the coding. Colour is
 * an interruption, and a growth already read once is not worth a second one;
 * once a season is enough. Product owner's call, 2026-08-22.
 *
 * `unknown` is season 1, where no season has been played and there is nothing
 * to know yet.
 */
export type SeasonChangePeriod = "fresh" | "past" | "unknown";

export type SeasonChangeBadge = {
  text: string;
  marker?: "•";
  tone: string;
  label: string;
};

/**
 * Where a delta is being shown, which is half of what decides its period. The
 * squad overview is the one screen that colours; an offer screen shows the
 * same numbers quietly whichever window it is in.
 */
export type SeasonChangeSurface = "squadOverview" | "offer";

/**
 * The reading to show, from the window and the screen showing it.
 *
 * Deliberately not derived from the delta's own season: ovrChange.season
 * trails the current season in both of that season's windows, so comparing
 * the two marked the summer window as history and no delta was ever coloured.
 */
export const seasonChangePeriod = (
  step: { sezon: number; tura: "lato" | "zima" },
  surface: SeasonChangeSurface
): SeasonChangePeriod => {
  if (step.sezon === 1) return "unknown";
  return surface === "squadOverview" && step.tura === "lato" ? "fresh" : "past";
};

/**
 * The delta as one glyph-wide cell, always present so a column of ratings
 * reads down the page instead of jumping.
 *
 * Three outcomes rather than two, because "did not move" and "we have no
 * reading" are different facts and collapsing them into a blank cell said
 * neither: `0` for a player the last pass measured and found unchanged, `?`
 * for one it never measured, and the signed number for one it did. Only the
 * signed number is ever coloured - zero has no direction and a question mark
 * has no value, so painting either would be decoration.
 *
 * Shared by the tile, the position report and the offer card, so the three
 * cannot drift apart on the sign or on which cases get a colour.
 *
 * `0` and `?` carry a leading bullet where a sign would be. A rating reads
 * glyph, age, ovr, delta, so the left of the number always has two things
 * against it and the right only one - and at one character the delta was
 * shorter still, tipping the whole cell left. The bullet holds the sign
 * column with less visual weight than an underscore. It is rendered as
 * aria-hidden decoration; the aria-label spells the case out in full either
 * way.
 */
export const seasonChangeBadge = (
  change: number | undefined,
  period: SeasonChangePeriod,
  measured: boolean
): SeasonChangeBadge => {
  if (period === "unknown" || !measured)
    return { text: "?", marker: "•", tone: "is-neutral", label: "brak danych o zmianie oceny" };
  if (!change)
    return {
      text: "0",
      marker: "•",
      tone: "is-neutral",
      label: "ocena bez zmian od poprzedniego sezonu",
    };
  const text = change > 0 ? `+${change}` : String(change).replace("-", "−");
  return {
    text,
    tone: period === "past" ? "is-neutral" : change > 0 ? "is-up" : "is-down",
    label: `zmiana oceny od poprzedniego sezonu: ${text}`,
  };
};

/**
 * Whether the last development pass could have measured this player at all.
 *
 * A player who joined after that season ended was never in the squad when
 * the pass ran, so his missing entry means "no reading", not "no change".
 * That includes an academy debutant called up at the season end: the
 * reducer dates him from the season ahead for exactly this reason.
 */
export const wasMeasured = (joinedInSeason: number, changeSeason: number): boolean =>
  joinedInSeason <= changeSeason;

export const getOvrTone = (ovr: number | null): string =>
  ovr == null ? "is-empty" : ovr <= 62 ? "is-negative" : ovr <= 70 ? "is-warning" : "is-positive";
