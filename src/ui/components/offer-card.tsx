import { useId } from "react";
import type {
  EuropeanCup,
  Formation,
  MarketState,
  Offer,
  OvrChange,
  Player,
  PositionCode,
} from "../../data/types";
import { ord, pl, pluralFormPl, YEAR_FORMS, money } from "../../logic/format";
import { xiInOrder, substitutes } from "../../logic/squad";
import { positionDepth, positionQuality } from "./position-summary";
import {
  getAgeTrend,
  getOvrTone,
  seasonChangeBadge,
  wasMeasured,
  type SeasonChangePeriod,
} from "./player-tile-utils";
import { Tile } from "./tile";
import { PlayerReports } from "./player-reports";

const OFFER_DETAILS: Record<
  Offer["typ"],
  { label: string; className: string; sender: string; club: string }
> = {
  KUPNO: {
    label: "Kupno",
    className: "is-purchase",
    sender: "Agent proponuje ci zakup zawodnika.",
    club: "Klub nieujawniony",
  },
  PANIC: {
    label: "Kupno",
    className: "is-purchase",
    sender: "Agent proponuje transfer w ostatniej chwili.",
    club: "Klub nieujawniony",
  },
  SPRZEDAZ: {
    label: "Sprzedaż",
    className: "is-sale",
    sender: "Inny klub chce kupić twojego zawodnika.",
    club: "Twój klub",
  },
  WOLNY: {
    label: "Wolny agent",
    className: "is-free-agent",
    sender: "Zawodnik jest dostępny bez odstępnego.",
    club: "Bez klubu",
  },
  PRZEDLUZENIE: {
    label: "Przedłużenie",
    className: "is-extension",
    // Overridden per-offer below with the position noun phrase - this is
    // only the fallback if that lookup ever misses.
    sender: "Kontrakt twojego zawodnika wygasa po sezonie.",
    club: "Twój klub",
  },
};

/**
 * The club line under the player's name.
 *
 * A free agent has no club now, but he played somewhere last season - and the
 * analyst report names that club's level three lines below, in the past tense.
 * Saying only "Bez klubu" left that line referring to a place the card never
 * named. Both read the same `sourceClub`, so they cannot drift apart.
 */
const offerClubLine = (offer: Offer, fallback: string): string => {
  // Falsy, not `=== null`, on purpose: a game saved before this field existed
  // resumes with the key absent, and the engine revision does not change here,
  // so that save is still loaded rather than discarded.
  if (!offer.sourceClub) return fallback;
  if (offer.typ === "WOLNY") return `Bez klubu · ostatnio ${offer.sourceClub}`;
  return offer.sourceClub;
};

/** Noun phrase for "Kontrakt twojego {X} wygasa po sezonie." - accusative,
 * matching the mockup's "Kontrakt twojego napastnika wygasa po sezonie." */
const POSITION_NOUN_ACCUSATIVE: Record<PositionCode, string> = {
  BR: "bramkarza",
  LO: "lewego obrońcy",
  ŚO: "środkowego obrońcy",
  PO: "prawego obrońcy",
  CLS: "lewego wahadłowego",
  CPS: "prawego wahadłowego",
  ŚPD: "defensywnego pomocnika",
  ŚP: "środkowego pomocnika",
  LP: "lewego pomocnika",
  PP: "prawego pomocnika",
  ŚPO: "ofensywnego pomocnika",
  LS: "lewego skrzydłowego",
  PS: "prawego skrzydłowego",
  CN: "cofniętego napastnika",
  N: "napastnika",
  POM: "pomocnika",
  ŚN: "napastnika",
};

type MarketLabel = { label: string; className: string };

/** The club is buying (or keeping) here: a glutted market is good news. */
const BUYER_MARKET_LABELS: Record<MarketState, MarketLabel> = {
  obfity: { label: "okazja", className: "is-positive" },
  spokoj: { label: "regularny", className: "is-neutral" },
  pusty: { label: "zawyżona", className: "is-negative" },
};

/**
 * The club is selling: the same market reads the other way round. A glut
 * takes the fee down (x0.78) and makes the buyer harder to haggle with; a
 * shortage pushes it up (x1.4) and makes him easier. Without the switch a
 * sale in a glut showed a green "okazja" over a cut price.
 */
const SELLER_MARKET_LABELS: Record<MarketState, MarketLabel> = {
  obfity: { label: "zaniżona", className: "is-negative" },
  spokoj: { label: "regularny", className: "is-neutral" },
  pusty: { label: "korzystna", className: "is-positive" },
};

export const marketLabel = (offerType: Offer["typ"], marketState: MarketState): MarketLabel =>
  (offerType === "SPRZEDAZ" ? SELLER_MARKET_LABELS : BUYER_MARKET_LABELS)[marketState];

const shirtName = (name: string): string => {
  const surname = name.split(" ").at(-1)?.toLocaleUpperCase("pl-PL") ?? name;
  return surname.length > 6 ? `${surname.slice(0, 5)}.` : surname;
};

const PlayerKit = ({ offer }: { offer: Offer }) => {
  const arcId = useId();
  return (
    <span
      className={`dd-player-kit${offer.typ === "WOLNY" ? " is-free-agent" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 30 28" focusable="false">
        <path
          id={arcId}
          d="M7.8 14.6a7.2 1.9 0 0 1 14.4 0"
          fill="none"
          className="dd-player-kit-arc"
        />
        <path d="M10.5 1 4 4 1 9.5l4.5 2.6V27h19V12.1L29 9.5 26 4l-6.5-3c0 2.4-1.9 4-4.5 4s-4.5-1.6-4.5-4z" />
        <text className="name">
          <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
            {shirtName(offer.zawodnik.nazwa)}
          </textPath>
        </text>
      </svg>
    </span>
  );
};

/**
 * Where the offered player would slot in on his position, by visible OVR.
 *
 * The single most useful thing this block can say: it answers "what does this
 * transfer actually change" without the player comparing tiles himself, under
 * a clock. For a player who is already ours it states the role he holds now,
 * which is the same question asked from the other side of a sale.
 *
 * Ranked against our players on that position only - not the whole squad -
 * because that is the competition he actually faces.
 */
const transferRole = (
  offer: Offer,
  squad: readonly Player[],
  formation: Formation
): { label: string; value: string } => {
  const position = offer.zawodnik.poz;
  const onPosition = squad
    .filter((player) => player.poz === position && player.id !== offer.zawodnik.id)
    .map((player) => player.ovr)
    .sort((a, b) => b - a);
  const slots = formation.pozycje.find((slot) => slot.kod === position)?.xi ?? 1;
  const rank = onPosition.filter((ovr) => ovr > offer.zawodnik.ovr).length;
  const value =
    rank < slots ? "podstawowy" : rank === slots ? "pierwszy zmiennik" : "uzupełnienie kadry";
  const own = offer.typ === "SPRZEDAZ" || offer.typ === "PRZEDLUZENIE";

  return { label: own ? "Obecny status zawodnika" : "Status zawodnika po transferze", value };
};

/**
 * The card's way into the squad drawer, with a glance at the position first.
 *
 * The preview came back after being cut for a release: without it the player
 * has to open the drawer to learn anything about the position at all, and the
 * offer clock is running while he does. Quality and depth at a glance is
 * exactly what this block is for.
 *
 * The whole block is the button, so a press anywhere in it opens the drawer -
 * aiming at the small label was a trap, because the tiles are the obvious
 * thing to press and they did nothing. That is legal again because the
 * non-interactive Tile renders phrasing content now: a <span> holding
 * <span>s, no <div> and no <ul>, and role="group" is not interactive, so
 * there is no nested-interactive failure.
 */
const PositionSquad = ({
  offer,
  squad,
  formation,
  inEurope,
  seasonalChanges,
  changePeriod,
  offerPlayerId,
  onOpen,
}: {
  offer: Offer;
  squad: readonly Player[];
  formation: Formation;
  inEurope: boolean;
  seasonalChanges: OvrChange;
  changePeriod: SeasonChangePeriod;
  offerPlayerId?: string;
  onOpen: () => void;
}) => {
  const position = offer.zawodnik.poz;
  const xi = xiInOrder(squad, formation);
  const starters = xi.filter((player) => player.poz === position && !("brak" in player));
  const bench = substitutes(squad, formation).filter((player) => player.poz === position);
  const expectedStarters = formation.pozycje.find((slot) => slot.kod === position)?.xi ?? 1;
  const depth = positionDepth(starters.length, bench.length);
  const quality = positionQuality(squad, formation, position, inEurope);
  const role = transferRole(offer, squad, formation);

  return (
    <button
      type="button"
      className="dd-offer-position-squad dd-offer-squad-trigger"
      // Named by its contents, not by an aria-label: a label replaced
      // everything below with "otwórz kadrę", hiding the position lines from
      // screen readers and failing WCAG 2.5.3 (the name has to contain the
      // visible text) for speech input.
      aria-haspopup="dialog"
      aria-controls="squad-drawer"
      // WebKit does not focus a button when it is clicked, unlike Chromium.
      // SquadDrawer restores focus to whatever was focused when it opened, so
      // without this the drawer sent focus back to <body> on Safari and iOS -
      // a tab from there restarts at the top of the document instead of
      // continuing from the trigger. Focusing explicitly costs nothing where
      // the browser already did it.
      onClick={(event) => {
        event.currentTarget.focus();
        onOpen();
      }}
    >
      <span className="dd-offer-section-label">
        <span>Kadra</span>
        {/* Not "rozwiń": nothing expands in place - a drawer opens over the
            card, showing the whole formation rather than this position alone.
            The word promised the wrong thing and undersold what is behind it.
            A chevron says "this leads somewhere", which is what happens. */}
        <span className="dd-offer-squad-cue">
          cała kadra
          <span aria-hidden="true">›</span>
        </span>
      </span>
      {/* Tiles left, two label/value lines filling the room to their right.
          Stacked, the tiles left most of the block empty - two 78px cards in
          a card this wide - and an unlabelled phrase gave no clue what it was
          describing. Same dot-leader grammar as the report's metadata rows. */}
      <span className="dd-offer-position-body">
        <span className="dd-offer-position-tiles">
          {starters.slice(0, expectedStarters).map((player, index) => (
            <Tile
              key={player.id}
              player={player}
              substitutes={index === 0 ? bench : []}
              highlighted={false}
              seasonalChanges={seasonalChanges}
              changePeriod={changePeriod}
              offerPlayerId={offerPlayerId}
            />
          ))}
        </span>
        <span className="dd-offer-position-lines">
          {/* Kept, not deleted: the tiles beside this already show the same
              thing, so the row was repeating what the reader can see. It goes
              back by dropping the `hidden`. */}
          <span className="dd-offer-position-line" hidden>
            <span className="dd-metadata-label">Głębia pozycji</span>
            <span className="dd-metadata-leader" aria-hidden="true" />
            <span className="dd-metadata-value">{depth}</span>
          </span>
          <span className="dd-offer-position-line">
            <span className="dd-metadata-label">Jakość pozycji</span>
            <span className="dd-metadata-leader" aria-hidden="true" />
            <span className="dd-metadata-value">{quality}</span>
          </span>
          <span className="dd-offer-position-line">
            <span className="dd-metadata-label">{role.label}</span>
            <span className="dd-metadata-leader" aria-hidden="true" />
            <span className="dd-metadata-value">{role.value}</span>
          </span>
        </span>
      </span>
    </button>
  );
};

export const OfferCard = ({
  offer,
  squad,
  formation,
  europeanCup,
  marketState,
  price,
  wage,
  cash,
  cashAfter,
  totalWagesAfter,
  forecastAfter,
  currentClubName,
  timer,
  seasonalChanges,
  changePeriod,
  onOpenSquad,
}: {
  offer: Offer;
  squad: readonly Player[];
  formation: Formation;
  europeanCup: EuropeanCup | null;
  marketState: MarketState;
  price: number;
  wage: number;
  cash: number;
  cashAfter: number;
  totalWagesAfter: number;
  forecastAfter: number;
  currentClubName: string;
  timer: { current: number; maximum: number } | null;
  /** Per-player OVR delta from the last development pass, for the squad
   * tiles and - for our own player only - the rating line. */
  seasonalChanges: OvrChange;
  changePeriod: SeasonChangePeriod;
  onOpenSquad: () => void;
}) => {
  const details = OFFER_DETAILS[offer.typ];
  const market = marketLabel(offer.typ, marketState);
  const trend = getAgeTrend(offer.zawodnik);
  const buyer = offer.buyer?.name ?? null;
  const isSale = offer.typ === "SPRZEDAZ";
  const isExtension = offer.typ === "PRZEDLUZENIE";
  // Decides "trener:" vs "skaut:" and which club name shows - both of the
  // player's own squad's offer types. isSale alone still governs the fee block's own wording,
  // since PRZEDLUZENIE has a third, wage-shaped block of its own below.
  const isOwnPlayer = isSale || isExtension;
  // Only our own player has a history the club could know. For KUPNO, WOLNY
  // and PANIC there is nothing to show and inventing it would be a channel
  // outside the closed catalogue of hidden-ceiling signals. The squad tiles below are unaffected:
  // those are our players whatever the offer type is.
  const ownChange = isOwnPlayer
    ? seasonChangeBadge(
        seasonalChanges.byPlayer[offer.zawodnik.id],
        changePeriod,
        wasMeasured(offer.zawodnik.wKlubieOd, seasonalChanges.season)
      )
    : null;
  const share =
    cash > 0 && !isSale && !isExtension ? Math.min(100, Math.max(0, (price / cash) * 100)) : 0;
  const sender = isExtension
    ? `Kontrakt twojego ${POSITION_NOUN_ACCUSATIVE[offer.zawodnik.poz]} wygasa po sezonie.`
    : buyer
      ? `${buyer} chce kupić twojego zawodnika.`
      : details.sender;

  return (
    <article className={`dd-offer-card ${details.className}`} aria-labelledby="offer-player-name">
      <div className="dd-offer-sender">
        <span>{sender}</span>
        {timer && (
          <span className="dd-offer-clock">
            <strong>{timer.current}</strong>
            <span>sek</span>
          </span>
        )}
      </div>
      {timer && (
        <div
          className={`dd-timer${timer.current <= 5 ? " napiete" : ""}`}
          role="progressbar"
          aria-label="Czas do automatycznego odrzucenia oferty"
          aria-valuemin={0}
          aria-valuemax={timer.maximum}
          aria-valuenow={timer.current}
        >
          <i style={{ width: `${(timer.current / timer.maximum) * 100}%` }} />
        </div>
      )}
      <div className="dd-offer-body">
        <PlayerKit offer={offer} />
        <div className="dd-offer-kind">
          {details.label} · {offer.zawodnik.poz}
        </div>
        <div className="dd-offer-name-row">
          <h2 className="dd-offer-name" id="offer-player-name">
            {offer.zawodnik.nazwa}
          </h2>
        </div>
        <p className="dd-offer-meta">
          {/* Same reading order as a squad tile: the glyph against the age it
              is computed from, the delta against the ovr it is a change in. */}
          Ocena <strong className={getOvrTone(offer.zawodnik.ovr)}>{offer.zawodnik.ovr}</strong>
          {ownChange && (
            <span className={`dd-season-change ${ownChange.tone}`} aria-label={ownChange.label}>
              {ownChange.marker && (
                <span className="dd-season-change-marker" aria-hidden="true">
                  {ownChange.marker}
                </span>
              )}
              <span className="dd-season-change-value">{ownChange.text}</span>
            </span>
          )}{" "}
          ·{" "}
          <span className="dd-age-trend" aria-label={trend.label}>
            {trend.glyph}
          </span>{" "}
          <strong>{offer.zawodnik.wiek}</strong> {pluralFormPl(offer.zawodnik.wiek, YEAR_FORMS)}
        </p>
        <p className="dd-offer-club">
          {isOwnPlayer ? currentClubName : offerClubLine(offer, details.club)}
          {/* One line with the club, as one more field after a middle dot. */}
          {isExtension &&
            (offer.zawodnik.wKlubieOd === 0
              ? " · w klubie od początku"
              : ` · w klubie od ${ord(offer.zawodnik.wKlubieOd)} sezonu`)}
        </p>

        <section className="dd-offer-fee" aria-label="Warunki i skutki transakcji">
          <div className="dd-offer-fee-primary">
            <div>
              <span>{isExtension ? "Dostaje" : isSale ? "Wpływ" : "Odstępne"}</span>
              <strong className={!isExtension && price === 0 ? "is-zero" : undefined}>
                {isExtension ? money(wage) : price === 0 ? "bez odstępnego" : money(price)}
              </strong>
            </div>
            <div>
              <span>{isExtension ? "Chce dostawać" : "Płaca/rok"}</span>
              <strong>{money(isExtension ? price : wage)}</strong>
            </div>
          </div>
          <div
            className="dd-cash-share"
            role={isOwnPlayer ? undefined : "progressbar"}
            aria-hidden={isOwnPlayer ? "true" : undefined}
            aria-label={isOwnPlayer ? undefined : "Udział odstępnego w dostępnej kasie"}
            aria-valuemin={isOwnPlayer ? undefined : 0}
            aria-valuemax={isOwnPlayer ? undefined : 100}
            aria-valuenow={isOwnPlayer ? undefined : Math.round(share)}
          >
            {!isOwnPlayer && <i style={{ width: `${share}%` }} />}
          </div>
          <div className={`dd-offer-market ${market.className}`}>Rynek: {market.label}</div>
          <div className="dd-offer-effects">
            <div>
              <strong className={cashAfter < 0 ? "is-negative" : ""}>{pl(cashAfter)}</strong>
              <span>{isExtension ? "kasa bez zmian" : "kasa po"}</span>
            </div>
            <div>
              <strong>{pl(totalWagesAfter)}</strong>
              <span>łączne płace po</span>
            </div>
            <div>
              <strong className={forecastAfter < 0 ? "is-negative" : "is-positive"}>
                {forecastAfter > 0 ? "+" : ""}
                {pl(forecastAfter)}
              </strong>
              <span>zmiana budżetu po</span>
            </div>
          </div>
        </section>

        <PositionSquad
          offer={offer}
          squad={squad}
          formation={formation}
          inEurope={europeanCup !== null}
          seasonalChanges={seasonalChanges}
          changePeriod={changePeriod}
          // Only for an offer about one of ours: a purchase's player is not in
          // the squad, so there would be nobody in these tiles to mark.
          offerPlayerId={isOwnPlayer ? offer.zawodnik.id : undefined}
          onOpen={onOpenSquad}
        />

        <PlayerReports
          staffAssessment={offer.staffAssessment}
          analystReport={offer.analystReport}
          position={offer.zawodnik.poz}
          currentOvr={offer.zawodnik.ovr}
          pastTense={offer.typ === "WOLNY"}
        />
      </div>
    </article>
  );
};
