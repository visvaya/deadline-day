import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ACTION_BAR_COMPACT_QUERY, resolveActionBarMode } from "../action-bar-query";
import { useUiPreferences, type ActionBarMode } from "../ui-preferences";
import { at } from "../../logic/invariant";

// `.dd-action-bar` is position: fixed and overlays content, so every screen
// needs its content padded by the bar's real height to avoid the bar
// covering the last few items. Measured instead of guessed so it stays
// correct regardless of how many buttons a given screen's bar has. The
// reservation stays put even while the bar is auto-hidden, and is left in
// the page colour on purpose - see `.dd-root > main` in styles.css.
const useReportBarHeight = (): ((_node: HTMLDivElement | null) => void) => {
  const observer = useRef<ResizeObserver | null>(null);
  return useCallback((node: HTMLDivElement | null): void => {
    observer.current?.disconnect();
    if (!node || typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver((entries) => {
      const entry = at(entries, 0, "resize observer entry");
      document.documentElement.style.setProperty(
        "--dd-action-bar-height",
        `${entry.contentRect.height}px`
      );
    });
    observer.current.observe(node);
  }, []);
};

// Owner decision (2026-09-18): auto-hide is no longer mobile-only - it runs
// on whatever viewport the effective mode (explicit choice, or the live
// viewport default from `resolveActionBarMode`) resolves to "autoHide" on,
// desktop included. `explicitMode` is the player's stored choice, if any;
// this hook resolves it against the live viewport itself (one matchMedia
// subscription, folded into the same effect that owns the scroll listener -
// as before this feature existed, rather than a second hook/effect up in
// `StickyActionBar` recomputing it every render) so a rotation or resize
// while nothing is stored still picks up the new default.
// `prefers-reduced-motion` is the only other thing that can force the bar
// visible.
const useScrollAwareBar = (label: string, explicitMode: ActionBarMode | undefined): boolean => {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);

    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const viewportQuery = window.matchMedia?.(ACTION_BAR_COMPACT_QUERY);
    let reducedMotion = motionQuery?.matches ?? false;
    let mode = resolveActionBarMode(explicitMode, viewportQuery?.matches ?? false);
    let lastScroll = window.scrollY;
    let frame = 0;

    const cancelPendingFrame = (): void => {
      if (!frame) return;
      window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const onMotionChange = (event: MediaQueryListEvent): void => {
      reducedMotion = event.matches;
      if (reducedMotion) {
        cancelPendingFrame();
        setHidden(false);
      }
    };
    const onViewportChange = (event: MediaQueryListEvent): void => {
      mode = resolveActionBarMode(explicitMode, event.matches);
      lastScroll = window.scrollY;
      cancelPendingFrame();
      setHidden(false);
    };
    const onScroll = (): void => {
      if (mode === "alwaysVisible" || reducedMotion || frame) return;
      frame = window.requestAnimationFrame(() => {
        const currentScroll = window.scrollY;
        const atBottom =
          currentScroll + window.innerHeight >= document.documentElement.scrollHeight - 2;
        const delta = currentScroll - lastScroll;
        if (atBottom) {
          setHidden(false);
          lastScroll = currentScroll;
        } else if (Math.abs(delta) > 6) {
          setHidden(delta > 0 && currentScroll > 40);
          lastScroll = currentScroll;
        }
        frame = 0;
      });
    };

    motionQuery?.addEventListener("change", onMotionChange);
    viewportQuery?.addEventListener("change", onViewportChange);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelPendingFrame();
      motionQuery?.removeEventListener("change", onMotionChange);
      viewportQuery?.removeEventListener("change", onViewportChange);
      window.removeEventListener("scroll", onScroll);
    };
  }, [label, explicitMode]);

  return hidden;
};

// How far the bar has to move for its bottom edge to sit on the bottom edge
// of what the user can actually see. `position: fixed` anchors to the layout
// viewport, which mobile browsers keep out of step with the visible area
// whenever the visible area is *shorter* than the layout viewport - the
// browser's toolbar, or the on-screen keyboard, covering its bottom: lift
// the bar clear of it.
//
// Bug fix (2026-09-18): the visible area can also reach *below* the layout
// viewport - what happens when a browser collapses its toolbar without
// laying the page out again, most reliably during a fast fling-scroll on
// iOS Safari. This used to be handled by a signed offset that pushed the
// bar *down* past its own fixed position, onto the real bottom edge, where
// a mistimed reading left it stranded under the browser's toolbar.
// Clamping at zero means the bar can only ever move up from its native
// fixed position, never down; its full-viewport-tall skirt (see
// `.dd-action-bar::after`) covers anything below it in panel colour.
//
// Pinch zoom also shrinks the visible area, but scrolls it inside the
// layout viewport rather than past it, so it never needs a downward push
// either.
export const viewportCorrectionOffset = (
  layoutHeight: number,
  visibleHeight: number,
  visibleTop: number
): number => Math.max(0, layoutHeight - visibleHeight - visibleTop);

// visualViewport is the purpose-built API for reading the above: it fires in
// step with the browser's own toolbar animation, unlike window "resize".
const useVisualViewportCorrection = (): void => {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = (): void => {
      const offset = viewportCorrectionOffset(
        window.innerHeight,
        viewport.height,
        viewport.offsetTop
      );
      document.documentElement.style.setProperty("--dd-vv-offset", `${offset}px`);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
};

export const StickyActionBar = ({ label, children }: { label: string; children?: ReactNode }) => {
  const { actionBarMode } = useUiPreferences();
  const hidden = useScrollAwareBar(label, actionBarMode);
  useVisualViewportCorrection();
  const reportBarHeight = useReportBarHeight();

  // The space reserved below content for the fixed bar (see above) has to
  // visually merge with the bar when it's showing, and disappear along with
  // it once it fades away - animated in lockstep with the bar's own opacity
  // transition (same property, same duration) so neither ever shows a bare
  // patch of solid colour or a hole while the other is still transitioning.
  //
  // Bug fix (2026-09-18): "in lockstep" also means *starting* together, not
  // just sharing a duration. `.dd-action-bar`'s own is-hidden class is a
  // render-time className - it lands in the same commit React paints. This
  // property write used to happen in a plain useEffect, which React defers
  // until *after* that paint. On a fast fling the scroll handler flips
  // `hidden` twice in quick succession (hide while scrolling down, reveal on
  // reaching the bottom - see useScrollAwareBar above), and each flip's
  // property write could land a frame or more after its class change already
  // started animating. For that window the bar and its skirt were
  // mid-transition out of step with each other. useLayoutEffect commits this
  // write synchronously in the same phase as the className, before the
  // browser paints either, so both transitions always start on the same
  // frame.
  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      "--dd-action-bar-backdrop-opacity",
      hidden ? "0" : "1"
    );
  }, [hidden]);

  return (
    <div
      className={`dd-action-bar${hidden ? " is-hidden" : ""}`}
      role="region"
      aria-label={label}
      ref={reportBarHeight}
    >
      <div className="dd-action-bar-inner">{children}</div>
    </div>
  );
};
