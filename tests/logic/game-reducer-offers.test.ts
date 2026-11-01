import { expect, test } from "vitest";

import { gameReducer } from "../../src/logic/game-reducer";
import type { Formation, Offer, Player } from "../../src/data/types";
import { startingMembership } from "../../src/logic/league-membership";
import { CLUBS } from "../../src/data/clubs";
import { initialState } from "../../src/logic/game-state";
import { autoAdvance, playHeadless } from "../golden/headless";
import { alwaysPass, alwaysTake } from "../../src/logic/simulate-policies";
import {
  MAX_DISPLAYABLE_OFFER_ATTEMPTS,
  isExternalSigningType,
  selectDisplayableOffer,
} from "../../src/logic/offers";
import { acquisitionCapacityOutcome, formationOf } from "../../src/logic/squad";
import { domesticCandidates, FOREIGN_CANDIDATES } from "../../src/logic/buyers";
import { SQUAD_BENCH_BUFFER } from "../../src/data/balance";
import { makeTestPlayer, testClub, testManager } from "./fixtures";
import { driveGame, rollManyOffers } from "./offer-walk";

const clubShortNames = CLUBS.map((club) => club.shortName);

/**
 * The SPRZEDAZ buyer read the RYWALE constant until 2026-09-03, then the
 * live membership's "league" tier until the buyer-capacity activation
 * (Task 7). Buyer-capacity broadens the domestic pool to every club the
 * finance manifest can price - top flight or not - plus a foreign pool, so
 * "is a current league club" is no longer the invariant; "is a qualified
 * candidate the card's own price would allow" is.
 *
 * Checked against the live membership rather than against the starting
 * eighteen (CLUBS), because a stale read is exactly the bug this test used
 * to catch. The careers below are played far enough for promotion and
 * relegation to have moved the league, which the second assertion pins.
 */
test("a sale offer names a qualified buyer, drawn from the live membership", () => {
  let checked = 0;
  let sawChangedLeague = false;
  let sawNonLeagueBuyer = false;

  for (let seed = 0x7000_0001; seed <= 0x7000_0006; seed += 1) {
    driveGame(seed, (state) => {
      const card = state.karta!;
      if (card.typ !== "SPRZEDAZ") return "pass";

      expect(card.buyer).not.toBeNull();
      const buyer = card.buyer!;
      expect(buyer.clubId).not.toBe(state.club!.clubId);

      const known =
        buyer.origin === "foreign"
          ? FOREIGN_CANDIDATES.find((c) => c.clubId === buyer.clubId)
          : domesticCandidates(state.membership, state.club!.clubId).find(
              (c) => c.clubId === buyer.clubId
            );
      expect(known?.name).toBe(buyer.name);

      const shortNames = state.membership.clubs
        .filter((club) => club.tier === "league")
        .map((club) => club.shortName);
      if (shortNames.some((short) => !clubShortNames.includes(short))) sawChangedLeague = true;
      if (buyer.origin === "domestic" && !shortNames.includes(buyer.name)) {
        sawNonLeagueBuyer = true;
      }

      checked += 1;
      return "pass";
    });
  }

  expect(checked).toBeGreaterThan(20);
  expect(sawChangedLeague).toBe(true);
  // Confirms the broadened pool is actually exercised, not merely permitted:
  // some drawn buyer is a domestic club currently outside the top flight.
  expect(sawNonLeagueBuyer).toBe(true);
});

/**
 * Proves Q6 is fixed: rollOffer must draw from the squad as it stands after
 * this dispatch's own decision, not the squad from before it. Before the
 * fix, a player sold earlier in a window could be offered for sale again in
 * the same window - decide()'s `filter(id !== ...)` against the stale squad
 * was then a no-op, so the second sale banked cash for a player who was
 * already gone (prototype quirk Q6).
 */
test("a sale offer always names a player currently in the squad", () => {
  let checked = 0;
  driveGame(0x5000_0001, (state) => {
    if (state.karta!.typ === "SPRZEDAZ") {
      checked += 1;
      expect(state.kadra.some((z) => z.id === state.karta!.zawodnik.id)).toBe(true);
    }
    return checked % 2 === 0 ? "take" : "pass";
  });

  expect(checked).toBeGreaterThan(0);
});

/**
 * PANIC exists to signal a desperate, overpriced move - it must never share
 * a card with an "obfity" (bargain) market reading, and it must only ever
 * appear as the window's last card, so it reads as a closing squeeze rather
 * than a random draw.
 */
test("PANIC only ever draws as a window's last card, never on an obfity position", () => {
  let panicSeen = 0;
  let panicOnLastCard = 0;
  let lastCardCount = 0;
  const typeCounts: Record<string, number> = { KUPNO: 0, SPRZEDAZ: 0, WOLNY: 0, PANIC: 0 };

  // Reseeded four times. First on 2026-08-23, both times because the
  // league moved under it: 0x5000_0002's career relegation now cuts short
  // after one season, then 0x5000_0003 played all five but drew no PANIC
  // once PROMOTION_WEIGHT_T went to 18. Reseeded again on 2026-09-14 (Task
  // 6A) when the fixture shuffle stopped reading the CLUBS literal's order
  // and the default test club changed from a random
  // "sredni" draw to a fixed club - both moved every career's cascade. PANIC
  // is a quarter of last cards, so a career can miss it entirely by luck -
  // this assertion needs a seed that actually sees one.
  //
  // Reseeded a fourth time on 2026-09-22 (buyer-capacity Task 7): commit
  // 4a4cd94 (2026-09-22, "order the fixture shuffle by clubId instead of
  // short name", the same day but a task earlier than the buyer-capacity
  // activation) moved the fixture permutation for 0x5000_0005 and left
  // PANIC and SPRZEDAZ tied at 5 apiece for that seed - verified by checking
  // out 4a4cd94's parent (c8eb6b6, Task 5's HEAD, before this task touched
  // offers.ts) into a throwaway worktree and re-running this exact walk:
  // already 5/5 there, so the tie predates the buyer-capacity generator
  // change and is not evidence that a SPRZEDAZ card's draw count moved. It
  // still consumes exactly the same five rng draws it always did (see
  // tests/logic/offers-sale-buyer.test.ts's DRAWS_ON_OLD_GENERATOR). Found
  // 0x5000_0006 by walking seeds upward from there; every assertion below
  // holds for it on the current generator.
  driveGame(0x5000_0006, (state) => {
    const isLastCard = state.ruchy === 1;
    if (isLastCard) lastCardCount += 1;
    typeCounts[state.karta!.typ]! += 1;

    if (state.karta!.typ === "PANIC") {
      panicSeen += 1;
      expect(isLastCard).toBe(true);
      panicOnLastCard += 1;
      expect(state.rynek[state.karta!.zawodnik.poz]).not.toBe("obfity");
    }
    return "pass";
  });

  expect(panicSeen).toBeGreaterThan(0);
  expect(panicOnLastCard).toBe(panicSeen);
  // n = 10 windows per game, so this is a loose sanity bound, not a
  // statistical estimate of the 25% design target.
  expect(panicSeen / lastCardCount).toBeGreaterThan(0.05);
  expect(panicSeen / lastCardCount).toBeLessThan(0.6);
  expect(typeCounts.PANIC).toBeLessThan(typeCounts.KUPNO!);
  expect(typeCounts.PANIC).toBeLessThan(typeCounts.SPRZEDAZ!);
});

/**
 * Staff assessment source must map offer types correctly:
 * - KUPNO, PANIC, WOLNY → "scout"
 * - SPRZEDAZ, PRZEDLUZENIE → "coach"
 */
test("staff assessment source matches offer type mapping", () => {
  let checked = 0;
  driveGame(0x5000_0000, (state) => {
    const offer = state.karta!;
    checked += 1;

    if (offer.typ === "SPRZEDAZ" || offer.typ === "PRZEDLUZENIE") {
      expect(offer.staffAssessment.source).toBe("coach");
    } else {
      // KUPNO, PANIC, WOLNY all map to "scout"
      expect(offer.staffAssessment.source).toBe("scout");
    }

    return "pass";
  });

  expect(checked).toBeGreaterThan(0);
});

/**
 * Section 12 of the brief asks for the age AT PURCHASE next to the fee, and
 * the final screen has been showing the player's current age instead - a
 * twenty-year-old signing reads as twenty-eight by the time the ceilings are
 * revealed. Nothing recorded the transfer age until now.
 */
test("a signing records how old the player was when we bought him", () => {
  const { state } = playHeadless({ seed: 5, clubId: testClub.clubId, policy: alwaysTake });
  const bought = state.kadra.filter((z) => z.moj && z.cenaZakupu !== null);

  expect(bought.length).toBeGreaterThan(0);
  for (const z of bought) {
    expect(z.ageAtSigning, `${z.nazwa} bez wieku przy zakupie`).not.toBeNull();
    // He can only have aged since, never got younger.
    expect(z.ageAtSigning!).toBeLessThanOrEqual(z.wiek);
  }
});

test("a player nobody bought has no purchase age", () => {
  const { state } = playHeadless({ seed: 5, clubId: testClub.clubId, policy: alwaysPass });
  const inherited = state.kadra.filter((z) => !z.moj);

  expect(inherited.length).toBeGreaterThan(0);
  expect(inherited.every((z) => z.ageAtSigning === null)).toBe(true);
});

/**
 * A club never bids for its own player.
 *
 * The buyer on a SPRZEDAZ card was drawn from RYWALE, which is all eighteen
 * clubs including the one the player manages - so a Wisla Krakow manager
 * could be told "Wisla K. oferuje 2,4 mln" for a player already his. The
 * name is the only thing that card gets wrong, which is exactly why nothing
 * caught it: the price, the player and the reports were all correct.
 *
 * Swept over every club rather than one, because the bug only shows when the
 * draw happens to land on the manager's own club - roughly one SPRZEDAZ card
 * in eighteen.
 */
test("a SPRZEDAZ card never names the player's own club as the buyer", () => {
  const seen: string[] = [];

  for (let seed = 1; seed <= 40; seed += 1) {
    let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
    state = gameReducer(state, {
      type: "START_CAREER",
      clubId: testClub.clubId,
      manager: testManager,
      seed,
    });
    const own = state.club!.shortName;

    for (let guard = 0; guard < 3000 && state.faza !== "final"; guard += 1) {
      const advanced = autoAdvance(state);
      if (advanced) {
        state = advanced;
        continue;
      }
      if (state.faza === "okno" && state.karta) {
        if (state.karta.typ === "SPRZEDAZ") {
          const buyer = state.karta.buyer?.name ?? "";
          seen.push(buyer);
          expect(buyer, `ziarno ${seed}, klub ${own}`).not.toBe(own);
        }
        state = gameReducer(state, { type: "DECIDE", choice: "pass" });
        continue;
      }
      throw new Error(`Stuck in phase "${state.faza}"`);
    }
  }

  // Guards the guard: if the walk stopped producing SPRZEDAZ cards, the
  // assertion above would pass by never running.
  expect(seen.length).toBeGreaterThan(100);
}, 60000);

test("an offer names its source club and the report agrees with it", () => {
  // The card and the analyst report must never point at different places -
  // they read one draw, not two.
  const offers = rollManyOffers(300);
  const external = offers.filter((o) => o.typ !== "SPRZEDAZ" && o.typ !== "PRZEDLUZENIE");

  expect(external.length).toBeGreaterThan(50);
  for (const offer of external) expect(offer.sourceClub).not.toBeNull();
}, 60000);

test("some offers come from outside the top flight", () => {
  const names = new Set(
    rollManyOffers(600)
      .map((o) => o.sourceClub)
      .filter((n): n is string => n !== null)
  );
  const pool = startingMembership()
    .clubs.filter((c) => c.tier === "pool")
    .map((c) => c.name);

  expect(pool.some((n) => names.has(n))).toBe(true);
}, 60000);

/**
 * The offer filter. A signing whose own player would immediately rank last
 * at his position is useless - accepting him would sign and release him in
 * the same move - so the generator must never put that card on screen.
 */

/** One card as it was shown, together with the squad and formation it was
 * drawn against. Each seed rolls its own formation, so a card can only be
 * judged against the wall it actually faced. */
type CardAgainstWall = { card: Offer; squad: Player[]; formation: Formation };

/** Walks careers whose squad is re-packed to the position limit before every
 * card, so the generator always faces a squad with no room left. `ovr` sets
 * how good the wall is: at 90 nobody drawn can beat it, at 75 some can. */
const cardsAgainstPackedSquad = (ovr: number, want: number): CardAgainstWall[] => {
  const seen: CardAgainstWall[] = [];
  for (let seed = 0x611_0000; seed < 0x611_0000 + 40 && seen.length < want; seed += 1) {
    let state = gameReducer(initialState(), { type: "START_GAME", manager: testManager });
    state = gameReducer(state, {
      type: "START_CAREER",
      clubId: testClub.clubId,
      manager: testManager,
      seed,
    });

    const formation = formationOf(state);
    const packed = formation.pozycje.flatMap((slot) =>
      Array.from({ length: slot.kadra + SQUAD_BENCH_BUFFER }, (_, index) =>
        makeTestPlayer(`packed-${slot.kod}-${index}`, {
          poz: slot.kod,
          ovr,
          wiek: 24,
          nazwa: `Zawodnik ${slot.kod}${index}`,
        })
      )
    );
    state = { ...state, kadra: packed };

    for (let guard = 0; guard < 3000 && seen.length < want; guard += 1) {
      const advanced = autoAdvance(state);
      if (advanced) {
        // Season rollover would develop and reshuffle the wall; re-pack so
        // every window keeps meeting a squad with no room anywhere.
        state = { ...advanced, kadra: packed };
        continue;
      }
      if (state.faza === "final") break;
      if (state.faza === "okno" && state.karta) {
        seen.push({ card: state.karta, squad: packed, formation });
        // Passing keeps the squad packed, so the next card is drawn against
        // a position that still has no room.
        state = { ...gameReducer(state, { type: "DECIDE", choice: "pass" }), kadra: packed };
        continue;
      }
      throw new Error(`Stuck in phase "${state.faza}"`);
    }
  }
  return seen;
};

test("no shown signing would immediately rank last at its own position", () => {
  // Left to natural play this case is vanishingly rare: the same walk passes
  // with the filter removed. Packing the squad to its limit is what gives the
  // test teeth. At 75 the drawn players straddle the wall, so real signings
  // still reach the screen and can be checked.
  const shown = cardsAgainstPackedSquad(75, 300);
  const signings = shown.filter((seen) => isExternalSigningType(seen.card.typ));

  for (const { card, squad, formation } of signings) {
    expect(
      acquisitionCapacityOutcome(squad, card.zawodnik, formation).kind,
      `${card.typ} ${card.zawodnik.poz} ${card.zawodnik.ovr}`
    ).not.toBe("rejectsIncoming");
  }

  expect(shown.length).toBeGreaterThanOrEqual(300);
  // Guards the guard: an assertion that never runs proves nothing.
  expect(signings.length).toBeGreaterThan(20);
}, 60000);

test("a squad nobody can improve is shown no signings at all", () => {
  // The filter's endpoint. Behind a wall of 90-OVR players every drawn
  // signing would rank last, so all twelve attempts are discarded and the
  // bounded fallback forces a sale. The player is never shown a transfer he
  // could not keep.
  const shown = cardsAgainstPackedSquad(90, 120);

  expect(shown.length).toBeGreaterThanOrEqual(120);
  expect(shown.filter((seen) => isExternalSigningType(seen.card.typ))).toEqual([]);
}, 60000);

test("isExternalSigningType is true for exactly the three outside cards", () => {
  expect(isExternalSigningType("KUPNO")).toBe(true);
  expect(isExternalSigningType("PANIC")).toBe(true);
  expect(isExternalSigningType("WOLNY")).toBe(true);
  expect(isExternalSigningType("SPRZEDAZ")).toBe(false);
  expect(isExternalSigningType("PRZEDLUZENIE")).toBe(false);
});

test("twelve useless cards are discarded and the thirteenth is a forced sale", () => {
  const forced: (string | undefined)[] = [];
  const offer = selectDisplayableOffer(
    (forcedType) => {
      forced.push(forcedType);
      return { typ: forcedType ?? "KUPNO" } as never;
    },
    // Every drawn card is useless; only the forced one escapes the verdict.
    (candidate) => (candidate as { typ: string }).typ !== "SPRZEDAZ"
  );

  expect(forced).toHaveLength(MAX_DISPLAYABLE_OFFER_ATTEMPTS + 1);
  expect(forced.slice(0, MAX_DISPLAYABLE_OFFER_ATTEMPTS).every((t) => t === undefined)).toBe(true);
  expect(forced.at(-1)).toBe("SPRZEDAZ");
  expect(offer.typ).toBe("SPRZEDAZ");
});

test("a useful card on the third attempt ends the loop at once", () => {
  let draws = 0;
  const offer = selectDisplayableOffer(
    () => {
      draws += 1;
      return { typ: draws === 3 ? "WOLNY" : "KUPNO" } as never;
    },
    (candidate) => (candidate as { typ: string }).typ === "KUPNO"
  );

  expect(draws).toBe(3);
  expect(offer.typ).toBe("WOLNY");
});
