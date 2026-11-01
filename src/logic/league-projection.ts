import { CLUBS, ratingForClubId } from "../data/clubs";
import { expectedPlace, expectedSeasonPoints } from "./expected-points";
import type { MatchRating } from "./match";

/**
 * Where a club is expected to finish and how many points it is expected to
 * take, from nothing but the eighteen clubs' rating snapshot - no squad, no
 * transfers, no RNG.
 *
 * This is the sporting half of the career baseline: a player choosing a club
 * before ever touching a squad still needs to know whether that club is a
 * contender or a relegation candidate, and `TEAM_RATINGS` already carries
 * that answer for every one of the eighteen.
 */
export type ClubProjection = {
  readonly clubId: string;
  readonly expectedPlace: number;
  readonly expectedSeasonPoints: number;
};

const toMatchRating = (clubId: string): MatchRating => {
  const rating = ratingForClubId(clubId);
  return { attack: rating.attack, defence: rating.defence };
};

/**
 * Built once as a module constant, not recomputed per lookup: ranking one
 * club against the other seventeen means every club's own projection needs
 * everybody else's rating anyway, so a table built once and read many times
 * does the same work as eighteen independent calls would, in a fraction of
 * the arithmetic.
 */
const buildLeagueProjection = (): readonly ClubProjection[] => {
  const clubRatings = CLUBS.map((club) => ({
    clubId: club.clubId,
    rating: toMatchRating(club.clubId),
  }));
  return clubRatings.map(({ clubId, rating }) => {
    const opponents = clubRatings
      .filter((other) => other.clubId !== clubId)
      .map((other) => other.rating);
    return {
      clubId,
      expectedPlace: expectedPlace(rating, opponents),
      expectedSeasonPoints: expectedSeasonPoints(rating, opponents),
    };
  });
};

const LEAGUE_PROJECTION: readonly ClubProjection[] = buildLeagueProjection();

/** The whole eighteen-club table, built once at module init and handed back
 * by reference every time - two calls are not just equal, they are the same
 * array. */
export const initialLeagueProjection = (): readonly ClubProjection[] => LEAGUE_PROJECTION;

/** One club's row from the same table. Throws on an unknown id rather than
 * returning undefined, for the same reason `clubById` does: a silently
 * missing projection would show up as a balance result, not an error. */
export const initialClubProjection = (clubId: string): ClubProjection => {
  const found = LEAGUE_PROJECTION.find((projection) => projection.clubId === clubId);
  if (!found) throw new Error(`initialClubProjection: unknown club id "${clubId}"`);
  return found;
};
