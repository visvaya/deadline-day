/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from "vitest";

import { seasonChangePeriod } from "../../src/ui/components/player-tile-utils";
import { ruleBody, styles } from "./css-rules";

/**
 * Where the rating's gaps are declared, not how wide they render - the widths
 * are measured in a real browser by tests/e2e/smoke.spec.ts ("spaces a rating
 * the same way wherever it is rendered"), which jsdom cannot do because it has
 * no layout.
 *
 * This file exists for the regression that measurement missed: the delta's gap
 * was once declared as `.dd-player-rating > .dd-season-change`, scoped to the
 * squad tile's own grid. The tile looked right, and the offer card - which
 * renders the same delta in a paragraph rather than in that grid - rendered it
 * with no gap at all, hard against the ovr. A rule that every renderer of a
 * delta must obey belongs on the delta.
 */

/** Every place that renders a delta, and the declaration that gives it a gap.
 * A renderer missing from a rule here is a delta hard against its ovr. */
const DELTA_RENDERERS: ReadonlyArray<{ selector: string; declaration: string }> = [
  // The squad tile sets its two sides separately - see the age-gap test below -
  // so the delta's side is a margin on the delta's own grid cell.
  {
    selector: ".dd-player-rating > .dd-season-change",
    declaration: "margin-left: var(--rating-outer-gap)",
  },
  // The position report has no age beside its ovr, so one container gap does.
  { selector: ".dd-player-row-ovr", declaration: "gap: var(--rating-outer-gap)" },
  // Running text has no container to hang a gap on, so this one is a margin on
  // the delta itself - the same token, carried differently.
  {
    selector: ".dd-offer-meta .dd-season-change",
    declaration: "margin-left: var(--rating-outer-gap)",
  },
];

describe("rating spacing", () => {
  test("every renderer of a delta declares a gap for it", () => {
    const css = styles();

    for (const { selector, declaration } of DELTA_RENDERERS) {
      expect(ruleBody(css, selector), selector).toContain(declaration);
    }
  });

  test("no gap rides on the bare delta class, where it would double up", () => {
    // The regression this file was written for was the mirror of this: the gap
    // lived only on the tile's grid, so the offer card - which renders the same
    // delta in a paragraph - got none at all. The fix is one declaration per
    // renderer, listed above; a margin on the bare class would then land on top
    // of each of them.
    expect(ruleBody(styles(), ".dd-season-change")).not.toContain("margin");
  });

  test("the age sits fractionally closer to the ovr than the delta does", () => {
    const css = styles();

    // Equal boxes do not give equal gaps: the glyphs' side bearings differ on
    // the two sides, so with both at 2px the age measured 0.67px further from
    // the number than the delta. Calibrated off 6x screenshots; the figures are
    // in the stylesheet beside the token.
    expect(ruleBody(css, ".dd-player-rating-lead")).toContain(
      "margin-right: var(--rating-age-gap)"
    );
    // Set per side, so the container must not add one of its own on top.
    expect(ruleBody(css, ".dd-player-rating")).toContain("column-gap: 0");

    const root = css.slice(css.indexOf(":root {"));
    const block = root.slice(0, root.indexOf("}"));
    const value = (token: string): number => {
      const at = block.indexOf(`${token}:`);
      return Number.parseFloat(block.slice(at + token.length + 1, block.indexOf(";", at)));
    };
    expect(value("--rating-age-gap")).toBeLessThan(value("--rating-outer-gap"));
  });

  test("both gaps are absolute, so every rating spaces its numbers alike", () => {
    const css = styles();
    const root = css.slice(css.indexOf(":root {"));
    const block = root.slice(0, root.indexOf("}"));

    // px, not em. These were em for a while, resolving against the ovr, which
    // gave a starter twice a substitute's gaps. The two sit one above the other
    // in the same tile, so the mismatch is what the eye catches - not either
    // one being off for its own size. Product owner's call, 2026-08-22.
    for (const token of ["--rating-inner-gap", "--rating-outer-gap", "--rating-age-gap"]) {
      const at = block.indexOf(`${token}:`);
      expect(at, `${token} is not declared on :root`).toBeGreaterThan(-1);
      const value = block.slice(at + token.length + 1, block.indexOf(";", at)).trim();
      expect(value, `${token} must be absolute, so it does not vary by size`).toMatch(
        /^[0-9.]+px$/
      );
    }
  });

  test("the glyph-to-age gap is a container gap too, and the tighter of the two", () => {
    const css = styles();

    // The glyph and the age are one statement, so they sit closer to each
    // other than the age sits to the number it qualifies. When the inner gap
    // was sized against the glyph rather than declared here, a substitute
    // rendered it wider than the age-to-ovr gap and inverted that.
    expect(ruleBody(css, ".dd-player-rating-lead")).toContain("gap: var(--rating-inner-gap)");
    expect(ruleBody(css, ".dd-player-row-age")).toContain("gap: var(--rating-inner-gap)");

    const root = css.slice(css.indexOf(":root {"));
    const block = root.slice(0, root.indexOf("}"));
    const value = (token: string): number => {
      const at = block.indexOf(`${token}:`);
      return Number.parseFloat(block.slice(at + token.length + 1, block.indexOf(";", at)));
    };
    expect(value("--rating-inner-gap")).toBeLessThan(value("--rating-outer-gap"));
  });

  test("the ovr's tracks cannot be stretched by what sits beside it", () => {
    // A bare 1fr is minmax(auto, 1fr) and grows to fit its content, so the
    // wider satellite stretched its own track and pushed the number off the
    // tile's centre line. Only visible on the narrower tiles of the offer
    // card, which is why the browser check measures those too.
    expect(ruleBody(styles(), ".dd-player-rating")).toContain(
      "grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)"
    );
  });

  test("the offer's own player is marked on both edges, not one", () => {
    const css = styles();

    // Everything else in a rating is centred, so a single-sided bar would be
    // the one thing in the tile that is not.
    expect(ruleBody(css, ".dd-player-rating.is-offer::before")).toContain("left: -5px");
    expect(ruleBody(css, ".dd-player-rating.is-offer::after")).toContain("right: -5px");

    // Out of flow, so the bars take no width from the row: the numbers keep
    // their positions and the ovr its centre line, with no compensating
    // margins to get wrong. And a border cannot have rounded ends - with only
    // side borders, border-radius tapers them to a point.
    const bars = ruleBody(css, ".dd-player-rating.is-offer::before");
    expect(bars).toContain("position: absolute");
    // Rounded on the inner side only - the side facing the numbers - and
    // straight where it meets the tile edge, so it reads as a rule along that
    // edge rather than a lozenge floating beside the numbers.
    // A circular radius cannot exceed the bar's own width, so at 2px the arc
    // spanned two pixels and read as a straight line at 100%.
    //
    // The vertical radius stays under half the shortest row - 16.5px for a
    // substitute - so the arcs never overflow and get scaled to fit. When they
    // did, the bar was made entirely of curve and reached full width at one
    // point, with no flat section to state its weight.
    expect(bars).toContain("width: 4px");
    expect(bars).toContain("border-radius: 0 4px 4px 0 / 0 6px 6px 0");
    expect(ruleBody(css, ".dd-player-rating.is-offer::after")).toContain(
      "border-radius: 4px 0 0 4px / 6px 0 0 6px"
    );
    expect(ruleBody(css, ".dd-player-rating.is-offer")).not.toContain("border-left");
  });

  test("the squad status starts where the name above it starts", () => {
    // It shares column 1 with the name, and that column is as wide as the name
    // is - so an end alignment indented the word by however much shorter it
    // happened to be, visibly further under a long surname than a short one.
    expect(ruleBody(styles(), ".dd-player-row-role")).toContain("justify-self: start");
  });

  test("the neutral marker is visible without becoming a second delta", () => {
    const body = ruleBody(styles(), ".dd-season-change-marker");

    expect(body).toContain("font-size: inherit");
    expect(body).toContain("font-weight: inherit");
    expect(body).toContain("color: inherit");
    expect(body).toContain("width: 0.64em");
  });
});

describe("when a delta is coloured", () => {
  test("only the squad overview, only in the summer window", () => {
    // Colour is an interruption, and once a season is enough: development runs
    // at the end of a season, so the summer window is the delta's first sight
    // and the squad overview is the first screen shown in it. Product owner's
    // call, 2026-08-22.
    expect(seasonChangePeriod({ sezon: 2, tura: "lato" }, "squadOverview")).toBe("fresh");
    expect(seasonChangePeriod({ sezon: 5, tura: "lato" }, "squadOverview")).toBe("fresh");
  });

  test("never on an offer screen, not even in the window that colours", () => {
    // The overview has already shown this season's deltas in colour, and an
    // offer screen is where one player is being decided about - a row of green
    // and red beside him competes for attention while a clock runs.
    expect(seasonChangePeriod({ sezon: 2, tura: "lato" }, "offer")).toBe("past");
    expect(seasonChangePeriod({ sezon: 2, tura: "zima" }, "offer")).toBe("past");
  });

  test("never in the winter window, where the player has read it already", () => {
    expect(seasonChangePeriod({ sezon: 2, tura: "zima" }, "squadOverview")).toBe("past");
  });

  test("season 1 has nothing to report anywhere", () => {
    // No season has been played, so there is no delta to have a reading of.
    for (const surface of ["squadOverview", "offer"] as const) {
      for (const tura of ["lato", "zima"] as const) {
        expect(seasonChangePeriod({ sezon: 1, tura }, surface)).toBe("unknown");
      }
    }
  });
});
