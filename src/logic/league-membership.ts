import { PROMOTION_BONUS, PROMOTION_WEIGHT_T, RELEGATION_PENALTY } from "../data/balance";
import { CLUBS } from "../data/clubs";
import { FIRST_DIVISION } from "../data/first-division";
import { TEAM_RATINGS } from "../data/team-ratings";
import type { LeagueClub, LeagueMembership } from "../data/types";
import type { MatchRating } from "./match";
import type { Rng } from "./rng";
import { at } from "./invariant";

/**
 * The top flight's short names in ascending clubId order - the input the
 * fixture shuffle runs over.
 *
 * Why an explicit order at all: `shuffle` is Fisher-Yates, so the same rng
 * draws over a differently ordered input give a different permutation. The
 * membership array mirrors the CLUBS literal, which would make a UI-motivated
 * reorder a hidden seed for every match result (2026-09-14).
 *
 * Why clubId and not the short name (2026-09-22): a short name is display
 * data. Sorting by it meant renaming "Wisla K." re-ordered the season. Every
 * club, promoted ones included, carries a clubId since the buyer-capacity
 * plan, so identity decides the order and the name only labels it.
 *
 * Returns short names because the season table and fixture list are keyed
 * by them.
 */
export const leagueFixtureOrder = (membership: LeagueMembership): string[] =>
  membership.clubs
    .filter((c) => c.tier === "league")
    .sort((a, b) => (a.clubId < b.clubId ? -1 : a.clubId > b.clubId ? 1 : 0))
    .map((c) => c.shortName);

/**
 * The rating this club actually plays at, derived rather than stored.
 *
 * Each tier change multiplies by its own factor, so a round trip leaves the
 * club at 0.9975 of where it started - see PROMOTION_BONUS. Deriving instead
 * of rewriting is what keeps the base honest: the asymmetry and the name
 * survive any number of swaps.
 *
 * The club's current tier and the parity of its swap count together say where
 * it started, so a club promoted out of the pool is stronger, not weaker.
 */
export const currentRating = (club: LeagueClub): MatchRating => {
  // Where the club is NOW plus the parity of its swaps says where it began,
  // so this works for a club that started in the pool as well as one that
  // started in the league. Assuming everyone started in the league - the
  // first draft's mistake - gave a promoted pool club 0.95 instead of 1.05.
  const promotions =
    club.tier === "league" ? Math.ceil(club.swaps / 2) : Math.floor(club.swaps / 2);
  const relegations = club.tier === "pool" ? Math.ceil(club.swaps / 2) : Math.floor(club.swaps / 2);
  const factor = PROMOTION_BONUS ** promotions * RELEGATION_PENALTY ** relegations;
  return { attack: club.baseAttack * factor, defence: club.baseDefence * factor };
};

/**
 * The eighteen the game starts from, plus the pool below.
 *
 * Ordered by CLUBS, not by TEAM_RATINGS. This order no longer reaches the
 * fixture list - the reducer shuffles `leagueFixtureOrder` (above), not
 * this array - but `pickSourceClub` and `drawPromoted`'s pool order still
 * depend on it, so reordering it still moves those draws. The sale offers'
 * buyers are sorted by clubId (src/logic/buyers.ts), not by this array.
 */
export const startingMembership = (): LeagueMembership => {
  // TEAM_RATINGS keeps its own field names (krotko/nazwa); LeagueClub uses
  // English ones. This is the seam between the two.
  const rated = new Map(TEAM_RATINGS.clubs.map((c) => [c.krotko, c]));
  const league: LeagueClub[] = CLUBS.map((club) => {
    const c = rated.get(club.shortName);
    if (!c) throw new Error(`startingMembership: no snapshot rating for ${club.shortName}`);
    return {
      clubId: club.clubId,
      name: c.nazwa,
      shortName: c.krotko,
      baseAttack: c.attack,
      baseDefence: c.defence,
      tier: "league" as const,
      swaps: 0,
    };
  });
  const pool: LeagueClub[] = FIRST_DIVISION.map((c) => ({
    clubId: c.clubId,
    name: c.name,
    shortName: c.shortName,
    baseAttack: c.strength,
    baseDefence: c.strength,
    tier: "pool" as const,
    swaps: 0,
  }));
  return { clubs: [...league, ...pool] };
};

/**
 * Which clubs come up, drawn without replacement with weight
 * exp((strength - max) * T), where strength is the geometric mean of the
 * club's CURRENT rating - so a club that has bounced before is weighted at
 * what it is now, not at what it once was.
 *
 * All three places are drawn the same way, including the one the real league
 * settles by play-off. Modelling the play-off explicitly - two weighted draws
 * plus a flat one among the best of the rest - was measured and rejected: it
 * lands 2.2 pp from a full simulated season against 1.0 pp for the plain
 * draw, because the play-off field is itself filled by the strong, so
 * flattening it hands mid-table clubs promotions they do not win. The truth
 * model behind those figures already includes the play-off; reproducing its
 * OUTCOME is what matters here, not its shape.
 *
 * Subtracting the maximum is mathematically neutral - it cancels in the
 * normalisation - but keeps the weights near one instead of exp(0.883 * 20),
 * about 4.4e7.
 *
 * Draw order is part of the golden contract: one value per slot, in order,
 * scanning the pool from the front.
 */
export const drawPromoted = (
  rng: Rng,
  pool: readonly LeagueClub[],
  count: number
): LeagueClub[] => {
  const strengthOf = (c: LeagueClub) => {
    const r = currentRating(c);
    return Math.sqrt(r.attack * r.defence);
  };
  const remaining = [...pool];
  const drawn: LeagueClub[] = [];
  const max = Math.max(...pool.map(strengthOf));

  for (let i = 0; i < count && remaining.length > 0; i += 1) {
    const weights = remaining.map((c) => Math.exp((strengthOf(c) - max) * PROMOTION_WEIGHT_T));
    const sum = weights.reduce((a, b) => a + b, 0);
    let roll = rng.next() * sum;
    let idx = remaining.length - 1;
    for (let j = 0; j < remaining.length; j += 1) {
      roll -= at(weights, j, "drawPromoted weight");
      if (roll < 0) {
        idx = j;
        break;
      }
    }
    drawn.push(at(remaining, idx, "drawPromoted candidate"));
    remaining.splice(idx, 1);
  }
  return drawn;
};

/**
 * End of season: some clubs down, the same number up.
 *
 * The order is the whole point. The promoted are drawn from the pool AS IT
 * STOOD during the season that just finished; only afterwards does anyone
 * change tier. Reversed, a club can be relegated and promoted again for the
 * same next season.
 *
 * Nothing is rewritten but `tier` and `swaps` - base ratings and names
 * survive untouched, and currentRating derives the rest.
 */
export const swapTiers = (
  rng: Rng,
  membership: LeagueMembership,
  relegated: readonly string[]
): LeagueMembership => {
  const goingDown = new Set(relegated);
  // 1. Draw from the pool as it was, before anyone joins it.
  const pool = membership.clubs.filter((c) => c.tier === "pool");
  const promoted = new Set(drawPromoted(rng, pool, relegated.length).map((c) => c.shortName));

  // 2. Only now does anyone change tier.
  return {
    clubs: membership.clubs.map((c) => {
      if (goingDown.has(c.shortName)) return { ...c, tier: "pool" as const, swaps: c.swaps + 1 };
      if (promoted.has(c.shortName)) return { ...c, tier: "league" as const, swaps: c.swaps + 1 };
      return c;
    }),
  };
};
