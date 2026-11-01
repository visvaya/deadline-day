/**
 * @vitest-environment jsdom
 *
 * WCAG 2.4.3/2.4.11: a decision that moves the offer window on to its next
 * card never changes `faza` ("okno" the whole window through), so app.tsx's
 * own heading-focus effect - which only fires on a `faza` change - never
 * gets a chance to notice or fix anything on this boundary. Two real
 * browsers (not jsdom) can strand focus on <body> exactly here: a focused
 * action button that becomes `disabled` on the new card is blurred
 * straight to <body> by the browser itself (see tests/e2e/focus-
 * invariants.spec.ts, "okno: bierz: focus fell to <body>"), and
 * SquadEvictionDialog's own unmount cleanup restores focus to whatever
 * opened it, which can by then be exactly that disabled button.
 *
 * jsdom does not replicate a browser's auto-blur-on-disable (verified
 * separately: disabling a focused jsdom button leaves it focused), so these
 * tests set the precondition explicitly - document.activeElement already on
 * <body> by the time the next card commits - rather than trying to trigger
 * it through jsdom's disabled-attribute handling. That models the one fact
 * that actually matters to offer-window-screen.tsx's recovery effect ("focus
 * is unusable right after a decision resolved"), independent of which real-
 * browser mechanism put it there; the mechanism itself is covered end-to-end
 * by the Playwright spec.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SQUAD_BENCH_BUFFER } from "../../src/data/balance";
import { FORMACJE } from "../../src/data/positions";
import type { GameState, Offer, Player } from "../../src/data/types";
import { initialState } from "../../src/logic/game-state";
import { OfferWindowScreen } from "../../src/ui/screens/offer-window-screen";
import { makeTestPlayer, quietMarket, testClub } from "../logic/fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

afterEach(() => {
  if (mounted) {
    const { container, root } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = undefined;
  }
  document.body.removeAttribute("tabindex");
  vi.restoreAllMocks();
});

const FORMATION = FORMACJE["4-3-3"];
const CAPACITY = FORMATION.pozycje.find((slot) => slot.kod === "ŚO")!.kadra + SQUAD_BENCH_BUFFER;

const squad = (): Player[] =>
  Array.from({ length: CAPACITY - 1 }, (_, i) =>
    makeTestPlayer(`safe-${i}`, { poz: "ŚO", ovr: 70, wiek: 25 })
  );

const card = (id: string, overrides: Partial<Offer> = {}): Offer => ({
  typ: "KUPNO",
  zawodnik: makeTestPlayer(id, { poz: "ŚO", ovr: 78, wiek: 24, nazwa: `Card ${id}` }),
  cena: 0.5,
  sourceClub: null,
  buyer: null,
  staffAssessment: {
    source: "scout",
    focus: "potential",
    outlook: "leagueLevel",
    confidence: "medium",
    isFirstObservation: true,
  },
  analystReport: {
    metrics: [
      { metricId: "goalsPreventedPer90", percentile: 50, value: 0 },
      { metricId: "positioningErrorAverage", percentile: 50, value: 2.06 },
    ],
    minutes: 900,
    sampleTier: "medium",
    period: { season: 1, window: "summer" },
    contextTier: "mid",
  },
  ...overrides,
});

const stateWith = (offer: Offer, extra: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  faza: "okno",
  club: testClub,
  kadra: squad(),
  kasa: 100,
  rynek: quietMarket,
  ruchy: 2,
  karta: offer,
  decisionIndex: 0,
  ...extra,
});

const render = async (
  state: GameState
): Promise<{
  container: HTMLDivElement;
  rerender: (_next: GameState) => Promise<void>;
}> => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  const draw = (current: GameState) =>
    createElement(OfferWindowScreen, {
      state: current,
      dispatch: () => {},
      onNotify: () => {},
      onDecisionPending: () => {},
    });
  await act(async () => root.render(draw(state)));
  return {
    container,
    rerender: async (next: GameState) => {
      await act(async () => root.render(draw(next)));
    },
  };
};

const button = (container: HTMLElement, action: string): HTMLButtonElement | null =>
  container.querySelector<HTMLButtonElement>(`[data-dd-action="${action}"]`);

/** Puts focus on <body> right now - modelling a browser having already
 * blurred an about-to-be-stale control there, before the next card's render
 * (and this screen's recovery effect) runs. */
const simulateBrowserLostFocus = (): void => {
  document.body.tabIndex = -1;
  document.body.focus();
};

describe("offer window: focus recovery across a same-window card change", () => {
  test("moves focus off <body> onto the action bar once a decision resolves into a new card", async () => {
    const { container, rerender } = await render(stateWith(card("a")));
    button(container, "bierz")!.focus();
    expect(document.activeElement).toBe(button(container, "bierz"));

    await act(async () => {
      simulateBrowserLostFocus();
      await rerender(stateWith(card("b"), { decisionIndex: 1 }));
    });

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).not.toBeNull();
    expect(document.activeElement).toBe(button(container, "bierz"));
  });

  test("falls back to the first enabled control when the take button itself is disabled on the new card", async () => {
    // kasa below the new card's price - "bierz" is disabled on arrival, so
    // the fallback must skip it and land on "targ" instead.
    const { container, rerender } = await render(stateWith(card("a")));
    button(container, "bierz")!.focus();

    await act(async () => {
      simulateBrowserLostFocus();
      await rerender(stateWith(card("b", { cena: 500 }), { decisionIndex: 1, kasa: 1 }));
    });

    expect(button(container, "bierz")!.disabled).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(button(container, "targ"));
  });

  test("falls back to the screen heading when every action-bar control is disabled", async () => {
    // No card disables all of them today ("pas" always stays enabled), so
    // the state alone cannot produce this. The buttons are disabled by hand
    // instead: React only rewrites a DOM attribute whose prop changed, so on
    // a rerender where `disabled` stays false for each of them, the manual
    // attribute survives into the recovery effect. The heading normally
    // comes from app.tsx's header, outside this screen, so it is added here.
    const heading = document.createElement("h1");
    heading.tabIndex = -1;
    heading.textContent = "Klub";
    document.body.prepend(heading);
    try {
      const { container, rerender } = await render(stateWith(card("a")));
      button(container, "bierz")!.focus();

      await act(async () => {
        container
          .querySelectorAll<HTMLButtonElement>(".dd-action-bar button")
          .forEach((control) => {
            control.disabled = true;
          });
        simulateBrowserLostFocus();
        await rerender(stateWith(card("b"), { decisionIndex: 1 }));
      });

      expect(document.activeElement).toBe(heading);
    } finally {
      heading.remove();
    }
  });

  test("leaves focus alone when the previously focused button is still there and enabled", async () => {
    const { container, rerender } = await render(stateWith(card("a")));
    button(container, "pas")!.focus();

    await rerender(stateWith(card("b"), { decisionIndex: 1 }));

    // Same DOM node, untouched - no fallback ran because none was needed.
    expect(document.activeElement).toBe(button(container, "pas"));
  });

  test("does nothing on a render where no decision resolved (e.g. a stall)", async () => {
    const { container, rerender } = await render(stateWith(card("a")));
    button(container, "czas")!.focus();

    await act(async () => {
      simulateBrowserLostFocus();
      // Same decisionIndex and same card identity: STALL changes neither.
      await rerender(stateWith(card("a")));
    });

    // The effect must not have run at all - focus stays exactly where this
    // test put it (on <body>), because nothing here signalled a resolved
    // decision worth reacting to.
    expect(document.activeElement).toBe(document.body);
  });
});
