/**
 * @vitest-environment jsdom
 */
import { expect, test } from "vitest";

import { createRng, poisson } from "../../src/logic/rng";

test("the same seed always yields the same sequence", () => {
  const rngA = createRng(7);
  const rngB = createRng(7);
  const a = Array.from({ length: 20 }, () => poisson(rngA, 1.4));
  const b = Array.from({ length: 20 }, () => poisson(rngB, 1.4));
  expect(a).toEqual(b);
});

test("lambda 0 returns 0 without consuming the stream", () => {
  const rng = createRng(7);
  const before = rng.state();
  expect(poisson(rng, 0)).toBe(0);
  expect(rng.state()).toBe(before);
});

test("sample mean and variance both approach lambda", () => {
  const rng = createRng(0x5eed_0001);
  const draws = Array.from({ length: 50_000 }, () => poisson(rng, 1.4));
  const mean = draws.reduce((sum, value) => sum + value, 0) / draws.length;
  const variance = draws.reduce((sum, value) => sum + (value - mean) ** 2, 0) / draws.length;

  // Poisson has mean == variance == lambda; 50k draws put the standard error
  // near 0.005, so 0.05 is a wide but still meaningful window.
  expect(mean).toBeGreaterThan(1.35);
  expect(mean).toBeLessThan(1.45);
  expect(variance).toBeGreaterThan(1.3);
  expect(variance).toBeLessThan(1.5);
});

test("never returns a negative or fractional count", () => {
  const rng = createRng(11);
  for (let i = 0; i < 1000; i += 1) {
    const value = poisson(rng, 2.5);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  }
});
