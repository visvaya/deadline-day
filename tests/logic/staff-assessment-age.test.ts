import { describe, expect, test } from "vitest";

import { AGE_GROWTH_MAX, AGE_GROWTH_MIN, AGE_PROFILES } from "../../src/data/balance";
import type { Player, PositionCode, StaffConfidence } from "../../src/data/types";
import { createStaffAssessment } from "../../src/logic/staff-assessment";

/**
 * The scout report describes where a player can still GET to, not what his
 * ceiling says.
 *
 * develop() grows a player only while `wiek < peakStart`, closing the gap to
 * his ceiling by about a third each season, so the ceiling is a limit rather
 * than a destination. Reading it raw produced reports like "klasa europejska"
 * for a 24-year-old rated 66 with a ceiling of 78 - a level he has one season
 * left to reach and will miss by six points.
 */

const OUTLOOKS = ["limited", "leagueLevel", "leadingLeague", "aboveLeague"] as const;
const GROWTH = (AGE_GROWTH_MIN + AGE_GROWTH_MAX) / 2;

const player = (
  id: string,
  poz: PositionCode,
  wiek: number,
  ovr: number,
  sufit: number
): Player => ({
  id,
  nazwa: id,
  poz,
  wiek,
  ovr,
  sufit,
  moj: false,
  cenaZakupu: null,
  ageAtSigning: null,
  mnoznikPlacy: 1,
  wKlubieOd: 0,
  kontraktOd: 0,
  wygasa: false,
});

/** Where the player actually ends up, by the same curve develop() walks. */
const reachable = (ovr: number, sufit: number, wiek: number, poz: PositionCode): number => {
  let projected = ovr;
  for (let year = wiek; year < AGE_PROFILES[poz].peakStart; year += 1) {
    projected += (sufit - projected) * GROWTH;
  }
  return projected;
};

const band = (ovr: number): number => (ovr <= 62 ? 0 : ovr <= 70 ? 1 : ovr <= 75 ? 2 : 3);

/** Accuracy and confidence mix over a spread of ceilings, at one age. */
const survey = (wiek: number) => {
  const byConfidence: Record<string, number> = { high: 0, medium: 0, low: 0 };
  let hits = 0;
  let error = 0;
  let n = 0;

  for (let i = 0; i < 4000; i += 1) {
    const sufit = 58 + (i % 26);
    const ovr = Math.max(50, sufit - 4 - (i % 12));
    const assessment = createStaffAssessment(
      player(`a-${wiek}-${i}`, "ŚP", wiek, ovr, sufit),
      { season: 1, window: "summer" },
      "scout",
      null
    );
    if (assessment.focus !== "potential") continue;

    n += 1;
    byConfidence[assessment.confidence]! += 1;
    const said = OUTLOOKS.indexOf(assessment.outlook);
    const truth = band(reachable(ovr, sufit, wiek, "ŚP"));
    error += Math.abs(said - truth);
    if (said === truth) hits += 1;
  }

  return {
    n,
    accuracy: hits / n,
    error: error / n,
    share: (confidence: StaffConfidence) => byConfidence[confidence]! / n,
  };
};

describe("the outlook describes a reachable level", () => {
  test("does not promise a level the player has no seasons left to reach", () => {
    // The reported case. One growth season closes about a third of a 12-point
    // gap, so he finishes near 70 - "klasa europejska" starts at 76.
    const late = player("late", "ŚP", 24, 66, 78);
    expect(AGE_PROFILES["ŚP"].peakStart).toBe(25);

    for (let season = 1; season <= 20; season += 1) {
      const assessment = createStaffAssessment(late, { season, window: "summer" }, "scout", null);
      expect(assessment.focus).toBe("potential");
      expect(assessment.outlook).not.toBe("aboveLeague");
    }
  });

  test("the same ceiling still promises the top when the seasons are there", () => {
    // Not a blanket cap: the identical ceiling at 18 has seven seasons to work
    // with, and must still be able to read as European class.
    const early = player("early", "ŚP", 18, 60, 80);
    const outlooks = new Set(
      Array.from(
        { length: 40 },
        (_, i) =>
          createStaffAssessment(early, { season: i + 1, window: "summer" }, "scout", null).outlook
      )
    );

    expect(outlooks.has("aboveLeague")).toBe(true);
  });

  test("gets more accurate as the seasons run out", () => {
    const young = survey(17);
    const old = survey(24);

    expect(young.n).toBeGreaterThan(3000);
    expect(old.n).toBeGreaterThan(3000);
    // Measured 40% against 70%; the gap is what matters, not the exact values.
    expect(old.accuracy).toBeGreaterThan(young.accuracy + 0.2);
    expect(old.error).toBeLessThan(young.error - 0.3);
  });
});

describe("confidence", () => {
  test("is shown more often the closer a player is to his peak", () => {
    // It used to be flat at 35/40/25 for every age, which said a scout is as
    // often sure about a sixteen-year-old as about a player one season out.
    const young = survey(17);
    const old = survey(24);

    expect(old.share("high")).toBeGreaterThan(young.share("high") + 0.2);
    expect(old.share("low")).toBeLessThan(young.share("low") - 0.2);
  });

  test("is never low for a player one season from his peak", () => {
    // Not a distribution that merely gets rare - it must not appear at all.
    // Checked across ceilings and positions, since years-to-peak follows from
    // the position's own peakStart, not from a single number.
    for (const poz of ["ŚP", "BR", "LS", "ŚO"] as PositionCode[]) {
      const wiek = AGE_PROFILES[poz].peakStart - 1;
      for (let i = 0; i < 1500; i += 1) {
        const sufit = 58 + (i % 26);
        const assessment = createStaffAssessment(
          player(`n-${poz}-${i}`, poz, wiek, Math.max(50, sufit - 6), sufit),
          { season: (i % 5) + 1, window: i % 2 ? "summer" : "winter" },
          "scout",
          null
        );
        expect(assessment.focus).toBe("potential");
        expect(assessment.confidence, `${poz} ${wiek}`).not.toBe("low");
      }
    }
  });

  test("is still low often enough when the player is years away", () => {
    // The other side of it: removing low near the peak must not remove it
    // from the young players it describes correctly.
    expect(survey(17).share("low")).toBeGreaterThan(0.25);
  });

  test("still predicts accuracy, which is what makes it worth showing", () => {
    // Confidence must not become decoration: at a fixed age a "medium" read
    // has to beat a "low" one, or the label means nothing.
    //
    // Medium against low, not high against low: `high` is no longer drawn at
    // all. It is earned - a `current` report, a season from the peak, or three
    // observed seasons plus a peak range inside one band - and none of those
    // is reachable for this cohort of first-observation twenty-one-year-olds.
    // Its accuracy is measured where it is actually produced, by
    // scripts/staff-report-scan.ts.
    const readings: Record<string, { hits: number; n: number }> = {
      medium: { hits: 0, n: 0 },
      low: { hits: 0, n: 0 },
    };

    for (let i = 0; i < 6000; i += 1) {
      const sufit = 58 + (i % 26);
      const ovr = Math.max(50, sufit - 4 - (i % 12));
      const assessment = createStaffAssessment(
        player(`c-${i}`, "ŚP", 21, ovr, sufit),
        { season: 1, window: "summer" },
        "scout",
        null
      );
      const bucket = readings[assessment.confidence];
      if (!bucket) continue;

      bucket.n += 1;
      const said = OUTLOOKS.indexOf(assessment.outlook);
      if (said === band(reachable(ovr, sufit, 21, "ŚP"))) bucket.hits += 1;
    }

    expect(readings.medium!.n).toBeGreaterThan(500);
    expect(readings.low!.n).toBeGreaterThan(500);
    expect(readings.medium!.hits / readings.medium!.n).toBeGreaterThan(
      readings.low!.hits / readings.low!.n + 0.05
    );
  });
});
