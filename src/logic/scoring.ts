import type { SeasonHistoryEntry, Verdict } from "../data/types";
import { PROGI_WERDYKTU, VERDICT_KASA, VERDICT_SPADEK, VERDICT_TROFEUM } from "../data/balance";
import { CLUBS, clubById } from "../data/clubs";
import { FOREIGN_CLUB_NAMES } from "../data/foreign-clubs";
import { initialLeagueProjection } from "./league-projection";
import { pick, type Rng } from "./rng";
import { at, mapAt } from "./invariant";

const WYKUPIONY_KLUBY = ["Lech", "Legia", "Raków"] as const;

/** The top clubs that can buy the player out, minus the player's own - the
 * same exclusion `lowerTableClubShortNames` applies to its list. */
const topClubShortNames = (playerClubId: string): readonly string[] => {
  const ownShortName = clubById(playerClubId).shortName;
  return WYKUPIONY_KLUBY.filter((name) => name !== ownShortName);
};

/**
 * The six lowest-projected clubs in the whole eighteen, by expected finish -
 * derived from `league-projection.ts` rather than from the old `trudny`
 * difficulty pool, which no longer exists.
 *
 * Sorted descending by expected place (worst finish first), ties broken
 * ascending by expected points, then by `CLUBS`'s own order - and only THEN
 * is the player's own club excluded. The cut is taken from the full
 * projected table first, so the bottom six is a stable property of the
 * league rather than something that shifts depending on who the player
 * picked; removing the player's own club afterwards simply leaves five
 * names when it happens to sit in that six, which is the intended
 * behaviour.
 */
export const lowerTableClubShortNames = (playerClubId: string): readonly string[] => {
  const clubOrder = new Map(CLUBS.map((club, index) => [club.clubId, index]));
  const sorted = [...initialLeagueProjection()].sort((a, b) => {
    if (a.expectedPlace !== b.expectedPlace) return b.expectedPlace - a.expectedPlace;
    if (a.expectedSeasonPoints !== b.expectedSeasonPoints) {
      return a.expectedSeasonPoints - b.expectedSeasonPoints;
    }
    return mapAt(clubOrder, a.clubId, "club order") - mapAt(clubOrder, b.clubId, "club order");
  });
  return sorted
    .slice(0, 6)
    .filter((projection) => projection.clubId !== playerClubId)
    .map((projection) => clubById(projection.clubId).shortName);
};

/**
 * Mirrors prototype's policzWerdykt :486-509 (pure part - excludes the
 * eventsRef push and setState calls, which stay in the caller), extended per
 * the 2026-08-09 UI redesign: every
 * branch but ROZWIĄZANIE KONTRAKTU now names the club that comes calling, so
 * `rng` is threaded through three of the four branches instead of one. Each
 * branch draws only when it actually returns - hoisting all three names
 * above the ifs would shift the RNG stream in every scenario instead of just
 * the ones landing on that branch.
 */
export const computeVerdict = (
  rng: Rng,
  historia: readonly SeasonHistoryEntry[],
  kasa: number,
  tenureHandicap: number,
  playerClubId: string
): Verdict => {
  const pkt = historia.reduce((s, h) => s + h.pkt, 0);
  const trofea = historia.filter((h) => h.puchar).length + historia.filter((h) => h.mistrz).length;
  const spadki = historia.filter((h) => h.spadek).length;
  const ocena = Math.round(
    pkt + trofea * VERDICT_TROFEUM + kasa * VERDICT_KASA - spadki * VERDICT_SPADEK
  );
  const h = tenureHandicap;
  const progRozwiazanie = at(PROGI_WERDYKTU, 0, "verdict threshold: rozwiazanie");
  const progDol = at(PROGI_WERDYKTU, 1, "verdict threshold: dol");
  const progCzolowka = at(PROGI_WERDYKTU, 2, "verdict threshold: czolowka");

  if (spadki > 0 || ocena < progRozwiazanie - h) {
    return {
      tytul: "ROZWIĄZANIE KONTRAKTU",
      opis: "Zarząd rozwiązuje umowę ze skutkiem natychmiastowym.",
      ocena,
    };
  }
  if (ocena < progDol - h) {
    return {
      tytul: "KLUB Z DOŁU TABELI",
      opis: `${pick(rng, lowerTableClubShortNames(playerClubId))} szuka kogoś, kto poukłada im kadrę. Nie jest to awans, ale telefon zadzwonił.`,
      ocena,
    };
  }
  if (ocena < progCzolowka - h) {
    return {
      tytul: "KLUB Z CZOŁÓWKI",
      // The player's own club never buys them out of its own contract. Still
      // exactly one draw either way - only the pool shrinks, so the RNG
      // stream after the verdict is unchanged.
      opis: `${pick(rng, topClubShortNames(playerClubId))} wykupuje cię z kontraktu.`,
      ocena,
    };
  }
  return {
    tytul: "KLUB Z ZAGRANICY",
    opis: `Dzwoni ${pick(rng, FOREIGN_CLUB_NAMES)}. Podpisujesz tego samego dnia.`,
    ocena,
  };
};
