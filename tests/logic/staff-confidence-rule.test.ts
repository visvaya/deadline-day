/**
 * The rising-confidence rule itself: what may move, what may not, and which
 * of the two exceptions wins when they disagree.
 *
 * Every assertion here is about a chain of seasons rather than a single call,
 * because the whole point of the change is that a report is no longer an
 * independent draw.
 */
import { describe, expect, test } from "vitest";

import { AGE_PROFILES } from "../../src/data/balance";
import type {
  Player,
  PositionCode,
  StaffConfidence,
  StaffMemo,
  StaffOutlook,
} from "../../src/data/types";
import {
  createStaffAssessment,
  observedSeasons,
  staffMemoOf,
  staffOutlookBoundaryReason,
  staffOutlookFromOvr,
} from "../../src/logic/staff-assessment";
import { peakOvrRange } from "../../src/logic/staff-projection";

const STEP: Record<StaffOutlook, number> = {
  limited: 0,
  leagueLevel: 1,
  leadingLeague: 2,
  aboveLeague: 3,
};
const LADDER: Record<StaffConfidence, number> = { low: 0, medium: 1, high: 2 };

const player = (overrides: Partial<Player>): Player => ({
  id: "rule-test",
  nazwa: "Test",
  poz: "ŚP",
  wiek: 18,
  ovr: 58,
  sufit: 76,
  moj: false,
  cenaZakupu: null,
  ageAtSigning: null,
  mnoznikPlacy: 1,
  wKlubieOd: 0,
  kontraktOd: 0,
  wygasa: false,
  ...overrides,
});

const youngPlayers = (count: number): Player[] =>
  Array.from({ length: count }, (_, i) =>
    player({
      id: `young-${i}`,
      poz: (["BR", "ŚO", "ŚPD", "ŚP", "LS"] as PositionCode[])[i % 5],
      wiek: 17 + (i % 6),
      ovr: 54 + (i % 14),
      sufit: 60 + (i % 30),
    })
  );

/**
 * A prospect whose peak range straddles a band boundary, so the guarantee gate
 * can never open for him however long he is watched.
 *
 * That matters for every cap test below: a guaranteed band is a proof and
 * outranks the freeze, exactly as the OVR floor does. Only a player without
 * one can show what the remembered confidence is actually limiting.
 */
const youngPlayerWithRoomBelowCeiling = (): Player =>
  player({ id: "roomy", poz: "ŚP", wiek: 18, ovr: 58, sufit: 77 });

/** Late enough that the range collapses into a single band. */
const playerOneSeasonBeforePeakWithSingleBandRange = (): Player => {
  const poz: PositionCode = "ŚP";
  return player({
    id: "near-peak",
    poz,
    wiek: AGE_PROFILES[poz].peakStart - 1,
    ovr: 66,
    sufit: 67,
  });
};

describe("rising confidence", () => {
  test("the cap fixture really is outside the guarantee", () => {
    // If this ever stops holding, every cap test below would be measuring the
    // guaranteed channel instead and would pass for the wrong reason.
    const range = peakOvrRange(youngPlayerWithRoomBelowCeiling());
    expect(staffOutlookFromOvr(range.minOvr)).not.toBe(staffOutlookFromOvr(range.maxOvr));
  });

  test("a guaranteed band outranks a frozen verdict, as the floor does", () => {
    // Not a hole in the freeze: the range provably ends in one band, so a
    // remembered verdict contradicting it is wrong rather than cautious.
    const subject = player({ id: "guaranteed", poz: "ŚP", wiek: 18, ovr: 58, sufit: 82 });
    const range = peakOvrRange(subject);
    expect(staffOutlookFromOvr(range.minOvr)).toBe(staffOutlookFromOvr(range.maxOvr));

    const memo = {
      season: 2,
      outlook: "leagueLevel",
      confidence: "high",
      seasonsObserved: 3,
    } as const;
    const report = createStaffAssessment(subject, { season: 3, window: "summer" }, "coach", memo);

    expect(report.outlook).toBe(staffOutlookFromOvr(range.minOvr));
    expect(report.confidence).toBe("high");
  });

  test("confidence never falls from one season to the next", () => {
    for (const subject of youngPlayers(500)) {
      let memo: StaffMemo | null = null;
      const seen: StaffConfidence[] = [];
      for (const season of [1, 2, 3, 4, 5]) {
        const report = createStaffAssessment(subject, { season, window: "summer" }, "coach", memo);
        seen.push(report.confidence);
        memo = staffMemoOf(report, season, memo);
      }
      for (let i = 1; i < seen.length; i += 1) {
        expect(LADDER[seen[i]!], `${subject.id} fell in season ${i + 1}`).toBeGreaterThanOrEqual(
          LADDER[seen[i - 1]!]
        );
      }
    }
  });

  test("a young newcomer cannot receive high confidence for potential", () => {
    const report = createStaffAssessment(
      youngPlayerWithRoomBelowCeiling(),
      { season: 1, window: "summer" },
      "scout",
      null
    );

    expect(report.focus).toBe("potential");
    expect(report.confidence).not.toBe("high");
  });

  test("a first-season player near peak can receive guaranteed high", () => {
    const subject = playerOneSeasonBeforePeakWithSingleBandRange();
    const range = peakOvrRange(subject);
    expect(staffOutlookFromOvr(range.minOvr)).toBe(staffOutlookFromOvr(range.maxOvr));

    const report = createStaffAssessment(subject, { season: 1, window: "summer" }, "scout", null);

    expect(report.focus).toBe("potential");
    expect(report.confidence).toBe("high");
    expect(report.outlook).toBe(staffOutlookFromOvr(range.minOvr));
  });

  test("high confidence can be earned after a long visible observation", () => {
    // Three years out, so the nearPeak gate is shut - only tenure can open it,
    // and only with a range that fits inside one band.
    const poz: PositionCode = "ŚP";
    const subject = player({
      id: "tenured",
      poz,
      wiek: AGE_PROFILES[poz].peakStart - 3,
      ovr: 64,
      sufit: 65,
    });
    const memo = {
      season: 3,
      outlook: "leagueLevel",
      confidence: "medium",
      seasonsObserved: 3,
    } as const;

    const report = createStaffAssessment(subject, { season: 4, window: "summer" }, "coach", memo);

    expect(report.confidence).toBe("high");
  });

  test("a high-confidence verdict does not move at all while the OVR floor is slack", () => {
    // The floor may lift a frozen verdict (that is exception 1), so this test
    // holds OVR still. What it pins is the thing that matters: a fresh
    // observation may not change a high-confidence mind on its own.
    const subject = youngPlayerWithRoomBelowCeiling();
    const memo = {
      season: 2,
      outlook: "leagueLevel",
      confidence: "high",
      seasonsObserved: 2,
    } as const;

    for (const season of [3, 4, 5]) {
      const report = createStaffAssessment(subject, { season, window: "summer" }, "coach", memo);
      expect(report.outlook).toBe("leagueLevel");
      expect(report.confidence).toBe("high");
    }
  });

  test("the visible OVR floor outranks the freeze", () => {
    // Exception 1, and it wins: a verdict frozen at "limited" beside a visible
    // 74 is a wrong signal, not a confident one.
    const grown = player({ id: "grown", ovr: 74, sufit: 82 });
    const memo = { season: 2, outlook: "limited", confidence: "high", seasonsObserved: 2 } as const;

    const report = createStaffAssessment(grown, { season: 3, window: "summer" }, "coach", memo);

    expect(STEP[report.outlook]).toBeGreaterThanOrEqual(STEP[staffOutlookFromOvr(74)]);
  });

  test("a medium-confidence verdict moves by at most one step, before the floor", () => {
    const subject = youngPlayerWithRoomBelowCeiling();
    // Slack floor: OVR 58 lands in "limited", so it cannot lift anything here.
    expect(staffOutlookFromOvr(subject.ovr)).toBe("limited");

    for (const outlook of ["limited", "leagueLevel", "leadingLeague", "aboveLeague"] as const) {
      const memo = { season: 2, outlook, confidence: "medium", seasonsObserved: 2 } as const;
      const report = createStaffAssessment(subject, { season: 3, window: "summer" }, "coach", memo);

      expect(Math.abs(STEP[report.outlook] - STEP[outlook])).toBeLessThanOrEqual(1);
    }
  });

  test("a low-confidence verdict moves by at most two steps", () => {
    const subject = youngPlayerWithRoomBelowCeiling();

    for (const outlook of ["limited", "leagueLevel", "leadingLeague", "aboveLeague"] as const) {
      const memo = { season: 2, outlook, confidence: "low", seasonsObserved: 2 } as const;
      const report = createStaffAssessment(subject, { season: 3, window: "summer" }, "coach", memo);

      expect(Math.abs(STEP[report.outlook] - STEP[outlook])).toBeLessThanOrEqual(2);
    }
  });

  test("both windows of one season give the same report", () => {
    const subject = youngPlayerWithRoomBelowCeiling();
    const memo = {
      season: 1,
      outlook: "leagueLevel",
      confidence: "low",
      seasonsObserved: 1,
    } as const;

    const summer = createStaffAssessment(subject, { season: 3, window: "summer" }, "coach", memo);
    const winter = createStaffAssessment(subject, { season: 3, window: "winter" }, "coach", memo);

    expect(winter).toEqual(summer);
  });

  test("the scout and the coach give one judgement, not two independent ones", () => {
    const subject = youngPlayerWithRoomBelowCeiling();
    const period = { season: 2, window: "summer" } as const;

    const scout = createStaffAssessment(subject, period, "scout", null);
    const coach = createStaffAssessment(subject, period, "coach", null);

    expect(coach.outlook).toBe(scout.outlook);
    expect(coach.confidence).toBe(scout.confidence);
    expect(coach.source).toBe("coach"); // the label still names who is speaking
  });

  test("the potential report stops existing once the player reaches his peak", () => {
    // Exception 2: a frozen high-confidence read of a teenager must not follow
    // him for the rest of his career.
    const poz: PositionCode = "ŚP";
    const atPeak = player({ id: "at-peak", poz, wiek: AGE_PROFILES[poz].peakStart });
    const memo = {
      season: 2,
      outlook: "aboveLeague",
      confidence: "high",
      seasonsObserved: 2,
    } as const;

    const report = createStaffAssessment(atPeak, { season: 5, window: "summer" }, "coach", memo);

    expect(report.focus).toBe("current");
    expect(report.outlook).toBe(staffOutlookFromOvr(atPeak.ovr));
  });

  test("re-reading the current season's report does not move it", () => {
    // Without this the cap would be applied twice to the same draw: memo
    // medium/limited, a draw of aboveLeague stored as leagueLevel, then a
    // second call capping aboveLeague against leagueLevel and landing on
    // leadingLeague. position-reports.tsx rebuilds this on every render.
    const subject = youngPlayerWithRoomBelowCeiling();
    const memo = {
      season: 3,
      outlook: "leagueLevel",
      confidence: "medium",
      seasonsObserved: 3,
    } as const;
    const period = { season: 3, window: "summer" } as const;

    for (let i = 0; i < 5; i += 1) {
      const report = createStaffAssessment(subject, period, "coach", memo);
      expect(report.outlook).toBe("leagueLevel");
      expect(report.confidence).toBe("medium");
    }
  });

  test("the first observation is flagged for the first season only", () => {
    const subject = youngPlayerWithRoomBelowCeiling();
    const first = createStaffAssessment(subject, { season: 1, window: "summer" }, "coach", null);
    expect(first.isFirstObservation).toBe(true);

    const memo = staffMemoOf(first, 1, null);
    const second = createStaffAssessment(subject, { season: 2, window: "summer" }, "coach", memo);
    expect(second.isFirstObservation).toBe(false);
    expect(observedSeasons(memo, 2)).toBe(2);
  });
});

/**
 * The replacement distribution, pinned as the hand-picked table it is. A plain
 * renormalisation of the old three weights would give different numbers, and
 * silently drifting onto them is exactly what this test exists to stop.
 */
describe("NO_HIGH_CONFIDENCE_ODDS", () => {
  const shareLow = (poz: PositionCode, wiek: number): number => {
    let low = 0;
    const n = 20_000;
    for (let i = 0; i < n; i += 1) {
      const subject = player({ id: `odds-${poz}-${wiek}-${i}`, poz, wiek, ovr: 58, sufit: 88 });
      const report = createStaffAssessment(subject, { season: 1, window: "summer" }, "coach", null);
      expect(report.confidence).not.toBe("high");
      if (report.confidence === "low") low += 1;
    }
    return low / n;
  };

  const peak = AGE_PROFILES["ŚP"].peakStart;

  test.each([
    ["0-1 years out", peak - 1, 0],
    ["2-3 years out", peak - 3, 0.41],
    ["4-5 years out", peak - 5, 0.5],
    ["more than 5 years out", peak - 7, 0.55],
  ])("%s draws low at the pinned rate", (_label, wiek, expected) => {
    expect(shareLow("ŚP", wiek)).toBeCloseTo(expected, 1);
  });
});

describe("staffOutlookBoundaryReason", () => {
  const high = (focus: "current" | "potential", outlook: StaffOutlook) =>
    ({ confidence: "high", focus, outlook }) as const;

  test.each([
    [62, "currentUp"],
    [63, "currentDown"],
    [70, "currentUp"],
    [71, "currentDown"],
    [75, "currentUp"],
    [76, "currentDown"],
  ] as const)("a current report at OVR %i warns about %s", (ovr, reason) => {
    expect(staffOutlookBoundaryReason(high("current", staffOutlookFromOvr(ovr)), ovr)).toBe(reason);
  });

  test("a current report away from a boundary warns about nothing", () => {
    expect(staffOutlookBoundaryReason(high("current", staffOutlookFromOvr(67)), 67)).toBeNull();
  });

  test("a potential report warns only when the floor itself is about to rise", () => {
    // The forecast sits exactly on today's floor, and +1 moves that floor up.
    expect(staffOutlookBoundaryReason(high("potential", staffOutlookFromOvr(62)), 62)).toBe(
      "potentialFloorUp"
    );
  });

  test("a forecast above the floor is not a boundary case", () => {
    // Counterexample: at OVR 62 the new floor after +1 is
    // "leagueLevel", which still does not reach a remembered "leadingLeague".
    expect(staffOutlookBoundaryReason(high("potential", "leadingLeague"), 62)).toBeNull();
  });

  test("a potential report gets no warning about a fall", () => {
    // A drop in OVR does not lower a frozen forecast, so there is nothing to
    // explain on that side.
    const onlyDownMatters = staffOutlookFromOvr(63);
    expect(staffOutlookBoundaryReason(high("potential", onlyDownMatters), 63)).toBeNull();
  });

  test.each(["low", "medium"] as const)("a %s report never carries a boundary warning", (level) => {
    expect(
      staffOutlookBoundaryReason({ confidence: level, focus: "current", outlook: "limited" }, 62)
    ).toBeNull();
  });
});
