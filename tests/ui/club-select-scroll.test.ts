import { describe, expect, test } from "vitest";

import {
  FOCUSED_ROW_MARGIN,
  PANEL_TOP_MARGIN,
  clubSelectScrollTarget,
  type ClubSelectScrollInput,
} from "../../src/ui/club-select-scroll";

/**
 * A 360x800 phone: the action bar covers the bottom 110px, so the space a
 * focused row may occupy ends at y=690. Every case starts from this and
 * overrides only what it is about.
 */
const base: ClubSelectScrollInput = {
  scrollY: 1000,
  maxScrollY: 5000,
  barTop: 690,
  panelTop: 100,
  panelBottom: 500,
  row: { top: 560, bottom: 604 },
  modality: "keyboard",
};

const target = (overrides: Partial<ClubSelectScrollInput>): number | null =>
  clubSelectScrollTarget({ ...base, ...overrides });

describe("clubSelectScrollTarget", () => {
  test("does not scroll when the panel and the focused row are both already in place", () => {
    expect(target({})).toBeNull();
  });

  test("a focused row under the action bar is lifted to just above it", () => {
    // Row bottom at 740, bar at 690: the row needs 50px plus its margin.
    // The panel is 150px tall and starts at 400, so it stays fully visible.
    const result = target({
      panelTop: 400,
      panelBottom: 550,
      row: { top: 696, bottom: 740 },
    });
    expect(result).toBe(1000 + 740 - (690 - FOCUSED_ROW_MARGIN));
  });

  test("a focused row above the viewport comes back into view, as low as it may sit", () => {
    // Row entirely above the viewport, panel further above still and too far
    // to share the screen with it. The row wins, and of all the positions
    // that show it, the one closest to the panel parks it just above the bar -
    // which is also where an upward arrow run keeps it, press after press.
    const result = target({
      panelTop: -2000,
      panelBottom: -1600,
      row: { top: -120, bottom: -76 },
    });
    expect(result).toBe(1000 - 76 - (690 - FOCUSED_ROW_MARGIN));
  });

  test("when the panel and the row both fit, the panel is revealed from its top", () => {
    // Panel scrolled 200px above the viewport, row near the bottom: scrolling
    // up by the panel's shortfall keeps the row above the bar.
    const result = target({
      panelTop: -200,
      panelBottom: 200,
      row: { top: 400, bottom: 444 },
    });
    expect(result).toBe(1000 - 200 - PANEL_TOP_MARGIN);
  });

  test("when they cannot both fit, the row wins and the panel shows as much as it can", () => {
    // Revealing the panel top would push the row (now at 640) far under the
    // bar, so the scroll stops at the smallest value keeping the row visible.
    const result = target({
      panelTop: -300,
      panelBottom: 100,
      row: { top: 640, bottom: 684 },
    });
    expect(result).toBe(1000 + 684 - (690 - FOCUSED_ROW_MARGIN));
    // The row's bottom lands exactly on the margin above the bar...
    expect(684 - (result! - 1000)).toBe(690 - FOCUSED_ROW_MARGIN);
    // ...and that is still less scrolling than before - the panel moved
    // towards view, not away from it.
    expect(result!).toBeLessThan(1000 + 684 - 600);
  });

  test("a panel taller than the usable space is aligned to its top, not its bottom", () => {
    const result = target({
      panelTop: 300,
      panelBottom: 1400,
      row: null,
      modality: "pointer",
    });
    expect(result).toBe(1000 + 300 - PANEL_TOP_MARGIN);
  });

  test("a pointer selection reveals the panel even if the clicked row leaves the screen", () => {
    const result = target({
      panelTop: -600,
      panelBottom: -200,
      row: { top: 640, bottom: 684 },
      modality: "pointer",
    });
    expect(result).toBe(1000 - 600 - PANEL_TOP_MARGIN);
  });

  test("keyboard modality with focus outside the list follows the panel rule alone", () => {
    const result = target({ panelTop: -600, panelBottom: -200, row: null });
    expect(result).toBe(1000 - 600 - PANEL_TOP_MARGIN);
  });

  test("never scrolls past the reachable range", () => {
    expect(target({ scrollY: 10, panelTop: -400, panelBottom: 0, row: null })).toBe(0);
    expect(
      target({ maxScrollY: 1100, panelTop: 400, panelBottom: 550, row: { top: 900, bottom: 944 } })
    ).toBe(1100);
  });

  test("sub-pixel differences do not scroll", () => {
    expect(target({ panelTop: PANEL_TOP_MARGIN - 0.5, panelBottom: 400 })).toBeNull();
  });
});
