import { RATING_OVR_REFERENCE, RATING_OVR_SCALE } from "../data/balance";
import { TEAM_RATINGS } from "../data/team-ratings";
import type { ClubRecord, EuropeanCup, Formation, LeagueMembership, Player } from "../data/types";
import type { MatchRating } from "./match";
import { currentRating } from "./league-membership";
import { squadRatings } from "./squad";

/** The attack/defence pair the snapshot gives this club. Throws rather than
 * guessing: a playable club with no rating would silently get a squad built
 * for someone else, and tests/data/roster-ratings.test.ts already guarantees
 * every club has one. */
export const clubRating = (club: ClubRecord): MatchRating => {
  const rated = TEAM_RATINGS.clubs.find((c) => c.krotko === club.shortName);
  if (!rated) throw new Error(`clubRating: no snapshot rating for ${club.shortName}`);
  return { attack: rated.attack, defence: rated.defence };
};

/** The single ovr number a club's two ratings average out to - the level a
 * mid-table position in this squad sits at. Replaces the hand-written
 * Club.sila everywhere a scalar was needed, most importantly as the shift on
 * an academy debutant's ceiling. */
export const clubOvr = (rating: MatchRating): number =>
  RATING_OVR_REFERENCE + RATING_OVR_SCALE * Math.log(Math.sqrt(rating.attack * rating.defence));

/** The whole league, with the player's own club rated from their squad
 * instead of from the snapshot.
 *
 * The membership is an argument rather than a module-level constant because
 * the league changes between seasons: promotion and relegation move clubs in
 * and out, and a forecast computed on last season's eighteen would be wrong
 * in a way nothing would report.
 *
 * The formation is not optional in practice, only in the type: without it
 * squadRatings falls back to the prototype's eight position codes, picks
 * whichever five of a modern squad happen to overlap them, and rates the
 * club off half a team. That understated Lech by 8% and Rakow by 9%, which
 * is more than the gap between first and sixth. */
export const leagueRatings = (
  kadra: readonly Player[],
  cup: EuropeanCup | null,
  klubKrotko: string,
  formation: Formation,
  membership: LeagueMembership
): Map<string, MatchRating> => {
  const inLeague = membership.clubs.filter((c) => c.tier === "league");
  if (!inLeague.some((c) => c.shortName === klubKrotko)) {
    throw new Error(`leagueRatings: "${klubKrotko}" is not in the top flight`);
  }
  const ratings = new Map<string, MatchRating>();
  for (const club of inLeague) {
    if (club.shortName === klubKrotko) continue;
    ratings.set(club.shortName, currentRating(club));
  }
  ratings.set(klubKrotko, squadRatings(kadra, cup, formation));
  return ratings;
};
