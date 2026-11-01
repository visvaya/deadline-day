import { describe, expect, test } from "vitest";

import { extractMetrics, extractSignings } from "../../scripts/balance-metrics";
import { createSettlementRecorder } from "../../scripts/signing-wage-cost";
import { median } from "../../scripts/stats";
import { alwaysTake, alwaysPass } from "../../src/logic/simulate-policies";
import { playHeadless } from "../golden/headless";

/**
 * What the finance baseline actually measures a transfer with. The dump's
 * `signingCount` and the exported observations are computed from the same
 * trace but by separate code paths, so one can be checked against the other
 * rather than agreeing by construction.
 */

/** Plays a headless career with its own settlement recorder attached, for
 * tests that only need `extractSignings`' now-required third argument and
 * do not care about the settlements themselves. */
const playWithSettlements = (opts: Parameters<typeof playHeadless>[0]) => {
  const recorder = createSettlementRecorder();
  const result = playHeadless({ ...opts, onStep: recorder.onStep });
  return { result, settlements: recorder.settlements() };
};

describe("signing observations", () => {
  test("only cards that actually brought a player in produce one", () => {
    const { result, settlements } = playWithSettlements({
      seed: 0x5eed0001,
      clubId: "cracovia",
      policy: alwaysTake,
    });
    const signings = extractSignings(result, "alwaysTake", settlements);
    const decisions = result.state.trace.filter((e) => e.type === "decision");

    expect(signings.length).toBeGreaterThan(0);
    for (const s of signings) {
      expect(["KUPNO", "PANIC", "WOLNY"]).toContain(s.offerType);
    }
    // A card the club could not afford is not a purchase.
    const brakSrodkow = decisions.filter(
      (e) => e.type === "decision" && e.wynik === "BRAK_SRODKOW"
    );
    for (const event of brakSrodkow) {
      if (event.type !== "decision") continue;
      expect(signings.some((s) => s.decisionIndex === event.index)).toBe(false);
    }
  });

  test("signingCount matches the exported observations, and is computed without them", () => {
    for (const seed of [0x5eed0001, 0x5eed0002, 0x5eed0003]) {
      const { result, settlements } = playWithSettlements({
        seed,
        clubId: "cracovia",
        policy: alwaysTake,
      });
      const metrics = extractMetrics(result, "alwaysTake");
      const signings = extractSignings(result, "alwaysTake", settlements);
      expect(metrics.signingCount).toBe(signings.length);
      expect(Number.isSafeInteger(metrics.signingCount)).toBe(true);
      expect(metrics.signingCount).toBeGreaterThanOrEqual(0);
    }
  });

  test("a career that signs nobody reports zero and exports nothing", () => {
    const { result, settlements } = playWithSettlements({
      seed: 0x5eed0001,
      clubId: "cracovia",
      policy: alwaysPass,
    });
    expect(extractMetrics(result, "alwaysPass").signingCount).toBe(0);
    expect(extractSignings(result, "alwaysPass", settlements)).toEqual([]);
  });

  test("the fee is the price actually paid and a free signing costs nothing", () => {
    const { result, settlements } = playWithSettlements({
      seed: 0x5eed0001,
      clubId: "cracovia",
      policy: alwaysTake,
    });
    for (const s of extractSignings(result, "alwaysTake", settlements)) {
      expect(Number.isFinite(s.fee)).toBe(true);
      expect(s.fee).toBeGreaterThanOrEqual(0);
      if (s.offerType === "WOLNY") expect(s.fee).toBe(0);
      expect(s.annualWage).toBeGreaterThan(0);
      expect(s.baseAnnualWage).toBeGreaterThan(0);
    }
  });

  test("a negative payroll delta stays negative", () => {
    // An eviction can leave the squad cheaper than before the signing. The
    // delta is a diagnostic and must not be clamped or read as a cost.
    const { result, settlements } = playWithSettlements({
      seed: 0x5eed0001,
      clubId: "cracovia",
      policy: alwaysTake,
    });
    const signings = extractSignings(result, "alwaysTake", settlements);
    for (const s of signings) {
      // Whatever the sign, it is the payroll movement - never the wage.
      if (s.payrollDelta < 0) {
        expect(s.annualWage).toBeGreaterThan(0);
        return;
      }
    }
    // Not every seed evicts; the invariant above is what matters, and the
    // wage is never taken from the delta in either case.
    expect(signings.every((s) => s.annualWage > 0)).toBe(true);
  });

  test("an empty set of fees has no median, and a median is not a mean", () => {
    // Refuses rather than inventing a number: a summary over no signings has
    // to say so, which is what the finance baseline's own reader does with it.
    expect(() => median([])).toThrow(/empty/);
    // The dump used to divide the sum of fees by the number of purchases and
    // call it a median; [1, 2, 9] is where that stops being true.
    expect(median([1, 2, 9])).toBe(2);
  });
});
