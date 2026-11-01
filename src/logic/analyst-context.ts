/**
 * Club-quality context tier classification for analyst reports.
 *
 * Context tier determines the baseline quality percentile for observations:
 * - bottom: -4pp quality shift
 * - mid: 0pp baseline (no shift)
 * - top: +4pp quality shift
 *
 * Two functions:
 * 1. analystContextTier: Classify a club OVR into tier
 * 2. pickSourceClub: Draw the club an offered player comes from, and return
 *    its tier alongside the name the card prints
 */

import { LOWER_LEAGUE_SOURCE_SHARE } from "../data/balance";
import type { AnalystContextTier, LeagueClub, LeagueMembership } from "../data/types";
import { currentRating } from "./league-membership";
import { clubOvr } from "./league-ratings";
import type { Rng } from "./rng";
import { at } from "./invariant";

/**
 * Classify a club's OVR into analyst context tier.
 * Thresholds: bottom < 63, mid [63, 67), top >= 67.
 */
export const analystContextTier = (ovr: number): AnalystContextTier => {
  if (ovr < 63) return "bottom";
  if (ovr < 67) return "mid";
  return "top";
};

/**
 * The club an offered player comes from, drawn from the live league.
 *
 * Two draws, in this order, and the order is part of the golden contract:
 * first the tier (LOWER_LEAGUE_SOURCE_SHARE of offers come from the pool),
 * then the club within it.
 *
 * Replaced a deriveSeed(player.id, ...) derivation on 2026-08-25. The club
 * has to be known BEFORE the player exists now, because it decides how good
 * he is - and a seed derived from his id cannot be read before he has one.
 */
export const pickSourceClub = (
  rng: Rng,
  membership: LeagueMembership,
  userClubId: string
): { clubOvr: number; contextTier: AnalystContextTier; clubName: string } => {
  const own = (c: LeagueClub) => c.clubId === userClubId;
  const pool = membership.clubs.filter((c) => c.tier === "pool" && !own(c));
  const league = membership.clubs.filter((c) => c.tier === "league" && !own(c));

  const fromPool = rng.next() < LOWER_LEAGUE_SOURCE_SHARE && pool.length > 0;
  const candidates = fromPool ? pool : league;
  if (candidates.length === 0) {
    throw new Error(`pickSourceClub: no club available besides ${userClubId}`);
  }
  // The second draw always happens, even when the first already chose the
  // pool. One draw per decision is what keeps the golden trace readable.
  const club = at(candidates, Math.floor(rng.next() * candidates.length), "analyst source club");

  const ovrValue = clubOvr(currentRating(club));
  return {
    clubOvr: ovrValue,
    contextTier: analystContextTier(ovrValue),
    clubName: club.name,
  };
};
