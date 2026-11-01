import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";

import type {
  Formation,
  OvrChange,
  Player,
  PlayingTime,
  PositionCode,
  ReportPeriod,
  StaffMemo,
} from "../../data/types";
import { createSquadReports, squadPlayingTime } from "../../logic/squad-reports";
import { pluralPl, YEAR_FORMS } from "../../logic/format";
import { startingXi, substitutes } from "../../logic/squad";
import {
  getAgeTrend,
  getOvrTone,
  seasonChangeBadge,
  wasMeasured,
  type SeasonChangePeriod,
} from "./player-tile-utils";
import { PlayerReports } from "./player-reports";

/**
 * Air left above a freshly expanded row so it does not read as clipped.
 *
 * Deliberately below the 7px gap between rows: it has to land inside that gap
 * instead of pulling the previous row's bottom edge back into view, which
 * looks like a mis-aimed scroll rather than a margin.
 */
const REVEAL_MARGIN = 4;

/** The element that actually scrolls around `node`.
 *
 * Found rather than assumed. The list is not the scroller - the drawer's
 * content area is, and it is the only one, by design: two nested scrollers
 * put two bars side by side and make it a lottery which one a gesture moves. */
const scrollerOf = (node: HTMLElement): HTMLElement | null => {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight) {
      return el;
    }
  }
  return null;
};

/** Brings an expanded row into view inside whatever scrolls around it.
 *
 * Prefers showing the whole report; when the report is taller than the
 * scroller can show, aligns its top, so reading starts at the beginning
 * rather than in the middle of a metric. Instant, never smooth: this runs on
 * every expand, and animating it would fight prefers-reduced-motion. */
const revealRow = (row: HTMLElement): void => {
  const scroller = scrollerOf(row);
  if (!scroller) return;
  const box = scroller.getBoundingClientRect();
  const rowBox = row.getBoundingClientRect();
  const topOverflow = rowBox.top - box.top;
  const bottomOverflow = rowBox.bottom - box.bottom;
  if (rowBox.height + REVEAL_MARGIN >= box.height || topOverflow < REVEAL_MARGIN) {
    scroller.scrollTop += topOverflow - REVEAL_MARGIN;
  } else if (bottomOverflow > 0) {
    scroller.scrollTop += bottomOverflow;
  }
};

const PlayerRow = ({
  player,
  status,
  playingTime,
  period,
  contextOvr,
  memo,
  seasonalChange,
  changeMeasured,
  changePeriod,
  expanded,
  onToggle,
}: {
  player: Player;
  /** Named `status`, not `role`: a JSX prop called `role` is an ARIA role
   * as far as tooling is concerned, and this is a squad status. */
  status: "podstawowy" | "rezerwowy";
  playingTime: PlayingTime;
  period: ReportPeriod;
  contextOvr: number;
  /** What the club remembers about this player, or null if nothing yet. */
  memo: StaffMemo | null;
  seasonalChange?: number;
  changeMeasured: boolean;
  changePeriod: SeasonChangePeriod;
  expanded: boolean;
  onToggle: () => void;
}) => {
  const reportId = useId();
  const row = useRef<HTMLLIElement>(null);
  const trend = getAgeTrend(player);
  // Deterministic within a season and window, so this recomputes to the same
  // report every render and never touches the main RNG.
  const reports = createSquadReports(player, period, contextOvr, playingTime, memo);
  const change = seasonChangeBadge(seasonalChange, changePeriod, changeMeasured);

  // Layout effect, not effect: the row must be in view before the browser
  // paints, or the reader sees it jump.
  useLayoutEffect(() => {
    if (expanded && row.current) revealRow(row.current);
  }, [expanded]);

  return (
    <li className="dd-player-row" ref={row}>
      <button
        type="button"
        className="dd-player-trigger"
        aria-expanded={expanded}
        aria-controls={reportId}
        data-dd-action="raport-zawodnika"
        onClick={onToggle}
      >
        {/* Two lines, three columns: name / leader / ovr above, status /
            leader / age below. A grid rather than two stacked columns so each
            line gets its own leader, centred on that line - a single leader
            spanning the row can only ever be centred on one of them. */}
        <span className="dd-player-row-name">
          {player.nazwa}
          {/* The one fact about this player that outranks anything in his
              report: he is leaving unless the extension card comes back. The
              squad tile already says it by draining the ovr of its quality
              tone (tile.tsx's is-expiring), and this row says it that way too
              - but a tile has no room for a word and a row does, so here it
              is also spelled out. */}
          {player.wygasa && <span className="dd-player-row-expiring"> · wygasa</span>}
        </span>
        <span className="dd-player-row-leader" aria-hidden="true" />
        {/* Same reading order as a squad tile: the glyph against the age it
            is computed from, the delta against the ovr it is a change in.
            This layout puts the age on the second line, so the pairs split
            across lines rather than sitting in one row. */}
        <span
          className={`dd-player-row-ovr ${player.wygasa ? "is-expiring" : getOvrTone(player.ovr)}`}
        >
          {player.ovr}
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
        <span className="dd-player-row-role">{status}</span>
        <span className="dd-player-row-leader" aria-hidden="true" />
        <span className="dd-player-row-age">
          <span className="dd-age-trend" aria-label={trend.label}>
            {trend.glyph}
          </span>
          {pluralPl(player.wiek, YEAR_FORMS)}
        </span>
      </button>
      {/* Contents only while open. A collapsed row that keeps its report
          mounted also keeps whatever the reader had opened inside it - the
          confidence popover would still be showing on the way back. */}
      <div className="dd-player-report" id={reportId} hidden={!expanded}>
        {expanded && (
          <PlayerReports
            staffAssessment={reports.staffAssessment}
            analystReport={reports.analystReport}
            position={player.poz}
            currentOvr={player.ovr}
          />
        )}
      </div>
    </li>
  );
};

/**
 * Every player on one position - starters in the order the automatic XI uses,
 * then the substitutes - as a single-open accordion.
 *
 * Which tile was clicked decides the position and nothing else: the list
 * always opens fully collapsed. Remounting it (a different position, or the
 * drawer reopening) resets the state for free, which is why "expanded" lives
 * here rather than any higher up.
 */
export const PositionReports = ({
  position,
  squad,
  formation,
  period,
  contextOvr,
  staffMemory,
  seasonalChanges,
  changePeriod,
}: {
  position: PositionCode;
  squad: readonly Player[];
  formation: Formation;
  period: ReportPeriod;
  contextOvr: number;
  /** The WHOLE map, not one entry: this list shows several players at once,
   * and picking the entry a screen higher up would scatter one decision
   * across two files. */
  staffMemory: Record<string, StaffMemo>;
  seasonalChanges: OvrChange;
  changePeriod: SeasonChangePeriod;
}) => {
  const starters = startingXi(squad, formation).filter((player) => player.poz === position);
  const bench = substitutes(squad, formation).filter((player) => player.poz === position);
  const onlyPlayer = starters.length + bench.length === 1 ? (starters[0] ?? bench[0]) : null;

  // Collapsed by default - except when there is nobody to choose between, in
  // which case the choice is the whole interaction and making it by hand is
  // busywork. Not state that survives anything: the list is remounted per
  // position and per opening, so this is simply where it starts.
  const [expandedId, setExpandedId] = useState<string | null>(onlyPlayer?.id ?? null);
  const toggle = useCallback(
    (id: string) => setExpandedId((current) => (current === id ? null : id)),
    []
  );
  // One pass over the whole squad, not one per row: both halves of this sort
  // the entire roster.
  const playingTime = squadPlayingTime(squad, formation);

  return (
    <ul className="dd-position-reports" aria-label={`Zawodnicy na pozycji ${position}`}>
      {starters.map((player) => (
        <PlayerRow
          key={player.id}
          player={player}
          status="podstawowy"
          playingTime={playingTime.get(player.id) ?? "starter"}
          period={period}
          contextOvr={contextOvr}
          memo={staffMemory[player.id] ?? null}
          seasonalChange={seasonalChanges.byPlayer[player.id]}
          changeMeasured={wasMeasured(player.wKlubieOd, seasonalChanges.season)}
          changePeriod={changePeriod}
          expanded={expandedId === player.id}
          onToggle={() => toggle(player.id)}
        />
      ))}
      {bench.map((player) => (
        <PlayerRow
          key={player.id}
          player={player}
          status="rezerwowy"
          playingTime={playingTime.get(player.id) ?? "reserve"}
          period={period}
          contextOvr={contextOvr}
          memo={staffMemory[player.id] ?? null}
          seasonalChange={seasonalChanges.byPlayer[player.id]}
          changeMeasured={wasMeasured(player.wKlubieOd, seasonalChanges.season)}
          changePeriod={changePeriod}
          expanded={expandedId === player.id}
          onToggle={() => toggle(player.id)}
        />
      ))}
    </ul>
  );
};
