import { expect, test } from "vitest";

import { createRng, shuffle } from "../../src/logic/rng";

const ITEMS = Array.from({ length: 18 }, (_, i) => `K${i + 1}`);

test("the same seed produces the same permutation", () => {
  expect(shuffle(createRng(4), ITEMS)).toEqual(shuffle(createRng(4), ITEMS));
});

test("the result is a permutation, never a copy with items lost or duplicated", () => {
  const result = shuffle(createRng(5), ITEMS);
  expect(result).toHaveLength(ITEMS.length);
  expect([...result].sort()).toEqual([...ITEMS].sort());
});

test("the input array is not mutated", () => {
  const input = [...ITEMS];
  shuffle(createRng(6), input);
  expect(input).toEqual(ITEMS);
});

test("different seeds give different orders", () => {
  expect(shuffle(createRng(7), ITEMS)).not.toEqual(shuffle(createRng(8), ITEMS));
});

test("every position is reachable by some seed", () => {
  // Fisher-Yates is unbiased; a sort-based shuffle is not. Over many seeds
  // the first item must land in every one of the eighteen slots at least once.
  const seen = new Set<number>();
  for (let seed = 0; seed < 500; seed += 1) {
    seen.add(shuffle(createRng(seed), ITEMS).indexOf("K1"));
  }
  expect(seen.size).toBe(ITEMS.length);
});
