/**
 * @vitest-environment jsdom
 */
/**
 * The confidence explanation: it has to open for a mouse, a keyboard and a
 * finger, say the right thing, and never widen the page.
 */
import { afterEach, describe, expect, test } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { StaffAssessment } from "../../src/data/types";
import { POPOVER_GAP, popoverLeft, popoverOpensBelow } from "../../src/ui/components/info-popover";
import {
  StaffConfidenceHelp,
  staffConfidenceHelpText,
} from "../../src/ui/components/staff-confidence-help";

const mounted: { container: HTMLElement; root: Root }[] = [];

afterEach(() => {
  for (const { container, root } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted.length = 0;
});

const assessment = (overrides: Partial<StaffAssessment> = {}): StaffAssessment => ({
  source: "coach",
  focus: "potential",
  outlook: "leagueLevel",
  confidence: "medium",
  isFirstObservation: false,
  ...overrides,
});

const render = (props: { assessment: StaffAssessment; currentOvr: number }): HTMLElement => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ container, root });
  act(() => root.render(<StaffConfidenceHelp {...props} />));
  return container;
};

const parts = (container: HTMLElement) => ({
  trigger: container.querySelector("button")!,
  help: container.querySelector(".dd-info-popover-panel") as HTMLElement,
});

/**
 * React delegates pointer handlers off bubbling events, and jsdom does not
 * always ship PointerEvent - so these are MouseEvents carrying the one field
 * the component reads. onPointerEnter/Leave arrive as pointerover/pointerout,
 * exactly as onMouseEnter/Leave arrive as mouseover/mouseout.
 */
const pointer = (type: string, pointerType: string): Event => {
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  return event;
};

describe("StaffConfidenceHelp", () => {
  test("the trigger and its description are wired together", () => {
    const { trigger, help } = parts(render({ assessment: assessment(), currentOvr: 64 }));

    // aria-describedby resolves whether or not the popover is on screen, so a
    // screen reader hears the explanation without having to open anything.
    expect(trigger.getAttribute("aria-describedby")).toBe(help.id);
    expect(help.id).not.toBe("");
    expect(help.textContent).toBe(
      "Ten raport może się jeszcze zmienić. Zawsze dogoni jednak to, co zawodnik pokaże na boisku."
    );
  });

  test("a mouse opens it by hovering and closes it by leaving", () => {
    const { trigger, help } = parts(render({ assessment: assessment(), currentOvr: 64 }));
    expect(help.dataset.open).toBe("false");

    act(() => {
      trigger.dispatchEvent(pointer("pointerover", "mouse"));
    });
    expect(help.dataset.open).toBe("true");

    act(() => {
      trigger.dispatchEvent(pointer("pointerout", "mouse"));
    });
    expect(help.dataset.open).toBe("false");
  });

  test("a mouse click does not close what the hover opened", () => {
    // The bug this pins: pointerdown used to toggle for every pointer type, so
    // clicking a popover that hover had already opened shut it again.
    const { trigger, help } = parts(render({ assessment: assessment(), currentOvr: 64 }));

    act(() => {
      trigger.dispatchEvent(pointer("pointerover", "mouse"));
      trigger.dispatchEvent(pointer("pointerdown", "mouse"));
      trigger.click();
    });

    expect(help.dataset.open).toBe("true");
  });

  test("one tap opens it, the next closes it", () => {
    // A tap emits pointerdown, then focus, then click. Opening on any of those
    // and toggling on click spent the whole tap opening and closing again, and
    // the popover needed a second tap to stay - which is what a phone showed.
    const { trigger, help } = parts(render({ assessment: assessment(), currentOvr: 64 }));

    act(() => {
      trigger.dispatchEvent(pointer("pointerdown", "touch"));
      trigger.focus();
      trigger.click();
    });
    expect(help.dataset.open).toBe("true");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    // Second tap: the button already holds focus, so no focus event re-opens it.
    act(() => {
      trigger.dispatchEvent(pointer("pointerdown", "touch"));
      trigger.click();
    });
    expect(help.dataset.open).toBe("false");
  });

  test("keyboard focus opens it and blur closes it", () => {
    const { trigger, help } = parts(render({ assessment: assessment(), currentOvr: 64 }));

    act(() => trigger.focus());
    expect(help.dataset.open).toBe("true");

    act(() => trigger.blur());
    expect(help.dataset.open).toBe("false");
  });

  test("Escape closes it", () => {
    const { trigger, help } = parts(render({ assessment: assessment(), currentOvr: 64 }));
    act(() => trigger.focus());
    expect(help.dataset.open).toBe("true");

    // `document`, not `window`: InfoPopover listens on `document` (a11y fix,
    // 2026-09-24) so its own Escape handling runs before a persistent
    // NotificationBanner's `window` listener, regardless of mount order -
    // see notification-banner.tsx.
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(help.dataset.open).toBe("false");
  });

  test("a pointer landing anywhere else dismisses it", () => {
    // Switching to another player's report is exactly this: a pointer down
    // outside the button. Without it the popover would still be open on the
    // way back to the row it belongs to.
    const { trigger, help } = parts(render({ assessment: assessment(), currentOvr: 64 }));
    act(() => {
      trigger.dispatchEvent(pointer("pointerdown", "touch"));
    });
    expect(help.dataset.open).toBe("true");

    act(() => {
      document.body.dispatchEvent(pointer("pointerdown", "touch"));
    });

    expect(help.dataset.open).toBe("false");
  });

  test("the popover carries the class its width and clamping are written against", () => {
    // styles.css does not load in jsdom, so what is pinned here is that the
    // element keeps the hook the CSS uses and never sets an inline width that
    // would defeat `width: max-content; max-width: 100%`. The placement
    // arithmetic itself is tested against popoverLeft below.
    const container = render({ assessment: assessment(), currentOvr: 64 });
    const { help } = parts(container);

    expect(help.className).toContain("dd-info-popover-panel");
    expect(help.style.width).toBe("");
  });
});

describe("staffConfidenceHelpText", () => {
  test("a first potential observation says why certainty is not on offer yet", () => {
    expect(
      staffConfidenceHelpText(assessment({ confidence: "low", isFirstObservation: true }), 60)
    ).toBe(
      "Sztab dopiero zbiera obserwacje o zawodniku, dlatego nie wystawia jeszcze raportu " +
        "z wysoką pewnością."
    );
  });

  test("the first-observation message never appears for a current report", () => {
    // A current read is exact whatever the tenure, so "still gathering
    // observations" would simply be untrue.
    const text = staffConfidenceHelpText(
      assessment({ focus: "current", confidence: "high", isFirstObservation: true }),
      67
    );

    expect(text).toBe("Raport opisuje widoczny obecny poziom zawodnika.");
  });

  test("the first-observation message never appears for a guaranteed high", () => {
    const text = staffConfidenceHelpText(
      assessment({ confidence: "high", outlook: "aboveLeague", isFirstObservation: true }),
      60
    );

    expect(text).toBe("Sztab traktuje ten raport jako stabilny.");
  });

  test("low and medium say the verdict may still move, without promising a step count", () => {
    // No number of levels: the remembered cap is bypassed by the guaranteed
    // high, by the visible-OVR floor and by the switch to a current report at
    // peakStart, so "at most one level" was a promise the engine did not keep.
    const low = staffConfidenceHelpText(assessment({ confidence: "low" }), 64);
    const medium = staffConfidenceHelpText(assessment({ confidence: "medium" }), 64);

    expect(low).toBe("Ten raport może się jeszcze wyraźnie zmienić.");
    expect(medium).toBe(
      "Ten raport może się jeszcze zmienić. Zawsze dogoni jednak to, co zawodnik pokaże na boisku."
    );
    expect(`${low} ${medium}`).not.toMatch(/najwyżej|poziom/);
  });

  test("a current report on a band boundary explains the jump in both directions", () => {
    const up = staffConfidenceHelpText(
      assessment({ focus: "current", confidence: "high", outlook: "limited" }),
      62
    );
    expect(up).toContain("Premia sezonowa może wynieść +1 OVR");

    const down = staffConfidenceHelpText(
      assessment({ focus: "current", confidence: "high", outlook: "leagueLevel" }),
      63
    );
    expect(down).toContain("Spadek OVR może wynikać z wieku");
  });

  test("a potential report explains only the floor rising", () => {
    const text = staffConfidenceHelpText(
      assessment({ confidence: "high", outlook: "limited" }),
      62
    );

    expect(text).toContain("pewna prognoza nie może wskazywać niżej niż widoczny obecny poziom");
  });

  test("no explanation names a threshold, a range or an exact target OVR", () => {
    const shown = [
      staffConfidenceHelpText(assessment({ confidence: "low", isFirstObservation: true }), 60),
      staffConfidenceHelpText(assessment({ confidence: "medium" }), 64),
      staffConfidenceHelpText(assessment({ confidence: "high", outlook: "limited" }), 62),
      staffConfidenceHelpText(
        assessment({ focus: "current", confidence: "high", outlook: "limited" }),
        62
      ),
    ];

    for (const text of shown) {
      expect(text).not.toMatch(/sufit|potencja[łl]/i);
      // "Ocena" reads as OVR - the game calls that "ocena ogólna" - so the
      // tooltip says "raport", the words already printed above it.
      expect(text).not.toMatch(/ocen[ay]|ocenę/i);
      // The only numbers any of these may carry are the one-point step itself.
      for (const number of text.match(/\d+/g) ?? []) expect(number).toBe("1");
    }
  });
});

/**
 * Where the panel lands: centred on the "?", clamped to the row.
 *
 * Pure arithmetic, so it is tested directly rather than through a layout
 * engine jsdom does not have - every rect there is zero, which would make any
 * assertion about real placement vacuous.
 */
describe("popoverLeft", () => {
  test("centres on the trigger when there is room on both sides", () => {
    expect(popoverLeft({ rowWidth: 300, triggerCentre: 150, panelWidth: 100 })).toBe(100);
  });

  test("clamps to the left edge rather than hanging off it", () => {
    // A mark near the start of the row: centring would put the panel at -30.
    expect(popoverLeft({ rowWidth: 300, triggerCentre: 20, panelWidth: 100 })).toBe(0);
  });

  test("clamps to the right edge rather than spilling out of the card", () => {
    // This is the case that broke it before: the mark sits at the end of a
    // label running to the right edge, so centring pushed the panel outside.
    expect(popoverLeft({ rowWidth: 300, triggerCentre: 295, panelWidth: 100 })).toBe(200);
  });

  test("a panel exactly as wide as the row has only one place to be", () => {
    expect(popoverLeft({ rowWidth: 300, triggerCentre: 295, panelWidth: 300 })).toBe(0);
  });

  test("a panel wider than its row pins left instead of inverting", () => {
    // max-width caps this in practice; the guard is here so a rounding error
    // can never make the clamp push the panel off the opposite edge.
    expect(popoverLeft({ rowWidth: 300, triggerCentre: 150, panelWidth: 320 })).toBe(0);
  });

  test.each([
    [10, 60],
    [150, 200],
    [290, 340],
  ])("never leaves the row for a trigger at %i", (triggerCentre, panelWidth) => {
    const left = popoverLeft({ rowWidth: 320, triggerCentre, panelWidth });

    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + Math.min(panelWidth, 320)).toBeLessThanOrEqual(320);
  });
});

/**
 * The other axis. The panel rests above its trigger, which is right until the
 * trigger sits against the top of the viewport - the HUD - and the explanation
 * is long enough to run off the screen. That is the case these pin.
 */
describe("popoverOpensBelow", () => {
  const viewportHeight = 800;

  test("stays above when the trigger has room over it", () => {
    expect(
      popoverOpensBelow({ triggerTop: 400, triggerBottom: 414, panelHeight: 60, viewportHeight })
    ).toBe(false);
  });

  test("flips below for a trigger under the top edge", () => {
    // The HUD case from the screenshot: 48px down the page, a four-line note.
    expect(
      popoverOpensBelow({ triggerTop: 48, triggerBottom: 62, panelHeight: 96, viewportHeight })
    ).toBe(true);
  });

  test("the gap counts as room that has to be there", () => {
    // Exactly enough for the panel but not for the gap: still has to flip.
    expect(
      popoverOpensBelow({
        triggerTop: 60,
        triggerBottom: 74,
        panelHeight: 60,
        viewportHeight,
      })
    ).toBe(true);
    expect(
      popoverOpensBelow({
        triggerTop: 60 + POPOVER_GAP,
        triggerBottom: 74 + POPOVER_GAP,
        panelHeight: 60,
        viewportHeight,
      })
    ).toBe(false);
  });

  test("keeps the default when neither direction fits", () => {
    // A panel taller than the viewport has nowhere to go. Moving it would
    // trade one clipped edge for another, so it stays where the CSS put it.
    expect(
      popoverOpensBelow({ triggerTop: 40, triggerBottom: 54, panelHeight: 900, viewportHeight })
    ).toBe(false);
  });
});
