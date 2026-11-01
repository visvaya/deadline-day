/**
 * @vitest-environment jsdom
 */
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CZAS_BAZOWY } from "../../src/data/balance";
import { ACTION_BAR_COMPACT_QUERY } from "../../src/ui/action-bar-query";
import { App } from "../../src/ui/app";
import { GAME_SAVE_STORAGE_KEY } from "../../src/ui/game-save";
import { UI_PREFERENCES_STORAGE_KEY } from "../../src/ui/ui-preferences";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

const stubViewport = (mobile: boolean): void => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: mobile && query === ACTION_BAR_COMPACT_QUERY,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
};

const mountApp = async ({
  mobile = true,
  strict = false,
}: { mobile?: boolean; strict?: boolean } = {}): Promise<HTMLDivElement> => {
  stubViewport(mobile);
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((buffer) => {
    (buffer as Uint32Array)[0] = 0x2000_0002;
    return buffer;
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  const app = createElement(App);
  await act(async () => root.render(strict ? createElement(StrictMode, null, app) : app));
  return container;
};

const click = async (container: HTMLElement, selector: string): Promise<void> => {
  const control = container.querySelector<HTMLElement>(selector);
  if (!control) throw new Error(`No control matching "${selector}"`);
  await act(async () => control.click());
};

/** Every helper below drives the two-step career setup: a randomised (but
 * always valid) manager identity, then a fixed club - deterministic enough
 * for assertions that read the club's own name/short name back off the DOM. */
const STARTING_CLUB_ID = "gornik-zabrze";
const STARTING_CLUB_NAME = "Górnik Zabrze";

const continueFromManager = async (container: HTMLElement): Promise<void> => {
  await click(container, '[data-dd-action="losuj"]');
  await click(container, '[data-dd-action="dalej"]');
};

const startCareer = async (
  container: HTMLElement,
  clubId: string = STARTING_CLUB_ID
): Promise<void> => {
  await continueFromManager(container);
  await click(container, `[data-dd-action="klub:${clubId}"]`);
  await click(container, '[data-dd-action="zacznij-kariere"]');
};

/** Simulates a reload: unmount without touching localStorage, so the next
 * mountApp() call hydrates from whatever is still in storage - the way
 * main.tsx would after the page comes back. */
const unmountCurrent = async (): Promise<void> => {
  if (!mounted) return;
  await act(async () => mounted?.root.unmount());
  mounted.container.remove();
  mounted = undefined;
};

afterEach(async () => {
  if (mounted) {
    await act(async () => mounted?.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

describe("new game setup", () => {
  test("opens on the manager screen with the timer enabled by default", async () => {
    const container = await mountApp();

    expect(container.querySelectorAll('[data-dd-action="timer-toggle"]')).toHaveLength(2);
    expect(container.querySelector('[data-timer-choice="on"]')?.getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(container.querySelector('[data-dd-action="dalej"]')?.textContent).toContain("Dalej");
    const selectedTimer = container.querySelector('[data-timer-choice="on"]');
    expect(selectedTimer?.querySelector(".dd-setup-choice-title")?.textContent).toBe(
      "Włączonypolecane"
    );
    expect(selectedTimer?.querySelector(".dd-setup-choice-state")?.textContent).toBe("wybrano");
    for (const section of container.querySelectorAll<HTMLElement>(".dd-setup-options section")) {
      const labelledBy = section.getAttribute("aria-labelledby");
      expect(labelledBy).not.toBeNull();
      expect(container.querySelector(`#${labelledBy}`)).not.toBeNull();
    }
  });

  // Owner decision (2026-09-18): the section shows on every viewport now;
  // only its DEFAULT (which choice reads as selected, and which one is
  // labelled "domyślnie") differs by viewport while nothing is stored yet.
  test("defaults the action bar to auto-hide on a compact viewport and persists an explicit choice", async () => {
    const container = await mountApp({ mobile: true });
    const autoHide = container.querySelector('[data-action-bar-choice="autoHide"]');
    const alwaysVisible = container.querySelector('[data-action-bar-choice="alwaysVisible"]');

    expect(autoHide?.getAttribute("aria-pressed")).toBe("true");
    expect(alwaysVisible?.getAttribute("aria-pressed")).toBe("false");
    expect(autoHide?.querySelector(".dd-setup-choice-title")?.textContent).toContain("domyślnie");

    await click(container, '[data-action-bar-choice="alwaysVisible"]');

    expect(alwaysVisible?.getAttribute("aria-pressed")).toBe("true");
    expect(autoHide?.getAttribute("aria-pressed")).toBe("false");
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY) ?? "null")).toEqual({
      schemaVersion: 2,
      actionBarMode: "alwaysVisible",
    });
  });

  test("defaults the action bar to always-visible on desktop and persists an explicit choice", async () => {
    const container = await mountApp({ mobile: false });
    const autoHide = container.querySelector('[data-action-bar-choice="autoHide"]');
    const alwaysVisible = container.querySelector('[data-action-bar-choice="alwaysVisible"]');

    expect(alwaysVisible?.getAttribute("aria-pressed")).toBe("true");
    expect(autoHide?.getAttribute("aria-pressed")).toBe("false");
    expect(alwaysVisible?.querySelector(".dd-setup-choice-title")?.textContent).toContain(
      "domyślnie"
    );

    await click(container, '[data-action-bar-choice="autoHide"]');

    expect(autoHide?.getAttribute("aria-pressed")).toBe("true");
    expect(JSON.parse(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY) ?? "null")).toEqual({
      schemaVersion: 2,
      actionBarMode: "autoHide",
    });
  });

  test("shows the action bar section on desktop viewports too", async () => {
    const container = await mountApp({ mobile: false });
    expect(container.querySelector("#action-bar-heading")).not.toBeNull();
    expect(container.querySelector('[data-action-bar-choice="autoHide"]')).not.toBeNull();
    expect(container.querySelector('[data-action-bar-choice="alwaysVisible"]')).not.toBeNull();
  });

  test("restores a saved action bar preference and ignores invalid storage", async () => {
    localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 2, actionBarMode: "alwaysVisible" })
    );
    // Explicit choice wins even on a compact viewport where the default
    // would otherwise be autoHide.
    let container = await mountApp({ mobile: true });
    expect(
      container
        .querySelector('[data-action-bar-choice="alwaysVisible"]')
        ?.getAttribute("aria-pressed")
    ).toBe("true");

    if (mounted) {
      await act(async () => mounted?.root.unmount());
      mounted.container.remove();
      mounted = undefined;
    }
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, "not-json");
    container = await mountApp({ mobile: true });
    expect(
      container.querySelector('[data-action-bar-choice="autoHide"]')?.getAttribute("aria-pressed")
    ).toBe("true");
  });

  test("keeps the selected timer state in the same bottom position for both choices", async () => {
    const container = await mountApp();

    await click(container, '[data-timer-choice="off"]');

    const selectedTimer = container.querySelector('[data-timer-choice="off"]');
    expect(selectedTimer?.querySelector(".dd-setup-choice-title")?.textContent).toBe("Wyłączony");
    expect(selectedTimer?.querySelector(".dd-setup-choice-state")?.textContent).toBe("wybrano");
    expect(container.querySelector('[data-timer-choice="on"] .dd-setup-choice-state')).toBeNull();
  });

  test("starts the chosen club from the two-step setup", async () => {
    const container = await mountApp();

    await continueFromManager(container);
    await click(container, `[data-dd-action="klub:${STARTING_CLUB_ID}"]`);
    expect(
      (container.querySelector(`[data-dd-action="klub:${STARTING_CLUB_ID}"]`) as HTMLInputElement)
        ?.checked
    ).toBe(true);

    await click(container, '[data-dd-action="zacznij-kariere"]');

    expect(container.querySelector(".dd-club-bar")).not.toBeNull();
    expect(container.querySelector(".dd-club-heading h1")?.textContent).toBe(STARTING_CLUB_NAME);
    expect(container.querySelector('[data-dd-action="wstecz"]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector(".dd-club-heading h1"));
  });

  // A11y fix (2026-09-16, CRITICAL #2): the mount-time focus effect used to
  // guard `if (state.faza === "start" && !archiveOpen) return;` - written
  // for the genuine first mount, where there is nothing to move focus away
  // from. BACK also lands on `faza: "start"` (from the club screen's
  // "Wstecz"), so that same guard fired there too: ClubSelectScreen
  // unmounted with the focused "Wstecz" button inside it, and focus fell to
  // `<body>` with nothing announced.
  test("Wstecz on the club screen returns focus to the start heading, not <body>", async () => {
    const container = await mountApp();

    await continueFromManager(container);
    expect(container.querySelector(`[data-dd-action="klub:${STARTING_CLUB_ID}"]`)).not.toBeNull();

    await click(container, '[data-dd-action="wstecz"]');

    expect(container.querySelector(".dd-setup-hero h1")).not.toBeNull();
    expect(document.activeElement).toBe(container.querySelector(".dd-setup-hero h1"));
    expect(document.activeElement).not.toBe(document.body);
  });

  test("the genuine first mount never steals focus onto the start heading", async () => {
    const container = await mountApp();

    // Nothing in this app moves focus proactively on the very first paint -
    // the whole point of the isFirstRender guard is that there is nothing to
    // move focus away FROM yet.
    expect(document.activeElement).not.toBe(container.querySelector(".dd-setup-hero h1"));
  });

  test("removes every time-pressure control from offers when the timer is off", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const container = await mountApp();

    await click(container, '[data-dd-action="losuj"]');
    await click(container, '[data-timer-choice="off"]');
    await click(container, '[data-dd-action="dalej"]');
    await click(container, `[data-dd-action="klub:${STARTING_CLUB_ID}"]`);
    await click(container, '[data-dd-action="zacznij-kariere"]');
    await click(container, '[data-dd-action="oferty"]');

    expect(container.querySelector(".dd-offer-card")).not.toBeNull();
    expect(container.querySelector(".dd-offer-clock")).toBeNull();
    expect(container.querySelector(".dd-timer")).toBeNull();
    expect(container.querySelector('[data-dd-action="czas"]')).toBeNull();
    expect(container.querySelector('[data-dd-action="bierz"]')).not.toBeNull();
    expect(container.querySelector('[data-dd-action="targ"]')).not.toBeNull();
    expect(container.querySelector('[data-dd-action="pas"]')).not.toBeNull();
  });

  test("returns to club choice after abandoning a career", async () => {
    const container = await mountApp();

    await startCareer(container);
    await click(container, '[data-dd-action="restart-pytaj"]');
    const confirmation = container.querySelector<HTMLElement>(".dd-restart-confirmation");
    expect(confirmation?.getAttribute("role")).toBe("group");
    expect(confirmation?.getAttribute("aria-labelledby")).toBe("restart-confirmation-title");
    expect(container.querySelector("#restart-confirmation-title")?.textContent).toContain(
      "Porzucić karierę"
    );
    expect(document.activeElement).toBe(container.querySelector('[data-dd-action="restart-nie"]'));

    await act(async () => {
      confirmation?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(document.activeElement).toBe(
      container.querySelector('[data-dd-action="restart-pytaj"]')
    );

    await click(container, '[data-dd-action="restart-pytaj"]');
    await click(container, '[data-dd-action="restart-tak"]');

    // CONFIRM_RESTART lands back on club choice (step 2), not the manager
    // screen: the manager identity is kept, only the club and baseline reset.
    expect(container.querySelector(`[data-dd-action="klub:${STARTING_CLUB_ID}"]`)).not.toBeNull();
    expect(container.querySelector('[data-dd-action="zacznij-kariere"]')).not.toBeNull();
    expect(document.activeElement).toBe(container.querySelector(".dd-setup-hero h1"));
  });
});

describe("resuming an interrupted game", () => {
  test("survives a reload mid-career and clears on restart", async () => {
    const container = await mountApp();
    await startCareer(container);

    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).not.toBeNull();
    const clubName = container.querySelector(".dd-club-heading h1")?.textContent;
    expect(clubName).toBeTruthy();

    // Simulate a reload: unmount without touching localStorage, then mount a
    // fresh App the way main.tsx would after the page comes back.
    await unmountCurrent();
    const resumedContainer = await mountApp();

    expect(resumedContainer.querySelector(".dd-setup-content")).toBeNull();
    expect(resumedContainer.querySelector(".dd-club-bar")).not.toBeNull();
    expect(resumedContainer.querySelector(".dd-club-heading h1")?.textContent).toBe(clubName);

    await click(resumedContainer, '[data-dd-action="restart-pytaj"]');
    await click(resumedContainer, '[data-dd-action="restart-tak"]');

    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();

    await unmountCurrent();
    const freshContainer = await mountApp();

    // The career is gone, but the restart kept the manager: the reload lands
    // back on club choice (from the setup draft), never inside the old career
    // and never on a blank manager form.
    expect(freshContainer.querySelector(".dd-club-bar")).toBeNull();
    expect(freshContainer.querySelector(".dd-root")?.getAttribute("data-dd-screen")).toBe("wybor");
  });
});

describe("wall-clock timer reconciliation", () => {
  /** jsdom's own visibilityState getter isn't writable - redefine it as a
   * plain configurable property each time, mirroring how a real browser
   * flips it around a background/foreground transition. */
  const setVisibility = (value: DocumentVisibilityState): void => {
    Object.defineProperty(document, "visibilityState", { value, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  const openOffer = async (container: HTMLElement): Promise<void> => {
    await startCareer(container);
    await click(container, '[data-dd-action="oferty"]');
  };

  test("a reload shorter than the countdown keeps the same offer and catches czas up", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const container = await mountApp();
    await openOffer(container);
    const offerName = container.querySelector(".dd-offer-name")?.textContent;
    expect(container.querySelector(".dd-timer")?.getAttribute("aria-valuenow")).toBe(
      String(CZAS_BAZOWY)
    );

    await unmountCurrent();
    now.mockReturnValue(1_000_000 + 5_000);
    const resumedContainer = await mountApp();

    expect(resumedContainer.querySelector(".dd-offer-name")?.textContent).toBe(offerName);
    expect(resumedContainer.querySelector(".dd-timer")?.getAttribute("aria-valuenow")).toBe(
      String(CZAS_BAZOWY - 5)
    );
    expect(resumedContainer.querySelector(".dd-notification")?.textContent).toContain(
      "Wznowiono przerwaną partię."
    );
  });

  test("a reload longer than the countdown auto-passes the offer with a timeout notice", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const container = await mountApp();
    await openOffer(container);

    await unmountCurrent();
    now.mockReturnValue(2_000_000 + 20_000);
    const resumedContainer = await mountApp();

    expect(resumedContainer.querySelector(".dd-notification")?.textContent).toContain(
      "Czas na podjęcie decyzji minął. Przechodzisz do kolejnej oferty/ekranu."
    );
    expect(resumedContainer.querySelector(".dd-notification")?.textContent).not.toContain(
      "Wznowiono przerwaną partię."
    );
    // The window still had moves left, so the timed-out card is replaced by
    // the next draw rather than closing the window outright.
    expect(resumedContainer.querySelector(".dd-offer-card")).not.toBeNull();
    expect(resumedContainer.querySelector(".dd-timer")?.getAttribute("aria-valuenow")).toBe(
      String(CZAS_BAZOWY)
    );
  });

  test("under StrictMode, a long reload only ever times out one card, not the freshly-drawn one too", async () => {
    // React's development StrictMode invokes a cleanup-less mount effect
    // twice. Without a guard, the reconciliation effect would replay the
    // same elapsedSeconds a second time against whatever the first dispatch
    // just produced - silently timing out the freshly-drawn next card too,
    // in violation of "the next offer gets a full, untouched timer".
    const now = vi.spyOn(Date, "now").mockReturnValue(5_000_000);
    const container = await mountApp({ strict: true });
    await openOffer(container);

    await unmountCurrent();
    now.mockReturnValue(5_000_000 + 20_000);
    const resumedContainer = await mountApp({ strict: true });

    // One resolved card writes exactly one transfer-log line; a second,
    // silently-eaten card would write two.
    expect(resumedContainer.querySelectorAll(".dd-transfer-log p")).toHaveLength(1);
    expect(resumedContainer.querySelector(".dd-timer")?.getAttribute("aria-valuenow")).toBe(
      String(CZAS_BAZOWY)
    );
    expect(resumedContainer.querySelector(".dd-notification")?.textContent).toContain(
      "Czas na podjęcie decyzji minął. Przechodzisz do kolejnej oferty/ekranu."
    );
  });

  test("the resumed and timed-out notices never both appear for the same reload", async () => {
    // Guards the mutual exclusion directly: resumeNotice is decided
    // synchronously once, before either notice-producing effect runs, so a
    // reload can only ever trigger one of the two banners, never both in
    // sequence.
    const now = vi.spyOn(Date, "now").mockReturnValue(6_000_000);
    const shortContainer = await mountApp();
    await openOffer(shortContainer);
    await unmountCurrent();
    now.mockReturnValue(6_000_000 + 5_000);
    const shortResume = await mountApp();
    expect(shortResume.querySelector(".dd-notification")?.textContent).toContain(
      "Wznowiono przerwaną partię."
    );
    expect(shortResume.querySelector(".dd-notification")?.textContent).not.toContain(
      "Czas na podjęcie decyzji minął."
    );
    await unmountCurrent();
    localStorage.clear();

    now.mockReturnValue(7_000_000);
    const longContainer = await mountApp();
    await openOffer(longContainer);
    await unmountCurrent();
    now.mockReturnValue(7_000_000 + 20_000);
    const longResume = await mountApp();
    expect(longResume.querySelector(".dd-notification")?.textContent).toContain(
      "Czas na podjęcie decyzji minął."
    );
    expect(longResume.querySelector(".dd-notification")?.textContent).not.toContain(
      "Wznowiono przerwaną partię."
    );
  });

  test("backgrounding the tab briefly (no reload) keeps the offer and catches czas up", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(3_000_000);
    const container = await mountApp();
    await openOffer(container);
    const offerName = container.querySelector(".dd-offer-name")?.textContent;

    await act(async () => setVisibility("hidden"));
    now.mockReturnValue(3_000_000 + 5_000);
    await act(async () => setVisibility("visible"));

    expect(container.querySelector(".dd-offer-name")?.textContent).toBe(offerName);
    expect(container.querySelector(".dd-timer")?.getAttribute("aria-valuenow")).toBe(
      String(CZAS_BAZOWY - 5)
    );
  });

  test("backgrounding the tab past the countdown (no reload) auto-passes with a timeout notice", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(4_000_000);
    const container = await mountApp();
    await openOffer(container);

    await act(async () => setVisibility("hidden"));
    now.mockReturnValue(4_000_000 + 20_000);
    await act(async () => setVisibility("visible"));

    expect(container.querySelector(".dd-notification")?.textContent).toContain(
      "Czas na podjęcie decyzji minął. Przechodzisz do kolejnej oferty/ekranu."
    );
    expect(container.querySelector(".dd-offer-card")).not.toBeNull();
  });

  test("a reload landing right after a same-session timeout still shows the timeout notice", async () => {
    // The exact bug this regresses: the countdown expires while the tab is
    // backgrounded (correctly shows the timeout notice, in-memory), and a
    // reload lands moments later - e.g. Vite's dev client reconnecting once
    // the tab is foreground again - before the player ever sees that
    // in-memory toast. Without markPendingTimeoutNotice()/peekPending
    // TimeoutNotice(), the next mount would only see the already-resolved,
    // freshly-drawn card and wrongly report a plain "resumed".
    const now = vi.spyOn(Date, "now").mockReturnValue(8_000_000);
    const container = await mountApp();
    await openOffer(container);

    await act(async () => setVisibility("hidden"));
    now.mockReturnValue(8_000_000 + 20_000);
    await act(async () => setVisibility("visible"));
    expect(container.querySelector(".dd-notification")?.textContent).toContain(
      "Czas na podjęcie decyzji minął."
    );

    // The reload happens right away - no further wall-clock time passes.
    await unmountCurrent();
    const resumedContainer = await mountApp();

    expect(resumedContainer.querySelector(".dd-notification")?.textContent).toContain(
      "Czas na podjęcie decyzji minął. Przechodzisz do kolejnej oferty/ekranu."
    );
    expect(resumedContainer.querySelector(".dd-notification")?.textContent).not.toContain(
      "Wznowiono przerwaną partię."
    );
  });

  test("shows a timeout notice when the countdown itself expires on the foreground", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const container = await mountApp();
    await openOffer(container);
    // The offer counter, not the name on the card: the same player can
    // legitimately be offered twice in a row, so comparing names tests the
    // draw rather than the clock. Asking whether the counter moved is
    // exactly what this test is about - did the timeout advance the window.
    const offerCounter = () =>
      [...container.querySelectorAll(".dd-hud div")]
        .find((row) => row.querySelector("dt")?.textContent === "oferta")
        ?.querySelector("dd")?.textContent;
    const before = offerCounter();

    // One second at a time, like a real setInterval firing on a real clock -
    // a single large jump collapses all 15 ticks into one fake-timer burst
    // with no render in between, which isn't how this ever happens for real.
    for (let second = 0; second < CZAS_BAZOWY; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }

    expect(container.querySelector(".dd-notification")?.textContent).toContain(
      "Czas na podjęcie decyzji minął. Przechodzisz do kolejnej oferty/ekranu."
    );
    // Confirms the window actually moved on, not just that a notice appeared.
    expect(before).toBeDefined();
    expect(offerCounter()).not.toBe(before);
  });
});
