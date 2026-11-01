import { expect, test } from "vitest";

import { clubById } from "../../src/data/clubs";
import { FORMACJE } from "../../src/data/positions";
import type {
  EuropeanCup,
  Formation,
  PassedOnOffer,
  Player,
  SeasonHistoryEntry,
} from "../../src/data/types";
import { runFinale, type EpilogueInput } from "../../src/logic/epilogue";
import { money } from "../../src/logic/format";
import { clubRating } from "../../src/logic/league-ratings";
import { startingMembership } from "../../src/logic/league-membership";
import { createRng } from "../../src/logic/rng";
import { createSquadFromFormation } from "../../src/logic/squad";

const FORMATION: Formation = FORMACJE["4-3-3"];
const CLUB = clubById("lech-poznan");

const squad = (): Player[] =>
  createSquadFromFormation(createRng(0xf1_0001), FORMATION, clubRating(CLUB));

/** The threshold runEpilogue's own tests use: a passed-on player only makes
 * the closing line if his ceiling reaches 76. */
const passedOn = (): PassedOnOffer[] =>
  squad().map((player) => ({ player: { ...player, sufit: 80 }, fee: 1 }));

const baseInput = (): EpilogueInput => ({
  kadra: squad(),
  kasa: 10,
  europeanCup: null as EuropeanCup | null,
  club: CLUB,
  formacja: FORMATION,
  membership: startingMembership(),
  historia: [
    { sezon: 1, pkt: 40, miejsce: 17, puchar: false, mistrz: false, spadek: true },
  ] as SeasonHistoryEntry[],
  odrzuceni: passedOn(),
  legacyHandicap: 0,
});

/**
 * Section 12 of the brief lists two things the game may never economise on,
 * and a shortened ending is exactly where someone would: the ceiling reveal
 * and the "one you turned down" line. The finale keeps both and drops only
 * the seasons it has no way to play.
 */
test("the finale reveals ceilings and keeps the one you turned down", () => {
  const result = runFinale(baseInput());

  expect(result.pages).toHaveLength(0);
  expect(result.legacy).not.toBeNull();
  // The line section 12 forbids dropping. Naming the test after it and then
  // not checking it is how it would quietly disappear.
  expect(result.secondChance).not.toBeNull();
});

test("the finale draws nothing and plays nothing", () => {
  // Same input twice, no Rng: identical output. A played season would need
  // draws and this would not hold.
  expect(runFinale(baseInput())).toEqual(runFinale(baseInput()));
});

test("the one you turned down is named with his OVR, age and fee at the time of the offer", () => {
  // The passed-on list holds the offer-card snapshot, so OVR and age are what
  // the player saw when he said no, not what the player became.
  const snapshot: Player = {
    ...squad()[0]!,
    nazwa: "K. Odrzucony",
    ovr: 68,
    wiek: 22,
    sufit: 84,
  };
  const result = runFinale({ ...baseInput(), odrzuceni: [{ player: snapshot, fee: 1.2 }] });
  expect(result.secondChance?.text).toBe(
    `K. Odrzucony (68 OVR, 22 lata), któremu powiedziałeś „pas” przy kwocie ${money(1.2)}, kończy tę historię z oceną 84.`
  );
});
