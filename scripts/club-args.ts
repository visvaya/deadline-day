import { CLUBS } from "../src/data/clubs";
import { at } from "../src/logic/invariant";

/**
 * Shared club-argument resolution for every CLI in `scripts/` that takes a
 * club by name: `--clubs` here, but also legacy-scan's `--handicaps` keys and
 * anything else that lets an operator type a club on the command line.
 *
 * Split out of balance-cli.ts so european-cups-careers.ts and legacy-scan.ts
 * can share the same resolution rules without importing the balance CLI's
 * policy tables along with them.
 */

/** Every club a career can start at - the canonical eighteen. */
export const ACTIVE_CLUBS: readonly string[] = CLUBS.map((club) => club.clubId);

/**
 * Resolves a command-line club argument to its canonical id. Accepts the id
 * itself (already normalised, returned unchanged) or a unique short display
 * name (`Legia`, `Wisła K.`). Throws rather than guessing on a miss or an
 * ambiguity - a typo that silently produced a smaller matrix would look like
 * a completed run.
 */
export const resolveClubArg = (value: string): string => {
  const byId = CLUBS.find((club) => club.clubId === value);
  if (byId) return byId.clubId;
  const byShortName = CLUBS.filter((club) => club.shortName === value);
  if (byShortName.length === 1) return at(byShortName, 0, "club by short name").clubId;
  if (byShortName.length > 1) {
    throw new Error(`Ambiguous club short name "${value}": ${byShortName.length} matches`);
  }
  throw new Error(`Unknown club "${value}". Known clubs: ${ACTIVE_CLUBS.join(", ")}`);
};
