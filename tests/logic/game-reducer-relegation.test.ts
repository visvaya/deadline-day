import { expect, test } from "vitest";

import { SEZONY_GRY } from "../../src/data/balance";
import { alwaysPass } from "../../src/logic/simulate-policies";
import { playHeadless } from "../golden/headless";

/**
 * Relegation ends the tenure on the spot - no protected year, decided
 * 2026-08-13 and unblocked by the survivability measurement (14.6% in season
 * one on hard). The seasons that were left are simply not played.
 */
test("a relegated club never plays another season", () => {
  let withDrop = 0;
  let without = 0;

  for (let seed = 1; seed <= 60; seed += 1) {
    const { state } = playHeadless({ seed, clubId: "wieczysta-krakow", policy: alwaysPass });
    const drop = state.historia.find((h) => h.spadek);
    if (drop) {
      withDrop += 1;
      expect(
        state.historia.filter((h) => h.sezon > drop.sezon),
        `seed ${seed}: grano dalej po spadku w sezonie ${drop.sezon}`
      ).toEqual([]);
    } else {
      without += 1;
      expect(state.historia).toHaveLength(SEZONY_GRY);
    }
  }

  // Both branches must be exercised, or the test proves nothing.
  expect(withDrop, "żadne ziarno nie dało spadku").toBeGreaterThan(0);
  expect(without, "każde ziarno dało spadek").toBeGreaterThan(0);
}, 120000);
