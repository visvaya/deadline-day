/**
 * @vitest-environment jsdom
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { Offer, Player } from "../../src/data/types";
import { FORMACJE } from "../../src/data/positions";
import { ACTION_BAR_COMPACT_QUERY } from "../../src/ui/action-bar-query";
import { App } from "../../src/ui/app";
import { marketLabel, OfferCard } from "../../src/ui/components/offer-card";
import { keyedTransferLog } from "../../src/ui/components/transfer-log";
import { viewportCorrectionOffset } from "../../src/ui/components/sticky-action-bar";
import { DragScroller } from "../../src/ui/components/drag-scroller";
import { Tile } from "../../src/ui/components/tile";
import type { SeasonChangePeriod } from "../../src/ui/components/player-tile-utils";
import { UI_PREFERENCES_STORAGE_KEY } from "../../src/ui/ui-preferences";
import { ruleBody as cssRuleBody, styles } from "./css-rules";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

const mountApp = async (seed = 0x2000_0001): Promise<HTMLDivElement> => {
  vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((buffer) => {
    (buffer as Uint32Array)[0] = seed;
    return buffer;
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ container, root });
  await act(async () => root.render(createElement(App)));
  return container;
};

const click = async (container: HTMLElement, action: string): Promise<void> => {
  const control = container.querySelector<HTMLElement>(`[data-dd-action="${action}"]`);
  if (!control) throw new Error(`No control for action "${action}"`);
  await act(async () => control.click());
};

const enterMarket = async (): Promise<HTMLDivElement> => {
  const container = await mountApp();
  await click(container, "losuj");
  await click(container, "dalej");
  await click(container, "klub:gornik-zabrze");
  await click(container, "zacznij-kariere");
  return container;
};

const prepareScrollAwareActionBar = async ({
  mobile,
  reducedMotion = false,
  innerHeight = 800,
  mediaListeners,
}: {
  mobile: boolean;
  reducedMotion?: boolean;
  innerHeight?: number;
  mediaListeners?: Map<string, (_event: MediaQueryListEvent) => void>;
}): Promise<HTMLElement | null> => {
  vi.useFakeTimers({
    toFake: ["setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame"],
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches:
        (mobile && query === ACTION_BAR_COMPACT_QUERY) ||
        (reducedMotion && query === "(prefers-reduced-motion: reduce)"),
      addEventListener: vi.fn(
        (eventName: string, listener: (_event: MediaQueryListEvent) => void) => {
          if (eventName === "change") mediaListeners?.set(query, listener);
        }
      ),
      removeEventListener: vi.fn(),
    }))
  );
  Object.defineProperty(window, "innerHeight", { configurable: true, value: innerHeight });
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: 2000,
  });
  const container = await enterMarket();
  await click(container, "oferty");
  return container.querySelector<HTMLElement>(".dd-action-bar");
};

const scheduleScrollTo = (scrollY: number): void => {
  Object.defineProperty(window, "scrollY", { configurable: true, value: scrollY });
  window.dispatchEvent(new Event("scroll"));
};

const scrollPageTo = async (scrollY: number): Promise<void> => {
  scheduleScrollTo(scrollY);
  await act(async () => vi.runOnlyPendingTimers());
};

const renderOfferCard = (
  offerType: Offer["typ"] = "SPRZEDAZ",
  metricsOverride?: [
    { metricId: string; percentile: number; value: number },
    { metricId: string; percentile: number; value: number },
  ],
  sourceClub: string | null = null,
  seasonal: { changes: Record<string, number>; period?: SeasonChangePeriod } = { changes: {} },
  staffOverride?: Partial<Offer["staffAssessment"]>,
  buyerOverride?: Offer["buyer"]
): HTMLElement => {
  const player: Player = {
    id: "offer-player",
    nazwa: "A. Testowy",
    poz: "ŚP",
    wiek: 25,
    ovr: 68,
    sufit: 80,
    moj: offerType === "SPRZEDAZ",
    cenaZakupu: 0.6,
    ageAtSigning: null,
    mnoznikPlacy: 1,
    wKlubieOd: 0,
    kontraktOd: 0,
    wygasa: false,
  };
  const metrics = (metricsOverride || [
    { metricId: "goalsPreventedPer90", percentile: 79, value: 0.2 },
    { metricId: "positioningErrorAverage", percentile: 76, value: 1.58 },
  ]) as Offer["analystReport"]["metrics"];
  const offer: Offer = {
    typ: offerType,
    zawodnik: player,
    cena: 0.94,
    sourceClub,
    buyer:
      buyerOverride !== undefined
        ? buyerOverride
        : offerType === "SPRZEDAZ"
          ? { clubId: "legia-warszawa", name: "Legia", origin: "domestic" }
          : null,
    staffAssessment: {
      source: "scout",
      focus: "potential",
      outlook: "leagueLevel",
      confidence: "medium",
      isFirstObservation: false,
      ...staffOverride,
    },
    analystReport: {
      metrics,
      minutes: 2310,
      sampleTier: "large",
      period: { season: 1, window: "summer" },
      contextTier: "mid",
    },
  };
  const markup = renderToStaticMarkup(
    createElement(OfferCard, {
      offer,
      squad: [player],
      formation: FORMACJE["4-3-3"],
      europeanCup: null,
      marketState: "pusty",
      price: offerType === "WOLNY" ? 0 : 0.94,
      wage: 0.24,
      cash: 1.5,
      cashAfter: 2.44,
      totalWagesAfter: 2.9,
      forecastAfter: -0.2,
      currentClubName: "Testowy KS",
      timer: null,
      seasonalChanges: { season: 1, byPlayer: seasonal.changes },
      changePeriod: seasonal.period ?? "fresh",
      onOpenSquad: () => undefined,
    })
  );
  return new DOMParser().parseFromString(markup, "text/html").body;
};

afterEach(async () => {
  while (mountedRoots.length) {
    const mounted = mountedRoots.pop();
    if (!mounted) continue;
    await act(async () => mounted.root.unmount());
    mounted.container.remove();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe("shared redesign components", () => {
  test("changelog shows only the newest version until it is expanded", async () => {
    const container = await mountApp();

    const entries = () => container.querySelectorAll(".dd-changelog > li").length;
    const toggle = container.querySelector<HTMLButtonElement>('[data-dd-action="historia-zmian"]');

    // Collapsed by default: one entry, and the button says how many are hidden.
    expect(entries()).toBe(1);
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.textContent).toContain("Pokaż starsze wersje");

    // The player-facing version, pinned: it is deliberately still below 1.0,
    // and it is not the engine revision a save file trusts.
    expect(container.querySelector(".dd-version-tag")?.textContent).toBe("v0.35");
    expect(container.querySelector(".dd-changelog-heading strong")?.textContent).toBe("v0.35");

    await click(container, "historia-zmian");
    expect(entries()).toBeGreaterThan(1);
    // The whole history, in order. Renumbered on 2026-08-27 by shifting every
    // old entry down 0.70 - dates, wording and order untouched - so 1.0 stays
    // reserved for a moment somebody chooses.
    expect(
      Array.from(container.querySelectorAll(".dd-changelog-heading strong")).map(
        (heading) => heading.textContent
      )
    ).toEqual([
      "v0.35",
      "v0.34",
      "v0.33",
      "v0.32",
      "v0.31",
      "v0.30",
      "v0.29",
      "v0.28",
      "v0.27",
      "v0.26",
      "v0.25",
      "v0.24",
      "v0.23",
      "v0.22",
      "v0.21",
      "v0.20",
      "v0.12",
      "v0.11",
      "v0.10",
    ]);
    expect(
      container.querySelector('[data-dd-action="historia-zmian"]')?.getAttribute("aria-expanded")
    ).toBe("true");
    expect(container.querySelector('[data-dd-action="historia-zmian"]')?.textContent).toContain(
      "Zwiń"
    );

    // And back again - collapsing has to actually collapse.
    await click(container, "historia-zmian");
    expect(entries()).toBe(1);
  });

  test("club bar and HUD expose one club identity and exactly four decision numbers", async () => {
    const container = await enterMarket();

    const clubBar = container.querySelector(".dd-club-bar");
    expect(clubBar).not.toBeNull();
    expect(clubBar?.querySelector("h1")?.textContent).not.toBe("");

    const hud = container.querySelector(".dd-hud");
    expect(hud?.querySelectorAll("dd")).toHaveLength(4);
    // The label, not the whole term: the forecast carries a "?" whose
    // explanation stays in the DOM for a screen reader whether or not the
    // panel is open, so reading the term would read the sentence too.
    expect(
      Array.from(hud?.querySelectorAll("dt") ?? []).map(
        (node) => node.querySelector(".dd-hud-label")?.textContent ?? node.textContent
      )
    ).toEqual(["kasa mln\u00a0€", "śr. płaca/rok", "prognoza", "oferta"]);
    expect(hud?.textContent).toContain("0/4");
    expect(hud?.textContent).not.toContain("PŁACE/ROK");
  });

  test("the HUD says what its forecast number IS, not just the rule behind it", async () => {
    const container = await enterMarket();
    const hud = container.querySelector(".dd-hud");

    // The term stays one word for the 360 px cell, so the sentence beside it
    // is the only place the quantity gets named - and it has to NAME it. A
    // note that only stated the board's rule would leave a reader free to
    // read the figure as the club's result with the share taken later, which
    // is the misreading the split exists to prevent.
    const note = hud?.querySelector(".dd-info-popover-panel")?.textContent ?? "";
    expect(note).toMatch(/zmiana budżetu/i);
    expect(note).toContain("30%");
    // In the reading order whether or not the panel is open: it is a
    // role="note", never aria-hidden, so a screen reader reaches it right
    // after the term.
    expect(hud?.querySelector(".dd-info-popover-panel")?.getAttribute("role")).toBe("note");
  });

  test("formation renders centered lanes and keeps substitutes with their position", async () => {
    const container = await enterMarket();
    const lanes = Array.from(container.querySelectorAll(".dd-formation-line"));

    expect(container.querySelector(".dd-formation")?.tagName).toBe("SECTION");
    expect(lanes).toHaveLength(4);
    // The formation the seed draws changed with 6D: the club is now chosen
    // rather than the first RNG draw of the career, so the formation - the
    // career's actual first draw - lands differently from the same seed.
    expect(lanes.map((lane) => lane.querySelectorAll(".dd-player-tile").length)).toEqual([
      1, 4, 4, 2,
    ]);
    for (const substitute of container.querySelectorAll(".dd-player-substitute")) {
      const tile = substitute.closest(".dd-player-tile");
      expect(substitute.getAttribute("data-position")).toBe(tile?.getAttribute("data-position"));
    }
  });

  test("player tile derives its arrow from age and its tone from OVR while showing seasonal change", () => {
    const player: Player = {
      id: "test-player",
      nazwa: "A. Testowy",
      poz: "ŚP",
      wiek: 22,
      ovr: 63,
      sufit: 99,
      moj: true,
      cenaZakupu: 0.5,
      ageAtSigning: null,
      mnoznikPlacy: 1,
      wKlubieOd: 0,
      kontraktOd: 0,
      wygasa: false,
    };

    const markup = renderToStaticMarkup(
      createElement(Tile, {
        player,
        substitutes: [],
        highlighted: false,
        seasonalChanges: { season: 1, byPlayer: { "test-player": 3 } },
        changePeriod: "fresh",
      })
    );

    expect(markup).toContain("dd-player-tile is-warning");
    expect(markup).toContain("▲");
    expect(markup).toContain("+3");
    expect(markup).not.toContain("99");
  });

  test("offer screen uses the shared card grammar and preserves all decision actions", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const container = await enterMarket();
    await click(container, "oferty");

    const card = container.querySelector(".dd-offer-card");
    expect(card).not.toBeNull();
    expect(card?.querySelector(".dd-offer-sender")).not.toBeNull();
    expect(card?.querySelector(".dd-offer-kind")).not.toBeNull();
    expect(card?.querySelector(".dd-offer-name")).not.toBeNull();
    expect(card?.querySelector(".dd-offer-meta")).not.toBeNull();
    expect(card?.querySelector(".dd-offer-fee")).not.toBeNull();
    expect(card?.querySelector(".dd-offer-position-squad")).not.toBeNull();
    expect(card?.querySelector(".dd-analyst-report")).not.toBeNull();
    expect(container.querySelector(".dd-hud")?.textContent).toContain("1/4");

    const actionBar = container.querySelector(".dd-action-bar");
    expect(actionBar).not.toBeNull();
    expect(actionBar?.getAttribute("role")).toBe("region");
    expect(
      Array.from(actionBar?.querySelectorAll("button") ?? []).every(
        (button) => button.type === "button"
      )
    ).toBe(true);
    expect(
      Array.from(actionBar?.querySelectorAll("[data-dd-action]") ?? []).map((node) =>
        node.getAttribute("data-dd-action")
      )
    ).toEqual(["bierz", "targ", "czas", "pas"]);
  });

  test("the whole preview block is one button, with no interactive element inside", () => {
    const card = renderOfferCard();
    const block = card.querySelector<HTMLElement>(".dd-offer-position-squad");

    // The block IS the button: the tiles are the obvious thing to aim at and
    // pressing them used to do nothing at all. That is only legal because the
    // non-interactive Tile is phrasing content - a <span> of <span>s, no
    // <div> and no <ul> - and role="group" is not interactive, so there is no
    // nested-interactive failure.
    expect(block?.tagName).toBe("BUTTON");
    expect(block?.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);
    expect(block?.querySelectorAll("div, ul, ol, li, p")).toHaveLength(0);

    // The preview itself is what makes the block worth its space: quality and
    // depth at a glance, while the offer clock runs.
    expect(
      block?.querySelectorAll(".dd-offer-position-tiles .dd-player-tile").length
    ).toBeGreaterThan(0);
    const lines = Array.from(block?.querySelectorAll(".dd-offer-position-line") ?? []).map(
      (line) => [
        line.querySelector(".dd-metadata-label")?.textContent,
        line.querySelector(".dd-metadata-value")?.textContent,
      ]
    );
    // Labelled, because an unlabelled phrase gave no clue what it described.
    expect(lines).toHaveLength(3);

    // Depth is kept in the markup but not shown: the tiles beside it already
    // say the same thing. `display: flex` outranks the hidden attribute's UA
    // rule, so this pins the CSS that actually does the hiding.
    const rows = Array.from(block?.querySelectorAll(".dd-offer-position-line") ?? []);
    expect(rows[0]!.hasAttribute("hidden")).toBe(true);
    expect(rows.slice(1).every((row) => !row.hasAttribute("hidden"))).toBe(true);

    expect(lines[0]![0]).toBe("Głębia pozycji");
    // Counts only, no judgement: "słabszy punkt kadry" never said what it was
    // measuring against. The quality question is answered by the line below.
    expect(lines[0]![1]).toMatch(/^\d+ podstawow\S+ · \d+ zmiennik\S*$/u);
    // SPRZEDAZ in this fixture: the player is already ours, so it is the role
    // he holds now - the same question a sale asks from the other side.
    // Depth is arithmetic, quality is the judgement, role is the consequence.
    expect(lines[1]![0]).toBe("Jakość pozycji");
    expect(lines[1]![1]).toMatch(/^(dobra|średnia|słaba)$/u);
    expect(lines[2]![0]).toBe("Obecny status zawodnika");
    expect(lines[2]![1]).toMatch(/^(podstawowy|pierwszy zmiennik|uzupełnienie kadry)$/u);
    // "rozwiń" promised in-place expansion; a drawer opens instead.
    expect(block?.querySelector(".dd-offer-section-label")?.textContent).toBe("Kadracała kadra›");
    // Named by what it shows (WCAG 2.5.3): an aria-label used to replace the
    // position lines with "otwórz kadrę" for screen readers.
    expect(block?.hasAttribute("aria-label")).toBe(false);
  });

  test("an incoming offer is described as what the transfer would change", () => {
    // The most useful line in the block: it saves comparing tiles by hand,
    // under a clock.
    const card = renderOfferCard("KUPNO");
    const lines = Array.from(card.querySelectorAll(".dd-offer-position-line"));
    const roleLabel = lines[2]?.querySelector(".dd-metadata-label")?.textContent;
    const roleValue = lines[2]?.querySelector(".dd-metadata-value")?.textContent;

    expect(roleLabel).toBe("Status zawodnika po transferze");
    expect(roleValue).toMatch(/^(podstawowy|pierwszy zmiennik|uzupełnienie kadry)$/u);
    expect(card.querySelector(".dd-offer-squad-cue")?.textContent).toBe("cała kadra›");
  });

  test("names the club a signing would come from", () => {
    const card = renderOfferCard("KUPNO", undefined, "Górnik Zabrze");

    expect(card.querySelector(".dd-offer-club")?.textContent).toBe("Górnik Zabrze");
  });

  test("tells a free agent's last club apart from having none now", () => {
    const card = renderOfferCard("WOLNY", undefined, "Cracovia");

    // The analyst report names this club's level in the past tense three lines
    // below, so the card has to say which club that was.
    expect(card.querySelector(".dd-offer-club")?.textContent).toBe("Bez klubu · ostatnio Cracovia");
  });

  test("falls back to the placeholder when a resumed save carries no club", () => {
    // A game saved before sourceClub existed resumes without the key. The
    // engine revision does not change for a display-only field, so that save
    // is still loaded and must not render an empty club line.
    const card = renderOfferCard("KUPNO");

    expect(card.querySelector(".dd-offer-club")?.textContent).toBe("Klub nieujawniony");
  });

  test("free-agent fee uses a compact zero-price treatment", () => {
    const card = renderOfferCard("WOLNY");
    const fee = card.querySelector(".dd-offer-fee-primary strong.is-zero");

    expect(fee?.textContent).toBe("bez odstępnego");
  });

  test("a sale card shows how our player moved last season", () => {
    // SPRZEDAZ: our own player, so the club has a history for him.
    const card = renderOfferCard("SPRZEDAZ", undefined, null, {
      changes: { "offer-player": 3 },
    });

    const meta = card.querySelector(".dd-offer-meta");
    expect(meta?.textContent).toContain("+3");
    // Same reading order as a squad tile: ovr and its delta first, then the
    // glyph against the age it is computed from.
    expect(meta?.textContent?.replace(/\s+/g, " ").trim()).toBe("Ocena 68+3 · ≈ 25 lat");
  });

  test("a sale card marks which player in the squad tiles the offer is about", () => {
    // The offer's player is one of ours, so he is somewhere in these tiles -
    // and without a mark the reader has to match numbers by hand to find him.
    const card = renderOfferCard("SPRZEDAZ");
    const marked = card.querySelectorAll(".dd-offer-position-tiles .dd-player-rating.is-offer");

    expect(marked).toHaveLength(1);
    expect(marked[0]!.textContent).toContain("68");
    // Spoken too: a pair of edges says nothing to a screen reader.
    expect(
      card.querySelector(".dd-offer-position-tiles .dd-player-tile")?.getAttribute("aria-label")
    ).toContain("oferta dotyczy zawodnika z oceną 68");
  });

  test("a purchase card marks nobody, because its player is not in the squad", () => {
    // Marking anyone here would point at the wrong person: the offer is about
    // someone we do not have.
    const card = renderOfferCard("KUPNO");

    expect(
      card.querySelectorAll(".dd-offer-position-tiles .dd-player-rating.is-offer")
    ).toHaveLength(0);
    expect(
      card.querySelector(".dd-offer-position-tiles .dd-player-tile")?.getAttribute("aria-label")
    ).not.toContain("oferta dotyczy");
  });

  test("a purchase card never shows a change for a player we do not own", () => {
    // KUPNO: inventing a history for someone else's player would be a channel
    // outside the closed catalogue of hidden-ceiling signals, not a missing feature. The squad
    // tiles below still carry the delta - the gate is on the header alone,
    // which is where the offer's own player stands.
    const card = renderOfferCard("KUPNO", undefined, null, {
      changes: { "offer-player": 3 },
    });

    expect(card.querySelector(".dd-offer-meta")?.textContent).not.toContain("+3");
    expect(card.querySelector(".dd-offer-position-tiles")?.textContent).toContain("+3");
  });

  test("last season's change on a sale card drops the red/green coding", () => {
    // Winter window: the delta is history, so it goes neutral rather than
    // paler.
    const card = renderOfferCard("SPRZEDAZ", undefined, null, {
      changes: { "offer-player": 3 },
      period: "past",
    });
    const change = card.querySelector(".dd-offer-meta .dd-season-change");

    expect(change?.className).toContain("is-neutral");
    expect(change?.className).not.toContain("is-up");
  });

  test("sale offer keeps a visual separator between fees and market context", () => {
    const card = renderOfferCard();
    const separator = card.querySelector(".dd-cash-share");

    expect(separator).not.toBeNull();
    expect(separator?.getAttribute("aria-hidden")).toBe("true");
    expect(separator?.getAttribute("role")).toBeNull();
  });

  test("a sale card names a foreign buyer, and never leaks its tier or the hidden ceiling", () => {
    const card = renderOfferCard("SPRZEDAZ", undefined, null, { changes: {} }, undefined, {
      clubId: "borussia-dortmund",
      name: "Borussia Dortmund",
      origin: "foreign",
    });

    expect(card.querySelector(".dd-offer-sender")?.textContent).toContain(
      "Borussia Dortmund chce kupić twojego zawodnika."
    );
    expect(card.innerHTML).not.toMatch(/wysoki|bardzo wysoki|legendarny|sufit|ceiling/i);
  });

  test("squad drawer traps focus, closes with Escape, restores focus, and leaves the timer running", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const container = await enterMarket();
    await click(container, "oferty");

    const trigger = container.querySelector<HTMLButtonElement>(".dd-offer-squad-trigger");
    expect(trigger).not.toBeNull();
    trigger?.focus();
    await act(async () => trigger?.click());

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    const closeButton = dialog?.querySelector<HTMLButtonElement>(".dd-squad-drawer-close");
    const offeredPosition = container
      .querySelector(".dd-offer-kind")
      ?.textContent?.split(" · ")
      .at(-1);
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-labelledby")).toBe("squad-drawer-title");
    expect(dialog?.querySelector(".dd-squad-drawer-position")?.textContent).toBe(
      `pozycja oferty: ${offeredPosition}`
    );
    expect(dialog?.querySelectorAll(".dd-formation-line")).toHaveLength(4);
    for (const tile of dialog?.querySelectorAll(".dd-player-tile.is-highlighted") ?? []) {
      const description = tile.getAttribute("aria-describedby") ?? "";
      expect(document.getElementById(description)?.textContent).toContain("pozycja oferty");
      expect(tile.getAttribute("data-position")).toBe(offeredPosition);
    }
    expect(document.activeElement).toBe(closeButton);

    // The trap wraps rather than pinning: the drawer used to hold exactly one
    // focusable element, so "Tab changes nothing" and "Tab is trapped" were
    // indistinguishable. The tiles are buttons now and there is a real ring to
    // walk, so the close button - last in the DOM - must wrap round to the
    // first, and shift+Tab from the first must come back to it.
    const focusables = Array.from(
      dialog?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []
    );
    expect(focusables.length).toBeGreaterThan(1);
    expect(focusables.at(-1)).toBe(closeButton);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(focusables[0]);

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })
      );
    });
    expect(document.activeElement).toBe(closeButton);

    await act(async () => vi.advanceTimersByTime(1_000));
    expect(container.querySelector(".dd-offer-clock strong")?.textContent).toBe("14");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("squad drawer closes when the timer advances to the next offer", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const container = await enterMarket();
    await click(container, "oferty");

    const firstPlayer = container.querySelector(".dd-offer-name")?.textContent;
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".dd-offer-squad-trigger")?.click()
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => vi.advanceTimersByTime(15_000));

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector(".dd-offer-name")?.textContent).not.toBe(firstPlayer);
  });

  test("action bar hides while scrolling down and returns on scroll up", async () => {
    const actionBar = await prepareScrollAwareActionBar({ mobile: true });

    await scrollPageTo(120);
    expect(actionBar?.classList.contains("is-hidden")).toBe(true);

    await scrollPageTo(600);
    expect(actionBar?.classList.contains("is-hidden")).toBe(true);

    await scrollPageTo(500);
    expect(actionBar?.classList.contains("is-hidden")).toBe(false);
  });

  test("action bar reveals itself once scrolled all the way to the bottom", async () => {
    const actionBar = await prepareScrollAwareActionBar({ mobile: true });

    await scrollPageTo(600);
    expect(actionBar?.classList.contains("is-hidden")).toBe(true);

    // scrollHeight is stubbed to 2000 and innerHeight to 800, so 1200 is the
    // exact end of the page.
    await scrollPageTo(1200);
    expect(actionBar?.classList.contains("is-hidden")).toBe(false);

    await scrollPageTo(300);
    expect(actionBar?.classList.contains("is-hidden")).toBe(false);

    await scrollPageTo(900);
    expect(actionBar?.classList.contains("is-hidden")).toBe(true);
  });

  test("the skirt's opacity variable always matches the bar's is-hidden class (Safari white-band fix, 2026-09-18)", async () => {
    // --dd-action-bar-backdrop-opacity drives .dd-action-bar::after, the
    // panel-coloured skirt below the bar - see the matching selector in
    // styles.css. It must never read stale relative to is-hidden, even
    // mid-fling when scrollPageTo flips `hidden` on every call: a lagging
    // write lets the skirt and the bar animate out of step.
    const actionBar = await prepareScrollAwareActionBar({ mobile: true });
    const readOpacityVar = (): string =>
      document.documentElement.style.getPropertyValue("--dd-action-bar-backdrop-opacity");

    await scrollPageTo(600);
    expect(actionBar?.classList.contains("is-hidden")).toBe(true);
    expect(readOpacityVar()).toBe("0");

    // scrollHeight is stubbed to 2000 and innerHeight to 800, so 1200 is the
    // exact end of the page - the bar reveals itself there regardless of
    // scroll direction.
    await scrollPageTo(1200);
    expect(actionBar?.classList.contains("is-hidden")).toBe(false);
    expect(readOpacityVar()).toBe("1");

    await scrollPageTo(300);
    expect(actionBar?.classList.contains("is-hidden")).toBe(false);
    expect(readOpacityVar()).toBe("1");

    await scrollPageTo(900);
    expect(actionBar?.classList.contains("is-hidden")).toBe(true);
    expect(readOpacityVar()).toBe("0");
  });

  test("saved always-visible preference disables mobile auto-hide", async () => {
    localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 2, actionBarMode: "alwaysVisible" })
    );
    const actionBar = await prepareScrollAwareActionBar({ mobile: true });

    await scrollPageTo(160);

    expect(actionBar?.classList.contains("is-hidden")).toBe(false);
  });

  test("viewport correction lifts the bar over a toolbar covering the layout viewport", () => {
    // Mobile browser toolbar showing: the visible area is shorter than the
    // layout viewport, so the bar's own bottom edge is hidden behind it.
    expect(viewportCorrectionOffset(800, 750, 0)).toBe(50);
  });

  test("viewport correction clamps to zero when the visible area outgrows the layout", () => {
    // Toolbar collapsed without the page being re-laid out: `position: fixed`
    // still ends at the layout viewport. Bug fix (2026-09-18): this used to
    // return a negative offset that pushed the bar down past its own fixed
    // position, which separated it from the reserved strip of panel colour
    // in normal flow (main::after) and opened a white band on iOS Safari
    // fling-scrolls. The bar is now never pushed down - it stays at its
    // native fixed position and its skirt (.dd-action-bar::after) covers the
    // gap in panel colour instead.
    expect(viewportCorrectionOffset(800, 845, 0)).toBe(0);
  });

  test("viewport correction ignores a viewport scrolled by pinch zoom", () => {
    // Pinch zoom shrinks the visible area and scrolls it inside the layout
    // viewport. Its bottom edge never passes the layout's, so the correction
    // must not turn negative and send the bar off-screen.
    expect(viewportCorrectionOffset(800, 400, 400)).toBe(0);
    expect(viewportCorrectionOffset(800, 400, 250)).toBe(150);
  });

  test("viewport correction never goes negative for an implausible downward reading", () => {
    // No mobile browser chrome is 800px tall; a reading that large is a bad
    // measurement. It is now clamped the same way as any other downward
    // reading - to zero, never pushing the bar below its own fixed position.
    expect(viewportCorrectionOffset(800, 1600, 0)).toBe(0);
  });

  test("a new action group resets a previously hidden mobile bar", async () => {
    const actionBar = await prepareScrollAwareActionBar({ mobile: true });
    const appRoot = actionBar?.closest<HTMLElement>(".dd-root");
    if (!appRoot) throw new Error("Game root is missing");

    await scrollPageTo(160);
    expect(actionBar?.classList.contains("is-hidden")).toBe(true);

    for (let offer = 0; offer < 4; offer += 1) await click(appRoot, "pas");

    const nextBar = appRoot.querySelector<HTMLElement>(".dd-action-bar");
    expect(nextBar?.getAttribute("aria-label")).toBe("Przejście do okna zimowego");
    expect(nextBar?.classList.contains("is-hidden")).toBe(false);
  });

  // Owner decision (2026-09-18): the desktop default is alwaysVisible (no
  // explicit choice stored), which is why this stays visible - not because
  // desktop is exempt from auto-hide altogether, see the next test.
  test("action bar remains visible during downward scrolling on desktop (unset preference)", async () => {
    const actionBar = await prepareScrollAwareActionBar({ mobile: false, innerHeight: 500 });

    await scrollPageTo(160);

    expect(actionBar?.classList.contains("is-hidden")).toBe(false);
  });

  test("an explicit autoHide choice hides the bar on desktop scroll too", async () => {
    localStorage.setItem(
      UI_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 2, actionBarMode: "autoHide" })
    );
    const actionBar = await prepareScrollAwareActionBar({ mobile: false, innerHeight: 500 });

    await scrollPageTo(160);

    expect(actionBar?.classList.contains("is-hidden")).toBe(true);
  });

  test("viewport change cancels a pending mobile hide before entering desktop", async () => {
    const mediaListeners = new Map<string, (_event: MediaQueryListEvent) => void>();
    const actionBar = await prepareScrollAwareActionBar({ mobile: true, mediaListeners });

    scheduleScrollTo(160);
    await act(async () => {
      mediaListeners.get(ACTION_BAR_COMPACT_QUERY)?.({ matches: false } as MediaQueryListEvent);
    });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 200 });
    await act(async () => vi.runOnlyPendingTimers());

    expect(actionBar?.classList.contains("is-hidden")).toBe(false);
  });

  test("market anomalies support keyboard scrolling", async () => {
    const container = await enterMarket();
    const marketScroll = container.querySelector<HTMLElement>(".dd-market-scroll");
    if (!marketScroll) throw new Error("Market scroller is missing");
    const scrollShell = marketScroll.parentElement;
    const list = marketScroll.querySelector<HTMLElement>(".dd-market-anomalies");
    if (!list) throw new Error("Market anomalies list is missing");

    // The strip scrolls natively now, and jsdom has no layout, so the sizes
    // it would measure have to be supplied. scrollLeft is made writable so
    // the component's own writes stick and can be read back.
    const CLIENT = 200;
    const CONTENT = 560;
    let scrollLeft = 0;
    Object.defineProperty(marketScroll, "clientWidth", { configurable: true, value: CLIENT });
    Object.defineProperty(marketScroll, "scrollWidth", { configurable: true, value: CONTENT });
    Object.defineProperty(marketScroll, "scrollLeft", {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = Math.max(0, Math.min(CONTENT - CLIENT, value));
      },
    });
    await act(async () => window.dispatchEvent(new Event("resize")));

    expect(scrollShell?.classList.contains("dd-market-scroll-shell")).toBe(true);
    expect(scrollShell?.classList.contains("dd-scroller-shell")).toBe(true);
    expect(scrollShell?.classList.contains("can-scroll-right")).toBe(true);
    expect(scrollShell?.classList.contains("can-scroll-left")).toBe(false);

    // Focusable because it has something to scroll to. A strip that fits is
    // deliberately taken out of the tab order instead.
    expect(marketScroll.tabIndex).toBe(0);
    marketScroll.focus();
    expect(document.activeElement).toBe(marketScroll);

    await act(async () => {
      marketScroll.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
      );
    });
    expect(marketScroll.scrollLeft).toBe(120);
    expect(scrollShell?.classList.contains("can-scroll-left")).toBe(true);

    await act(async () => {
      for (let press = 0; press < Math.ceil(CONTENT / 120) + 2; press += 1) {
        marketScroll.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
        );
      }
    });
    expect(marketScroll.scrollLeft).toBe(CONTENT - CLIENT);
    expect(scrollShell?.classList.contains("can-scroll-left")).toBe(true);
    expect(scrollShell?.classList.contains("can-scroll-right")).toBe(false);

    await act(async () => {
      for (let press = 0; press < Math.ceil(CONTENT / 120) + 2; press += 1) {
        marketScroll.dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })
        );
      }
    });
    expect(marketScroll.scrollLeft).toBe(0);
    expect(scrollShell?.classList.contains("can-scroll-left")).toBe(false);
    expect(scrollShell?.classList.contains("can-scroll-right")).toBe(true);
  });

  test("a strip that fits shows no fade and stays out of the tab order", async () => {
    // The bug this pins: the fade used to be a permanent mask, so a four-tile
    // back line - exactly one screen wide - had both full-backs clipped with
    // nowhere to scroll. jsdom reports a scrollWidth of zero, which is the
    // "everything fits" case, so the default state is the one under test.
    const container = await enterMarket();
    const marketScroll = container.querySelector<HTMLElement>(".dd-market-scroll");
    const shell = marketScroll?.parentElement;

    expect(shell?.classList.contains("can-scroll-left")).toBe(false);
    expect(shell?.classList.contains("can-scroll-right")).toBe(false);
    expect(marketScroll?.tabIndex).toBe(-1);
  });

  test("reduced motion keeps the action bar visible while scrolling", async () => {
    const actionBar = await prepareScrollAwareActionBar({ mobile: true, reducedMotion: true });

    await scrollPageTo(160);

    expect(actionBar?.classList.contains("is-hidden")).toBe(false);
  });

  test("staff assessment shows scout label, outlook, and confidence text with proper typographic hierarchy", () => {
    const card = renderOfferCard();
    const staffSection = card.querySelector(".dd-staff-assessment");

    expect(staffSection).not.toBeNull();
    expect(staffSection?.querySelector(".dd-offer-section-label")?.textContent).toBe(
      "Raport skauta (potencjał)"
    );
    // Outlook label is now in a label span with leader and stars
    expect(staffSection?.querySelector(".dd-staff-outlook")?.textContent).toContain(
      "Przeciętny ligowiec"
    );
    // Confidence label is now in a label span with leader and stars
    expect(staffSection?.querySelector(".dd-staff-confidence")?.textContent).toContain(
      "Umiarkowana pewność"
    );

    // Verify elements exist and are in correct DOM order for hierarchy
    const label = staffSection?.querySelector(".dd-offer-section-label");
    const outlook = staffSection?.querySelector(".dd-staff-outlook");
    const confidence = staffSection?.querySelector(".dd-staff-confidence");
    if (label && outlook) {
      expect(label.compareDocumentPosition(outlook) & 4).toBe(4); // label comes before outlook
    }
    if (outlook && confidence) {
      expect(outlook.compareDocumentPosition(confidence) & 4).toBe(4); // outlook comes before confidence
    }
  });

  test("analyst report shows metrics with name, value, and percentile on one line", () => {
    const card = renderOfferCard();
    const metricsContainer = card.querySelector(".dd-analyst-metrics");

    expect(metricsContainer).not.toBeNull();
    const metricRows = metricsContainer?.querySelectorAll(".dd-analyst-metric");
    expect(metricRows?.length).toBeGreaterThan(0);

    // First metric should be Goals Prevented /90 (quality metric, no hint)
    const firstMetric = metricRows?.[0];
    expect(firstMetric?.querySelector(".dd-metric-label-text")?.textContent).toBe(
      "Goals Prevented /90"
    );
    const firstResultText = firstMetric?.querySelector(".dd-metric-result")?.textContent ?? "";
    expect(firstResultText).toContain("+0,20 /90"); // Polish comma, sign, and per-90 unit
    expect(firstResultText).toContain("·");
    expect(firstResultText).toContain("79");
    expect(firstResultText).toContain("percentyl"); // "percentyl" after the number

    // No hint should be present for quality higher raw metrics
    expect(firstMetric?.querySelector(".dd-metric-hint")).toBeNull();

    // Second metric should be Positioning Error Average (quality lower raw, should have hint)
    const secondMetric = metricRows?.[1];
    expect(secondMetric?.querySelector(".dd-metric-label-text")?.textContent).toBe(
      "Positioning Error Average"
    );
    expect(secondMetric?.querySelector(".dd-metric-hint")?.textContent).toContain(
      "surowa wartość: ↓ mniej = lepiej"
    );
  });

  test("every displayed analyst metric has accessible Polish help", () => {
    const card = renderOfferCard();
    const triggers = Array.from(
      card.querySelectorAll<HTMLButtonElement>('[data-dd-action="metric-help"]')
    );

    expect(triggers).toHaveLength(2);
    expect(triggers.map((trigger) => trigger.getAttribute("aria-label"))).toEqual([
      "Co oznacza metryka Goals Prevented /90",
      "Co oznacza metryka Positioning Error Average",
    ]);

    const descriptions = triggers.map((trigger) => {
      const descriptionId = trigger.getAttribute("aria-describedby");
      expect(descriptionId).toBeTruthy();
      return card.querySelector(`#${CSS.escape(descriptionId!)}`)?.textContent;
    });
    expect(descriptions).toEqual([
      "Liczba goli zapobieżonych ponad oczekiwanie na 90 minut, na podstawie jakości strzałów celnych. Wyżej = lepiej.",
      "Średnia odległość bramkarza od modelowanej pozycji optymalnej przy strzałach bez karnych. Wynik w metrach; mniej = lepiej.",
    ]);
  });

  test("analyst report provides accessible labels for metrics without exposing hidden mechanics", () => {
    const card = renderOfferCard();
    const metricsContainer = card.querySelector(".dd-analyst-metrics");
    const metricRows = metricsContainer?.querySelectorAll(".dd-analyst-metric");

    // Check first metric (quality higher) aria-label
    const firstResultElement = metricRows?.[0]?.querySelector(".dd-metric-result");
    const firstAriaLabel = firstResultElement?.getAttribute("aria-label");
    expect(firstAriaLabel).toContain("Goals Prevented /90 +0,20 /90");
    expect(firstAriaLabel).toContain("79. percentyl jakości");

    // Check second metric (quality lower) aria-label
    const secondResultElement = metricRows?.[1]?.querySelector(".dd-metric-result");
    const secondAriaLabel = secondResultElement?.getAttribute("aria-label");
    expect(secondAriaLabel).toContain("Positioning Error Average 1,58 m");
    expect(secondAriaLabel).toContain("odwrócony percentyl jakości");

    // Verify no domain impact language ("+atak", "+obrona") or domain hints ("creator", "dribbler", "finisher")
    expect(card.textContent).not.toMatch(/\+.*atak|\+.*obron/i);
    expect(card.textContent).not.toMatch(/kreator|drybler|finisher|wyprowadzaniu/i);
  });

  test("evidence rail is decorative and renders 0/99 axis with markers", () => {
    const card = renderOfferCard();
    const rail = card.querySelector(".dd-evidence-rail");

    expect(rail).not.toBeNull();
    expect(rail?.getAttribute("role")).toBe("img");
    expect(rail?.getAttribute("aria-hidden")).toBe("true");

    // Check for track
    expect(rail?.querySelector(".dd-rail-track")).not.toBeNull();

    // Check for markers
    const markers = rail?.querySelectorAll(".dd-rail-marker");
    expect(markers?.length).toBeGreaterThan(0);

    // Endpoints are 1 and 99, not 0 and 100: a percentile rank cannot reach
    // either bound (you cannot rank below or above yourself), and 1-99 is the
    // convention the analytics providers this catalog borrows from use.
    const endpoints = rail?.querySelectorAll(".dd-rail-end");
    const endpointTexts = Array.from(endpoints ?? []).map((el) => el.textContent);
    expect(endpointTexts).toContain("1");
    expect(endpointTexts).toContain("99");
    expect(endpointTexts).not.toContain("0");
    expect(endpointTexts).not.toContain("100");
  });

  test("analyst metadata renders three label/value rows with no emphasis", () => {
    const card = renderOfferCard();
    const metadata = card.querySelector(".dd-analyst-metadata");

    expect(metadata).not.toBeNull();
    const paragraphs = Array.from(metadata?.querySelectorAll("p") ?? []);
    expect(paragraphs.length).toBe(3);

    // Nothing in these rows is emphasised any more - the owner moved the
    // weight out of them entirely, so a stray <strong> creeping back in is a
    // regression rather than a style preference.
    expect(metadata?.querySelectorAll("strong").length).toBe(0);

    // Label and value are separate elements with a decorative leader between
    // them, so assert each side rather than the concatenated line.
    const labels = Array.from(metadata?.querySelectorAll(".dd-metadata-label") ?? []).map(
      (node) => node.textContent
    );
    const values = Array.from(metadata?.querySelectorAll(".dd-metadata-value") ?? []).map((node) =>
      node.textContent?.replace(/\s+/g, " ").trim()
    );
    expect(labels).toEqual([
      "Percentyle na tle",
      "Poziom klubu, w którym występuje",
      "Wielkość próby minutowej",
    ]);
    // "z całej ligi" is load-bearing: it is what tells a first-time reader
    // the comparison group is the league, not the player's own squad.
    expect(values).toEqual([
      "środkowych pomocników z całej ligi w ubiegłym sezonie",
      "środek ligi",
      "duża",
    ]);
  });

  test("analyst report displays minutes in header", () => {
    const card = renderOfferCard();
    const reportSection = card.querySelector(".dd-analyst-report");
    const reportLabel = reportSection?.querySelector(".dd-offer-section-label")?.textContent;

    // Should show "Raport analityka 2310 min"
    expect(reportLabel).toContain("Raport analityka");
    expect(reportLabel).toContain("2310 min");
  });

  test("analyst report header has label first and minutes last (dot leader in between)", () => {
    const card = renderOfferCard();
    const header = card.querySelector(".dd-analyst-report-header");
    const children = Array.from(header?.children ?? []);

    // Label, leader, minutes - in that order. The leader is a real element
    // rather than a pseudo-element because a pseudo-element on the label span
    // is not a flex item of this row and collapses to zero width, which is
    // exactly how it silently stopped rendering once already.
    expect(children.length).toBe(3);

    const [labelText, leader, minutes] = children;

    expect(labelText?.classList.contains("dd-analyst-label-text")).toBe(true);
    expect(labelText?.textContent).toBe("Raport analityka");

    expect(leader?.classList.contains("dd-analyst-leader")).toBe(true);
    expect(leader?.getAttribute("aria-hidden")).toBe("true");
    // Decoration only: it must not reach the accessible name or textContent.
    expect(leader?.textContent).toBe("");

    // Minutes stay last so they remain right-aligned against the card edge.
    expect(minutes?.classList.contains("dd-analyst-minutes")).toBe(true);
    expect(minutes?.textContent).toContain("min");
  });

  test("analyst report has no em-dashes and uses en-dashes instead", () => {
    const card = renderOfferCard();

    // em-dash is U+2014, en-dash is U+2013
    expect(card.textContent).not.toContain(String.fromCodePoint(0x2014));
  });

  test("free agent offer shows past tense for club level in metadata", () => {
    const card = renderOfferCard("WOLNY");
    const metadata = card.querySelector(".dd-analyst-metadata");
    const secondLine = Array.from(metadata?.querySelectorAll("p") ?? [])[1];

    expect(secondLine?.textContent).toContain("występował");
    expect(secondLine?.textContent).not.toContain("występuje");
  });

  test("staff assessment shows correct header for coach+potential case", () => {
    const card = renderOfferCard("KUPNO", undefined, null, undefined, {
      source: "coach",
      confidence: "high",
    });
    const staffSection = card.querySelector(".dd-staff-assessment");
    const staffLabel = staffSection?.querySelector(".dd-offer-section-label")?.textContent;

    expect(staffLabel).toBe("Raport trenera (potencjał)");
    expect(staffLabel).not.toContain("Obecny potencjał");
  });

  test("metric names with % are stripped correctly in aria-labels without double spaces", () => {
    const card = renderOfferCard("KUPNO", [
      { metricId: "longBallCompletionPct", percentile: 65, value: 72 },
      { metricId: "defensiveDuelsWonPct", percentile: 48, value: 61 },
    ]);
    const metricResults = Array.from(card.querySelectorAll(".dd-metric-result"));

    // First metric should have "Long Ball Completion" (without %) in aria-label, with formatted value
    const firstAriaLabel = metricResults[0]?.getAttribute("aria-label");
    expect(firstAriaLabel).toContain("Long Ball Completion 72%;");
    expect(firstAriaLabel).not.toContain("Long Ball Completion  72"); // no double space

    // Check that the visible name still has the %
    const firstMetricName = metricResults[0]
      ?.closest(".dd-analyst-metric")
      ?.querySelector(".dd-metric-label-text")?.textContent;
    expect(firstMetricName).toContain("Long Ball Completion %");
  });

  test("metric aria-labels contain exact formatted values with Polish comma for decimal metrics", () => {
    const card = renderOfferCard("KUPNO", [
      { metricId: "xaPerKeyPass", percentile: 84, value: 0.2 },
      { metricId: "positioningErrorAverage", percentile: 76, value: 1.58 },
    ]);
    const metricResults = Array.from(card.querySelectorAll(".dd-metric-result"));

    // First metric (xaPerKeyPass, value 0.2) should have Polish comma in aria-label
    const firstAriaLabel = metricResults[0]?.getAttribute("aria-label");
    expect(firstAriaLabel).toContain("0,20");
    expect(firstAriaLabel).not.toContain("0.2");

    // Second metric (positioningErrorAverage, value 1.58) should have Polish comma and metres
    const secondAriaLabel = metricResults[1]?.getAttribute("aria-label");
    expect(secondAriaLabel).toContain("1,58 m");
    expect(secondAriaLabel).not.toContain("1.58");
  });

  test("metric aria-labels contain exact formatted values with % unit for percentage metrics", () => {
    const card = renderOfferCard("KUPNO", [
      { metricId: "crossClaimSuccessPct", percentile: 72, value: 71 },
      { metricId: "longBallCompletionPct", percentile: 65, value: 72 },
    ]);
    const metricResults = Array.from(card.querySelectorAll(".dd-metric-result"));

    // First metric (crossClaimSuccessPct, value 71) should have % unit in aria-label
    const firstAriaLabel = metricResults[0]?.getAttribute("aria-label");
    expect(firstAriaLabel).toContain("71%");

    // Second metric (longBallCompletionPct, value 72) should have % unit in aria-label
    const secondAriaLabel = metricResults[1]?.getAttribute("aria-label");
    expect(secondAriaLabel).toContain("72%");
  });

  test("metric aria-labels render signed metrics with + prefix", () => {
    const card = renderOfferCard("KUPNO", [
      { metricId: "goalsPreventedPer90", percentile: 79, value: 0.2 },
      { metricId: "passCompletionAboveExpected", percentile: 82, value: 0.34 },
    ]);
    const metricResults = Array.from(card.querySelectorAll(".dd-metric-result"));

    // First metric (goalsPreventedPer90, value 0.2, signed, 2 decimals) should have + and /90
    const firstAriaLabel = metricResults[0]?.getAttribute("aria-label");
    expect(firstAriaLabel).toContain("+0,20 /90");
    expect(firstAriaLabel).toContain("79. percentyl jakości");

    // Second metric (passCompletionAboveExpected, value 0.34, signed, 1 decimal) should have + and pp (0.34 rounds to 0.3 with 1 decimal)
    const secondAriaLabel = metricResults[1]?.getAttribute("aria-label");
    expect(secondAriaLabel).toContain("Pass Completion Above Expected +0,3");
    expect(secondAriaLabel).toContain("pp");
    expect(secondAriaLabel).toContain("82. percentyl jakości");
  });
});

describe("report sections are a shared component", () => {
  /** useId() emits ids that depend on render position, so they move when a
   * component is lifted out of one tree into another. Everything else must
   * come out byte for byte the same. React 18 formats them as `:r1:` and
   * React 19.2+ as `_r_1_`; both normalise to the same placeholder. */
  const normalise = (html: string): string =>
    html.replace(/:[Rr][0-9a-z]*:|_[Rr]_[0-9a-z]+_/gu, "«id»");

  const reportRegions = (offerType: Offer["typ"] = "KUPNO"): string => {
    const card = renderOfferCard(offerType);
    const staff = card.querySelector(".dd-staff-assessment")?.outerHTML ?? "";
    const analyst = card.querySelector(".dd-analyst-report")?.outerHTML ?? "";
    expect(staff).not.toBe("");
    expect(analyst).not.toBe("");
    return normalise(`${staff}
${analyst}`);
  };

  /**
   * Characterisation, in place before the sections were lifted out of
   * offer-card.tsx into a component the squad drawer shares. Its whole job is
   * to fail if the extraction changed the markup - which means the snapshot is
   * never the thing to update when it goes red.
   */
  test.each(["KUPNO", "SPRZEDAZ", "WOLNY", "PRZEDLUZENIE"] as const)(
    "renders %s reports exactly as before the extraction",
    (offerType) => {
      expect(reportRegions(offerType)).toMatchSnapshot();
    }
  );
});

describe("squad tiles open their position", () => {
  const player = (id: string, poz: Player["poz"] = "POM"): Player => ({
    id,
    nazwa: `A. ${id}`,
    poz,
    wiek: 24,
    ovr: 70,
    sufit: 80,
    moj: false,
    cenaZakupu: null,
    ageAtSigning: null,
    mnoznikPlacy: 1,
    wKlubieOd: 0,
    kontraktOd: 0,
    wygasa: false,
  });

  const renderTile = (props: Partial<Parameters<typeof Tile>[0]> = {}): HTMLElement => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push({ container, root });
    act(() =>
      root.render(
        createElement(Tile, {
          player: player("starter"),
          substitutes: [],
          highlighted: false,
          seasonalChanges: { season: 1, byPlayer: {} },
          changePeriod: "fresh",
          ...props,
        })
      )
    );
    return container;
  };

  test("a tile with a player in it is a button that names the position and the action", () => {
    const opened: string[] = [];
    const container = renderTile({
      substitutes: [player("reserve")],
      onOpenPosition: (position) => opened.push(position),
    });

    const tile = container.querySelector<HTMLButtonElement>("button.dd-player-tile");
    expect(tile).not.toBeNull();
    expect(tile?.type).toBe("button");
    expect(tile?.getAttribute("aria-haspopup")).toBe("dialog");
    // The name stays the visible text, so speech input can target it (WCAG
    // 2.5.3); the facts the bare numbers stand for go in the description.
    expect(tile?.hasAttribute("aria-label")).toBe(false);
    const description = document.getElementById(tile?.getAttribute("aria-describedby") ?? "");
    expect(description?.hidden).toBe(true);
    expect(description?.textContent).toBe(
      "Pozycja POM, ocena 70, wiek 24, zmienników: 1 · otwórz raporty zawodników"
    );

    act(() => tile?.click());
    expect(opened).toEqual(["POM"]);
  });

  test("starter and substitute treat last season's delta the same way", () => {
    // The reserve rules used to set the delta's colour unconditionally and
    // outrank .is-neutral by specificity, so in the winter window the starter
    // went neutral and the substitute right below him stayed green.
    const container = renderTile({
      player: player("starter"),
      substitutes: [player("reserve")],
      seasonalChanges: { season: 1, byPlayer: { starter: 3, reserve: 2 } },
      changePeriod: "past",
    });

    const changes = Array.from(container.querySelectorAll(".dd-season-change"));
    expect(changes).toHaveLength(2);
    for (const change of changes) {
      expect(change.className).toContain("is-neutral");
      expect(change.className).not.toContain("is-up");
    }
  });

  test("a player who did not move shows a neutral zero, held in the sign column", () => {
    // "Did not move" and "we have no reading" are different facts, and a
    // blank cell said neither. Zero carries no direction, so it is never
    // coloured even in the window where a real delta is.
    const container = renderTile({
      player: player("starter"),
      substitutes: [player("reserve")],
      seasonalChanges: { season: 2, byPlayer: { starter: 3 } },
      changePeriod: "fresh",
    });

    const [starter, reserve] = Array.from(container.querySelectorAll(".dd-season-change"));
    expect(starter!.textContent).toBe("+3");
    expect(starter!.className).toContain("is-up");
    expect(reserve!.textContent).toBe("•0");
    expect(reserve!.querySelector(".dd-season-change-marker")?.textContent).toBe("•");
    expect(reserve!.querySelector(".dd-season-change-value")?.textContent).toBe("0");
    expect(reserve!.className).toContain("is-neutral");
    expect(reserve!.getAttribute("aria-label")).toBe("ocena bez zmian od poprzedniego sezonu");
  });

  test("season 1 shows a question mark, because no season has been played", () => {
    const container = renderTile({
      player: player("starter"),
      seasonalChanges: { season: 0, byPlayer: {} },
      changePeriod: "unknown",
    });
    const change = container.querySelector(".dd-season-change");

    expect(change?.textContent).toBe("•?");
    expect(change?.querySelector(".dd-season-change-marker")?.textContent).toBe("•");
    expect(change?.className).toContain("is-neutral");
    expect(change?.getAttribute("aria-label")).toBe("brak danych o zmianie oceny");
  });

  test("a player signed after the last pass shows a question mark, not a zero", () => {
    // He was not in the squad when development ran, so there is nothing to
    // report - saying "0" would claim a measurement that never happened.
    const container = renderTile({
      player: { ...player("newcomer"), wKlubieOd: 3 },
      seasonalChanges: { season: 2, byPlayer: {} },
      changePeriod: "fresh",
    });

    const change = container.querySelector(".dd-season-change");
    expect(change?.textContent).toBe("•?");
    expect(change?.querySelector(".dd-season-change-marker")?.textContent).toBe("•");
  });

  test("a fresh delta is coloured, the same delta seen again in winter is not", () => {
    // The bug this pins: changeIsPast used to be derived by comparing
    // ovrChange.season with the current season, and ovrChange.season trails
    // the current season in BOTH windows - so summer was painted as history
    // too and no delta was ever green.
    const summer = renderTile({
      player: player("starter"),
      seasonalChanges: { season: 2, byPlayer: { starter: -2 } },
      changePeriod: "fresh",
    });
    const winter = renderTile({
      player: player("starter"),
      seasonalChanges: { season: 2, byPlayer: { starter: -2 } },
      changePeriod: "past",
    });

    expect(summer.querySelector(".dd-season-change")?.className).toContain("is-down");
    expect(winter.querySelector(".dd-season-change")?.className).toContain("is-neutral");
    // Same number either way - only the coding changes.
    expect(summer.querySelector(".dd-season-change")?.textContent).toBe("−2");
    expect(winter.querySelector(".dd-season-change")?.textContent).toBe("−2");
  });

  test("an expiring contract takes the row's colour instead of adding a label", () => {
    // The label this replaced spanned a whole grid row of a 78px tile. Saying
    // it by absence of colour costs no room at all. Product owner's call,
    // 2026-08-22, knowing that this row then shows neither the quality tone of
    // its ovr nor whether its delta was already read.
    const container = renderTile({
      player: { ...player("leaving"), ovr: 74, wygasa: true },
      substitutes: [{ ...player("staying"), ovr: 55 }],
      seasonalChanges: { season: 2, byPlayer: { leaving: 3, staying: -1 } },
      changePeriod: "fresh",
    });

    const [leaving, staying] = Array.from(container.querySelectorAll(".dd-player-rating"));
    expect(leaving!.className).toContain("is-expiring");
    expect(leaving!.className).not.toContain("is-positive");
    expect(leaving!.querySelector(".dd-season-change")?.className).toContain("is-neutral");

    // The teammate beside him is untouched: this is about one contract, not
    // about the tile.
    expect(staying!.className).toContain("is-negative");
    expect(staying!.querySelector(".dd-season-change")?.className).toContain("is-down");

    // The word is gone from the screen, and the fact is not: it moves into the
    // tile's name, which is all a screen reader gets.
    expect(container.textContent).not.toContain("wygasa");
    expect(container.querySelector(".dd-player-tile")?.getAttribute("aria-label")).toContain(
      "kontrakt wygasa: zawodnik z oceną 74"
    );
  });

  test("every rating carries its own ovr tone, substitutes included", () => {
    // The tone used to hang off the tile, which knows only the starter's ovr -
    // so a 55-rated substitute was painted with the starter's green. Reading
    // the depth of a position means reading each number's own colour.
    const container = renderTile({
      player: { ...player("starter"), ovr: 74 },
      substitutes: [{ ...player("reserve"), ovr: 55 }],
    });

    const [starter, reserve] = Array.from(container.querySelectorAll(".dd-player-rating"));
    expect(starter!.className).toContain("is-positive");
    expect(reserve!.className).toContain("is-negative");
    expect(reserve!.className).toContain("is-reserve");
  });

  test("a rating reads glyph, age, ovr, delta from left to right", () => {
    const container = renderTile({
      player: player("starter"),
      seasonalChanges: { season: 1, byPlayer: { starter: 3 } },
    });
    const rating = container.querySelector(".dd-player-rating");
    const order = Array.from(rating?.querySelectorAll("span, strong") ?? [])
      .map((node) => node.className || node.tagName.toLowerCase())
      .filter((name) => name !== "dd-player-rating-lead");

    expect(order).toEqual([
      "dd-age-trend",
      "dd-player-age",
      "strong",
      "dd-season-change is-up",
      "dd-season-change-value",
    ]);
  });

  test("an empty position stays inert even when a handler is passed", () => {
    const container = renderTile({
      player: { id: "pusty-BR-0", poz: "BR", ovr: null, wiek: null, nazwa: "–", brak: true },
      onOpenPosition: () => {
        throw new Error("an empty tile must not be clickable");
      },
    });

    expect(container.querySelector("button.dd-player-tile")).toBeNull();
    expect(container.querySelector(".dd-player-tile")?.getAttribute("role")).toBe("group");
  });

  test("a tile holds no nested interactive elements", () => {
    // Substitutes used to be a <ul>, which a button may not contain: a button
    // takes phrasing content only.
    const container = renderTile({
      substitutes: [player("reserve-1"), player("reserve-2")],
      onOpenPosition: () => {},
    });
    const tile = container.querySelector("button.dd-player-tile");

    expect(tile?.querySelectorAll("button, a, ul, ol, li")).toHaveLength(0);
    expect(tile?.querySelectorAll(".dd-player-substitute")).toHaveLength(2);
  });

  test("dragging a formation line does not open the tile it ends on", () => {
    // Tiles live inside DragScroller, which drags with the mouse through
    // setPointerCapture. Every drag ends on a tile, so without suppression
    // scrolling a line would open whatever it stopped over.
    let opened = 0;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push({ container, root });
    act(() =>
      root.render(
        createElement(
          DragScroller,
          { label: "Pomoc, przewijana linia" } as never,
          createElement(Tile, {
            player: player("dragged"),
            substitutes: [],
            highlighted: false,
            seasonalChanges: { season: 1, byPlayer: {} },
            changePeriod: "fresh" as const,
            onOpenPosition: () => {
              opened += 1;
            },
          })
        )
      )
    );

    const tile = container.querySelector<HTMLButtonElement>("button.dd-player-tile");
    const scroller = container.querySelector<HTMLElement>(".dd-scroller");
    expect(tile).not.toBeNull();
    expect(scroller).not.toBeNull();

    // jsdom has no PointerEvent and no pointer capture, so the gesture is
    // driven through the same React handlers with mouse-shaped events.
    scroller!.setPointerCapture = () => {};
    scroller!.releasePointerCapture = () => {};
    scroller!.hasPointerCapture = () => true;

    const send = (type: string, clientX: number): void => {
      const event = new MouseEvent(type, { bubbles: true, clientX });
      Object.defineProperty(event, "pointerType", { value: "mouse" });
      Object.defineProperty(event, "pointerId", { value: 1 });
      scroller!.dispatchEvent(event);
    };

    act(() => {
      send("pointerdown", 200);
      send("pointermove", 120);
      send("pointerup", 120);
      tile!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // 80 px of travel is a scroll, not a tap on the tile it happened to end on.
    expect(opened).toBe(0);

    // The suppression lasts exactly one click: the next one, with no drag
    // before it, opens the position as normal.
    act(() => {
      tile!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(opened).toBe(1);
  });

  test("a press that barely moves still counts as a click", () => {
    // The threshold has to tolerate the shake in a real mouse press, or tiles
    // would feel broken.
    let opened = 0;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push({ container, root });
    act(() =>
      root.render(
        createElement(
          DragScroller,
          { label: "Pomoc, przewijana linia" } as never,
          createElement(Tile, {
            player: player("steady"),
            substitutes: [],
            highlighted: false,
            seasonalChanges: { season: 1, byPlayer: {} },
            changePeriod: "fresh" as const,
            onOpenPosition: () => {
              opened += 1;
            },
          })
        )
      )
    );

    const tile = container.querySelector<HTMLButtonElement>("button.dd-player-tile");
    const scroller = container.querySelector<HTMLElement>(".dd-scroller");
    scroller!.setPointerCapture = () => {};
    scroller!.releasePointerCapture = () => {};
    scroller!.hasPointerCapture = () => true;

    const send = (type: string, clientX: number): void => {
      const event = new MouseEvent(type, { bubbles: true, clientX });
      Object.defineProperty(event, "pointerType", { value: "mouse" });
      Object.defineProperty(event, "pointerId", { value: 1 });
      scroller!.dispatchEvent(event);
    };

    act(() => {
      send("pointerdown", 200);
      send("pointermove", 202);
      send("pointerup", 202);
      tile!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(opened).toBe(1);
  });
});

describe("action bar and the space reserved for it cannot show a detached band (Safari white-band fix)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");
  const cssWithoutMedia = css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, "");
  const ruleBody = (selector: string): string => {
    const escaped = selector.replace(/[.#>*[\]:]/g, "\\$&");
    const match = cssWithoutMedia.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    if (!match) throw new Error(`Rule not found: ${selector}`);
    return match[1]!;
  };

  test("the space content reserves for the bar has no panel-coloured backdrop", () => {
    // 2026-09-21: a `.dd-root > main::after` strip used to paint that space
    // in panel colour. It scrolls with the document while the bar is fixed
    // to the viewport, so every event that briefly separates the two
    // (rubber-band overscroll, toolbar collapse, momentum scrolling) showed
    // it as a detached white band on iOS - two fixes closed two triggers
    // and iOS kept finding more. Without it the reserved space is page
    // colour and cannot read as a band. Reintroducing it reopens the bug.
    expect(css).not.toMatch(/\.dd-root > main::after/);
  });

  test("the bar's own transform is the only consumer of --dd-vv-offset, and never negative", () => {
    const body = ruleBody(".dd-action-bar");
    expect(body).toMatch(/transform:\s*translateY\(calc\(-1 \* var\(--dd-vv-offset, 0px\)\)\)/);
  });

  test("viewportCorrectionOffset (the sole writer of --dd-vv-offset) never returns a negative number", () => {
    // Exhaustive-enough sweep standing in for the CSS not being able to
    // clamp itself: every plausible and implausible reading must land at
    // zero or above, so the transform above can never push the bar past its
    // own fixed position and strand it under the browser's toolbar.
    const samples: Array<[number, number, number]> = [
      [800, 800, 0],
      [800, 750, 0],
      [800, 845, 0],
      [800, 1600, 0],
      [800, 400, 400],
      [800, 400, 250],
      [667, 500, 0],
      [667, 900, 0],
    ];
    for (const [layoutHeight, visibleHeight, visibleTop] of samples) {
      expect(
        viewportCorrectionOffset(layoutHeight, visibleHeight, visibleTop)
      ).toBeGreaterThanOrEqual(0);
    }
  });

  test("the skirt behind the bar spans a full viewport, so it - not a transform - covers what JS never measured", () => {
    const body = ruleBody(".dd-action-bar::after");
    expect(body).toMatch(/height:\s*100vh/);
    expect(body).toMatch(/background:\s*var\(--surface-panel\)/);
  });

  test("sticky-action-bar.tsx: the backdrop-opacity write is synchronous with the is-hidden class, not deferred", () => {
    // The className that hides/reveals the bar itself is set at render
    // time, landing in React's paint commit. --dd-action-bar-backdrop-opacity
    // (which the bar's skirt reads) must land in that same commit - a plain
    // useEffect runs a frame later, and on a fast fling that gap is enough
    // for the bar and its skirt to animate visibly out of step. Pinned as a
    // source check because jsdom's act() flushes both effect flavours in the
    // same tick, so a behavioural test alone would not catch a regression
    // back to useEffect.
    const source = readFileSync(
      resolve(process.cwd(), "src/ui/components/sticky-action-bar.tsx"),
      "utf8"
    );
    const writeSite = source.match(
      /(use\w+)\(\(\) => \{\s*document\.documentElement\.style\.setProperty\(\s*"--dd-action-bar-backdrop-opacity"/
    );
    if (!writeSite) throw new Error("--dd-action-bar-backdrop-opacity write site not found");
    expect(writeSite[1]).toBe("useLayoutEffect");
  });
});

describe("landscape white bands fix (2026-09-18, item 3)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");
  const cssWithoutMedia = css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, "");
  const ruleBody = (selector: string): string => {
    const escaped = selector.replace(/[.#>*[\]:]/g, "\\$&");
    const match = cssWithoutMedia.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    if (!match) throw new Error(`Rule not found: ${selector}`);
    return match[1]!;
  };

  test("html has a real page-colour background, not the browser's default white canvas", () => {
    // `body`/`.dd-root` only paint --surface-page over their own boxes -
    // WebKit's elastic overscroll bounce on a wide-but-short landscape
    // viewport can briefly slide that box and expose bare `html` beneath
    // it. Giving `html` the same colour makes that reveal invisible.
    expect(ruleBody("html")).toMatch(/background:\s*var\(--surface-page\)/);
  });
});

describe("landscape home-indicator clearance fix (2026-09-18, item 4)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");

  test("a short viewport raises the safe-area floor past the portrait-only fallback", () => {
    // 15px/20px are floors for devices with NO safe area at all; a
    // landscape iPhone always has one (21pt, Apple's documented landscape
    // value), so a short viewport gets a floor that matches it instead of
    // trusting env(safe-area-inset-bottom) alone - some third-party WebKit
    // browsers (Vivaldi for iOS) are known not to forward it accurately in
    // landscape.
    const shortViewportBlocks = [
      ...css.matchAll(/@media \(max-height: 600px\)\s*\{((?:[^{}]*\{[^}]*\})*)\s*\}/g),
    ].map(([, body]) => body);
    const block = shortViewportBlocks.find((body) => body!.includes(".dd-action-bar-inner"));
    expect(block).toBeDefined();
    expect(block).toMatch(/\.dd-action-bar-inner\s*\{[^}]*padding-bottom:\s*max\(21px,/);
    expect(block).toMatch(/:has\(> button:only-child\)\s*\{[^}]*padding-bottom:\s*max\(26px,/);
    // Both floors still credit --dd-vv-lift against the safe-area inset, so
    // the on-screen-keyboard case (bar already lifted clear) never gets a
    // second, redundant gap stacked underneath it.
    expect(block).toMatch(/var\(--dd-vv-lift\)/);
  });

  test("the short-viewport threshold matches the shared compact query's height threshold", () => {
    // CSS media features cannot import the JS constant (ACTION_BAR_COMPACT_QUERY
    // in action-bar-query.ts), so the number is necessarily duplicated - this
    // pins both copies to the same value so they cannot drift apart silently.
    expect(css).toMatch(/@media \(max-height: 600px\)/);
  });
});

describe("analyst rail markers at the same percentile", () => {
  test("both metrics keep a marker, so the circle is never replaced by the diamond", () => {
    const card = renderOfferCard("KUPNO", [
      { metricId: "goalsPreventedPer90", percentile: 70.2, value: 0.1 },
      { metricId: "positioningErrorAverage", percentile: 69.8, value: 1.6 },
    ]);
    const markers = Array.from(card.querySelectorAll(".dd-evidence-rail .dd-rail-marker"));
    expect(
      markers
        .map((marker) => marker.getAttribute("data-marker"))
        .sort((a, b) => String(a).localeCompare(String(b)))
    ).toEqual(["circle", "diamond"]);
    expect(markers.map((marker) => (marker as HTMLElement).style.left)).toEqual(["70%", "70%"]);
  });

  test("the smaller circle is stacked above the diamond", () => {
    expect(cssRuleBody(styles(), '.dd-rail-marker[data-marker="circle"]')).toContain("z-index: 1");
  });
});

test("an extension card states the club and the tenure on one line", () => {
  const card = renderOfferCard("PRZEDLUZENIE");
  const club = card.querySelector(".dd-offer-club");
  expect(club?.textContent).toMatch(/ · w klubie od początku$/);
  expect(card.textContent).not.toContain("W klubie od");
});

describe("market label on the offer card", () => {
  test("a sale reads the market from the seller's side", () => {
    // A glut cuts a sale fee to x0.78 and stiffens the buyer: never a green
    // "okazja". A shortage lifts it to x1.4: good news for the seller.
    expect(marketLabel("SPRZEDAZ", "obfity")).toEqual({
      label: "zaniżona",
      className: "is-negative",
    });
    expect(marketLabel("SPRZEDAZ", "pusty")).toEqual({
      label: "korzystna",
      className: "is-positive",
    });
    expect(marketLabel("SPRZEDAZ", "spokoj").className).toBe("is-neutral");
  });

  test.each(["KUPNO", "PANIC", "WOLNY", "PRZEDLUZENIE"] as const)(
    "%s keeps the buyer's reading",
    (offerType) => {
      expect(marketLabel(offerType, "obfity")).toEqual({
        label: "okazja",
        className: "is-positive",
      });
      expect(marketLabel(offerType, "pusty")).toEqual({
        label: "zawyżona",
        className: "is-negative",
      });
    }
  );
});

test("transfer log keys stay unique and keep their value as entries arrive", () => {
  const older = keyedTransferLog(["B", "A", "A"]).map(({ key }) => key);
  expect(new Set(older).size).toBe(3);
  // A new entry on top leaves every existing key as it was.
  const newer = keyedTransferLog(["A", "B", "A", "A"]).map(({ key }) => key);
  expect(newer.slice(1)).toEqual(older);
  expect(new Set(newer).size).toBe(4);
});
