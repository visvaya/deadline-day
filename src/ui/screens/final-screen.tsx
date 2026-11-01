import type { Dispatch } from "react";
import { SEZONY_GRY } from "../../data/balance";
import type { GameState, GameAction } from "../../data/types";
import { pl, pluralFormPl, pluralPl, POINT_FORMS, YEAR_FORMS, money } from "../../logic/format";
import { marketValue } from "../../logic/player";
import { randomSeed } from "../../logic/rng";
import { SectionHeading } from "../components/section-heading";
import { StickyActionBar } from "../components/sticky-action-bar";
import { SummaryList } from "../components/summary-list";
import { TopBar } from "../components/top-bar";

/** Derived from SEZONY_GRY, never written out: the epilogue length
 * dropped from 5 to 3 on 2026-08-13 and these headings still said "6-10". */
const EPILOGUE_FIRST = SEZONY_GRY + 1;

export const FinalScreen = ({
  state,
  dispatch,
  onOpenArchive,
}: {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  onOpenArchive: () => void;
}) => {
  const { finalne, club, moje, drugaSzansa, transferRumour, epilog, historia, kadra, relegated } =
    state;
  if (!finalne || !club) return null;
  // Every heading below counts what actually happened rather than repeating
  // the constants. Saying "after 8 seasons" to someone who went down in
  // season two is the lie this variant removes.
  //
  // Two ways a career can come up short, and `relegated` only knows the
  // first: the tenure can end in seasons 1-5, or the club can go down during
  // the epilogue itself, which stops it mid-run (epilogue.ts's frozen
  // decision 5). The second leaves `relegated` false and fewer pages than
  // SEZONY_EPILOGU, so the page count is what tells the truth in both cases.
  const lastPlayed = relegated ? (historia.at(-1)?.sezon ?? SEZONY_GRY) : SEZONY_GRY;
  const lastCounted = relegated ? lastPlayed : (epilog.at(-1)?.nr ?? SEZONY_GRY);
  const seasonFiveValue = kadra.reduce(
    (total, player) => total + marketValue(player.ovr, player.wiek, player.poz),
    0
  );
  const allPlaces = [
    ...historia.map((season) => season.miejsce),
    ...epilog.map((season) => season.miejsce),
  ];
  const averagePlace = allPlaces.length
    ? allPlaces.reduce((total, place) => total + place, 0) / allPlaces.length
    : 0;
  const trophies = historia.reduce(
    (total, season) => total + Number(season.puchar) + Number(season.mistrz),
    0
  );
  const finalSquadValue = finalne.breakdown?.wartoscKadry;

  return (
    <>
      <TopBar
        prawa={
          relegated
            ? `Kadencja przerwana spadkiem · sezony 1–${lastPlayed}`
            : `Podsumowanie sezonów 1–${SEZONY_GRY} i ${EPILOGUE_FIRST}–${lastCounted}`
        }
        club={club}
      />
      <main className="dd-wrap dd-screen-content dd-legacy-content">
        <SectionHeading title="Zapamiętają cię jako" />
        <section className="dd-legacy-score" aria-label="Wynik dziedzictwa">
          <h3>{finalne.tytul}</h3>
          <p>
            <strong>
              <span className="dd-legacy-points">{finalne.dziedzictwo}</span>{" "}
              {pluralFormPl(finalne.dziedzictwo, POINT_FORMS)}
            </strong>
            {finalne.nastepny && (
              <span>
                {" "}
                · do kolejnego tytułu zabrakło {finalne.nastepny - finalne.dziedzictwo} pkt
              </span>
            )}
          </p>
        </section>

        <SectionHeading
          title={
            relegated
              ? `Klub po spadku w sezonie ${lastPlayed}.`
              : `Klub po ${lastCounted} sezonach`
          }
        />
        <SummaryList
          label={
            relegated
              ? `Stan klubu po spadku w sezonie ${lastPlayed}.`
              : `Stan klubu po ${lastCounted} sezonach`
          }
          rows={[
            {
              label: "Kasa klubu",
              value: money(finalne.kasa),
              tone: finalne.kasa >= 0 ? "positive" : "negative",
            },
            { label: "Średnia pozycja w lidze", value: pl(averagePlace, 1) },
            { label: `Trofea w sezonach 1–${lastPlayed}`, value: trophies || "brak" },
            { label: `Wartość kadry po sezonie ${lastPlayed}.`, value: money(seasonFiveValue) },
            // After relegation the final squad is the same one, valued the
            // same moment - a second identical row would only invent a season
            // that was never played.
            ...(finalSquadValue === undefined || relegated
              ? []
              : [
                  {
                    label: `Wartość kadry po sezonie ${lastCounted}.`,
                    value: money(finalSquadValue),
                  },
                ]),
          ]}
        />

        {/* The container carries the card's own border and background, so it
            has to disappear with its contents. Relegation ends the tenure
            before the epilogue, leaving `epilog` empty - and an empty bordered
            box read as a stray rule under the club summary. The heading was
            already conditional; the box was not. */}
        {epilog.length > 0 && (
          <>
            <SectionHeading title={`Sezony ${EPILOGUE_FIRST}–${lastCounted}`} />
            <div className="dd-legacy-seasons">
              {epilog.map((season) => (
                <article className="dd-legacy-season" key={season.nr}>
                  <header>
                    <h3>Sezon {season.nr}.</h3>
                    <p>
                      {season.miejsce}. miejsce · {season.pkt} pkt
                    </p>
                  </header>
                  {season.naglowki.map((headline) => (
                    <p key={headline.kind}>{headline.text}</p>
                  ))}
                </article>
              ))}
            </div>
          </>
        )}

        <SectionHeading title="Kogo naprawdę kupiłeś" />
        {moje.length === 0 ? (
          <p className="dd-note">Nie kupiłeś nikogo.</p>
        ) : (
          <div className="dd-player-reveals">
            {moje.map((player) => (
              <article key={player.id}>
                <div>
                  <h3>{player.nazwa}</h3>
                  <p>
                    {player.poz} · kupiony za {money(player.cenaZakupu ?? 0)} · w wieku{" "}
                    {/* Falls back to the current age only for saves written
                        before ageAtSigning existed; can go one release on. */}
                    {pluralPl(player.ageAtSigning ?? player.wiek, YEAR_FORMS)}
                  </p>
                </div>
                <strong
                  className={
                    player.sufit >= 78
                      ? "is-positive"
                      : player.sufit >= 70
                        ? "is-warning"
                        : "is-negative"
                  }
                >
                  Ocena {player.ovr}
                  <span>Ukryty sufit: {player.sufit}</span>
                </strong>
              </article>
            ))}
          </div>
        )}

        {transferRumour && (
          <section aria-label="Zainteresowanie z zagranicy">
            <SectionHeading title="Zainteresowanie z zagranicy" />
            <div className="dd-second-chance">
              <span className="dd-second-chance-label">Pogłoska transferowa</span>
              <p className="dd-second-chance-text">{transferRumour.text}</p>
            </div>
          </section>
        )}

        {drugaSzansa && (
          <section aria-label="Ten, któremu odmówiłeś">
            <SectionHeading title="Ten, któremu odmówiłeś" />
            <div className="dd-second-chance">
              <span className="dd-second-chance-label">Odrzucona oferta</span>
              <p className="dd-second-chance-text">{drugaSzansa}</p>
            </div>
          </section>
        )}
      </main>
      <StickyActionBar label="Nowa gra">
        <div className="dd-action-secondary-row">
          <button
            type="button"
            className="dd-action-secondary is-centered"
            data-dd-action="znowu"
            onClick={() => dispatch({ type: "PLAY_AGAIN", seed: randomSeed() })}
          >
            Jeszcze raz
          </button>
          <button
            type="button"
            className="dd-action-secondary is-centered"
            data-dd-action="zmien-klub"
            onClick={() => dispatch({ type: "CONFIRM_RESTART" })}
          >
            Zmień klub
          </button>
          <button
            type="button"
            className="dd-action-secondary is-centered"
            data-dd-action="archiwum"
            onClick={onOpenArchive}
          >
            Archiwum wyników
          </button>
        </div>
      </StickyActionBar>
    </>
  );
};
