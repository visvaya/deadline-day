import { useState, type Dispatch } from "react";
import type { GameState, GameAction, PositionCode } from "../../data/types";
import { KOSZTY_STALE, leaguePositionPrize } from "../../data/balance";
import { pl, pluralPl, znak, money } from "../../logic/format";
import { totalPayroll, averageWage } from "../../logic/wages";
import { annualForecastBreakdown, scaledRecurringRevenue } from "../../logic/finance";
import { formationOf, startingXi } from "../../logic/squad";
import { reportPeriod } from "../../logic/game-reducer";
import { squadReportContextOvr } from "../../logic/squad-reports";
import { EUROPEAN_CUP_NAMES } from "../european-cup-names";
import { FORECAST_NOTE } from "../components/hud";
import { ScreenHeader } from "../components/screen-header";
import { SquadDrawer } from "../components/squad-drawer";
import { SquadGrid } from "../components/squad-grid";
import { MarketAnomaliesSection } from "../components/market-anomalies-section";
import { RestartDialog } from "../components/restart-dialog";
import { SectionHeading } from "../components/section-heading";
import { StickyActionBar } from "../components/sticky-action-bar";
import { SummaryList } from "../components/summary-list";
import { boardSharePercent } from "../board-share";
import { seasonChangePeriod } from "../components/player-tile-utils";
import { defined } from "../../logic/invariant";

const averageOvr = (players: readonly { ovr: number }[]): string =>
  players.length
    ? (players.reduce((total, player) => total + player.ovr, 0) / players.length)
        .toFixed(1)
        .replace(".", ",")
    : "–";

/** Mirrors prototype's faza==="przeglad" branch :777-850. */
export const MarketScreen = ({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}) => {
  const { kadra, europeanCup, club, rynek, timerWl, ruchy, pytamRestart, ovrChange } = state;
  const [reportsFor, setReportsFor] = useState<PositionCode | null>(null);
  const formation = formationOf(state);
  const k = state.kroki[state.krok] as Extract<GameState["kroki"][number], { typ: "okno" }>;
  // Development runs once a season, at its end, so the summer window is the
  // first sight of a delta - and this screen is the first thing shown in it.
  const changePeriod = seasonChangePeriod(k, "squadOverview");
  // The frozen pair out of the state, never a fresh projection: the whole
  // point of the freeze is that this screen and the HUD agree, and that a
  // transfer moves both by exactly minus the change in the payroll.
  const forecast = {
    expectedPlace: state.seasonForecastExpectedPlace,
    europeanIncome: state.seasonForecastEuropeanIncome,
  };
  const ownClub = defined(club, "club");
  const clubId = ownClub.clubId;
  // Both halves here, unlike the HUD: this is the screen with room to show
  // the club's result AND the part of it that becomes transfer money.
  const { operatingBalance: p, transferBudgetChange: budgetChange } = annualForecastBreakdown({
    clubId,
    squad: kadra,
    forecast,
  });
  const miejsce = forecast.expectedPlace;
  const europeanIncome = forecast.europeanIncome;

  return (
    <>
      <ScreenHeader
        prawa={`Sezon ${k.sezon} · ${k.tura}`}
        club={ownClub}
        cup={europeanCup}
        squad={kadra}
        cash={state.kasa}
        forecast={{
          expectedPlace: state.seasonForecastExpectedPlace,
          europeanIncome: state.seasonForecastEuropeanIncome,
        }}
        membership={state.membership}
        currentOffer={0}
        totalOffers={k.ruchy}
      />
      <main className="dd-wrap dd-screen-content">
        <SectionHeading
          title="Kadra"
          meta={`śr. OVR · jedenastka ${averageOvr(startingXi(kadra, formation))} · kadra ${averageOvr(kadra)}`}
        />
        <SquadGrid
          squad={kadra}
          formation={formation}
          highlightedPosition={null}
          seasonalChanges={ovrChange}
          changePeriod={changePeriod}
          onOpenPosition={setReportsFor}
        />
        <p className="dd-note dd-formation-note">
          Duża liczba to podstawowy, mniejsza pod spodem to zmiennik. Strzałka mówi wyłącznie o
          wieku: ▲ wzrastający potencjał, ≈ szczytowa forma, ▼ osłabienie. Moment szczytu zależy od
          pozycji gracza.
          {changePeriod === "unknown"
            ? " Liczba obok oceny pokaże jej zmianę wobec poprzedniego sezonu – na razie stoi tam znak zapytania, bo pierwszy sezon się jeszcze nie skończył."
            : changePeriod === "fresh"
              ? " Liczba obok oceny to zmiana wobec poprzedniego sezonu. Kolor pokazujemy tylko tutaj, raz na sezon."
              : " Liczba obok oceny to zmiana wobec poprzedniego sezonu; widziałeś ją już na początku sezonu, więc stoi tu bez koloru."}
        </p>

        <MarketAnomaliesSection
          rynek={rynek}
          formation={formation}
          meta={k.tura === "lato" ? "zapowiedź okna letniego" : "zapowiedź okna zimowego"}
        />

        <SectionHeading title="Prognoza na koniec sezonu" />
        <SummaryList
          label="Prognoza finansowa"
          rows={[
            { label: "Przewidywane miejsce", value: `${miejsce}.` },
            {
              label: "Przychód klubu",
              value: `+${money(scaledRecurringRevenue(clubId))}`,
              tone: "positive",
            },
            {
              label: "Premia za miejsce",
              value: `+${money(leaguePositionPrize(miejsce))}`,
              tone: "positive",
            },
            ...(europeanCup
              ? [
                  {
                    label: `${EUROPEAN_CUP_NAMES[europeanCup]}, oczekiwane wpływy`,
                    value: `+${money(europeanIncome)}`,
                    tone: "positive" as const,
                  },
                ]
              : []),
            {
              label: `Płace, ${kadra.length} zawodników, średnia ${pl(averageWage(kadra))}`,
              value: `−${money(totalPayroll(kadra))}`,
              tone: "negative",
            },
            { label: "Koszty stałe", value: `−${money(KOSZTY_STALE)}`, tone: "negative" },
            {
              label: "Wynik operacyjny",
              value: `${znak(p)}${money(p)}`,
              tone: p < 0 ? "negative" : "positive",
            },
            {
              label: `Zmiana budżetu, ${boardSharePercent()} wyniku`,
              value: `${znak(budgetChange)}${money(budgetChange)}`,
              tone: budgetChange < 0 ? "negative" : "positive",
            },
          ]}
          note={`${FORECAST_NOTE}. Bez pieniędzy z Pucharu Polski i bez sprzedaży zawodników.`}
        />
        <RestartDialog pytamRestart={pytamRestart} dispatch={dispatch} />
      </main>
      <StickyActionBar label="Otwarcie ofert">
        <button
          type="button"
          className="dd-action-primary"
          data-dd-action="oferty"
          onClick={() => dispatch({ type: "OPEN_OFFERS" })}
        >
          Otwórz oferty
          <small>
            {ruchy === 1 ? "Jeden ruch" : pluralPl(ruchy, ["ruch", "ruchy", "ruchów"])} w tym oknie.{" "}
            {timerWl ? "Zegar rusza po otwarciu." : "Zegar jest wyłączony."}
          </small>
        </button>
      </StickyActionBar>
      {reportsFor && (
        // The same drawer the offer card opens, entered one level deeper:
        // there is no offer here, so there is no grid step and no offer
        // position to highlight - and nothing to go "back to offer" to.
        <SquadDrawer
          squad={kadra}
          formation={formation}
          highlightedPosition={null}
          seasonalChanges={ovrChange}
          changePeriod={changePeriod}
          period={reportPeriod(state)}
          contextOvr={squadReportContextOvr(kadra, formation)}
          staffMemory={state.staffMemory}
          inEurope={europeanCup !== null}
          initialPosition={reportsFor}
          exitLabel="Zamknij"
          onClose={() => setReportsFor(null)}
        />
      )}
    </>
  );
};
