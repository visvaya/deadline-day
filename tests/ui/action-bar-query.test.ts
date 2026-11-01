/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ACTION_BAR_COMPACT_QUERY,
  resolveActionBarMode,
  useIsActionBarCompactViewport,
  viewportDefaultActionBarMode,
} from "../../src/ui/action-bar-query";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

afterEach(async () => {
  if (mounted) {
    await act(async () => mounted?.root.unmount());
    mounted.container.remove();
    mounted = undefined;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ACTION_BAR_COMPACT_QUERY", () => {
  test("gates on narrow OR short, not just narrow", () => {
    // The layout breakpoint (styles.css `min-width: 768px`) stays width-only
    // per the owner's decision - only this query, which drives auto-hide and
    // its setting, also reacts to height.
    expect(ACTION_BAR_COMPACT_QUERY).toBe("(max-width: 767px), (max-height: 600px)");
  });
});

/** Mounts a tiny host component so the hook runs through a real render/commit
 * cycle, the same way `useScrollAwareBar` (sticky-action-bar.tsx) is
 * exercised indirectly through `prepareScrollAwareActionBar` in
 * common-components.test.ts - there is no hooks-testing library in this
 * project's dependencies. */
const mountHook = async (
  matches: boolean,
  mediaListeners?: Map<string, (_event: MediaQueryListEvent) => void>
): Promise<{ container: HTMLDivElement; readLatest: () => string }> => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === ACTION_BAR_COMPACT_QUERY && matches,
      addEventListener: vi.fn(
        (eventName: string, listener: (_event: MediaQueryListEvent) => void) => {
          if (eventName === "change") mediaListeners?.set(query, listener);
        }
      ),
      removeEventListener: vi.fn(),
    }))
  );

  const Host = (): ReturnType<typeof createElement> => {
    const isCompact = useIsActionBarCompactViewport();
    return createElement("div", { "data-compact": String(isCompact) });
  };

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => root.render(createElement(Host)));

  return {
    container,
    readLatest: () => container.querySelector("[data-compact]")!.getAttribute("data-compact")!,
  };
};

describe("viewportDefaultActionBarMode", () => {
  test("defaults to autoHide on a compact (narrow-or-short) viewport", () => {
    expect(viewportDefaultActionBarMode(true)).toBe("autoHide");
  });

  test("defaults to alwaysVisible everywhere else (desktop)", () => {
    expect(viewportDefaultActionBarMode(false)).toBe("alwaysVisible");
  });
});

describe("resolveActionBarMode", () => {
  test("an explicit choice always wins, regardless of viewport", () => {
    expect(resolveActionBarMode("alwaysVisible", true)).toBe("alwaysVisible");
    expect(resolveActionBarMode("autoHide", false)).toBe("autoHide");
  });

  test("falls back to the live viewport default when unset", () => {
    expect(resolveActionBarMode(undefined, true)).toBe("autoHide");
    expect(resolveActionBarMode(undefined, false)).toBe("alwaysVisible");
  });
});

describe("useIsActionBarCompactViewport", () => {
  test("reads the initial match synchronously", async () => {
    const { readLatest } = await mountHook(true);
    expect(readLatest()).toBe("true");
  });

  test("defaults to false when the query does not match", async () => {
    const { readLatest } = await mountHook(false);
    expect(readLatest()).toBe("false");
  });

  test("reacts to a later change event (e.g. rotating a phone to landscape)", async () => {
    const mediaListeners = new Map<string, (_event: MediaQueryListEvent) => void>();
    const { readLatest } = await mountHook(false, mediaListeners);
    expect(readLatest()).toBe("false");

    const listener = mediaListeners.get(ACTION_BAR_COMPACT_QUERY);
    expect(listener).toBeDefined();
    await act(async () => listener?.({ matches: true } as MediaQueryListEvent));

    expect(readLatest()).toBe("true");
  });
});
