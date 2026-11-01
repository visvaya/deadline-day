import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import type { Player } from "../../data/types";
import type { GameAction, GameState, Offer } from "../../data/types";
import { zaokr } from "../../logic/format";
import { annualForecastBreakdown } from "../../logic/finance";
import { buyPrice, extensionWage, sellPrice } from "../../logic/offers";
import { reportPeriod } from "../../logic/game-reducer";
import { squadReportContextOvr } from "../../logic/squad-reports";
import { acquisitionCapacityOutcome, formationOf } from "../../logic/squad";
import { isExternalSigningType } from "../../logic/offers";
import { budgetForecastMessage, stallMessage } from "../../logic/decision-messages";
import { at, defined } from "../../logic/invariant";
import { totalPayroll, baseWage, playerWage, signingWageMultiplier } from "../../logic/wages";
import { ActionBar } from "../components/action-bar";
import { OfferCard } from "../components/offer-card";
import type { NotificationKind } from "../components/notification-banner";
import { RestartDialog } from "../components/restart-dialog";
import { ScreenHeader } from "../components/screen-header";
import { SquadDrawer } from "../components/squad-drawer";
import { SquadEvictionDialog } from "../components/squad-eviction-dialog";
import { TransferLog } from "../components/transfer-log";
import { seasonChangePeriod } from "../components/player-tile-utils";

const notificationKind = (offer: Offer): NotificationKind => {
  if (offer.typ === "SPRZEDAZ") return "sale";
  if (offer.typ === "WOLNY") return "free-agent";
  if (offer.typ === "PRZEDLUZENIE") return "extension";
  return "purchase";
};

/**
 * A decision whose outcome cannot be composed before dispatching, waiting for
 * the reducer to actually accept it.
 *
 * Carries the identity of the decision, not just its kind: the timer runs
 * under the confirmation dialog and can close this offer and deal the next
 * one in one pass, so a notification must only fire once `decisionIndex` has
 * actually moved and the recorded token matches what was asked for. Without
 * that, an offer expiring mid-dialog would announce a purchase that never
 * happened.
 */
type PendingSquadEviction = {
  choice: "take" | "haggle";
  offerPlayerId: string;
  player: Player;
};

export type PendingDecisionNotification = {
  kind: NotificationKind;
  baseDecisionIndex: number;
  expectedToken: "BIERZ" | "TARG" | "PAS";
  offerPlayerId: string;
  /** The forecast budget change before the decision, so the notification can
   * say where the decision moved it. */
  forecastBefore: number;
};

/** The frozen-forecast budget change for the squad as it stands. */
export const forecastBudgetChange = (
  state: Pick<
    GameState,
    "club" | "kadra" | "seasonForecastExpectedPlace" | "seasonForecastEuropeanIncome"
  >
): number =>
  annualForecastBreakdown({
    clubId: defined(state.club, "club").clubId,
    squad: state.kadra,
    forecast: {
      expectedPlace: state.seasonForecastExpectedPlace,
      europeanIncome: state.seasonForecastEuropeanIncome,
    },
  }).transferBudgetChange;

/**
 * The notification for a decision the reducer has just accepted: its own log
 * line, word for word, and where the decision moved the forecast budget. One
 * source for both, so the banner and "Ostatnie decyzje transferowe" can never
 * describe the same decision differently.
 */
export const pendingNotificationText = (
  pending: PendingDecisionNotification,
  state: Pick<
    GameState,
    "log" | "club" | "kadra" | "seasonForecastExpectedPlace" | "seasonForecastEuropeanIncome"
  >
): string => {
  const entry = at(state.log, 0, "decision log entry");
  const budget = budgetForecastMessage(pending.forecastBefore, forecastBudgetChange(state));
  return budget === null ? entry : `${entry} ${budget}`;
};

export const OfferWindowScreen = ({
  state,
  dispatch,
  onNotify,
  onDecisionPending,
}: {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  onNotify: (_text: string, _kind: NotificationKind) => void;
  onDecisionPending: (_pending: PendingDecisionNotification) => void;
}) => {
  const [openSquadForOffer, setOpenSquadForOffer] = useState<Offer | null>(null);
  const closeSquad = useCallback(() => setOpenSquadForOffer(null), []);
  // Local to the screen, never part of GameState: a transient confirmation
  // must not reach the save file, the golden trace or the timer.
  const [pendingEviction, setPendingEviction] = useState<PendingSquadEviction | null>(null);
  // The card object identity changes whenever the reducer deals a new offer,
  // including when the timer expires this one. Dropping the dialog then is
  // what stops a late click from answering a card the player never saw.
  // Declared before any early return so the hook order never varies.
  useEffect(() => setPendingEviction(null), [state.karta]);
  // A11y fix (2026-09-17, WCAG 2.4.3/2.4.11): a decision that moves the
  // window on to its next card never triggers a screen transition (`faza`
  // stays "okno" the whole window), so app.tsx's own heading-focus effect -
  // which only fires on a `faza` change - never gets a chance to notice or
  // fix anything here. Two things can strand a keyboard user's focus on
  // this exact boundary: the action button that was focused becomes
  // `disabled` on the new card (a browser blurs a disabled focused control
  // straight to <body>, invisibly - jsdom does not replicate this, but real
  // browsers do), and SquadEvictionDialog's own unmount cleanup restoring
  // focus to whatever opened it, which can by then be exactly that disabled
  // button. `decisionIndex` is the one signal common to every path that
  // actually resolves a decision (take/pass/haggle/CONFIRM_SQUAD_EVICTION) -
  // unlike STALL, which changes nothing about the card and must not trigger
  // this at all.
  const previousDecisionRef = useRef({
    decisionIndex: state.decisionIndex,
    offerId: state.karta?.zawodnik.id ?? null,
  });
  useEffect(() => {
    const previous = previousDecisionRef.current;
    previousDecisionRef.current = {
      decisionIndex: state.decisionIndex,
      offerId: state.karta?.zawodnik.id ?? null,
    };
    // Nothing resolved - most renders in this window (a tick, a stall, the
    // dialog opening) land here and must never touch focus.
    if (previous.decisionIndex === state.decisionIndex) return;
    // The window just ended - this screen is about to unmount, and app.tsx's
    // heading-focus effect owns the screen it lands on instead.
    if (!state.karta) return;

    const active = document.activeElement;
    const stillUsable =
      active !== null &&
      active !== document.body &&
      active !== document.documentElement &&
      document.contains(active) &&
      !(active instanceof HTMLButtonElement && active.disabled);
    if (stillUsable) return;

    // The sticky action bar: always visible (fixed to the bottom, never
    // under the notification banner fixed to the top - the two can never
    // occupy the same space) and the first enabled control in it is the
    // natural next thing a keyboard user reaches for on a fresh card
    // regardless of which button they had just pressed.
    //
    // Every card today keeps at least "pas" enabled, so the bar always has a
    // target. Should a future card disable all of them at once, fall back to
    // the screen heading (focusable via tabindex="-1") rather than leaving
    // focus on <body>: a heading the notification banner may briefly cover
    // is still better than no position on the page at all.
    const target =
      document.querySelector<HTMLElement>(".dd-action-bar button:not([disabled])") ??
      document.querySelector<HTMLElement>('h1[tabindex="-1"]');
    target?.focus({ preventScroll: true });
  }, [state.decisionIndex, state.karta]);
  const {
    kadra,
    europeanCup,
    karta,
    kasa,
    club,
    rynek,
    timerWl,
    czas,
    maxCzas,
    log,
    pytamRestart,
    ovrChange,
  } = state;
  if (!karta || !club) return null;
  const formation = formationOf(state);
  const windowStep = state.kroki[state.krok] as Extract<
    GameState["kroki"][number],
    { typ: "okno" }
  >;
  // Never coloured here, in either window: the squad overview has already
  // shown this season's deltas in colour, and an offer screen is where the
  // player is deciding about one player - a row of green and red numbers
  // beside him competes with that for attention while a clock runs. The number
  // stays, the interruption does not.
  const changePeriod = seasonChangePeriod(windowStep, "offer");
  const stalls = state.przeciagniecia;
  const isSale = karta.typ === "SPRZEDAZ";
  const isExtension = karta.typ === "PRZEDLUZENIE";
  const price = isSale
    ? sellPrice(karta, stalls)
    : isExtension
      ? extensionWage(karta, stalls)
      : buyPrice(karta, stalls);
  // A PRZEDLUZENIE ask is never blocked by cash - it's a wage commitment,
  // not a fee.
  const canTake = isSale || isExtension || price <= kasa;
  // The same helper the reducer applies, so the card and the transfer cannot
  // disagree - including the WOLNY signing premium, which at a zero fee is the
  // whole price of the card.
  const signingMultiplier = signingWageMultiplier(karta.typ, stalls);
  // A player already here (sale, extension) is paid what his contract says,
  // multiplier included - the payroll drops by exactly this on a sale.
  const wage =
    isExtension || isSale
      ? playerWage(karta.zawodnik)
      : baseWage(karta.zawodnik.ovr) * signingMultiplier;
  const cashAfter = zaokr(isExtension ? kasa : isSale ? kasa + price : kasa - price, 2);
  // Only a signing can be short of room. A sale or an extension acts on
  // someone already here, and a pass fills nothing, so neither is ever gated
  // on capacity.
  const capacityOutcome = isExternalSigningType(karta.typ)
    ? acquisitionCapacityOutcome(kadra, karta.zawodnik, formation)
    : null;
  const evictedPlayer = capacityOutcome?.kind === "evictsExisting" ? capacityOutcome.player : null;
  // The squad as the reducer will leave it, eviction included. Without the
  // filter every "after" figure on the card - total wages, the forecast -
  // described a squad one player larger than the one the engine would
  // actually produce.
  const squadAfter = isSale
    ? kadra.filter((player) => player.id !== karta.zawodnik.id)
    : isExtension
      ? kadra.map((player) =>
          player.id === karta.zawodnik.id
            ? { ...player, mnoznikPlacy: price / baseWage(player.ovr) }
            : player
        )
      : [
          ...kadra.filter((player) => player.id !== evictedPlayer?.id),
          { ...karta.zawodnik, mnoznikPlacy: signingMultiplier },
        ];
  // The frozen income side, so the difference the card shows is exactly the
  // change in the whole payroll - eviction and refill included - and never a
  // re-forecast of a season that has not been played.
  const clubId = club.clubId;
  const frozenForecast = {
    expectedPlace: state.seasonForecastExpectedPlace,
    europeanIncome: state.seasonForecastEuropeanIncome,
  };
  // The BUDGET change on both sides, the same quantity the HUD shows, so the
  // card's "after" and the header's number describe one thing. A card that
  // moved the operating result while the HUD moved the budget would leave the
  // player reading two different forecasts on one screen.
  const forecastBefore = forecastBudgetChange(state);
  const forecastAfter = annualForecastBreakdown({
    clubId,
    squad: squadAfter,
    forecast: frozenForecast,
  }).transferBudgetChange;
  const currentOffer = windowStep.ruchy - state.ruchy + 1;
  const squadOpen = openSquadForOffer === karta;
  // The timer can replace the offer before the passive cleanup runs. Never
  // commit one frame that pairs the new card with the previous card's release.
  const activePendingEviction =
    pendingEviction?.offerPlayerId === karta.zawodnik.id ? pendingEviction : null;
  const context = `Sezon ${windowStep.sezon} · ${windowStep.tura}`;

  // Every decision is announced once the reducer has accepted it, with the
  // reducer's own log line - see pendingNotificationText.
  const armNotification = (
    expectedToken: PendingDecisionNotification["expectedToken"],
    offerPlayerId: string = karta.zawodnik.id
  ): void =>
    onDecisionPending({
      kind: expectedToken === "PAS" ? "neutral" : notificationKind(karta),
      baseDecisionIndex: state.decisionIndex,
      expectedToken,
      offerPlayerId,
      forecastBefore,
    });

  const sendTake = (): void => {
    armNotification("BIERZ");
    dispatch({ type: "DECIDE", choice: "take" });
  };

  const sendHaggle = (): void => {
    armNotification("TARG");
    dispatch({ type: "DECIDE", choice: "haggle" });
  };

  const handleTake = (): void => {
    // Defensive: the generator is forbidden from showing this card at all.
    if (capacityOutcome?.kind === "rejectsIncoming") return;
    if (capacityOutcome?.kind === "evictsExisting") {
      setPendingEviction({
        choice: "take",
        offerPlayerId: karta.zawodnik.id,
        player: capacityOutcome.player,
      });
      return;
    }
    sendTake();
  };

  const handleHaggle = (): void => {
    if (capacityOutcome?.kind === "rejectsIncoming") return;
    if (capacityOutcome?.kind === "evictsExisting") {
      // Asked before the roll, so cancelling costs neither a move nor rng.
      setPendingEviction({
        choice: "haggle",
        offerPlayerId: karta.zawodnik.id,
        player: capacityOutcome.player,
      });
      return;
    }
    sendHaggle();
  };

  const confirmEviction = (): void => {
    if (!pendingEviction) return;
    const { choice, offerPlayerId, player } = pendingEviction;
    setPendingEviction(null);
    armNotification(choice === "take" ? "BIERZ" : "TARG", offerPlayerId);
    dispatch({
      type: "CONFIRM_SQUAD_EVICTION",
      choice,
      offerPlayerId,
      evictedPlayerId: player.id,
    });
  };

  const handleStall = (): void => {
    const nextStalls = stalls + 1;
    const fee = isExtension
      ? null
      : isSale
        ? { amount: sellPrice(karta, nextStalls), rises: false }
        : karta.typ === "WOLNY"
          ? null
          : { amount: buyPrice(karta, nextStalls), rises: true };
    const nextWage = isSale
      ? null
      : isExtension
        ? extensionWage(karta, nextStalls)
        : baseWage(karta.zawodnik.ovr) * signingWageMultiplier(karta.typ, nextStalls);
    onNotify(stallMessage(karta.zawodnik, fee, nextWage), notificationKind(karta));
    dispatch({ type: "STALL" });
  };

  const handlePass = (): void => {
    armNotification("PAS");
    dispatch({ type: "DECIDE", choice: "pass" });
  };

  return (
    <>
      <ScreenHeader
        prawa={context}
        club={club}
        cup={europeanCup}
        squad={kadra}
        cash={kasa}
        forecast={{
          expectedPlace: state.seasonForecastExpectedPlace,
          europeanIncome: state.seasonForecastEuropeanIncome,
        }}
        membership={state.membership}
        currentOffer={currentOffer}
        totalOffers={windowStep.ruchy}
      />
      <main className="dd-wrap dd-offer-content">
        <OfferCard
          offer={karta}
          squad={kadra}
          formation={formation}
          europeanCup={europeanCup}
          marketState={rynek[karta.zawodnik.poz]}
          price={price}
          wage={wage}
          cash={kasa}
          cashAfter={cashAfter}
          totalWagesAfter={totalPayroll(squadAfter)}
          forecastAfter={forecastAfter}
          currentClubName={club.name}
          timer={timerWl ? { current: czas, maximum: maxCzas } : null}
          seasonalChanges={ovrChange}
          changePeriod={changePeriod}
          onOpenSquad={() => setOpenSquadForOffer(karta)}
        />

        <TransferLog entries={log} live />
        <RestartDialog pytamRestart={pytamRestart} dispatch={dispatch} />
      </main>

      <ActionBar
        offerType={karta.typ}
        price={price}
        wage={wage}
        stalls={stalls}
        timerEnabled={timerWl}
        canTake={canTake}
        onTake={handleTake}
        onHaggle={handleHaggle}
        onStall={handleStall}
        onPass={handlePass}
      />
      {squadOpen && (
        <SquadDrawer
          squad={kadra}
          formation={formation}
          highlightedPosition={karta.zawodnik.poz}
          seasonalChanges={ovrChange}
          changePeriod={changePeriod}
          period={reportPeriod(state)}
          contextOvr={squadReportContextOvr(kadra, formation)}
          staffMemory={state.staffMemory}
          inEurope={europeanCup !== null}
          exitLabel="Wróć do oferty"
          onClose={closeSquad}
        />
      )}
      {activePendingEviction && (
        <SquadEvictionDialog
          position={karta.zawodnik.poz}
          incomingPlayer={karta.zawodnik}
          evictedPlayer={activePendingEviction.player}
          choice={activePendingEviction.choice}
          onConfirm={confirmEviction}
          onCancel={() => setPendingEviction(null)}
        />
      )}
    </>
  );
};
