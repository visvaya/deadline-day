import { useEffect, useState } from "react";
import type { ActionBarMode } from "./ui-preferences";

/**
 * Shared "compact viewport" query, used for two different things:
 * - `components/sticky-action-bar.tsx` reads it to pick the action bar's
 *   default mode (see `resolveActionBarMode` below) whenever the player
 *   hasn't made an explicit choice.
 * - `screens/manager-screen.tsx` reads it (via `useIsActionBarCompactViewport`)
 *   to label which choice is the default on this device and to compute the
 *   effective (explicit-or-default) selection to highlight.
 * Used to live as two independently maintained copies of
 * `(max-width: 767px)`, one per file - this is the one place both now
 * import from, so they cannot drift apart again.
 *
 * The LAYOUT stays keyed on width alone - `min-width: 768px` in
 * `styles.css` is unchanged, so a landscape phone still gets the desktop
 * panel chrome. This query also reacts to height, because a phone held
 * sideways is exactly as cramped as one held upright even though it is wide
 * enough to trip that breakpoint.
 *
 * The height threshold: common landscape phones run roughly 375-430px tall
 * (iPhone SE's 375px portrait width up to the Pro Max's ~430px), while the
 * shortest landscape tablet - iPad mini - is 768px tall, with every larger
 * iPad taller still. 600px sits in the middle of that gap with wide margin
 * on both sides, so every landscape phone matches and no landscape tablet
 * ever does.
 */
export const ACTION_BAR_COMPACT_QUERY = "(max-width: 767px), (max-height: 600px)";

/**
 * Reactive read of `ACTION_BAR_COMPACT_QUERY`, for screens (like the manager
 * setup screen) that need to conditionally render UI rather than just gate
 * an effect. `sticky-action-bar.tsx` uses it too, to recompute the viewport
 * default on rotation/resize.
 */
export const useIsActionBarCompactViewport = (): boolean => {
  const [isCompact, setIsCompact] = useState(
    () => window.matchMedia?.(ACTION_BAR_COMPACT_QUERY).matches ?? false
  );

  useEffect(() => {
    const query = window.matchMedia?.(ACTION_BAR_COMPACT_QUERY);
    if (!query) return;
    setIsCompact(query.matches);
    const onChange = (event: MediaQueryListEvent): void => setIsCompact(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return isCompact;
};

/**
 * The action bar's mode when the player has not made an explicit choice
 * (owner decision, 2026-09-18): auto-hide on a compact (narrow-or-short)
 * viewport, always-visible everywhere else. Exported separately from
 * `resolveActionBarMode` so `manager-screen.tsx` can label which choice is
 * "domyślnie" for the device it's running on, independent of whatever the
 * player has actually picked.
 */
export const viewportDefaultActionBarMode = (isCompactViewport: boolean): ActionBarMode =>
  isCompactViewport ? "autoHide" : "alwaysVisible";

/**
 * The effective action bar mode: the player's explicit choice if they made
 * one, otherwise the live viewport default above. `explicit` is `undefined`
 * for a fresh install and for a v1-preferences payload that failed to
 * migrate (see `migrateStoredUiPreferences` in ui-preferences.tsx) - both
 * read the same as "no choice yet".
 */
export const resolveActionBarMode = (
  explicit: ActionBarMode | undefined,
  isCompactViewport: boolean
): ActionBarMode => explicit ?? viewportDefaultActionBarMode(isCompactViewport);
