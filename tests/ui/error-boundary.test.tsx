/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ErrorBoundary } from "../../src/ui/components/error-boundary";
import { GAME_SAVE_STORAGE_KEY } from "../../src/ui/game-save";
import { SETUP_DRAFT_STORAGE_KEY } from "../../src/ui/setup-draft";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

const silenceWindowError = (event: ErrorEvent): void => event.preventDefault();

afterEach(() => {
  window.removeEventListener("error", silenceWindowError);
  if (mounted) {
    const { container, root } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = undefined;
  }
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const Boom = (): never => {
  throw new Error("render failed");
};

const render = (child: ReturnType<typeof createElement>, onReload = vi.fn()) => {
  // React reports every caught render error through console.error; that is
  // the expected path here, not noise worth printing.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  // jsdom also reports it as an uncaught window error with a full stack.
  window.addEventListener("error", silenceWindowError);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(createElement(ErrorBoundary, { onReload }, child)));
  mounted = { container, root };
  return { container, onReload };
};

const button = (container: HTMLElement, label: string): HTMLButtonElement => {
  const found = [...container.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!found) throw new Error(`button "${label}" not found`);
  return found;
};

describe("ErrorBoundary", () => {
  test("renders its children when nothing fails", () => {
    const { container } = render(createElement("p", null, "gra"));
    expect(container.textContent).toBe("gra");
  });

  test("replaces a crashed render with a Polish message instead of a blank page", () => {
    const { container } = render(createElement(Boom));
    expect(container.querySelector("h1")?.textContent).toBe("Coś poszło nie tak");
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  test("reload keeps the save", () => {
    window.localStorage.setItem(GAME_SAVE_STORAGE_KEY, "{}");
    const { container, onReload } = render(createElement(Boom));

    act(() => button(container, "Wczytaj ponownie").click());

    expect(onReload).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBe("{}");
  });

  test("discarding clears the save and the setup draft, then reloads", () => {
    window.localStorage.setItem(GAME_SAVE_STORAGE_KEY, "{}");
    window.localStorage.setItem(SETUP_DRAFT_STORAGE_KEY, "{}");
    const { container, onReload } = render(createElement(Boom));

    act(() => button(container, "Porzuć zapis i zacznij od nowa").click());

    expect(window.localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(SETUP_DRAFT_STORAGE_KEY)).toBeNull();
    expect(onReload).toHaveBeenCalledOnce();
  });
});
