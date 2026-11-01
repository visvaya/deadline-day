import { createRng } from "../src/logic/rng";

/** Deterministic, uniformly distributed 32-bit seeds from one named root. */
export const seedSeries = (baseSeed: number, count: number): number[] => {
  const rng = createRng(baseSeed);
  return Array.from({ length: count }, () => Math.floor(rng.next() * 0x1_0000_0000) >>> 0);
};
