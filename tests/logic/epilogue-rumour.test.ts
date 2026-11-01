import { describe, expect, test } from "vitest";

import { clubById } from "../../src/data/clubs";
import { FORMACJE } from "../../src/data/positions";
import { FOREIGN_CLUB_NAMES } from "../../src/data/foreign-clubs";
import type { EuropeanCup, Formation, Player, SeasonHistoryEntry } from "../../src/data/types";
import { rollTransferRumour, runEpilogue, type EpilogueInput } from "../../src/logic/epilogue";
import { clubRating } from "../../src/logic/league-ratings";
import { startingMembership } from "../../src/logic/league-membership";
import { marketValue } from "../../src/logic/player";
import { createRng } from "../../src/logic/rng";
import { createSquadFromFormation, fillEmptyPositions } from "../../src/logic/squad";

/**
 * The epilogue's foreign interest is a rumour, not a transaction (2026-08-20).
 *
 * It used to be a 70%-per-season sale of the best young player at 110-180% of
 * his value, plus an unconditional OVR 56-62 replacement. That did two things
 * the epilogue is not allowed to do: it paid money into a legacy term, and it
 * handed the club a player nobody signed. The rule now reads "the epilogue
 * inherits the club, it does not improve it".
 *
 * What is left is one sentence produced after the last epilogue season.
 */

const FORMATION: Formation = FORMACJE["4-3-3"];
const CLUB = clubById("lech-poznan");

/** A squad where `mine` of the players are the user's own signings, aged so
 * they still qualify after three epilogue seasons of ageing.
 *
 * Tests that need a rumour to appear pass ALL_MINE rather than a handful:
 * ageSquad retires and releases players every season, so pinning the
 * expectation on the first five or six indices made the assertion depend on
 * which of them the epilogue's draws happened to keep. The pyramid's extra
 * draws shifted exactly that, and the property under test - "a qualifying
 * signing produces a rumour" - was never about a specific man. */
const ALL_MINE = 99;
const squadWith = (seed: number, mine: number, ovr = 82, wiek = 21): Player[] => {
  const squad = createSquadFromFormation(createRng(seed), FORMATION, clubRating(CLUB));
  return squad.map((player, index) =>
    index < mine ? { ...player, moj: true, ovr, wiek, cenaZakupu: 2.5 } : player
  );
};

const inputFor = (kadra: readonly Player[], overrides: Partial<EpilogueInput> = {}) => {
  const historia: SeasonHistoryEntry[] = [];
  const input: EpilogueInput = {
    kadra,
    kasa: 10,
    europeanCup: null as EuropeanCup | null,
    club: CLUB,
    formacja: FORMATION,
    membership: startingMembership(),
    historia,
    odrzuceni: [],
    legacyHandicap: 0,
    ...overrides,
  };
  return input;
};

const run = (kadra: readonly Player[], seed = 0xbeef_0001, overrides = {}) =>
  runEpilogue(createRng(seed), inputFor(kadra, overrides));

describe("the epilogue no longer sells anyone", () => {
  test("foreign interest adds no money to the final balance", () => {
    // Same career twice, but one squad has plenty of sale candidates and the
    // other has none. Under the old rule the first would collect up to three
    // fees; the rumour must leave the cash identical.
    const withCandidates = squadWith(0x11, 6, 84, 21);
    const withoutCandidates = withCandidates.map((player) => ({ ...player, moj: false }));

    const rich = run(withCandidates);
    const poor = run(withoutCandidates);

    expect(rich.transferRumour).not.toBeNull();
    expect(poor.transferRumour).toBeNull();
    expect(rich.legacy.kasa).toBe(poor.legacy.kasa);
    expect(rich.legacy.breakdown?.kasa).toBe(poor.legacy.breakdown?.kasa);
  });

  test("foreign interest neither removes the player nor hands over a replacement", () => {
    const kadra = squadWith(0x12, 4, 85, 20);
    const result = run(kadra);

    expect(result.transferRumour).not.toBeNull();
    // The rumoured player is still in the squad that produced the legacy: his
    // value is still counted in wartoscKadryMoj, and no 56-62 stand-in exists.
    const stayed = run(kadra).legacy.breakdown?.wartoscKadryMoj ?? 0;
    expect(stayed).toBeGreaterThan(0);
  });

  test("the same seed plays out identically whether a rumour qualifies or not", () => {
    // The strongest statement of "does not use the main RNG": flipping the
    // rumour on and off must not shift a single downstream draw. The two
    // squads differ only in `moj`, which nothing else in the epilogue's
    // simulation reads.
    const base = squadWith(0x13, ALL_MINE, 84, 21);
    const noneMine = base.map((player) => ({ ...player, moj: false }));

    const a = run(base);
    const b = run(noneMine);

    expect(a.transferRumour).not.toBeNull();
    expect(b.transferRumour).toBeNull();
    expect(a.pages.map((page) => [page.nr, page.miejsce, page.pkt])).toEqual(
      b.pages.map((page) => [page.nr, page.miejsce, page.pkt])
    );
    expect(a.legacy.kasa).toBe(b.legacy.kasa);
  });
});

describe("the rumour itself", () => {
  test("is produced at most once, after the last epilogue season", () => {
    const result = run(squadWith(0x14, 6, 85, 20));

    expect(result.transferRumour).not.toBeNull();
    // Nothing in the per-season headlines mentions a transfer any more.
    const kinds = result.pages.flatMap((page) => page.naglowki.map((headline) => headline.kind));
    expect(kinds).not.toContain("TRANSFER_ZAGRANICA");
  });

  test("needs a signing, aged 26 or under, worth over 3,5 mln, still in the squad", () => {
    // Each case fails exactly one of the four conditions.
    expect(run(squadWith(0x15, ALL_MINE, 85, 20)).transferRumour).not.toBeNull();
    // not the user's signing
    expect(run(squadWith(0x15, 0, 85, 20)).transferRumour).toBeNull();
    // too old: 26 at the start plus three epilogue seasons
    expect(run(squadWith(0x15, ALL_MINE, 85, 26)).transferRumour).toBeNull();
    // worth too little
    expect(marketValue(60, 21, "ŚN")).toBeLessThan(3.5);
    expect(run(squadWith(0x15, ALL_MINE, 60, 20)).transferRumour).toBeNull();
  });

  test("names a club and an amount that depend only on the player's id", () => {
    const kadra = squadWith(0x16, ALL_MINE, 86, 20);

    // Same squad, different career seed: the simulation diverges, but as long
    // as the same player ends up the candidate, his club and fee are fixed.
    const first = run(kadra, 0xaaa1);
    const second = run(kadra, 0xaaa2);

    expect(first.transferRumour).not.toBeNull();
    expect(second.transferRumour).not.toBeNull();
    if (!first.transferRumour || !second.transferRumour) return;

    const nameOf = (text: string): string => text.split(" znalazł")[0]!;
    if (nameOf(first.transferRumour.text) === nameOf(second.transferRumour.text)) {
      expect(second.transferRumour.club).toBe(first.transferRumour.club);
      expect(second.transferRumour.amount).toBe(first.transferRumour.amount);
    }
    expect(FOREIGN_CLUB_NAMES).toContain(first.transferRumour.club);
  });

  test("quotes 110-140% of the visible market value, never above 11 mln", () => {
    // Straight at the helper: after three epilogue seasons of development the
    // candidate's ovr is unrecoverable from the outside, so the band could
    // only be asserted here.
    let capped = 0;
    let banded = 0;

    for (let i = 0; i < 400; i += 1) {
      const ovr = 74 + (i % 18);
      const wiek = 20 + (i % 7);
      const candidate: Player = {
        id: `rumour-band-${i}`,
        nazwa: `T. Nowak ${i}`,
        poz: "ŚP",
        wiek,
        ovr,
        sufit: 90,
        moj: true,
        cenaZakupu: 2,
        ageAtSigning: null,
        mnoznikPlacy: 1,
        wKlubieOd: 0,
        kontraktOd: 0,
        wygasa: false,
      };
      const rumour = rollTransferRumour([candidate]);
      const value = marketValue(ovr, wiek, candidate.poz);
      if (value <= 3.5) {
        expect(rumour).toBeNull();
        continue;
      }
      expect(rumour).not.toBeNull();
      if (!rumour) continue;

      expect(rumour.amount).toBeLessThanOrEqual(11);
      // Rounded to 0,1 mln, so compare against the band with that tolerance.
      if (rumour.amount < 11) {
        expect(rumour.amount).toBeGreaterThanOrEqual(Math.round(value * 1.1 * 10) / 10 - 0.05);
        expect(rumour.amount).toBeLessThanOrEqual(Math.round(value * 1.4 * 10) / 10 + 0.05);
        banded += 1;
      } else {
        capped += 1;
      }
    }

    // Both branches are actually exercised - otherwise the cap or the band
    // would be untested while the test still passed.
    expect(banded).toBeGreaterThan(0);
    expect(capped).toBeGreaterThan(0);
  });

  test("picks the most valuable qualifying player, not the first one", () => {
    const make = (id: string, ovr: number, wiek: number, moj = true): Player => ({
      id,
      nazwa: id,
      poz: "ŚP",
      wiek,
      ovr,
      sufit: 90,
      moj,
      cenaZakupu: 2,
      ageAtSigning: null,
      mnoznikPlacy: 1,
      wKlubieOd: 0,
      kontraktOd: 0,
      wygasa: false,
    });

    const rumour = rollTransferRumour([
      make("mniej-wart", 78, 24),
      make("najdrozszy", 86, 21),
      make("nie-moj", 90, 21, false),
    ]);

    expect(rumour?.text.startsWith("najdrozszy ")).toBe(true);
  });

  test("reads as Polish: comma decimal, hard spaces, a full stop, no declension", () => {
    const rumour = run(squadWith(0x17, 6, 85, 20)).transferRumour;
    expect(rumour).not.toBeNull();
    if (!rumour) return;

    expect(rumour.text).toMatch(/^.+ znalazł się na liście życzeń klubu „.+”\. /u);
    expect(rumour.text).toMatch(/Według mediów na stole leży oferta w wysokości .+\.$/u);
    // pl(x, 1) with hard spaces: "10,0 mln €", never "10.5 mln".
    expect(rumour.text).toContain(`${rumour.amount.toFixed(1).replace(".", ",")}\u00a0mln\u00a0€`);
    expect(rumour.text).not.toMatch(/\d\.\d/u);
    // The player's generated surname is placed unchanged at the front.
    expect(rumour.text.startsWith(rumour.text.split(" znalazł")[0]!)).toBe(true);
  });
});

describe("the one emergency-junior rule still holds", () => {
  test("fillEmptyPositions adds exactly one debutant, and only to a fully empty position", () => {
    const full = createSquadFromFormation(createRng(0x18), FORMATION, clubRating(CLUB));
    expect(fillEmptyPositions(createRng(1), full, 70, FORMATION).debiutanci).toHaveLength(0);

    // Strip one position completely; every other position keeps someone.
    const emptied = full.filter((player) => player.poz !== "BR");
    const filled = fillEmptyPositions(createRng(1), emptied, 70, FORMATION);
    expect(filled.debiutanci).toHaveLength(1);
    expect(filled.debiutanci[0]!.poz).toBe("BR");

    // A position that still has one player gets nobody, even if the formation
    // wants several there.
    const thinned = full.filter(
      (player, index) => player.poz !== "ŚO" || full.findIndex((p) => p.poz === "ŚO") === index
    );
    expect(fillEmptyPositions(createRng(1), thinned, 70, FORMATION).debiutanci).toHaveLength(0);
  });
});
