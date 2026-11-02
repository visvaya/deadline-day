/**
 * @vitest-environment jsdom
 */
/**
 * The full screen toggle: shown only where the browser lets a page fill the screen, it asks for full
 * screen and leaves it, and it does not try to leave the browser's own full screen (F11), which it
 * cannot do; it says how instead.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";

import { FullscreenToggle } from "../../src/ui/components/fullscreen-toggle";

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

/** A browser that allows full screen, with the page's own full screen off and the browser's as given. */
const browser = ({ enabled = true, browserFullscreen = false } = {}) => {
  define(document, "fullscreenEnabled", enabled);
  define(document, "fullscreenElement", null);
  define(window, "matchMedia", (query: string) => ({
    matches: browserFullscreen && query === "(display-mode: fullscreen)",
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const request = vi.fn(() => Promise.resolve());
  define(document.documentElement, "requestFullscreen", request);
  return { request };
};

const render = (): HTMLElement => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<FullscreenToggle />));
  mounted.push({ container, root });
  return container;
};

const toggle = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('[data-dd-action="pelny-ekran"]');

test("is not shown where the browser offers pages no full screen (iPhone Safari)", () => {
  browser({ enabled: false });
  expect(toggle(render())).toBeNull();
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
