import type { LeagueStanding, SuperCupOutcome } from "../data/types";
import { simulateMatch, type MatchRating } from "./match";
import type { Rng } from "./rng";

/**
 * The Polish Super Cup: champion against cup winner, or against the runner-up
 * when one club won both.
 *
 * Resolved only when the player's own club is involved - a match nobody
 * watches would burn draws for nothing, the same reasoning that keeps
 * resolveEuropeanRun behind a `currentCup` check.
 *
 * Draw order: the match itself (two poisson draws, variable), then one more
 * draw for penalties if it ended level. The champion is treated as the home
 * side; the real fixture is on neutral ground, but the engine needs a home
 * side and giving it to the champion is the closest thing to holder's
 * advantage the model can express.
 */
export const resolveSuperCup = (
  rng: Rng,
  tabela: readonly LeagueStanding[],
  polishCupWinner: string,
  playerShort: string,
  ratings: ReadonlyMap<string, MatchRating>
): SuperCupOutcome | null => {
  const champion = tabela[0]?.club;
  if (!champion) return null;
  const challenger = polishCupWinner === champion ? tabela[1]?.club : polishCupWinner;
  if (!challenger) return null;
  if (playerShort !== champion && playerShort !== challenger) return null;

  const championRating = ratings.get(champion);
  const challengerRating = ratings.get(challenger);
  if (!championRating || !challengerRating) {
    throw new Error(`resolveSuperCup: no rating for ${champion} or ${challenger}`);
  }

  const { homeGoals, awayGoals } = simulateMatch(rng, championRating, challengerRating);
  const championWon = homeGoals === awayGoals ? rng.next() < 0.5 : homeGoals > awayGoals;
  const playerIsChampion = playerShort === champion;

  return {
    opponent: playerIsChampion ? challenger : champion,
    won: playerIsChampion ? championWon : !championWon,
  };
};
