import { useCallback, useEffect, useRef, useState } from "react";

export type NotificationKind = "purchase" | "sale" | "extension" | "free-agent" | "neutral";

const AUTO_DISMISS_MS = 1500;
const SWIPE_DISMISS_THRESHOLD = 64;

export const NotificationBanner = ({
  text,
  kind,
  onDismiss,
  autoDismiss = true,
  focusCloseSignal = 0,
}: {
  text: string;
  kind: NotificationKind;
  onDismiss: () => void;
  /**
   * False pauses the auto-dismiss timer entirely (WCAG 2.2.1) - set by
   * app.tsx exactly when this banner's own arrival coincided with a
   * keyboard-modality screen transition, so the countdown cannot run out
   * from under a keyboard/screen-reader user who has just been handed
   * focus here instead of the new screen's heading (see focusCloseSignal
   * below). The banner then closes only through an explicit action: the
   * close button, Escape, or a swipe - never on its own clock.
   */
  autoDismiss?: boolean;
  /**
   * Bumped by app.tsx (never by this component) whenever the close button
   * should take focus - the same coinciding-transition case that sets
   * `autoDismiss` to false. A plain boolean would not do: this component
   * never remounts across several transitions that happen while the same
   * banner is still open (see the shared `key` in app.tsx), and an effect
   * only re-fires when a dependency's *value* actually changes - so asking
   * for focus a second time needs a second, distinct number, not a repeat
   * of the same `true`.
   */
  focusCloseSignal?: number;
}) => {
  const [leaving, setLeaving] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragging = useRef({ active: false, startY: 0, offset: 0 });
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((): void => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onDismiss();
      return;
    }
    setLeaving(true);
  }, [onDismiss]);

  useEffect(() => {
    if (!autoDismiss) return undefined;
    const id = window.setTimeout(close, AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [text, close, autoDismiss]);

  // A11y fix (2026-09-17, WCAG 2.4.11): focuses the close button instead of
  // leaving focus wherever the triggering action left it. Runs on every
  // increment of focusCloseSignal, including the first (mount) - see the
  // prop doc above for why a changing number, not a boolean, drives this.
  useEffect(() => {
    if (focusCloseSignal > 0) closeButtonRef.current?.focus({ preventScroll: true });
  }, [focusCloseSignal]);

  // "Escape anywhere" (product decision, 2026-09-17), scoped to exactly the
  // window this banner is paused: a normally auto-dismissing banner has no
  // need for a key listener, and installing one unconditionally would risk
  // stacking with the other Escape handlers already in this app (InfoPopover,
  // SquadDrawer, SquadEvictionDialog, RestartDialog).
  //
  // Registered on `window`, not `document`, and only after checking
  // `defaultPrevented` (a11y fix, 2026-09-24, extended 2026-09-24 for
  // popover-inside-drawer nesting - see info-popover.tsx, squad-drawer.tsx,
  // squad-eviction-dialog.tsx): the full ordering, outside-in, is InfoPopover
  // (capture phase on `document`) -> SquadDrawer/SquadEvictionDialog (bubble
  // phase on `document`) -> RestartDialog (stops native propagation before
  // it reaches `document` at all) -> this banner (bubble phase on `window`,
  // which `document` - capture or bubble - always reaches last). Each layer
  // that handles Escape marks it with `event.preventDefault()` and every
  // layer further out checks that mark before closing, so one press closes
  // only the topmost open layer; this banner is the outermost, catching only
  // a press nothing else claimed.
  useEffect(() => {
    if (autoDismiss) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !event.defaultPrevented) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [autoDismiss, close]);

  return (
    <div
      className={`dd-notification is-${kind}${leaving ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
      style={dragY ? { transform: `translate(-50%, ${dragY}px)` } : undefined}
      onAnimationEnd={() => {
        if (leaving) onDismiss();
      }}
      onPointerDown={(event) => {
        dragging.current = { active: true, startY: event.clientY, offset: 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!dragging.current.active) return;
        const offset = Math.min(0, event.clientY - dragging.current.startY);
        dragging.current.offset = offset;
        setDragY(offset);
      }}
      onPointerUp={(event) => {
        if (!dragging.current.active) return;
        dragging.current.active = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (Math.abs(dragging.current.offset) > SWIPE_DISMISS_THRESHOLD) {
          onDismiss();
        } else {
          setDragY(0);
        }
      }}
      onPointerCancel={() => {
        dragging.current.active = false;
        setDragY(0);
      }}
    >
      <span className="dd-notification-mark" aria-hidden="true">
        ✓
      </span>
      <div className="dd-notification-body">
        <p>{text}</p>
        <button
          ref={closeButtonRef}
          type="button"
          className="dd-notification-close"
          aria-label="Zamknij powiadomienie"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={close}
        >
          ✕
        </button>
      </div>
    </div>
  );
};
