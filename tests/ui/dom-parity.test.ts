/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { playHeadless } from "../golden/headless";
import { App } from "../../src/ui/app";

/**
 * Proves the UI dispatches the RIGHT action from the RIGHT button - the one
 * bug class a rewrite of ~650 lines of JSX can introduce that the headless
 * golden tests cannot catch, since they never touch a button.
 *
 * Method: drive the real DOM, recording the action token behind every click
 * on a card decision, then replay exactly those tokens through the pure
 * reducer and compare the legacy screens. No shared choice policy exists to
 * drift - the DOM decides, the reducer replays what the DOM claims it did.
 * So if `bierz` were wired to dispatch a pass, the DOM would play a pass
 * while the replay of "BIERZ" plays a purchase, and the legacies diverge.
 *
 * The seed comes from a pinned crypto.getRandomValues - the one legitimate
 * external seam, since production code carries no debug channel. The manager
 * identity is randomised through the "losuj" control: nothing under
 * comparison depends on which valid name comes back, only the club and the
 * card decisions do.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Choice = "czas" | "targ" | "bierz" | "pas";

const withFixedSeed = async <T>(seed: number, fn: () => Promise<T>): Promise<T> => {
  const spy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((buffer) => {
    (buffer as Uint32Array)[0] = seed;
    return buffer;
  });
  try {
    return await fn();
  } finally {
    spy.mockRestore();
  }
};

const enabled = (container: HTMLElement, action: string): Element | null =>
  container.querySelector(`[data-dd-action="${action}"]:not([disabled])`);

const click = async (container: HTMLElement, action: string): Promise<void> => {
  const el = enabled(container, action);
  if (!el) throw new Error(`No enabled control for action "${action}"`);
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

/** Rotates through every decision control so each one is actually exercised. */
const pickChoice = (container: HTMLElement, turn: number): Choice => {
  const slot = turn % 4;
  if (slot === 0 && enabled(container, "czas")) return "czas";
  if (slot === 0 || slot === 1) return "targ";
  if (slot === 2 && enabled(container, "bierz")) return "bierz";
  return "pas";
};

const playDomRecording = async (
  container: HTMLElement,
  clubId: string
): Promise<{ tokens: string[]; dziedzictwo: string; tytul: string }> => {
  // Step 1/2: manager. A randomised identity is always valid, and nothing
  // under comparison reads it back.
  await click(container, "losuj");
  await click(container, "dalej");
  // Step 2/2: club.
  await click(container, `klub:${clubId}`);
  await click(container, "zacznij-kariere");

  const tokens: string[] = [];
  let turn = 0;

  for (let guard = 0; guard < 5000; guard += 1) {
    if (container.querySelector('[data-dd-action="znowu"]')) break;
    // Checked before the card controls: the confirmation sits over the offer,
    // so "pas" is still in the DOM underneath it. Clicking through means
    // finishing the decision that is already half-made, which is why this
    // neither advances `turn` nor pushes a token - BIERZ or TARG was recorded
    // when the button under the overlay was clicked. The replay vocabulary is
    // unchanged, so headless walks the same single token through the same
    // validated reducer action.
    if (enabled(container, "eksmisja-kontynuuj")) {
      await click(container, "eksmisja-kontynuuj");
    } else if (enabled(container, "oferty")) {
      await click(container, "oferty");
    } else if (enabled(container, "epilog")) {
      await click(container, "epilog");
    } else if (enabled(container, "pas")) {
      // "pas" is only ever on screen together with the other card controls.
      const choice = pickChoice(container, turn);
      turn += 1;
      tokens.push(choice === "bierz" ? "BIERZ" : choice.toUpperCase());
      await click(container, choice);
    } else if (enabled(container, "dalej")) {
      await click(container, "dalej");
    } else {
      throw new Error("dom-parity driver stuck: no known control present");
    }
  }

  return {
    tokens,
    dziedzictwo: container.querySelector(".dd-legacy-points")?.textContent ?? "",
    tytul: container.querySelector(".dd-legacy-score h3")?.textContent ?? "",
  };
};

describe.each<{ clubId: string; seed: number; expectBuy: boolean }>([
  { clubId: "legia-warszawa", seed: 0x2000_0001, expectBuy: true },
  { clubId: "wieczysta-krakow", seed: 0x2000_0002, expectBuy: false },
])("dom parity - $clubId", ({ clubId, seed, expectBuy }) => {
  beforeEach(() => {
    // App now hydrates from a saved career on mount (game-save.ts), so a
    // leftover save from another test in this describe.each would skip the
    // start screen this driver depends on - clear the whole store, not just
    // the archive key.
    window.localStorage.clear();
  });

  test("every decision button dispatches what the reducer replays", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root | undefined;

    try {
      const dom = await withFixedSeed(seed, async () => {
        await act(async () => {
          root = createRoot(container);
          root.render(createElement(App));
        });
        return playDomRecording(container, clubId);
      });

      // Guard against a vacuous pass: the rotation must really have reached
      // the stall, haggle and pass controls (and the buy control where the
      // club can afford anything).
      const used = new Set(dom.tokens);
      expect(used.has("CZAS")).toBe(true);
      expect(used.has("TARG")).toBe(true);
      expect(used.has("PAS")).toBe(true);
      if (expectBuy) expect(used.has("BIERZ")).toBe(true);

      // The leading replay entry is dropped by the headless driver (it is
      // already consumed by the START_CAREER dispatch above it) - `clubId`
      // is used as a readable placeholder, not a meaningful value.
      const headless = playHeadless({
        seed,
        clubId,
        replay: [clubId, ...dom.tokens],
      });

      expect(headless.state.finalne).toBeTruthy();
      expect(dom.dziedzictwo).toBe(String(headless.state.finalne!.dziedzictwo));
      expect(dom.tytul).toBe(headless.state.finalne!.tytul);
      // The reducer's own action log must match what the DOM recorded.
      expect(headless.akcje).toEqual(dom.tokens);
    } finally {
      if (root) await act(async () => root!.unmount());
      container.remove();
      vi.useRealTimers();
    }
  }, 30_000);
});
