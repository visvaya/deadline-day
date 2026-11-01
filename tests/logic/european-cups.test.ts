import { describe, expect, test } from "vitest";

import type { EuropeanCup, EuropeanSpot, LeagueStanding } from "../../src/data/types";
import { EUROPEAN_ADVANCE_ODDS, EUROPEAN_PRIZE_MONEY } from "../../src/data/balance";
import { createRng } from "../../src/logic/rng";
import {
  advanceProbabilities,
  assignEuropeanSpots,
  benchWeight,
  campaignMoney,
  drawPolishCupWinner,
  europeanExpectedIncome,
  resolveEuropeanCampaign,
  resolveEuropeanRun,
} from "../../src/logic/european-cups";

const table = (names: readonly string[]): LeagueStanding[] =>
  names.map((club, i) => ({ club, points: 100 - i, goalsFor: 0, goalsAgainst: 0 }));

const byClub = (a: EuropeanSpot, b: EuropeanSpot): number => a.klub.localeCompare(b.klub);

/** A full eighteen, because eligibility is counted off the bottom of the
 * table: on a six-row fixture the three relegation places would swallow
 * half the European ones. */
const LEAGUE = "A B C D E F G H I J K L M N O P Q R".split(" ");

const expectSpots = (spots: EuropeanSpot[], expected: readonly EuropeanSpot[]): void => {
  expect([...spots].sort(byClub)).toEqual([...expected].sort(byClub));
};

/** The berths as they fall when the cup winner is nobody's neighbour: the
 * top four take the league's own routes and the cup adds a second Europa
 * place further down. Every scenario below moves only where that second
 * Europa place lands - and, when it moves up, what fills the hole. */
const LEAGUE_ROUTES: readonly EuropeanSpot[] = [
  { klub: "A", puchar: "LM" },
  { klub: "B", puchar: "LM" },
  { klub: "C", puchar: "LE" },
  { klub: "D", puchar: "LK" },
];

/**
 * The invariant behind every case below: a club that finished higher never
 * plays a lower-ranked competition than a club beneath it. The one exception
 * is the cup winner, who is owed the Europa League by winning the cup
 * whatever his league position.
 */
const expectNoLeapfrog = (spots: EuropeanSpot[], cupWinner: string): void => {
  const ranked = LEAGUE.map((club) => spots.find((s) => s.klub === club)).filter(
    (s): s is EuropeanSpot => s !== undefined && s.klub !== cupWinner
  );
  for (let i = 1; i < ranked.length; i += 1) {
    expect(
      CUP_ORDER.indexOf(ranked[i]!.puchar),
      `${ranked[i]!.klub} (${ranked[i]!.puchar}) wyżej niż ${ranked[i - 1]!.klub} (${ranked[i - 1]!.puchar})`
    ).toBeGreaterThanOrEqual(CUP_ORDER.indexOf(ranked[i - 1]!.puchar));
  }
};

const CUP_ORDER: readonly EuropeanCup[] = ["LM", "LE", "LK"];

describe("assignEuropeanSpots", () => {
  test("third place plays the Europa League, not the Conference - Poland's current allocation", () => {
    const tabela = table(LEAGUE);
    const spots = assignEuropeanSpots(tabela, "E");

    expect(spots.find((s) => s.klub === "C")?.puchar).toBe("LE");
    expect(spots.filter((s) => s.puchar === "LE")).toHaveLength(2);
    expect(spots.filter((s) => s.puchar === "LK")).toHaveLength(1);
  });

  test("cup winner outside the top four takes the second LE place, 6th gets nothing", () => {
    const tabela = table(LEAGUE);
    const spots = assignEuropeanSpots(tabela, "E");

    expectSpots(spots, [...LEAGUE_ROUTES, { klub: "E", puchar: "LE" }]);
    expectNoLeapfrog(spots, "E");
  });

  /**
   * The cascade. When the cup winner already holds a league route, the berth
   * he releases does NOT jump to the first club without one - it moves down
   * a rung at a time, so fourth rises from the Conference to the Europa
   * League and fifth takes the Conference place.
   *
   * Until 2026-08-24 the game left fourth in the Conference and handed fifth
   * the Europa place, which put a worse-placed club in a better competition.
   * The real thing cascades: La Liga 2022/23, Copa won by second-placed Real
   * Madrid - sixth moved up to the Europa League and seventh took the
   * Conference place.
   */
  test("cup winner in 2nd place: the released LE cascades, 4th up and 5th in", () => {
    const spots = assignEuropeanSpots(table(LEAGUE), "B");

    expectSpots(spots, [
      { klub: "A", puchar: "LM" },
      { klub: "B", puchar: "LM" },
      { klub: "C", puchar: "LE" },
      { klub: "D", puchar: "LE" },
      { klub: "E", puchar: "LK" },
    ]);
    expectNoLeapfrog(spots, "B");
  });

  test("cup winner in 3rd place already holds LE, and the spare cascades the same way", () => {
    const spots = assignEuropeanSpots(table(LEAGUE), "C");

    expectSpots(spots, [
      { klub: "A", puchar: "LM" },
      { klub: "B", puchar: "LM" },
      { klub: "C", puchar: "LE" },
      { klub: "D", puchar: "LE" },
      { klub: "E", puchar: "LK" },
    ]);
    expectNoLeapfrog(spots, "C");
  });

  test("champion who also wins the cup plays LM, not LE - the case that was broken until 2026-08-13", () => {
    const spots = assignEuropeanSpots(table(LEAGUE), "A");

    expect(spots.find((s) => s.klub === "A")?.puchar).toBe("LM");
    expectSpots(spots, [
      { klub: "A", puchar: "LM" },
      { klub: "B", puchar: "LM" },
      { klub: "C", puchar: "LE" },
      { klub: "D", puchar: "LE" },
      { klub: "E", puchar: "LK" },
    ]);
    expectNoLeapfrog(spots, "A");
  });

  test("a relegated club never receives a spot, even as cup winner", () => {
    const spots = assignEuropeanSpots(table(LEAGUE), "R");

    expect(spots.some((s) => s.klub === "R")).toBe(false);
    // Nobody is owed the cup berth now, so the five routes simply run down
    // the table.
    expectSpots(spots, [
      { klub: "A", puchar: "LM" },
      { klub: "B", puchar: "LM" },
      { klub: "C", puchar: "LE" },
      { klub: "D", puchar: "LE" },
      { klub: "E", puchar: "LK" },
    ]);
  });

  test("all three relegated clubs are excluded, not just the bottom two", () => {
    const tabela = table(LEAGUE);

    for (const club of ["P", "Q", "R"]) {
      const spots = assignEuropeanSpots(tabela, club);
      expect(spots.some((s) => s.klub === club)).toBe(false);
    }
  });

  test("exactly five clubs qualify, whoever wins the cup", () => {
    for (const winner of LEAGUE) {
      const spots = assignEuropeanSpots(table(LEAGUE), winner);
      expect(spots, `zdobywca ${winner}`).toHaveLength(5);
      expect(
        spots.filter((s) => s.puchar === "LM"),
        `zdobywca ${winner}`
      ).toHaveLength(2);
      expect(
        spots.filter((s) => s.puchar === "LE"),
        `zdobywca ${winner}`
      ).toHaveLength(2);
      expect(
        spots.filter((s) => s.puchar === "LK"),
        `zdobywca ${winner}`
      ).toHaveLength(1);
    }
  });
});

describe("drawPolishCupWinner", () => {
  test("returns the player's club without drawing when the player won", () => {
    const tabela = table(["Piast", "Lech", "Legia"]);
    const rng = createRng(1);
    const before = rng.state();
    const winner = drawPolishCupWinner(rng, tabela, true, "Piast");
    expect(winner).toBe("Piast");
    expect(rng.state()).toBe(before);
  });

  test("draws a name from the table when the player did not win", () => {
    const tabela = table(["Piast", "Lech", "Legia", "Raków", "Jagiellonia"]);
    const rng = createRng(7);
    const winner = drawPolishCupWinner(rng, tabela, false, "Piast");
    expect(tabela.some((row) => row.club === winner)).toBe(true);
    expect(winner).not.toBe("Piast");
  });
});

describe("resolveEuropeanRun", () => {
  test("is deterministic for a fixed seed and consumes exactly one rng.next()", () => {
    const a = createRng(42);
    const b = createRng(42);
    const runA = resolveEuropeanRun(a, "LM", 70);
    const runB = resolveEuropeanRun(b, "LM", 70);
    expect(runA).toEqual(runB);
    expect(a.state()).toBe(b.state());
  });

  test("money always matches the prize table for the resolved stage", () => {
    const rng = createRng(2024);
    for (let i = 0; i < 50; i += 1) {
      const run = resolveEuropeanRun(rng, "LK", 65);
      expect(run.money).toBe(EUROPEAN_PRIZE_MONEY.LK[run.stage]);
    }
  });

  test("stronger squads reach the knockout stage more often than weaker ones", () => {
    const outcomes = (strength: number): number => {
      const rng = createRng(999);
      let knockouts = 0;
      for (let i = 0; i < 500; i += 1) {
        if (resolveEuropeanRun(rng, "LE", strength).stage === "knockout") knockouts += 1;
      }
      return knockouts;
    };
    expect(outcomes(85)).toBeGreaterThan(outcomes(55));
  });
});

describe("europeanExpectedIncome", () => {
  test("expected income exceeds the qualifying prize and grows with the cascade below it", () => {
    (["LM", "LE", "LK"] as const).forEach((cup) => {
      expect(europeanExpectedIncome(cup, 70)).toBeGreaterThan(EUROPEAN_PRIZE_MONEY[cup].qualifying);
    });
    // The bottom competition has nothing to drop into, so it alone stays
    // under its own knockout prize.
    expect(europeanExpectedIncome("LK", 70)).toBeLessThan(EUROPEAN_PRIZE_MONEY.LK.knockout);
  });

  test("increases with squad strength", () => {
    expect(europeanExpectedIncome("LM", 85)).toBeGreaterThan(europeanExpectedIncome("LM", 55));
  });
});

describe("benchWeight", () => {
  test("weights sum to 1 and the bench share grows with the cup's prestige", () => {
    const none = benchWeight(null);
    const lk = benchWeight("LK");
    const le = benchWeight("LE");
    const lm = benchWeight("LM");
    [none, lk, le, lm].forEach((w) => expect(w.xi + w.bench).toBeCloseTo(1, 10));
    expect(none.bench).toBeLessThan(lk.bench);
    expect(lk.bench).toBeLessThan(le.bench);
    expect(le.bench).toBeLessThan(lm.bench);
  });
});

/**
 * The product decision of 2026-09-02, pinned as behaviour.
 *
 * The golden master already fixes what these constants do in thirteen
 * particular careers, but it nowhere says what they MEAN: "31% at the
 * construction anchor and about 40% at the strength the game actually sends
 * into the Conference League". A retrace would happily absorb a different
 * number and stay green, which is exactly how a deliberate decision decays
 * into an accident. So the decision gets its own small, readable test.
 *
 * Measurement behind it: docs/decisions/european-cups-audit.md, chapters 9-12.
 */
describe("przyjęte prawdopodobieństwa LK (decyzja produktowa 2026-09-02)", () => {
  /** The median strength of the squad the engine really sends to the
   * Conference League, measured over 3000 headless careers. The decision was
   * taken by reading the curve HERE, not at the anchor. */
  const ENTRANT_STRENGTH = 68.4;

  test("31% w kotwicy modelu, ok. 40% przy medianie uczestnika, 56% na szczycie", () => {
    expect(advanceProbabilities("LK", 62).pQualify).toBeCloseTo(0.31, 10);
    expect(advanceProbabilities("LK", ENTRANT_STRENGTH).pQualify).toBeCloseTo(0.3989, 4);
    expect(advanceProbabilities("LK", 80).pQualify).toBeCloseTo(0.56, 10);
  });

  test("obniżenie dotyczy wyłącznie LK i wyłącznie progu, nie nachylenia", () => {
    // The slope is a STATED DESIGN ASSUMPTION, not a fitted value: one
    // observed rate is one equation in two unknowns. Whoever changes it is
    // making a new decision, and this test is where they find that out.
    expect(EUROPEAN_ADVANCE_ODDS.LK.pQualifySlope).toBe(0.25);
    expect(EUROPEAN_ADVANCE_ODDS.LK.pQualifyBase).toBe(0.31);
    // Untouched for a different reason: no real knockout-stage prize money is
    // pinned anywhere in the repo, so the game's ratio cannot be confronted
    // with anything. Out of scope until it is.
    expect(EUROPEAN_ADVANCE_ODDS.LK.pKnockoutBase).toBe(0.35);
    expect(EUROPEAN_ADVANCE_ODDS.LK.pKnockoutSlope).toBe(0.4);
    // The other two competitions were never part of the decision.
    expect(EUROPEAN_ADVANCE_ODDS.LM).toEqual({
      pQualifyBase: 0.25,
      pQualifySlope: 0.45,
      pKnockoutBase: 0.15,
      pKnockoutSlope: 0.35,
    });
    expect(EUROPEAN_ADVANCE_ODDS.LE).toEqual({
      pQualifyBase: 0.55,
      pQualifySlope: 0.35,
      pKnockoutBase: 0.25,
      pKnockoutSlope: 0.4,
    });
  });

  /** What the change is actually for. The bottom of the cascade barely
   * filtered before, so a club that reached the Conference League was more
   * likely than not to go through; now falling out is the common case. */
  test("odpadnięcie uczestnika LK jest teraz częstsze niż awans", () => {
    const eliminated = 1 - advanceProbabilities("LK", ENTRANT_STRENGTH).pQualify;
    expect(eliminated).toBeGreaterThan(0.5);
    expect(eliminated).toBeCloseTo(0.6011, 4);
  });
});

/** The three cases chapter 9 of docs/decisions/european-cups-audit.md asked for. Each pins a
 * property the audit tool relies on, so a change to the model cannot pass
 * quietly and then be discovered in a report nobody re-ran. */
describe("kontrakty modelu pucharowego (rozdział 9 audytu)", () => {
  const CUPS = ["LM", "LE", "LK"] as const;

  /** Only `edge` is clamped inside advanceProbabilities, never the result: a
   * slope above `1 - base` would push pQualify past one and make `r <
   * pQualify` always true, silently. No drawn stage can reveal that, which
   * is why the function is measured directly. */
  test("prawdopodobieństwa mieszczą się w [0, 1] na krańcach siatki i poza nią", () => {
    for (const cup of CUPS) {
      for (const strength of [-100, 40, 62, 70, 80, 200]) {
        const { pQualify, pKnockout } = advanceProbabilities(cup, strength);
        expect(pQualify).toBeGreaterThanOrEqual(0);
        expect(pQualify).toBeLessThanOrEqual(1);
        expect(pKnockout).toBeGreaterThanOrEqual(0);
        expect(pKnockout).toBeLessThanOrEqual(1);
      }
    }
  });

  /** The RNG contract the LK constants hang on: the bottom competition
   * terminates the cascade whatever it returns, so a campaign starting there
   * draws exactly once and changing its constants cannot move the cursor. */
  test("kampania startująca w LK pobiera dokładnie jedno losowanie", () => {
    for (const strength of [55, 62, 70, 80, 95]) {
      for (let seed = 1; seed <= 200; seed += 1) {
        let draws = 0;
        const inner = createRng(seed);
        const counting = {
          next: () => {
            draws += 1;
            return inner.next();
          },
          state: () => inner.state(),
          draws: () => draws,
        };
        const legs = resolveEuropeanCampaign(counting, "LK", strength);
        expect(draws).toBe(1);
        expect(legs).toHaveLength(1);
      }
    }
  });

  test("europeanExpectedIncome zgadza się ze średnią campaignMoney przy dużym n", () => {
    const runs = 20_000;
    for (const cup of CUPS) {
      const rng = createRng(0x4e05_7c01);
      let total = 0;
      for (let i = 0; i < runs; i += 1) {
        total += campaignMoney(resolveEuropeanCampaign(rng, cup, 68));
      }
      expect(total / runs).toBeCloseTo(europeanExpectedIncome(cup, 68), 1);
    }
  });
});
