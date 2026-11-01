/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SQUAD_BENCH_BUFFER } from "../../src/data/balance";
import { FORMACJE } from "../../src/data/positions";
import type { GameAction, GameState, Offer, Player } from "../../src/data/types";
import { initialState } from "../../src/logic/game-state";
import { budgetForecastMessage } from "../../src/logic/decision-messages";
import { gameReducer } from "../../src/logic/game-reducer";
import {
  forecastBudgetChange,
  OfferWindowScreen,
  pendingNotificationText,
  type PendingDecisionNotification,
} from "../../src/ui/screens/offer-window-screen";
import { pl } from "../../src/logic/format";
import { totalPayroll } from "../../src/logic/wages";
import { makeTestPlayer, quietMarket, testCareerBaseline, testClub } from "../logic/fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The confirmation that stands between accepting an offer and releasing a
 * squad member. Everything here is about a decision made under time
 * pressure: the timer keeps running underneath, so the dialog has to be
 * quick to dismiss, safe to mistype into, and unable to answer a card that
 * has already gone.
 */

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

const doomed = makeTestPlayer("doomed", {
  poz: "ŚO",
  ovr: 52,
  wiek: 35,
  nazwa: "M. Wójcik",
});

/** A squad full at ŚO whose weakest player is the one the dialog must name. */
const fullSquad = (): Player[] => [
  ...Array.from({ length: CAPACITY - 1 }, (_, i) =>
    makeTestPlayer(`safe-${i}`, { poz: "ŚO", ovr: 70, wiek: 25 })
  ),
  doomed,
];

const card = (overrides: Partial<Offer> = {}): Offer => ({
  typ: "KUPNO",
  zawodnik: makeTestPlayer("nowy", { poz: "ŚO", ovr: 78, wiek: 24, nazwa: "K. Nowy" }),
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

const stateWith = (squad: Player[], offer: Offer): GameState => ({
  ...initialState(),
  faza: "okno",
  club: testClub,
  careerBaseline: testCareerBaseline,
  kadra: squad,
  kasa: 100,
  rynek: quietMarket,
  ruchy: 2,
  karta: offer,
});

const render = async (
  state: GameState
): Promise<{
  container: HTMLDivElement;
  actions: GameAction[];
  pending: PendingDecisionNotification[];
  notices: string[];
  rerender: (_next: GameState) => Promise<void>;
}> => {
  const actions: GameAction[] = [];
  const pending: PendingDecisionNotification[] = [];
  const notices: string[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  const draw = (current: GameState) =>
    createElement(OfferWindowScreen, {
      state: current,
      dispatch: (action: GameAction) => actions.push(action),
      onNotify: (text: string) => notices.push(text),
      onDecisionPending: (entry: PendingDecisionNotification) => pending.push(entry),
    });
  await act(async () => root.render(draw(state)));
  return {
    container,
    actions,
    pending,
    notices,
    rerender: async (next: GameState) => {
      await act(async () => root.render(draw(next)));
    },
  };
};

const runAll = (state: GameState, actions: readonly GameAction[]): GameState =>
  actions.reduce((current: GameState, action) => gameReducer(current, action), state);

/** What app.tsx shows once the reducer has run the dispatched decision. */
const announce = (
  state: GameState,
  actions: readonly GameAction[],
  pending: PendingDecisionNotification
): string => pendingNotificationText(pending, runAll(state, actions));

const button = (container: HTMLElement, action: string): HTMLButtonElement | null =>
  container.querySelector<HTMLButtonElement>(`[data-dd-action="${action}"]`);

const click = async (element: HTMLElement): Promise<void> => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("squad eviction confirmation", () => {
  test("a signing with room dispatches straight away, with no dialog", async () => {
    // One short of the cap, so nobody is released.
    const squad = fullSquad().slice(0, CAPACITY - 1);
    const { container, actions } = await render(stateWith(squad, card()));

    await click(button(container, "bierz")!);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(actions).toEqual([{ type: "DECIDE", choice: "take" }]);
  });

  test("a signing that releases someone opens the dialog instead of deciding", async () => {
    const { container, actions } = await render(stateWith(fullSquad(), card()));

    await click(button(container, "bierz")!);

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(actions).toEqual([]);
    // Both sides of the transfer, including the visible facts that distinguish
    // the two players. A dialog that names only the release leaves the player
    // guessing whether the signing still goes through.
    expect(dialog!.textContent).toContain("ŚO");
    expect(dialog!.textContent).toContain("K. Nowy");
    expect(dialog!.textContent).toContain("78 OVR");
    expect(dialog!.textContent).toContain("M. Wójcik");
    expect(dialog!.textContent).toContain("52 OVR");
    expect(dialog!.textContent).toContain("35 lat");
  });

  test("the dialog follows the offer-card information hierarchy", async () => {
    const { container } = await render(stateWith(fullSquad(), card()));

    await click(button(container, "bierz")!);

    expect(container.querySelector(".dd-eviction-kicker")?.textContent).toBe("Liczebność kadry");
    expect(container.querySelector(".dd-eviction-content")).not.toBeNull();
    expect(container.querySelector(".dd-eviction-title")?.textContent).toBe(
      "Limit zawodników na ŚO został osiągnięty"
    );
    expect(container.querySelector(".dd-eviction-intro")?.textContent).toBe(
      "W celu finalizacji transferu musielibyśmy zwolnić jednego zawodnika:"
    );
    expect(container.querySelector(".dd-eviction-arrival")?.textContent).toBe(
      "DołączyK. Nowy (78 OVR, 24 lata)"
    );
    expect(container.querySelector(".dd-eviction-departure")?.textContent).toBe(
      "OdejdzieM. Wójcik (52 OVR, 35 lat)"
    );
    expect(container.querySelector(".dd-eviction-question")?.textContent).toBe(
      "Czy chcesz kontynuować?"
    );
    expect(button(container, "eksmisja-kontynuuj")?.textContent).toBe("Potwierdź transfer");
  });

  test("haggling uses the same consequence summary before the roll", async () => {
    const { container, actions } = await render(stateWith(fullSquad(), card()));

    await click(button(container, "targ")!);

    expect(actions).toEqual([]);
    expect(container.querySelector(".dd-eviction-intro")?.textContent).toBe(
      "W celu finalizacji transferu musielibyśmy zwolnić jednego zawodnika:"
    );
    expect(button(container, "eksmisja-kontynuuj")?.textContent).toBe("Rozpocznij negocjacje");
  });

  test("confirming sends the validated action with both ids", async () => {
    const { container, actions } = await render(stateWith(fullSquad(), card()));

    await click(button(container, "bierz")!);
    await click(button(container, "eksmisja-kontynuuj")!);

    expect(actions).toEqual([
      {
        type: "CONFIRM_SQUAD_EVICTION",
        choice: "take",
        offerPlayerId: "nowy",
        evictedPlayerId: "doomed",
      },
    ]);
  });

  test("a confirmed haggle carries the haggle choice", async () => {
    const { container, actions } = await render(stateWith(fullSquad(), card()));

    await click(button(container, "targ")!);
    await click(button(container, "eksmisja-kontynuuj")!);

    expect(actions).toEqual([
      {
        type: "CONFIRM_SQUAD_EVICTION",
        choice: "haggle",
        offerPlayerId: "nowy",
        evictedPlayerId: "doomed",
      },
    ]);
  });

  test("cancelling costs nothing and returns focus to the button that opened it", async () => {
    const { container, actions } = await render(stateWith(fullSquad(), card()));
    const take = button(container, "bierz")!;

    // A real click focuses the button first; jsdom's dispatchEvent does not,
    // and the restore is only meaningful for someone who got here by
    // keyboard anyway.
    take.focus();
    await click(take);
    await click(button(container, "eksmisja-anuluj")!);

    expect(actions).toEqual([]);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(button(container, "bierz"));
  });

  test("the safe choice holds focus when the dialog opens", async () => {
    const { container } = await render(stateWith(fullSquad(), card()));

    await click(button(container, "bierz")!);

    expect(document.activeElement).toBe(button(container, "eksmisja-anuluj"));
  });

  test("Escape cancels", async () => {
    const { container, actions } = await render(stateWith(fullSquad(), card()));

    await click(button(container, "bierz")!);
    await act(async () => {
      container
        .querySelector('[role="dialog"]')!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(actions).toEqual([]);
  });

  test("Escape cancels even after focus leaves the overlay", async () => {
    const { container, actions } = await render(stateWith(fullSquad(), card()));

    await click(button(container, "bierz")!);
    document.body.tabIndex = -1;
    document.body.focus();
    expect(document.activeElement).toBe(document.body);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(actions).toEqual([]);
  });

  test("Tab returns outside focus to the safe choice", async () => {
    const { container } = await render(stateWith(fullSquad(), card()));

    await click(button(container, "bierz")!);
    document.body.tabIndex = -1;
    document.body.focus();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });

    expect(document.activeElement).toBe(button(container, "eksmisja-anuluj"));
  });

  test("Shift+Tab returns outside focus to the last dialog control", async () => {
    const { container } = await render(stateWith(fullSquad(), card()));

    await click(button(container, "bierz")!);
    document.body.tabIndex = -1;
    document.body.focus();

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })
      );
    });

    expect(document.activeElement).toBe(button(container, "eksmisja-kontynuuj"));
  });

  test("Tab wraps between the two buttons and never leaves the dialog", async () => {
    const { container } = await render(stateWith(fullSquad(), card()));
    await click(button(container, "bierz")!);

    const cancel = button(container, "eksmisja-anuluj")!;
    const confirm = button(container, "eksmisja-kontynuuj")!;

    // Forward from the last control wraps to the first.
    confirm.focus();
    await act(async () => {
      confirm.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(cancel);

    // Backward from the first wraps to the last.
    await act(async () => {
      cancel.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })
      );
    });
    expect(document.activeElement).toBe(confirm);
  });

  test("a sale never asks, however full the position is", async () => {
    const squad = fullSquad();
    const { container, actions } = await render(
      stateWith(
        squad,
        card({
          typ: "SPRZEDAZ",
          zawodnik: squad[0],
          cena: 5,
          buyer: { clubId: "lech-poznan", name: "Lech", origin: "domestic" },
        })
      )
    );

    await click(button(container, "bierz")!);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(actions).toEqual([{ type: "DECIDE", choice: "take" }]);
  });

  test("an extension never asks, however full the position is", async () => {
    const squad = fullSquad();
    const { container, actions } = await render(
      stateWith(squad, card({ typ: "PRZEDLUZENIE", zawodnik: squad[0], cena: 1 }))
    );

    await click(button(container, "bierz")!);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(actions).toEqual([{ type: "DECIDE", choice: "take" }]);
  });

  test("a new card closes the dialog, so a late click cannot answer it", async () => {
    const { container, actions, rerender } = await render(stateWith(fullSquad(), card()));
    await click(button(container, "bierz")!);
    const dialog = container.querySelector('[role="dialog"]')!;
    const transientPlayerNames: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") {
          transientPlayerNames.push(record.target.textContent ?? "");
        }
      }
    });
    observer.observe(dialog, { subtree: true, characterData: true });

    // The timer expired the offer and the reducer dealt the next one.
    await rerender(
      stateWith(
        fullSquad(),
        card({
          zawodnik: makeTestPlayer("inny", {
            poz: "ŚO",
            ovr: 77,
            nazwa: "T. Następny",
          }),
        })
      )
    );
    observer.disconnect();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(transientPlayerNames).not.toContain("T. Następny (77 OVR, 24 lata)");
    expect(actions).toEqual([]);
  });

  test("opening the dialog neither stalls nor touches the clock", async () => {
    const state = stateWith(fullSquad(), card());
    const { container, actions } = await render(state);

    await click(button(container, "bierz")!);

    // No STALL, no decision - the countdown in the reducer is untouched.
    expect(actions).toEqual([]);
  });

  test("the page behind the dialog cannot scroll, and can again once it closes", async () => {
    // The offer card is what the question is about; letting it scroll away
    // behind the overlay loses the context.
    const { container } = await render(stateWith(fullSquad(), card()));
    expect(document.documentElement.style.overflow).not.toBe("hidden");

    await click(button(container, "bierz")!);
    // Both elements: documentElement is the scrolling one, and body is taken
    // out of flow for iOS. See useScrollLock.
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");

    await click(button(container, "eksmisja-anuluj")!);
    expect(document.documentElement.style.overflow).not.toBe("hidden");
    expect(document.body.style.position).not.toBe("fixed");
  });

  test("a card replaced under the dialog still releases the scroll lock", async () => {
    // The dialog can vanish without anyone clicking it - the timer expires the
    // offer and the reducer deals the next one. The lock must not outlive it.
    const { container, rerender } = await render(stateWith(fullSquad(), card()));
    await click(button(container, "bierz")!);
    expect(document.documentElement.style.overflow).toBe("hidden");

    await rerender(
      stateWith(fullSquad(), card({ zawodnik: makeTestPlayer("inny", { poz: "ŚO", ovr: 77 }) }))
    );

    expect(document.documentElement.style.overflow).not.toBe("hidden");
    expect(document.body.style.position).not.toBe("fixed");
  });

  test("a confirmed take arms the notification against that exact decision", async () => {
    // This identity is the whole defence against the timer-versus-dialog
    // race: the countdown keeps running underneath and can expire this offer
    // and deal the next one in one pass, so app.tsx only fires the
    // notification once decisionIndex has moved AND the recorded token
    // matches. A pending carrying only a kind could not tell the two apart.
    const state = stateWith(fullSquad(), card());
    const { container, pending, notices } = await render(state);

    await click(button(container, "bierz")!);
    // Nothing announced yet - the reducer has not accepted anything.
    expect(notices).toEqual([]);

    await click(button(container, "eksmisja-kontynuuj")!);

    expect(pending).toHaveLength(1);
    expect(pending[0]!.expectedToken).toBe("BIERZ");
    expect(pending[0]!.offerPlayerId).toBe("nowy");
    expect(pending[0]!.baseDecisionIndex).toBe(state.decisionIndex);
    // Still not announced directly: it waits for the reducer.
    expect(notices).toEqual([]);
  });

  test("a confirmed take announces the purchase and the release together", async () => {
    const state = stateWith(fullSquad(), card());
    const { container, actions, pending } = await render(state);

    await click(button(container, "bierz")!);
    await click(button(container, "eksmisja-kontynuuj")!);

    // One message, both facts, both the reducer's own words.
    const text = announce(state, actions, pending[0]!);
    expect(text).toContain("Kupiłeś K. Nowy (78 OVR, 24 lata) za ");
    expect(text).toContain("Brak miejsca na ŚO – kontrakt rozwiązany: M. Wójcik (52 OVR, 35 lat).");
  });

  test("a confirmed haggle is armed with the haggle token", async () => {
    const { container, pending } = await render(stateWith(fullSquad(), card()));

    await click(button(container, "targ")!);
    await click(button(container, "eksmisja-kontynuuj")!);

    expect(pending[0]!.expectedToken).toBe("TARG");
  });

  test("the budget sentence is net of the released player", async () => {
    // The club pays one more and one fewer, so the forecast is read from the
    // squad the reducer actually left - never from the arrival alone.
    const state = stateWith(fullSquad(), card());
    const { container, actions, pending } = await render(state);

    await click(button(container, "bierz")!);
    await click(button(container, "eksmisja-kontynuuj")!);

    const after = runAll(state, actions);
    const expected = budgetForecastMessage(
      forecastBudgetChange(state),
      forecastBudgetChange(after)
    );
    expect(expected).not.toBeNull();
    expect(announce(state, actions, pending[0]!).endsWith(` ${expected!}`)).toBe(true);
  });

  test("the card's after-figures describe the squad the reducer will leave", async () => {
    // Total wages after, and the forecast built on them, used to count both
    // players: the arrival was added but the released man was never taken
    // away, so the card described a squad one player larger than the engine
    // would actually produce.
    const squad = fullSquad();
    const { container } = await render(stateWith(squad, card()));

    const signed = { ...card().zawodnik, mnoznikPlacy: 1 };
    const expected = pl(totalPayroll([...squad.filter((p) => p.id !== doomed.id), signed]));
    const withoutEviction = pl(totalPayroll([...squad, signed]));
    // Compared as the rendered string, and only after checking the two
    // actually differ once formatted: the gap is one reserve's wage, small
    // enough that a loose numeric tolerance would pass either way - which is
    // exactly how the first version of this test managed to prove nothing.
    expect(expected).not.toBe(withoutEviction);

    expect(container.querySelector(".dd-offer-effects div:nth-child(2) strong")?.textContent).toBe(
      expected
    );
  });

  test("the dialog names nothing hidden", async () => {
    const incomingWithDistinctCeiling = card({
      zawodnik: { ...card().zawodnik, sufit: 92 },
    });
    const { container } = await render(
      stateWith(
        fullSquad().map((player) => ({ ...player, sufit: 91 })),
        incomingWithDistinctCeiling
      )
    );
    await click(button(container, "bierz")!);
    const dialog = container.querySelector('[role="dialog"]')!;

    // The ceiling of every squad member here is 91; it must appear nowhere -
    // nor may the incoming player's distinct 92. Not in the copy, not in an
    // aria attribute, not in a data attribute.
    expect(dialog.outerHTML).not.toContain("91");
    expect(dialog.outerHTML).not.toContain("92");
    expect(dialog.outerHTML).not.toMatch(/sufit|ceiling|outlook|edge/i);
  });
});

describe("decision notifications repeat the log line", () => {
  test("a sale is announced once the reducer has rolled the academy refill", async () => {
    const squad = fullSquad();
    const sold = squad[0]!;
    const sale = card({
      typ: "SPRZEDAZ",
      zawodnik: { ...sold, moj: true },
      buyer: { clubId: "lech-poznan", name: "Lech", origin: "domestic" },
    });
    const state = stateWith(squad, sale);
    const { container, actions, pending, notices } = await render(state);

    await click(button(container, "bierz")!);

    // Nothing up front: the debutant does not exist until the reducer runs.
    expect(notices).toEqual([]);
    const after = runAll(state, actions);
    const text = announce(state, actions, pending[0]!);
    expect(text.startsWith(after.log[0]!)).toBe(true);
    expect(text).toContain(`Sprzedałeś ${sold.nazwa} (`);
    expect(text).toContain(" do klubu Lech za ");
  });

  test("a pass is announced as the log line alone, the budget being unchanged", async () => {
    const state = stateWith(fullSquad(), card());
    const { container, actions, pending } = await render(state);

    await click(button(container, "pas")!);

    expect(pending[0]!.expectedToken).toBe("PAS");
    expect(pending[0]!.kind).toBe("neutral");
    const after = runAll(state, actions);
    expect(announce(state, actions, pending[0]!)).toBe(after.log[0]);
    expect(after.log[0]).toMatch(/^Odrzuciłeś ofertę: K\. Nowy \(78 OVR, 24 lata\) za /);
  });

  test("a stalled purchase names both the higher fee and the higher wage", async () => {
    const { container, notices } = await render(stateWith(fullSquad(), card()));

    await click(button(container, "czas")!);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatch(
      /^Przeciągnąłeś negocjacje: K\. Nowy \(78 OVR, 24 lata\)\. Kwota wzrosła do .+, płaca wzrosła do .+\/rok\.$/
    );
  });
});
