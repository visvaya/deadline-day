import { clubById } from "../../src/data/clubs";
import type { ManagerIdentity, Market, Player } from "../../src/data/types";
import { buildCareerBaseline } from "../../src/logic/career-baseline";

/** Shared scaffolding for hand-built GameState fixtures across game-reducer
 * unit tests - a flat, quiet market and a minimal Player factory so each
 * test file only states what it's actually varying. */

/** One manager identity for every reducer test that needs one: nothing
 * under test varies the manager, and validateManagerIdentity requires one
 * shaped like this to reach START_CAREER at all. */
export const testManager: ManagerIdentity = { firstName: "Jan", lastName: "Kowalski" };

/** Stand-in for the old mid-table "sredni" difficulty pool's first club -
 * a mid-table club with nothing extreme about its baseline, chosen so tests
 * written against "sredni" keep exercising a similar career shape. */
export const testClub = clubById("gornik-zabrze");
export const testCareerBaseline = buildCareerBaseline(testClub.clubId);

export const quietMarket: Market = {
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

export const makeTestPlayer = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  nazwa: `Gracz ${id}`,
  poz: "LO",
  wiek: 24,
  ovr: 60,
  sufit: 60,
  moj: false,
  cenaZakupu: null,
  ageAtSigning: null,
  mnoznikPlacy: 1,
  wKlubieOd: 0,
  kontraktOd: 0,
  wygasa: false,
  ...overrides,
});
