import type {
  Formation,
  Offer,
  OfferType,
  Player,
  Market,
  MarketState,
  OfferReportContext,
  SaleBuyer,
} from "../data/types";
import { RYNEK_OPIS } from "../data/market-states";
import {
  EXTENSION_MIN_AGE,
  EXTENSION_MIN_TENURE,
  EXTENSION_WAGE_ASK_MAX,
  EXTENSION_WAGE_ASK_MIN,
  HAGGLE_MARKET_SHIFT,
  KARA_CENA,
  KARA_PLACA,
  SALE_PRICE_DEVIATION_MAX,
  SALE_PRICE_DEVIATION_MIN,
  KARA_SPRZEDAZ,
  PURCHASE_PRICE_CAP,
} from "../data/balance";
import { zaokr } from "./format";
import { createPlayer, marketValue } from "./player";
import { pickMarketPosition } from "./market";
import { pick, rand, type Rng } from "./rng";
import { playerWage } from "./wages";
import { createStaffAssessment } from "./staff-assessment";
import { createAnalystReport } from "./analyst-report";
import { squadPlayingTime } from "./squad-reports";
import { analystContextTier, pickSourceClub } from "./analyst-context";
import { acquisitionCapacityOutcome } from "./squad";
import { domesticCandidates, FOREIGN_CANDIDATES, priceCandidates, qualifiedPool } from "./buyers";

/**
 * Who can be offered a PRZEDLUZENIE card this season: older than
 * EXTENSION_MIN_AGE and signed at least EXTENSION_MIN_TENURE seasons ago -
 * so the starting squad (kontraktOd: 0) only qualifies from season 2, and a
 * fresh signing only from two seasons after it joined. Never someone
 * already declining an earlier extension.
 */
export const eligibleForExtension = (kadra: readonly Player[], sezon: number): Player[] =>
  kadra.filter(
    (z) => z.wiek > EXTENSION_MIN_AGE && sezon - z.kontraktOd >= EXTENSION_MIN_TENURE && !z.wygasa
  );

/** Mirrors buyPrice/sellPrice's stall penalty, but for PRZEDLUZENIE's wage ask. */
export const extensionWage = (offer: Offer, stalls: number): number =>
  zaokr(offer.cena * (1 + KARA_PLACA * stalls), 2);

/**
 * Mirrors prototype's losujKarte :140-192, restructured for a fifth window
 * position: PANIC only ever draws as
 * the window's last card, so it never contradicts a "market obfity" signal
 * shown moments earlier on a KUPNO card. Thresholds differ by lastCard but
 * the single rng.next() draw and per-branch draw order are unchanged.
 *
 * `kasa` caps a KUPNO/PANIC card's price at kasa * PURCHASE_PRICE_CAP, so a
 * successful haggle (HAGGLE_FEE_DISCOUNT off) always closes the deal - only
 * applied when kasa > 0, since a negative cap would be meaningless.
 *
 * `sezon` decides PRZEDLUZENIE eligibility. In season 1 nobody qualifies
 * (the starting squad needs a season to pass first) - a PRZEDLUZENIE roll
 * with no eligible candidate falls through to KUPNO instead, a substitution
 * rule rather than a separate distribution.
 */
/**
 * The three card types that bring a player in from outside the club. Shared
 * by the generator, the reducer, the simulator and the UI so "is this a
 * signing?" is answered in exactly one place - the same lesson `formation`
 * taught: one source of truth, or a quiet disagreement.
 */
export const isExternalSigningType = (type: OfferType): boolean =>
  type === "KUPNO" || type === "PANIC" || type === "WOLNY";

/**
 * How many whole cards the generator may discard before it gives up and
 * forces a useful one. Bounded on purpose: an unbounded retry would let a
 * squad with every position full spin forever.
 */
export const MAX_DISPLAYABLE_OFFER_ATTEMPTS = 12;

/**
 * Exported so tests can force a specific card type without standing up the
 * full retry loop in `rollOffer` - `forcedType` already exists for the
 * bounded fallback below, and forcing it directly from a test is the same
 * capability, not a new one.
 */
export const rollOfferCandidate = (
  rng: Rng,
  kadra: readonly Player[],
  rynek: Market,
  formation: Formation,
  context: OfferReportContext,
  lastCard: boolean,
  kasa: number,
  sezon: number,
  forcedType?: OfferType
): Offer => {
  const r = rng.next();
  let typ: OfferType = lastCard
    ? r < 0.3
      ? "KUPNO"
      : r < 0.51
        ? "SPRZEDAZ"
        : r < 0.6375
          ? "PRZEDLUZENIE"
          : r < 0.75
            ? "WOLNY"
            : "PANIC"
    : r < 0.4
      ? "KUPNO"
      : r < 0.68
        ? "SPRZEDAZ"
        : r < 0.85
          ? "PRZEDLUZENIE"
          : "WOLNY";

  // Only the bounded fallback sets this. The draw above still happens, so a
  // forced card consumes the same rng as any other; everything below - the
  // position, the player, the price, the source club and both reports - goes
  // down the ordinary branch for that type.
  if (forcedType) typ = forcedType;

  const eligibleExtensions = typ === "PRZEDLUZENIE" ? eligibleForExtension(kadra, sezon) : [];
  if (typ === "PRZEDLUZENIE" && eligibleExtensions.length === 0) typ = "KUPNO";

  // Drawn here, before the player exists, because the club decides how good
  // he is. Only for the three cards that name an outside club; PRZEDLUZENIE
  // and SPRZEDAZ are our own players and take their context from our club.
  const isOwnPlayer = typ === "SPRZEDAZ" || typ === "PRZEDLUZENIE";
  const sourceCtx = isOwnPlayer
    ? null
    : pickSourceClub(rng, context.membership, context.userClubId);

  const capPurchasePrice = (cena: number): number =>
    kasa > 0 ? Math.min(cena, zaokr(kasa * PURCHASE_PRICE_CAP, 2)) : cena;

  let karta: Omit<Offer, "staffAssessment" | "analystReport" | "sourceClub" | "buyer">;
  let buyer: SaleBuyer | null = null;

  if (typ === "PRZEDLUZENIE") {
    const poz = pickMarketPosition(rng, rynek, formation, "sprzedaz");
    const onPoz = eligibleExtensions.filter((z) => z.poz === poz);
    const z = onPoz.length ? pick(rng, onPoz) : pick(rng, eligibleExtensions);
    const zadanie = zaokr(
      playerWage(z) * rand(rng, EXTENSION_WAGE_ASK_MIN, EXTENSION_WAGE_ASK_MAX),
      2
    );
    karta = {
      typ: "PRZEDLUZENIE",
      zawodnik: z,
      cena: zadanie,
    };
  } else if (typ === "KUPNO") {
    const poz = pickMarketPosition(rng, rynek, formation, "kupno");
    const z = createPlayer(
      rng,
      rng.next() < 0.52 ? "mlody" : "gotowy",
      poz,
      undefined,
      sourceCtx?.clubOvr
    );
    const cena = capPurchasePrice(
      zaokr(
        marketValue(z.ovr, z.wiek, z.poz) *
          rand(rng, 0.9, 1.5) *
          RYNEK_OPIS[rynek[poz]].mnoznikCeny,
        2
      )
    );
    karta = {
      typ: "KUPNO",
      zawodnik: z,
      cena,
    };
  } else if (typ === "SPRZEDAZ") {
    const poz = pickMarketPosition(rng, rynek, formation, "sprzedaz");
    const naPoz = kadra.filter((z) => z.poz === poz);
    const z = naPoz.length ? pick(rng, naPoz) : pick(rng, kadra);
    // Replaces rand(1.0, 1.6): one deviation per card, drawn before any buyer
    // is known. The buyer's name now explains the rest of the price.
    const deviation = rand(rng, SALE_PRICE_DEVIATION_MIN, SALE_PRICE_DEVIATION_MAX);
    const baseFee =
      marketValue(z.ovr, z.wiek, z.poz) * RYNEK_OPIS[rynek[z.poz]].mnoznikCeny * deviation;
    const pool = qualifiedPool(
      priceCandidates(baseFee, [
        ...domesticCandidates(context.membership, context.userClubId),
        ...FOREIGN_CANDIDATES,
      ])
    );
    // Replaces pick(buyers(...)): still one draw, now among those who can pay.
    const chosen = pick(rng, pool);
    buyer = { clubId: chosen.clubId, name: chosen.name, origin: chosen.origin };
    karta = {
      typ: "SPRZEDAZ",
      zawodnik: z,
      cena: chosen.price,
    };
  } else if (typ === "WOLNY") {
    const poz = pickMarketPosition(rng, rynek, formation, "kupno");
    const z = createPlayer(rng, "weteran", poz, undefined, sourceCtx?.clubOvr);
    karta = {
      typ: "WOLNY",
      zawodnik: z,
      cena: 0,
    };
  } else {
    const poz = pickMarketPosition(rng, rynek, formation, "kupno", ["obfity"]);
    const z = createPlayer(
      rng,
      rng.next() < 0.5 ? "gotowy" : "mlody",
      poz,
      undefined,
      sourceCtx?.clubOvr
    );
    const cena = capPurchasePrice(
      zaokr(marketValue(z.ovr, z.wiek, z.poz) * rand(rng, 2.2, 3.0), 2)
    );
    karta = {
      typ: "PANIC",
      zawodnik: z,
      cena,
    };
  }

  // Generate reports for the offer
  const source = isOwnPlayer ? "coach" : "scout";
  // One memo, whichever screen asks. offers.ts reads our own players as the
  // coach on a SPRZEDAZ or PRZEDLUZENIE card, so the card and the squad
  // drawer have to be handed the same entry or the same player gets two
  // different opinions in one season.
  const staffAssessment = createStaffAssessment(
    karta.zawodnik,
    context.period,
    source,
    context.staffMemory[karta.zawodnik.id] ?? null
  );

  // The name and the tier come from the same draw by construction, so the card
  // and the analyst report's "Poziom klubu" line can never name different
  // places. Our own players (SPRZEDAZ, PRZEDLUZENIE) have no source club and
  // are read against our own squad instead.
  const contextTierValue = sourceCtx
    ? sourceCtx.contextTier
    : analystContextTier(context.currentClubOvr);
  const sourceClub = sourceCtx ? sourceCtx.clubName : null;

  // Our own players get their real playing time; players elsewhere do not,
  // because we do not pick their teams. Without this the same player would
  // read one set of minutes on a SPRZEDAZ card and another in the squad
  // drawer, in the same window.
  const playingTime = isOwnPlayer
    ? squadPlayingTime(kadra, formation).get(karta.zawodnik.id)
    : undefined;
  const analystReport = createAnalystReport(
    karta.zawodnik,
    context.period,
    contextTierValue,
    playingTime
  );

  return { ...karta, staffAssessment, analystReport, sourceClub, buyer };
};

/**
 * The bounded retry itself, with the drawing and the judging handed in.
 *
 * Separated from rollOffer so the loop can be tested for exactly what it
 * promises - at most MAX_DISPLAYABLE_OFFER_ATTEMPTS discarded cards, then one
 * forced SPRZEDAZ - without standing up a whole game state to provoke it.
 */
export const selectDisplayableOffer = (
  draw: (_forcedType?: OfferType) => Offer,
  isUseless: (_offer: Offer) => boolean
): Offer => {
  for (let attempt = 0; attempt < MAX_DISPLAYABLE_OFFER_ATTEMPTS; attempt += 1) {
    const offer = draw();
    if (!isUseless(offer)) return offer;
  }
  return draw("SPRZEDAZ");
};

/**
 * The card the window actually shows.
 *
 * A signing whose own player would immediately rank last at his position is
 * useless: taking him would sign and release him in one move. Rather than
 * render it with the buttons disabled, the generator throws the whole card
 * away and draws a fresh one - type, position, player, price, source club and
 * reports all rolled again.
 *
 * Rerolling only the player would be worse than doing nothing: a full
 * position would be handed a run of ever-better candidates until one cleared
 * the bar, quietly inflating offer quality exactly where the squad is
 * deepest.
 *
 * After MAX_DISPLAYABLE_OFFER_ATTEMPTS the fallback forces a SPRZEDAZ, which
 * is always useful and always has a candidate - the game never lets the whole
 * squad be empty. It reads the current squad, so it cannot name a player who
 * has already gone.
 *
 * The filter reads only what bySquadPriority reads. Never sufit, the staff
 * outlook, marketEdge, the price or the analyst report.
 */
export const rollOffer = (
  rng: Rng,
  kadra: readonly Player[],
  rynek: Market,
  formation: Formation,
  context: OfferReportContext,
  lastCard: boolean,
  kasa: number,
  sezon: number
): Offer => {
  const draw = (forcedType?: OfferType): Offer =>
    rollOfferCandidate(rng, kadra, rynek, formation, context, lastCard, kasa, sezon, forcedType);

  return selectDisplayableOffer(
    draw,
    (offer) =>
      isExternalSigningType(offer.typ) &&
      acquisitionCapacityOutcome(kadra, offer.zawodnik, formation).kind === "rejectsIncoming"
  );
};

/** Mirrors prototype's cenaKupna/cenaSprzedazy :410-411. */
export const buyPrice = (offer: Offer, stalls: number): number =>
  zaokr(offer.cena * (1 + KARA_CENA * stalls), 2);

export const sellPrice = (offer: Offer, stalls: number): number =>
  zaokr(offer.cena * (1 - KARA_SPRZEDAZ * stalls), 2);

/**
 * How far a haggle's "lost" probability shifts from HAGGLE_ODDS, given the
 * market's state at the offer's position. Buying-side offers get easier on
 * an "obfity" (bargain) market and harder on "pusty" - the other side has a
 * weaker hand on a glutted market, a stronger one when supply is short.
 * SPRZEDAZ is mirrored: a bargain market for buyers is a seller's weak hand.
 */
export const marketHaggleShift = (typ: OfferType, market: MarketState): number => {
  // +1 shifts "lost" up (harder), -1 shifts it down (easier).
  const buyerSideShift = market === "obfity" ? -1 : market === "pusty" ? 1 : 0;
  const sign = typ === "SPRZEDAZ" ? -buyerSideShift : buyerSideShift;
  return sign * HAGGLE_MARKET_SHIFT;
};
