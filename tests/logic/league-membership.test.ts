import { describe, expect, test } from "vitest";
import { RELEGATED_COUNT } from "../../src/data/balance";

import { CLUBS } from "../../src/data/clubs";
import { FIRST_DIVISION } from "../../src/data/first-division";
import { TEAM_RATINGS } from "../../src/data/team-ratings";
import {
  currentRating,
  drawPromoted,
  leagueFixtureOrder,
  startingMembership,
  swapTiers,
} from "../../src/logic/league-membership";
import { createRng, shuffle } from "../../src/logic/rng";

const pool = () => startingMembership().clubs.filter((c) => c.tier === "pool");

// The starting league's order is pinned in tests/logic/initial-league-membership.test.ts.

test("a league club keeps the snapshot's asymmetry and its full name", () => {
  const lech = startingMembership().clubs.find((c) => c.shortName === "Lech")!;
  const fromSnapshot = TEAM_RATINGS.clubs.find((c) => c.krotko === "Lech")!;

  expect(currentRating(lech)).toEqual({
    attack: fromSnapshot.attack,
    defence: fromSnapshot.defence,
  });
  expect(lech.baseAttack).not.toBe(lech.baseDefence);
  expect(lech.name).toBe(fromSnapshot.nazwa);
});

test("a pool club is symmetric, because we only know its overall form", () => {
  const polonia = startingMembership().clubs.find((c) => c.shortName === "Polonia W.")!;
  expect(polonia.baseAttack).toBe(polonia.baseDefence);
  expect(polonia.tier).toBe("pool");
});

/**
 * Both directions, because the formula has to work for a club that started
 * in the pool as well as one that started in the league. Getting this wrong
 * in the obvious way - assuming everyone began in the top flight - makes a
 * promoted club weaker instead of stronger.
 */
test("a swap moves the rating the way the club moved", () => {
  const base = { clubId: "x", name: "X", shortName: "X", baseAttack: 1, baseDefence: 1 };

  // Started in the league, went down once.
  expect(currentRating({ ...base, tier: "pool", swaps: 1 }).attack).toBeCloseTo(0.95, 6);
  // Started in the pool, came up once. This is the case the first draft got
  // backwards.
  expect(currentRating({ ...base, tier: "league", swaps: 1 }).attack).toBeCloseTo(1.05, 6);

  // Round trips, from either side.
  expect(currentRating({ ...base, tier: "league", swaps: 2 }).attack).toBeCloseTo(0.9975, 6);
  expect(currentRating({ ...base, tier: "pool", swaps: 2 }).attack).toBeCloseTo(0.9975, 6);

  // Untouched clubs are untouched, wherever they sit.
  expect(currentRating({ ...base, tier: "league", swaps: 0 }).attack).toBe(1);
  expect(currentRating({ ...base, tier: "pool", swaps: 0 }).attack).toBe(1);
});

test("draws the requested number without repeating a club", () => {
  const rng = createRng(7);
  for (let i = 0; i < 200; i += 1) {
    const drawn = drawPromoted(rng, pool(), RELEGATED_COUNT);
    expect(drawn).toHaveLength(RELEGATED_COUNT);
    expect(new Set(drawn.map((c) => c.shortName)).size).toBe(RELEGATED_COUNT);
  }
});

/**
 * T is calibrated against full simulated seasons - spec 4.3. The bands
 * are wide on purpose: this catches someone changing T, the shape of the
 * weight or the number of promotions, not the exact distribution.
 *
 * The figures belong to THREE promotions. Going from two to three roughly
 * doubles the favourite's rate - it now has three chances at the same pool -
 * so a band that fitted two would be silently wrong here.
 */
test("the favourite goes up in 39-46% of draws, the bottom club under 4%", () => {
  const rng = createRng(0x5eed_1234);
  const count = new Map<string, number>();
  const RUNS = 20_000;
  for (let i = 0; i < RUNS; i += 1) {
    for (const c of drawPromoted(rng, pool(), RELEGATED_COUNT)) {
      count.set(c.shortName, (count.get(c.shortName) ?? 0) + 1);
    }
  }
  const favourite = (count.get("Polonia W.") ?? 0) / RUNS;
  const bottom = (count.get("Pogoń S.") ?? 0) / RUNS;

  expect(favourite, `favourite ${(favourite * 100).toFixed(1)}%`).toBeGreaterThan(0.39);
  expect(favourite, `favourite ${(favourite * 100).toFixed(1)}%`).toBeLessThan(0.46);
  expect(bottom, `bottom ${(bottom * 100).toFixed(1)}%`).toBeLessThan(0.04);
}, 60000);

test("every club in the pool can go up, given enough draws", () => {
  // The weakest must be improbable, not impossible: a pool member that can
  // never be promoted is dead weight the player will never meet.
  const rng = createRng(11);
  const seen = new Set<string>();
  for (let i = 0; i < 20_000; i += 1) {
    for (const c of drawPromoted(rng, pool(), RELEGATED_COUNT)) seen.add(c.shortName);
  }
  expect(seen.size).toBe(18);
}, 60000);

/**
 * The order that decides whether this works: draw the promoted from the pool
 * AS IT STOOD during the finished season, then move the relegated into it.
 * Reversed, a club can go down and come straight back up for the same next
 * season - roughly a quarter of promotion slots at this sharpness, because a
 * relegated club carries about 0.41 of the pool leader's weight.
 */
test("a club relegated this season cannot come back up for the next one", () => {
  for (let seed = 0; seed < 300; seed += 1) {
    const going = ["Radomiak", "Śląsk", "Motor"];
    const after = swapTiers(createRng(seed), startingMembership(), going);

    for (const k of going) {
      expect(after.clubs.find((c) => c.shortName === k)!.tier, `${k} wrócił od razu`).toBe("pool");
    }
  }
});

test("the league keeps eighteen clubs and nobody loses their name", () => {
  const after = swapTiers(createRng(3), startingMembership(), ["Radomiak", "Śląsk", "Motor"]);

  expect(after.clubs.filter((c) => c.tier === "league")).toHaveLength(18);
  expect(after.clubs.filter((c) => c.tier === "pool")).toHaveLength(18);
  expect(after.clubs.every((c) => c.name.length > 0)).toBe(true);
});

test("a promoted club keeps its base and gains one swap", () => {
  const before = startingMembership();
  const after = swapTiers(createRng(5), before, ["Radomiak"]);

  const promoted = after.clubs.find(
    (c) =>
      c.tier === "league" && before.clubs.find((b) => b.shortName === c.shortName)!.tier === "pool"
  )!;
  const original = before.clubs.find((b) => b.shortName === promoted.shortName)!;

  expect(promoted.baseAttack).toBe(original.baseAttack);
  expect(promoted.swaps).toBe(1);
  expect(currentRating(promoted).attack).toBeCloseTo(original.baseAttack * 1.05, 6);
});

describe("startingMembership carries club identity", () => {
  test("every club carries the clubId of its data record", () => {
    const membership = startingMembership();
    const league = membership.clubs.filter((c) => c.tier === "league").map((c) => c.clubId);
    const poolIds = membership.clubs.filter((c) => c.tier === "pool").map((c) => c.clubId);
    expect(league).toEqual(CLUBS.map((c) => c.clubId));
    expect(poolIds).toEqual(FIRST_DIVISION.map((c) => c.clubId));
  });

  test("the 36 ids are unique", () => {
    const ids = startingMembership().clubs.map((c) => c.clubId);
    expect(new Set(ids).size).toBe(36);
  });
});

describe("leagueFixtureOrder is keyed by clubId, not by short name", () => {
  test("renaming every short name leaves the fixture pairing by id unchanged", () => {
    const membership = startingMembership();
    const renamed = {
      clubs: membership.clubs.map((c) => ({
        ...c,
        shortName: `zz-${Array.from(c.shortName).reverse().join("")}`,
      })),
    };
    const idOf = (m: typeof membership) => new Map(m.clubs.map((c) => [c.shortName, c.clubId]));
    const orderById = (m: typeof membership) => {
      const ids = idOf(m);
      return shuffle(createRng(42), leagueFixtureOrder(m)).map((name) => ids.get(name));
    };
    expect(orderById(renamed)).toEqual(orderById(membership));
  });

  test("the fixture input is ordered by clubId", () => {
    const membership = startingMembership();
    const ids = new Map(membership.clubs.map((c) => [c.shortName, c.clubId]));
    const order = leagueFixtureOrder(membership).map((name) => ids.get(name)!);
    expect(order).toEqual([...order].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
});
