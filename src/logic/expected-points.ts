import { expectedGoals, type MatchRating } from "./match";
import { at } from "./invariant";

/** At the current maximum lambda (~2.29), the omitted probability above
 * ten goals is 0.00286%, so stopping here is immaterial to season estimates. */
const MAX_GOALS = 10;

/**
 * Probability of 0..MAX_GOALS goals at this lambda, built in one pass.
 *
 * Each entry is the previous one times lambda/k - exactly the sequence of
 * multiplications the old per-k loop performed, in exactly the same order,
 * so every value is bit-identical to what it produced. That identity is what
 * lets this optimisation leave the golden master untouched.
 */
const pmfTable = (lambda: number): number[] => {
  const table = new Array<number>(MAX_GOALS + 1);
  let value = Math.exp(-lambda);
  table[0] = value;
  for (let k = 1; k <= MAX_GOALS; k += 1) {
    value *= lambda / k;
    table[k] = value;
  }
  return table;
};

/**
 * Expected points for both sides of one fixture, from a single score
 * distribution. A match between two clubs has one distribution regardless of
 * whose points we are reading off it, so computing it twice - once per club -
 * was doing half the work for nothing.
 */
const fixturePoints = (home: MatchRating, away: MatchRating): { home: number; away: number } => {
  const lambda = expectedGoals(home, away);
  const homeTable = pmfTable(lambda.home);
  const awayTable = pmfTable(lambda.away);

  let homeWin = 0;
  let awayWin = 0;
  let draw = 0;
  for (let scored = 0; scored <= MAX_GOALS; scored += 1) {
    const pScored = at(homeTable, scored, "pmf home table");
    for (let conceded = 0; conceded <= MAX_GOALS; conceded += 1) {
      const p = pScored * at(awayTable, conceded, "pmf away table");
      if (scored > conceded) homeWin += p;
      else if (scored === conceded) draw += p;
      else awayWin += p;
    }
  }
  return { home: homeWin * 3 + draw, away: awayWin * 3 + draw };
};

/** Expected points from one match, summed over every plausible scoreline.
 * No rng - this is the closed form of what simulateMatch samples. */
const expectedMatchPoints = (team: MatchRating, opponent: MatchRating, home: boolean): number =>
  home ? fixturePoints(team, opponent).home : fixturePoints(opponent, team).away;

/** Expected points over a full double round robin against these opponents. */
export const expectedSeasonPoints = (
  team: MatchRating,
  opponents: readonly MatchRating[]
): number =>
  opponents.reduce(
    (total, opponent) =>
      total +
      expectedMatchPoints(team, opponent, true) +
      expectedMatchPoints(team, opponent, false),
    0
  );

/**
 * Where this team is expected to finish, 1 being best. Every club's expected
 * points are computed against the same field, then ranked. Replaces the old
 * linear expectedPlace(strength), which knew nothing about who else is in
 * the league.
 */
export const expectedPlace = (team: MatchRating, opponents: readonly MatchRating[]): number => {
  const league = [team, ...opponents];
  const n = league.length;

  // Points[i][j] is what club i takes from its home match with j; away[i][j]
  // is what it takes at j's ground. Both fall out of one fixturePoints call,
  // so each of the n*(n-1)/2 pairs is evaluated once instead of four times.
  const homePoints = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const awayPoints = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    const rowHome = at(homePoints, i, "expectedPlace home points row");
    const rowAway = at(awayPoints, i, "expectedPlace away points row");
    for (let j = i + 1; j < n; j += 1) {
      const clubI = at(league, i, "expectedPlace league club");
      const clubJ = at(league, j, "expectedPlace league club");
      const colHome = at(homePoints, j, "expectedPlace home points row");
      const colAway = at(awayPoints, j, "expectedPlace away points row");
      const atI = fixturePoints(clubI, clubJ);
      rowHome[j] = atI.home;
      colAway[i] = atI.away;
      const atJ = fixturePoints(clubJ, clubI);
      colHome[i] = atJ.home;
      rowAway[j] = atJ.away;
    }
  }

  // Summation order matches expectedSeasonPoints exactly - opponents in array
  // order, home before away - so the totals are bit-identical to the
  // straightforward computation and the ranking cannot drift.
  const total = (i: number): number => {
    const rowHome = at(homePoints, i, "expectedPlace home points row");
    const rowAway = at(awayPoints, i, "expectedPlace away points row");
    let sum = 0;
    for (let j = 0; j < n; j += 1) {
      if (j === i) continue;
      sum += at(rowHome, j, "expectedPlace home points cell");
      sum += at(rowAway, j, "expectedPlace away points cell");
    }
    return sum;
  };

  const own = total(0);
  let better = 0;
  for (let i = 1; i < n; i += 1) if (total(i) > own) better += 1;
  return 1 + better;
};
