import { expect, test } from "vitest";

import { simulateGame } from "../../src/logic/simulate";
import { alwaysTake } from "../../src/logic/simulate-policies";
import { playerWage } from "../../src/logic/wages";
import { makeTestPlayer } from "../logic/fixtures";
import { createSettlementRecorder, wageCostOf } from "../../scripts/signing-wage-cost";

test("one settlement per played tenure season, each matching the charged payroll", () => {
  const recorder = createSettlementRecorder();
  const result = simulateGame({
    seed: 777,
    clubId: "wisla-krakow",
    policy: alwaysTake,
    onStep: recorder.onStep,
  });
  const seasons = result.events.filter((e) => e.type === "season");
  expect(recorder.settlements().map((s) => s.season)).toEqual(seasons.map((e) => e.sezon));
});

test("wage cost sums the player's wage over the settlements he was in", () => {
  const a = makeTestPlayer("a", { ovr: 70, mnoznikPlacy: 1.5 });
  const b = makeTestPlayer("b", { ovr: 60 });
  const aOlder = { ...a, ovr: 72 };
  const settlements = [
    { season: 1, squad: [a, b], chargedPayroll: 0 },
    { season: 2, squad: [aOlder], chargedPayroll: 0 },
    { season: 3, squad: [b], chargedPayroll: 0 },
  ];
  expect(wageCostOf(settlements, "a")).toEqual({
    seasonsOnPayroll: 2,
    wageCostToHandover: playerWage(a) + playerWage(aOlder),
  });
  expect(wageCostOf(settlements, "nobody")).toEqual({ seasonsOnPayroll: 0, wageCostToHandover: 0 });
});

test("a settlement whose squad does not explain the charged payroll is an error", () => {
  const recorder = createSettlementRecorder();
  const squad = [makeTestPlayer("a", { ovr: 70 })];
  const before = { kadra: squad, trace: [] } as never;
  const after = {
    kadra: squad,
    trace: [{ type: "season", sezon: 1, place: 99 }],
  } as never;
  expect(() => recorder.onStep(before, after)).toThrow(/payroll/);
});
