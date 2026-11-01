/**
 * The single surface for balance tuning (brief section 7). Every change to a
 * constant here must be run through the balance simulator (phase 3) once it
 * exists.
 */

import { LEAGUE_MERIT_POOL_PLN, MERIT_WEIGHT_SUM } from "./club-finance-profiles";
import type {
  EuropeanCup,
  EuropeanStage,
  ForeignWealthTier,
  OfferType,
  PositionCode,
} from "./types";

export const SEZONY_GRY = 5;
// Reduced from 5 to 3 on 2026-08-13 as part of the player-development-model plan (Task 8 checkpoint)
export const SEZONY_EPILOGU = 3;
export const KOSZTY_STALE = 1.1;

/**
 * The money scale: PLN of reported club revenue per one million EUR of game
 * money (spec 4, chapter 3.4).
 *
 * Not a free dial. It is the value that centres the league's median career
 * balance - `finance-control`, so without transfers, european prize money,
 * the Polish Cup and the Super Cup - on zero, measured over full careers in
 * step 4 of the spec. Every constant below that carries a PLN counterpart is
 * divided by this one, so moving it moves the whole family. Do not retune it
 * in isolation: see docs/decisions/finance-activation-2026-09-10.md.
 */
export const MONEY_SCALE_PLN_PER_GAME_MILLION = 15_774_182;

/**
 * The wage curve, activated 2026-09-10.
 *
 * `WAGE_PIVOT_OVR` is pinned at 70 and is NOT fitted: the three-parameter
 * form with a free base was unidentifiable, because only the product
 * `base x exp(-pivot / slope)` matters, so two different sets described one
 * curve. `WAGE_SLOPE` is the product owner's decision of 2026-09-09 (option
 * A, the middle of a flat region rather than the minimum of anything) and
 * `WAGE_AT_PIVOT_PLN` is the level that reproduces the fit population's
 * total payroll exactly at that slope - option A's own aggregate, at full
 * precision rather than the 0.1625 its table prints for reading.
 *
 * Evidence: docs/decisions/money-scale-fit-2026-09-08.md; reproduced by
 * `pnpm fit:money-scale`.
 */
export const WAGE_PIVOT_OVR = 70;
export const WAGE_SLOPE = 12;
export const WAGE_AT_PIVOT_PLN = 2_562_621.2832973292;
export const WAGE_AT_PIVOT = WAGE_AT_PIVOT_PLN / MONEY_SCALE_PLN_PER_GAME_MILLION;

/**
 * What one place in the final table is worth, in millions of game euro.
 *
 * Calibrated to the sporting component of the league's central pool rather
 * than carried over from the prototype's 0.22: the manifest records the pool
 * (55.13 mln PLN, 18.5% of 298 mln) and the normalising weight sum, and the
 * rate is what those two become in game money. The same subtraction is
 * applied to every club's recurring base in club-finance-profiles.ts, so the
 * history removed and the mechanic added have exactly the same shape.
 */
export const LEAGUE_PRIZE_RATE =
  LEAGUE_MERIT_POOL_PLN / (MERIT_WEIGHT_SUM * MONEY_SCALE_PLN_PER_GAME_MILLION);

/**
 * Placement money for finishing in this position - the whole of it, with no
 * club base and no reference to any forecast.
 *
 * Absolute rather than centred on an expectation, per the spec's chapter 3.1:
 * the league pays a sporting component every year, and pays nothing at all
 * for beating expectations. A centred quantity would also be one-sided for
 * clubs at the ends of the table - the same asymmetry that made the form
 * modifier read from points instead of place on 2026-08-22.
 *
 * Places are 1-based, so 19 is one past last: the club that comes bottom
 * still earns nothing, and the one above it earns one step.
 */
export const leaguePositionPrize = (miejsce: number): number => LEAGUE_PRIZE_RATE * (19 - miejsce);

/**
 * The value curve, activated 2026-09-10 from the joint fit of 2026-09-07
 * (`pnpm fit:value-curve`, pinned in docs/decisions/value-curve-fit-2026-09-07.md).
 *
 * Age enters the sigmoid as an ovr shift rather than as a multiplier outside
 * it: a separate `x 2.1` for youth would reopen the very ceiling `VMAX` is
 * there to close. The shifts are anchored in years relative to the POSITION's
 * own peak band, so a keeper at 30 sits inside his prime while a winger at 30
 * is two years past his - and the shift at `peakStart` is zero by
 * normalisation, which is what removes the shift/midpoint degeneracy.
 *
 * `MARKET_VALUE_MAX` is the asymptote of the base valuation, not a cap on a
 * transfer fee; `MAX_FOREIGN_FEE` below is a different quantity and takes no
 * part in this fit.
 */
export const MARKET_VALUE_MAX = 13;
export const MARKET_VALUE_SLOPE = 6.6;
export const MARKET_VALUE_MIDPOINT = 87.6;
export const MIN_MARKET_VALUE = 0.05;

/**
 * The starting budget rule (spec 4, chapter 3.5).
 *
 * `MIN_BUDGET_SHARE` is the median of the observed shares in the source
 * document and applies to every ordinary club: the manifest carries no
 * per-club share, because no report publishes one.
 *
 * `MIN_INITIAL_BUDGET` is an explicit PLAYABILITY exception to
 * `MAX_BUDGET_SHARE`, not a change of that ceiling - decided by the product
 * owner on 2026-09-09. Raising the share to 0.30 costs 6.42 mln of added
 * budget and still leaves eleven of eighteen clubs able to afford a median
 * KUPNO card with its first year of wages; the floor costs 4.43 mln and gets
 * all eighteen there, because it lifts only the clubs beneath it. It stands
 * at 0.75 rather than the measured 0.724 so that it covers the whole 11-13
 * slope band with room to spare, instead of being fitted to one slope.
 *
 * `OWNER_BUDGET_PERCENTILE` was removed on 2026-09-12. It held Wieczysta's
 * percentile, and only hers; the activation of that day moved documented
 * backing into the manifest's `backerBudgetPercentile` and gave it two named
 * levels below. Keeping a third, stale copy of one club's number would have
 * been a second source of truth for the same fact.
 */
export const MIN_BUDGET_SHARE = 0.18;
export const MAX_BUDGET_SHARE = 0.3;
export const MIN_INITIAL_BUDGET = 0.75;

/**
 * The opening-budget rule decided on 2026-09-12, measured in
 * docs/decisions/opening-budget-fit-2026-09-12.md.
 *
 * `INITIAL_BUDGET_SHARE` is the ONLY share the production formula reads.
 * `MIN_BUDGET_SHARE` above survives as the historical lower bound of the scan
 * and must never be read by the budget again - two live shares would be two
 * rules wearing one name. The share stays under `MAX_BUDGET_SHARE`, which
 * bounds this component and this component alone: the playability floor and
 * the cost of a useful upgrade are allowed to exceed it, and a report that
 * folded them back into "share" would be calling an exception a share.
 *
 * `USEFUL_UPGRADE_OVR_DELTA` is how far above the club's own positional
 * target a signing has to land before it counts as a real upgrade rather than
 * a like-for-like replacement. Delta 2 leaves five clubs on the absolute
 * floor, against nine at delta 1.
 *
 * The two backer percentiles are percentiles OF THE EIGHTEEN SHARE BUDGETS,
 * taken at `INITIAL_BUDGET_SHARE` and before any floor. They are a floor
 * under the first window only - never a recurring injection and never
 * additive to the other components.
 */
export const INITIAL_BUDGET_SHARE = 0.2;
export const USEFUL_UPGRADE_OVR_DELTA: 0 | 1 | 2 = 2;
export const STRONG_BACKER_PERCENTILE = 0.95;
export const ACTIVE_BACKER_PERCENTILE = 0.8;

/**
 * The share of a season's operating balance the board passes back into the
 * transfer budget, decided on 2026-09-12.
 *
 * `0.30` IS A GAMEPLAY DECISION, NOT AN OPTIMUM OF THE PARETO FRONT. The
 * front only ever sees the cost of a higher rate, because the passive
 * `alwaysPass` policy it is measured on buys nothing and therefore has
 * nothing to spend a bigger budget on. Read as an optimum it would argue for
 * a rate of one, which is the state this constant exists to end: today's
 * budget refills itself out of an ordinary league season.
 *
 * EUROPEAN PRIZE MONEY IS PART OF `seasonOperatingBalance`. A good campaign
 * therefore does improve the budget, and improves it noticeably - but the
 * whole UEFA payout no longer turns into transfer money, which is the point
 * of the rate rather than an oversight in it.
 *
 * The rate is symmetric: a negative balance lowers the budget by the same
 * share. Having the board absorb losses but not share gains would be a
 * separate decision, and it has not been taken.
 */
export const BOARD_REINVESTMENT_RATE = 0.3;

/**
 * The ovr shift at each age anchor, in years relative to the position's peak
 * band. Linearly interpolated between anchors and flat outside them, so no
 * birthday is a cliff.
 *
 * The band from `peakStart` to `peakEnd` is deliberately NOT flat. AGE_PROFILES
 * says age alone does not cost ovr inside the prime band, and that is true of
 * form; value obeys something else, because what is bought is the number of
 * remaining seasons at this level, and that falls every year including in the
 * prime. Value therefore peaks BEFORE form does.
 */
export const MARKET_VALUE_AGE_SHIFTS = {
  /** peakStart - 5 */
  young: 4.8,
  /** peakStart, zero by normalisation. */
  peakStart: 0,
  /** peakEnd */
  peakEnd: -2.7,
  /** peakEnd + 3 */
  latePlusThree: -6.9,
  /** peakEnd + 6 */
  latePlusSix: -11.1,
} as const;

/** Winning the Polish Cup. Was a bare 1.4 in both the season end and the
 * epilogue, so the two could drift apart without anything noticing. */
export const PUCHAR_POLSKI_PREMIA = 1.4;

/**
 * Weights of the two scores the player is judged by.
 *
 * `VERDICT_*` decide the job offer waiting at the end of the five-season
 * tenure; `LEGACY_*` decide the title on the final screen three seasons
 * later. They lived as bare numbers inside scoring.ts and epilogue.ts, which
 * put the two most consequential formulas in the game outside the one file
 * where balance tuning starts.
 */
export const VERDICT_TROFEUM = 20;
/**
 * Reconverted 2026-09-12 with the activated opening budget and reinvestment
 * rate. A UNIT CONVERSION, not a calibration: the historical product is
 * preserved and the multiplier is whatever divides into the new median to
 * reproduce it.
 *
 *   VERDICT_KASA = 16.55 / 0.87   (18 000 controlled careers; the DENOMINATOR
 *                                  is cash at handover)
 *
 * `16.55` is NOT a handover figure. It is the historical product
 * `multiplier 5 x median 3.31` from `scripts/data/legacy-unit-baseline.json`,
 * and that 3.31 was measured AFTER the epilogue. Preserving it as this
 * constant's reference is a product-owner convention, closed 2026-09-11 in
 * docs/decisions/finance-activation-2026-09-10.md - not something the
 * measurement established. The measurement supplies the denominator only.
 *
 * Different from `LEGACY_KASA` below on purpose. The two read cash at two
 * different MOMENTS - this one when the verdict is scored, that one after
 * three epilogue seasons - so they share a reference product and not a
 * denominator. Equalising them would be an assumption, and the measurement
 * says the medians differ (0.87 against 0.92).
 *
 * `PROGI_WERDYKTU` is deliberately untouched: retuning the distribution of
 * verdicts is the joint calibration that comes after spec 5.
 */
export const VERDICT_KASA = 19.022988505747126;
export const VERDICT_SPADEK = 60;
/** Subtracted from, not added to: handicapKadencja lowers each of these. */
export const PROGI_WERDYKTU = [280, 370, 450];

/**
 * The two legacy weights. `LEGACY_KASA` was reconverted again 2026-09-12 for
 * the activated opening budget and reinvestment rate; `LEGACY_WARTOSC_KADRY`
 * was NOT, because the unit of `marketValue` did not change.
 *
 * This is a UNIT CONVERSION, not a calibration. Both used to price a quantity
 * in the old money, and the activation changed what that money is worth - so
 * the multiplier that PRESERVES each component's historical contribution is
 * `historical product / new median`, measured on a run of the same type and
 * the same seeds:
 *
 *   LEGACY_KASA          = 16.55 / 0.92                (18 000 controlled careers,
 *                                                       remeasured 2026-09-12)
 *   LEGACY_WARTOSC_KADRY = 3.9864753148485743 / 1.2485178086936932
 *                                                      (234 000 active careers,
 *                                                       2026-09-10, unchanged)
 *
 * The products come from `scripts/data/legacy-unit-baseline.json`, at full
 * precision: `2 x 1.99` is not the product this component actually scored.
 * The thresholds `PROGI_DZIEDZICTWA` and the handicaps are deliberately NOT
 * touched here - retuning the distribution of titles is the joint calibration
 * that comes after spec 5.
 *
 * `VERDICT_KASA` above is the same kind of conversion, taken at the other
 * moment. It was left in the old unit through the 2026-09-10 activation and
 * repriced on 2026-09-12, when the reinvestment rate made the gap between the
 * two moments material rather than cosmetic.
 */
export const LEGACY_KASA = 17.98913043478261;
export const LEGACY_WARTOSC_KADRY = 3.1929663214172073;
/**
 * Removed 2026-08-23, kept at zero rather than deleted so the formula still
 * shows where the penalty used to be.
 *
 * Relegation now ends the tenure, which costs the career every remaining
 * season plus all three of the epilogue - worth 94 to 153 median points on
 * its own (the pktB term).
 * Charging 60 more on top of that hit the same career twice: the median held
 * on hard, but P25 for the mixed policy fell from 328 to 97 and alwaysPass
 * lost its median outright, from 333 to 216. The lower quarter is exactly
 * where the shortened careers sit.
 *
 * The spec's own rule decides it: relegation should hurt by taking the future
 * away, not by a multiplier. The future is now genuinely gone, so the
 * multiplier was compensation for a consequence that no longer needs one.
 */
export const LEGACY_SPADEK = 0;
/** A championship is worth more than a cup, which is the only reason these
 * are two numbers rather than one. */
export const LEGACY_PUCHAR = 15;
export const LEGACY_MISTRZOSTWO = 25;

/**
 * Legacy-title thresholds, before handicapDziedzictwo is subtracted.
 *
 * Set to the 20th, 42nd, 62nd, 80th and 93rd percentile of the easy level's
 * legacy distribution, measured over 58 500 games after the formation wiring.
 * Recalibrating them is not bookkeeping: the previous values were solved for
 * a 370-point spread between difficulty levels, which the match engine cut to
 * 194 and the formation wiring to 154 - by which point hard had become the
 * easiest level to earn a good title on.
 */
export const PROGI_DZIEDZICTWA = [430, 495, 550, 615, 700];

/**
 * Prize money per european cup and stage reached, mln EUR. Proportions
 * mirror the 2026/27 UEFA league-phase premiums (LM 18.6 / LE 4.31 / LK
 * 3.17), scaled down to fit budgets an order of magnitude smaller than real
 * club finances. Subject to pnpm balance calibration.
 */
export const EUROPEAN_PRIZE_MONEY: Record<EuropeanCup, Record<EuropeanStage, number>> = {
  LM: { qualifying: 1.2, league: 4.0, knockout: 5.6 },
  LE: { qualifying: 0.5, league: 1.0, knockout: 1.5 },
  LK: { qualifying: 0.3, league: 0.7, knockout: 1.1 },
};

/**
 * Chance of advancing past qualifying, and (given qualifying was passed) of
 * reaching the knockout stage, as a function of squad strength. `edge` is 0
 * at strength 62 and 1 at strength 80+.
 *
 * Those ends are construction points, not measurements - see the comment on
 * advanceProbabilities in src/logic/european-cups.ts for the strengths that
 * actually turn up in Europe.
 *
 * LK pQualifyBase went 0.70 -> 0.31 on 2026-09-02, a PRODUCT DECISION.
 * The measurement
 * behind it (docs/decisions/european-cups-audit.md, chapters 9-12): clubs entering the real
 * Conference League at the same round - three two-legged ties to the main
 * phase - reach it about 37.5% of the time in the closest structurally
 * observable cohort, where the game was promising 78.9% to the squad it
 * actually sends. 0.31 puts the curve at 39.9% there.
 *
 * pQualifySlope stays 0.25 as a STATED DESIGN ASSUMPTION, not a fitted
 * value: one observed rate is one equation in two unknowns, so the slope is
 * unidentified and anything fitted to it would be invented. pKnockout* is
 * untouched for a different reason - no real knockout-stage prize money is
 * pinned anywhere in the repo, so its 1.4x ratio cannot be confronted with
 * anything.
 */
export const EUROPEAN_ADVANCE_ODDS: Record<
  EuropeanCup,
  { pQualifyBase: number; pQualifySlope: number; pKnockoutBase: number; pKnockoutSlope: number }
> = {
  LM: { pQualifyBase: 0.25, pQualifySlope: 0.45, pKnockoutBase: 0.15, pKnockoutSlope: 0.35 },
  LE: { pQualifyBase: 0.55, pQualifySlope: 0.35, pKnockoutBase: 0.25, pKnockoutSlope: 0.4 },
  LK: { pQualifyBase: 0.31, pQualifySlope: 0.25, pKnockoutBase: 0.35, pKnockoutSlope: 0.4 },
};

/** xi / bench weight in squadStrength, keyed by which cup (if any) the club plays. */
export const BENCH_WEIGHT: Record<"none" | EuropeanCup, { xi: number; bench: number }> = {
  none: { xi: 0.95, bench: 0.05 },
  LK: { xi: 0.9, bench: 0.1 },
  LE: { xi: 0.87, bench: 0.13 },
  LM: { xi: 0.84, bench: 0.16 },
};

// przeciąganie negocjacji
export const CZAS_BAZOWY = 15;
export const CZAS_DODATKOWY = 15;
export const MAX_PRZECIAGNIEC = 3;
export const KARA_CENA = 0.12; // +12% do odstępnego za każde przeciągnięcie
export const KARA_SPRZEDAZ = 0.12; // −12% od kwoty sprzedaży
export const KARA_PLACA = 0.08; // +8% do pensji

/**
 * The signing premium on a WOLNY card's wage (spec 4, chapter 4.1).
 *
 * A free agent has no fee, so the money the selling club does not take is
 * split between the player and his agent - as a higher salary and a signing
 * bonus. Not a fee by another name: the target is that the overpay over a
 * FIXED two-season horizon comes to 40-60% of the median fee for a player of
 * the same ovr, age and position, so the card stays a bargain and stops being
 * free. Above that band it stops being an opportunity, which disqualifies a
 * run just as much as falling below it.
 *
 * Fitted against the activated wage curve, not carried over from the
 * reference fit: the premium is `1 + target / unitShare`, and `unitShare` is
 * two seasons of wage over a fee anchored in real euro - so it moves whenever
 * the curve does. The reference fit's 2.2799 belongs to a different curve and
 * would put the overpay at 0.68 of the fee, outside the spec's band from
 * above, where the card stops being an opportunity.
 *
 * At full precision, from `fitFreeAgentPremium` over the 2026-09-07 cohort of
 * 320 597 signings: the median unit share is 0.534773913919370 and the target
 * is the middle of the 0.40-0.60 band. The option-A table prints 1.9350 for
 * reading; rounding is fine for reading and wrong for arithmetic.
 */
export const WOLNY_WAGE_PREMIUM = 1.9349745509003764;

/**
 * How many players over a position's design squad size (TYPY[].kadra) a
 * purchase may carry before the weakest is evicted. A buy that would push a
 * position past kadra + SQUAD_BENCH_BUFFER drops the weakest player on that
 * position instead. Raised from +1 to +4 (2026-08-12): the old cap evicted a
 * third reserve the moment a player bought a fourth signing on a two-slot
 * position, which read as punitive rather than a graceful limit.
 */
export const SQUAD_BENCH_BUFFER = 4;

/**
 * Ceiling shift for academy debutants (createPlayer "akademia"), scaled by
 * the club's own strength (clubOvr(clubRating(club)), league-ratings.ts)
 * around a mid-table Ekstraklasa reference point - a strong club's academy
 * produces slightly higher-potential prospects, a weak club's slightly
 * lower. Deliberately touches
 * only sufit (hidden), never ovr - see the hidden-ceiling rule.
 */
export const ACADEMY_CEILING_CLUB_REFERENCE = 65;
export const ACADEMY_CEILING_CLUB_FACTOR = 0.4;

/**
 * Quality shift for a player offered by a club below the top flight, scaled
 * by that club's own clubOvr (league-ratings.ts).
 *
 * Reference 60 is the bottom of the Ekstraklasa (Radomiak, 60.1), and the
 * shift is clamped to zero above it, so no top-flight club is affected and
 * every measured figure about today's offers still holds. Below it the first
 * division runs 60.0 down to 51.0, giving shifts from 0 to -9.
 *
 * Factor 1 - one point of club quality per point of player quality - is the
 * only value nobody has to justify. If a measurement ever says the shift is
 * too steep, this is the lever; the shape of the formula is not.
 *
 * UNLIKE the academy shift above, this one moves ovr AND sufit by the same
 * amount. Moving ovr alone would make the club's name a predictor of the gap
 * to the ceiling - a hidden-ceiling leak, and the loudest kind,
 * because the name is printed on the card.
 */
export const OFFER_SOURCE_CLUB_REFERENCE = 60;
export const OFFER_SOURCE_CLUB_FACTOR = 1;

/**
 * Share of KUPNO/PANIC/WOLNY offers whose source club sits below the top
 * flight.
 *
 * Drawn as a tier first and a club second, rather than uniformly over all 36
 * clubs - uniform would make every second offer a first-division one, which
 * is a change to the quality distribution of the market that no spec asked
 * for.
 */
export const LOWER_LEAGUE_SOURCE_SHARE = 0.25;

/**
 * Haggling odds, "albo lepiej, albo przepada": every haggle either improves a term or loses the
 * offer outright - no more "no change" outcome. `fee` and `wage` are the
 * probabilities of the two improvement outcomes (a lower price/fee, or a
 * permanently lower wage multiplier); `lost` is the probability the offer
 * disappears. The three always sum to 1 before HAGGLE_MARKET_SHIFT is
 * applied - see marketHaggleShift in offers.ts.
 */
export const HAGGLE_ODDS: Record<OfferType, { fee: number; wage: number; lost: number }> = {
  KUPNO: { fee: 0.32, wage: 0.28, lost: 0.4 },
  PANIC: { fee: 0.2, wage: 0.15, lost: 0.65 },
  SPRZEDAZ: { fee: 0.6, wage: 0, lost: 0.4 },
  WOLNY: { fee: 0, wage: 0.6, lost: 0.4 },
  PRZEDLUZENIE: { fee: 0, wage: 0.6, lost: 0.4 },
};

/**
 * How far the market's state at the offer's position shifts `lost` from the
 * table above, before rescaling the improvement odds to still sum to
 * 1 - lost. Buying-side offers (KUPNO/PANIC/WOLNY) get easier on an
 * "obfity" (bargain) market and harder on "pusty"; SPRZEDAZ is mirrored,
 * since a bargain market for buyers is a seller's weak hand.
 */
export const HAGGLE_MARKET_SHIFT = 0.05;

export const HAGGLE_FEE_DISCOUNT = 0.2; // -20% do odstępnego/kwoty sprzedaży
export const HAGGLE_WAGE_DISCOUNT = 0.15; // -15% do mnoznikPlacy, na stałe
export const HAGGLE_SALE_BONUS = 0.2; // +20% do kwoty sprzedaży

/**
 * The transfer-fee ceilings of the spec's chapter 5.1.
 *
 * `MAX_DOMESTIC_FEE` is where a domestic buyer stops; above it only a foreign
 * club bids. The soft cap saturates an ordinary foreign offer below
 * `MAX_UNHAGGLED_FOREIGN_FEE`, so a successful haggle can add its full 20%
 * and still come out under `MAX_FOREIGN_FEE`. The knee comes from the same
 * joint fit as the value curve, under the spread constraint of chapter 9.2.
 *
 * `MAX_FOREIGN_FEE` is not `MARKET_VALUE_MAX` and takes no part in fitting
 * the base curve.
 */
export const MAX_DOMESTIC_FEE = 5.5;
export const MAX_FOREIGN_FEE = 11;
export const MAX_UNHAGGLED_FOREIGN_FEE = MAX_FOREIGN_FEE / (1 + HAGGLE_SALE_BONUS);
export const FOREIGN_FEE_SOFT_KNEE = 6;

/**
 * Average NBP table-A EUR/PLN mid rate over the source financial year of the
 * finance manifest (2024-07-01 to 2025-06-30, 251 publications, pinned in
 * scripts/data/nbp-eur-2024-07-2025-06.json).
 *
 * Read ONLY by the buyer's capacity (src/logic/buyers.ts). It converts
 * reported PLN revenue into the real euros that card prices, MAX_INTRA_LEAGUE_FEE
 * and MAX_FOREIGN_FEE are anchored in. It is not a second money scale and
 * must never reach revenue, wages, budgets or legacy - those live on
 * MONEY_SCALE_PLN_PER_GAME_MILLION. Moves only with the manifest's vintage.
 */
export const EUR_PLN_SOURCE_SEASON = 4.2637;

/** Share of real annual revenue a domestic club can put into one incoming
 * transfer, before MAX_INTRA_LEAGUE_FEE. A design assumption from spec 4 §9.2,
 * not a measured value; kept apart from INITIAL_BUDGET_SHARE on purpose - it
 * is a different club in a different unit. */
export const BUYER_CAPACITY_REVENUE_SHARE = 0.2;

/**
 * The most one Polish club has paid another for a player: Kapuadi, Legia to
 * Widzew, winter 2026, 2.0 mln EUR fixed (the previous record, Slisz in
 * 2020, was 1.5). The cap on a domestic buyer's capacity, since that buyer
 * always buys FROM an Ekstraklasa club. Not MAX_DOMESTIC_FEE: that is the
 * record paid to a FOREIGN seller and stays as the soft cap's floor
 * (buyer-capacity spec §3.2, sources there).
 */
export const MAX_INTRA_LEAGUE_FEE = 2;

/** Domestic buyerFactor runs from the poorest to the richest of the 36
 * manifest clubs, linear in log revenue (buyer-capacity spec §5). */
export const DOMESTIC_BUYER_FACTOR_MIN = 1;
export const DOMESTIC_BUYER_FACTOR_MAX = 1.12;

/** One draw per SPRZEDAZ card, before any buyer is chosen - the only
 * unexplained part of the price (spec 4 §9.2). */
export const SALE_PRICE_DEVIATION_MIN = 0.9;
export const SALE_PRICE_DEVIATION_MAX = 1.1;

/** Foreign tiers (spec 4 §9.2). maxSpend is after a successful haggle; the
 * card may show at most maxSpend / (1 + HAGGLE_SALE_BONUS). */
export const FOREIGN_TIER_TERMS: Readonly<
  Record<ForeignWealthTier, { readonly buyerFactor: number; readonly maxSpend: number }>
> = {
  wysoki: { buyerFactor: 1.15, maxSpend: 7 },
  "bardzo wysoki": { buyerFactor: 1.2, maxSpend: 9 },
  legendarny: { buyerFactor: 1.25, maxSpend: MAX_FOREIGN_FEE },
};

/**
 * Cap on a KUPNO/PANIC card's rolled price, so a successful HAGGLE_FEE_
 * DISCOUNT haggle always closes the deal for a player with kasa > 0.
 * 1 / (1 - HAGGLE_FEE_DISCOUNT).
 */
export const PURCHASE_PRICE_CAP = 1 / (1 - HAGGLE_FEE_DISCOUNT);

/**
 * PRZEDLUZENIE: a contract-expiry card for the player's own squad, drawn as a 5th offer type.
 */
// Eligibility: eligibleForExtension in logic/offers.ts.
export const EXTENSION_MIN_AGE = 18; // wiek > EXTENSION_MIN_AGE
export const EXTENSION_MIN_TENURE = 2; // sezon - kontraktOd >= EXTENSION_MIN_TENURE
// Asking wage as a multiple of the player's current wage - first
// approximation, subject to pnpm balance calibration.
export const EXTENSION_WAGE_ASK_MIN = 1.25;
export const EXTENSION_WAGE_ASK_MAX = 1.6;

/**
 * Player aging, replacing the three hard age thresholds develop() used to
 * have. Growth converges on the ceiling until peakStart; between peakStart
 * and peakEnd age alone never lowers ovr (the visible drift there comes from
 * the form modifier - see FORM_* below); past peakEnd the loss grows with
 * every further year instead of staying flat.
 *
 * First approximation - tuned against pnpm balance in this plan's Task 8.
 */
export const AGE_GROWTH_MIN = 0.26;
export const AGE_GROWTH_MAX = 0.42;
export const AGE_DECLINE_JITTER = 0.3; // +/-30% on the computed loss
export const AGE_OVR_FLOOR = 44;

/**
 * Below this a player retires at the end of the season, whatever his age.
 *
 * Lives here rather than inline in development.ts because two places have to
 * agree on it, and for a while they did not: createStartingSquadPlayer floored
 * new ratings at 48, so 2.7% of every starting squad - 11.5% of Radomiak's -
 * was made up of players who would retire the moment the first season ended,
 * having never been available to sell, extend or play. A squad slot that
 * expires before the player can use it is worse than an empty one, because it
 * looks like depth.
 */
export const RETIREMENT_OVR = 50;

export type AgeProfile = {
  peakStart: number;
  peakEnd: number;
  /** ovr lost in the first year past peakEnd. */
  declineBase: number;
  /** Extra ovr lost for each further year past peakEnd. */
  declineAccel: number;
};

export const AGE_PROFILE_DEFAULT: AgeProfile = {
  peakStart: 24,
  peakEnd: 29,
  declineBase: 1.25,
  declineAccel: 0.55,
};

/**
 * Aging profiles keyed by position. The organising principle is how much
 * the role depends on pace, not the coarse GK/DEF/MID/FWD split: full-backs
 * (LO/PO) and wingers (LS/PS) fade earliest, centre-backs and keepers latest.
 *
 * Values are set from a career decline BUDGET, then spread over however many
 * years remain before the age-35 retirement cap - not picked as a per-year
 * rate. That is why declineAccel is LOWER for early-peaking positions: they
 * have the most post-peak years, so the same accel would compound into a far
 * larger total. Getting this backwards is the trap the first draft of this
 * plan fell into (a winger hit 48 ovr at 34 while a keeper sat at 73).
 *
 * Total loss follows the arithmetic series n*base + accel*n(n-1)/2, so any
 * retune is checkable on paper before spending a simulator run.
 */
export const AGE_PROFILES: Record<PositionCode, AgeProfile> = {
  // peak 26-33, 2 years of decline, sum 3.0
  BR: { peakStart: 26, peakEnd: 33, declineBase: 1.2, declineAccel: 0.6 },
  // A positional, pace-independent role - the 2026-08-14 retune pushes the
  // peak out to 32, close to the keeper. peak 25-32, 3 years, sum 5.7
  ŚO: { peakStart: 26, peakEnd: 32, declineBase: 1.2, declineAccel: 1.8 },
  // Modern full-backs earn their peak later than the original prototype gave
  // them credit for. peak 24-29, 6 years, sum 14.0
  LO: { peakStart: 24, peakEnd: 29, declineBase: 1.2, declineAccel: 0.71 },
  PO: { peakStart: 24, peakEnd: 29, declineBase: 1.2, declineAccel: 0.71 },
  // peak 24-31, 4 years of decline, sum 9.1
  POM: { peakStart: 25, peakEnd: 31, declineBase: 1.3, declineAccel: 1.3 },
  // Wingers no longer fade a full pace-cliff earlier than everyone else -
  // game intelligence carries them a couple of years past the raw sprint
  // peak. peak 23-29, 6 years, sum 13.2
  LS: { peakStart: 23, peakEnd: 28, declineBase: 1.2, declineAccel: 0.59 },
  PS: { peakStart: 23, peakEnd: 28, declineBase: 1.2, declineAccel: 0.59 },
  // peak 24-30, 5 years of decline, sum 12.0
  ŚN: { peakStart: 24, peakEnd: 30, declineBase: 1.2, declineAccel: 1.02 },
  // Wing-backs run more than full-backs but no longer fade a year earlier
  // than them - the 2026-08-14 retune keeps the same one-year-behind gap
  // relative to LO/PO's new peak. peak 23-28, 7 years, sum 14.7
  CLS: { peakStart: 23, peakEnd: 28, declineBase: 1.2, declineAccel: 0.46 },
  CPS: { peakStart: 23, peakEnd: 28, declineBase: 1.2, declineAccel: 0.46 },
  // A holding midfielder plays positionally, so pace matters least - the
  // same reasoning that gives centre-backs a late peak, pushed one year
  // further out alongside ŚO in the 2026-08-14 retune.
  // peak 25-32, 3 years, sum 5.7
  ŚPD: { peakStart: 26, peakEnd: 32, declineBase: 1.2, declineAccel: 1.8 },
  // ŚP is POM under its final name; identical curve on purpose.
  // peak 24-31, 4 years, sum 9.1
  ŚP: { peakStart: 25, peakEnd: 31, declineBase: 1.3, declineAccel: 1.3 },
  // Wide midfielders sit between a central midfielder and a winger.
  // peak 23-29, 6 years, sum 13.2
  LP: { peakStart: 23, peakEnd: 29, declineBase: 1.2, declineAccel: 0.64 },
  PP: { peakStart: 23, peakEnd: 29, declineBase: 1.2, declineAccel: 0.64 },
  // peak 23-29, 6 years, sum 15.0
  ŚPO: { peakStart: 23, peakEnd: 29, declineBase: 1.2, declineAccel: 0.52 },
  // A withdrawn striker plays with his back to goal and leans on
  // positioning, not pace - the 2026-08-14 retune lets that show: CN now
  // ages past N and ŚN instead of sharing ŚN's curve outright.
  // peak 24-31, 4 years, sum 8.4
  CN: { peakStart: 25, peakEnd: 31, declineBase: 1.2, declineAccel: 1.9 },
  // N is wider than ŚN was - it covers a left, central or right forward -
  // but the 2026-08-14 retune folds that pace cost into a flatter decline
  // (lower declineAccel) rather than an earlier peakEnd, so the two now
  // share a retirement-adjacent peak end. peak 23-30, 5 years, sum 10.5
  N: { peakStart: 24, peakEnd: 30, declineBase: 1.2, declineAccel: 1.02 },
};

/**
 * Ceiling headroom for a starting-squad player, by RAW age.
 *
 * Raw age, never years to peakStart. peakStart lives in AGE_PROFILES[poz],
 * so deriving the ceiling from it would make position correlate with the
 * ceiling - and the potential arrow, which is computed from age and
 * position, would stop being the safe age-and-position glyph.
 *
 * The bands mirror createPlayer's own branches - "mlody" +6..14, "gotowy"
 * +0..3, "weteran" 0 - with one interpolating step so the widened age range
 * has no cliff in the middle.
 */
export const STARTING_SQUAD_HEADROOM: readonly {
  maxAge: number;
  min: number;
  max: number;
}[] = [
  { maxAge: 20, min: 6, max: 14 },
  { maxAge: 23, min: 3, max: 9 },
  { maxAge: 27, min: 0, max: 4 },
  { maxAge: Infinity, min: 0, max: 0 },
];

/** The eleven keeps the range the whole squad used before the tails landed. */
export const STARTING_SQUAD_XI_AGE = { min: 21, max: 31 } as const;

/**
 * The bench carries the age tails a real squad has and this game never had:
 * roughly four or five players aged 17-20 and one or two past 32 in a
 * twenty-man squad, matching the three Transfermarkt squads measured by hand.
 *
 * Tails sit on the bench alone because ovr comes from formationTargetOvr:
 * a seventeen-year-old with an eleven's rating is not a prospect, and
 * lowering his rating instead would drag the club off the rating it was
 * solved for.
 */
export const STARTING_SQUAD_BENCH_AGE_BANDS: readonly {
  min: number;
  max: number;
  weight: number;
}[] = [
  { min: 17, max: 20, weight: 50 },
  { min: 21, max: 31, weight: 33 },
  { min: 32, max: 34, weight: 17 },
];

/** A half-open uniform band, `[lo, hi)`. */
export type BonusBand = { readonly lo: number; readonly hi: number };

/**
 * The half-open uniform band `createStartingSquadPlayer` adds to a starting
 * eleven slot's target ovr. Centred on zero, because the target IS the
 * intended mean.
 *
 * Lifted out of the inline literal `rand(rng, -5, 5)` on 2026-09-14 so the
 * generator and the analytic squad-cost model (`src/logic/squad-cost.ts`,
 * moved from `scripts/money-scale-core.ts`) read one source instead of two
 * copies that could silently drift apart.
 */
export const STARTING_XI_OVR_BONUS: BonusBand = { lo: -5, hi: 5 };

/**
 * The bench's counterpart to `STARTING_XI_OVR_BONUS`, sitting below the
 * target rather than around it.
 */
export const STARTING_BENCH_OVR_BONUS: BonusBand = { lo: -12, hi: -3 };

/**
 * Season form, layered on top of the age curve at every age (2x2 table in
 * this plan's Task 7). The bonus is a CHANCE and the penalty is CERTAIN,
 * because the two eligible groups differ in size: 14 of 19 players count as
 * having played, only 5 do not. Two certain moves would inflate the whole
 * league by ~+0.24 ovr per player per season.
 *
 * Pure counting says ~0.36 balances it. An earlier version of this constant
 * shipped at 0.5, on the assumption that sufit-clipping (upward moves get
 * clipped, downward ones do not) would compensate. Post-plan-review
 * measurement (large-sample Monte Carlo, representative mid-range ovr/sufit
 * gap, 380,000 draws) showed real clipping barely offsets it for a typical
 * player - measured drift at 0.5 was +0.050, right at the edge of the
 * +/-0.05 criterion, not comfortably inside it. 0.36 measures at -0.0007,
 * effectively exact neutrality, and is used here instead.
 */
export const FORM_UP_ODDS = 0.36;

/** How many of the best non-XI players still count as having played. Keeps
 * the reserve bench from rotting, which would turn squad depth into a cost
 * exactly when the erosion problem needs it to be an asset. */
export const FORM_ROTATION_SLOTS = 3;

/**
 * Floor for the form penalty. ageSquad retires anyone under ovr 50, so
 * without this the penalty would become a FIFTH squad-erosion channel
 * (alongside retirement, sale, refused extension and the academy no longer
 * backfilling). Form may wear a player down to the retirement line, never
 * push him across it - retirement stays a function of age and ability, not
 * of sitting on the bench.
 */
export const FORM_PENALTY_FLOOR = 50;

/**
 * Match engine (spec 2026-08-13-match-engine-design, section 4). Goals for
 * each side are an independent Poisson draw:
 *   lambda_home = MATCH_BASE_GOALS * atk_home / def_away * MATCH_HOME_ADVANTAGE
 *   lambda_away = MATCH_BASE_GOALS * atk_away / def_home
 *
 * Fitted to the two sides SEPARATELY (2026-08-25), which is the whole point:
 * BASE alone sets the away lambda, BASE * HOME sets the home one, so two
 * constants answer two targets exactly. Tuned as "total goals plus a
 * multiplier" they cannot - and were not. HOME is therefore nothing more
 * mysterious than the window's home goals divided by its away goals.
 *
 * Refitted 2026-08-28 to NINE Ekstraklasa seasons (2704 matches) after the
 * calibration window took back 2015/16, which an old parsing fault had cost
 * it - see CALIBRATION_WINDOW in scripts/match-engine-audit-reference.ts for
 * why that season belongs and 2020/21 does not. The target moved little:
 * BASE +0.08%, HOME -0.43%, which shifts the aim from 44.52% home wins to
 * 44.08% and from 26.37% draws to 26.78%. The sample grew by 296 matches.
 *
 * The comment here once claimed 2.96 goals per match "matches the real
 * Ekstraklasa". It does not: the real figure is 2.664, and the away lambda
 * was 18% too high while the home one was only 5% too high. That single
 * wrong belief produced too many away wins, too little home advantage and
 * most of the missing draws.
 *
 * Deliberately WITHOUT the Dixon-Coles tau correction for low-scoring
 * results, and for a measured reason rather than a guessed one: over these
 * nine seasons the draw excess over independent Poisson is 1.18 pp at
 * z = 1.41, which still does not separate from zero. It was 0.81 pp at
 * z = 0.92 over eight, so the wider window moved it toward significance
 * without reaching it - worth knowing before the dependence study, not
 * grounds to fit anything today. The player never sees an individual score
 * either, only the table.
 */
export const MATCH_BASE_GOALS = 1.1531763545376446;
export const MATCH_HOME_ADVANTAGE = 1.286666666666666;

/**
 * How much each position feeds the club's attack and defence ratings.
 * Replaced the four-group ATTACK_WEIGHT/DEFENCE_WEIGHT (removed 2026-08-14
 * with the formation wiring): the groups lumped ŚPD and ŚPO together
 * although they pull in opposite directions.
 *
 * Every pair sums to exactly 1, and that is load-bearing - createSquad raises
 * the club's two ratings to these exponents to derive a position's target
 * ovr, so anything else would move the whole squad up or down the scale.
 */
export const POSITION_WEIGHTS: Record<PositionCode, { attack: number; defence: number }> = {
  BR: { attack: 0, defence: 1 },
  ŚO: { attack: 0, defence: 1 },
  LO: { attack: 0.15, defence: 0.85 },
  PO: { attack: 0.15, defence: 0.85 },
  CLS: { attack: 0.4, defence: 0.6 },
  CPS: { attack: 0.4, defence: 0.6 },
  ŚPD: { attack: 0.2, defence: 0.8 },
  ŚP: { attack: 0.5, defence: 0.5 },
  LP: { attack: 0.55, defence: 0.45 },
  PP: { attack: 0.55, defence: 0.45 },
  ŚPO: { attack: 0.8, defence: 0.2 },
  LS: { attack: 0.85, defence: 0.15 },
  PS: { attack: 0.85, defence: 0.15 },
  CN: { attack: 0.9, defence: 0.1 },
  N: { attack: 1, defence: 0 },
  // On their way out with the formation wiring - same values as the codes
  // that replace them, so nothing shifts when they go.
  POM: { attack: 0.5, defence: 0.5 },
  ŚN: { attack: 1, defence: 0 },
};

/**
 * Maps a 0-100 ovr onto the external model's multiplicative scale, where the
 * league average is 1.00. Reference 65 is a mid-table Ekstraklasa squad;
 * scale 40 puts the game's 60-71 club-strength range onto roughly 0.88-1.16,
 * which is the spread the model actually shows.
 */
export const RATING_OVR_REFERENCE = 65;
export const RATING_OVR_SCALE = 40;

/**
 * How many years of squad age one unit of club rating is worth. Measured
 * against Ekstraklasa 2026/27: the correlation between strength and mean
 * squad age is -0.345 and the slope is -4.4 years per unit, which over the
 * league's rating span works out to about 1.4 years end to end.
 *
 * The result is clamped to a single year either way. The raw table spans
 * 24.9 to 29.2, but that is mostly club-specific noise - the gap between
 * the top five and the bottom five clubs is 0.6 years. A stronger effect
 * would age out a hard-level squad regardless of how the player plays.
 */
export const AGE_STRENGTH_SLOPE = 5;

/**
 * Prize for winning the Polish Super Cup, mln EUR. Deliberately small next to
 * the Polish Cup's 1.4: it is one match, not a run. First approximation,
 * subject to the calibration at the end of the chain.
 */
export const SUPERPUCHAR_PREMIA = 0.3;

/**
 * Multiplier on `marketEdge` where the engine reads it (`playerImpact`).
 *
 * A maximum +3 edge in a regular starting XI changes the affected team side by
 * about +0.52 on the pre-exponential OVR-like scale, or roughly +1.3% after
 * `toRating`. This does not touch what the report says, only what a correct
 * data-driven read is worth after signing.
 */
export const MARKET_EDGE_IMPACT_MULTIPLIER = 2;

/**
 * Sharpness of the promotion draw. Weight is exp((strength - max) * T).
 *
 * Calibrated against the truth rather than by taste: 20 000 full first-
 * division seasons played by simulateMatch, play-off included, give each club
 * a promotion rate, and the draw is scored on how closely it reproduces them.
 *
 * The value tracks how many clubs go up, because the same sharpness spread
 * over three places is not the same sharpness spread over two. At two
 * promotions the optimum was 18 (0.80 pp mean error); at three it moved to 17
 * (0.99 pp, worst club 2.1 pp, against 1.14 and 3.4 pp for 18). Re-measure it
 * if RELEGATED_COUNT ever changes again. Spec, chapter 4.3.
 */
export const PROMOTION_WEIGHT_T = 17;

/**
 * How many clubs go down, and therefore how many come up.
 *
 * Three, matching the Ekstraklasa since it went to eighteen teams: positions
 * 16 to 18 are relegated outright, with no survival play-off. The game had
 * two until 2026-08-23, which made staying up meaningfully easier than the
 * league it models.
 *
 * A constant because the number was previously written out in seven places -
 * "slice(-2)" in two files, "miejsce >= 17" in four, and a 16 in the European
 * allocation - and nothing tied them together.
 */
export const RELEGATED_COUNT = 3;

/**
 * What promotion and relegation do to a club's rating.
 *
 * Deliberately cumulative: a club that goes down and comes back carries
 * 0.95 * 1.05 = 0.9975 of what it had, so the round trip costs it a quarter
 * of a percent. Product owner's call, 2026-08-23 - going down and back up
 * should leave a mark. Over eight seasons even a club that never stops
 * bouncing loses about 1%, so no floor is needed.
 */
export const PROMOTION_BONUS = 1.05;
export const RELEGATION_PENALTY = 0.95;
