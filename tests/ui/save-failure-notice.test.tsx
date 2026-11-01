/**
 * @vitest-environment jsdom
 *
 * Task 2 (2026-09-23 review followups): a failed writeGameSave() or
 * saveFinishedGame() must not fail silently forever - the player should be
 * told once per run of consecutive failures, with a notice that stays on
 * screen (never auto-dismisses) until closed explicitly.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { App } from "../../src/ui/app";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

const SAVE_FAILED_TEXT =
  "Nie udało się zapisać postępu. Możesz grać dalej, ale po zamknięciu lub odświeżeniu strony ta kariera przepadnie.";
const ARCHIVE_SAVE_FAILED_TEXT =
  "Nie udało się zapisać wyniku w archiwum. Partia jest zakończona, ale nie pojawi się na liście wyników.";

// Reduced motion, stubbed the same way notification-focus.test.ts does it:
// it makes NotificationBanner's close() call onDismiss() synchronously
// instead of waiting for a CSS "animationend" jsdom never fires on its own,
// so a close-button click resolves within the same act() call.
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

const mount = async (): Promise<HTMLDivElement> => {
  stubReducedMotion();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => root.render(createElement(App)));
  return container;
};

const enabled = (container: HTMLElement, action: string): Element | null =>
  container.querySelector(`[data-dd-action="${action}"]:not([disabled])`);

const click = async (container: HTMLElement, action: string): Promise<void> => {
  const control =
    enabled(container, action) ?? container.querySelector(`[data-dd-action="${action}"]`);
  if (!control) throw new Error(`No control for action "${action}"`);
  await act(async () => control.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};

const notificationText = (container: HTMLElement): string | null =>
  container.querySelector(".dd-notification p")?.textContent ?? null;

const closeNotification = async (container: HTMLElement): Promise<void> => {
  const button = container.querySelector<HTMLButtonElement>(".dd-notification-close");
  await act(async () => button?.click());
};

const mockSetItemThrows = (): void => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
};

/** Fires the visibilitychange effect's pagehide flush directly - a clean way
 * to trigger another writeGameSave() attempt without going through a card
 * decision, which raises its own ordinary (non-persistent) notification that
 * would overwrite the single notification slot and make the "stays silent"
 * assertions below meaningless. */
const flushViaPagehide = async (): Promise<void> => {
  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
  });
};

/** Same recipe as notification-focus.test.ts's enterOfferWindow, minus the
 * final "oferty" click - this suite drives the offer window itself, one
 * click (and one triggered autosave) at a time. */
const startCareer = async (): Promise<HTMLDivElement> => {
  const container = await mount();
  await click(container, "losuj");
  await click(container, "dalej");
  await click(container, "klub:gornik-zabrze");
  await click(container, "zacznij-kariere");
  return container;
};

/** Always passes on every card, and clicks through every other screen
 * control, until the final legacy screen ("znowu": play again) appears -
 * the same shape as dom-parity.test.ts's driver, minus the choice rotation,
 * since this suite only needs to reach "final" reliably, not exercise every
 * decision type. */
const playUntilFinal = async (container: HTMLElement, clubId: string): Promise<void> => {
  await click(container, "losuj");
  await click(container, "dalej");
  await click(container, `klub:${clubId}`);
  await click(container, "zacznij-kariere");

  for (let guard = 0; guard < 500; guard += 1) {
    if (container.querySelector('[data-dd-action="znowu"]')) return;
    if (enabled(container, "eksmisja-kontynuuj")) await click(container, "eksmisja-kontynuuj");
    else if (enabled(container, "oferty")) await click(container, "oferty");
    else if (enabled(container, "epilog")) await click(container, "epilog");
    else if (enabled(container, "pas")) await click(container, "pas");
    else if (enabled(container, "dalej")) await click(container, "dalej");
    else throw new Error("save-failure-notice driver stuck: no known control present");
  }
  throw new Error("did not reach the final screen within the click guard");
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

describe("career autosave failure notice", () => {
  // These tests play the real app through many steps and share the 30 s budget
  // with dom-parity.test.ts because the 5 s default times out under load.
  test("shown once per run of failures, never auto-dismisses, and shown again after a later failure", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const container = await startCareer();

    // Career start itself already wrote a save while setItem was real - the
    // failures below are deliberately introduced only now.
    mockSetItemThrows();

    // First failed save: entering the offer window is a structural change
    // (saveFingerprint), so it triggers its own writeGameSave attempt.
    await click(container, "oferty");
    expect(container.querySelectorAll(".dd-notification")).toHaveLength(1);
    expect(notificationText(container)).toBe(SAVE_FAILED_TEXT);

    // Well past the banner's 1500ms auto-dismiss - a persistent notice stays.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(notificationText(container)).toBe(SAVE_FAILED_TEXT);

    // Second failed save (same run of failures, no card decision involved):
    // still silent, because the notice already fired once for this run.
    await flushViaPagehide();
    expect(notificationText(container)).toBe(SAVE_FAILED_TEXT);

    // The player dismisses it explicitly (the only way it ever closes).
    await closeNotification(container);
    expect(container.querySelector(".dd-notification")).toBeNull();

    // A further failure in the same run stays silent even after the close.
    await flushViaPagehide();
    expect(container.querySelector(".dd-notification")).toBeNull();

    // Writes start succeeding again - a success is always silent.
    vi.restoreAllMocks();
    await flushViaPagehide();
    expect(container.querySelector(".dd-notification")).toBeNull();

    // A later failure after a success shows the notice again.
    mockSetItemThrows();
    await flushViaPagehide();
    expect(notificationText(container)).toBe(SAVE_FAILED_TEXT);
  }, 30_000);

  // Final review, Important 1: an ordinary notice (a card decision) must not
  // displace a live persistent one - it used to, and because the once-per-run
  // latch was already set, the warning would then never return while storage
  // stayed blocked.
  test("a live persistent notice is not displaced by an ordinary one, and ordinary notices resume after it is dismissed", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const container = await startCareer();
    mockSetItemThrows();

    // First failed save shows the persistent warning.
    await click(container, "oferty");
    expect(notificationText(container)).toBe(SAVE_FAILED_TEXT);

    // An ordinary card decision would normally raise its own pass sentence
    // notice (see the decisionIndex-watching layout effect in app.tsx) - it
    // must be dropped, not shown, while the persistent warning is up.
    await click(container, "pas");
    expect(notificationText(container)).toBe(SAVE_FAILED_TEXT);
    expect(container.querySelectorAll(".dd-notification")).toHaveLength(1);

    // The player dismisses the warning explicitly.
    await closeNotification(container);
    expect(container.querySelector(".dd-notification")).toBeNull();

    // Ordinary notices behave exactly as before once nothing persistent is
    // on screen - the very next decision's own notice actually appears.
    await click(container, "pas");
    const textAfterDismissal = notificationText(container);
    expect(textAfterDismissal).not.toBeNull();
    expect(textAfterDismissal).not.toBe(SAVE_FAILED_TEXT);
  }, 30_000);

  // Final review, Ruling 2: a new career means unsaved progress again, even
  // under storage that is still blocked - both once-per-run latches must
  // reset on START_CAREER/PLAY_AGAIN, not only on a successful write.
  //
  // This covers the save-notice latch end to end (career 1's first window
  // click fails and warns, PLAY_AGAIN starts career 2 under the same still-
  // failing storage, and the warning reappears immediately - proving the
  // latch was re-armed rather than staying silenced from career 1). The
  // archive-notice latch shares the exact same reset effect in app.tsx (one
  // `useEffect` keyed off `state.seed`, resetting both refs in the same
  // commit), so this also exercises its reset mechanism; a literal end-to-end
  // check for the archive latch specifically would need a second full
  // playthrough to reach "final" again, which is out of scope for a focused
  // test (see fix report for why this is the chosen coverage instead of a
  // second full game).
  test("both once-per-run latches reset when a new career starts", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const container = await startCareer();
    mockSetItemThrows();

    // Career 1: fail once, dismiss, fail again silently (the latch is set).
    await click(container, "oferty");
    expect(notificationText(container)).toBe(SAVE_FAILED_TEXT);
    await closeNotification(container);
    await flushViaPagehide();
    expect(container.querySelector(".dd-notification")).toBeNull();

    // Storage is still failing when career 2 starts (PLAY_AGAIN, via the
    // club screen's restart, since this app instance never reaches "final").
    await click(container, "restart-pytaj");
    await click(container, "restart-tak");
    await click(container, `klub:gornik-zabrze`);
    await click(container, "zacznij-kariere");

    // The new career's own first structural autosave attempt fails too - if
    // the latch had NOT been reset, this would stay silent forever, exactly
    // the bug Important 1 also produced (just reached a different way).
    expect(notificationText(container)).toBe(SAVE_FAILED_TEXT);
  }, 30_000);
});

describe("archive save failure notice", () => {
  test("shown once when saveFinishedGame's write fails on reaching the final screen", async () => {
    // Fakes setTimeout/clearTimeout too (not just setInterval/clearInterval
    // for TICK) - the banner's own auto-dismiss timer is a setTimeout
    // (notification-banner.tsx), so without faking it the advanceTimersByTime
    // below would never reach it and the "never auto-dismisses" assertion
    // would pass vacuously regardless of `persistent` (final review, Minor 1).
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((buffer) => {
      (buffer as Uint32Array)[0] = 0x6000_0001;
      return buffer;
    });

    const container = await mount();
    mockSetItemThrows();

    await playUntilFinal(container, "gornik-zabrze");

    expect(container.querySelectorAll(".dd-notification")).toHaveLength(1);
    expect(notificationText(container)).toBe(ARCHIVE_SAVE_FAILED_TEXT);

    // Never auto-dismisses either.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(notificationText(container)).toBe(ARCHIVE_SAVE_FAILED_TEXT);
  }, 30_000);
});
