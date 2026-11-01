/**
 * @vitest-environment jsdom
 */
import { createElement, type Dispatch, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { clubById } from "../../src/data/clubs";
import type { GameAction, GameState, LeagueStanding, Market } from "../../src/data/types";
import { assignEuropeanSpots } from "../../src/logic/european-cups";
import { FORMACJE } from "../../src/data/positions";
import { initialState } from "../../src/logic/game-state";
import { clubRating } from "../../src/logic/league-ratings";
import { createRng } from "../../src/logic/rng";
import { createSquadFromFormation } from "../../src/logic/squad";
import { FinalScreen } from "../../src/ui/screens/final-screen";
import { HalfSeasonScreen } from "../../src/ui/screens/half-season-screen";
import { MarketScreen } from "../../src/ui/screens/market-screen";
import { EpilogueScreen } from "../../src/ui/screens/epilogue-screen";
import { SeasonEndScreen } from "../../src/ui/screens/season-end-screen";
import { VerdictScreen } from "../../src/ui/screens/verdict-screen";
import { quietMarket } from "../logic/fixtures";

const dispatch: Dispatch<GameAction> = vi.fn();
const club = clubById("piast-gliwice");
const squad = createSquadFromFormation(createRng(0x1234_5678), FORMACJE["4-3-3"], clubRating(club));
const market: Market = { ...quietMarket, LO: "obfity", ŚP: "pusty" };
const table: LeagueStanding[] = Array.from({ length: 18 }, (_, index) => ({
  club: index === 5 ? club.shortName : `Klub ${index + 1}`,
  points: 40 - index,
  goalsFor: 50 - index,
  goalsAgainst: 20 + index,
  ...(index === 5 ? { isPlayer: true as const } : {}),
}));

const baseState = (): GameState => ({
  ...initialState(),
  faza: "przeglad",
  club,
  kadra: squad,
  kasa: 3.25,
  rynek: market,
  ruchy: 8,
  log: ["Kupiłeś A. Testowy (63 OVR, 25 lat) za 1,20 mln €. Płaca 0,30 mln €/rok."],
  tabela: table,
  historia: [
    { sezon: 1, pkt: 48, miejsce: 8, puchar: false, mistrz: false, spadek: false },
    { sezon: 2, pkt: 55, miejsce: 5, puchar: true, mistrz: false, spadek: false },
  ],
});

const renderScreen = (element: ReactElement): HTMLElement =>
  new DOMParser().parseFromString(renderToStaticMarkup(element), "text/html").body;

describe("redesigned gameplay screens", () => {
  test("squad overview composes the approved sections and sticky offer action", () => {
    const screen = renderScreen(createElement(MarketScreen, { state: baseState(), dispatch }));

    expect(screen.querySelector(".dd-club-bar")).not.toBeNull();
    expect(screen.querySelector(".dd-section-heading h2")?.textContent).toBe("Kadra");
    expect(screen.querySelector(".dd-section-meta")?.textContent).toContain("śr. OVR");
    expect(screen.querySelector(".dd-market-anomalies")?.textContent).toContain("LO");
    expect(screen.querySelector(".dd-market-anomalies")?.textContent).toContain("nadpodaż");
    expect(screen.querySelector(".dd-market-anomalies")?.textContent).toContain("niedobór");
    expect(screen.querySelector(".dd-market-anomalies")?.textContent).not.toContain("BR");
    expect(screen.querySelector(".dd-market-anomalies")?.tagName).toBe("UL");
    expect(screen.querySelectorAll(".dd-market-anomalies > li").length).toBeGreaterThan(0);
    expect(screen.querySelector('.dd-action-bar [data-dd-action="oferty"]')).not.toBeNull();
    expect(screen.querySelectorAll(".dd-hud dd")).toHaveLength(4);
  });

  test("half-season screen uses the shared table and keeps the latest transfer context", () => {
    const state = { ...baseState(), faza: "polSezonu" as const, krok: 1, timerWl: false };
    const screen = renderScreen(createElement(HalfSeasonScreen, { state, dispatch }));

    expect(screen.querySelector(".dd-league-table")).not.toBeNull();
    expect(screen.textContent).toContain("Ostatnie decyzje transferowe");
    expect(screen.textContent).toContain("Kupiłeś A. Testowy");
    const transferHeading = Array.from(screen.querySelectorAll(".dd-section-heading")).find(
      (heading) => heading.querySelector("h2")?.textContent === "Ostatnie decyzje transferowe"
    );
    expect(transferHeading?.querySelector(".dd-section-meta")?.textContent).toBe("1 akcja");
    expect(screen.querySelectorAll(".dd-hud dd")).toHaveLength(3);
    expect(screen.querySelector('.dd-action-bar [data-dd-action="dalej"]')).not.toBeNull();
    expect(screen.textContent).toContain("Zegar jest wyłączony");
    expect(screen.textContent).not.toContain("Zegar ruszy");
  });

  /**
   * Relegation ends the tenure whatever season it happens in, and the reducer
   * goes straight to the verdict on the next ADVANCE. The screen used to
   * check only for season five, so a drop in season two promised a summer
   * window that would never open and a button that lied about where it led.
   */
  /**
   * A relegated tenure gets no epilogue at all - RUN_EPILOGUE goes straight to
   * the legacy screen - so promising three seasons "without your involvement"
   * describes a career that will not be played. The full-tenure copy says "up
   * to" three, because relegation can cut the epilogue short as well.
   */
  test("the verdict after relegation promises no epilogue", () => {
    const state: GameState = {
      ...baseState(),
      faza: "werdykt",
      relegated: true,
      historia: [
        { sezon: 1, pkt: 38, miejsce: 13, puchar: false, mistrz: false, spadek: false },
        { sezon: 2, pkt: 24, miejsce: 17, puchar: false, mistrz: false, spadek: true },
      ],
      werdykt: {
        tytul: "ROZWIĄZANIE KONTRAKTU",
        opis: "Klub dziękuje ci za współpracę.",
        ocena: 120,
      },
    };
    const screen = renderScreen(createElement(VerdictScreen, { state, dispatch }));

    expect(screen.textContent).toContain("sezony 1–2");
    expect(screen.textContent).not.toContain("sezony 1–5");
    expect(screen.textContent).not.toContain("Sezony 6–8");
    expect(screen.textContent).toContain("Spadek kończy twoją kadencję.");
    // The button still leads somewhere, it just no longer lies about where.
    expect(screen.querySelector('.dd-action-bar [data-dd-action="epilog"]')).not.toBeNull();
  });

  /**
   * The relegation badge is a verdict, so it belongs only on the table that
   * delivers one. It used to render off the position alone, which meant the
   * December table told four clubs they were going down - and over 400
   * measured seasons, 44% of the clubs sitting there in December finish
   * outside the zone.
   *
   * Both directions are pinned. Removing the badge from the final table
   * would satisfy the first assertion alone, and that is a regression this
   * change nearly shipped.
   */
  test("the half-season table names no relegation, the final one does", () => {
    const europeanSpots = assignEuropeanSpots(table, club.shortName);

    const half = renderScreen(
      createElement(HalfSeasonScreen, {
        state: { ...baseState(), faza: "polSezonu", tabela: table, polowa1: 28 },
        dispatch,
      })
    );
    expect(half.querySelector(".dd-cup-badge--spadek")).toBeNull();

    const end = renderScreen(
      createElement(SeasonEndScreen, {
        state: {
          ...baseState(),
          faza: "koniecSezonu",
          krok: 2,
          tabela: table,
          wynikSezonu: {
            sezon: 1,
            pkt: 44,
            miejsce: 9,
            puchar: false,
            mistrz: false,
            bilans: 0.2,
            place: 2.8,
            przychodZLigi: 2.4,
            spadek: false,
            emeryci: [],
            debiutanci: [],
            odeszli: [],
            europeanCup: null,
            europeanRun: [],
            europeanSpots,
            polishCupWinner: club.shortName,
            europeanIncome: 0,
            polishCupIncome: 0,
            superCup: null,
            superCupIncome: 0,
          },
        },
        dispatch,
      })
    );
    expect(end.querySelector(".dd-cup-badge--spadek")).not.toBeNull();
  });

  test("a season ended by relegation promises no next season", () => {
    const europeanSpots = assignEuropeanSpots(table, club.shortName);
    const state: GameState = {
      ...baseState(),
      faza: "koniecSezonu",
      krok: 2,
      wynikSezonu: {
        sezon: 2,
        pkt: 24,
        miejsce: 17,
        puchar: false,
        mistrz: false,
        bilans: -0.8,
        place: 2.8,
        przychodZLigi: 2.1,
        spadek: true,
        emeryci: [],
        debiutanci: [],
        odeszli: [],
        europeanCup: null,
        europeanRun: [],
        europeanSpots,
        polishCupWinner: club.shortName,
        europeanIncome: 0,
        polishCupIncome: 0,
        superCup: null,
        superCupIncome: 0,
      },
    };
    const screen = renderScreen(createElement(SeasonEndScreen, { state, dispatch }));

    expect(screen.textContent).toContain("Podsumuj kadencję");
    expect(screen.textContent).not.toContain("Przejdź do kolejnego sezonu");
    expect(screen.textContent).toContain("Spadek kończy twoją kadencję.");
    // The summer window preview belongs to a season that will not be played.
    expect(screen.textContent).not.toContain("zapowiedź okna letniego");
  });

  test("season-end screen replaces the duplicate formation with squad value context", () => {
    const retiringPlayer = { ...squad[0]!, nazwa: "A. Emeryt", wiek: 35, ovr: 61 };
    const europeanSpots = assignEuropeanSpots(table, club.shortName);
    const state: GameState = {
      ...baseState(),
      faza: "koniecSezonu",
      krok: 2,
      wynikSezonu: {
        sezon: 1,
        pkt: 55,
        miejsce: 5,
        puchar: true,
        mistrz: false,
        bilans: 1.42,
        place: 2.8,
        przychodZLigi: 2.86,
        spadek: false,
        emeryci: [retiringPlayer],
        debiutanci: [],
        odeszli: [],
        europeanCup: europeanSpots.find((spot) => spot.klub === club.shortName)?.puchar ?? null,
        europeanRun: [],
        europeanSpots,
        polishCupWinner: club.shortName,
        europeanIncome: 0,
        polishCupIncome: 1.4,
        superCup: null,
        superCupIncome: 0,
      },
    };
    const screen = renderScreen(createElement(SeasonEndScreen, { state, dispatch }));

    expect(screen.querySelector(".dd-formation")).toBeNull();
    expect(screen.textContent).toContain("Wartość kadry");
    expect(screen.textContent).toContain("Średnia wartość zawodnika");
    expect(screen.querySelector(".dd-league-table")).not.toBeNull();
    expect(screen.querySelector('.dd-action-bar [data-dd-action="dalej"]')).not.toBeNull();
    const retiring = screen.querySelector(".dd-retiring-players");
    expect(retiring?.closest("section")?.textContent).toContain("Twoja kadra po sezonie");
    expect(retiring?.textContent).toContain("A. Emeryt");
    expect(retiring?.textContent).toContain(retiringPlayer.poz);
    expect(retiring?.textContent).toContain("35 lat");
    expect(retiring?.textContent).toContain("OVR 61");
    expect(screen.querySelector('[aria-label="Finanse sezonu"]')?.textContent).not.toContain(
      "Odejścia i debiuty"
    );
  });

  test("verdict screen presents the existing verdict and five-season score context", () => {
    const state: GameState = {
      ...baseState(),
      faza: "werdykt",
      werdykt: {
        tytul: "WYKUPIONY",
        opis: "Lech wykupuje cię z kontraktu.",
        ocena: 334,
      },
    };
    const screen = renderScreen(createElement(VerdictScreen, { state, dispatch }));

    expect(screen.querySelector(".dd-verdict-card")?.textContent).toContain("WYKUPIONY");
    expect(screen.textContent).toContain("Ocena kadencji");
    expect(screen.textContent).toContain("334");
    expect(screen.querySelector('.dd-action-bar [data-dd-action="epilog"]')).not.toBeNull();
  });

  test("counts a league-and-cup double as two trophies", () => {
    const history = [
      ...baseState().historia,
      { sezon: 3, pkt: 70, miejsce: 1, puchar: true, mistrz: true, spadek: false },
    ];
    const verdictState: GameState = {
      ...baseState(),
      historia: history,
      faza: "werdykt",
      werdykt: { tytul: "WYKUPIONY", opis: "Koniec kadencji.", ocena: 400 },
    };
    const verdict = renderScreen(createElement(VerdictScreen, { state: verdictState, dispatch }));

    const trophyValue = Array.from(verdict.querySelectorAll("dt")).find(
      (term) => term.textContent === "Trofea"
    )?.nextElementSibling;
    expect(trophyValue?.textContent).toBe("3");
  });

  test("epilogue step uses the shared summary and action grammar without changing its action", () => {
    const state: GameState = {
      ...baseState(),
      faza: "epilog",
      epilogIdx: 0,
      epilog: [
        {
          nr: 6,
          miejsce: 11,
          pkt: 34,
          naglowki: [{ kind: "PUCHAR" as const, text: "Puchar Polski dla Piasta Gliwice." }],
        },
      ],
    };
    const screen = renderScreen(createElement(EpilogueScreen, { state, dispatch }));

    expect(screen.querySelector(".dd-club-heading h1")?.textContent).toBe(club.name);
    expect(screen.querySelector(".dd-club-heading h1")?.getAttribute("tabindex")).toBe("-1");
    expect(screen.querySelector(".dd-epilogue-content h2")?.textContent).toBe("Sezon 6");
    expect(screen.querySelector(".dd-epilogue-content h2")?.getAttribute("tabindex")).toBe("-1");
    expect(screen.querySelector(".dd-epilogue-summary")?.textContent).toContain("11. miejsce");
    expect(screen.querySelector(".dd-epilogue-headlines")?.textContent).toContain("Puchar Polski");
    expect(screen.querySelector('.dd-action-bar [data-dd-action="dalej"]')?.textContent).toContain(
      "Podsumowanie"
    );
    expect(screen.querySelector(".dd-btn")).toBeNull();
  });

  test("legacy screen gathers all epilogue seasons and reveals ceilings only there", () => {
    const signed = { ...squad[0]!, moj: true, cenaZakupu: 0.8, sufit: 82 };
    const state: GameState = {
      ...baseState(),
      faza: "final",
      historia: [
        ...baseState().historia,
        { sezon: 3, pkt: 70, miejsce: 1, puchar: true, mistrz: true, spadek: false },
      ],
      moje: [signed],
      epilog: Array.from({ length: 5 }, (_, index) => ({
        nr: 6 + index,
        miejsce: 8 - index,
        pkt: 45 + index,
        naglowki: [{ kind: "SEZON_BEZ_HISTORII" as const, text: `Sezon ${6 + index}.` }],
      })),
      finalne: {
        dziedzictwo: 731,
        kasa: 3.4,
        tytul: "ARCHITEKT",
        nastepny: 810,
        breakdown: {
          pktA: 260,
          pktB: 250,
          trofea: 15,
          kasa: 3.4,
          wartoscKadry: 21.3,
          wartoscKadryMoj: 15.4,
          wartoscKadryMojAtHandover: 22.8,
          spadki: 0,
          spadkiKadencja: 0,
          pierwszySpadekSezon: 0,
          squadSizeAtHandover: 14,
          handoverSeason: 5,
          squadSizeEnd: 12,
        },
      },
      drugaSzansa: "M. Wąsik kończy tę historię z oceną 88.",
      transferRumour: {
        text: "T. Nowak znalazł się na liście życzeń klubu „PSV”. Według mediów na stole leży oferta w wysokości 10,0 mln €.",
        club: "PSV",
        amount: 10,
      },
    };
    const screen = renderScreen(
      createElement(FinalScreen, { state, dispatch, onOpenArchive: () => {} })
    );

    expect(screen.querySelectorAll(".dd-legacy-season")).toHaveLength(5);
    expect(screen.querySelector(".dd-legacy-points")?.textContent).toBe("731");
    expect(screen.querySelector(".dd-legacy-score h3")?.textContent).toBe("ARCHITEKT");
    const trophyValue = Array.from(screen.querySelectorAll("dt")).find(
      (term) => term.textContent === "Trofea w sezonach 1–5"
    )?.nextElementSibling;
    expect(trophyValue?.textContent).toBe("3");
    expect(screen.textContent).toContain("Ukryty sufit: 82");
    expect(screen.textContent).toContain("Ten, któremu odmówiłeś");
    // Scoped to its own section: the rumour above reuses the same block, so an
    // unscoped selector would silently start reading the wrong one.
    const passedOn = screen.querySelector('[aria-label="Ten, któremu odmówiłeś"]');
    expect(passedOn?.querySelector(".dd-second-chance-label")?.textContent).toBe(
      "Odrzucona oferta"
    );
    expect(passedOn?.querySelector(".dd-second-chance-text")?.textContent).toContain("M. Wąsik");
    expect(screen.querySelector('[data-dd-action="znowu"]')).not.toBeNull();
    expect(screen.querySelector('[data-dd-action="zmien-klub"]')).not.toBeNull();
  });

  /**
   * A tenure cut short by relegation reaches the same screen, and the screen
   * used to state eight seasons in six different places - every one of them
   * false after a drop in season two.
   */
  test("a tenure ended by relegation does not claim eight seasons", () => {
    const state: GameState = {
      ...baseState(),
      faza: "final",
      relegated: true,
      historia: [
        { sezon: 1, pkt: 40, miejsce: 12, puchar: false, mistrz: false, spadek: false },
        { sezon: 2, pkt: 28, miejsce: 17, puchar: false, mistrz: false, spadek: true },
      ],
      epilog: [],
      moje: [{ ...squad[0]!, moj: true, cenaZakupu: 0.8, sufit: 82, ageAtSigning: 20 }],
      finalne: { dziedzictwo: 180, kasa: -1, tytul: "ZAPOMNIANY", nastepny: 495 },
    };
    const screen = renderScreen(
      createElement(FinalScreen, { state, dispatch, onOpenArchive: () => {} })
    );

    expect(screen.textContent).not.toContain("8 sezonach");
    expect(screen.textContent).not.toContain("6–8");
    expect(screen.querySelectorAll(".dd-legacy-season")).toHaveLength(0);
    // Section 12 of the brief: the one thing a shortened ending may not drop.
    expect(screen.querySelector(".dd-player-reveals")).not.toBeNull();
    expect(screen.textContent).toContain("Ukryty sufit: 82");
  });

  /**
   * The second way a career comes up short, and the one `relegated` cannot
   * see: the club can go down during the epilogue itself, which stops it
   * mid-run (epilogue.ts's frozen decision 5). The tenure was played in full,
   * so `relegated` is false - only the page count knows.
   */
  test("an epilogue cut short by relegation does not claim eight seasons", () => {
    const state: GameState = {
      ...baseState(),
      faza: "final",
      relegated: false,
      // Went down in season six: one page, not three.
      epilog: [{ nr: 6, miejsce: 17, pkt: 24, naglowki: [] }],
      finalne: { dziedzictwo: 300, kasa: 0.5, tytul: "ZAPOMNIANY", nastepny: 495 },
    };
    const screen = renderScreen(
      createElement(FinalScreen, { state, dispatch, onOpenArchive: () => {} })
    );

    expect(screen.textContent).not.toContain("8 sezonach");
    expect(screen.textContent).not.toContain("6–8");
    expect(screen.textContent).toContain("6 sezonach");
  });

  test("a full tenure still reads as before", () => {
    const state: GameState = {
      ...baseState(),
      faza: "final",
      // All three epilogue seasons: the heading counts the pages, so a
      // fixture with one page would correctly read "6 sezonach" and prove
      // nothing about the full-tenure case.
      epilog: [
        { nr: 6, miejsce: 4, pkt: 50, naglowki: [] },
        { nr: 7, miejsce: 5, pkt: 48, naglowki: [] },
        { nr: 8, miejsce: 3, pkt: 55, naglowki: [] },
      ],
      finalne: { dziedzictwo: 400, kasa: 1, tytul: "UCZCIWY WYROBNIK", nastepny: 495 },
    };
    const screen = renderScreen(
      createElement(FinalScreen, { state, dispatch, onOpenArchive: () => {} })
    );

    expect(screen.textContent).toContain("8 sezonach");
  });

  /** Section 12 asks for the age AT PURCHASE next to the fee. The screen used
   * to print the player's current age, so a twenty-year-old signing read as a
   * twenty-seven-year-old by the time his ceiling was revealed. */
  test("legacy screen shows how old a signing was when he was bought", () => {
    const signed = {
      ...squad[0]!,
      moj: true,
      cenaZakupu: 0.8,
      sufit: 82,
      wiek: 27,
      ageAtSigning: 20,
    };
    const state: GameState = {
      ...baseState(),
      faza: "final",
      moje: [signed],
      finalne: { dziedzictwo: 400, kasa: 1, tytul: "UCZCIWY WYROBNIK", nastepny: 495 },
    };
    const screen = renderScreen(
      createElement(FinalScreen, { state, dispatch, onOpenArchive: () => {} })
    );

    const reveal = screen.querySelector(".dd-player-reveals p")?.textContent ?? "";
    expect(reveal).toContain("w wieku 20 lat");
    expect(reveal).not.toContain("w wieku 27 lat");
  });

  test("legacy screen prints the transfer rumour verbatim, with a full stop and no declension", () => {
    const state: GameState = {
      ...baseState(),
      faza: "final",
      finalne: { dziedzictwo: 400, kasa: 1, tytul: "UCZCIWY WYROBNIK", nastepny: 495 },
      transferRumour: {
        text: "T. Nowak znalazł się na liście życzeń klubu „PSV”. Według mediów na stole leży oferta w wysokości 10,0 mln €.",
        club: "PSV",
        amount: 10,
      },
    };
    const screen = renderScreen(
      createElement(FinalScreen, { state, dispatch, onOpenArchive: () => {} })
    );

    const text = screen.querySelector(
      '[aria-label="Zainteresowanie z zagranicy"] .dd-second-chance-text'
    );
    expect(text?.textContent).toBe(
      "T. Nowak znalazł się na liście życzeń klubu „PSV”. Według mediów na stole leży oferta w wysokości 10,0 mln €."
    );
    // A comma decimal and hard spaces, never "10.0 mln".
    expect(text?.textContent).not.toMatch(/\d\.\d/u);
  });

  test("legacy screen renders no rumour element at all when nobody qualified", () => {
    // Not an empty node: an empty label and an empty paragraph would still be
    // announced by a screen reader as a section with nothing in it.
    const state: GameState = {
      ...baseState(),
      faza: "final",
      finalne: { dziedzictwo: 400, kasa: 1, tytul: "UCZCIWY WYROBNIK", nastepny: 495 },
      transferRumour: null,
    };
    const screen = renderScreen(
      createElement(FinalScreen, { state, dispatch, onOpenArchive: () => {} })
    );

    expect(screen.querySelector('[aria-label="Zainteresowanie z zagranicy"]')).toBeNull();
    expect(screen.textContent).not.toContain("Pogłoska transferowa");
  });
});
