import { expect, test } from "vitest";

import type { PlayerType } from "../../src/data/types";
import { createPlayer, createStartingSquadPlayer } from "../../src/logic/player";
import { createRng } from "../../src/logic/rng";

const TYPES: PlayerType[] = ["mlody", "gotowy", "weteran", "akademia"];

/**
 * The ceiling is a cap, not a forecast. A player above his own sufit is a
 * contradiction: the legacy screen reveals it as "his hidden ceiling", and
 * a ceiling you have already passed says nothing. Before 2026-08-14 a
 * "loteria" youngster with a bad spread roll, and every veteran, started
 * life above it.
 */
test("no generated player ever starts above his own ceiling", () => {
  const rng = createRng(0x5eed_0001);
  for (const typ of TYPES) {
    for (let i = 0; i < 4000; i += 1) {
      const p = createPlayer(rng, typ, "ŚO");
      expect(p.sufit, `${typ}: ovr ${p.ovr} > sufit ${p.sufit}`).toBeGreaterThanOrEqual(p.ovr);
    }
  }
});

test("a bust prospect gets a ceiling equal to his rating, not below it", () => {
  // Over this many draws a "loteria" label with the worst spread is certain
  // to come up; it must land on sufit === ovr rather than under it.
  const rng = createRng(7);
  let seenEqual = false;
  for (let i = 0; i < 8000; i += 1) {
    const p = createPlayer(rng, "mlody", "ŚO");
    if (p.sufit === p.ovr) seenEqual = true;
  }
  expect(seenEqual).toBe(true);
});

test("no starting-squad player ever starts above his own ceiling", () => {
  const rng = createRng(0x5eed_0002);
  for (const target of [50, 58, 66, 74, 80]) {
    for (let i = 0; i < 2000; i += 1) {
      const p = createStartingSquadPlayer(rng, "ŚO", target, i % 2 === 0);
      expect(p.sufit, `ovr ${p.ovr} > sufit ${p.sufit}`).toBeGreaterThanOrEqual(p.ovr);
      expect(p.sufit).toBeLessThanOrEqual(94);
    }
  }
});
