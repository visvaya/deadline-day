import type { LeagueStanding } from "../data/types";
import { simulateMatch, type MatchRating } from "./match";
import type { Rng } from "./rng";
import { at } from "./invariant";

export type Fixture = { home: string; away: string };
export type PlayedMatch = Fixture & { homeGoals: number; awayGoals: number };

/**
 * Double round robin by the circle method: club 0 stays fixed, the rest
 * rotate. Deterministic and rng-free - the randomness that keeps a player
 * from meeting the same opponents in the same order every season lives in
 * the caller, which shuffles `clubs` once per season.
 *
 * The home/away flip in the second half is what guarantees each pair meets
 * once at each ground; the alternating flip inside the first half keeps any
 * single club from playing seventeen straight matches at home.
 */
export const buildFixtures = (clubs: readonly string[]): Fixture[][] => {
  const count = clubs.length;
  if (count < 2 || count % 2 !== 0) {
    throw new Error(`buildFixtures: expected an even club count, got ${count}`);
  }

  const rotation = clubs.slice(1);
  const rounds: Fixture[][] = [];

  const spokes = count - 1;

  for (let round = 0; round < spokes; round += 1) {
    const matches: Fixture[] = [];
    // The fixed club meets rotation[round]; the remaining pairs are mirrored
    // around that index. Taking rotation[round] here (and NOT an offset of
    // it) is what keeps the fixed club's opponent out of the mirrored pairs
    // below - an off-by-one here silently double-books one club per round.
    const opponent = at(rotation, round % spokes, "buildFixtures opponent");
    const fixed = at(clubs, 0, "buildFixtures fixed club");
    // The fixed club alternates ends each round, otherwise it would be at
    // home in every single one of the first seventeen.
    matches.push(
      round % 2 === 0 ? { home: fixed, away: opponent } : { home: opponent, away: fixed }
    );

    for (let slot = 1; slot < count / 2; slot += 1) {
      const first = at(rotation, (round + slot) % spokes, "buildFixtures paired club");
      const second = at(rotation, (round - slot + spokes) % spokes, "buildFixtures paired club");
      matches.push(slot % 2 === 0 ? { home: first, away: second } : { home: second, away: first });
    }
    rounds.push(matches);
  }

  const secondHalf = rounds.map((round) =>
    round.map((match) => ({ home: match.away, away: match.home }))
  );
  return [...rounds, ...secondHalf];
};

export const emptyStandings = (clubs: readonly string[]): LeagueStanding[] =>
  clubs.map((club) => ({ club, points: 0, goalsFor: 0, goalsAgainst: 0 }));

/**
 * Plays the given rounds and returns NEW standings - the input is never
 * mutated, so the caller can keep the half-season table around.
 *
 * Draw order is part of the golden contract: rounds in order, matches within
 * a round in fixture order, home goals before away goals.
 */
export const playRounds = (
  rng: Rng,
  rounds: readonly Fixture[][],
  ratings: ReadonlyMap<string, MatchRating>,
  standings: readonly LeagueStanding[],
  onMatch?: (_match: PlayedMatch) => void
): LeagueStanding[] => {
  const byClub = new Map(standings.map((row) => [row.club, { ...row }]));

  for (const round of rounds) {
    for (const fixture of round) {
      const homeRating = ratings.get(fixture.home);
      const awayRating = ratings.get(fixture.away);
      if (!homeRating || !awayRating) {
        throw new Error(`playRounds: no rating for ${fixture.home} or ${fixture.away}`);
      }
      const home = byClub.get(fixture.home);
      const away = byClub.get(fixture.away);
      if (!home || !away) {
        throw new Error(`playRounds: no standing for ${fixture.home} or ${fixture.away}`);
      }

      const { homeGoals, awayGoals } = simulateMatch(rng, homeRating, awayRating);
      onMatch?.({ ...fixture, homeGoals, awayGoals });
      home.goalsFor += homeGoals;
      home.goalsAgainst += awayGoals;
      away.goalsFor += awayGoals;
      away.goalsAgainst += homeGoals;
      if (homeGoals > awayGoals) home.points += 3;
      else if (awayGoals > homeGoals) away.points += 3;
      else {
        home.points += 1;
        away.points += 1;
      }
    }
  }

  return [...byClub.values()];
};

/** Points, then goal difference, then goals scored, then club name. The last
 * tiebreak exists so the order never depends on sort stability. Head-to-head,
 * which the real Ekstraklasa uses first, is deliberately not modelled: it
 * would mean carrying every pair's result for a whole season. */
export const sortStandings = (standings: readonly LeagueStanding[]): LeagueStanding[] =>
  [...standings].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor ||
      // Locale pinned, not defaulted. localeCompare() with no locale reads the
      // machine's, and Polish diacritics collate differently under English
      // rules - "ŁKS" lands in a different place. The golden traces are
      // compared byte for byte across machines, so an unpinned collation is a
      // trace that diverges for a reason nobody would find.
      //
      // Not hypothetical, and not rare enough to ignore: in the real 2022/23
      // Ekstraklasa, after round 17, Lech and Widzew were level on points,
      // goal difference AND goals scored - this comparison decided the order.
      // "pl" is what this machine already resolved to, so no trace moves.
      a.club.localeCompare(b.club, "pl")
  );
