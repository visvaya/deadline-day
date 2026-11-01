import { describe, expect, test } from "vitest";

import { createRng, randomSeed } from "../src/logic/rng";

describe("createRng", () => {
  test("returns values inside [0, 1)", () => {
    const rng = createRng(12345);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test("the same seed yields the same sequence", () => {
    const first = createRng(918273);
    const second = createRng(918273);
    const draw = (rng: ReturnType<typeof createRng>) =>
      Array.from({ length: 50 }, () => rng.next());
    expect(draw(first)).toEqual(draw(second));
  });

  test("different seeds diverge", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  test("state() resumes the stream exactly", () => {
    const source = createRng(4242);
    Array.from({ length: 17 }, () => source.next());
    const resumed = createRng(source.state());
    const expected = Array.from({ length: 10 }, () => source.next());
    // Re-run from the snapshot and compare against what the source produced.
    const actual = Array.from({ length: 10 }, () => resumed.next());
    expect(actual).toEqual(expected);
  });

  test("a seed of zero still produces varied output", () => {
    const rng = createRng(0);
    const values = new Set(Array.from({ length: 20 }, () => rng.next()));
    expect(values.size).toBeGreaterThan(15);
  });
});

test("randomSeed returns a 32-bit unsigned integer", () => {
  const seed = randomSeed();
  expect(Number.isInteger(seed)).toBe(true);
  expect(seed).toBeGreaterThanOrEqual(0);
  expect(seed).toBeLessThanOrEqual(0xffffffff);
});
