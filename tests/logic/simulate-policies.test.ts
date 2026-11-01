import { expect, test } from "vitest";

import type { GameState, Offer, PositionCode } from "../../src/data/types";
import {
  alwaysTake,
  analystEdgeBuy,
  depthFirst,
  isOwnStar,
  veteranOnlyBuy,
  youngBuySellStars,
  youngOnlyBuy,
} from "../../src/logic/simulate-policies";
import { makeTestPlayer } from "./fixtures";

/**
 * PRZEDLUZENIE's cena is a wage ask, not a cash cost - canAfford must treat
 * it like SPRZEDAZ (never blocked by low kasa), or a low-cash policy would
 * wrongly degrade an affordable extension to "pas" and the balance
 * simulator would measure the wrong thing.
 */

const extensionCard = (overrides: Parameters<typeof makeTestPlayer>[1] = {}): Offer => ({
  typ: "PRZEDLUZENIE",
  zawodnik: makeTestPlayer("target", { wiek: 30, ...overrides }),
  cena: 5, // deliberately larger than the near-empty kasa below
  sourceClub: null,
  buyer: null,
  staffAssessment: {
    source: "scout",
    focus: "potential",
    outlook: "leagueLevel",
    confidence: "medium",
    isFirstObservation: true,
  },
  analystReport: {
    metrics: [
      { metricId: "goalsPreventedPer90", percentile: 50, value: 0 },
      { metricId: "positioningErrorAverage", percentile: 50, value: 2.06 },
    ],
    minutes: 900,
    sampleTier: "medium",
    period: { season: 1, window: "summer" },
    contextTier: "mid",
  },
});

const makeDepthFirstCard = (
  typ: "PRZEDLUZENIE" | "SPRZEDAZ" | "KUPNO",
  playerOverrides: Parameters<typeof makeTestPlayer>[1] = {}
): Offer => ({
  typ,
  zawodnik: makeTestPlayer("target", playerOverrides),
  cena: 5,
  sourceClub: null,
  buyer: typ === "SPRZEDAZ" ? { clubId: "lech-poznan", name: "Lech", origin: "domestic" } : null,
  staffAssessment: {
    source: "scout",
    focus: "potential",
    outlook: "leagueLevel",
    confidence: "medium",
    isFirstObservation: true,
  },
  analystReport: {
    metrics: [
      { metricId: "goalsPreventedPer90", percentile: 50, value: 0 },
      { metricId: "positioningErrorAverage", percentile: 50, value: 2.06 },
    ],
    minutes: 900,
    sampleTier: "medium",
    period: { season: 1, window: "summer" },
    contextTier: "mid",
  },
});

const makeSquadOf = (
  positions: Array<PositionCode>,
  count: number
): ReturnType<typeof makeTestPlayer>[] =>
  Array.from({ length: count }, (_, i) =>
    makeTestPlayer(`p${i + 1}`, { poz: positions[i % positions.length] })
  );

const runDepthFirstTest = (
  testName: string,
  cardType: "PRZEDLUZENIE" | "SPRZEDAZ" | "KUPNO",
  playerWiek: number,
  squadCount: number,
  expectedAction: string
): void => {
  test(testName, () => {
    const card = makeDepthFirstCard(cardType, { poz: "LO", wiek: playerWiek });
    const state = {
      kadra: makeSquadOf(["LO"], squadCount),
      kasa: 100,
      formacja: "4-3-3",
    } as GameState;
    const action = depthFirst({ card, index: 0, state });
    expect(action).toBe(expectedAction);
  });
};

test("alwaysTake accepts a PRZEDLUZENIE card even when its wage ask exceeds kasa", () => {
  const card = extensionCard();
  const action = alwaysTake({
    card,
    index: 0,
    state: { kasa: 0.01 } as never,
  });
  expect(action).toBe("bierz");
});

test("a buy-only aged policy still declines PRZEDLUZENIE - it isn't a purchase", () => {
  const card = extensionCard({ wiek: 32 }); // squarely in veteranOnlyBuy's band
  const action = veteranOnlyBuy({
    card,
    index: 0,
    state: { kasa: 100 } as never,
  });
  expect(action).toBe("pas");
});

/**
 * depthFirst is a measurement instrument for squad-depth erosion. It extends
 * its own players, sells only surplus (above design), and buys only into a
 * thinning position (below design). Unlike age filters, it's aware of position
 * depth and never self-destructs by selling its own squad out.
 */
runDepthFirstTest(
  "depthFirst accepts PRZEDLUZENIE (never sells own players)",
  "PRZEDLUZENIE",
  30,
  2,
  "bierz"
);

runDepthFirstTest(
  "depthFirst accepts SPRZEDAZ only when held count exceeds design + 1",
  "SPRZEDAZ",
  30,
  4,
  "bierz"
);

runDepthFirstTest(
  "depthFirst declines SPRZEDAZ when held count is at or below design + 1",
  "SPRZEDAZ",
  30,
  3,
  "pas"
);

runDepthFirstTest(
  "depthFirst accepts KUPNO only when held count is below design squad size",
  "KUPNO",
  24,
  1,
  "bierz"
);

runDepthFirstTest(
  "depthFirst accepts KUPNO when held count equals design squad size",
  "KUPNO",
  24,
  2,
  "bierz"
);

runDepthFirstTest(
  "depthFirst declines KUPNO when held count exceeds design squad size",
  "KUPNO",
  24,
  3,
  "pas"
);

/**
 * Measurement policy for a playable data-driven strategy. It controls for
 * visible OVR, but is not a causal control for the impact multiplier.
 */
const purchaseCard = (ovr: number, percentiles: [number, number], id = "target"): Offer => ({
  typ: "KUPNO",
  zawodnik: makeTestPlayer(id, { wiek: 24, ovr }),
  cena: 0.5,
  sourceClub: "Lech Poznań",
  buyer: null,
  staffAssessment: {
    source: "scout",
    focus: "potential",
    outlook: "leagueLevel",
    confidence: "medium",
    isFirstObservation: true,
  },
  analystReport: {
    metrics: [
      { metricId: "goalsPreventedPer90", percentile: percentiles[0], value: 0 },
      { metricId: "longBallCompletionPct", percentile: percentiles[1], value: 60 },
    ],
    minutes: 2000,
    sampleTier: "large",
    period: { season: 1, window: "summer" },
    contextTier: "mid",
  },
});

const rich = { kasa: 50 } as never;

test("analystEdgeBuy judges the report against what OVR already predicts", () => {
  // OVR 68 predicts the 48th percentile. Reading 70/70 is a real edge; reading
  // 48/48 is exactly par and must be passed on, however healthy it looks.
  const edge = purchaseCard(68, [70, 70]);
  const par = purchaseCard(68, [48, 48]);

  expect(analystEdgeBuy({ card: edge, index: 0, state: rich })).toBe("bierz");
  expect(analystEdgeBuy({ card: par, index: 0, state: rich })).toBe("pas");
});

test("analystEdgeBuy is not a disguised high-OVR filter", () => {
  // The whole point of subtracting the prediction. A 78-rated player reading
  // the 80th percentile is BELOW par (78 predicts 88) and gets passed on,
  // while a 62-rated player reading 40 is above par (62 predicts 24).
  const strongButPar = purchaseCard(78, [80, 80]);
  const weakButAhead = purchaseCard(62, [40, 40]);

  expect(analystEdgeBuy({ card: strongButPar, index: 0, state: rich })).toBe("pas");
  expect(analystEdgeBuy({ card: weakButAhead, index: 0, state: rich })).toBe("bierz");
});

test("analystEdgeBuy leaves the squad alone and only ever buys", () => {
  const sale = {
    ...purchaseCard(70, [99, 99]),
    typ: "SPRZEDAZ" as const,
    buyer: { clubId: "lech-poznan", name: "Lech", origin: "domestic" as const },
  };
  const extension = { ...purchaseCard(70, [99, 99]), typ: "PRZEDLUZENIE" as const };

  for (const card of [sale, extension]) {
    expect(analystEdgeBuy({ card, index: 0, state: rich })).toBe("pas");
  }
});

test("isOwnStar reads only our own signings in the top three by squad priority", () => {
  const squad = [
    makeTestPlayer("a", { ovr: 80, moj: true }),
    makeTestPlayer("b", { ovr: 79 }),
    makeTestPlayer("c", { ovr: 78, moj: true }),
    makeTestPlayer("d", { ovr: 77, moj: true }),
  ];
  expect(isOwnStar(squad, squad[0]!)).toBe(true);
  expect(isOwnStar(squad, squad[1]!)).toBe(false);
  expect(isOwnStar(squad, squad[2]!)).toBe(true);
  expect(isOwnStar(squad, squad[3]!)).toBe(false);
});

test("youngBuySellStars differs from youngOnlyBuy only on selling an own star", () => {
  // Not "target": makeDepthFirstCard names its player "target", and isOwnStar matches by id.
  const star = makeTestPlayer("star", { ovr: 90, moj: true, wiek: 22 });
  const state = { kadra: [star], kasa: 10, przeciagniecia: 0 } as unknown as GameState;
  const sale = { ...makeDepthFirstCard("SPRZEDAZ"), zawodnik: star };
  expect(youngOnlyBuy({ card: sale, state, index: 0 })).toBe("pas");
  expect(youngBuySellStars({ card: sale, state, index: 0 })).toBe("bierz");
  const outsiderSale = makeDepthFirstCard("SPRZEDAZ", { ovr: 50, moj: true });
  expect(youngBuySellStars({ card: outsiderSale, state, index: 0 })).toBe("pas");
  for (const typ of ["KUPNO", "PRZEDLUZENIE"] as const) {
    for (const wiek of [20, 23, 24, 31]) {
      const card = makeDepthFirstCard(typ, { wiek });
      expect(youngBuySellStars({ card, state, index: 0 })).toBe(
        youngOnlyBuy({ card, state, index: 0 })
      );
    }
  }
});

test("youngBuySellStars ignores moj set only on the card copy, not in the squad", () => {
  // The squad's own record of "star" carries moj: false; only the offer's
  // copy of the player claims moj: true. isOwnStar must read the squad, not
  // the card, so this must not be treated as an own-star sale.
  const star = makeTestPlayer("star", { ovr: 90, wiek: 22, moj: false });
  const state = { kadra: [star], kasa: 10, przeciagniecia: 0 } as unknown as GameState;
  const cardPlayerWithMoj = { ...star, moj: true };
  const sale = { ...makeDepthFirstCard("SPRZEDAZ"), zawodnik: cardPlayerWithMoj };
  expect(youngBuySellStars({ card: sale, state, index: 0 })).toBe("pas");
});
