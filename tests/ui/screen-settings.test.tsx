/**
 * @vitest-environment jsdom
 */
/**
 * The start screen's "Ekran" section. Full screen: shown only where the browser lets a page fill the
 * screen; it asks for full screen and does not try to leave the browser's own (F11), which it cannot do,
 * but says how. Quitting: shown where a mouse is the pointer; it closes the window, and where the browser
 * refuses it says how to close the tab.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

import { ScreenSettings } from "../../src/ui/components/screen-settings";

const mounted: { container: HTMLElement; root: Root }[] = [];
// jsdom has no Fullscreen API and no matchMedia: each test defines what its browser has.
const defined: { target: object; key: string }[] = [];

const define = (target: object, key: string, value: unknown) => {
  Object.defineProperty(target, key, { configurable: true, value });
  defined.push({ target, key });
};

afterEach(() => {
  for (const { container, root } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted.length = 0;
  for (const { target, key } of defined) Reflect.deleteProperty(target, key);
  defined.length = 0;
});

/** A browser as given: full screen allowed or not, the browser's own full screen, a finger as pointer. */
const browser = ({ enabled = true, browserFullscreen = false, touch = false } = {}) => {
  define(document, "fullscreenEnabled", enabled);
  define(document, "fullscreenElement", null);
  define(window, "matchMedia", (query: string) => ({
    matches:
      (browserFullscreen && query === "(display-mode: fullscreen)") ||
      (touch && query === "(pointer: coarse)"),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const request = vi.fn(() => Promise.resolve());
  define(document.documentElement, "requestFullscreen", request);
  const close = vi.fn();
  define(window, "close", close);
  return { request, close };
};

const render = (): HTMLElement => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ScreenSettings />));
  mounted.push({ container, root });
  return container;
};

const toggle = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('[data-dd-action="pelny-ekran"]');

const quitButton = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('[data-dd-action="wylacz-gre"]');

test("an iPhone gets neither card, and no empty section", () => {
  browser({ enabled: false, touch: true });
  const container = render();
  expect(toggle(container)).toBeNull();
  expect(quitButton(container)).toBeNull();
  expect(container.querySelector("section")).toBeNull();
});

test("a phone or tablet with full screen gets no quit card: the system closes apps there", () => {
  browser({ touch: true });
  const container = render();
  expect(toggle(container)).not.toBeNull();
  expect(quitButton(container)).toBeNull();
});

test("quitting closes the window, and where the browser refuses it says how to close the tab", () => {
  vi.useFakeTimers();
  try {
    const { close } = browser({ enabled: false });
    const container = render();
    act(() => quitButton(container)?.click());
    expect(close).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="status"]')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const note = container.querySelector<HTMLElement>('[role="status"]');
    expect(note?.textContent).toContain("Ctrl+W");
    expect(document.activeElement).toBe(note);
  } finally {
    vi.useRealTimers();
  }
});

test("asks for full screen on a click", () => {
  const { request } = browser();
  const container = render();
  expect(toggle(container)?.getAttribute("aria-pressed")).toBe("false");
  act(() => toggle(container)?.click());
  expect(request).toHaveBeenCalledOnce();
});

test("shows the browser's own full screen as on, and says how to leave it instead of trying", () => {
  const { request } = browser({ browserFullscreen: true });
  const container = render();
  expect(toggle(container)?.getAttribute("aria-pressed")).toBe("true");
  act(() => toggle(container)?.click());
  expect(request).not.toHaveBeenCalled();
  expect(container.querySelector('[role="status"]')?.textContent).toContain("F11");
});
