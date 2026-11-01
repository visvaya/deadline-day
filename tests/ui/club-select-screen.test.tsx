/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLUBS } from "../../src/data/clubs";
import { PANEL_TOP_MARGIN } from "../../src/ui/club-select-scroll";
import {
  ClubSelectScreen,
  accentOutlineTone,
  ratingDots,
  ratingLabel,
  ratingLevel,
  type RatingDotState,
} from "../../src/ui/screens/club-select-screen";
import { clearSetupDraft, readSetupDraft } from "../../src/ui/setup-draft";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Step 2 of career setup, standing alone (not wired into app.tsx yet - see
 * the component's own docblock). This screen replaces the difficulty pool
 * the old flow drew a club from, so the strongest single requirement here is
 * negative: nothing on it may look like the old three-level difficulty
 * choice, and nothing may leak the hidden ceiling.
 */

let mounted: { container: HTMLDivElement; root: Root } | undefined;

afterEach(() => {
  if (mounted) {
    const { container, root } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = undefined;
  }
  vi.restoreAllMocks();
  clearSetupDraft();
});

const render = async (
  props: { initialSelectedClubId?: string | null } = {}
): Promise<{
  container: HTMLDivElement;
  backs: number;
  starts: string[];
}> => {
  const starts: string[] = [];
  let backs = 0;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () =>
    root.render(
      createElement(ClubSelectScreen, {
        onBack: () => {
          backs += 1;
        },
        onStart: (clubId: string) => starts.push(clubId),
        manager: { firstName: "Jan", lastName: "Kowalski" },
        timerWl: true,
        ...props,
      })
    )
  );
  return {
    container,
    get backs() {
      return backs;
    },
    starts,
  };
};

const button = (container: HTMLElement, action: string): HTMLButtonElement =>
  container.querySelector<HTMLButtonElement>(`[data-dd-action="${action}"]`)!;

const radio = (container: HTMLElement, clubId: string): HTMLInputElement =>
  container.querySelector<HTMLInputElement>(`input[type="radio"][value="${clubId}"]`)!;

const click = async (element: HTMLElement): Promise<void> => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("ratingLabel", () => {
  test("attack labels at and around every threshold", () => {
    expect(ratingLabel(1.1, "attack")).toBe("bardzo mocny");
    expect(ratingLabel(1.099999, "attack")).toBe("mocny");
    expect(ratingLabel(1.03, "attack")).toBe("mocny");
    expect(ratingLabel(1.029999, "attack")).toBe("przeciętny");
    expect(ratingLabel(0.97, "attack")).toBe("przeciętny");
    expect(ratingLabel(0.969999, "attack")).toBe("słaby");
    expect(ratingLabel(0.9, "attack")).toBe("słaby");
    expect(ratingLabel(0.899999, "attack")).toBe("bardzo słaby");
  });

  test("defence labels at and around every threshold", () => {
    expect(ratingLabel(1.1, "defence")).toBe("bardzo mocna");
    expect(ratingLabel(1.099999, "defence")).toBe("mocna");
    expect(ratingLabel(1.03, "defence")).toBe("mocna");
    expect(ratingLabel(1.029999, "defence")).toBe("przeciętna");
    expect(ratingLabel(0.97, "defence")).toBe("przeciętna");
    expect(ratingLabel(0.969999, "defence")).toBe("słaba");
    expect(ratingLabel(0.9, "defence")).toBe("słaba");
    expect(ratingLabel(0.899999, "defence")).toBe("bardzo słaba");
  });
});

describe("accentOutlineTone", () => {
  test("changes between a light and a dark accent colour", () => {
    const forWhite = accentOutlineTone("#ffffff");
    const forBlack = accentOutlineTone("#000000");
    expect(forWhite).not.toBe(forBlack);
    expect(forWhite).toBe("dark");
    expect(forBlack).toBe("light");
  });
});

describe("club select screen", () => {
  test("renders a fieldset/legend with all eighteen clubs as native radios", async () => {
    const { container } = await render();

    const fieldset = container.querySelector("fieldset")!;
    expect(fieldset).not.toBeNull();
    expect(fieldset.querySelector("legend")).not.toBeNull();
    const radios = container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios.length).toBe(18);
    expect(new Set([...radios].map((input) => input.value)).size).toBe(18);
    for (const club of CLUBS) {
      expect(radio(container, club.clubId)).not.toBeNull();
    }
  });

  test("starts with nothing selected and a disabled start button", async () => {
    const { container } = await render();

    expect(
      [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].some(
        (input) => input.checked
      )
    ).toBe(false);
    expect(container.querySelector(".dd-club-detail")).toBeNull();
    expect(container.textContent).toContain("Dostępne kluby");
    expect(button(container, "zacznij-kariere").disabled).toBe(true);
  });

  describe("setup-draft autosave (setup-draft.ts)", () => {
    test("preselects the club from initialSelectedClubId", async () => {
      const club = CLUBS[3];
      const { container } = await render({ initialSelectedClubId: club!.clubId });

      expect(radio(container, club!.clubId).checked).toBe(true);
      expect(button(container, "zacznij-kariere").disabled).toBe(false);
    });

    test("ignoring initialSelectedClubId (null) starts with nothing selected", async () => {
      const { container } = await render({ initialSelectedClubId: null });

      expect(
        [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')].some(
          (input) => input.checked
        )
      ).toBe(false);
    });

    test("marks step 'club' as soon as the screen mounts, even before picking anything", async () => {
      await render();

      expect(readSetupDraft()?.step).toBe("club");
      expect(readSetupDraft()?.clubId).toBeNull();
    });

    test("selecting a club writes it to the draft", async () => {
      const club = CLUBS[5];
      const { container } = await render();

      await click(radio(container, club!.clubId));

      expect(readSetupDraft()).toMatchObject({ step: "club", clubId: club!.clubId });
    });
  });

  // Correction 3 (2026-09-15): the standalone "Wybierz klub, aby zobaczyć
  // jego szczegóły." prompt is gone - the intro sentence carries that
  // instruction now, so it must never disappear along with the prompt it
  // replaced.
  test("correction 3: the intro sentence tells the player selecting reveals details, with no separate prompt line", async () => {
    const { container } = await render();

    expect(container.querySelector(".dd-club-detail-prompt")).toBeNull();
    expect(container.textContent).toContain(
      "Wybierz jeden z osiemnastu klubów Ekstraklasy, który chciałbyś poprowadzić. Po zaznaczeniu zobaczysz szczegóły."
    );
  });

  test("selecting a club shows exactly six data-dd-club-stat facts and enables start", async () => {
    const { container } = await render();

    await click(radio(container, "lech-poznan"));

    const stats = container.querySelectorAll("[data-dd-club-stat]");
    expect(stats.length).toBe(6);
    const keys = [...stats].map((node) => node.getAttribute("data-dd-club-stat"));
    expect(new Set(keys)).toEqual(
      new Set(["miejsce", "punkty", "budzet", "przychod", "zmiana-budzetu", "udzial-plac"])
    );
    expect(button(container, "zacznij-kariere").disabled).toBe(false);
  });

  test("never mentions the retired three-level difficulty", async () => {
    const { container } = await render();
    await click(radio(container, "lech-poznan"));

    // Word-boundaried: the product owner's 2026-09-15 footnote wording
    // ("średniej wygenerowanej kadrze" - "the average generated squad") uses
    // the same stem as the retired "średni" difficulty label without being
    // an occurrence of it, so a bare substring match would false-positive on
    // legitimate Polish vocabulary that has nothing to do with difficulty.
    expect(container.textContent).not.toMatch(/\błatwy\b|\bśredni\b|\btrudny\b/i);
  });

  test("never leaks a ceiling channel", async () => {
    const { container } = await render();
    await click(radio(container, "radomiak-radom"));

    expect(container.textContent?.toLowerCase()).not.toContain("sufit");
    expect(container.innerHTML.toLowerCase()).not.toContain("staffoutlook");
    expect(container.innerHTML.toLowerCase()).not.toContain("marketedge");
  });

  test("forecast facts, the European berth and the forecast footnote are three separate, distinguishable captions", async () => {
    const { container } = await render();
    await click(radio(container, "lech-poznan"));

    // Round 3 (2026-09-15) added a third `.dd-club-caption` - the shared
    // footnote for the three pre-season estimates - below the European cup
    // line, so this now checks three, not two.
    const captions = [...container.querySelectorAll(".dd-club-caption")].map((n) => n.textContent);
    expect(captions.length).toBe(3);
    expect(new Set(captions).size).toBe(3);
    expect(captions[0]).toMatch(/1\.\s*sezon(ie)?/);
    expect(captions[1]).toMatch(/1\.\s*sezon(ie)?/);
    // Correction 2 (2026-09-15), amended in round 3 (label style, no
    // trailing punctuation) and round 5 (accuracy: only some of the six
    // numbers are forecasts - the opening budget and recurring revenue are
    // facts about the club as it stands, so "Prognoza" alone mislabelled
    // half the group).
    expect(captions[0]).toBe("Kluczowe fakty i prognozy na 1. sezon kadencji");
    // Lech has a confirmed European berth in the pinned 2026/27 layout. The
    // value states a qualifying round, never a guaranteed league phase
    // (correction 5, 2026-09-15; spec §6.2/§6.3): "kwalifikacje" plus the
    // genitive "Ligi Mistrzów", not the nominative EUROPEAN_CUP_NAMES form.
    expect(captions[1]).toBe("Europejskie puchary w 1. sezonie: kwalifikacje Ligi Mistrzów.");
  });

  test("the caption above the six facts precedes the stat grid in the DOM, not after it", async () => {
    const { container } = await render();
    await click(radio(container, "lech-poznan"));

    const detail = container.querySelector(".dd-club-detail")!;
    const nodes = [...detail.querySelectorAll(".dd-club-caption, .dd-club-stat-grid")];
    expect(nodes[0]!.className).toBe("dd-club-caption dd-club-forecast-note");
    expect(nodes[0]!.textContent).toBe("Kluczowe fakty i prognozy na 1. sezon kadencji");
    expect(nodes[1]!.className).toBe("dd-club-stat-grid");
  });

  test("shows the explicit no-Europe caption for a club without a starting berth", async () => {
    const { container } = await render();
    await click(radio(container, "cracovia"));

    const captions = [...container.querySelectorAll(".dd-club-caption")].map((n) => n.textContent);
    // Correction 1 (2026-09-15): the value becomes "brak", not "bez Europy".
    expect(captions).toContain("Europejskie puchary w 1. sezonie: brak.");
  });

  test("Zacznij karierę calls onStart with the selected club id, Wstecz calls onBack", async () => {
    const { container, starts } = await render();
    await click(radio(container, "pogon-szczecin"));

    await click(button(container, "zacznij-kariere"));
    expect(starts).toEqual(["pogon-szczecin"]);

    const second = await render();
    await click(button(second.container, "wstecz"));
    expect(second.backs).toBe(1);
  });

  test("a club with a confirmed accent renders a coloured badge with a reactive outline", async () => {
    const { container } = await render();
    await click(radio(container, "legia-warszawa"));

    const badge = container.querySelector(".dd-club-badge.has-accent") as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.style.getPropertyValue("--dd-club-accent")).toBeTruthy();
  });

  test("a club without a confirmed accent still renders a neutral monogram without crashing", async () => {
    const { container } = await render();
    // rakow-czestochowa has no RSSSF colours-page entry (see the table's own
    // doc comment), so it exercises the fallback path directly rather than
    // relying on a club that happens to lack a colour today.
    await click(radio(container, "rakow-czestochowa"));

    const badge = container.querySelector(".dd-club-detail-heading .dd-club-badge") as HTMLElement;
    expect(badge).not.toBeNull();
    expect(badge.classList.contains("has-accent")).toBe(false);
    expect(badge.textContent).toBe("RC");
  });

  test("a light accent colour (Jagiellonia's yellow) resolves a dark outline and dark monogram", async () => {
    const { container } = await render();
    await click(radio(container, "jagiellonia-bialystok"));

    const badge = container.querySelector(".dd-club-detail-heading .dd-club-badge") as HTMLElement;
    expect(badge.classList.contains("has-accent")).toBe(true);
    expect(badge.classList.contains("is-dark-outline")).toBe(true);
    // The outline colour is a CSS token per tone class, not an inline value.
    expect(badge.style.getPropertyValue("--dd-club-outline")).toBe("");
  });

  test("no text outside the badge shape ever takes a club colour", async () => {
    const { container } = await render();
    await click(radio(container, "legia-warszawa"));

    const heading = container.querySelector(".dd-club-detail-heading h2")!;
    expect(heading.getAttribute("style")).toBeNull();
    for (const value of container.querySelectorAll(".dd-club-stat-value")) {
      expect(value.getAttribute("style")).toBeNull();
    }
  });

  // Round 3 (2026-09-15) appended a decorative, aria-hidden "*" onto this
  // label's DOM (see the footnote describe-block below) - `textContent`
  // therefore now includes it, even though it is not part of the label
  // string itself.
  test("the six-fact label reads Oczekiwane punkty, not just Punkty", async () => {
    const { container } = await render();
    await click(radio(container, "lech-poznan"));

    const punkty = container.querySelector('[data-dd-club-stat="punkty"] .dd-club-stat-label');
    expect(punkty?.textContent).toBe("Oczekiwane punkty*");
  });

  // Round 5 correction (2026-09-15): "Miejsce" alone did not say this is a
  // projection, unlike its neighbour "Oczekiwane punkty" - the key
  // (`data-dd-club-stat="miejsce"`) is unchanged, only the label text.
  test("the six-fact label reads Prognozowane miejsce, not just Miejsce", async () => {
    const { container } = await render();
    await click(radio(container, "lech-poznan"));

    const miejsce = container.querySelector('[data-dd-club-stat="miejsce"] .dd-club-stat-label');
    expect(miejsce?.textContent).toBe("Prognozowane miejsce*");
  });

  test("the budget-change label states it concerns the end of the season", async () => {
    const { container } = await render();
    await click(radio(container, "lech-poznan"));

    const label = container.querySelector(
      '[data-dd-club-stat="zmiana-budzetu"] .dd-club-stat-label'
    );
    expect(label?.textContent).toBe("Prognozowana zmiana budżetu po sezonie*");
  });

  test("correction 2: the detail panel renders before the club list's own heading, not after", async () => {
    const { container } = await render();
    await click(radio(container, "lech-poznan"));

    const main = container.querySelector("main")!;
    const detailIndex = [...main.children].findIndex(
      (node) => node.id === "club-detail-panel" && node.querySelector(".dd-club-detail") !== null
    );
    const fieldsetIndex = [...main.children].findIndex((node) => node.tagName === "FIELDSET");
    expect(detailIndex).toBeGreaterThanOrEqual(0);
    expect(fieldsetIndex).toBeGreaterThan(detailIndex);
  });

  test("correction 4: Zacznij karierę renders before Wstecz in the action bar", async () => {
    const { container } = await render();
    await click(radio(container, "lech-poznan"));

    const bar = container.querySelector(".dd-action-bar-inner")!;
    const primaryIndex = [...bar.querySelectorAll("*")].findIndex(
      (node) => node.getAttribute("data-dd-action") === "zacznij-kariere"
    );
    const secondaryIndex = [...bar.querySelectorAll("*")].findIndex(
      (node) => node.getAttribute("data-dd-action") === "wstecz"
    );
    expect(primaryIndex).toBeGreaterThanOrEqual(0);
    expect(secondaryIndex).toBeGreaterThan(primaryIndex);
  });

  // jsdom never lays anything out: every rectangle is zero, `offsetHeight`
  // is zero and the document has no height. These helpers stand in for a
  // real 360x800 layout scrolled to y=1000, so the effect's single layout
  // read has something to compute from. The arithmetic itself is pinned in
  // tests/ui/club-select-scroll.test.ts; these tests pin the wiring - which
  // elements are read, which modality counts, and that exactly one scroll
  // call is made.
  type Layout = {
    readonly panelTop: number;
    readonly panelHeight: number;
    readonly row?: { readonly top: number; readonly bottom: number };
  };

  const rectOf = (top: number, height: number): DOMRect => ({
    top,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });

  const BAR_TOP = 690;

  const stubRect = (element: Element, value: DOMRect): void => {
    Object.defineProperty(element, "getBoundingClientRect", {
      configurable: true,
      value: () => value,
    });
  };

  // Called after `render()`: the wrapper, the bar and every row exist from
  // the first paint; the bordered box does not, so its height is stubbed on
  // the prototype (the effect reads no other `offsetHeight` on this path).
  const stubLayout = (container: HTMLElement, layout: Layout) => {
    // The wrapper is already at its final height here (no transition in
    // jsdom), so its rectangle includes the panel's 16px top margin.
    stubRect(
      container.querySelector(".dd-club-detail-reveal")!,
      rectOf(layout.panelTop - 16, layout.panelHeight + 16)
    );
    // Document-wide, like the effect's own lookup: other tests in this file
    // leave bars of their own in `document.body`.
    for (const bar of document.querySelectorAll(".dd-action-bar")) {
      stubRect(bar, rectOf(BAR_TOP, 110));
    }
    if (layout.row) {
      for (const label of container.querySelectorAll("label")) {
        stubRect(label, rectOf(layout.row.top, layout.row.bottom - layout.row.top));
      }
    }
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(layout.panelHeight);
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      () => ({ marginTop: "16px" }) as CSSStyleDeclaration
    );
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(5000);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(1000);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    // Nothing may fall back to the old multi-scroll approach.
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const scrollBy = vi.fn();
    vi.stubGlobal("scrollBy", scrollBy);
    return { scrollTo, scrollIntoView, scrollBy };
  };

  const pointerInput = () => window.dispatchEvent(new Event("pointerdown"));
  const keyboardInput = () =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));

  const cleanUpLayout = () => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    vi.unstubAllGlobals();
  };

  // Correction 2 (2026-09-15): a tap reveals the panel, top first, with the
  // same 16px breathing room above it that the panel keeps from the note.
  test("a pointer selection scrolls an off-screen panel into view with exactly one smooth scroll", async () => {
    const layout: Layout = { panelTop: -400, panelHeight: 300 };
    const { container } = await render();
    const spies = stubLayout(container, layout);

    pointerInput();
    await click(radio(container, "lech-poznan"));

    expect(spies.scrollTo).toHaveBeenCalledTimes(1);
    expect(spies.scrollTo).toHaveBeenCalledWith({ top: 1000 - 400 - 16, behavior: "smooth" });
    expect(spies.scrollIntoView).not.toHaveBeenCalled();
    expect(spies.scrollBy).not.toHaveBeenCalled();
    cleanUpLayout();
  });

  test("prefers-reduced-motion swaps the scroll to an instant jump", async () => {
    const layout: Layout = { panelTop: -400, panelHeight: 300 };
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    );
    const { container } = await render();
    const spies = stubLayout(container, layout);

    pointerInput();
    await click(radio(container, "lech-poznan"));

    expect(spies.scrollTo).toHaveBeenCalledWith({ top: 1000 - 400 - 16, behavior: "auto" });
    cleanUpLayout();
  });

  // A native radio group fires `onChange` on every arrow press. Once the
  // panel and the focused row are both in place, arrowing must not scroll.
  test("does not scroll while the panel and the focused row are already in place", async () => {
    const layout: Layout = { panelTop: 40, panelHeight: 300, row: { top: 500, bottom: 544 } };
    const { container } = await render();
    const spies = stubLayout(container, layout);

    keyboardInput();
    for (const clubId of ["lech-poznan", "legia-warszawa", "cracovia"]) {
      radio(container, clubId).focus();
      await click(radio(container, clubId));
    }

    expect(spies.scrollTo).not.toHaveBeenCalled();
    cleanUpLayout();
  });

  // Product owner report (2026-09-17): the focused radio ended under the
  // action bar. A keyboard selection keeps the row above the bar.
  test("a keyboard selection lifts a focused row out from under the action bar in one scroll", async () => {
    const layout: Layout = { panelTop: 40, panelHeight: 300, row: { top: 700, bottom: 744 } };
    const { container } = await render();
    const spies = stubLayout(container, layout);

    keyboardInput();
    radio(container, "gornik-zabrze").focus();
    await click(radio(container, "gornik-zabrze"));

    expect(spies.scrollTo).toHaveBeenCalledTimes(1);
    expect(spies.scrollTo).toHaveBeenCalledWith({
      top: 1000 + 744 - (BAR_TOP - 10),
      behavior: "smooth",
    });
    expect(spies.scrollIntoView).not.toHaveBeenCalled();
    expect(spies.scrollBy).not.toHaveBeenCalled();
    cleanUpLayout();
  });

  test("a pointer selection ignores the row and keeps the panel in view", async () => {
    const layout: Layout = { panelTop: 40, panelHeight: 300, row: { top: 700, bottom: 744 } };
    const { container } = await render();
    const spies = stubLayout(container, layout);

    pointerInput();
    radio(container, "gornik-zabrze").focus();
    await click(radio(container, "gornik-zabrze"));

    expect(spies.scrollTo).not.toHaveBeenCalled();
    cleanUpLayout();
  });

  test("correction 9: the compact list shows each club's expected points, Polish-comma formatted", async () => {
    const { container } = await render();

    const label = radio(container, "lech-poznan").closest("label")!;
    const annotation = label.querySelector(".dd-club-radio-points");
    expect(annotation).not.toBeNull();
    expect(annotation!.textContent).toMatch(/^\(\d+,\d xPts\)$/);
  });

  // Round 3 correction (2026-09-15): one shared footnote for the three
  // pre-season estimates, accessibly tied to each marked label rather than
  // left as a bare, meaningless "*" for screen-reader users.
  describe("round 3: pre-season estimate footnote", () => {
    const FOOTNOTE_KEYS = ["miejsce", "punkty", "zmiana-budzetu"] as const;
    const UNMARKED_KEYS = ["budzet", "przychod", "udzial-plac"] as const;

    test("exactly the three forecast stats carry the asterisk and are described by the shared footnote", async () => {
      const { container } = await render();
      await click(radio(container, "lech-poznan"));

      const footnote = container.querySelector("#club-forecast-footnote");
      expect(footnote).not.toBeNull();
      // Product owner decision, 2026-09-15: the footnote text now also
      // explains the parenthesised cup-free figure on "zmiana-budzetu".
      expect(footnote!.textContent).toContain(
        "Szacunki bazujące na średniej wygenerowanej kadrze."
      );
      expect(footnote!.textContent).toContain(
        "Zespół powstaje na nowo w każdej karierze, więc rzeczywiste liczby zwykle będą nieco inne."
      );
      expect(footnote!.textContent).toContain(
        "Liczba główna wlicza przewidywany przychód z europejskich pucharów, wartość w nawiasie go pomija."
      );
      // No em dash anywhere in player-facing text, per the project-wide rule.
      expect(footnote!.textContent).not.toContain(String.fromCodePoint(0x2014));

      for (const key of FOOTNOTE_KEYS) {
        const stat = container.querySelector(`[data-dd-club-stat="${key}"]`)!;
        expect(stat.getAttribute("aria-describedby")).toBe("club-forecast-footnote");
        expect(stat.textContent).toContain("*");
      }

      for (const key of UNMARKED_KEYS) {
        const stat = container.querySelector(`[data-dd-club-stat="${key}"]`)!;
        expect(stat.getAttribute("aria-describedby")).toBeNull();
        const label = stat.querySelector(".dd-club-stat-label")!;
        expect(label.textContent).not.toContain("*");
      }
    });

    test("the asterisk glyph itself is aria-hidden, so the accessible link runs through aria-describedby, not the punctuation mark", async () => {
      const { container } = await render();
      await click(radio(container, "lech-poznan"));

      for (const key of FOOTNOTE_KEYS) {
        const label = container.querySelector(`[data-dd-club-stat="${key}"] .dd-club-stat-label`)!;
        const asteriskNode = [...label.children].find((child) => child.textContent === "*");
        expect(asteriskNode).not.toBeUndefined();
        expect(asteriskNode!.getAttribute("aria-hidden")).toBe("true");
      }
    });

    test("the footnote sits below the European cup line, not above the six-fact grid", async () => {
      const { container } = await render();
      await click(radio(container, "lech-poznan"));

      const detail = container.querySelector(".dd-club-detail")!;
      const captions = [...detail.querySelectorAll(".dd-club-caption")];
      const footnoteIndex = captions.findIndex((n) => n.id === "club-forecast-footnote");
      const cupIndex = captions.findIndex((n) =>
        (n.textContent ?? "").startsWith("Europejskie puchary")
      );
      expect(footnoteIndex).toBeGreaterThan(cupIndex);
    });
  });

  // Product owner decision, 2026-09-15: the main "zmiana-budzetu" value now
  // includes expected European cup income; the cup-free figure moves into
  // parentheses, but only for the five clubs with a season-1 berth.
  describe("cup-inclusive budget change with the cup-free figure in parentheses", () => {
    test("a club with a berth (Lech) shows the cup-inclusive value with the cup-free one in parentheses", async () => {
      const { container } = await render();
      await click(radio(container, "lech-poznan"));

      const value = container.querySelector(
        '[data-dd-club-stat="zmiana-budzetu"] .dd-club-stat-value'
      );
      expect(value).not.toBeNull();
      // Regression-pinned to the figures the task itself names.
      expect(value!.textContent).toContain("+1,83");
      expect(value!.textContent).toMatch(/\(\+0,78\s*mln\s*€\)/);
      const parenthetical = value!.querySelector(".dd-club-stat-value-cupfree");
      expect(parenthetical).not.toBeNull();
    });

    test("a club with no starting berth (Cracovia) shows a single value, no parentheses", async () => {
      const { container } = await render();
      await click(radio(container, "cracovia"));

      const value = container.querySelector(
        '[data-dd-club-stat="zmiana-budzetu"] .dd-club-stat-value'
      );
      expect(value).not.toBeNull();
      expect(value!.textContent).not.toContain("(");
      expect(value!.querySelector(".dd-club-stat-value-cupfree")).toBeNull();
    });

    test("every club without a starting berth shows no parenthesis, every club with one does", async () => {
      const { container } = await render();
      const BERTH_CLUB_IDS = new Set([
        "lech-poznan",
        "gornik-zabrze",
        "jagiellonia-bialystok",
        "rakow-czestochowa",
        "gks-katowice",
      ]);
      for (const club of CLUBS) {
        await click(radio(container, club.clubId));
        const value = container.querySelector(
          '[data-dd-club-stat="zmiana-budzetu"] .dd-club-stat-value'
        )!;
        const hasParenthesis = value.querySelector(".dd-club-stat-value-cupfree") !== null;
        expect(hasParenthesis, club.clubId).toBe(BERTH_CLUB_IDS.has(club.clubId));
      }
    });

    test("the parenthesised value is tied to the shared footnote via aria-describedby, never announced as a bare, unexplained number", async () => {
      const { container } = await render();
      await click(radio(container, "lech-poznan"));

      const stat = container.querySelector('[data-dd-club-stat="zmiana-budzetu"]')!;
      expect(stat.getAttribute("aria-describedby")).toBe("club-forecast-footnote");
      expect(stat.querySelector(".dd-club-stat-value-cupfree")).not.toBeNull();
    });
  });

  // A11y fix (2026-09-16, HIGH #4): the detail panel had no live region and
  // no programmatic relationship to the radios that drive it, and it sits
  // BEFORE the fieldset in the DOM - a screen-reader user selecting a club
  // had the new content behind their reading position with no signal it
  // appeared at all.
  describe("a11y fix: live announcement and radio/panel relationship", () => {
    test("selecting a club announces it in a polite, visually hidden status region", async () => {
      const { container } = await render();

      await click(radio(container, "lech-poznan"));

      const status = container.querySelector('[role="status"][aria-live="polite"]')!;
      expect(status).not.toBeNull();
      expect(status.classList.contains("dd-visually-hidden")).toBe(true);
      expect(status.textContent).toBe("Wybrano: Lech Poznań.");
    });

    // The region must exist before the first change so assistive tech has
    // something to diff against - not appear and get its content filled in
    // on the same render as the first selection.
    test("the status region exists (empty) before any club is selected", async () => {
      const { container } = await render();

      const status = container.querySelector('[role="status"][aria-live="polite"]');
      expect(status).not.toBeNull();
      expect(status!.textContent).toBe("");
    });

    test("the announcement updates on every subsequent selection, terse and singular", async () => {
      const { container } = await render();
      const status = () => container.querySelector('[role="status"][aria-live="polite"]')!;

      await click(radio(container, "lech-poznan"));
      expect(status().textContent).toBe("Wybrano: Lech Poznań.");

      await click(radio(container, "cracovia"));
      expect(status().textContent).toBe("Wybrano: Cracovia.");
      // Never assertive - a native radio group fires this on every arrow
      // press, so an interrupting announcement would be worse than none.
      expect(status().getAttribute("aria-live")).toBe("polite");
    });

    test("every radio carries an explicit aria-controls relationship to the detail panel", async () => {
      const { container } = await render();

      for (const club of CLUBS) {
        expect(radio(container, club.clubId).getAttribute("aria-controls")).toBe(
          "club-detail-panel"
        );
      }

      await click(radio(container, "lech-poznan"));
      const panel = container.querySelector(".dd-club-detail")!;
      expect(panel.closest("[id]")!.id).toBe("club-detail-panel");
    });

    // Regression test for the critical axe finding (aria-valid-attr-value)
    // this follow-up fixes: `aria-controls` had been pointing at an id that
    // only existed once the detail panel's wrapper div was conditionally
    // rendered on `detail` - before any selection, the id was not in the
    // document at all, on every one of the eighteen radios. jsdom tests
    // never caught this because nothing asserted the referenced id actually
    // resolves; this asserts it directly, in both states.
    test("aria-controls always resolves to a real element in the document, both before and after a selection", async () => {
      const { container } = await render();

      const controlledId = radio(container, "lech-poznan").getAttribute("aria-controls")!;
      expect(controlledId).toBeTruthy();
      // No club selected yet: the id must still resolve to something in the
      // document, not dangle.
      expect(container.querySelector(`#${controlledId}`)).not.toBeNull();

      await click(radio(container, "lech-poznan"));

      // Same id, now the detail content has actually filled it in - still
      // resolves, and every other radio's aria-controls points at that same,
      // now-populated, element.
      expect(container.querySelector(`#${controlledId}`)).not.toBeNull();
      for (const club of CLUBS) {
        expect(radio(container, club.clubId).getAttribute("aria-controls")).toBe(controlledId);
      }
    });
  });
});

describe("ratingLevel and ratingDots", () => {
  // Correction 4 (2026-09-15): `ratingDots` used to hand back a string of
  // two different glyphs ("●"/"○") for the caller to print. It now hands
  // back one state per dot so the component can render every dot from one
  // shared element/box - see the sizing tests below for why that mattered.
  test("ratingDots returns exactly five states, filled count matching ratingLevel", () => {
    const filledCount = (states: readonly RatingDotState[]): number =>
      states.filter((state) => state === "filled").length;

    expect(ratingDots(1.24)).toEqual(["filled", "filled", "filled", "filled", "filled"]);
    expect(ratingDots(1.02)).toEqual(["filled", "filled", "filled", "empty", "empty"]);
    expect(ratingDots(0.84)).toEqual(["filled", "empty", "empty", "empty", "empty"]);
    for (const value of [0.5, 0.8, 0.9, 0.97, 1.0, 1.03, 1.1, 1.3]) {
      const states = ratingDots(value);
      expect(states.length).toBe(5);
      expect(filledCount(states)).toBe(ratingLevel(value));
    }
  });

  // Boundary values: ratingLevel never returns 0, so the weakest row (level
  // 1) is the closest thing to "all empty" this indicator ever renders, and
  // the strongest (level 5) is genuinely all filled.
  test("boundary rows: level 5 is entirely filled, level 1 is one filled dot and four empty", () => {
    expect(ratingLevel(1.24)).toBe(5);
    expect(ratingDots(1.24).every((state) => state === "filled")).toBe(true);
    expect(ratingLevel(0.5)).toBe(1);
    expect(ratingDots(0.5)).toEqual(["filled", "empty", "empty", "empty", "empty"]);
  });
});

describe("club select screen dot sizing (correction 4, rounds 4 and 5)", () => {
  test("every rendered dot is an SVG circle sharing a viewBox and centre - filled or empty, at either boundary", async () => {
    const { container } = await render();
    // radomiak-radom and cracovia are picked below only because they land on
    // opposite ends of ratingLevel in the pinned team-ratings snapshot at
    // time of writing; what matters is that between the two clubs this
    // covers both a mostly-filled and a mostly-empty row.
    for (const clubId of ["lech-poznan", "cracovia", "radomiak-radom"]) {
      await click(radio(container, clubId));
      const dots = [...container.querySelectorAll<SVGSVGElement>(".dd-club-rating-dot")];
      expect(dots.length).toBe(10); // five for attack, five for defence

      // Round 4 (2026-09-15): a CSS-rounded box made a solid disc and a
      // hollow ring two different SHAPES at 7px, which antialiased
      // differently regardless of box-sizing. Inline SVG fixes this by
      // making both variants the SAME geometry (`viewBox` and centre),
      // differing only in fill/stroke/radius.
      const viewBoxes = new Set(dots.map((dot) => dot.getAttribute("viewBox")));
      expect(viewBoxes.size).toBe(1);

      const centreKeys = dots.map((dot) => {
        const circle = dot.querySelector("circle")!;
        return `${circle.getAttribute("cx")},${circle.getAttribute("cy")}`;
      });
      expect(new Set(centreKeys).size).toBe(1);

      for (const dot of dots) {
        const circle = dot.querySelector("circle")!;
        const isFilled = circle.getAttribute("fill") === "currentColor";
        const isEmpty =
          circle.getAttribute("fill") === "none" &&
          circle.getAttribute("stroke") === "currentColor";
        // Every dot is unambiguously one state or the other - never both,
        // never neither.
        expect(isFilled !== isEmpty).toBe(true);
      }
    }
  });

  // Round 5 correction (2026-09-15): an SVG stroke paints centred on the
  // path, so half of it falls outside the circle's radius - a `stroke`
  // circle's VISIBLE outer radius is `r + strokeWidth / 2`, not `r`. The
  // empty dot's fix shrinks its own `r` by half the stroke width so the two
  // variants land on the same visible outer radius, without touching the
  // filled dot at all. This is the regression test for the corrected bug
  // (filled dots rendering smaller than empty ones), not just a repeat of
  // the geometric-identity check above.
  test("round 5: filled and empty dots have the same VISIBLE outer radius, not just the same nominal r", async () => {
    const { container } = await render();
    // A club whose row is entirely filled (or entirely empty) would not
    // exercise both circle variants, so this scans clubs for one whose
    // rendered dots include at least one of each - not hardcoded to a club
    // whose rating level happens to be mixed today.
    let dots: SVGSVGElement[] = [];
    for (const club of CLUBS) {
      await click(radio(container, club.clubId));
      const candidate = [...container.querySelectorAll<SVGSVGElement>(".dd-club-rating-dot")];
      const circles = candidate.map((dot) => dot.querySelector("circle")!);
      const hasFilled = circles.some((c) => c.getAttribute("fill") === "currentColor");
      const hasEmpty = circles.some((c) => c.getAttribute("fill") === "none");
      if (hasFilled && hasEmpty) {
        dots = candidate;
        break;
      }
    }
    expect(dots.length).toBeGreaterThan(0);

    const visibleOuterRadii = dots.map((dot) => {
      const circle = dot.querySelector("circle")!;
      const r = Number(circle.getAttribute("r"));
      const fill = circle.getAttribute("fill");
      const strokeWidth = Number(circle.getAttribute("stroke-width") ?? "0");
      // A `fill: none` circle's visible edge is its stroke's outer half;
      // a filled circle with no stroke stops exactly at r.
      return fill === "none" ? r + strokeWidth / 2 : r;
    });

    expect(new Set(visibleOuterRadii).size).toBe(1);
    // Pin the actual chosen fix so a future edit that reintroduces the bug
    // (e.g. bumping the empty circle's r back to match the filled one's,
    // without accounting for its stroke) fails loudly here.
    const emptyCircle = dots
      .map((dot) => dot.querySelector("circle")!)
      .find((circle) => circle.getAttribute("fill") === "none")!;
    const filledCircle = dots
      .map((dot) => dot.querySelector("circle")!)
      .find((circle) => circle.getAttribute("fill") === "currentColor")!;
    expect(Number(emptyCircle.getAttribute("r"))).toBe(2.5);
    expect(Number(emptyCircle.getAttribute("stroke-width"))).toBe(1);
    expect(Number(filledCircle.getAttribute("r"))).toBe(3);
  });
});

describe("club select screen styling contracts (correction 8 and 10)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/ui/styles.css"), "utf8");

  // Media-query blocks are cut out first: a reduced-motion override names
  // the same selectors as the rule it overrides, so a plain search would
  // return whichever comes first in the file rather than the base rule that
  // was asked for. Tests about a media block extract it themselves below.
  const cssWithoutMedia = css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, "");
  const ruleBody = (selector: string): string => {
    const escaped = selector.replace(/[.#]/g, "\\$&");
    const match = cssWithoutMedia.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    if (!match) throw new Error(`Rule not found: ${selector}`);
    return match[1]!;
  };

  // Comments stripped before block-splitting below: several selector lists
  // in this file are preceded by prose comments that themselves contain
  // commas, which would otherwise land as bogus extra "selectors" once a
  // comment and a real selector list end up inside the same `[^{}]+` match.
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

  /** Finds a rule by one exact selector in its (possibly comma-separated)
   * selector list, for rules two selectors deliberately share (see the
   * label-register test below) that `ruleBody`'s single-selector match
   * cannot locate. */
  const ruleBodyContaining = (selector: string): string => {
    const blocks = [...cssWithoutComments.matchAll(/([^{}]+)\{([^}]*)\}/g)];
    const match = blocks.find(([, selectorList]) =>
      selectorList!
        .split(",")
        .map((s) => s.trim())
        .includes(selector)
    );
    if (!match) throw new Error(`Rule not found: ${selector}`);
    return match[2]!;
  };

  test("the attack/defence block is a two-column grid, not a single flex row", () => {
    const body = ruleBody(".dd-club-quality");
    expect(body).toMatch(/display:\s*grid/);
    expect(body).toMatch(/grid-template-columns:\s*repeat\(2,\s*1fr\)/);
  });

  test("the selected club row no longer carries a thickened border on top of the focus outline", () => {
    const body = ruleBody(".dd-club-radio.is-selected");
    expect(body).not.toMatch(/border-width/);
  });

  test("the detail panel's top margin matches the breathing room the scroll keeps above it", () => {
    // 2026-09-17: the scroll is computed in JS now (club-select-scroll.ts),
    // so `scroll-margin-top` has nothing left to read it; the two values
    // must still be one rhythm.
    const body = ruleBody(".dd-club-detail");
    expect(body).toMatch(new RegExp(`margin-top:\\s*${PANEL_TOP_MARGIN}px`));
    expect(body).not.toMatch(/scroll-margin-top/);
  });

  test("the panel reveal animates, and reduced motion switches every part of it off", () => {
    expect(ruleBody(".dd-club-detail-reveal")).toMatch(
      /transition:\s*grid-template-rows 0\.22s ease/
    );
    expect(ruleBody(".dd-club-detail-reveal.is-open")).toMatch(/grid-template-rows:\s*1fr/);
    expect(ruleBody(".dd-club-detail")).toMatch(/animation:\s*dd-club-detail-in 0\.22s ease/);

    const reducedBlocks = [
      ...cssWithoutComments.matchAll(
        /@media \(prefers-reduced-motion: reduce\)\s*\{((?:[^{}]*\{[^}]*\})*)\s*\}/g
      ),
    ].map(([, body]) => body);
    const reduced = reducedBlocks.find((body) => body!.includes(".dd-club-detail-reveal"));
    expect(reduced).toBeDefined();
    expect(reduced).toMatch(
      /\.dd-club-detail-reveal,\s*\.dd-club-detail\s*\{\s*transition:\s*none;\s*animation:\s*none/
    );
  });

  // Only the first appearance is animated (product owner, 2026-09-18), so a
  // switch must not remount the box or replay the reveal - it just swaps the
  // numbers in place.
  test("switching clubs keeps the bordered box and its heading in place", async () => {
    const { container } = await render();
    await click(radio(container, "lech-poznan"));
    const box = container.querySelector(".dd-club-detail");
    const heading = container.querySelector(".dd-club-detail-heading");

    await click(radio(container, "cracovia"));

    expect(container.querySelector(".dd-club-detail")).toBe(box);
    expect(container.querySelector(".dd-club-detail-heading")).toBe(heading);
    expect(container.querySelector(".dd-club-detail-heading h2")!.textContent).toBe("Cracovia");
    expect(container.querySelector("#club-detail-panel")!.className).toBe(
      "dd-club-detail-reveal is-open"
    );
  });

  test("the list and the panel wrapper opt out of scroll anchoring", () => {
    expect(ruleBody(".dd-club-detail-reveal")).toMatch(/overflow-anchor:\s*none/);
    expect(ruleBody(".dd-club-fieldset")).toMatch(/overflow-anchor:\s*none/);
  });

  test("correction 4 (round 4): the dot is inline SVG, sized in CSS and pinned against shrinking - not a CSS-rounded box", () => {
    const body = ruleBody(".dd-club-rating-dot");
    expect(body).toMatch(/width:\s*8px/);
    expect(body).toMatch(/height:\s*8px/);
    expect(body).toMatch(/color:\s*var\(--text-secondary\)/);
    // Round 3's fix (2026-09-15) - dots read as ovals because the flex
    // parent could compress width alone - still applies to the SVG root
    // element, so it stays.
    expect(body).toMatch(/flex-shrink:\s*0/);
    // Round 4 (2026-09-15): a `border-radius: 50%` box made a solid disc
    // and a hollow ring two different SHAPES at 7px, which is what actually
    // antialiased unevenly - no box-sizing/border/width/height combination
    // on a div fixes two different shapes. There is no CSS geometry left on
    // this element to get wrong (no border, no border-radius, no
    // box-sizing) - the circle itself is drawn once, in the markup, shared
    // by both states (see the geometry test in the component spec above).
    expect(body).not.toMatch(/border|border-radius|box-sizing/);
    const dotsRowBody = ruleBody(".dd-club-rating-dots");
    expect(dotsRowBody).toMatch(/display:\s*inline-flex/);
  });

  test("correction 5: the six-number grid gets a divider matching attack/defence, drawn as one continuous line, and a matching narrow collapse", () => {
    // Round 3 (2026-09-15): the six-number grid is three rows, unlike the
    // one-row attack/defence block, so a border painted per right-column
    // cell (`nth-child(2n)`) breaks into one segment per row with a gap at
    // every `gap: 10px` row seam. Drawn once as a `::before` on the grid
    // container instead - one element spanning the full height - there is
    // nothing left to segment.
    const gridBody = ruleBody(".dd-club-stat-grid");
    expect(gridBody).toMatch(/position:\s*relative/);
    const dividerBody = ruleBodyContaining(".dd-club-stat-grid::before");
    expect(dividerBody).toMatch(/content:\s*(""|'')/);
    expect(dividerBody).toMatch(/position:\s*absolute/);
    expect(dividerBody).toMatch(/top:\s*0/);
    expect(dividerBody).toMatch(/bottom:\s*0/);
    expect(dividerBody).toMatch(/background:\s*var\(--border-card\)/);
    // The per-cell rule may only add spacing now, never its own border -
    // that would resurrect the segmented line this test exists to catch.
    const cellBody = ruleBodyContaining(".dd-club-stat-grid > .dd-club-stat:nth-child(2n)");
    expect(cellBody).toMatch(/padding-left:\s*10px/);
    expect(cellBody).not.toMatch(/border/);

    const collapseIndex = css.indexOf("@media (max-width: 359px)");
    expect(collapseIndex).toBeGreaterThan(-1);
    const collapseBlock = css.slice(collapseIndex, css.indexOf("\n}\n", collapseIndex) + 3);
    expect(collapseBlock).toMatch(/\.dd-club-stat-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(collapseBlock).toMatch(/\.dd-club-stat-grid::before\s*\{[^}]*display:\s*none/);
    expect(collapseBlock).toMatch(
      /\.dd-club-stat-grid > \.dd-club-stat:nth-child\(2n\)\s*\{[^}]*padding-left:\s*0/
    );
  });

  test("the six-number caption shares its label declarations with ATAK/OBRONA (dt) in one rule, not a duplicate", () => {
    const dtBody = ruleBodyContaining(".dd-club-quality dt");
    const captionBody = ruleBodyContaining(".dd-club-caption.dd-club-forecast-note");
    // Both selectors resolve to the SAME rule text (one declaration list
    // shared by both selectors), which is what makes drift impossible - not
    // just two rules that happen to agree today.
    expect(dtBody).toBe(captionBody);
    expect(dtBody).toMatch(/color:\s*var\(--text-label\)/);
    expect(dtBody).toMatch(/font-size:\s*10\.5px/);
    expect(dtBody).toMatch(/font-weight:\s*700/);
    expect(dtBody).toMatch(/letter-spacing:\s*0\.04em/);
    expect(dtBody).toMatch(/text-transform:\s*uppercase/);
  });

  // Product owner correction, 2026-09-16: the parenthesised cup-free figure
  // must recede visually - paler, lighter-weight and smaller than the main
  // amount it sits beside - by reusing the exact treatment already checked
  // for the club list's "(59,0 xPts)" annotation, not a fresh colour/weight
  // declared inline. `.dd-secondary-figure` is the one shared class both
  // annotations carry, so the two cannot drift apart; `--text-club-list-hint`
  // was already measured at 4.5:1 minimum for that annotation
  // (tests/ui/palette-contrast.test.ts), which settles contrast here too. It
  // must also wrap onto its own line inside the 360px-reference column
  // rather than force a horizontal scroll, so no `nowrap`/`pre` on it or on
  // the value it sits inside.
  test("the shared secondary-figure treatment is paler, lighter and smaller than the main value", () => {
    const secondaryBody = ruleBody(".dd-secondary-figure");
    expect(secondaryBody).toMatch(/color:\s*var\(--text-club-list-hint\)/);
    expect(secondaryBody).toMatch(/font-weight:\s*400/);
    expect(secondaryBody).toMatch(/font-size:\s*11px/);

    const valueBody = ruleBody(".dd-club-stat-value");
    expect(valueBody).toMatch(/font-weight:\s*800/);
    expect(valueBody).toMatch(/font-size:\s*14px/);
    expect(valueBody).not.toMatch(/white-space:\s*(nowrap|pre)/);

    const cupfreeBody = ruleBody(".dd-club-stat-value-cupfree");
    // The cup-free rule itself carries only layout now - colour/weight/size
    // come from the shared class - and must never force a horizontal scroll.
    expect(cupfreeBody).not.toMatch(/color:|font-weight:|font-size:/);
    expect(cupfreeBody).not.toMatch(/white-space:\s*(nowrap|pre)/);
    // Explicit baseline alignment, so the two figures sit on one shared
    // baseline instead of one appearing to float relative to the other.
    expect(cupfreeBody).toMatch(/vertical-align:\s*baseline/);
  });

  test("the cup-free parenthetical and the xPts annotation both carry the shared secondary-figure class", async () => {
    const { container } = await render();
    await click(radio(container, "lech-poznan"));

    const cupfree = container.querySelector(".dd-club-stat-value-cupfree");
    expect(cupfree).not.toBeNull();
    expect(cupfree!.classList.contains("dd-secondary-figure")).toBe(true);

    const xPtsAnnotation = radio(container, "lech-poznan")
      .closest("label")!
      .querySelector(".dd-club-radio-points");
    expect(xPtsAnnotation).not.toBeNull();
    expect(xPtsAnnotation!.classList.contains("dd-secondary-figure")).toBe(true);
  });

  // Product owner correction, 2026-09-16, round 2: a plain " " between the
  // main amount and "(" is real but reads as glued together at 11px next to
  // "€" - and, being an ordinary breakable space, could in principle leave
  // "(" to start a line on its own. "\u00a0" fixes both: same visual width,
  // never a break point. Asserted on the rendered text content (a real
  // character in the DOM), not a markup/snapshot string, so this survives
  // any future change to the surrounding JSX structure.
  test("the separator before the cup-free parenthesis is a non-breaking space, not a plain one", async () => {
    const { container } = await render();
    await click(radio(container, "lech-poznan"));

    const cupfree = container.querySelector(".dd-club-stat-value-cupfree")!;
    expect(cupfree.textContent.startsWith("\u00a0(")).toBe(true);
    expect(cupfree.textContent.startsWith(" (")).toBe(false);
  });

  // Product owner correction, 2026-09-16, round 2: confirms that nothing
  // here overrides the figure onto a different baseline than the main
  // value. jsdom does not run layout, so this reads the declared rules
  // rather than a browser's resolved computed style (as the rest of this
  // describe block already does via `ruleBody`) - but it targets exactly
  // the two facts that would cause the misalignment the product owner
  // hypothesised: a flex row overriding `align-items` on the shared
  // ancestor, or a non-baseline `vertical-align` on the parenthetical
  // itself. Neither is present. See the styles.css comment on
  // `.dd-club-stat-value-cupfree` for the full diagnosis: the "floating"
  // look reported was wrapping at the 360px reference width (reproduced
  // independent of this correction's colour/size change), not a
  // misaligned baseline.
  test("neither the value container nor the parenthetical declares a non-baseline alignment", () => {
    const valueBody = ruleBody(".dd-club-stat-value");
    expect(valueBody).not.toMatch(/display:\s*flex/);
    expect(valueBody).not.toMatch(/align-items/);

    const cupfreeBody = ruleBody(".dd-club-stat-value-cupfree");
    expect(cupfreeBody).toMatch(/vertical-align:\s*baseline/);
  });
});
