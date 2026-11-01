import { useId } from "react";
import type { OvrChange, Player, PositionCode } from "../../data/types";
import { pluralPl, YEAR_FORMS } from "../../logic/format";
import type { SquadSlot } from "../../logic/squad";
import {
  getAgeTrend,
  getOvrTone,
  seasonChangeBadge,
  wasMeasured,
  type SeasonChangePeriod,
} from "./player-tile-utils";

const Rating = ({
  player,
  changes,
  period,
  isOffer = false,
  reserve = false,
}: {
  player: SquadSlot;
  changes: OvrChange;
  period: SeasonChangePeriod;
  isOffer?: boolean;
  reserve?: boolean;
}) => {
  if ("brak" in player) return <span className="dd-player-missing">brak zawodnika</span>;
  const trend = getAgeTrend(player);
  const change = seasonChangeBadge(
    changes.byPlayer[player.id],
    period,
    wasMeasured(player.wKlubieOd, changes.season)
  );
  // A player whose contract runs out is drawn without colour, ovr and delta
  // alike: the row is about to stop being ours, and saying that by taking its
  // colour away costs no space, where the old "WYGASA" label took a whole grid
  // row of a 78px tile. Product owner's call, 2026-08-22, with its cost
  // accepted: an expiring row no longer shows the quality tone of its ovr, and
  // its delta cannot be told from one already read.
  //
  // Expressed as an alternative tone rather than as an override, so there is no
  // specificity contest with the tone rules or the substitute's.
  const tone = player.wygasa ? "is-expiring" : getOvrTone(player.ovr);
  // Left to right: age glyph, age, ovr, delta. The glyph sits against the age
  // because that is the only thing it is computed from, and the delta against
  // the ovr because that is what it is a change in - neither adjacency is
  // decoration. The tone class rides on this span rather than on the tile, so
  // a substitute is coloured by his own ovr instead of the starter's.
  return (
    <span
      className={`dd-player-rating ${tone}${reserve ? " is-reserve" : ""}${
        isOffer ? " is-offer" : ""
      }`}
    >
      <span className="dd-player-rating-lead">
        <span className="dd-age-trend" aria-label={trend.label}>
          {trend.glyph}
        </span>
        <span className="dd-player-age" aria-label={pluralPl(player.wiek, YEAR_FORMS)}>
          {player.wiek}
        </span>
      </span>
      <strong>{player.ovr}</strong>
      <span
        className={`dd-season-change ${player.wygasa ? "is-neutral" : change.tone}`}
        aria-label={change.label}
      >
        {change.marker && (
          <span className="dd-season-change-marker" aria-hidden="true">
            {change.marker}
          </span>
        )}
        <span className="dd-season-change-value">{change.text}</span>
      </span>
    </span>
  );
};

/** What the tile says, spelled out.
 *
 * The tile's contents are bare numbers - "68 29 61 20" tells a screen-reader
 * user nothing. Stating the facts explicitly also keeps the substitutes'
 * count, which the visual tile conveys by simply listing them. The inert tile
 * is named by it; the button keeps its visible text as its name and is
 * described by it instead, because a name that does not contain the visible
 * text breaks speech input (WCAG 2.5.3, Label in Name). */
const tileLabel = (
  player: SquadSlot,
  substitutes: SquadSlot[],
  highlighted: boolean,
  offerPlayerId?: string
): string => {
  const position = `Pozycja ${player.poz}`;
  if ("brak" in player) return `${position}, brak zawodnika`;
  const bench = substitutes.length ? `, zmienników: ${substitutes.length}` : ", bez zmienników";
  const offer = highlighted ? ", pozycja oferty" : "";
  // The rule on this tile is drawn with a pair of edges, which says nothing to
  // a screen reader. Which of the players in here the offer is about is a fact
  // about the tile, so it goes in the tile's name.
  const named = [player, ...substitutes].find(
    (one) => !("brak" in one) && one.id === offerPlayerId
  );
  const which =
    named && !("brak" in named) ? `, oferta dotyczy zawodnika z oceną ${named.ovr}` : "";
  // Losing its colour is all an expiring row says on screen, and a screen
  // reader gets none of that - so the fact moves into the tile's name, where
  // the label used to carry it.
  const expiring = [player, ...substitutes]
    .filter((one) => !("brak" in one) && one.wygasa)
    .map((one) => (one as Player).ovr);
  const contracts = expiring.length
    ? `, kontrakt wygasa: ${expiring.map((ovr) => `zawodnik z oceną ${ovr}`).join(", ")}`
    : "";
  return `${position}, ocena ${player.ovr}, wiek ${player.wiek}${bench}${offer}${which}${contracts}`;
};

/**
 * One position on the pitch: the starter, and any substitutes behind him.
 *
 * A tile with a player in it is a button that opens that position's reports.
 * An empty one stays inert - there is nobody to report on.
 *
 * The substitutes are spans rather than a `<ul>`: a list is flow content and
 * a button may only contain phrasing content. Nothing is lost, because a
 * button suppresses the list semantics of anything inside it anyway.
 */
export const Tile = ({
  player,
  substitutes,
  highlighted,
  seasonalChanges,
  changePeriod,
  offerPlayerId,
  onOpenPosition,
}: {
  player: SquadSlot;
  substitutes: SquadSlot[];
  highlighted: boolean;
  /** Looked up per player rather than passed pre-resolved: the starter and
   * every substitute below him each read their own entry. */
  seasonalChanges: OvrChange;
  changePeriod: SeasonChangePeriod;
  /** The player this offer is about, when he is one of ours and therefore
   * somewhere in this tile. Undefined everywhere else - a purchase offer's
   * player is not in the squad, so there is nobody here to mark. */
  offerPlayerId?: string;
  onOpenPosition?: (_position: PositionCode) => void;
}) => {
  const descriptionId = useId();
  const className = `dd-player-tile ${getOvrTone(player.ovr)}${highlighted ? " is-highlighted" : ""}`;
  const empty = "brak" in player;
  const body = (
    <>
      <span className="dd-player-position">{player.poz}</span>
      <Rating
        player={player}
        changes={seasonalChanges}
        period={changePeriod}
        isOffer={!("brak" in player) && player.id === offerPlayerId}
      />
      <span className="dd-player-bench">
        {substitutes.length > 0 ? (
          substitutes.map((substitute) => (
            <span
              className="dd-player-substitute"
              data-position={substitute.poz}
              key={substitute.id}
            >
              <Rating
                player={substitute}
                reserve
                changes={seasonalChanges}
                period={changePeriod}
                isOffer={!("brak" in substitute) && substitute.id === offerPlayerId}
              />
            </span>
          ))
        ) : (
          <span aria-hidden="true">–</span>
        )}
      </span>
    </>
  );

  if (!onOpenPosition || empty) {
    // A <span>, not a <div>: the offer card renders these inside its own
    // button, and a button takes phrasing content only. Same reason the
    // substitutes stopped being a <ul>. display:flex comes from the class.
    return (
      <span
        className={className}
        data-position={player.poz}
        role="group"
        aria-label={tileLabel(player, substitutes, highlighted, offerPlayerId)}
      >
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      data-position={player.poz}
      data-dd-action={`kadra-pozycja-${player.poz}`}
      aria-haspopup="dialog"
      aria-describedby={descriptionId}
      onClick={(event) => {
        // WebKit does not focus a button on click. The drawer returns focus to
        // whatever held it when it opened, so without this Safari sends focus
        // back to <body> and a tab restarts at the top of the document.
        event.currentTarget.focus();
        onOpenPosition(player.poz);
      }}
    >
      {body}
      <span id={descriptionId} hidden>
        {`${tileLabel(player, substitutes, highlighted, offerPlayerId)} · otwórz raporty zawodników`}
      </span>
    </button>
  );
};
