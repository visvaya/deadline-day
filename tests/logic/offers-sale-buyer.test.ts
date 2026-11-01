import { describe, expect, test } from "vitest";

import type {
  Market,
  Offer,
  OfferReportContext,
  OfferType,
  Player,
  PositionCode,
} from "../../src/data/types";
import type { LeagueMembership } from "../../src/data/types";
import { FORMACJE } from "../../src/data/positions";
import { domesticCandidates, FOREIGN_CANDIDATES } from "../../src/logic/buyers";
import { startingMembership } from "../../src/logic/league-membership";
import { rollOfferCandidate } from "../../src/logic/offers";
import { createRng } from "../../src/logic/rng";

/**
 * Proves the buyer-capacity activation (spec step 7): a SPRZEDAZ card names a
 * qualified buyer, the buyer's own quote is what the card prints, and the
 * generator still spends exactly the draws it always did.
 */

const quietMarket: Market = {
  BR: "spokoj",
  LO: "spokoj",
  ŚO: "spokoj",
  PO: "spokoj",
  CLS: "spokoj",
  CPS: "spokoj",
  ŚPD: "spokoj",
  ŚP: "spokoj",
  LP: "spokoj",
  PP: "spokoj",
  ŚPO: "spokoj",
  LS: "spokoj",
  PS: "spokoj",
  CN: "spokoj",
  N: "spokoj",
  POM: "spokoj",
  ŚN: "spokoj",
};

const makeTestPlayer = (id: string, poz: PositionCode, ovr: number, wiek: number): Player => ({
  id,
  nazwa: `Gracz ${id}`,
  poz,
  wiek,
  ovr,
  sufit: ovr,
  moj: true,
  cenaZakupu: null,
  ageAtSigning: null,
  mnoznikPlacy: 1,
  wKlubieOd: 0,
  kontraktOd: 0,
  wygasa: false,
});

/** One fixed squad covering every position the 4-3-3 formation uses, so the
 * generator always finds a same-position candidate. Never rebuilt per call:
 * the whole point is that the same kadra faces every seed. */
const FIXED_SQUAD: Player[] = [
  makeTestPlayer("p-br", "BR", 65, 26),
  makeTestPlayer("p-lo", "LO", 62, 24),
  makeTestPlayer("p-so1", "ŚO", 68, 27),
  makeTestPlayer("p-so2", "ŚO", 60, 22),
  makeTestPlayer("p-po", "PO", 63, 25),
  makeTestPlayer("p-spd", "ŚPD", 66, 23),
  makeTestPlayer("p-sp", "ŚP", 70, 26),
  makeTestPlayer("p-spo", "ŚPO", 61, 21),
  makeTestPlayer("p-ls", "LS", 64, 24),
  makeTestPlayer("p-n", "N", 72, 28),
  makeTestPlayer("p-ps", "PS", 59, 20),
];

/** Stand-in user club for every fixture below, kept out of every candidate
 * pool by construction: domesticCandidates excludes the user's own club, so
 * no club bids against itself. */
export const USER_CLUB_ID = "gornik-zabrze";

const buildContext = (membership: LeagueMembership): OfferReportContext => ({
  period: { season: 1, window: "summer" },
  userClubId: USER_CLUB_ID,
  currentClubOvr: 65,
  membership,
  staffMemory: {},
});

/** Forces the generator's card type without disturbing the draw order: the
 * type-selection draw still happens (see offers.ts's own comment), only the
 * result is overridden. */
export const forcedCard = (
  seed: number,
  typ: OfferType,
  membership: LeagueMembership = startingMembership()
): Offer =>
  rollOfferCandidate(
    createRng(seed),
    FIXED_SQUAD,
    quietMarket,
    FORMACJE["4-3-3"],
    buildContext(membership),
    false,
    0,
    1,
    typ
  );

export const forcedSale = (
  seed: number,
  membership: LeagueMembership = startingMembership()
): Offer => forcedCard(seed, "SPRZEDAZ", membership);

export const drawsForForcedSale = (seed: number): number => {
  const rng = createRng(seed);
  const before = rng.draws();
  rollOfferCandidate(
    rng,
    FIXED_SQUAD,
    quietMarket,
    FORMACJE["4-3-3"],
    buildContext(startingMembership()),
    false,
    0,
    1,
    "SPRZEDAZ"
  );
  return rng.draws() - before;
};

/**
 * Measured on c8eb6b6cea363c1a58a203a5e3ee5effd0992060 (Task 5's HEAD, before
 * this activation touched offers.ts), with `rollOfferCandidate` temporarily
 * exported and this same helper shape: one draw for the type roll, one for
 * the position, one for the player, one for the old `rand(1.0, 1.6)` price
 * deviation, one for `pick(rng, buyers(...))`. Constant across 400 seeds.
 */
const DRAWS_ON_OLD_GENERATOR = 5;

describe("a SPRZEDAZ card's buyer", () => {
  test("names a qualified buyer and carries its quote", () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const offer = forcedSale(seed);
      expect(offer.buyer).not.toBeNull();
      const b = offer.buyer!;
      expect(b.clubId).not.toBe(USER_CLUB_ID);
      const known =
        b.origin === "foreign"
          ? FOREIGN_CANDIDATES.find((c) => c.clubId === b.clubId)
          : domesticCandidates(startingMembership(), USER_CLUB_ID).find(
              (c) => c.clubId === b.clubId
            );
      expect(known?.name).toBe(b.name);
      expect(offer.cena).toBeLessThanOrEqual(known!.maxOffer);
    }
  });

  test("non-sale cards carry no buyer", () => {
    for (const typ of ["KUPNO", "WOLNY", "PANIC", "PRZEDLUZENIE"] as const) {
      expect(forcedCard(7, typ).buyer).toBeNull();
    }
  });

  test("a sale card replaces exactly the two old draws", () => {
    expect(drawsForForcedSale(99)).toBe(DRAWS_ON_OLD_GENERATOR);
  });

  test("a reversed membership literal yields the same buyer for the same seed", () => {
    const membership = startingMembership();
    const reversed = { clubs: [...membership.clubs].reverse() };
    for (let seed = 1; seed <= 50; seed += 1) {
      expect(forcedSale(seed, reversed).buyer).toEqual(forcedSale(seed, membership).buyer);
    }
  });
});
