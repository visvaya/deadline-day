import { expect, test } from "vitest";

import { POSITION_WEIGHTS } from "../../src/data/balance";
import type { PositionCode } from "../../src/data/types";

const CODES = Object.keys(POSITION_WEIGHTS) as PositionCode[];

/**
 * The inverse mapping that builds a starting squad raises the club's attack
 * and defence ratings to these exponents. Weights that did not sum to one
 * would shift the whole squad up or down the ovr scale - silently, and for
 * every club at once.
 */
test("attack and defence weights sum to exactly one for every position", () => {
  for (const code of CODES) {
    const { attack, defence } = POSITION_WEIGHTS[code];
    expect(attack + defence, code).toBeCloseTo(1, 10);
    expect(attack, code).toBeGreaterThanOrEqual(0);
    expect(defence, code).toBeGreaterThanOrEqual(0);
  }
});

test("the goalkeeper is pure defence and the striker pure attack", () => {
  expect(POSITION_WEIGHTS.BR).toEqual({ attack: 0, defence: 1 });
  expect(POSITION_WEIGHTS["ŚO"]).toEqual({ attack: 0, defence: 1 });
  expect(POSITION_WEIGHTS.N).toEqual({ attack: 1, defence: 0 });
});

test("positions are ordered from defensive to offensive as the pitch is", () => {
  const order: PositionCode[] = ["BR", "LO", "ŚPD", "CLS", "ŚP", "LP", "ŚPO", "LS", "CN", "N"];
  const attacks = order.map((code) => POSITION_WEIGHTS[code].attack);
  for (let i = 1; i < attacks.length; i += 1) {
    expect(attacks[i], `${order[i]} after ${order[i - 1]}`).toBeGreaterThanOrEqual(attacks[i - 1]!);
  }
});

test("the codes on their way out weigh the same as their replacements", () => {
  expect(POSITION_WEIGHTS.POM).toEqual(POSITION_WEIGHTS["ŚP"]);
  expect(POSITION_WEIGHTS["ŚN"]).toEqual(POSITION_WEIGHTS.N);
});
