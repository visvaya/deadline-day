import { expect, test } from "vitest";

import { playHeadless } from "./headless";

test("a full game reaches the final screen", () => {
  const result = playHeadless({
    seed: 0x1111_1111,
    clubId: "gornik-zabrze",
    policy: ({ index, card, state }) => {
      const affordable = card.typ === "SPRZEDAZ" || card.cena <= state.kasa;
      return index % 2 === 0 && affordable ? "bierz" : "pas";
    },
  });

  expect(result.state.faza).toBe("final");
  expect(result.state.finalne).toBeTruthy();
  // Six card decisions in every season actually played (4 in summer, 2 in
  // winter). No leading START entry any more - state.akcje holds only the
  // decisions made after START_CAREER (2026-09-14). Written against the
  // seasons this seed reached rather than a flat 30, because relegation ends
  // the tenure (2026-08-23) and this seed now goes down in season two - which
  // is a legitimate ending, not a broken run. The invariant worth pinning
  // here is that the schedule, not the player's choices, fixes the decision
  // count; that at least six scenarios still play all five seasons is pinned
  // where it belongs, in coverage-shape.test.ts.
  const seasons = result.events.filter((event) => event.type === "season").length;
  expect(seasons).toBeGreaterThan(0);
  expect(result.akcje).toHaveLength(6 * seasons);
});
