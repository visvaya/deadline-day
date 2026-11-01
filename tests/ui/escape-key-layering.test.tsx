/**
 * @vitest-environment jsdom
 *
 * A11y fix (2026-09-24): several overlays close on Escape through a
 * `document`-level keydown listener (SquadDrawer, SquadEvictionDialog,
 * InfoPopover), and a persistent NotificationBanner (autoDismiss false, the
 * save-failure warning) closes on Escape too. Listeners on the same target
 * run in registration order, so a single Escape press used to be able to
 * close both an open overlay and the banner underneath it - a keyboard user
 * closing the squad drawer could dismiss the warning without ever reading it.
 *
 * The fix: NotificationBanner listens on `window` (which an event dispatched
 * at or below `document` always reaches last, regardless of when either
 * listener was registered) and ignores an Escape whose `defaultPrevented`
 * flag is already set. Every overlay marks its own Escape handling with
 * `event.preventDefault()` before it closes. These tests mount the banner
 * next to each overlay as real DOM siblings - not through the full app - and
 * drive real, bubbling KeyboardEvents to check the one-press-one-layer
 * contract holds regardless of which component happened to mount first.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { FORMACJE } from "../../src/data/positions";
import type { GameAction } from "../../src/data/types";
import { App } from "../../src/ui/app";
import { NotificationBanner } from "../../src/ui/components/notification-banner";
import { InfoPopover } from "../../src/ui/components/info-popover";
import { SquadDrawer } from "../../src/ui/components/squad-drawer";
import { SquadEvictionDialog } from "../../src/ui/components/squad-eviction-dialog";
import { RestartDialog } from "../../src/ui/components/restart-dialog";
import { makeTestPlayer } from "../logic/fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

// Same recipe as notification-focus.test.ts / save-failure-notice.test.tsx:
// reduced motion makes NotificationBanner's close() call onDismiss()
// synchronously instead of waiting for a CSS "animationend" jsdom never
// fires on its own.
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

const mountTree = async (element: ReturnType<typeof createElement>): Promise<HTMLDivElement> => {
  stubReducedMotion();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => root.render(element));
  return container;
};

const rerenderTree = async (element: ReturnType<typeof createElement>): Promise<void> => {
  if (!mounted) throw new Error("nothing mounted");
  await act(async () => mounted!.root.render(element));
};

// `cancelable: true` matters here and is not the default: a real, physical
// Escape keypress is cancelable, and this suite's whole premise is that an
// overlay's preventDefault() is what tells the banner's later listener the
// press was already handled - a non-cancelable synthetic event would make
// that call a silent no-op and pass for the wrong reason.
const escape = async (target: EventTarget = document): Promise<void> => {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    );
  });
};

const notification = (container: HTMLElement): Element | null =>
  container.querySelector(".dd-notification");

// The nested case (fix round 2): reached only through the real App, because
// it depends on the real layout - an InfoPopover (StaffConfidenceHelp) lives
// inside PositionReports, which lives inside SquadDrawer - and on a real
// failed autosave to get a persistent banner underneath both. Reuses the
// helpers save-failure-notice.test.tsx and squad-reports-drawer.test.ts
// establish for those two halves.
const mockSetItemThrows = (): void => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
};

const mountApp = async (seed = 0x2000_0001): Promise<HTMLDivElement> => {
  stubReducedMotion();
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((buffer) => {
    (buffer as Uint32Array)[0] = seed;
    return buffer;
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => root.render(createElement(App)));
  return container;
};

const clickAction = async (container: HTMLElement, action: string): Promise<void> => {
  const control = container.querySelector<HTMLElement>(`[data-dd-action="${action}"]`);
  if (!control) throw new Error(`No control for action "${action}"`);
  await act(async () => control.click());
};

const clickNode = async (node: Element | null | undefined): Promise<void> => {
  if (!node) throw new Error("nothing to click");
  await act(async () => (node as HTMLElement).click());
};

const squadDrawer = (container: HTMLElement): HTMLElement | null =>
  container.querySelector<HTMLElement>('[role="dialog"].dd-squad-drawer');

const firstTile = (root: HTMLElement | null): HTMLButtonElement | null =>
  root?.querySelector<HTMLButtonElement>("button.dd-player-tile") ?? null;

const firstReportRow = (root: HTMLElement | null): HTMLButtonElement | null =>
  root?.querySelector<HTMLButtonElement>(".dd-player-trigger") ?? null;

afterEach(async () => {
  if (mounted) {
    await act(async () => mounted!.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.removeAttribute("tabindex");
});

describe("Escape closes only the topmost layer", () => {
  test("a persistent banner alone still closes on a single Escape", async () => {
    const onDismiss = vi.fn();
    const container = await mountTree(
      createElement(NotificationBanner, {
        text: "Nie udalo sie zapisac postepu.",
        kind: "neutral",
        onDismiss,
        autoDismiss: false,
      })
    );

    expect(notification(container)).not.toBeNull();
    await escape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("with the squad drawer open, one Escape closes the drawer and a second closes the banner", async () => {
    const onDismiss = vi.fn();
    const onClose = vi.fn();
    const squad = [makeTestPlayer("p1", { poz: "ŚO", ovr: 60, wiek: 24 })];
    const formation = FORMACJE["4-3-3"];

    const container = await mountTree(
      createElement(
        "div",
        null,
        createElement(NotificationBanner, {
          text: "Nie udalo sie zapisac postepu.",
          kind: "neutral",
          onDismiss,
          autoDismiss: false,
        }),
        createElement(SquadDrawer, {
          squad,
          formation,
          highlightedPosition: null,
          seasonalChanges: { season: 1, byPlayer: {} },
          changePeriod: "unknown",
          period: { season: 1, window: "summer" },
          contextOvr: 60,
          staffMemory: {},
          inEurope: false,
          exitLabel: "Zamknij",
          onClose,
        })
      )
    );

    expect(notification(container)).not.toBeNull();
    expect(container.querySelector('[role="dialog"].dd-squad-drawer')).not.toBeNull();

    // First Escape: the drawer is the topmost layer, and its own handler
    // marks the press as handled - the banner must stay.
    await escape();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(notification(container)).not.toBeNull();

    // The drawer closing is the caller's job (onClose only asks); simulate it
    // by re-rendering without the drawer, the way app.tsx would react to it.
    await rerenderTree(
      createElement(
        "div",
        null,
        createElement(NotificationBanner, {
          text: "Nie udalo sie zapisac postepu.",
          kind: "neutral",
          onDismiss,
          autoDismiss: false,
        })
      )
    );

    // Second Escape, nothing left open: the banner is now the topmost (only)
    // layer and closes.
    await escape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("with the info popover open, one Escape closes it and a second closes the banner", async () => {
    const onDismiss = vi.fn();
    const container = await mountTree(
      createElement(
        "div",
        null,
        createElement(NotificationBanner, {
          text: "Nie udalo sie zapisac postepu.",
          kind: "neutral",
          onDismiss,
          autoDismiss: false,
        }),
        createElement(InfoPopover, {
          text: "Wyjasnienie.",
          label: "Co to znaczy",
          action: "test-help",
        })
      )
    );

    const trigger = container.querySelector<HTMLButtonElement>('[data-dd-action="test-help"]')!;
    const panel = container.querySelector<HTMLElement>(".dd-info-popover-panel")!;

    await act(async () => {
      trigger.focus();
    });
    expect(panel.dataset.open).toBe("true");
    expect(notification(container)).not.toBeNull();

    // First Escape: the popover is open, so it is the topmost layer and
    // marks the press as handled - the banner underneath must stay.
    await escape();
    expect(panel.dataset.open).toBe("false");
    expect(onDismiss).not.toHaveBeenCalled();
    expect(notification(container)).not.toBeNull();

    // Second Escape, nothing left open: the banner closes.
    await escape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("with the squad eviction dialog open, one Escape cancels it and a second closes the banner", async () => {
    const onDismiss = vi.fn();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const incoming = makeTestPlayer("incoming", { poz: "ŚO", ovr: 78, wiek: 24 });
    const evicted = makeTestPlayer("evicted", { poz: "ŚO", ovr: 52, wiek: 35 });

    const container = await mountTree(
      createElement(
        "div",
        null,
        createElement(NotificationBanner, {
          text: "Nie udalo sie zapisac postepu.",
          kind: "neutral",
          onDismiss,
          autoDismiss: false,
        }),
        createElement(SquadEvictionDialog, {
          position: "ŚO",
          incomingPlayer: incoming,
          evictedPlayer: evicted,
          choice: "take",
          onConfirm,
          onCancel,
        })
      )
    );

    expect(notification(container)).not.toBeNull();
    expect(container.querySelector(".dd-eviction-panel")).not.toBeNull();

    await escape();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(notification(container)).not.toBeNull();

    await rerenderTree(
      createElement(
        "div",
        null,
        createElement(NotificationBanner, {
          text: "Nie udalo sie zapisac postepu.",
          kind: "neutral",
          onDismiss,
          autoDismiss: false,
        })
      )
    );

    await escape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // RestartDialog handles Escape through React's synthetic onKeyDown with
  // event.stopPropagation(), not a document/window listener like the other
  // three overlays - a different mechanism that has to be checked rather
  // than assumed to interoperate with NotificationBanner's native `window`
  // listener. React 17+ makes a synthetic stopPropagation() also call the
  // underlying native Event.stopPropagation(), which - if true - stops the
  // press from ever reaching `document` or `window` in the first place.
  test("the restart confirmation's own Escape handling does not leak through to the banner", async () => {
    const onDismiss = vi.fn();
    const actions: GameAction[] = [];
    const dispatch = (action: GameAction): void => {
      actions.push(action);
    };

    const container = await mountTree(
      createElement(
        "div",
        null,
        createElement(NotificationBanner, {
          text: "Nie udalo sie zapisac postepu.",
          kind: "neutral",
          onDismiss,
          autoDismiss: false,
        }),
        createElement(RestartDialog, { pytamRestart: true, dispatch })
      )
    );

    expect(notification(container)).not.toBeNull();
    const cancelButton = container.querySelector<HTMLButtonElement>(
      '[data-dd-action="restart-nie"]'
    )!;

    // Dispatched on the button itself (not `document`) so it has to bubble
    // through RestartDialog's own onKeyDown before it could ever reach the
    // banner's window listener - exactly the path a real keypress takes.
    await escape(cancelButton);

    expect(actions).toEqual([{ type: "CANCEL_RESTART" }]);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(notification(container)).not.toBeNull();

    // With the confirmation gone, a plain Escape closes the banner exactly
    // as the single-overlay cases above.
    await rerenderTree(
      createElement(
        "div",
        null,
        createElement(NotificationBanner, {
          text: "Nie udalo sie zapisac postepu.",
          kind: "neutral",
          onDismiss,
          autoDismiss: false,
        }),
        createElement(RestartDialog, { pytamRestart: false, dispatch })
      )
    );

    await escape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// Fix round 2 (2026-09-24, reviewer-found gap): the sibling tests above pin
// banner-vs-overlay. This pins overlay-vs-overlay, the case those tests
// could not reach: a popover open INSIDE the drawer, both open inside a
// persistent banner. Three layers, three separate presses.
describe("Escape closes only the topmost layer, three deep", () => {
  test("a popover inside the squad drawer inside a persistent banner: each Escape closes exactly one layer, outside-in", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const container = await mountApp();
    await clickAction(container, "losuj");
    await clickAction(container, "dalej");
    await clickAction(container, "klub:gornik-zabrze");
    await clickAction(container, "zacznij-kariere");

    mockSetItemThrows();

    // Entering the offer window is a structural change (saveFingerprint), so
    // it triggers its own writeGameSave attempt - the same failure path
    // save-failure-notice.test.tsx uses to raise the persistent warning.
    await clickAction(container, "oferty");
    expect(notification(container)).not.toBeNull();

    // Squad drawer, from the offer card, then one position's reports, then
    // one player's report expanded - the real layout the reviewer's gap was
    // about: StaffConfidenceHelp's InfoPopover only exists inside an
    // expanded report row inside SquadDrawer.
    await clickNode(container.querySelector(".dd-offer-squad-trigger"));
    await clickNode(firstTile(squadDrawer(container)));
    expect(squadDrawer(container)).not.toBeNull();
    await clickNode(firstReportRow(squadDrawer(container)));

    const popoverTrigger = squadDrawer(container)!.querySelector<HTMLButtonElement>(
      '[data-dd-action="pewnosc-objasnienie"]'
    );
    expect(popoverTrigger).not.toBeNull();
    const popoverPanel =
      popoverTrigger!.parentElement!.querySelector<HTMLElement>(".dd-info-popover-panel");

    await act(async () => {
      popoverTrigger!.focus();
    });
    expect(popoverPanel?.dataset.open).toBe("true");

    // First Escape, dispatched on the popover's own trigger - the actual
    // focused element, the real path a keypress takes (not `document`
    // directly: that would put the event straight at document's AT_TARGET
    // phase, where capture doesn't separate listeners by phase, and would
    // hide exactly the bug this test exists to catch). The popover answers
    // it in the capture phase on `document`, before the drawer's own
    // bubble-phase `document` listener - registered long before this
    // popover ever opened - gets a turn. Only the popover closes.
    await escape(popoverTrigger!);
    expect(popoverPanel?.dataset.open).toBe("false");
    expect(squadDrawer(container)).not.toBeNull();
    expect(notification(container)).not.toBeNull();

    // Second Escape, same target (still focused, still attached - the
    // popover closing only hides its panel, it does not unmount anything):
    // the popover has no listener left to answer with, so the drawer - now
    // the topmost layer - closes. The banner still stays.
    await escape(popoverTrigger!);
    expect(squadDrawer(container)).toBeNull();
    expect(notification(container)).not.toBeNull();

    // Third Escape, nothing left open but the banner.
    await escape();
    expect(notification(container)).toBeNull();
  }, 30_000);
});
