import { TEAM_RATINGS } from "./team-ratings";
import type { ClubRecord, TeamRating } from "./types";

// ClubRecord itself lives in ./types.ts, not here - this file must stay
// importable by data/types.ts without creating a cycle back to itself.

/**
 * The eighteen clubs a career can start at - the canonical starting-league
 * catalogue. Finances, european berths and anything else club-shaped are
 * joined to these by id rather than copied in here: a table that has to be
 * edited in two places drifts in one of them.
 *
 * Ordered to match the historical RYWALE constant this file replaces (see
 * `startingMembership` in `src/logic/league-membership.ts`), not by
 * difficulty and not by TEAM_RATINGS: the reducer shuffles the league to
 * build the fixture list, and a differently ordered array gives a different
 * schedule from the same draws. Reordering this array is therefore a
 * behaviour change, not a cosmetic one.
 *
 * `colors` is deliberately absent. design-system.md describes crests and
 * shirts as drawn from a club's colour pair, but no such data exists in the
 * repo yet - the crest is a monogram - so there is nothing to carry over,
 * and inventing eighteen unsourced pairs here would put data into the game
 * that nothing verified.
 */
export const CLUBS: readonly ClubRecord[] = [
  {
    clubId: "lech-poznan",
    name: "Lech Poznań",
    shortName: "Lech",
    character:
      "Najmocniejsza kadra, zdrowa nadwyżka i obrona mistrzostwa połączona z eliminacjami Ligi Mistrzów.",
  },
  {
    clubId: "legia-warszawa",
    name: "Legia Warszawa",
    shortName: "Legia",
    character:
      "Największe przychody ligi dają ogromny margines finansowy, choć kadra jest prognozowana tylko do walki o czołówkę.",
  },
  {
    clubId: "rakow-czestochowa",
    name: "Raków Częstochowa",
    shortName: "Raków",
    character: "Kadra na walkę o tytuł i stabilne finanse, do tego eliminacje Ligi Konferencji.",
  },
  {
    clubId: "jagiellonia-bialystok",
    name: "Jagiellonia Białystok",
    shortName: "Jagiellonia",
    character: "Kadra górnej połowy, zdrowy bilans i start w eliminacjach Ligi Europy.",
  },
  {
    clubId: "pogon-szczecin",
    name: "Pogoń Szczecin",
    shortName: "Pogoń",
    character: "Kadra na górną połowę i wysokie przychody zostawiają duży margines na przebudowę.",
  },
  {
    clubId: "gornik-zabrze",
    name: "Górnik Zabrze",
    shortName: "Górnik",
    character:
      "Mocna kadra i eliminacje Ligi Mistrzów przy skromnym przychodzie i lekkim deficycie.",
  },
  {
    clubId: "cracovia",
    name: "Cracovia",
    shortName: "Cracovia",
    character:
      "Solidna obrona i bilans bliski zera wymagają ostrożności u progu nowej ery prywatnego właściciela.",
  },
  {
    clubId: "widzew-lodz",
    name: "Widzew Łódź",
    shortName: "Widzew",
    character:
      "Pieniądze właściciela zbudowały kadrę na podium, a własne przychody są w górnej połowie ligi.",
  },
  {
    clubId: "slask-wroclaw",
    name: "Śląsk Wrocław",
    shortName: "Śląsk",
    character:
      "Kadra do walki o utrzymanie i bilans bliski zera w miejskim klubie po szybkim powrocie.",
  },
  {
    clubId: "piast-gliwice",
    name: "Piast Gliwice",
    shortName: "Piast",
    character:
      "Słaba kadra, zwłaszcza w obronie, i lekki deficyt to wyzwanie dla klubu pod miejską kontrolą.",
  },
  {
    clubId: "radomiak-radom",
    name: "Radomiak Radom",
    shortName: "Radomiak",
    character:
      "Najniższa prognoza sportowa i znaczny deficyt przy jednym z najniższych przychodów ligi.",
  },
  {
    clubId: "korona-kielce",
    name: "Korona Kielce",
    shortName: "Korona",
    character:
      "Nowy właściciel już wzmocnił kadrę środka tabeli, lecz niski przychód zostawia znaczny deficyt.",
  },
  {
    clubId: "motor-lublin",
    name: "Motor Lublin",
    shortName: "Motor",
    character:
      "Wyrównana kadra i bilans bliski zera, przy właścicielu budującym klub bez finansowej szarży.",
  },
  {
    clubId: "zaglebie-lubin",
    name: "Zagłębie Lubin",
    shortName: "Zagłębie",
    character:
      "Słaby atak i bilans bliski zera mimo przychodu z górnej połowy oraz stabilnego zaplecza KGHM.",
  },
  {
    clubId: "wisla-plock",
    name: "Wisła Płock",
    shortName: "Wisła P.",
    character:
      "Niezła obrona, lecz najniższy przychód i najgłębszy deficyt mimo miejskiego właściciela oraz ORLENU i Budmatu.",
  },
  {
    clubId: "wisla-krakow",
    name: "Wisła Kraków",
    shortName: "Wisła K.",
    character:
      "Ofensywny profil, słaba obrona i niewielka nadwyżka w sezonie powrotu do Ekstraklasy.",
  },
  {
    clubId: "gks-katowice",
    name: "GKS Katowice",
    shortName: "GKS",
    character:
      "Kadra środka tabeli ma znaczny deficyt, który może zmniejszyć udana kampania w Lidze Konferencji.",
  },
  {
    clubId: "wieczysta-krakow",
    name: "Wieczysta Kraków",
    shortName: "Wieczysta",
    character:
      "Pieniądze głównego sponsora zbudowały kosztowną kadrę; niski przychód i niedojrzałe zaplecze tworzą deficyt.",
  },
];

/**
 * Resolves a club by id. Everything outside this file that needs a club
 * record joins on the id it already holds - the finance, cup and match
 * tables among them - so a miss or an ambiguity is thrown rather than
 * returned as null: a club silently priced as somebody else, or as nobody,
 * would show up as a balance result, which is the one place it would be
 * hardest to notice.
 */
export const clubById = (clubId: string): ClubRecord => {
  const matches = CLUBS.filter((club) => club.clubId === clubId);
  const [first, ...rest] = matches;
  if (first === undefined || rest.length > 0) {
    throw new Error(`Unknown or ambiguous club id "${clubId}": ${matches.length} matches`);
  }
  return first;
};

/**
 * Resolves a club by its display short name. Short names are unique within
 * CLUBS (see tests/data/clubs.test.ts), so this is a safe lookup rather than
 * a guess - but it throws on a miss or an ambiguity for the same reason
 * `clubById` does.
 */
export const clubByShortName = (shortName: string): ClubRecord => {
  const matches = CLUBS.filter((club) => club.shortName === shortName);
  const [first, ...rest] = matches;
  if (first === undefined || rest.length > 0) {
    throw new Error(
      `Unknown or ambiguous club short name "${shortName}": ${matches.length} matches`
    );
  }
  return first;
};

/**
 * The bridge from the career model's short name to the join column the
 * finance and cup tables use.
 *
 * A transitional bridge, not a second dictionary: `GameState` still carries
 * only a short name (`Club.krotko`), and removing this dependency is a later
 * task once every consumer reads `state.club.clubId` directly. Until then
 * everything that needs a club id from a short name comes through here.
 */
export const clubIdForShortName = (shortName: string): string => clubByShortName(shortName).clubId;

/**
 * The match rating snapshot for a club, looked up by id.
 *
 * Two hops - id to short name, short name to rating - rather than a copy of
 * attack/defence in CLUBS. The snapshot is regenerated by `pnpm sync:ratings`
 * and a copy here would be stale from the first refresh, silently, since
 * nothing compares the two.
 */
export const ratingForClubId = (clubId: string): TeamRating => {
  const club = clubById(clubId);
  const matches = TEAM_RATINGS.clubs.filter((rating) => rating.krotko === club.shortName);
  const [first, ...rest] = matches;
  if (first === undefined) {
    throw new Error(`No rating for club ${clubId} (short name "${club.shortName}")`);
  }
  if (rest.length > 0) {
    throw new Error(`Ambiguous rating for club ${clubId}: ${matches.length} snapshot rows`);
  }
  return first;
};
