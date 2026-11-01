/**
 * @vitest-environment jsdom
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { startingMembership } from "../../src/logic/league-membership";
import { clubById } from "../../src/data/clubs";
import type { LeagueStanding, Player } from "../../src/data/types";
import { Hud } from "../../src/ui/components/hud";
import { LeagueTable } from "../../src/ui/components/league-table";
import { ScreenHeader } from "../../src/ui/components/screen-header";
import { SectionHeading } from "../../src/ui/components/section-heading";
import { StickyActionBar } from "../../src/ui/components/sticky-action-bar";
import { SummaryList } from "../../src/ui/components/summary-list";

const squad: Player[] = [
  {
    id: "starter",
    nazwa: "A. Testowy",
    poz: "BR",
    wiek: 26,
    ovr: 68,
    sufit: 88,
    moj: false,
    cenaZakupu: null,
    ageAtSigning: null,
    mnoznikPlacy: 1,
    wKlubieOd: 0,
    kontraktOd: 0,
    wygasa: false,
  },
];

const parse = (markup: string): HTMLElement =>
  new DOMParser().parseFromString(markup, "text/html").body;

describe("screen primitives", () => {
  test("section heading and summary list expose their labels semantically", () => {
    const section = parse(
      renderToStaticMarkup(
        createElement(
          "section",
          null,
          createElement(SectionHeading, { title: "Kadra", meta: "19 zawodników" }),
          createElement(SummaryList, {
            label: "Finanse klubu",
            rows: [{ label: "Kasa", value: "2,50 mln €", tone: "positive" }],
            note: "Stan po sezonie.",
          })
        )
      )
    );

    expect(section.querySelector("h2")?.textContent).toBe("Kadra");
    expect(section.querySelector(".dd-section-meta")?.textContent).toBe("19 zawodników");
    expect(section.querySelector("dl")?.getAttribute("aria-label")).toBe("Finanse klubu");
    expect(section.querySelector("dd")?.classList.contains("is-positive")).toBe(true);
    expect(section.querySelector(".dd-note")?.textContent).toBe("Stan po sezonie.");
  });

  /** The season-end screen still renders after the club has gone down, and
   * there is no league season left to forecast income from. The guard sits in
   * ScreenHeader, which is what knows the membership; the HUD only has to
   * render the absence. */
  test("HUD shows no forecast when there is none to show", () => {
    const relegatedHud = parse(
      renderToStaticMarkup(
        createElement(Hud, { squad, cash: 2.5, clubId: "piast-gliwice", forecast: null })
      )
    );
    expect(relegatedHud.querySelectorAll("dd")[2]?.textContent).toBe("–");
  });

  test("ScreenHeader withholds the forecast from a relegated club", () => {
    const membership = startingMembership();
    const piast = membership.clubs.find((c) => c.shortName === "Piast")!;
    piast.tier = "pool";
    piast.swaps = 1;
    const club = clubById("piast-gliwice");
    const props = {
      prawa: "Sezon 5",
      club,
      cup: null,
      squad,
      cash: 2.5,
      forecast: { expectedPlace: 8, europeanIncome: 0 },
    };

    const relegated = parse(
      renderToStaticMarkup(createElement(ScreenHeader, { ...props, membership }))
    );
    expect(relegated.querySelectorAll(".dd-hud dd")[2]?.textContent).toBe("–");

    const inLeague = parse(
      renderToStaticMarkup(
        createElement(ScreenHeader, { ...props, membership: startingMembership() })
      )
    );
    expect(inLeague.querySelectorAll(".dd-hud dd")[2]?.textContent).not.toBe("–");
  });

  test("HUD renders three context numbers unless an offer counter is provided", () => {
    const contextHud = parse(
      renderToStaticMarkup(
        createElement(Hud, {
          squad,
          cash: 2.5,
          clubId: "piast-gliwice",

          forecast: { expectedPlace: 8, europeanIncome: 0 },
        })
      )
    );
    expect(contextHud.querySelectorAll("dd")).toHaveLength(3);
    expect(contextHud.textContent).not.toContain("oferta");

    const offerHud = parse(
      renderToStaticMarkup(
        createElement(Hud, {
          squad,
          cash: 2.5,
          clubId: "piast-gliwice",

          forecast: { expectedPlace: 8, europeanIncome: 0 },
          currentOffer: 1,
          totalOffers: 2,
        })
      )
    );
    expect(offerHud.querySelectorAll("dd")).toHaveLength(4);
    expect(offerHud.textContent).toContain("1/2");
  });

  test("league table previews five rows around the player's club and exposes the full table", () => {
    const rows: LeagueStanding[] = Array.from({ length: 9 }, (_, index) => ({
      club: `Klub ${index + 1}`,
      points: 40 - index,
      goalsFor: 50 - index,
      goalsAgainst: 20 + index,
      ...(index === 5 ? { isPlayer: true as const } : {}),
    }));
    const table = parse(
      renderToStaticMarkup(createElement(LeagueTable, { rows, caption: "Tabela na półmetku" }))
    );

    expect(table.querySelector("table")?.getAttribute("aria-label")).toBe("Tabela na półmetku");
    expect(table.querySelectorAll(".dd-league-table-preview tbody tr")).toHaveLength(5);
    expect(
      Array.from(table.querySelectorAll(".dd-league-table-preview tr.ja td")).map(
        (cell) => cell.textContent
      )
    ).toEqual(["6.", "Klub 6", "45:25", "35"]);
    expect(table.querySelectorAll(".dd-league-table-full tbody tr")).toHaveLength(9);
    expect(table.querySelector("summary")?.textContent).toContain("Pokaż całą tabelę");
  });

  test("the league table names four columns, with goals between the club and its points", () => {
    const rows: LeagueStanding[] = [
      { club: "Lech", points: 65, goalsFor: 58, goalsAgainst: 24, isPlayer: true },
      { club: "Legia", points: 63, goalsFor: 51, goalsAgainst: 30 },
    ];
    const table = parse(
      renderToStaticMarkup(createElement(LeagueTable, { rows, caption: "Tabela" }))
    );

    expect(
      Array.from(table.querySelectorAll(".dd-league-table-preview thead th")).map(
        (th) => th.textContent
      )
    ).toEqual(["#", "Klub", "Bramki", "Pkt"]);
  });

  test("sticky action bar labels its region and renders supplied controls", () => {
    const bar = parse(
      renderToStaticMarkup(
        createElement(
          StickyActionBar,
          { label: "Przejście dalej" },
          createElement("button", { type: "button" }, "Dalej")
        )
      )
    );

    expect(bar.querySelector('[role="region"]')?.getAttribute("aria-label")).toBe(
      "Przejście dalej"
    );
    expect(bar.querySelector("button")?.textContent).toBe("Dalej");
  });
});
