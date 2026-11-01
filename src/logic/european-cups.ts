import type {
  EuropeanCup,
  EuropeanRun,
  EuropeanSpot,
  EuropeanStage,
  LeagueStanding,
} from "../data/types";
import {
  BENCH_WEIGHT,
  EUROPEAN_ADVANCE_ODDS,
  EUROPEAN_PRIZE_MONEY,
  RELEGATED_COUNT,
} from "../data/balance";
import { pick, type Rng } from "./rng";
import { mapAt } from "./invariant";

/** Nobody heading down gets a European place, however they finished on other
 * counts. Counted off the bottom of the table via RELEGATED_COUNT so the two
 * can never disagree - the previous version pinned the drop zone at an
 * absolute index 16, which stayed put when the league moved to three
 * relegations. Fixture tables in tests must therefore be a full eighteen:
 * on six rows the three relegation places swallow half the European ones. */
const eligibleCount = (tableSize: number): number => tableSize - RELEGATED_COUNT;

/** Ranked best to worst. A club offered two routes keeps the better one and
 * releases the other, which is what makes winning the double a reward rather
 * than a penalty. */
const CUP_RANK: Record<EuropeanCup, number> = { LM: 0, LE: 1, LK: 2 };

/**
 * Assigns the five european spots for next season from this season's final
 * table: 1st and 2nd take LM, 3rd takes LE, 4th takes LK, and the Polish Cup
 * winner takes LE - Poland's allocation in the current UEFA cycle, verified
 * against the entry lists for both competitions. Assigned at the end of one
 * season for the NEXT one, so the label on the berths is the following
 * season's, not the finished one's.
 *
 * The one case that needs a rule is a club holding two routes at once - a
 * cup winner who also finished in the top four. **It keeps the better route
 * and releases the worse one**, which then falls to the highest-placed club
 * without a spot. So a champion who also wins the cup plays LM (not LE) and
 * the LE berth cascades to 5th; a third-placed cup winner takes LE (better
 * than LK) and releases LK to 5th.
 *
 * Until 2026-08-13 the cup winner was handed LE unconditionally and removed
 * from the pool before league spots were dealt, which meant winning the
 * double COST the champion a Champions League place - observed in play
 * (Lech: 1st plus the cup, awarded LE). Brief section 5.7 described the same
 * broken cascade and was corrected in the same commit.
 *
 * When the cup winner is relegated (or otherwise outside the eligible pool),
 * the LE spot falls to the next unassigned club by table order, so exactly
 * five clubs always qualify. No rng - table order fully determines the result.
 */
export const assignEuropeanSpots = (
  tabela: readonly LeagueStanding[],
  polishCupWinner: string
): EuropeanSpot[] => {
  const eligible = tabela
    .filter((_row, index) => index < eligibleCount(tabela.length))
    .map((row) => row.club);

  // The berths this country holds, best first. Two Champions League, two
  // Europa League, one Conference League - the shape Poland's coefficient
  // buys in the current UEFA cycle, applied to the season AFTER the one that
  // just finished. It moves with the coefficient, so it is a fact about a
  // cycle rather than a rule: re-check it against UEFA's access list rather
  // than assuming it still holds.
  const BERTHS: readonly EuropeanCup[] = ["LM", "LM", "LE", "LE", "LK"];

  // Who gets one: the best-placed clubs, plus the cup winner wherever he
  // finished. Ordered by league position, because that is what decides which
  // berth each of them takes.
  const winnerEligible = eligible.includes(polishCupWinner);
  const size = Math.min(BERTHS.length, eligible.length);
  const top = eligible.slice(0, size);
  const recipients =
    winnerEligible && !top.includes(polishCupWinner)
      ? [...eligible.slice(0, size - 1), polishCupWinner]
      : top;

  // Berths go down the table in order, so a club that finished higher never
  // plays a lower-ranked competition than one below it. The single exception
  // is the cup winner, who is guaranteed the Europa League by winning the
  // cup - he takes a better berth only if his league position already earned
  // one.
  //
  // The previous version handed each club its own berth and then re-dealt
  // whatever was released to "the best-placed club still without one". That
  // reads plausibly and is wrong: with the cup winner in the top three, the
  // released Europa place jumped over fourth to fifth, so fifth played the
  // Europa League while fourth played the Conference. Real allocations
  // cascade instead - La Liga 2022/23, Copa won by second-placed Real
  // Madrid: sixth moved up from the Conference to the Europa League and
  // seventh took the Conference place.
  const remaining = [...BERTHS];
  const byClub = new Map<string, EuropeanCup>();

  if (winnerEligible) {
    const seat = recipients.indexOf(polishCupWinner);
    const byPosition = remaining[seat];
    // Better than LE if his finish earned it, otherwise the LE the cup owes
    // him. CUP_RANK is ascending, so "smaller" means "better".
    const take = byPosition !== undefined && CUP_RANK[byPosition] < CUP_RANK.LE ? byPosition : "LE";
    remaining.splice(remaining.indexOf(take), 1);
    byClub.set(polishCupWinner, take);
  }

  for (const klub of recipients) {
    if (byClub.has(klub)) continue;
    const berth = remaining.shift();
    if (berth === undefined) break;
    byClub.set(klub, berth);
  }

  // Table order, not claim order: the returned list is rendered as badges
  // next to league rows and read by tests positionally.
  return eligible
    .filter((klub) => byClub.has(klub))
    .map((klub) => ({ klub, puchar: mapAt(byClub, klub, "cup claim") }));
};

/** Mirrors the prototype's cup-winner draw for the league table, extended to
 * name a winner even when the player didn't win: no draw when the player
 * won (their own club is the known answer), one `pick()` from the table's
 * top eight otherwise. */
export const drawPolishCupWinner = (
  rng: Rng,
  tabela: readonly LeagueStanding[],
  playerWon: boolean,
  playerShort: string
): string => {
  if (playerWon) return playerShort;
  const candidates = tabela
    .filter((row) => row.club !== playerShort)
    .slice(0, 8)
    .map((row) => row.club);
  return pick(rng, candidates);
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** `edge` is 0 at strength 62 and 1 at 80+.
 *
 * Those two ends are the model's CONSTRUCTION POINTS, not measured league
 * averages: 62 was written down as "an average Ekstraklasa squad" and never
 * checked. Measured (pnpm audit:european-cups, 2026-09-02), the median
 * season-one squad in this game sits at 64.2, and the clubs that actually
 * play in Europe are stronger still - median 69.9 in the Champions League,
 * 68.5 in the Europa League, 68.4 in the Conference League. Read a
 * probability off this curve at the strength that actually shows up, never
 * at 62.
 *
 * Exported for measurement only - `pnpm audit:european-cups` and
 * tests/logic/european-cups.test.ts read it directly, because the [0, 1]
 * contract on the RESULT is not enforced anywhere (only `edge` is clamped)
 * and a test that can only observe drawn stages cannot see a pQualify above
 * one. No game code outside this module calls it. */
export const advanceProbabilities = (
  cup: EuropeanCup,
  strength: number
): { pQualify: number; pKnockout: number } => {
  const odds = EUROPEAN_ADVANCE_ODDS[cup];
  const edge = clamp01((strength - 62) / 18);
  return {
    pQualify: odds.pQualifyBase + odds.pQualifySlope * edge,
    pKnockout: odds.pKnockoutBase + odds.pKnockoutSlope * edge,
  };
};

/** One rng.next() per call - the campaign's whole outcome, not a round-by-round drawing. */
export const resolveEuropeanRun = (rng: Rng, cup: EuropeanCup, strength: number): EuropeanRun => {
  const { pQualify, pKnockout } = advanceProbabilities(cup, strength);
  const r = rng.next();
  const stage: EuropeanStage =
    r < pQualify * pKnockout ? "knockout" : r < pQualify ? "league" : "qualifying";
  return { cup, stage, money: EUROPEAN_PRIZE_MONEY[cup][stage] };
};

/** Where a club eliminated in qualifying continues. The bottom competition
 * has nowhere to drop to, which is what terminates the cascade. */
const CASCADE: Record<EuropeanCup, EuropeanCup | null> = { LM: "LE", LE: "LK", LK: null };

/** No rng - the expected value of resolveEuropeanCampaign's money, for the
 * HUD forecast. Recursive because failing qualifying is not the end: with
 * probability (1 - pQualify) the club drops a competition and earns again. */
export const europeanExpectedIncome = (cup: EuropeanCup, strength: number): number => {
  const { pQualify, pKnockout } = advanceProbabilities(cup, strength);
  const money = EUROPEAN_PRIZE_MONEY[cup];
  const pKnockoutStage = pQualify * pKnockout;
  const pLeagueStage = pQualify * (1 - pKnockout);
  const pQualifyingStage = 1 - pQualify;
  const own =
    pQualifyingStage * money.qualifying +
    pLeagueStage * money.league +
    pKnockoutStage * money.knockout;
  const next = CASCADE[cup];
  return next ? own + pQualifyingStage * europeanExpectedIncome(next, strength) : own;
};

/**
 * A whole european season as the list of legs actually played, in order.
 * Failing qualifying drops the club one competition down and it starts again
 * there; anything better than qualifying ends the campaign where it stands.
 *
 * This is the shape a third-party qualifying simulation shows: Lech appears
 * there in three rows (CL, EL, CF) for one season.
 *
 * Draws ONE rng.next() per leg, so one to three per campaign depending on how
 * far the club fell. Variable draw count is fine for determinism - the stream
 * is single and sequential - but it is part of the golden contract.
 */
export const resolveEuropeanCampaign = (
  rng: Rng,
  cup: EuropeanCup,
  strength: number
): EuropeanRun[] => {
  const legs: EuropeanRun[] = [];
  let current: EuropeanCup | null = cup;
  while (current) {
    const leg = resolveEuropeanRun(rng, current, strength);
    legs.push(leg);
    current = leg.stage === "qualifying" ? CASCADE[current] : null;
  }
  return legs;
};

/** Prize money for a whole campaign: every leg pays for how far it went. A
 * club knocked out of the Champions League qualifiers still banks that
 * payment before earning whatever the Europa League brings. */
export const campaignMoney = (legs: readonly EuropeanRun[]): number =>
  legs.reduce((total, leg) => total + leg.money, 0);

export const benchWeight = (cup: EuropeanCup | null): { xi: number; bench: number } =>
  BENCH_WEIGHT[cup ?? "none"];

export type SeasonalEuropeanOutcome = {
  polishCupWinner: string;
  europeanRun: EuropeanRun[];
  europeanSpots: EuropeanSpot[];
  nextCup: EuropeanCup | null;
};

/**
 * The whole european-cup story for one season's end, in the draw order
 * shared by game-reducer's symulujRunde and epilogue's runEpilogue: cup
 * winner, then this season's own campaign (if any), then next season's
 * assignment. Both call sites need the identical sequence to keep the
 * golden-master RNG stream aligned, so it lives here once.
 */
export const resolveSeasonalEuropeanOutcome = (
  rng: Rng,
  tabela: readonly LeagueStanding[],
  playerWonPolishCup: boolean,
  playerShort: string,
  currentCup: EuropeanCup | null,
  strength: number
): SeasonalEuropeanOutcome => {
  const polishCupWinner = drawPolishCupWinner(rng, tabela, playerWonPolishCup, playerShort);
  const europeanRun = currentCup ? resolveEuropeanCampaign(rng, currentCup, strength) : [];
  const europeanSpots = assignEuropeanSpots(tabela, polishCupWinner);
  const nextCup = europeanSpots.find((spot) => spot.klub === playerShort)?.puchar ?? null;
  return { polishCupWinner, europeanRun, europeanSpots, nextCup };
};
