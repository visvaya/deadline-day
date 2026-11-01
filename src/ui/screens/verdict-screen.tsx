import type { Dispatch } from "react";
import { SEZONY_GRY, SEZONY_EPILOGU } from "../../data/balance";
import type { GameState, GameAction } from "../../data/types";
import { pl, money } from "../../logic/format";
import { SectionHeading } from "../components/section-heading";
import { StickyActionBar } from "../components/sticky-action-bar";
import { SummaryList } from "../components/summary-list";
import { TopBar } from "../components/top-bar";

export const VerdictScreen = ({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}) => {
  const { werdykt, historia, club, kadra, kasa, relegated } = state;
  if (!werdykt || !club) return null;
  // A tenure ended by relegation played fewer seasons and gets no epilogue at
  // all: RUN_EPILOGUE goes straight to the legacy screen. Saying "seasons 1-5"
  // and promising three more to someone who went down in season two describes
  // a career that did not happen.
  const lastPlayed = relegated ? (historia.at(-1)?.sezon ?? SEZONY_GRY) : SEZONY_GRY;
  const averagePoints = historia.length
    ? historia.reduce((total, season) => total + season.pkt, 0) / historia.length
    : 0;
  const trophies = historia.reduce(
    (total, season) => total + Number(season.puchar) + Number(season.mistrz),
    0
  );
  const signedPlayers = kadra.filter((player) => player.moj).length;

  return (
    <>
      <TopBar
        prawa={
          relegated
            ? `Kadencja przerwana spadkiem · sezony 1–${lastPlayed}`
            : `Koniec kadencji · sezony 1–${SEZONY_GRY}`
        }
        club={club}
      />
      <main className="dd-wrap dd-screen-content">
        <SectionHeading title="Nadszedł koniec twojej kadencji" />
        <section className="dd-verdict-card" aria-labelledby="verdict-title">
          <h3 id="verdict-title">{werdykt.tytul}</h3>
          <p>{werdykt.opis}</p>
        </section>

        <SectionHeading title="Ocena kadencji" />
        <SummaryList
          label="Podsumowanie oceny kadencji"
          rows={[
            { label: "Średnia liczba punktów w lidze", value: pl(averagePoints, 1) },
            { label: "Trofea", value: trophies || "brak" },
            { label: "Kasa klubu", value: money(kasa), tone: kasa >= 0 ? "positive" : "negative" },
            { label: "Ocena kadencji", value: werdykt.ocena },
          ]}
          note={
            relegated
              ? "Ocena kadencji decyduje wyłącznie o tym zakończeniu. Właściwy wynik poznasz za chwilę."
              : `Ocena kadencji decyduje wyłącznie o tym zakończeniu. Właściwy wynik poznasz po sezonie ${SEZONY_GRY + SEZONY_EPILOGU}.`
          }
        />

        <SectionHeading title="Co dalej" />
        <SummaryList
          label={relegated ? "Koniec kadencji" : "Epilog kadencji"}
          rows={[
            relegated
              ? { label: "Sezony po twoim odejściu", value: "klub gra niżej" }
              : {
                  // "Do three seasons", not three: the club can go down during
                  // the epilogue too, which stops it early.
                  label: `Sezony ${SEZONY_GRY + 1}–${SEZONY_GRY + SEZONY_EPILOGU}`,
                  value: "bez twojego udziału",
                },
            { label: "Zawodnicy, których kupiłeś", value: `${signedPlayers} w kadrze` },
          ]}
          note={
            relegated
              ? "Spadek kończy twoją kadencję. Zostaje tylko rachunek: kogo kupiłeś i ile byli naprawdę warci."
              : "Od tego momentu nie masz już wpływu. Zawodnicy będą dojrzewać albo się wypalać, a klub pozostanie z twoimi decyzjami i długami."
          }
        />
      </main>
      <StickyActionBar label={relegated ? "Przejście do podsumowania" : "Przejście do epilogu"}>
        <button
          type="button"
          className="dd-action-primary"
          data-dd-action="epilog"
          onClick={() => dispatch({ type: "RUN_EPILOGUE" })}
        >
          {relegated ? "Zobacz podsumowanie" : "Zobacz, co było dalej"}
          <small>
            {relegated
              ? "Kadencja skończyła się spadkiem."
              : `Do ${SEZONY_EPILOGU} sezonów bez twojego udziału.`}
          </small>
        </button>
      </StickyActionBar>
    </>
  );
};
