import { at } from "./invariant.ts";

/**
 * Deterministic RNG. Mulberry32: the whole state is a single 32-bit word,
 * which is what makes `state()` a cheap, serialisable resume point.
 *
 * Simulation code must never call Math.random directly - see oxlint.config.ts.
 */
export type Rng = {
  /** Next value in [0, 1). */
  next(): number;
  /** Serialisable position in the stream. Feed it back to createRng to resume. */
  state(): number;
  /**
   * How many values THIS instance has produced. Not part of the stream and
   * not serialised here: a resumed generator starts its own count from zero,
   * because `state()` is a position, not a history. The reducer adds each
   * dispatch's tally to the running total it carries in GameState.
   */
  draws(): number;
};

export const createRng = (seed: number): Rng => {
  let word = seed >>> 0;
  let calls = 0;

  return {
    next() {
      calls += 1;
      word = (word + 0x6d2b79f5) >>> 0;
      let t = word;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state() {
      return word;
    },
    draws() {
      return calls;
    },
  };
};

/** Fresh seed for a game the player did not seed themselves. */
export const randomSeed = (): number => {
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return at(Array.from(buffer), 0, "randomSeed buffer");
};

/** Float in [a, b). Mirrors the prototype's `los`. */
export const rand = (rng: Rng, a: number, b: number): number => a + rng.next() * (b - a);

/** Integer in [a, b], inclusive. Mirrors the prototype's `losInt`. */
export const randInt = (rng: Rng, a: number, b: number): number => Math.floor(rand(rng, a, b + 1));

/** Uniform pick from a non-empty array. Mirrors the prototype's `wybierz`. */
export const pick = <T>(rng: Rng, items: readonly T[]): T =>
  at(items, Math.floor(rng.next() * items.length), "pick from empty array");

/**
 * Fisher-Yates, returning a new array. Draw order is part of the golden
 * contract: one draw per position, from the end down to index 1.
 *
 * Deliberately NOT `sort(() => rng.next() - 0.5)`, which createSquad still
 * uses: that idiom is biased and burns an implementation-defined number of
 * draws, so it can never be the basis of a reproducible fixture list.
 */
export const shuffle = <T>(rng: Rng, items: readonly T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const a = at(result, i, "shuffle swap");
    const b = at(result, j, "shuffle swap");
    result[i] = b;
    result[j] = a;
  }
  return result;
};

/**
 * Poisson draw by Knuth's method: multiply uniforms until the product falls
 * below e^-lambda.
 *
 * The number of rng calls DEPENDS ON THE RESULT (roughly lambda + 1 draws),
 * which is fine for determinism - the stream is single and sequential - but
 * it means a golden trace records a stream position that the goal count
 * itself determines. The same variability already exists in haggling.
 */
export const poisson = (rng: Rng, lambda: number): number => {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let product = 1;
  do {
    k += 1;
    product *= rng.next();
  } while (product > limit);
  return k - 1;
};
