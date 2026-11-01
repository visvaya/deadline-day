import { describe, expect, test } from "vitest";

import { SQUAD_BENCH_BUFFER } from "../../src/data/balance";
import { FORMACJE } from "../../src/data/positions";
import type { Player } from "../../src/data/types";
import { selectAnalystProfile } from "../../src/logic/analyst-profile";
import {
  acquisitionCapacityOutcome,
  bySquadPriority,
  startingXi,
  substitutes,
} from "../../src/logic/squad";
import { makeTestPlayer } from "./fixtures";

const FORMATION = FORMACJE["4-3-3"];
const POSITION_CAPACITY =
  FORMATION.pozycje.find((slot) => slot.kod === "ŚO")!.kadra + SQUAD_BENCH_BUFFER;
const player = (id: string, overrides: Partial<Player> = {}): Player =>
  makeTestPlayer(id, {
    nazwa: "Jan Kowalski",
    poz: "ŚO",
    wiek: 22,
    ovr: 68,
    sufit: 80,
    ...overrides,
  });

const pairWithEdgeDirection = (direction: "rises" | "falls"): readonly [Player, Player] => {
  const candidates = Array.from({ length: 64 }, (_, index) =>
    player(`edge-${index.toString().padStart(3, "0")}`)
  );
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const firstEdge = selectAnalystProfile(candidates[i]!).marketEdge;
      const secondEdge = selectAnalystProfile(candidates[j]!).marketEdge;
      if (
        (direction === "rises" && firstEdge < secondEdge) ||
        (direction === "falls" && firstEdge > secondEdge)
      ) {
        return [candidates[i]!, candidates[j]!];
      }
    }
  }
  throw new Error(`No lexical id pair whose market edge ${direction}`);
};

describe("squad priority", () => {
  test("higher ovr comes first", () => {
    expect(
      bySquadPriority(player("higher", { ovr: 70 }), player("lower", { ovr: 68 }))
    ).toBeLessThan(0);
  });

  test("on equal ovr the younger player comes first", () => {
    const young = player("young", { wiek: 19 });
    const old = player("old", { wiek: 27 });

    expect(bySquadPriority(young, old)).toBeLessThan(0);
    expect(bySquadPriority(old, young)).toBeGreaterThan(0);
  });

  test("on equal ovr and age the Polish collation decides", () => {
    // Pinned locale, same decision as sortStandings in league.ts: the default
    // reads the machine's locale and Polish diacritics collate differently
    // under English rules, which would make golden traces machine-dependent.
    const a = player("lukasz", { nazwa: "Łukasz Nowak" });
    const b = player("marek", { nazwa: "Marek Nowak" });

    expect(bySquadPriority(a, b)).toBeLessThan(0);
  });

  test("identical ovr, age and name still order deterministically by id", () => {
    // Names come from IMIONA/NAZWISKA pools, so a full collision is possible.
    // Without the id tie-break this would fall back to array order - the very
    // thing this change removes.
    const a = player("a");
    const b = player("b");

    expect(bySquadPriority(a, b)).toBeLessThan(0);
    expect(bySquadPriority(b, a)).toBeGreaterThan(0);
  });

  test("the comparator is total and antisymmetric across deliberate visible collisions", () => {
    const squad = Array.from({ length: 128 }, (_, index) =>
      player(`collision-${index.toString().padStart(3, "0")}`)
    );

    for (let i = 0; i < squad.length; i += 1) {
      expect(bySquadPriority(squad[i]!, squad[i]!), squad[i]!.id).toBe(0);
      for (let j = i + 1; j < squad.length; j += 1) {
        const forward = bySquadPriority(squad[i]!, squad[j]!);
        const reverse = bySquadPriority(squad[j]!, squad[i]!);
        expect(forward, `${squad[i]!.id} vs ${squad[j]!.id}`).not.toBe(0);
        expect(Math.sign(forward)).toBe(-Math.sign(reverse));
      }
    }
  });

  test("the eleven gives an equal-ovr shirt to the younger player", () => {
    const young = player("young", { wiek: 20 });
    const old = player("old", { wiek: 28 });
    const lower = player("lower", { ovr: 67 });

    expect(startingXi([old, lower, young], FORMATION).map(({ id }) => id)).toEqual([
      "young",
      "old",
    ]);
  });

  test("the substitutes use the same order", () => {
    const squad = [
      player("starter-a", { ovr: 80 }),
      player("starter-b", { ovr: 79 }),
      player("old-reserve", { wiek: 28 }),
      player("young-reserve", { wiek: 20 }),
    ];

    expect(substitutes(squad, FORMATION).map(({ id }) => id)).toEqual([
      "young-reserve",
      "old-reserve",
    ]);
  });

  test("changing only the hidden ceiling does not change the order", () => {
    const a = player("a", { sufit: 94 });
    const b = player("b", { sufit: 68 });

    expect(bySquadPriority(a, b)).toBe(bySquadPriority({ ...a, sufit: 68 }, { ...b, sufit: 94 }));
  });

  test("the id fallback follows lexical identity, not market edge", () => {
    const rising = pairWithEdgeDirection("rises");
    const falling = pairWithEdgeDirection("falls");

    expect(bySquadPriority(rising[0], rising[1])).toBeLessThan(0);
    expect(bySquadPriority(falling[0], falling[1])).toBeLessThan(0);
  });

  test("a player fits while the position remains within capacity", () => {
    const squad = Array.from({ length: POSITION_CAPACITY - 1 }, (_, index) =>
      player(`existing-${index}`)
    );

    expect(acquisitionCapacityOutcome(squad, player("incoming"), FORMATION)).toEqual({
      kind: "fits",
    });
  });

  test("the older existing player is evicted on equal bottom ovr", () => {
    const squad = [
      ...Array.from({ length: POSITION_CAPACITY - 2 }, (_, index) =>
        player(`safe-${index}`, { ovr: 70 })
      ),
      player("young-bottom", { ovr: 60, wiek: 21 }),
      player("old-bottom", { ovr: 60, wiek: 35 }),
    ];

    expect(acquisitionCapacityOutcome(squad, player("incoming", { ovr: 75 }), FORMATION)).toEqual({
      kind: "evictsExisting",
      player: expect.objectContaining({ id: "old-bottom" }),
    });
  });

  test("an incoming player who would rank last is rejected", () => {
    const squad = Array.from({ length: POSITION_CAPACITY }, (_, index) =>
      player(`safe-${index}`, { ovr: 70 })
    );

    expect(acquisitionCapacityOutcome(squad, player("incoming", { ovr: 59 }), FORMATION)).toEqual({
      kind: "rejectsIncoming",
    });
  });

  test("the capacity helper never mutates the squad it was handed", () => {
    const squad = [
      player("b-low", { ovr: 60 }),
      player("a-high", { ovr: 80 }),
      ...Array.from({ length: POSITION_CAPACITY - 2 }, (_, index) =>
        player(`safe-${index}`, { ovr: 70 })
      ),
    ];
    const order = squad.map(({ id }) => id);

    acquisitionCapacityOutcome(squad, player("incoming", { ovr: 75 }), FORMATION);

    expect(squad.map(({ id }) => id)).toEqual(order);
  });
});
