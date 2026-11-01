import { expect, test } from "vitest";
import { clubById } from "../../src/data/clubs";
import { lowerTableClubShortNames } from "../../src/logic/scoring";

/**
 * The bottom six by expected finish: "Bieżąca szóstka:
 * Radomiak, Śląsk, Piast, Wieczysta, Zagłębie, Wisła Kraków." Pinned here so
 * a change to the rating snapshot (`pnpm sync:ratings`) or to the sort has
 * to explain a change in this list rather than drift it silently.
 */
const EXPECTED_SIX = ["Radomiak", "Śląsk", "Piast", "Wieczysta", "Zagłębie", "Wisła K."];

test("the bottom six by expected finish match the frozen list", () => {
  // A club far from the bottom six, so none of them is excluded.
  const playerClubId = clubById("lech-poznan").clubId;
  expect(lowerTableClubShortNames(playerClubId)).toEqual(EXPECTED_SIX);
});

test("excludes the player's own club only after the six are drawn", () => {
  const wieczysta = clubById("wieczysta-krakow").clubId;
  const withoutWieczysta = lowerTableClubShortNames(wieczysta);
  expect(withoutWieczysta).toHaveLength(5);
  expect(withoutWieczysta).not.toContain("Wieczysta");
  expect(withoutWieczysta).toEqual(EXPECTED_SIX.filter((name) => name !== "Wieczysta"));
});

test("a club outside the bottom six leaves the pool at six", () => {
  const legia = clubById("legia-warszawa").clubId;
  expect(lowerTableClubShortNames(legia)).toHaveLength(6);
});
