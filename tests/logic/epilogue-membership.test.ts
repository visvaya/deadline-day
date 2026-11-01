import { expect, test } from "vitest";

import { SEZONY_EPILOGU } from "../../src/data/balance";
import { clubById } from "../../src/data/clubs";
import { FORMACJE } from "../../src/data/positions";
import type { EuropeanCup, Formation, Player, SeasonHistoryEntry } from "../../src/data/types";
import { runEpilogue, type EpilogueInput } from "../../src/logic/epilogue";
import { clubRating } from "../../src/logic/league-ratings";
import { startingMembership, swapTiers } from "../../src/logic/league-membership";
import { createRng } from "../../src/logic/rng";
import { createSquadFromFormation } from "../../src/logic/squad";

const FORMATION: Formation = FORMACJE["4-3-3"];
const CLUB = clubById("lech-poznan");

const squad = (): Player[] =>
  createSquadFromFormation(createRng(0xe9_0001), FORMATION, clubRating(CLUB));

/** A squad nobody could keep up with: every rating floored, so the club
 * finishes bottom whatever the draws do. */
const hopelessSquad = (): Player[] => squad().map((player) => ({ ...player, ovr: 40 }));

const baseInput = (overrides: Partial<EpilogueInput> = {}): EpilogueInput => ({
  kadra: squad(),
  kasa: 10,
  europeanCup: null as EuropeanCup | null,
  club: CLUB,
  formacja: FORMATION,
  membership: startingMembership(),
  historia: [] as SeasonHistoryEntry[],
  odrzuceni: [],
  legacyHandicap: 0,
  ...overrides,
});

/**
 * The epilogue plays three more seasons, and until now it played them against
 * the snapshot's eighteen - throwing away every promotion and relegation from
 * the tenure.
 */
test("the epilogue starts from the league the tenure left behind", () => {
  const membership = swapTiers(createRng(1), startingMembership(), ["Radomiak", "Śląsk"]);
  const promotedIn = membership.clubs.filter((c) => c.tier === "league" && c.swaps > 0);
  expect(promotedIn.length).toBe(2);

  const result = runEpilogue(createRng(2), baseInput({ membership }));

  // Proving it USED the inherited membership, not merely that it received it:
  // a club promoted during the tenure must never be back in the pool with the
  // swap count it would have had if the epilogue had rebuilt from scratch.
  // Asserting swaps > 0 alone proves nothing - that was already true on input.
  for (const club of promotedIn) {
    const after = result.membership.clubs.find((c) => c.shortName === club.shortName)!;
    expect(after.swaps, `${club.shortName} zresetowany`).toBeGreaterThanOrEqual(club.swaps);
  }
  // And the club that went down before the epilogue is still down or bounced,
  // never silently restored.
  const radomiak = result.membership.clubs.find((c) => c.shortName === "Radomiak")!;
  expect(radomiak.swaps).toBeGreaterThanOrEqual(1);
});

/**
 * The branch nobody thought of: swapTiers has no exception for the player's
 * club, so finishing 17th or 18th in season 6 or 7 drops it out of the top
 * flight - and the next season's leagueRatings throws, because the club is no
 * longer in the membership. Frozen decision 5: the epilogue ends there.
 */
test("the epilogue stops when the player's club goes down", () => {
  const input = baseInput({ kadra: hopelessSquad() });

  expect(() => runEpilogue(createRng(4), input)).not.toThrow();
  const result = runEpilogue(createRng(4), input);

  expect(result.pages.length).toBeLessThan(SEZONY_EPILOGU);
  expect(result.pages.length).toBeGreaterThan(0);
});

test("the epilogue keeps swapping clubs across its own three seasons", () => {
  const result = runEpilogue(createRng(3), baseInput());
  expect(result.pages).toHaveLength(SEZONY_EPILOGU);
  expect(result.membership.clubs.some((c) => c.swaps > 0)).toBe(true);
});
