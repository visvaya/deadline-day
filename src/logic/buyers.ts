import {
  BUYER_CAPACITY_REVENUE_SHARE,
  DOMESTIC_BUYER_FACTOR_MAX,
  DOMESTIC_BUYER_FACTOR_MIN,
  EUR_PLN_SOURCE_SEASON,
  FOREIGN_TIER_TERMS,
  HAGGLE_SALE_BONUS,
  MAX_INTRA_LEAGUE_FEE,
} from "../data/balance";
import { CLUB_FINANCE_PROFILES, financeProfileFor } from "../data/club-finance-profiles";
import { FOREIGN_CLUBS } from "../data/foreign-clubs";
import type { BuyerOrigin, LeagueMembership } from "../data/types";
import { zaokr } from "./format";
import { softCapForeignOffer } from "./transfer-fees";

/**
 * Who can buy one of the player's players, and at what price (buyer-capacity
 * spec §3.2 and §5).
 *
 * Pure and RNG-free: the card's one price deviation and its one buyer pick
 * happen in offers.ts. Reads nothing that correlates with a player's hidden
 * potential - the fee comes from what the card already shows (value, market,
 * the buyer's name) and nothing else.
 */

export type BuyerCandidate = {
  readonly clubId: string;
  /** What the card prints: the short name for a domestic club, the display name abroad. */
  readonly name: string;
  readonly origin: BuyerOrigin;
  readonly buyerFactor: number;
  readonly maxSpend: number;
  readonly maxOffer: number;
};

export type PricedCandidate = BuyerCandidate & { readonly price: number };

const byClubId = (a: { clubId: string }, b: { clubId: string }): number =>
  a.clubId < b.clubId ? -1 : a.clubId > b.clubId ? 1 : 0;

const positiveRevenue = (clubId: string): number => {
  const revenue = financeProfileFor(clubId).recurringRevenuePln;
  if (!(revenue > 0)) throw new Error(`buyers: non-positive recurring revenue for ${clubId}`);
  return revenue;
};

// Fixed over the whole 36-club manifest, never over the current eighteen or
// over whoever qualifies for one card - otherwise a promotion would re-price
// every other club.
const LOG_REVENUE_MIN = Math.log(
  Math.min(...CLUB_FINANCE_PROFILES.map((p) => positiveRevenue(p.clubId)))
);
const LOG_REVENUE_MAX = Math.log(
  Math.max(...CLUB_FINANCE_PROFILES.map((p) => positiveRevenue(p.clubId)))
);

/** Linear in log revenue, so a sixty-fold spread does not squash most of the
 * league onto the floor. Unit-free: the currency cancels. */
export const domesticBuyerFactor = (clubId: string): number =>
  DOMESTIC_BUYER_FACTOR_MIN +
  (DOMESTIC_BUYER_FACTOR_MAX - DOMESTIC_BUYER_FACTOR_MIN) *
    ((Math.log(positiveRevenue(clubId)) - LOG_REVENUE_MIN) / (LOG_REVENUE_MAX - LOG_REVENUE_MIN));

/**
 * The most a domestic club will ever pay, after a successful haggle, in the
 * real euros card prices are anchored in. Revenue is converted with the NBP
 * rate, NOT with MONEY_SCALE_PLN_PER_GAME_MILLION: the game's own money unit
 * is compressed about 3.7x against prices, which left Legia at 1.87 and made
 * any cap dead (owner decision 2026-09-22, spec §3.2). The cap is the
 * intra-league record, not MAX_DOMESTIC_FEE: the buyer always buys FROM an
 * Ekstraklasa club, and no Polish club has paid another more than 2.0.
 */
export const domesticMaxSpend = (clubId: string): number =>
  Math.min(
    MAX_INTRA_LEAGUE_FEE,
    (positiveRevenue(clubId) / 1_000_000 / EUR_PLN_SOURCE_SEASON) * BUYER_CAPACITY_REVENUE_SHARE
  );

export const maxOfferFor = (maxSpend: number): number => maxSpend / (1 + HAGGLE_SALE_BONUS);

export const domesticCandidates = (
  membership: LeagueMembership,
  userClubId: string
): BuyerCandidate[] =>
  membership.clubs
    .filter((club) => club.clubId !== userClubId)
    .map((club) => {
      const maxSpend = domesticMaxSpend(club.clubId);
      return {
        clubId: club.clubId,
        name: club.shortName,
        origin: "domestic" as const,
        buyerFactor: domesticBuyerFactor(club.clubId),
        maxSpend,
        maxOffer: maxOfferFor(maxSpend),
      };
    })
    .sort(byClubId);

export const FOREIGN_CANDIDATES: readonly BuyerCandidate[] = FOREIGN_CLUBS.map((club) => {
  const terms = FOREIGN_TIER_TERMS[club.tier];
  return {
    clubId: club.clubId,
    name: club.name,
    origin: "foreign" as const,
    buyerFactor: terms.buyerFactor,
    maxSpend: terms.maxSpend,
    maxOffer: maxOfferFor(terms.maxSpend),
  };
}).sort(byClubId);

/**
 * Each candidate's own quote for the same player. A foreign quote passes the
 * soft cap exactly once, here, and is rounded DOWN so rounding can never lift
 * it past MAX_UNHAGGLED_FOREIGN_FEE; nothing downstream caps it again.
 */
export const priceCandidates = (
  baseFee: number,
  candidates: readonly BuyerCandidate[]
): PricedCandidate[] =>
  candidates.map((c) => {
    const raw = baseFee * c.buyerFactor;
    const price =
      c.origin === "foreign" ? Math.floor(softCapForeignOffer(raw) * 100) / 100 : zaokr(raw, 2);
    return { ...c, price };
  });

/**
 * Drop whoever cannot afford their own quote, then prefer home: a domestic
 * pool if anyone domestic is left, the foreign one otherwise. The second
 * clause of the filter closes the rounding edge a two-place haggle could
 * otherwise open above maxSpend. The legendary tier always qualifies, so
 * the foreign pool is never empty.
 */
export const qualifiedPool = (priced: readonly PricedCandidate[]): PricedCandidate[] => {
  const affordable = priced.filter(
    (c) => c.price <= c.maxOffer && zaokr(c.price * (1 + HAGGLE_SALE_BONUS), 2) <= c.maxSpend
  );
  const domestic = affordable.filter((c) => c.origin === "domestic");
  const pool = domestic.length > 0 ? domestic : affordable.filter((c) => c.origin === "foreign");
  if (pool.length === 0)
    throw new Error("buyers: no qualified buyer - the legendary tier must always qualify");
  return pool;
};
