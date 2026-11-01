import type { Dispatch } from "react";
import type { GameState, GameAction } from "../../data/types";
import { formationOf } from "../../logic/squad";
import { LeagueTable } from "../components/league-table";
import { MarketAnomaliesSection } from "../components/market-anomalies-section";
import { RestartDialog } from "../components/restart-dialog";
import { ScreenHeader } from "../components/screen-header";
import { SectionHeading } from "../components/section-heading";
import { StickyActionBar } from "../components/sticky-action-bar";
import { TransferLog } from "../components/transfer-log";
import { SummaryList } from "../components/summary-list";

export const HalfSeasonScreen = ({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}) => {
  const { tabela, pytamRestart, club, kadra, kasa, europeanCup, log, rynek } = state;
  if (!tabela || !club) return null;
  const step = state.kroki[state.krok];
  const season = step && "sezon" in step ? step.sezon : state.historia.length + 1;
  const miejsce = tabela.findIndex((row) => row.isPlayer) + 1;

  return (
    <>
      <ScreenHeader
        forecast={{
          expectedPlace: state.seasonForecastExpectedPlace,
          europeanIncome: state.seasonForecastEuropeanIncome,
        }}
        membership={state.membership}
        prawa={`Sezon ${season} · po rundzie jesiennej`}
        club={club}
        cup={europeanCup}
        squad={kadra}
        cash={kasa}
      />
      <main className="dd-wrap dd-screen-content">
        <SectionHeading title="Tabela na półmetku" meta="17 kolejek" />
        <LeagueTable rows={tabela} caption="Tabela po rundzie jesiennej" />

        <SectionHeading title="Co się wydarzyło" />
        <SummaryList
          label="Co się wydarzyło w rundzie jesiennej"
          rows={[
            { label: "Miejsce", value: `${miejsce}.` },
            { label: "Punkty", value: state.polowa1 },
          ]}
        />

        <MarketAnomaliesSection
          rynek={rynek}
          formation={formationOf(state)}
          meta="zapowiedź okna zimowego"
        />

        <TransferLog entries={log} />
        <RestartDialog pytamRestart={pytamRestart} dispatch={dispatch} />
      </main>
      <StickyActionBar label="Przejście do okna zimowego">
        <button
          type="button"
          className="dd-action-primary"
          data-dd-action="dalej"
          onClick={() => dispatch({ type: "ADVANCE" })}
        >
          Przejdź do okna zimowego
          <small>
            {state.timerWl
              ? "Dwa ruchy. Zegar ruszy po otwarciu ofert."
              : "Dwa ruchy. Zegar jest wyłączony."}
          </small>
        </button>
      </StickyActionBar>
    </>
  );
};
