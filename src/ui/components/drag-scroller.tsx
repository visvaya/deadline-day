import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/** How far one arrow-key press moves the strip. */
const KEY_STEP = 120;

/**
 * How far the pointer may travel between press and release and still count as
 * a click on whatever is under it.
 *
 * Above this the gesture was a drag, and the click that the browser fires
 * afterwards is swallowed. Without it, scrolling a formation line by grabbing
 * a tile would open that tile's reports - the strip is made of buttons, and
 * every drag ends on one of them. A few pixels of slack, because a press with
 * a mouse is never perfectly still.
 */
const DRAG_CLICK_THRESHOLD = 5;

/**
 * A horizontally scrolling strip that behaves the same on a phone and on a
 * desktop, used by both the squad's formation lines and the market anomaly
 * chips.
 *
 * Native overflow does the scrolling, which is what gives touch its momentum
 * and rubber-band bounce for free - reimplementing that by hand never feels
 * right. A mouse has nothing to throw, so pointer events add drag-to-scroll
 * on top, but only for `pointerType === "mouse"`: intercepting touch would
 * replace the platform's own physics with ours, which is exactly the
 * difference this component exists to remove.
 *
 * The edge fades are driven from the scroll position rather than painted on
 * unconditionally, so a strip that fits shows neither and a strip scrolled
 * to its end drops the one behind it.
 */
export const DragScroller = ({
  label,
  className,
  shellClassName,
  children,
}: {
  label: string;
  className?: string;
  shellClassName?: string;
  children: ReactNode;
}) => {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, x: 0, scrollLeft: 0, moved: false, captured: false });
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    // One pixel of slack: browsers report fractional scroll offsets, so an
    // exact comparison leaves a fade on at a hard stop.
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    // Returning the previous object when nothing moved is load-bearing, not
    // an optimisation: this runs after every render, and handing React a
    // fresh object each time would re-render forever.
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(measure);

  useEffect(() => {
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (scroller.current) observer?.observe(scroller.current);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [measure]);

  const shell = ["dd-scroller-shell"];
  if (shellClassName) shell.push(shellClassName);
  if (edges.left) shell.push("can-scroll-left");
  if (edges.right) shell.push("can-scroll-right");

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current.active) return;
    drag.current.active = false;
    event.currentTarget.classList.remove("is-dragging");
    if (drag.current.captured && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.current.captured = false;
  };

  return (
    <div className={shell.join(" ")}>
      <div
        className={className ? `dd-scroller ${className}` : "dd-scroller"}
        ref={scroller}
        role="region"
        aria-label={label}
        // Reachable by keyboard only while something is actually hidden.
        // A scrollable region that a keyboard cannot reach fails WCAG 2.1.1,
        // but a strip that fits has nothing to scroll to - and the squad
        // drawer holds four lines, so making them all stops would add four
        // dead tab stops between the player and the close button.
        tabIndex={edges.left || edges.right ? 0 : -1}
        onScroll={measure}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          // Handled rather than left to the browser so the step is the same
          // everywhere, and so this works in jsdom, which has no layout and
          // therefore no native key scrolling to inherit.
          event.preventDefault();
          const el = scroller.current;
          if (!el) return;
          el.scrollLeft += event.key === "ArrowRight" ? KEY_STEP : -KEY_STEP;
          measure();
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") return;
          const el = event.currentTarget;
          drag.current = {
            active: true,
            x: event.clientX,
            scrollLeft: el.scrollLeft,
            moved: false,
            captured: false,
          };
          el.classList.add("is-dragging");
          // Deliberately NOT capturing yet. Pointer capture redirects the
          // click to the capturing element, so capturing on every press meant
          // a tile inside the strip never received its own click at all -
          // invisible in jsdom, which has no real pointer capture, and total
          // in a browser. Capture starts in onPointerMove, once the pointer
          // has actually travelled far enough to be a drag.
          //
          // Stops the drag turning into a text selection across the tiles.
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          if (!drag.current.active) return;
          const travelled = event.clientX - drag.current.x;
          if (Math.abs(travelled) > DRAG_CLICK_THRESHOLD && !drag.current.moved) {
            drag.current.moved = true;
            // Now it is a drag: capture, so the gesture survives the pointer
            // leaving the strip.
            drag.current.captured = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          event.currentTarget.scrollLeft = drag.current.scrollLeft - travelled;
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // Capture phase, so this runs before the tile's own handler: React
        // dispatches capture listeners from the ancestor down to the target.
        // Stopping propagation here is what makes the swallow work at all.
        onClickCapture={(event) => {
          if (!drag.current.moved) return;
          drag.current.moved = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </div>
    </div>
  );
};
