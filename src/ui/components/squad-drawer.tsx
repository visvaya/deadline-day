import { useEffect, useRef, useState } from "react";
import type {
  Formation,
  OvrChange,
  Player,
  PositionCode,
  ReportPeriod,
  StaffMemo,
} from "../../data/types";
import type { SeasonChangePeriod } from "./player-tile-utils";
import { pluralPl } from "../../logic/format";
import { startingXi, substitutes } from "../../logic/squad";
import { at } from "../../logic/invariant";
import { PositionReports } from "./position-reports";
import { positionQuality } from "./position-summary";
import { SquadGrid } from "./squad-grid";
import { useScrollLock } from "../use-scroll-lock";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const CLOSE_DRAG_THRESHOLD = 96;

/** "1 podstawowy · 1 rezerwowy · Jakość pozycji: średnia" for the subtitle.
 *
 * Spelled out rather than bare "Jakość", which in a panel titled "Raporty
 * zawodników" could be read as the quality of the report.
 *
 * The verdict rides along with the counts rather than taking a line of its
 * own: it answers the same question they raise, and the offer card already
 * says it in the block this drawer opens from - shared through
 * positionQuality so the two can never disagree. */
const positionCount = (
  squad: readonly Player[],
  formation: Formation,
  position: PositionCode,
  inEurope: boolean
): string => {
  const starters = startingXi(squad, formation).filter((player) => player.poz === position).length;
  const bench = substitutes(squad, formation).filter((player) => player.poz === position).length;
  return [
    pluralPl(starters, ["podstawowy", "podstawowych", "podstawowych"]),
    pluralPl(bench, ["rezerwowy", "rezerwowych", "rezerwowych"]),
    `Jakość pozycji: ${positionQuality(squad, formation, position, inEurope)}`,
  ].join(" · ");
};

const averageOvr = (players: readonly Player[]): string =>
  players.length
    ? (players.reduce((total, player) => total + player.ovr, 0) / players.length)
        .toFixed(1)
        .replace(".", ",")
    : "–";

/**
 * The squad drawer, in two modes inside one container.
 *
 * `grid` shows the whole formation and answers "where would this offer play".
 * `reports` shows every player on one position, each row expanding its own
 * staff and analyst report in place.
 *
 * One drawer, not two, and one header: a second header inside the scrolling
 * content rendered as a card floating on the drawer's own background, with
 * two rounded corners and two backgrounds. The header is also the drag
 * handle, and it has to stay outside the scroller or the closing gesture
 * stops working exactly when the report is long.
 *
 * `initialPosition` decides which mode the drawer opens in. From the squad
 * screen a tile opens straight into that position's reports; from an offer
 * card the drawer opens on the grid, and a tile steps into the reports.
 */
export const SquadDrawer = ({
  squad,
  formation,
  highlightedPosition,
  seasonalChanges,
  changePeriod,
  period,
  contextOvr,
  staffMemory,
  inEurope,
  initialPosition = null,
  exitLabel,
  onClose,
}: {
  squad: readonly Player[];
  formation: Formation;
  /** The offer's position, or null when there is no offer - opened from the
   * squad review screen. */
  highlightedPosition: PositionCode | null;
  seasonalChanges: OvrChange;
  changePeriod: SeasonChangePeriod;
  period: ReportPeriod;
  contextOvr: number;
  /** Passed straight through to the reports: the drawer never picks an entry
   * out of it, it just carries it down. */
  staffMemory: Record<string, StaffMemo>;
  /** Raises what counts as enough cover - see positionQuality. */
  inEurope: boolean;
  initialPosition?: PositionCode | null;
  /** "Wróć do oferty" from an offer card, "Zamknij" from the squad screen -
   * there is no offer there to go back to. */
  exitLabel: string;
  onClose: () => void;
}) => {
  const [openPosition, setOpenPosition] = useState<PositionCode | null>(initialPosition);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drag = useRef({ active: false, startY: 0, offset: 0 });
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  useScrollLock();

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The page is held still by useScrollLock above - shared with the
    // squad-depth confirmation so both learn the same mobile lessons once.
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      // A report row inside this drawer can hold its own open InfoPopover
      // (PositionReports -> StaffConfidenceHelp), which answers Escape first
      // in the capture phase on `document` (see info-popover.tsx) and marks
      // the press with `event.preventDefault()`. This bubble-phase listener
      // runs after that, so it has to check for the same mark before closing
      // the whole drawer on a press the popover already consumed - the Tab
      // focus-trap handling below is unaffected either way.
      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
      );
      if (!focusable.length) return;
      const first = at(focusable, 0, "squad drawer focusable element");
      const last = at(focusable, focusable.length - 1, "squad drawer focusable element");
      if (focusable.length === 1 || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    // Closing on a press outside is a pointer convenience that duplicates two
    // keyboard paths which already exist and are covered by the smoke test:
    // Escape, handled above, and the close button, which takes focus when the
    // drawer opens. Giving the backdrop a role and a tab stop of its own would
    // add a stop that does nothing for a keyboard user.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="dd-squad-drawer-backdrop"
      onMouseDown={(event) => {
        // Only a press landing on the backdrop itself closes: a press inside
        // the drawer bubbles up here carrying a different target. This
        // replaced a second mouse handler on the dialog that existed purely
        // to stop propagation.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="dd-squad-drawer"
        id="squad-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="squad-drawer-title"
        ref={dialogRef}
        style={{
          transform: dragOffset ? `translateY(${dragOffset}px)` : undefined,
          transition: dragging ? "none" : undefined,
        }}
      >
        {/* Grab bar and heading are ONE drag surface.
            The bar used to be a sibling with no handlers at all, so the one
            thing in the drawer that looks like a handle was the one thing
            that did nothing - a press on it started a text selection instead.
            Together they roughly triple the target, which is what made the
            reports mode so hard to close: its header is the only part of a
            tall drawer that is not scrolling content.

            preventDefault on the press is what actually stops the selection.
            user-select: none hides the highlight but the browser still starts
            a selection drag underneath, and on desktop that is what the
            pointer ends up doing. */}
        <div
          className="dd-squad-drawer-handle"
          onPointerDown={(event) => {
            drag.current = { active: true, startY: event.clientY, offset: 0 };
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
            event.preventDefault();
          }}
          onPointerMove={(event) => {
            if (!drag.current.active) return;
            const offset = Math.max(0, event.clientY - drag.current.startY);
            drag.current.offset = offset;
            setDragOffset(offset);
          }}
          onPointerUp={(event) => {
            if (!drag.current.active) return;
            drag.current.active = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
            setDragging(false);
            if (drag.current.offset > CLOSE_DRAG_THRESHOLD) {
              onClose();
            } else {
              setDragOffset(0);
            }
          }}
          onPointerCancel={() => {
            drag.current.active = false;
            setDragging(false);
            setDragOffset(0);
          }}
        >
          <span className="dd-squad-drawer-grab" aria-hidden="true" />
          <div className="dd-squad-drawer-heading">
            {/* Arrow and title share their own row, so the arrow centres on
                the title rather than on the whole heading - the heading is
                baseline aligned and holds a 16px title beside an 11px
                subtitle, which left the arrow sitting visibly low.

                The arrow steps back one level and never closes the drawer;
                that is the button at the bottom, and wiring both to one action
                would look right on screen while costing a tap from inside
                every report. It is absent when the drawer opened straight into
                the reports: there is no grid behind it to go back to.

                Its own pointer handler stops the press reaching the drag
                surface, which would otherwise start a drag on the way to a
                click. */}
            <span className="dd-squad-drawer-title-row">
              {openPosition && !initialPosition && (
                <button
                  type="button"
                  className="dd-squad-drawer-back"
                  data-dd-action="kadra-wroc"
                  aria-label="Wróć do kadry"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setOpenPosition(null)}
                >
                  {/* A drawn chevron, not the "‹" character. Geometrically
                      the button was already centred on the title; the glyph
                      just sits low inside its own em box in this face, so it
                      READ as low however the box was aligned. A path is
                      centred by construction and cannot drift with the font.
                      Vector, so the "no raster graphics" rule is untouched -
                      the same approach as the shirt on the offer card. */}
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path
                      d="M14.5 5.5 8 12l6.5 6.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
              <h2 id="squad-drawer-title">
                {openPosition ? (
                  <>
                    Raporty zawodników{" "}
                    {/* Same quiet treatment as "pozycja oferty: BR" - the
                        position qualifies the title, it is not part of it. The
                        separator went with the styling: once the qualifier is
                        set apart visually, a dot before it is one mark doing a
                        job already done. */}
                    <span className="dd-squad-drawer-position">{openPosition}</span>
                  </>
                ) : (
                  <>
                    Kadra{" "}
                    {highlightedPosition && (
                      <span className="dd-squad-drawer-position">
                        pozycja oferty: {highlightedPosition}
                      </span>
                    )}
                  </>
                )}
              </h2>
            </span>
            <p>
              {openPosition
                ? positionCount(squad, formation, openPosition, inEurope)
                : `śr. OVR · jedenastka ${averageOvr(startingXi(squad, formation))} · kadra ${averageOvr(squad)}`}
            </p>
          </div>
        </div>
        <div className="dd-squad-drawer-content">
          {openPosition ? (
            <PositionReports
              position={openPosition}
              squad={squad}
              formation={formation}
              period={period}
              contextOvr={contextOvr}
              staffMemory={staffMemory}
              seasonalChanges={seasonalChanges}
              changePeriod={changePeriod}
            />
          ) : (
            <SquadGrid
              squad={squad}
              formation={formation}
              highlightedPosition={highlightedPosition}
              seasonalChanges={seasonalChanges}
              changePeriod={changePeriod}
              onOpenPosition={setOpenPosition}
            />
          )}
        </div>
        <button
          ref={closeRef}
          type="button"
          className="dd-squad-drawer-close"
          data-dd-action="kadra-zamknij"
          onClick={onClose}
        >
          {exitLabel}
        </button>
      </section>
    </div>
  );
};
