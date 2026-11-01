import type { Dispatch } from "react";
import {
  EUROPEAN_PRIZE_MONEY,
  KOSZTY_STALE,
  SEZONY_GRY,
  leaguePositionPrize,
} from "../../data/balance";
import type { GameState, GameAction, Player } from "../../data/types";
import { pluralPl, YEAR_FORMS, znak, zaokr, money } from "../../logic/format";
import { scaledRecurringRevenue, transferBudgetChange } from "../../logic/finance";
import { marketValue } from "../../logic/player";
import { formationOf } from "../../logic/squad";
import { averageWage, totalPayroll } from "../../logic/wages";
import { at } from "../../logic/invariant";
import { EUROPEAN_CUP_NAMES, EUROPEAN_STAGE_LABELS } from "../european-cup-names";
import { LeagueTable } from "../components/league-table";
import { MarketAnomaliesSection } from "../components/market-anomalies-section";
import { RestartDialog } from "../components/restart-dialog";
import { ScreenHeader } from "../components/screen-header";
import { SectionHeading } from "../components/section-heading";
import { StickyActionBar } from "../components/sticky-action-bar";
import { SummaryList } from "../components/summary-list";
import { boardSharePercent } from "../board-share";
import { TransferLog } from "../components/transfer-log";

const RosterChangeGroup = ({ label, players }: { label: string; players: readonly Player[] }) =>
  players.length > 0 ? (
    <>
      <p className="dd-retiring-players-group">{label}</p>
      <ul>
        {players.map((player) => (
          <li key={player.id}>
            <div className="dd-retiring-players-row">
              <span className="dd-retiring-players-name">{player.nazwa}</span>
              <span className="dd-retiring-players-meta">
                {player.poz} · {pluralPl(player.wiek, YEAR_FORMS)} · OVR {player.ovr}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  ) : null;

/**
 * Pairs each player in `leavers` with the academy debutant who filled their
 * now-empty position, when there is one - a debutant only exists in
 * wynikSezonu at all when fillEmptyPositions ran right after this season's
 * retirements/expiries (src/logic/game-reducer.ts), so every debutant here
 * traces back to a leaver on the same position. Mutates `debutantPool` by
 * removing the debutant it consumes, so a shared pool can be threaded
 * through both leaver groups (retirees, then declined extensions) without
 * one group claiming a replacement the other already used.
 */
const pairLeaversWithDebutants = (
  leavers: readonly Player[],
  debutantPool: Player[]
): { leaver: Player; replacement: Player | null }[] =>
  leavers.map((leaver) => {
    const index = debutantPool.findIndex((d) => d.poz === leaver.poz);
    if (index === -1) return { leaver, replacement: null };
    const removed = debutantPool.splice(index, 1);
    const replacement = at(removed, 0, "debutant replacement");
    return { leaver, replacement };
  });

const LeaverGroup = ({
  label,
  leavers,
  debutantPool,
}: {
  label: string;
  leavers: readonly Player[];
  debutantPool: Player[];
}) => {
  if (leavers.length === 0) return null;
  const pairs = pairLeaversWithDebutants(leavers, debutantPool);
  return (
    <>
      <p className="dd-retiring-players-group">{label}</p>
      <ul>
        {pairs.map(({ leaver, replacement }) => (
          <li key={leaver.id}>
            <div className="dd-retiring-players-row">
              <span className="dd-retiring-players-name">{leaver.nazwa}</span>
              <span className="dd-retiring-players-meta">
                {leaver.poz} · {pluralPl(leaver.wiek, YEAR_FORMS)} · OVR {leaver.ovr}
              </span>
            </div>
            {replacement && (
              <span className="dd-retiring-players-replacement">
                Na tę pozycję wchodzi: {replacement.nazwa}{" "}
                {`(${pluralPl(replacement.wiek, YEAR_FORMS)}, OVR ${replacement.ovr}, debiutant z akademii)`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
};

const RosterChanges = ({
  emeryci,
  odeszli,
  debiutanci,
}: {
  emeryci: readonly Player[];
  odeszli: readonly Player[];
  debiutanci: readonly Player[];
}) => {
  const pool = [...debiutanci];
  return (
    <>
      <LeaverGroup label="Kończą karierę" leavers={emeryci} debutantPool={pool} />
      <LeaverGroup
        label="Odchodzą po wygaśnięciu kontraktu"
        leavers={odeszli}
        debutantPool={pool}
      />
      <RosterChangeGroup label="Debiutanci z akademii" players={pool} />
    </>
  );
};

export const SeasonEndScreen = ({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}) => {
  const result = state.wynikSezonu;
  const { club, kadra, kasa, europeanCup, tabela, log, rynek } = state;
  if (!result || !club || !tabela) return null;
  const clubId = club.clubId;
  const squadValue = kadra.reduce(
    (total, player) => total + marketValue(player.ovr, player.wiek, player.poz),
    0
  );
  const averageValue = kadra.length ? squadValue / kadra.length : 0;
  // Derived from the stored balance, never a new field on `SeasonResult`: the
  // two numbers are one constant apart, and a second field could go stale
  // against the first.
  const budgetChange = zaokr(transferBudgetChange(result.bilans), 2);
  // Relegation ends the tenure here too, not just after season five: the
  // reducer goes straight to the verdict on the next ADVANCE. Checking only
  // for season five promised a summer window that would never open and a
  // button that lied about where it led.
  const lastControlledSeason = result.sezon === SEZONY_GRY || result.spadek;

  const champion = tabela[0]?.club ?? "–";
  const europeanRows = (["LM", "LE", "LK"] as const).flatMap((cup) => {
    const clubs = result.europeanSpots.filter((spot) => spot.puchar === cup).map((s) => s.klub);
    if (!clubs.length) return [];
    return [
      {
        label: EUROPEAN_CUP_NAMES[cup],
        value: clubs.join(", "),
        tone: clubs.includes(club.shortName) ? ("positive" as const) : undefined,
      },
    ];
  });
  const cupWinnerPosition = tabela.findIndex((row) => row.club === result.polishCupWinner) + 1;
  const cupWinnerCascaded = cupWinnerPosition >= 1 && cupWinnerPosition <= 4;

  return (
    <>
      <ScreenHeader
        forecast={{
          expectedPlace: state.seasonForecastExpectedPlace,
          europeanIncome: state.seasonForecastEuropeanIncome,
        }}
        membership={state.membership}
        prawa={`Sezon ${result.sezon} zakończony${lastControlledSeason ? " · ostatni w twojej kadencji" : ""}`}
        club={club}
        cup={europeanCup}
        squad={kadra}
        cash={kasa}
      />
      <main className="dd-wrap dd-screen-content">
        <SectionHeading title="Tabela końcowa" meta="34 kolejki" />
        <LeagueTable
          rows={tabela}
          caption={`Tabela końcowa sezonu ${result.sezon}.`}
          spots={result.europeanSpots}
          final
        />

        <SectionHeading title="Rozstrzygnięcia sezonu" />
        <SummaryList
          label="Rozstrzygnięcia sezonu"
          rows={[
            { label: "Miejsce", value: `${result.miejsce}.` },
            { label: "Punkty", value: result.pkt },
            {
              label: "Mistrz Polski",
              value: champion,
              tone: result.mistrz ? "positive" : undefined,
            },
            {
              label: "Puchar Polski",
              value: result.polishCupWinner,
              tone: result.puchar ? "positive" : undefined,
            },
            ...(result.superCup
              ? [
                  {
                    label: "Superpuchar Polski",
                    value: `${result.superCup.won ? "wygrany" : "przegrany"} z ${result.superCup.opponent}`,
                    tone: result.superCup.won ? ("positive" as const) : undefined,
                  },
                ]
              : []),
            ...europeanRows,
            ...(result.spadek
              ? [{ label: "Ekstraklasa", value: "spadek", tone: "negative" as const }]
              : []),
          ]}
          note={
            cupWinnerCascaded
              ? `${result.polishCupWinner} zdobył Puchar Polski i zajął ${cupWinnerPosition}. miejsce w lidze, więc europejskie miejsce z tej pozycji trafia do kolejnego zespołu w kolejności tabeli.`
              : undefined
          }
        />

        <SectionHeading title="Kasa klubu" meta={`sezon ${result.sezon}`} />
        <SummaryList
          label="Finanse sezonu"
          rows={[
            // The column has to add up on screen. It used to open with
            // `przychodZLigi`, which is the season's WHOLE revenue - cups
            // included - under a label that said "z ligi", and then listed the
            // same cup money again below it. The rows therefore read as double
            // counting and never reached the balance, because the fixed costs
            // were missing entirely. Split into what the club earns by itself,
            // what the table paid it, and what the cups added.
            {
              label: "Przychód stały",
              value: `+${money(scaledRecurringRevenue(clubId))}`,
              tone: "positive",
            },
            {
              label: "Premia za miejsce",
              value: `+${money(leaguePositionPrize(result.miejsce))}`,
              tone: "positive",
            },
            ...result.europeanRun.map((leg) => ({
              label: `${EUROPEAN_CUP_NAMES[leg.cup]} – ${EUROPEAN_STAGE_LABELS[leg.stage]}`,
              value: `+${money(EUROPEAN_PRIZE_MONEY[leg.cup][leg.stage])}`,
              tone: "positive" as const,
            })),
            ...(result.polishCupIncome > 0
              ? [
                  {
                    label: "Puchar Polski – wygrany",
                    value: `+${money(result.polishCupIncome)}`,
                    tone: "positive" as const,
                  },
                ]
              : []),
            ...(result.superCupIncome > 0
              ? [
                  {
                    label: "Superpuchar",
                    value: `+${money(result.superCupIncome)}`,
                    tone: "positive" as const,
                  },
                ]
              : []),
            { label: "Płace", value: `−${money(result.place)}`, tone: "negative" },
            // Was missing altogether, which is why the column could not be
            // reconciled: every other line was on screen and the balance still
            // came out 1,10 lower than they summed to.
            { label: "Koszty stałe", value: `−${money(KOSZTY_STALE)}`, tone: "negative" },
            {
              label: "Bilans sezonu",
              value: `${znak(result.bilans)}${money(result.bilans)}`,
              tone: result.bilans >= 0 ? "positive" : "negative",
            },
            // Both numbers, always. The balance is the club's result and the
            // line below it is what reached the transfer budget: seeing
            // "bilans +5" and then finding only +1,5 in the cash would read
            // as a bug rather than as the board's rule.
            //
            // No `tone` here, deliberately. `.dd-summary-list > div.is-emphasis
            // dd` (0,2,2) outranks `.dd-summary-list dd.is-positive` (0,2,1),
            // so a tone on an emphasised row is inert - it would read as a
            // colour the player never sees. Emphasis carries this row instead,
            // in weight and in `--text-primary`, and the sign comes from
            // `znak()`. The balance above keeps its tone and reads green or
            // red, which is the right split: the result is information, the
            // budget change is the headline.
            {
              label: `Zmiana budżetu, ${boardSharePercent()} bilansu`,
              value: `${znak(budgetChange)}${money(budgetChange)}`,
              emphasis: true,
            },
          ]}
          // The share cuts both ways, and the losing half is the one a player
          // would otherwise read as a bug: a club 1,00 in the red loses only
          // 0,30 of its transfer budget. Saying who covers the rest turns a
          // number that looks broken into the board doing its job.
          note={
            result.bilans < 0
              ? `Zarząd przekazuje na transfery ${boardSharePercent()} bilansu, a przy stracie pokrywa ją z własnej kieszeni w tej samej proporcji. Dlatego z ${money(Math.abs(result.bilans))} pod kreską budżet traci tylko ${money(Math.abs(budgetChange))}.`
              : `Zarząd przekazuje na transfery ${boardSharePercent()} bilansu; reszta zostaje w klubie. Przy ujemnym bilansie działa to tak samo w drugą stronę, więc większość straty pokrywa zarząd.`
          }
        />

        <section className="dd-squad-summary-section" aria-labelledby="season-squad-heading">
          <SectionHeading id="season-squad-heading" title="Twoja kadra po sezonie" />
          <SummaryList
            label="Wartość i płace kadry"
            rows={[
              { label: "Liczba zawodników", value: kadra.length },
              { label: "Wartość kadry", value: money(squadValue) },
              { label: "Średnia wartość zawodnika", value: money(averageValue) },
              { label: "Łączne roczne wydatki na płace", value: money(totalPayroll(kadra)) },
              { label: "Średnia płaca roczna", value: money(averageWage(kadra)) },
            ]}
            note="Wartość kadry liczy się do dziedzictwa, dlatego pokazujemy ją na koniec sezonu, a nie w oknie transferowym."
          />
          {(result.emeryci.length > 0 ||
            result.odeszli.length > 0 ||
            result.debiutanci.length > 0) && (
            <>
              <SectionHeading title="Odejścia i debiuty" />
              <div className="dd-retiring-players">
                <RosterChanges
                  emeryci={result.emeryci}
                  odeszli={result.odeszli}
                  debiutanci={result.debiutanci}
                />
              </div>
            </>
          )}
        </section>

        {!lastControlledSeason && (
          <MarketAnomaliesSection
            rynek={rynek}
            formation={formationOf(state)}
            meta="zapowiedź okna letniego"
          />
        )}

        <TransferLog entries={log} />
        <RestartDialog pytamRestart={state.pytamRestart} dispatch={dispatch} />
      </main>
      <StickyActionBar label="Przejście po zakończeniu sezonu">
        <button
          type="button"
          className="dd-action-primary"
          data-dd-action="dalej"
          onClick={() => dispatch({ type: "ADVANCE" })}
        >
          {lastControlledSeason ? "Podsumuj kadencję" : "Przejdź do kolejnego sezonu"}
          <small>
            {result.spadek
              ? "Spadek kończy twoją kadencję."
              : lastControlledSeason
                ? "To był ostatni sezon, na który miałeś wpływ."
                : "Najpierw zobaczysz aktualny przegląd kadry."}
          </small>
        </button>
      </StickyActionBar>
    </>
  );
};
