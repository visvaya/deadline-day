import {
  KOSZTY_STALE,
  LEGACY_KASA,
  LEGACY_SPADEK,
  LEGACY_WARTOSC_KADRY,
  MONEY_SCALE_PLN_PER_GAME_MILLION,
  PUCHAR_POLSKI_PREMIA,
  SUPERPUCHAR_PREMIA,
  leaguePositionPrize,
} from "../src/data/balance";
import type { BuyerOrigin, LegacyBreakdown, Offer, OfferType } from "../src/data/types";
import { ENGINE_REVISION } from "../src/logic/engine-version";
import { zaokr } from "../src/logic/format";
import type { PlayResult } from "../src/logic/simulate";
import type { TraceEvent } from "../src/logic/trace-format";
import { TYTULY } from "../src/logic/epilogue";
import type { SettlementSnapshot } from "./signing-wage-cost";
import { wageCostOf } from "./signing-wage-cost";
import {
  distribution,
  mean,
  median,
  pairedComparison,
  percent,
  summarize,
  type Summary,
} from "./stats";
import { at } from "../src/logic/invariant";

/** Mirrors the four branches of computeVerdict in src/logic/scoring.ts, in
 * ascending order of tenure outcome. Fixed here only for stable table
 * columns - scoring.ts has no array of its own to import, since the titles
 * are inline literals in an if/else chain that must stay golden-stable. */
export const WERDYKTY = [
  "ROZWIĄZANIE KONTRAKTU",
  "KLUB Z DOŁU TABELI",
  "KLUB Z CZOŁÓWKI",
  "KLUB Z ZAGRANICY",
];

/** The five card types a window can show, fixed here for stable CSV
 * columns. Order matches the raw dump's trailing offer columns. */
export const OFFER_TYPES: readonly OfferType[] = [
  "KUPNO",
  "SPRZEDAZ",
  "PRZEDLUZENIE",
  "WOLNY",
  "PANIC",
];

/**
 * Version 2 added the club, the income mode and the signing count. Version 3
 * adds the career's final `rngDrawCount`. Version 4 adds the three cup
 * receipts and their sum to the SEASON dump; the raw dump is unchanged, and
 * shares the version because both files are written by one run and a reader
 * that had to know which of two numbers applied to which file would be the
 * next thing to get wrong. Version 5 drops `poziom` - there is no difficulty
 * left to record, a club names its own strength - and adds `clubId` as the
 * canonical join column; `clubShortName` stays, but only as presentation.
 *
 * Read by header, never positionally, by every consumer - so the version is a
 * statement of what the file contains, not an instruction on where to look.
 * Historical schema-2 dumps stay readable: the 2026-09-07 finance baseline is
 * pinned at 2 and is never regenerated.
 */
export const DUMP_SCHEMA_VERSION = 5;

/**
 * The schema from which a season row carries the three cup receipts and their
 * sum. Named rather than written as a literal 4, because the readers below
 * ask "does this row have cups?" and not "is this the current version?".
 */
export const CUP_INCOME_SCHEMA_VERSION = 4;

/**
 * Every schema a reader in this repo accepts, newest last.
 *
 * A SET, not an equality against `DUMP_SCHEMA_VERSION`. Two pinned artefacts
 * in the repository - the 2026-09-10 activation dumps and the RNG snapshot
 * taken alongside them - are schema 3, and an equality check would have made
 * the activation report unreproducible the moment the version moved. The
 * columns a newer schema adds are optional on an older row and required on a
 * newer one; what is never allowed is reading an absent column as a zero.
 */
export const ACCEPTED_DUMP_SCHEMA_VERSIONS: readonly number[] = [3, 4, 5];

export const DUMP_COLUMNS = [
  "clubId",
  "polityka",
  "seed",
  "dziedzictwo",
  "dziedzictwoZHandicapem",
  "tytul",
  "werdykt",
  "ocena",
  "wartoscKadry",
  "wartoscKadryMoj",
  "sezonyLM",
  "sezonyLE",
  "sezonyLK",
  "kasaEuro",
  "squadSizeAtHandover",
  "squadSizeEnd",
  "kasa",
  "pktA",
  "pktB",
  "trofea",
  "spadki",
  "kadraMojAtHandover",
  "handoverSeason",
  "spadkiKadencja",
  "pierwszySpadekSezon",
  "sezonyRozegrane",
  "ofertyKupno",
  "ofertySprzedaz",
  "ofertyPrzedluzenie",
  "ofertyWolny",
  "ofertyPanic",
  // Every reader here - and legacy-scan-core's parseCsv - reads by header
  // name, never positionally, so nothing below needs to stay at the tail.
  // clubShortName is presentation only from schema 5 on: clubId is the join
  // column now.
  "clubShortName",
  "incomeMode",
  "dumpSchemaVersion",
  "signingCount",
  "rngDrawCount",
] as const;

/**
 * The season dump's columns, in file order.
 *
 * Lives beside `FinanceSeasonObservation` rather than in `balance.ts`, because
 * `balance.ts` runs the simulator on import: a reader that wanted to check a
 * fixture against the real header had no way to ask, and copied the list
 * instead. One list, one place to append to.
 */
export const SEASON_COLUMNS = [
  "dumpSchemaVersion",
  "engineVersion",
  "incomeMode",
  "clubShortName",
  "policyName",
  "seed",
  "season",
  "initialBudget",
  "preseasonForecastBalanceWithoutTransfersAndCups",
  "actualBalanceWithoutTransfersAndCups",
  "scaledRecurringRevenue",
  "leaguePositionPrize",
  "totalPayroll",
  "fixedCosts",
  "scalableNetPln",
  "cashAtHandover",
  // Appended, never inserted. Every reader of this file looks columns up by
  // header, but the raw dump next door is destructured positionally by
  // legacy-scan-core, and keeping one habit across both files is cheaper than
  // remembering which of them tolerates a reorder.
  "europeanPrizeIncome",
  "polishCupPrizeIncome",
  "superCupPrizeIncome",
  "creditedCupIncome",
  "rngDrawCount",
] as const;

export type GameMetrics = {
  seed: number;
  /** The club actually played - the canonical id, always known since
   * `--clubs` is the run's only dimension. */
  clubId: string;
  /** The same club's short display name, for the ascii/markdown tables. */
  klub: string;
  policyName: string;
  dziedzictwo: number;
  tytul: string;
  kasaKoncowa: number;
  werdyktTytul: string;
  ocenaKadencji: number;
  spadek: boolean;
  mistrzostwa: number;
  puchary: number;
  udzialBierz: number;
  wynikRozklad: Record<string, number>;
  breakdown: LegacyBreakdown;
  miejsceSezony: number[];
  miejsceEpilog: number[];
  /** Seasons (of the five controlled ones) spent playing in each cup. */
  sezonyLM: number;
  sezonyLE: number;
  sezonyLK: number;
  /** Total income from european campaigns across the five controlled seasons. */
  kasaEuro: number;
  /** Squad size at the end of season 5. */
  squadSizeAtHandover: number;
  /** Squad size at the end of the epilogue. */
  squadSizeEnd: number;
  /** Seasons of the tenure actually played. Below SEZONY_GRY only when
   * relegation cut the tenure short. */
  sezonyRozegrane: number;
  /** How many cards of each type this game actually put on screen. Counts
   * shown offers, not accepted ones, so it measures what the generator
   * produced rather than how the policy answered. */
  offerCounts: Record<OfferType, number>;
  /**
   * How many players actually joined the squad on a card. Counted from the
   * trace's own `signedPlayerId`, independently of whether the signing
   * export was switched on - so the dump can be checked against the export
   * rather than agreeing with it by construction.
   */
  signingCount: number;
  /**
   * The career's final tally of RNG draws, straight off the engine. Pairing
   * it by (club, seed) across two runs is what tells a change that only
   * moved money apart from one that also moved the random stream - and the
   * second kind cannot be read off any aggregate.
   */
  rngDrawCount: number;
};

/**
 * One player joining the squad, as the trace recorded it. The unit the
 * finance baseline measures transfer prices and wages in: an aggregate over
 * careers cannot answer "what did a 24-year-old midfielder cost", and a
 * median of ratios is not the ratio of medians.
 */
export type SigningObservation = {
  clubShortName: string;
  policyName: string;
  seed: number;
  decisionIndex: number;
  season: number;
  offerType: "KUPNO" | "PANIC" | "WOLNY";
  playerId: string;
  position: string;
  age: number;
  ovr: number;
  /** The fee actually paid, after any haggle - not the asking price. */
  fee: number;
  annualWage: number;
  baseAnnualWage: number;
  /** Diagnostic only: an eviction or a refill can make it differ from the
   * wage, and it must never be used as a stand-in for the signing's cost. */
  payrollDelta: number;
  /** Seasons of the tenure's actual settlements this signing was still on
   * the payroll for - his own tenure, not the club's. Computed from the
   * career's own settlements (see `signing-wage-cost.ts`), never recomputed
   * from `annualWage x seasons`, since a sale, an eviction or a declined
   * renewal can end the signing's tenure earlier than the career's own. */
  seasonsOnPayroll: number;
  /** The wage this signing actually cost, summed over `seasonsOnPayroll` -
   * each season's own wage, not the signing wage repeated, since a renewal
   * or ageing can move it between seasons. */
  wageCostToHandover: number;
};

/**
 * One played season of one career, as the settlement recorded it.
 *
 * The unit the money scale is measured in. A career aggregate cannot answer
 * "did this club's ordinary season come out even", because the five seasons
 * of a career differ in payroll, in place and in whether the tenure was even
 * finished - and the criterion of the spec's chapter 12.2 is a median of club
 * medians over seasons, not over careers.
 *
 * Every figure comes from the settlement itself, through the structured trace
 * the reducer emits. Nothing here recomputes a balance from other columns:
 * a recomputation would agree with the engine by construction and would
 * therefore check nothing.
 */
export type FinanceSeasonObservation = {
  dumpSchemaVersion: number;
  engineVersion: string;
  incomeMode: string;
  clubShortName: string;
  policyName: string;
  seed: number;
  season: number;
  /** The budget the career started with. Repeated on every season's row so
   * the drift residual is computable from the rows alone. */
  initialBudget: number;
  /**
   * The season's balance as it was FORECAST before the summer window, with
   * transfers and cups left out - deliberately including the placement money
   * for the forecast place and deliberately excluding the expected european
   * campaign, so it is the drift control rather than the HUD's own number.
   */
  preseasonForecastBalanceWithoutTransfersAndCups: number;
  /** The same quantity as it actually came out: recurring base plus the
   * ladder for the place actually taken, less payroll and fixed costs. */
  actualBalanceWithoutTransfersAndCups: number;
  scaledRecurringRevenue: number;
  leaguePositionPrize: number;
  totalPayroll: number;
  fixedCosts: number;
  /** The scalable part of the balance carried back into PLN at the run's own
   * money scale. `Dcandidate = medianOfClubMedians(this) / KOSZTY_STALE` is
   * the fixed-point step of the spec's chapter 12.2. */
  scalableNetPln: number;
  /**
   * The three one-off cup receipts of this season, as the engine CREDITED
   * them, plus their sum.
   *
   * Reconstructed from the season trace event, not from a `SeasonResult`
   * history - there is none, so pretending the three could be read back after
   * the fact would be inventing a source. `europeanPrizeIncome` is the trace's
   * own `kasaEuro`, which is already credited; the two domestic prizes are the
   * constants gated on the season's sporting facts, and both are zero under
   * `finance-control` because that mode credits none of the three.
   *
   * They exist so a post-hoc reinvestment estimate can carry the real income
   * of a real season rather than a balance with the cups quietly missing.
   */
  europeanPrizeIncome: number;
  polishCupPrizeIncome: number;
  superCupPrizeIncome: number;
  creditedCupIncome: number;
  /**
   * `GameState.rngDrawCount` at the moment this season's event was emitted.
   *
   * The instrument that lets a paired reading say the two runs walked the same
   * TENURE. A career's final tally cannot: the verdict reads cash, and one of
   * its four branches draws nothing, so a control run and a normal run legally
   * diverge AFTER the last season. Per-season tallies put the boundary where
   * it belongs - any difference at or before the last season is a real
   * divergence and must block.
   */
  rngDrawCount: number;
  /** Cash after season five, or at the moment relegation ended the tenure -
   * before the epilogue. Null on every other season. */
  cashAtHandover: number | null;
};

export const extractFinanceSeasons = (
  result: PlayResult,
  policyName: string,
  incomeMode: string
): FinanceSeasonObservation[] => {
  const clubShortName = result.state.club?.shortName;
  if (clubShortName === undefined) {
    throw new Error(`Game ended without a club (seed=${result.seed})`);
  }
  const start = result.state.trace.find((event) => event.type === "start");
  if (start === undefined || start.type !== "start") {
    throw new Error(`Game recorded no start event (seed=${result.seed})`);
  }
  const forecasts = new Map<number, Extract<TraceEvent, { type: "forecast" }>>();
  for (const event of result.state.trace) {
    if (event.type !== "forecast") continue;
    if (forecasts.has(event.sezon)) {
      throw new Error(`Season ${event.sezon} was forecast twice (seed=${result.seed})`);
    }
    forecasts.set(event.sezon, event);
  }
  const seasons = result.state.trace.filter(
    (event): event is Extract<TraceEvent, { type: "season" }> => event.type === "season"
  );

  return seasons.map((season, index) => {
    const forecast = forecasts.get(season.sezon);
    if (forecast === undefined) {
      throw new Error(`Season ${season.sezon} was played without a forecast (seed=${result.seed})`);
    }
    // Rounded once, then used everywhere below. The trace already carries the
    // revenue and the payroll rounded, so computing the derived columns from
    // the unrounded ladder would leave the exported row disagreeing with its
    // own components in the fourth decimal.
    const ladder = zaokr(leaguePositionPrize(season.miejsce), 4);
    // `kasaEuro` is already credited by the reducer, so it is zero in the
    // control run without this line having to know about income modes. The two
    // domestic prizes are not in the trace as money at all - only as the
    // sporting facts that earn them - so they are gated on `incomeMode` here,
    // the one place where this file knows which economy it is exporting.
    const europeanPrizeIncome = season.kasaEuro;
    const credited = incomeMode === "finance-control" ? 0 : 1;
    const polishCupPrizeIncome = credited * (season.puchar ? PUCHAR_POLSKI_PREMIA : 0);
    const superCupPrizeIncome =
      credited * (season.superpuchar === "wygrany" ? SUPERPUCHAR_PREMIA : 0);
    return {
      dumpSchemaVersion: DUMP_SCHEMA_VERSION,
      engineVersion: ENGINE_REVISION,
      incomeMode,
      clubShortName,
      policyName,
      seed: result.seed,
      season: season.sezon,
      initialBudget: start.budget,
      preseasonForecastBalanceWithoutTransfersAndCups: forecast.bilans,
      actualBalanceWithoutTransfersAndCups: zaokr(
        forecast.przychod + ladder - season.place - KOSZTY_STALE,
        4
      ),
      scaledRecurringRevenue: forecast.przychod,
      leaguePositionPrize: ladder,
      totalPayroll: season.place,
      fixedCosts: KOSZTY_STALE,
      scalableNetPln: zaokr(
        MONEY_SCALE_PLN_PER_GAME_MILLION * (forecast.przychod + ladder - season.place),
        2
      ),
      // The tenure's last played season, whether it ran to five or ended in
      // relegation. The epilogue emits no season events, so the last one here
      // is always the handover.
      europeanPrizeIncome: zaokr(europeanPrizeIncome, 4),
      polishCupPrizeIncome: zaokr(polishCupPrizeIncome, 4),
      superCupPrizeIncome: zaokr(superCupPrizeIncome, 4),
      creditedCupIncome: zaokr(europeanPrizeIncome + polishCupPrizeIncome + superCupPrizeIncome, 4),
      rngDrawCount: season.rngDrawCount,
      cashAtHandover: index === seasons.length - 1 ? season.kasa : null,
    };
  });
};

/** The three card types that can bring a player in. A decision event with a
 * non-null signedPlayerId can only be one of them; anything else is a bug in
 * the reducer, not a case to skip. */
const SIGNING_OFFER_TYPES = new Set(["KUPNO", "PANIC", "WOLNY"]);

export const extractSignings = (
  result: PlayResult,
  policyName: string,
  settlements: readonly SettlementSnapshot[]
): SigningObservation[] => {
  const clubShortName = result.state.club?.shortName;
  if (clubShortName === undefined) {
    throw new Error(`Game ended without a club (seed=${result.seed})`);
  }
  const signings: SigningObservation[] = [];
  for (const event of result.state.trace) {
    if (event.type !== "decision" || event.signedPlayerId === null) continue;
    if (!SIGNING_OFFER_TYPES.has(event.kartaTyp)) {
      throw new Error(`A ${event.kartaTyp} card reported a signing (seed=${result.seed})`);
    }
    if (event.signedAnnualWage === null || event.signedBaseAnnualWage === null) {
      throw new Error(`A signing without a wage (seed=${result.seed})`);
    }
    signings.push({
      clubShortName,
      policyName,
      seed: result.seed,
      decisionIndex: event.index,
      season: event.season,
      offerType: event.kartaTyp as SigningObservation["offerType"],
      playerId: event.signedPlayerId,
      position: event.poz,
      age: event.wiek,
      ovr: event.ovr,
      fee: event.cenaKoncowa,
      annualWage: event.signedAnnualWage,
      baseAnnualWage: event.signedBaseAnnualWage,
      payrollDelta: event.payrollAfter - event.payrollBefore,
      ...wageCostOf(settlements, event.signedPlayerId),
    });
  }
  return signings;
};

/**
 * One SPRZEDAZ card observed by `onCard`, as the trace's own decision
 * settled it. The unit Task 7 measures the buyer-choice change against: a
 * before/after pair of these dumps is how the sale-observer instrument
 * proves the change moved the buyer mix without moving anything else.
 */
export type SaleObservation = {
  clubId: string;
  policyName: string;
  seed: number;
  decisionIndex: number;
  season: number;
  /** Offer.cena as generated, before any stalling. */
  offerPrice: number;
  /** What the sale actually brought in, after stalling and haggling; null
   * when the card was passed or the haggle was lost. */
  realisedFee: number | null;
  buyerOrigin: BuyerOrigin;
  /** Nullable only so this type still parses pre-activation dumps, where no
   * card carried a buyer yet; extractSales below always fills it. */
  buyerClubId: string | null;
};

/**
 * Whether a SPRZEDAZ decision was actually concluded: the last action was not
 * a pass, and a haggle attempt did not lose the deal. The single definition
 * both extractSales and the dilemma observer (scripts/dilemma-observations.ts)
 * use, so a sale counts as concluded the same way in both dumps.
 */
export const isConcludedSale = (event: Extract<TraceEvent, { type: "decision" }>): boolean => {
  const last = event.akcje.at(-1);
  return last !== undefined && last !== "PAS" && event.wynik !== "PRZEPADL";
};

export const extractSales = (
  result: PlayResult,
  policyName: string,
  cards: ReadonlyMap<number, Offer>
): SaleObservation[] => {
  const sales: SaleObservation[] = [];
  for (const event of result.state.trace) {
    if (event.type !== "decision" || event.kartaTyp !== "SPRZEDAZ") continue;
    const card = cards.get(event.index);
    if (!card)
      throw new Error(`No observed card for decision ${event.index} (seed=${result.seed})`);
    if (!card.buyer)
      throw new Error(
        `SPRZEDAZ card with no buyer for decision ${event.index} (seed=${result.seed})`
      );
    const sold = isConcludedSale(event);
    sales.push({
      clubId: result.clubId,
      policyName,
      seed: result.seed,
      decisionIndex: event.index,
      season: event.season,
      offerPrice: card.cena,
      realisedFee: sold ? event.cenaKoncowa : null,
      buyerOrigin: card.buyer.origin,
      buyerClubId: card.buyer.clubId,
    });
  }
  return sales;
};

/** Throws if the game ended without the state extractMetrics depends on -
 * a bug in the engine, not something to paper over with a fallback. */
export const extractMetrics = (result: PlayResult, policyName: string): GameMetrics => {
  const { state } = result;
  if (!state.finalne) throw new Error(`Game ended without a legacy (seed=${result.seed})`);
  if (!state.finalne.breakdown) {
    throw new Error(`Game ended without a legacy breakdown (seed=${result.seed})`);
  }
  if (!state.werdykt) throw new Error(`Game ended without a verdict (seed=${result.seed})`);

  const decisionTokens = state.akcje.slice(1).filter((t) => t !== "CZAS");
  const bierzCount = decisionTokens.filter((t) => t === "BIERZ").length;
  const udzialBierz = percent(bierzCount, decisionTokens.length);

  const wynikRozklad = distribution(
    state.trace
      .filter(
        (e): e is Extract<(typeof state.trace)[number], { type: "decision" }> =>
          e.type === "decision"
      )
      .map((e) => e.wynik)
  );

  // Every card the window actually showed, by type. Initialised with all
  // five keys at zero so a game that never saw a PANIC still reports a
  // column rather than an absent key the CSV would render as blank.
  const offerCounts = Object.fromEntries(OFFER_TYPES.map((t) => [t, 0])) as Record<
    OfferType,
    number
  >;
  for (const event of state.trace) {
    if (event.type !== "decision") continue;
    const typ = event.kartaTyp as OfferType;
    if (!(typ in offerCounts)) throw new Error(`Unknown card type in trace: ${event.kartaTyp}`);
    offerCounts[typ] += 1;
  }

  const seasonEvents = state.trace.filter(
    (e): e is Extract<(typeof state.trace)[number], { type: "season" }> => e.type === "season"
  );
  const countCup = (cup: "LM" | "LE" | "LK"): number =>
    seasonEvents.filter((e) => e.europa === cup).length;
  const kasaEuro = seasonEvents.reduce((total, e) => total + e.kasaEuro, 0);

  const signingCount = state.trace.filter(
    (e) => e.type === "decision" && e.signedPlayerId !== null
  ).length;

  if (!state.club) throw new Error(`Game ended without a club (seed=${result.seed})`);

  return {
    seed: result.seed,
    clubId: state.club.clubId,
    klub: state.club.shortName,
    policyName,
    dziedzictwo: state.finalne.dziedzictwo,
    tytul: state.finalne.tytul,
    kasaKoncowa: state.finalne.kasa,
    werdyktTytul: state.werdykt.tytul,
    ocenaKadencji: state.werdykt.ocena,
    spadek: state.historia.some((h) => h.spadek),
    mistrzostwa: state.historia.filter((h) => h.mistrz).length,
    puchary: state.historia.filter((h) => h.puchar).length,
    udzialBierz,
    wynikRozklad,
    breakdown: state.finalne.breakdown,
    miejsceSezony: state.historia.map((h) => h.miejsce),
    miejsceEpilog: state.epilog.map((p) => p.miejsce),
    sezonyLM: countCup("LM"),
    sezonyLE: countCup("LE"),
    sezonyLK: countCup("LK"),
    kasaEuro: zaokr(kasaEuro, 2),
    squadSizeAtHandover: state.finalne.breakdown.squadSizeAtHandover,
    squadSizeEnd: state.finalne.breakdown.squadSizeEnd,
    sezonyRozegrane: state.historia.length,
    offerCounts,
    signingCount,
    rngDrawCount: state.rngDrawCount,
  };
};

export type CellAggregate = {
  /** The club this cell pinned - the run's only dimension besides policy. */
  clubId: string;
  /** The same club's short display name, for the ascii/markdown tables. */
  klub: string;
  policyName: string;
  n: number;
  dziedzictwo: Summary;
  tytulPct: Record<string, number>;
  werdyktPct: Record<string, number>;
  ocenaKadencjaMedian: number;
  spadekPct: number;
  kasaNegativePct: number;
  mistrzPct: number;
  udzialBierzMean: number;
  /**
   * The legacy formula's own components, each already multiplied by its
   * LEGACY_* weight - so the columns add up to the legacy score rather than
   * to something near it.
   *
   * The weights are read from src/data/balance.ts, never written out here.
   * They used to be inline literals named after their values (kasaX5,
   * spadkiX60), and when LEGACY_SPADEK went to zero on 2026-08-23 the report
   * carried on charging 60 points a relegation: a career worth 73.5 was
   * printed with a 60-point penalty it never paid, 81.6% of its own median.
   */
  breakdownMedian: {
    pktA: number;
    pktB: number;
    trofea: number;
    kasa: number;
    wartoscKadryMoj: number;
    spadki: number;
    wartoscKadryMojRatio: number;
  };
  breakdownSharePct: {
    pktA: number;
    pktB: number;
    trofea: number;
    kasa: number;
    wartoscKadryMoj: number;
    spadki: number;
  };
  miejsceSezonyMean: number;
  /** Null when no career in this cell reached the epilogue at all - every
   * one ended in relegation first. mean() throws on an empty array, and a
   * legitimate sample must not crash the simulator. */
  miejsceEpilogMean: number | null;
  /** Median squad size at the end of season 5 (last moment under player control). */
  squadSizeAtHandoverMedian: number;
  /** Median squad size at the end of the epilogue (squad producing pktB and wartoscKadryMoj). */
  squadSizeEndMedian: number;
  /** Median seasons of the tenure actually played - the pyramid's exit
   * criterion, which no other column reports. */
  sezonyRozegraneMedian: number;
};

/** Aggregates one club x policy cell. `games` may be shorter than the seed
 * count requested if some runs threw (see RunError in balance.ts). */
export const aggregateCell = (
  clubId: string,
  policyName: string,
  games: readonly GameMetrics[]
): CellAggregate => {
  const n = games.length;
  if (n === 0) {
    throw new Error(`No successful games for ${clubId}/${policyName}`);
  }

  const dziedzictwoSummary = summarize(games.map((g) => g.dziedzictwo));
  const dziedzictwoMedian = dziedzictwoSummary.median;
  const share = (v: number): number =>
    dziedzictwoMedian === 0 ? 0 : (v / dziedzictwoMedian) * 100;

  const tytulCounts = distribution(games.map((g) => g.tytul));
  const werdyktCounts = distribution(games.map((g) => g.werdyktTytul));
  const pctFor = (counts: Record<string, number>, key: string): number =>
    percent(counts[key] ?? 0, n);

  const pktA = median(games.map((g) => g.breakdown.pktA));
  const pktB = median(games.map((g) => g.breakdown.pktB));
  const trofea = median(games.map((g) => g.breakdown.trofea));
  const kasa = median(games.map((g) => g.breakdown.kasa * LEGACY_KASA));
  // wartoscKadryMoj, not wartoscKadry: the formula counts only the players
  // this manager signed (only they count toward legacy). Reporting the whole squad here
  // overstated the component by roughly the ratio the last column prints.
  const wartoscKadryMoj = median(
    games.map((g) => g.breakdown.wartoscKadryMoj * LEGACY_WARTOSC_KADRY)
  );
  const spadki = median(games.map((g) => g.breakdown.spadki * LEGACY_SPADEK));
  const wartoscKadryMojRatio = median(
    games.map((g) =>
      g.breakdown.wartoscKadry === 0 ? 0 : g.breakdown.wartoscKadryMoj / g.breakdown.wartoscKadry
    )
  );

  return {
    clubId,
    klub: at(games, 0, "first game of the cell").klub,
    policyName,
    n,
    dziedzictwo: dziedzictwoSummary,
    tytulPct: Object.fromEntries(TYTULY.map((t) => [t, pctFor(tytulCounts, t)])),
    werdyktPct: Object.fromEntries(WERDYKTY.map((w) => [w, pctFor(werdyktCounts, w)])),
    ocenaKadencjaMedian: median(games.map((g) => g.ocenaKadencji)),
    spadekPct: percent(games.filter((g) => g.spadek).length, n),
    kasaNegativePct: percent(games.filter((g) => g.kasaKoncowa < 0).length, n),
    mistrzPct: percent(games.filter((g) => g.mistrzostwa >= 1).length, n),
    udzialBierzMean: mean(games.map((g) => g.udzialBierz)),
    breakdownMedian: {
      pktA,
      pktB,
      trofea,
      kasa,
      wartoscKadryMoj,
      spadki,
      wartoscKadryMojRatio,
    },
    breakdownSharePct: {
      pktA: share(pktA),
      pktB: share(pktB),
      trofea: share(trofea),
      kasa: share(kasa),
      wartoscKadryMoj: share(wartoscKadryMoj),
      spadki: share(spadki),
    },
    miejsceSezonyMean: mean(games.flatMap((g) => g.miejsceSezony)),
    miejsceEpilogMean: (() => {
      const places = games.flatMap((g) => g.miejsceEpilog);
      return places.length ? mean(places) : null;
    })(),
    squadSizeAtHandoverMedian: median(games.map((g) => g.squadSizeAtHandover)),
    squadSizeEndMedian: median(games.map((g) => g.squadSizeEnd)),
    sezonyRozegraneMedian: median(games.map((g) => g.sezonyRozegrane)),
  };
};

export type PairMetricComparison = { medianDiff: number; winRate: number; pairedSeeds: number };

/** Pairs two policies' games by seed (only seeds present in both survive an
 * error on either side) and compares one numeric field. Returns null if no
 * seed is common to both, e.g. every run of one policy errored. */
export const pairBySeed = (
  a: readonly GameMetrics[],
  b: readonly GameMetrics[],
  pick: (_g: GameMetrics) => number
): PairMetricComparison | null => {
  const bBySeed = new Map(b.map((g) => [g.seed, g]));
  const aVals: number[] = [];
  const bVals: number[] = [];
  for (const gameA of a) {
    const gameB = bBySeed.get(gameA.seed);
    if (!gameB) continue;
    aVals.push(pick(gameA));
    bVals.push(pick(gameB));
  }
  if (aVals.length === 0) return null;
  return { ...pairedComparison(aVals, bVals), pairedSeeds: aVals.length };
};
