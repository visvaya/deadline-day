import { expect, test } from "vitest";

import { buildFixtures } from "../../src/logic/league";

const CLUBS = Array.from({ length: 18 }, (_, i) => `K${i + 1}`);

test("eighteen clubs produce thirty-four rounds of nine matches", () => {
  const rounds = buildFixtures(CLUBS);
  expect(rounds).toHaveLength(34);
  for (const round of rounds) expect(round).toHaveLength(9);
});

test("no club plays twice in the same round", () => {
  for (const round of buildFixtures(CLUBS)) {
    const playing = round.flatMap((match) => [match.home, match.away]);
    expect(new Set(playing).size).toBe(playing.length);
    expect(playing).toHaveLength(18);
  }
});

test("every pair meets exactly twice, once at each ground", () => {
  const pairs = new Map<string, number>();
  for (const round of buildFixtures(CLUBS)) {
    for (const match of round) {
      const key = `${match.home}|${match.away}`;
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
  }
  expect(pairs.size).toBe(18 * 17);
  for (const count of pairs.values()) expect(count).toBe(1);
});

test("every club plays seventeen home and seventeen away matches", () => {
  const home = new Map<string, number>();
  const away = new Map<string, number>();
  for (const round of buildFixtures(CLUBS)) {
    for (const match of round) {
      home.set(match.home, (home.get(match.home) ?? 0) + 1);
      away.set(match.away, (away.get(match.away) ?? 0) + 1);
    }
  }
  for (const club of CLUBS) {
    expect(home.get(club)).toBe(17);
    expect(away.get(club)).toBe(17);
  }
});

test("the generator is deterministic and consumes no randomness", () => {
  expect(buildFixtures(CLUBS)).toEqual(buildFixtures(CLUBS));
});
