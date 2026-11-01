import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * A small "?" that explains the thing next to it.
 *
 * Generic on purpose: the staff report's confidence row is the first caller,
 * but every row of a report that states a rule rather than a number will want
 * the same affordance, and a second hand-rolled copy would drift on the parts
 * that are easy to get wrong - the tap handling and the accessible wiring.
 *
 * What it owns:
 *
 * - opening for a mouse (hover), a keyboard (focus) and a finger (one tap);
 * - closing on leave, blur, Escape, a second tap, and any pointer landing
 *   outside it;
 * - `aria-describedby`, which resolves whether or not the popover is on
 *   screen, so a screen reader hears the explanation without opening anything.
 *
 * What it does NOT own: where the panel sits. That is anchored by the caller's
 * own CSS against whatever container should bound its width - see
 * `.dd-staff-confidence` in styles.css, which makes it exactly as wide as the
 * report row rather than as wide as this 14px button.
 */
/**
 * Where the panel's left edge goes, measured inside the row it is anchored to.
 *
 * Centred on the trigger, then clamped to the row - a tooltip belongs under
 * the thing it explains, but this one sits at the end of a label that often
 * runs to the right edge of the card, and centring alone is exactly what put
 * the panel outside the card before. Clamping keeps the containment guarantee
 * while leaving the panel under the mark whenever there is room for it.
 *
 * Pure, so the arithmetic is testable without a layout engine; the component
 * only feeds it measurements.
 */
export const popoverLeft = ({
  rowWidth,
  triggerCentre,
  panelWidth,
}: {
  rowWidth: number;
  triggerCentre: number;
  panelWidth: number;
}): number => {
  const centred = triggerCentre - panelWidth / 2;
  // A panel wider than its row has nowhere to go: pin it to the left rather
  // than letting the clamp invert and push it off the other edge.
  const rightmost = Math.max(0, rowWidth - panelWidth);
  return Math.min(Math.max(centred, 0), rightmost);
};

/** The gap between the trigger and its panel, in px. Mirrors the `6px` in
 * `.dd-info-popover-panel`; kept here so the fit test measures what the
 * stylesheet actually reserves. */
export const POPOVER_GAP = 6;

/**
 * Whether the panel has to open downwards instead of up.
 *
 * The panel's resting place is above the trigger, which is right for a row in
 * the middle of a screen and wrong for the HUD: it sits under the top edge of
 * the viewport, so a long explanation opened upwards and had its first lines
 * cut off. Horizontal containment was solved from the start (`popoverLeft`);
 * this is the same guarantee on the other axis, and it was missing.
 *
 * Falls back to opening upwards when neither direction fits, because the panel
 * is bottom-anchored by default and a tie should not move it for nothing.
 *
 * Pure, so the arithmetic is testable without a layout engine.
 */
export const popoverOpensBelow = ({
  triggerTop,
  triggerBottom,
  panelHeight,
  viewportHeight,
}: {
  /** Viewport-relative top edge of the trigger. */
  triggerTop: number;
  /** Viewport-relative bottom edge of the trigger. */
  triggerBottom: number;
  panelHeight: number;
  viewportHeight: number;
}): boolean => {
  const fitsAbove = triggerTop - POPOVER_GAP >= panelHeight;
  if (fitsAbove) return false;
  const fitsBelow = viewportHeight - triggerBottom - POPOVER_GAP >= panelHeight;
  return fitsBelow;
};

export const InfoPopover = ({
  text,
  label,
  action,
  align = "clamped",
}: {
  /** The explanation. Plain text - this is a description, not a panel. */
  text: string;
  /** Accessible name of the trigger, e.g. "Co oznacza ten poziom pewności". */
  label: string;
  /** `data-dd-action`, the public contract with the DOM-parity and e2e tests. */
  action: string;
  /** Narrow hosts such as a HUD column can right-align a wider panel instead
   * of constraining it to the host's own width. */
  align?: "clamped" | "right";
}) => {
  const helpId = useId();
  const [open, setOpen] = useState(false);
  const [below, setBelow] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLSpanElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Placement runs before paint, and only while open - a closed panel is
  // invisible and inert, so there is nothing to place.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const box = panel.current;
      const mark = trigger.current;
      if (!box || !mark) return;
      const markRect = mark.getBoundingClientRect();

      // Horizontal containment belongs to the clamped variant only: the
      // right-aligned one is pinned by its own CSS to a host that is narrower
      // than the panel on purpose.
      if (align !== "right") {
        // The positioned ancestor is the row the caller made `relative`; it is
        // also what `max-width: 100%` resolves against, so it is the right
        // thing to clamp within.
        const row = box.offsetParent;
        if (row) {
          // Measure at the natural offset first: `left` from a previous run
          // would otherwise feed back into the width the browser reports.
          box.style.left = "0px";
          const rowRect = row.getBoundingClientRect();
          box.style.left = `${popoverLeft({
            rowWidth: rowRect.width,
            triggerCentre: markRect.left + markRect.width / 2 - rowRect.left,
            panelWidth: box.getBoundingClientRect().width,
          })}px`;
        }
      }

      // Vertical containment applies to BOTH variants, and used to apply to
      // neither: this effect returned early for `right`, which is the HUD -
      // the one host that actually sits against the top edge.
      setBelow(
        popoverOpensBelow({
          triggerTop: markRect.top,
          triggerBottom: markRect.bottom,
          panelHeight: box.getBoundingClientRect().height,
          viewportHeight: window.innerHeight,
        })
      );
    };

    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [align, open, text]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Marks the press as handled, the same way SquadDrawer and
        // SquadEvictionDialog do, so a persistent NotificationBanner's own
        // Escape listener - which sits on `window` precisely so it runs last
        // (see notification-banner.tsx) - can tell this layer already
        // consumed the press and leave the banner open for a second,
        // separate press.
        event.preventDefault();
        close();
      }
    };
    // Anything happening elsewhere dismisses it - including switching to
    // another player's report, which is a pointer landing outside this button.
    const onOutside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    // `document`, capture phase (the trailing `true`), not the bubble phase:
    // a popover can itself be open inside SquadDrawer, whose own Escape
    // handler also sits on `document`, in the bubble phase, and does not
    // check `defaultPrevented` (it is a focus trap; a nested overlay is not
    // its concern). Two bubble-phase listeners on the same target run in
    // registration order, which this popover cannot control - it can open
    // long after the drawer has already mounted and attached its listener.
    // Capture-phase listeners on `document` run before ANY bubble-phase
    // listener on `document`, regardless of registration order, so this is
    // the one placement that reliably lets the popover answer first. See
    // notification-banner.tsx for the next layer up (bubble phase on
    // `window`, which every `document` listener - capture or bubble - has
    // already had a turn before).
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onOutside, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onOutside, true);
    };
  }, [open, close]);

  return (
    <span className={`dd-info-popover${align === "right" ? " is-right-aligned" : ""}`} ref={root}>
      <button
        type="button"
        ref={trigger}
        className="dd-info-popover-trigger"
        // Explicitly wired rather than left to `title`: a title attribute is
        // invisible to touch and unreliable to keyboard.
        aria-describedby={helpId}
        aria-expanded={open}
        aria-label={label}
        data-dd-action={action}
        // Hover is for a mouse and nothing else. A touch tap also emits
        // pointerenter, then focus, then click - so a handler set that opened
        // on any of those and toggled on click spent the tap opening and
        // closing again, and the panel needed a second tap to stay. It toggles
        // on pointerdown instead, before focus arrives: the first tap opens
        // (focus then re-asserts the same state), and the second tap toggles
        // it shut without a focus event, because the button already has focus.
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") setOpen((current) => !current);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") close();
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
      >
        <span aria-hidden="true">?</span>
      </button>
      {/* Never removed from the DOM and never hidden from the accessibility
          tree - it fades with opacity alone, so aria-describedby keeps
          resolving and the panel has something to animate between. */}
      <span
        className={`dd-info-popover-panel${below ? " is-below" : ""}`}
        id={helpId}
        ref={panel}
        role="note"
        data-open={open}
      >
        {text}
      </span>
    </span>
  );
};
