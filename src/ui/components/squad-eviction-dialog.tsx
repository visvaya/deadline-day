import { useEffect, useRef } from "react";
import type { Player, PositionCode } from "../../data/types";
import { playerFacts } from "../../logic/decision-messages";
import { useScrollLock } from "../use-scroll-lock";

/**
 * Confirms a signing that releases a squad member, before it happens.
 *
 * The squad-depth cut used to be silent: the player accepted an offer and
 * found a reserve missing afterwards. This now names both sides of the
 * exchange, so the player sees the signing as well as the release before
 * making the irreversible choice.
 *
 * The timer keeps running underneath. This is one step of a decision made
 * under time pressure, not a pause - the reducer keeps dispatching TICK, and
 * an offer that expires mid-dialog simply makes the confirmation a no-op.
 *
 * Reads nothing but visible fields. No sufit, no staff outlook, no analyst
 * report - not in the text, not in an aria attribute, not in a data
 * attribute.
 */
export const SquadEvictionDialog = ({
  position,
  incomingPlayer,
  evictedPlayer,
  choice,
  onConfirm,
  onCancel,
}: {
  position: PositionCode;
  incomingPlayer: Player;
  evictedPlayer: Player;
  choice: "take" | "haggle";
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  // The page underneath must hold still: the offer card is what the question
  // is about, and letting it scroll away behind the overlay loses the context.
  useScrollLock();

  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // The safe choice takes focus, so a stray Enter returns to the offer
  // rather than releasing a player. On the way out focus goes back to
  // whatever opened the dialog, so a keyboard user is not dropped at the top
  // of the page mid-decision with the clock running.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus({ preventScroll: true });
    return () => opener?.focus?.({ preventScroll: true });
  }, []);

  // Keyboard handling belongs to the open dialog, not to whichever element
  // happens to hold focus. The document listener keeps both the safe exit and
  // the focus trap active after a pointer press moves focus back to the page.
  useEffect(() => {
    const handleDocumentKeyDown = (event: KeyboardEvent): void => {
      // This dialog has no InfoPopover of its own today, but it shares the
      // bubble-phase `document` listener pattern with SquadDrawer, which
      // does - checking `defaultPrevented` here keeps both overlays
      // consistent and safe if a popover is ever added inside this one. The
      // Tab focus-trap handling below is unaffected either way.
      if (event.key === "Escape") {
        if (event.defaultPrevented) return;
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab") return;

      const cancel = cancelButtonRef.current;
      const confirm = confirmButtonRef.current;
      if (!cancel || !confirm) return;

      const active = document.activeElement;
      const focusIsOutside = active !== cancel && active !== confirm;

      if (focusIsOutside) {
        event.preventDefault();
        (event.shiftKey ? confirm : cancel).focus();
      } else if (event.shiftKey && active === cancel) {
        event.preventDefault();
        confirm.focus();
      } else if (!event.shiftKey && active === confirm) {
        event.preventDefault();
        cancel.focus();
      }
    };

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown);
  }, [onCancel]);

  return (
    <div
      className="dd-eviction-overlay"
      // Backdrop only. The dialog itself carries the semantics; this element
      // exists to dim the card and to catch a click outside the panel.
      role="presentation"
      // Clicking the backdrop cancels, but a click that started inside the
      // panel and ended on the backdrop must not.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="dd-eviction-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eviction-title"
        aria-describedby="eviction-body"
      >
        <div className="dd-eviction-kicker" aria-hidden="true">
          Liczebność kadry
        </div>
        <div className="dd-eviction-content">
          <h2 id="eviction-title" className="dd-eviction-title">
            Limit zawodników na {position} został osiągnięty
          </h2>
          <div id="eviction-body" className="dd-eviction-body">
            <p className="dd-eviction-intro">
              W celu finalizacji transferu musielibyśmy zwolnić jednego zawodnika:
            </p>
            <dl className="dd-eviction-changes">
              <div className="dd-eviction-change dd-eviction-arrival">
                <dt>Dołączy</dt>
                <dd>{playerFacts(incomingPlayer)}</dd>
              </div>
              <div className="dd-eviction-change dd-eviction-departure">
                <dt>Odejdzie</dt>
                <dd>{playerFacts(evictedPlayer)}</dd>
              </div>
            </dl>
            <p className="dd-eviction-question">Czy chcesz kontynuować?</p>
          </div>
          <div className="dd-eviction-actions">
            <button
              ref={cancelButtonRef}
              type="button"
              className="dd-eviction-cancel"
              data-dd-action="eksmisja-anuluj"
              onClick={onCancel}
            >
              Wróć do oferty
            </button>
            <button
              ref={confirmButtonRef}
              type="button"
              className="dd-eviction-confirm"
              data-dd-action="eksmisja-kontynuuj"
              onClick={onConfirm}
            >
              {choice === "haggle" ? "Rozpocznij negocjacje" : "Potwierdź transfer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
