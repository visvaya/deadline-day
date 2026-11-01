import type { InputModality } from "./input-modality";

/**
 * Where the club-select screen should scroll after a selection, computed in
 * one pass from a single layout read. Pure so the arithmetic can be pinned
 * by unit tests - jsdom has no layout engine, so nothing about real
 * positions can be asserted there.
 *
 * Product owner report (2026-09-17): arrowing through the club list left the
 * focused radio under the sticky action bar, and arrowing down made it drift
 * lower with every press. The old effect issued up to three scrolls per
 * selection (`scrollIntoView` for the panel, `scrollIntoView` for the radio,
 * then `scrollBy` from a rectangle read BEFORE either smooth animation had
 * moved anything) on top of the browser's own scroll-to-focus. The
 * animations cancelled one another and the stale rectangle accumulated
 * error. This function replaces all of them with one absolute target.
 *
 * Every rectangle is in viewport coordinates and describes the FINAL layout
 * (after the detail panel has finished growing), so the caller can issue
 * one scroll that is already right when the expansion ends.
 */
export type ClubSelectScrollInput = {
  /** Current `window.scrollY`. */
  readonly scrollY: number;
  /** Largest reachable `scrollY` once the panel has reached its final height. */
  readonly maxScrollY: number;
  /** Top edge of the sticky action bar, capped at the viewport height. */
  readonly barTop: number;
  /** Visible top and bottom of the bordered detail panel. */
  readonly panelTop: number;
  readonly panelBottom: number;
  /** The row holding the focused radio, or `null` when focus is not in the list. */
  readonly row: { readonly top: number; readonly bottom: number } | null;
  readonly modality: InputModality;
};

/** Breathing room above the panel when it is scrolled to - the same 16px as
 * the panel's own top margin, so it reads as the screen's vertical rhythm. */
export const PANEL_TOP_MARGIN = 16;

/** Clearance kept around the focused row: its focus outline reaches 5px past
 * the row (3px outline, 2px offset), so this leaves a visible gap beyond it. */
export const FOCUSED_ROW_MARGIN = 10;

// Below one pixel, a scroll is sub-pixel rounding, not a movement.
const MIN_SCROLL_DELTA = 1;

// Deliberately NOT Math.min(Math.max(...)) in the other order: when an
// interval is empty (lo > hi - something taller than the space it has to
// fit in) this returns `hi`, which is the value that shows the thing's TOP.
const clamp = (value: number, lo: number, hi: number): number => Math.min(Math.max(value, lo), hi);

/**
 * Returns the `scrollY` to scroll to, or `null` when the current position
 * already satisfies every rule.
 *
 * Rules, strongest first:
 *  1. (keyboard only, WCAG 2.2 2.4.11) the focused row ends fully visible
 *     between the top of the viewport and the top of the action bar;
 *  2. as much of the detail panel as possible is visible, its top first;
 *  3. move as little as possible - a position that already satisfies both
 *     does not scroll at all.
 *
 * A pointer selection ignores the row: no focus indicator is drawn for a
 * mouse or touch press, and the reason the player tapped a row is to read
 * the panel it opens (product owner's decision, correction 2, 2026-09-15).
 *
 * Both rules are intervals of acceptable `scrollY`, so "the row wins" falls
 * out of clamping into the panel's interval first and the row's second:
 * when they overlap, that is the nearest point satisfying both; when they do
 * not, it is the point of the row's interval closest to the panel.
 */
export const clubSelectScrollTarget = (input: ClubSelectScrollInput): number | null => {
  const { scrollY, maxScrollY, barTop, panelTop, panelBottom, row, modality } = input;
  const toDocument = (viewportY: number): number => viewportY + scrollY;

  const panelHi = toDocument(panelTop) - PANEL_TOP_MARGIN;
  const panelLo = toDocument(panelBottom) - (barTop - FOCUSED_ROW_MARGIN);
  const panelTarget = clamp(scrollY, panelLo, panelHi);

  const rowTarget =
    modality === "keyboard" && row
      ? clamp(
          panelTarget,
          toDocument(row.bottom) - (barTop - FOCUSED_ROW_MARGIN),
          toDocument(row.top) - FOCUSED_ROW_MARGIN
        )
      : panelTarget;

  const target = clamp(rowTarget, 0, Math.max(0, maxScrollY));
  return Math.abs(target - scrollY) < MIN_SCROLL_DELTA ? null : target;
};
