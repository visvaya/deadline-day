/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { Player, PositionCode, StaffMemo } from "../../src/data/types";
import { FORMACJE } from "../../src/data/positions";
import { App } from "../../src/ui/app";
import { PositionReports } from "../../src/ui/components/position-reports";

/**
 * The squad drawer in its two modes.
 *
 * From an offer card: the whole formation grid, then one position's players,
 * then a report expanded in place. From the squad review screen the grid step
 * is skipped - a tile opens straight into that position's list.
 *
 * These drive the real App through the real reducer, because the questions
 * being asked are about wiring: which control does which of the two different
 * things, and whether the report that appears belongs to the row that was
 * clicked.
 */

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

afterEach(async () => {
  for (const { container, root } of mountedRoots.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

const click = async (container: HTMLElement, action: string): Promise<void> => {
  const control = container.querySelector<HTMLElement>(`[data-dd-action="${action}"]`);
  if (!control) throw new Error(`No control for action "${action}"`);
  await act(async () => control.click());
};

const clickNode = async (node: Element | null | undefined): Promise<void> => {
  if (!node) throw new Error("nothing to click");
  await act(async () => (node as HTMLElement).click());
};

const enterMarket = async (): Promise<HTMLDivElement> => {
  const container = await mountApp();
  await click(container, "losuj");
  await click(container, "dalej");
  await click(container, "klub:gornik-zabrze");
  await click(container, "zacznij-kariere");
  return container;
};

const drawer = (container: HTMLElement): HTMLElement | null =>
  container.querySelector<HTMLElement>('[role="dialog"].dd-squad-drawer');

const rows = (container: HTMLElement): HTMLButtonElement[] =>
  Array.from(container.querySelectorAll<HTMLButtonElement>(".dd-player-trigger"));

const firstTile = (root: HTMLElement | null): HTMLButtonElement | null =>
  root?.querySelector<HTMLButtonElement>("button.dd-player-tile") ?? null;

/** Squad screen -> a position's reports, in one tap. */
const openReportsFromSquad = async (): Promise<HTMLDivElement> => {
  const container = await enterMarket();
  await clickNode(firstTile(container));
  return container;
};

/** Offer card -> grid -> a position's reports. */
const openReportsFromOffer = async (): Promise<HTMLDivElement> => {
  const container = await enterMarket();
  await click(container, "oferty");
  await clickNode(container.querySelector(".dd-offer-squad-trigger"));
  await clickNode(firstTile(drawer(container)));
  return container;
};

describe("entering the drawer", () => {
  test("an offer opens the grid first, and a tile steps into that position", async () => {
    const container = await enterMarket();
    await click(container, "oferty");
    await clickNode(container.querySelector(".dd-offer-squad-trigger"));

    // Level one: the whole formation, with the offer's position marked.
    expect(drawer(container)?.querySelectorAll(".dd-formation-line")).toHaveLength(4);
    expect(rows(container)).toHaveLength(0);
    expect(drawer(container)?.querySelector(".dd-squad-drawer-position")?.textContent).toContain(
      "pozycja oferty:"
    );

    const tile = firstTile(drawer(container));
    const position = tile?.getAttribute("data-position");
    await clickNode(tile);

    // Level two: that position's players. Not a third view - the report
    // expands inside this list.
    expect(drawer(container)?.querySelectorAll(".dd-formation-line")).toHaveLength(0);
    expect(rows(container).length).toBeGreaterThan(0);
    expect(drawer(container)?.querySelector("h2")?.textContent).toBe(
      `Raporty zawodników ${position}`
    );
  });

  test("the squad screen skips the grid and opens the position directly", async () => {
    const container = await openReportsFromSquad();

    expect(drawer(container)).not.toBeNull();
    expect(rows(container).length).toBeGreaterThan(0);
    expect(drawer(container)?.querySelectorAll(".dd-formation-line")).toHaveLength(0);
  });

  test("both starters and substitutes on the position are listed", async () => {
    const container = await openReportsFromSquad();
    const statuses = Array.from(
      drawer(container)?.querySelectorAll(".dd-player-row-role") ?? []
    ).map((node) => node.textContent);

    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((s) => s === "podstawowy" || s === "rezerwowy")).toBe(true);
    // Starters come first, in the order the automatic XI uses.
    expect(statuses.indexOf("podstawowy")).toBe(0);
    const lastStarter = statuses.lastIndexOf("podstawowy");
    const firstReserve = statuses.indexOf("rezerwowy");
    if (firstReserve !== -1) expect(firstReserve).toBeGreaterThan(lastStarter);
  });
});

describe("the header row", () => {
  test("the back arrow shares a row with the title it steps back from", async () => {
    // It belongs to that title, not to the drawer - placed above, it reads as
    // a control of the whole thing, which is what the bottom button is. The
    // shared row is also what lets it centre on a 16px title instead of on a
    // heading that also holds an 11px subtitle.
    const container = await openReportsFromOffer();
    const titleRow = drawer(container)?.querySelector(".dd-squad-drawer-title-row");
    const back = container.querySelector('[data-dd-action="kadra-wroc"]');

    expect(back?.parentElement).toBe(titleRow);
    expect(back?.nextElementSibling?.tagName).toBe("H2");
    expect(titleRow?.parentElement?.classList.contains("dd-squad-drawer-heading")).toBe(true);
  });

  test("the position in the title is set apart, not part of the title text", async () => {
    // Same quiet treatment as "pozycja oferty: BR" in the other mode.
    const container = await openReportsFromOffer();
    const title = drawer(container)?.querySelector("#squad-drawer-title");
    const qualifier = title?.querySelector(".dd-squad-drawer-position");

    // No separator character: once the qualifier is set apart visually, a dot
    // before it is a second mark doing a job already done.
    expect(title?.textContent).toMatch(/^Raporty zawodników \S+$/u);
    expect(title?.textContent).not.toContain("·");
    expect(qualifier?.textContent).toMatch(/^\S+$/u);
  });

  test("the subtitle counts in Polish, singular included", async () => {
    const container = await openReportsFromSquad();
    const subtitle = drawer(container)?.querySelector(".dd-squad-drawer-heading p")?.textContent;

    // "1 rezerwowych" was wrong; pluralPl gets the singular right.
    expect(subtitle).not.toMatch(/(^|\s)1 (podstawowych|rezerwowych)(\s|$)/u);
    expect(subtitle).toMatch(/\d+ (podstawowy|podstawowych) · \d+ (rezerwowy|rezerwowych)/u);
  });

  test("the grab bar and the heading are one drag surface", async () => {
    // The bar used to be a sibling with no handlers, so the one thing that
    // looks like a handle did nothing and started a text selection instead.
    const container = await openReportsFromSquad();
    const handle = drawer(container)?.querySelector(".dd-squad-drawer-handle");

    expect(handle).not.toBeNull();
    expect(handle?.querySelector(".dd-squad-drawer-grab")).not.toBeNull();
    expect(handle?.querySelector(".dd-squad-drawer-heading")).not.toBeNull();
    expect(handle?.closest(".dd-squad-drawer-content")).toBeNull();
  });
});

describe("the accordion", () => {
  test("every row starts collapsed", async () => {
    const container = await openReportsFromSquad();

    expect(rows(container).every((row) => row.getAttribute("aria-expanded") === "false")).toBe(
      true
    );
    expect(drawer(container)?.querySelectorAll(".dd-player-report:not([hidden])")).toHaveLength(0);
  });

  test("clicking a row shows that player's report, in full", async () => {
    // Not "something became visible": expanding the right row while rendering
    // the neighbour's report is an aria-controls/id mistake that looks correct
    // on screen until two players differ in their numbers.
    const container = await openReportsFromSquad();
    const target = rows(container)[0];
    const name = target!.querySelector(".dd-player-row-name")?.textContent;
    const ovr = target!.querySelector(".dd-player-row-ovr")?.textContent;
    await clickNode(target);

    expect(target!.getAttribute("aria-expanded")).toBe("true");
    const report = drawer(container)?.querySelector<HTMLElement>(
      `#${CSS.escape(target!.getAttribute("aria-controls")!)}`
    );
    expect(report?.hidden).toBe(false);
    // Identity: the expanded panel belongs to the row that was clicked.
    expect(
      report?.closest(".dd-player-row")?.querySelector(".dd-player-row-name")?.textContent
    ).toBe(name);
    expect(
      report?.closest(".dd-player-row")?.querySelector(".dd-player-row-ovr")?.textContent
    ).toBe(ovr);

    // Completeness: staff assessment, both metric lines with the rail, and the
    // three metadata rows.
    expect(report?.querySelector(".dd-staff-assessment")).not.toBeNull();
    expect(report?.querySelectorAll(".dd-analyst-metric")).toHaveLength(2);
    expect(report?.querySelector(".dd-evidence-rail")).not.toBeNull();
    expect(report?.querySelectorAll(".dd-analyst-metadata p")).toHaveLength(3);
  });

  test("the staff assessment in the squad comes from the coach", async () => {
    const container = await openReportsFromSquad();
    await clickNode(rows(container)[0]);

    const label = drawer(container)?.querySelector(
      ".dd-player-report .dd-staff-assessment .dd-offer-section-label"
    );
    expect(label?.textContent).toMatch(/^Raport trenera /u);
  });

  test("opening another row closes the first, and clicking an open row closes it", async () => {
    const container = await openReportsFromSquad();
    const list = rows(container);
    if (list.length < 2) return;

    await clickNode(list[0]);
    await clickNode(list[1]);
    expect(list[0]!.getAttribute("aria-expanded")).toBe("false");
    expect(list[1]!.getAttribute("aria-expanded")).toBe("true");

    await clickNode(list[1]);
    expect(rows(container).every((row) => row.getAttribute("aria-expanded") === "false")).toBe(
      true
    );
  });

  test("reopening the drawer forgets which row was expanded", async () => {
    const container = await openReportsFromSquad();
    await clickNode(rows(container)[0]);
    expect(rows(container)[0]!.getAttribute("aria-expanded")).toBe("true");

    await click(container, "kadra-zamknij");
    await clickNode(firstTile(container));

    expect(rows(container).every((row) => row.getAttribute("aria-expanded") === "false")).toBe(
      true
    );
  });

  test("stepping back to the grid and in again also forgets it", async () => {
    const container = await openReportsFromOffer();
    await clickNode(rows(container)[0]);
    expect(rows(container)[0]!.getAttribute("aria-expanded")).toBe("true");

    await click(container, "kadra-wroc");
    await clickNode(firstTile(drawer(container)));

    expect(rows(container).every((row) => row.getAttribute("aria-expanded") === "false")).toBe(
      true
    );
  });

  test("the report is stable across open, close and reopen", async () => {
    // Deterministic within a season and window: reopening must not reroll it.
    const container = await openReportsFromSquad();
    await clickNode(rows(container)[0]);
    const first = drawer(container)?.querySelector(".dd-player-report")?.textContent;

    await clickNode(rows(container)[0]);
    await clickNode(rows(container)[0]);
    const second = drawer(container)?.querySelector(".dd-player-report")?.textContent;

    expect(second).toBe(first);
    expect(first).toBeTruthy();
  });
});

describe("the two exits do different things", () => {
  test("the back arrow returns to the grid and leaves the drawer open", async () => {
    // A test that only checked "something closed" would pass with both wired
    // to the same action, which costs a tap from every report.
    const container = await openReportsFromOffer();
    await click(container, "kadra-wroc");

    expect(drawer(container)).not.toBeNull();
    expect(drawer(container)?.querySelectorAll(".dd-formation-line")).toHaveLength(4);
    expect(rows(container)).toHaveLength(0);
    // And the offer's position is still marked.
    expect(drawer(container)?.querySelector(".dd-squad-drawer-position")?.textContent).toContain(
      "pozycja oferty:"
    );
  });

  test("the bottom button closes the whole drawer from inside the reports", async () => {
    const container = await openReportsFromOffer();
    await click(container, "kadra-zamknij");

    expect(drawer(container)).toBeNull();
  });

  test("the back arrow is absent when the drawer opened straight into reports", async () => {
    const container = await openReportsFromSquad();
    expect(container.querySelector('[data-dd-action="kadra-wroc"]')).toBeNull();
  });

  test("the back arrow is present when a grid step was skipped over", async () => {
    const container = await openReportsFromOffer();
    expect(container.querySelector('[data-dd-action="kadra-wroc"]')).not.toBeNull();
  });

  test("the back arrow is absent in grid mode", async () => {
    const container = await enterMarket();
    await click(container, "oferty");
    await clickNode(container.querySelector(".dd-offer-squad-trigger"));

    expect(container.querySelector('[data-dd-action="kadra-wroc"]')).toBeNull();
  });

  test("from an offer the exit says 'Wróć do oferty' in both modes", async () => {
    const container = await enterMarket();
    await click(container, "oferty");
    await clickNode(container.querySelector(".dd-offer-squad-trigger"));
    expect(container.querySelector('[data-dd-action="kadra-zamknij"]')?.textContent).toBe(
      "Wróć do oferty"
    );

    await clickNode(firstTile(drawer(container)));
    expect(container.querySelector('[data-dd-action="kadra-zamknij"]')?.textContent).toBe(
      "Wróć do oferty"
    );
  });

  test("from the squad review the exit says 'Zamknij' - there is no offer to return to", async () => {
    const container = await openReportsFromSquad();
    expect(container.querySelector('[data-dd-action="kadra-zamknij"]')?.textContent).toBe(
      "Zamknij"
    );
  });

  test("the exit button sits outside the scrolling content", async () => {
    // Otherwise it drifts away with a long list on a short screen.
    const container = await openReportsFromSquad();
    const exit = container.querySelector('[data-dd-action="kadra-zamknij"]');

    expect(exit?.closest(".dd-squad-drawer-content")).toBeNull();
    expect(exit?.parentElement?.classList.contains("dd-squad-drawer")).toBe(true);
  });

  test("the reports list is not a second scroller", async () => {
    const container = await openReportsFromSquad();
    const list = drawer(container)?.querySelector(".dd-position-reports");

    expect(list).not.toBeNull();
    expect(drawer(container)?.querySelectorAll(".dd-squad-drawer-content")).toHaveLength(1);
    // The list has no overflow of its own - the content area is the scroller.
    expect((list as HTMLElement).style.overflowY).toBe("");
  });
});

describe("a position with a single player", () => {
  // A fresh squad never has one: every formation slot is filled twice over.
  // This is the state a sale or a refused extension leaves behind, so the
  // component is driven directly rather than through a career.
  const only = (poz: PositionCode): Player => ({
    id: `jedyny-${poz}`,
    nazwa: "J. Jedyny",
    poz,
    wiek: 24,
    ovr: 68,
    sufit: 80,
    moj: false,
    cenaZakupu: null,
    ageAtSigning: null,
    mnoznikPlacy: 1,
    wKlubieOd: 0,
    kontraktOd: 0,
    wygasa: false,
  });

  const renderPosition = (
    squad: readonly Player[],
    position: PositionCode,
    /** The club's memory. Empty by default: most of these rows are about
     * layout, and a first read is the honest default for them. */
    staffMemory: Record<string, StaffMemo> = {}
  ): HTMLElement => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push({ container, root });
    act(() =>
      root.render(
        createElement(PositionReports, {
          position,
          squad,
          formation: FORMACJE["4-3-3"],
          period: { season: 1, window: "summer" },
          contextOvr: 66,
          staffMemory,
          seasonalChanges: { season: 1, byPlayer: {} },
          changePeriod: "fresh" as const,
        })
      )
    );
    return container;
  };

  test("an expiring contract is said in the row and drained from the ovr", () => {
    // The one fact that outranks the report behind it: he leaves at the end
    // of the season unless the extension card comes back. Same treatment as
    // a squad tile, which drains the quality tone for the same reason.
    const leaving = { ...only("BR"), wygasa: true };
    const container = renderPosition([leaving], "BR");

    expect(container.querySelector(".dd-player-row-name")?.textContent).toContain("wygasa");
    expect(container.querySelector(".dd-player-row-ovr")?.className).toContain("is-expiring");
    // The delta loses its colour too - a change read off a player who is
    // leaving is not a signal to act on.
    expect(container.querySelector(".dd-season-change")?.className).toContain("is-neutral");
  });

  test("a player staying says nothing about his contract", () => {
    const container = renderPosition([only("BR")], "BR");

    expect(container.querySelector(".dd-player-row-name")?.textContent).not.toContain("wygasa");
    expect(container.querySelector(".dd-player-row-ovr")?.className).not.toContain("is-expiring");
  });
  test("opens with his report already expanded", async () => {
    // With nobody to choose between, the choice is the whole interaction and
    // making it by hand is busywork.
    const container = renderPosition([only("BR")], "BR");
    const list = container.querySelectorAll(".dd-player-trigger");

    expect(list).toHaveLength(1);
    expect(list[0]!.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll(".dd-player-report:not([hidden])")).toHaveLength(1);
    expect(container.querySelector(".dd-analyst-metadata")).not.toBeNull();
  });

  test("two players still start collapsed", async () => {
    // The exception is exactly one player, not "few".
    const second = { ...only("BR"), id: "drugi-BR", nazwa: "D. Drugi", ovr: 61 };
    const container = renderPosition([only("BR"), second], "BR");
    const list = Array.from(container.querySelectorAll(".dd-player-trigger"));

    expect(list).toHaveLength(2);
    expect(list.every((row) => row.getAttribute("aria-expanded") === "false")).toBe(true);
  });
});

describe("dialog behaviour holds from both entrances", () => {
  test.each([
    ["squad screen", openReportsFromSquad],
    ["offer card", openReportsFromOffer],
  ])("Escape closes the drawer opened from the %s", async (_name, open) => {
    const container = await open();
    expect(drawer(container)).not.toBeNull();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(drawer(container)).toBeNull();
  });

  test.each([
    ["squad screen", openReportsFromSquad],
    ["offer card", openReportsFromOffer],
  ])("a press on the backdrop closes the drawer opened from the %s", async (_name, open) => {
    const container = await open();
    const backdrop = container.querySelector(".dd-squad-drawer-backdrop");

    await act(async () => {
      backdrop?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(drawer(container)).toBeNull();
  });

  test("focus starts on the exit button and returns to the tile that opened it", async () => {
    const container = await enterMarket();
    const tile = firstTile(container);
    tile?.focus();
    await clickNode(tile);

    expect(document.activeElement).toBe(
      container.querySelector('[data-dd-action="kadra-zamknij"]')
    );

    await click(container, "kadra-zamknij");
    expect(document.activeElement).toBe(tile);
  });

  test("the drawer keeps one title, changed by mode, and one heading element", async () => {
    const container = await openReportsFromOffer();

    // A second heading inside the scrolling content rendered as a card
    // floating on the drawer's own background.
    expect(drawer(container)?.querySelectorAll("h2")).toHaveLength(1);
    expect(drawer(container)?.querySelector(".dd-squad-drawer-content h2")).toBeNull();
    expect(drawer(container)?.querySelector("h2")?.textContent).toContain("Raporty zawodników ");
  });

  test("the heading stays the drag handle in both modes", async () => {
    // Moving the handle into the scrolling content would break the closing
    // gesture exactly when the report is long.
    const container = await openReportsFromOffer();
    const heading = drawer(container)?.querySelector(".dd-squad-drawer-heading");

    expect(heading).not.toBeNull();
    expect(heading?.closest(".dd-squad-drawer-content")).toBeNull();
    expect(drawer(container)?.querySelector(".dd-squad-drawer-grab")).not.toBeNull();
  });
});
