import { expect, test } from "vitest";

import type { GameState, Offer } from "../../src/data/types";
import { depthFirst, stallThenTake } from "../../src/logic/simulate-policies";
import { formatTrace } from "../../src/logic/trace-format";
import { simulateGame } from "../../src/logic/simulate";

test("the card observer changes nothing in the career it watches", () => {
  const opts = { seed: 12345, clubId: "zaglebie-lubin", policy: depthFirst };
  const plain = simulateGame(opts);
  const cards = new Map<number, Offer>();
  const watched = simulateGame({ ...opts, onCard: (card, index) => cards.set(index, card) });
  expect(formatTrace(watched.events)).toBe(formatTrace(plain.events));
  expect(watched.state.rngDrawCount).toBe(plain.state.rngDrawCount);
  const decisions = plain.events.filter((e) => e.type === "decision").length;
  expect(cards.size).toBe(decisions);
});

test("the step observer changes nothing and sees every settled season", () => {
  const opts = { seed: 12345, clubId: "zaglebie-lubin", policy: depthFirst };
  const plain = simulateGame(opts);
  const seasonsSeen: number[] = [];
  const watched = simulateGame({
    ...opts,
    onStep: (before: GameState, after: GameState) => {
      const added = after.trace.slice(before.trace.length);
      for (const event of added) if (event.type === "season") seasonsSeen.push(event.sezon);
    },
  });
  expect(formatTrace(watched.events)).toBe(formatTrace(plain.events));
  expect(watched.state.rngDrawCount).toBe(plain.state.rngDrawCount);
  const seasons = plain.events.filter((e) => e.type === "season").map((e) => e.sezon);
  expect(seasonsSeen).toEqual(seasons);
});

test("the card observer receives the state the card is shown in, once per decision", () => {
  const opts = { seed: 12345, clubId: "zaglebie-lubin", policy: stallThenTake };
  const plain = simulateGame(opts);
  const seen: { index: number; kasa: number; same: boolean }[] = [];
  const watched = simulateGame({
    ...opts,
    onCard: (card, index, state) =>
      seen.push({ index, kasa: state.kasa, same: state.karta === card }),
  });
  expect(formatTrace(watched.events)).toBe(formatTrace(plain.events));
  expect(seen.every((entry) => entry.same)).toBe(true);
  const decisions = plain.events.filter((e) => e.type === "decision").length;
  expect(new Set(seen.map((entry) => entry.index)).size).toBe(decisions);
  expect(seen.length).toBe(decisions);
});
