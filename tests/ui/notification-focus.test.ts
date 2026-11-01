/**
 * @vitest-environment jsdom
 *
 * WCAG 2.2 SC 2.4.11 (Focus Not Obscured): app.tsx focuses the new screen's
 * heading on every transition, but the last move in an offer window can
 * raise a notification banner in the very same dispatch (see sendTake() in
 * offer-window-screen.tsx). The fixed banner (notification-banner.tsx) then
 * sits right on top of that freshly focused heading - invisible to a mouse
 * user (the banner auto-dismisses in 1.5s and nothing was relying on
 * *seeing* the heading), but a real problem for a keyboard or screen-reader
 * user whose focus that heading was supposed to represent.
 *
 * Product decision (2026-09-17): only a keyboard-modality transition that
 * coincides with a notification redirects focus to the banner's own close
 * button instead, and pauses its auto-dismiss (WCAG 2.2.1) until the player
 * closes it explicitly. A pointer/touch user sees no change at all.
 */
import { StrictMode, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { App } from "../../src/ui/app";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

// Every scenario below runs twice: once plainly and once under <StrictMode>,
// the way src/main.tsx mounts the real app. StrictMode double-invokes the
// component body on every development render with shared refs, so any hold
// bookkeeping written during render (rather than committed in an effect)
// diverges between the two invocations - the bug this variant pins.
let strictMode = false;

// Reduced motion, stubbed the same way other suites in this repo do it: it
// makes NotificationBanner's close() call onDismiss() synchronously instead
// of waiting for a CSS "animationend" jsdom never fires on its own, so a
// close button click resolves the same tick without a fake, unrelated
// animation-timing dance in every test below.
const stubReducedMotion = (): void => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
};

const mountApp = async (seed = 0x2000_0009): Promise<HTMLDivElement> => {
  stubReducedMotion();
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((buffer) => {
    (buffer as Uint32Array)[0] = seed;
    return buffer;
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  const app = createElement(App);
  await act(async () => root.render(strictMode ? createElement(StrictMode, null, app) : app));
  return container;
};

const click = async (container: HTMLElement, action: string): Promise<void> => {
  const control = container.querySelector<HTMLElement>(`[data-dd-action="${action}"]`);
  if (!control) throw new Error(`No control for action "${action}"`);
  await act(async () => control.click());
};

const screen = (container: HTMLElement): string | null =>
  container.querySelector(".dd-root")?.getAttribute("data-dd-screen") ?? null;

const closeButton = (container: HTMLElement): HTMLButtonElement | null =>
  container.querySelector<HTMLButtonElement>(".dd-notification-close");

const heading = (container: HTMLElement): HTMLElement | null => container.querySelector("h1");

/** Same recipe common-components.test.ts's "a new action group resets a
 * previously hidden mobile bar" test uses to reach the offer window with
 * exactly four moves left (the summer window's schedule: a full tenure is
 * always 30 card decisions). */
const enterOfferWindow = async (): Promise<HTMLDivElement> => {
  const container = await mountApp();
  await click(container, "losuj");
  await click(container, "dalej");
  await click(container, "klub:gornik-zabrze");
  await click(container, "zacznij-kariere");
  await click(container, "oferty");
  return container;
};

/** A real keydown on window, exactly what input-modality.ts listens for -
 * not a React event, so this must go through the DOM rather than a
 * Testing-Library-style synthetic dispatch on a specific element. */
const pressKeyboard = async (key = "Tab"): Promise<void> => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
};

const pressPointer = async (): Promise<void> => {
  await act(async () => {
    window.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
};

/** Passes three times (each raises a notification with no transition - the
 * window has four moves) then a fourth that ends the window, transitioning
 * to the half-season screen in the same dispatch as its own notification. */
const passThroughWindow = async (container: HTMLDivElement): Promise<void> => {
  for (let i = 0; i < 3; i += 1) await click(container, "pas");
  await click(container, "pas");
};

/** Same schedule as passThroughWindow, but the window-ending move is a
 * haggle: DECIDE resolves and bumps state.decisionIndex (and, being the
 * window's last move, state.faza) synchronously inside the reducer, but the
 * notification itself is only raised afterwards, by app.tsx's
 * decisionIndex-watching effect (registerPendingDecision/onDecisionPending) -
 * one render later than the transition it "coincides" with. */
const haggleThroughWindow = async (container: HTMLDivElement): Promise<void> => {
  for (let i = 0; i < 3; i += 1) await click(container, "pas");
  await click(container, "targ");
};

afterEach(async () => {
  if (mounted) {
    await act(async () => mounted!.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe.each([{ strict: false }, { strict: true }])(
  "notification banner focus handling (StrictMode: $strict)",
  ({ strict }) => {
    beforeEach(() => {
      strictMode = strict;
    });

    test("a keyboard transition with a coinciding notification focuses the close button and pauses auto-dismiss", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const container = await enterOfferWindow();
      await pressKeyboard();

      await passThroughWindow(container);

      expect(screen(container)).toBe("polSezonu");
      const button = closeButton(container);
      expect(button).not.toBeNull();
      expect(document.activeElement).toBe(button);

      // Well past AUTO_DISMISS_MS (1.5s) - still open, because the timer was
      // never scheduled while held.
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(closeButton(container)).not.toBeNull();
      expect(document.activeElement).toBe(closeButton(container));
    });

    test("closing the held banner (click) hands focus to the heading it deferred", async () => {
      const container = await enterOfferWindow();
      await pressKeyboard();
      await passThroughWindow(container);

      const button = closeButton(container);
      expect(document.activeElement).toBe(button);

      await act(async () => {
        button?.click();
      });

      expect(closeButton(container)).toBeNull();
      const focusedHeading = heading(container);
      expect(focusedHeading).not.toBeNull();
      expect(document.activeElement).toBe(focusedHeading);
    });

    test("closing the held banner (Escape) hands focus to the heading it deferred", async () => {
      const container = await enterOfferWindow();
      await pressKeyboard();
      await passThroughWindow(container);

      expect(document.activeElement).toBe(closeButton(container));

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });

      expect(closeButton(container)).toBeNull();
      expect(document.activeElement).toBe(heading(container));
    });

    test("a further transition while the held banner is still open drops it and focuses the new heading", async () => {
      const container = await enterOfferWindow();
      await pressKeyboard();
      await passThroughWindow(container);
      expect(document.activeElement).toBe(closeButton(container));

      // "dalej" on the half-season screen (ADVANCE) is a second, unrelated
      // transition - no notification of its own - that lands while the first
      // banner is still open and unclosed.
      await click(container, "dalej");

      expect(closeButton(container)).toBeNull();
      const focusedHeading = heading(container);
      expect(focusedHeading).not.toBeNull();
      expect(document.activeElement).toBe(focusedHeading);
    });

    test("a notification without a coinciding transition never steals focus, even for a keyboard user", async () => {
      const container = await enterOfferWindow();
      await pressKeyboard();

      // Only the first of four - the window is not over, so no transition
      // rides along with this notification.
      await click(container, "pas");

      expect(screen(container)).toBe("okno");
      expect(container.querySelector(".dd-notification")).not.toBeNull();
      expect(document.activeElement).not.toBe(closeButton(container));
    });

    test("a late notification created after the transition (haggle resolving via an effect) still focuses the close button", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const container = await enterOfferWindow();
      await pressKeyboard();

      await haggleThroughWindow(container);

      expect(screen(container)).toBe("polSezonu");
      const button = closeButton(container);
      expect(button).not.toBeNull();
      expect(document.activeElement).toBe(button);

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(closeButton(container)).not.toBeNull();
      expect(document.activeElement).toBe(closeButton(container));
    });

    test("a notification already on screen before an unrelated transition is left alone", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      // A schema mismatch makes inspectGameSave() report "discarded", which
      // app.tsx's saveDiscarded effect turns into a notification shortly after
      // mount - with no transition of its own (isFirstRender guards the very
      // first render from any focus handling at all).
      localStorage.setItem("deadline-day:game-save", JSON.stringify({ schemaVersion: 1 }));
      const container = await mountApp();
      expect(container.querySelector(".dd-notification")).not.toBeNull();
      expect(document.activeElement).not.toBe(closeButton(container));

      await pressKeyboard();
      // "start" -> "wybor": a genuine transition, but one that never raises a
      // notification of its own. The discarded-save banner from above is still
      // open (fake timers never advanced) when it lands.
      await click(container, "losuj");
      await click(container, "dalej");

      expect(screen(container)).toBe("wybor");
      expect(document.activeElement).not.toBe(closeButton(container));
      expect(document.activeElement).toBe(heading(container));
    });

    test("a pointer-modality transition with a coinciding notification behaves exactly as before: heading focused, banner unpaused", async () => {
      const container = await enterOfferWindow();
      await pressPointer();

      await passThroughWindow(container);

      expect(screen(container)).toBe("polSezonu");
      expect(document.activeElement).toBe(heading(container));
      // The banner is still there, on its own ordinary clock - untouched.
      expect(container.querySelector(".dd-notification")).not.toBeNull();
      expect(document.activeElement).not.toBe(closeButton(container));
    });
  }
);
