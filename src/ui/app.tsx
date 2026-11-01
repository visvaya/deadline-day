import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { GameAction, GameState } from "../data/types";
import { gameReducer } from "../logic/game-reducer";
import { initialState } from "../logic/game-state";
import { ENGINE_REVISION } from "../logic/engine-version";
import { randomSeed } from "../logic/rng";
import { defined } from "../logic/invariant";
import { NotificationBanner, type NotificationKind } from "./components/notification-banner";
import { getInputModality, getInputSequence } from "./input-modality";
import type { PendingDecisionNotification } from "./screens/offer-window-screen";
import { ManagerScreen } from "./screens/manager-screen";
import { ClubSelectScreen } from "./screens/club-select-screen";
import { MarketScreen } from "./screens/market-screen";
import { OfferWindowScreen, pendingNotificationText } from "./screens/offer-window-screen";
import { HalfSeasonScreen } from "./screens/half-season-screen";
import { SeasonEndScreen } from "./screens/season-end-screen";
import { VerdictScreen } from "./screens/verdict-screen";
import { EpilogueScreen } from "./screens/epilogue-screen";
import { FinalScreen } from "./screens/final-screen";
import { ArchiveScreen } from "./screens/archive-screen";
import { UiPreferencesProvider } from "./ui-preferences";
import { archiveEntryId, saveFinishedGame } from "./game-archive";
import {
  clearGameSave,
  clearPendingTimeoutNotice,
  inspectGameSave,
  isResumable,
  markPendingTimeoutNotice,
  peekPendingTimeoutNotice,
  saveFingerprint,
  writeGameSave,
  type GameSaveLoadResult,
  type StoredGameSave,
} from "./game-save";
import { clearSetupDraft, readSetupDraft } from "./setup-draft";
import "./styles.css";

const TIMEOUT_NOTICE = "Czas na podjęcie decyzji minął. Przechodzisz do kolejnej oferty/ekranu.";
const DISCARDED_SAVE_NOTICE = "Nie udało się wznowić niezgodnego zapisu. Rozpocznij nową karierę.";
/**
 * Shown once per run of consecutive writeGameSave() failures - see the
 * saveFailureNoticeShownRef bookkeeping below. Never auto-dismisses (product
 * decision, 2026-09-23): a player who misses this would keep playing a
 * career that silently cannot survive a reload.
 */
const SAVE_FAILED_NOTICE =
  "Nie udało się zapisać postępu. Możesz grać dalej, ale po zamknięciu lub odświeżeniu strony ta kariera przepadnie.";
/** Same "once per run of failures" shape as SAVE_FAILED_NOTICE, for
 * saveFinishedGame() instead of writeGameSave(). */
const ARCHIVE_SAVE_FAILED_NOTICE =
  "Nie udało się zapisać wyniku w archiwum. Partia jest zakończona, ale nie pojawi się na liście wyników.";

/** The UI never passes measurement options, and React 19's useReducer typing
 * does not accept a reducer with an optional third parameter, so the hook
 * gets a two-argument view of gameReducer. */
const uiReducer = (state: GameState, action: GameAction): GameState => gameReducer(state, action);

/** Whether `elapsedSeconds` of real time would blow through the countdown on
 * an open, timed offer - shared by the reload-resume and same-session
 * backgrounding paths below, since both reconcile against the wall clock. */
const wouldExpire = (state: GameState, elapsedSeconds: number): boolean =>
  elapsedSeconds > 0 &&
  state.faza === "okno" &&
  state.timerWl &&
  state.karta !== null &&
  elapsedSeconds >= state.czas;

/**
 * Mirrors prototype's DeadlineDay() top-level render :709-1242. All game
 * state lives in the reducer - useReducer is the only state hook here.
 */
const Game = () => {
  // Captured once during the lazy init below, purely as a side channel for
  // the mount-time reconciliation effect - inspectGameSave() already
  // validated it, so re-reading storage here would just duplicate that work.
  const resumedSaveRef = useRef<StoredGameSave | null>(null);
  // Also captured once during the same lazy init, so the "discarded" branch
  // below never has to call inspectGameSave() a second time (it is
  // non-destructive and would return the same answer, but there is no
  // reason to read storage twice for one mount).
  const saveLoadResultRef = useRef<GameSaveLoadResult | null>(null);
  // Populated (once, from the same lazy init below) only when there is no
  // career to resume: a raw, possibly-not-yet-valid manager name typed
  // before the last reload. Used as a fallback prefill for ManagerScreen
  // below - never re-read from storage after mount, matching
  // resumedSaveRef's pattern. The club id is different: see the
  // ClubSelectScreen wiring, which reads it on each entry to that screen.
  const draftPrefillRef = useRef<{ firstName: string; lastName: string } | null>(null);
  const [state, dispatch] = useReducer(uiReducer, undefined, () => {
    const result = inspectGameSave();
    saveLoadResultRef.current = result;
    resumedSaveRef.current = result.kind === "loaded" ? result.save : null;
    if (result.kind === "loaded") {
      // A resumed career always wins over a leftover setup draft (owner
      // decision) - the draft is necessarily stale once a real career
      // exists, so there is nothing left for it to usefully restore.
      clearSetupDraft();
      return result.save.state;
    }

    const draft = readSetupDraft();
    if (!draft) return initialState();

    draftPrefillRef.current = { firstName: draft.firstName, lastName: draft.lastName };

    let base = initialState();
    if (draft.timerWl !== base.timerWl) base = gameReducer(base, { type: "TOGGLE_TIMER" });
    if (draft.step === "club") {
      // START_GAME is the reducer's own pure, idempotent transform (see
      // game-reducer.ts) - reused here rather than re-implemented, so this
      // stays a single source of manager validation. An invalid draft name
      // (still mid-typing when the page last closed) simply leaves `base`
      // unchanged: `faza` stays "start", exactly the step the player would
      // land on if the live form rejected the same input.
      base = gameReducer(base, {
        type: "START_GAME",
        manager: { firstName: draft.firstName, lastName: draft.lastName },
      });
    }
    return base;
  });
  // StrictMode-safe: read once from the ref populated above, never a second
  // call to inspectGameSave(). "discarded" never clears storage itself (see
  // inspectGameSave's own contract) - the effect below does that, once,
  // after the message has had a chance to render.
  const [saveDiscarded] = useState<boolean>(() => saveLoadResultRef.current?.kind === "discarded");
  // A reload can land after the saved countdown already ran out in the real
  // world (screen off, tab discarded) - decided once, synchronously, so the
  // generic "resumed" banner and the specific timeout banner never both
  // flash in sequence (see the banner effect below, which reads this).
  //
  // peekPendingTimeoutNotice() takes priority over the fresh wall-clock
  // check: a same-session background timeout (see the visibilitychange
  // effect below) already resolved the card and showed its own notice
  // *before* this reload happened - by the time this mount runs, `czas` on
  // the resumed state is already a fresh, untouched countdown for whatever
  // card came next, so the wall-clock check alone would wrongly read as an
  // ordinary "resumed". The flag is how this mount learns a timeout notice
  // is owed even though there is nothing left for *this* mount to reconcile.
  const [resumeNotice] = useState<"none" | "resumed" | "timedOut">(() => {
    const resumedGame = resumedSaveRef.current;
    if (!resumedGame) return "none";
    if (peekPendingTimeoutNotice()) return "timedOut";
    const elapsedSeconds = Math.floor((Date.now() - resumedGame.savedAt) / 1000);
    return wouldExpire(resumedGame.state, elapsedSeconds) ? "timedOut" : "resumed";
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [notification, setNotification] = useState<{
    id: number;
    text: string;
    kind: NotificationKind;
    /** True for a notice that must stay on screen until the player explicitly
     * dismisses it (close button, Escape, swipe) - never on its own clock.
     * Carried on the notification itself, not derived from its text, so the
     * banner's auto-dismiss decision stays a pure function of state. */
    persistent: boolean;
  } | null>(null);
  const notify = useCallback(
    (text: string, kind: NotificationKind, options?: { persistent?: boolean }): void => {
      const persistent = options?.persistent ?? false;
      setNotification((previous) => {
        // A live persistent notice (the save-failure/archive-failure warning)
        // is never displaced by an ordinary one - an ordinary decision banner
        // arriving one click later would otherwise silently swallow the
        // warning, and the once-per-run latch would then keep it from ever
        // coming back while storage stays blocked (final review, Important
        // 1). Returning the same object is a no-op React bails out of, so
        // nothing about the still-open banner (focus hold, its own timers)
        // changes. A persistent notice may still replace an ordinary one, and
        // once the player dismisses the persistent notice (`notification`
        // becomes null), ordinary notices behave exactly as before.
        if (previous?.persistent && !persistent) return previous;
        return { id: (previous?.id ?? 0) + 1, text, kind, persistent };
      });
    },
    []
  );
  // "Once per run of consecutive failures" (product decision, 2026-09-23):
  // UI state, not game state, so it lives in a ref rather than the reducer -
  // it must never reach the golden master or the save itself. Reset to
  // `false` on the next successful write, so a later failure after a
  // success shows the notice again - and also reset on a new career (see
  // the seed-watching effect below), because a fresh career in still-blocked
  // storage is just as unsaved as the last one was.
  const saveFailureNoticeShownRef = useRef(false);
  const archiveFailureNoticeShownRef = useRef(false);
  // Shared by the fingerprint autosave effect and the visibilitychange/
  // pagehide flush below - both attempt the same writeGameSave() and react
  // to failure the same way (once-per-run notice via saveFailureNoticeShownRef),
  // so the write-then-notify step lives here once instead of twice.
  const writeGameSaveWithNotice = useCallback(
    (careerState: GameState): void => {
      if (writeGameSave(careerState)) {
        saveFailureNoticeShownRef.current = false;
        return;
      }
      if (saveFailureNoticeShownRef.current) return;
      saveFailureNoticeShownRef.current = true;
      notify(SAVE_FAILED_NOTICE, "neutral", { persistent: true });
    },
    [notify]
  );
  // Ruling (final review, round 2, 2026-09-23): both once-per-run latches
  // reset when a new career starts (START_CAREER or PLAY_AGAIN), not only on
  // a successful write. `Game` is never remounted between careers (PLAY_AGAIN
  // stays on the same component instance), so without this a second career
  // played entirely under still-blocked storage would get neither warning.
  // `state.seed` is set once per career by applyStartCareer
  // (game-reducer.ts) and never changes within one - watching it change is
  // cheaper and more direct than adding a reducer field only these UI refs
  // would ever read, and keeps the refs out of GameState (never reaching the
  // golden master or the save itself). Declared ahead of the effects that
  // actually attempt a write, so a write attempted in the same commit a new
  // career starts already sees the reset latches.
  const previousCareerSeedRef = useRef(state.seed);
  useEffect(() => {
    if (state.seed === previousCareerSeedRef.current) return;
    previousCareerSeedRef.current = state.seed;
    if (state.seed === null) return;
    saveFailureNoticeShownRef.current = false;
    archiveFailureNoticeShownRef.current = false;
  }, [state.seed]);
  // A11y fix (2026-09-17, WCAG 2.4.11): the id of the notification currently
  // holding a keyboard user's focus hostage (see the transition effect
  // below), or null when nothing is held. `pendingHeadingFocusRef` is the
  // heading selector a transition deferred - written either when a fresh
  // hold is armed (applied once the player closes the banner via
  // dismissNotification) or when a stale hold is dropped (applied once the
  // dropped banner has actually left the DOM) - and in both cases actually
  // read and cleared by the dedicated effect below, never at the write site
  // itself.
  const heldNotificationIdRef = useRef<number | null>(null);
  const pendingHeadingFocusRef = useRef<string | null>(null);
  // The id of the last notification this render logic has already evaluated
  // for a fresh hold (whether or not it actually got one) - `-1` never
  // matches a real id (notify() starts counting at 1), so the very first
  // notification of a session is always "new". Distinguishes a notification
  // that just appeared from one that has been sitting on screen for a while
  // when an unrelated transition happens to land during its lifetime (see
  // isFreshHold below).
  const consideredNotificationIdRef = useRef<number>(-1);
  // Snapshot of getInputSequence() taken at the moment of the most recent
  // screen transition - as long as it still matches the live counter, no
  // keyboard/pointer/touch input has happened since, so a notification that
  // shows up now (even from a later render than the transition itself, e.g.
  // a haggle's resolved outcome) still counts as coinciding with it.
  const pendingTransitionSeqRef = useRef<number | null>(null);
  // Scoped to whichever notification.id is currently displayed, reset
  // whenever a fresh one mounts - otherwise a later, unrelated banner would
  // inherit a held banner's old nonzero count and steal focus on mount for
  // no reason (see NotificationBanner's own focusCloseSignal prop doc).
  const bannerFocusSignalRef = useRef<{ id: number; count: number }>({ id: -1, count: 0 });
  const dismissNotification = useCallback((): void => {
    setNotification(null);
    heldNotificationIdRef.current = null;
    // pendingHeadingFocusRef, if set, is applied by the effect below once
    // `notification` has actually become null and the banner is out of the
    // DOM - never synchronously here. See that effect's comment for why.
  }, []);

  // Haggling resolves its price via RNG inside the reducer, so the outcome
  // can't be composed before dispatching like a plain take can. This effect
  // survives the offer screen unmounting when the resolved offer was the
  // last one in the window (see the OfferWindowScreen handoff below).
  // A decision waiting for the reducer to accept it - a haggle, whose price
  // only exists after the roll, or a confirmed signing that releases a squad
  // member. Identified, not just typed: the timer runs under the
  // confirmation dialog and can expire this offer and deal the next one in a
  // single pass, so the notification must be tied to the exact decision that
  // was asked for.
  const pendingDecision = useRef<PendingDecisionNotification | null>(null);
  // The newest decision index and open offer, mirrored during render so a
  // late handler from a dismissed dialog cannot arm a notification against
  // the card that replaced its own.
  const latestDecision = useRef({
    decisionIndex: state.decisionIndex,
    offerPlayerId: state.karta?.zawodnik.id ?? null,
  });
  latestDecision.current = {
    decisionIndex: state.decisionIndex,
    offerPlayerId: state.karta?.zawodnik.id ?? null,
  };
  // Armed right before a RECONCILE_TIME dispatch that will expire the open
  // offer (see wouldExpire below), so the log-watch effect below shows the
  // specific timeout message instead of the reducer's own pass sentence.
  const pendingTimeoutNotice = useRef(false);
  const registerPendingDecision = useCallback((pending: PendingDecisionNotification): void => {
    // Stale handler: the card already moved on, so this pending belongs to a
    // decision that is no longer on screen.
    if (
      pending.baseDecisionIndex !== latestDecision.current.decisionIndex ||
      pending.offerPlayerId !== latestDecision.current.offerPlayerId
    ) {
      return;
    }
    pendingDecision.current = pending;
  }, []);

  // Watches the decision counter rather than the log text: two decisions in
  // a row can produce the same sentence, and - more to the point - a pending
  // confirmation must only fire for the decision it was armed for. An offer
  // that expired under the dialog resolves as a pass, whose token will not
  // match, so the player is told about the timeout and never about a
  // purchase that did not happen.
  //
  // A layout effect, not a passive one (WCAG 2.4.11 fix, 2026-09-21). When
  // the resolved decision also ends the window, this render is a screen
  // transition, and the transition effect below focuses the new heading.
  // From a passive effect, notify() is a default-priority update rendered in
  // a LATER task: the browser could paint in between, with the heading
  // focused under whatever earlier banner was still on screen, before the
  // late notification replaced it and took the hold (caught by the WebKit
  // e2e walk after a window-ending eviction confirmation, ~1 run in 20). An
  // update raised during the layout phase is rendered synchronously in the
  // same task, before any paint, so no such frame exists.
  const previousDecisionIndex = useRef(state.decisionIndex);
  useLayoutEffect(() => {
    if (state.decisionIndex === previousDecisionIndex.current) return;
    previousDecisionIndex.current = state.decisionIndex;
    const pending = pendingDecision.current;
    // Cleared on every resolved decision, matched or not: a pending that
    // missed its moment must never be shown against a later card.
    pendingDecision.current = null;

    if (pendingTimeoutNotice.current) {
      notify(TIMEOUT_NOTICE, "neutral");
      // Survives a reload landing moments later (Vite's dev client
      // reconnecting, another tab-discard) - see resumeNotice's
      // peekPendingTimeoutNotice() check above.
      markPendingTimeoutNotice();
      pendingTimeoutNotice.current = false;
      return;
    }
    if (!pending) return;
    if (state.akcje.at(-1) !== pending.expectedToken) return;
    notify(
      pendingNotificationText(pending, {
        log: state.log,
        club: state.club,
        kadra: state.kadra,
        seasonForecastExpectedPlace: state.seasonForecastExpectedPlace,
        seasonForecastEuropeanIncome: state.seasonForecastEuropeanIncome,
      }),
      pending.kind
    );
  }, [
    state.decisionIndex,
    state.akcje,
    state.log,
    state.club,
    state.kadra,
    state.seasonForecastExpectedPlace,
    state.seasonForecastEuropeanIncome,
    notify,
  ]);

  // Mirrors the prototype's timer effect :266-273. The reducer itself
  // resolves an expired countdown as an automatic pass (see game-reducer.ts
  // TICK case) - this effect only needs to keep ticking once a second.
  //
  // latestCzas mirrors state.czas into a ref so the interval callback can
  // tell whether *this* tick will expire the card without needing state.czas
  // in the effect's own dependency array - adding it there would tear down
  // and recreate the interval every second instead of just once per card.
  // Assigned inline during render (not from a useEffect) so it's never a
  // render behind: a mirror effect can lag by a whole render pass when
  // several ticks land in the same batch, which would leave every tick in
  // that batch reading the same stale value and never noticing the expiry.
  const latestCzas = useRef(state.czas);
  latestCzas.current = state.czas;

  useEffect(() => {
    if (state.faza !== "okno" || !state.timerWl || !state.karta) return;
    const id = setInterval(() => {
      // A plain foreground expiry deserves the same explanation as a
      // background one - otherwise the offer just silently changes under
      // the player with no indication why.
      if (latestCzas.current <= 1) pendingTimeoutNotice.current = true;
      dispatch({ type: "TICK" });
    }, 1000);
    return () => clearInterval(id);
  }, [state.faza, state.timerWl, state.karta]);

  // Tracks the last COMMITTED render's faza so the guard below can tell "the
  // very first render of this component" apart from "a transition that
  // happens to land back on 'start'" - `null` only ever describes the
  // former, since every commit overwrites it with a real faza value.
  //
  // Read during render, but written only by the hold-bookkeeping layout
  // effect further down - never during render. React StrictMode (see
  // src/main.tsx) double-invokes this component body on every development
  // render with shared refs, and a render can also be discarded outright: a
  // ref written during render let the second, committed invocation see the
  // first one's writes (`fazaChangedThisRender` false, the fresh
  // notification already "considered") and silently lose the transition.
  // The notification-hold decision still needs last commit's faza
  // *synchronously*, to compute this render's NotificationBanner props
  // (`bannerAutoDismiss`/`bannerFocusSignal`) - the banner is a sibling
  // mounting in this very render, so an effect would tell it too late. So
  // the decision is derived here, purely, and only the bookkeeping waits
  // for the commit.
  const previousFazaRef = useRef<GameState["faza"] | null>(null);
  const isFirstRender = previousFazaRef.current === null;
  const fazaChangedThisRender = !isFirstRender && previousFazaRef.current !== state.faza;

  const headingSelector = state.faza === "epilog" ? ".dd-epilogue-content h2" : "h1";

  // A11y fix (2026-09-17, WCAG 2.4.11): a screen transition that also raises
  // a notification would otherwise focus a heading the fixed notification
  // banner sits right on top of. Only matters for a keyboard/screen-reader
  // user - a pointer/touch user never had that heading in focus to lose
  // sight of, so this whole block is a no-op unless getInputModality() reads
  // "keyboard".
  //
  // "Coincides with a transition" covers two distinct orderings, not just
  // one:
  //  - the notification is already known in the very same render as the
  //    transition (the last "bierz"/"pas"/... in an offer window - see
  //    sendTake() in offer-window-screen.tsx);
  //  - the notification is created *after* the transition's render by an
  //    effect (a haggle's outcome, an eviction-confirmed signing, or a
  //    timeout notice - all armed via registerPendingDecision/
  //    pendingTimeoutNotice and only resolved once state.decisionIndex
  //    actually moves, one render later than the transition itself).
  // Both are "coinciding" as long as no new input has landed in between -
  // pendingTransitionSeqRef snapshots getInputSequence() at the moment of
  // every transition, and a notification counts as coinciding only while
  // that snapshot still matches the live counter.
  //
  // `consideredNotificationIdRef` is what keeps a notification that was
  // already on screen *before* this transition from being mistaken for one
  // coinciding with it - without it, any keyboard transition landing while
  // an unrelated, still-open notification happens to be visible (it has not
  // auto-dismissed yet) would incorrectly grab that stale banner instead of
  // leaving it alone.
  //
  // From here to the hold-bookkeeping layout effect below, refs are only
  // READ: every write the hold needs is computed as a value and applied by
  // that effect, once, for the render that actually commits.
  const wasAlreadyHeld = notification !== null && heldNotificationIdRef.current === notification.id;
  const isNewNotification =
    notification !== null && consideredNotificationIdRef.current !== notification.id;
  const transitionSeq = fazaChangedThisRender
    ? getInputSequence()
    : pendingTransitionSeqRef.current;
  const isFreshHold =
    isNewNotification &&
    !wasAlreadyHeld &&
    transitionSeq !== null &&
    transitionSeq === getInputSequence() &&
    getInputModality() === "keyboard";
  // `wasAlreadyHeld` tells apart the transition that *creates* the hold
  // (defer to the banner - see below and NotificationBanner's
  // focusCloseSignal) from a further one arriving while an earlier hold is
  // still open and unclosed: that later transition wins outright rather
  // than leaving the banner stuck open for the rest of the career (see the
  // effect below).
  const isStaleHold = fazaChangedThisRender && wasAlreadyHeld;

  // A held notification's `notification.id` can be silently replaced by an
  // unrelated notify() call before either dismissNotification (an explicit
  // close) or isStaleHold (a further transition) properly released the hold
  // - notify() always overwrites the single `notification` slot, whatever it
  // held before. The clearest example: a signing that evicts a squad member,
  // confirmed mid-window (no faza change at all), raises its own ordinary
  // notification via the decisionIndex effect while an EARLIER, held one
  // from entering this very window is still up. `wasAlreadyHeld` then reads
  // false (the ids no longer match) even though `heldNotificationIdRef` is
  // still set, so isStaleHold never fires for it either - the hold is
  // orphaned. Left alone, `pendingHeadingFocusRef` stays armed and fires
  // later at a completely unrelated moment, whenever *any* notification
  // (not the one it was meant for) next clears - caught by the WebKit e2e
  // "keeps focus visible... full game" suite as a heading stealing focus
  // back mid-window, obscured by whatever ordinary banner happened to be
  // showing right then. Discarding it (in the layout effect below) is safe: a
  // mid-window action has its own focus recovery (offer-window-screen.tsx's
  // decisionIndex effect), so nothing needs this stale target applied at all.
  const heldNotificationOrphaned =
    heldNotificationIdRef.current !== null &&
    heldNotificationIdRef.current !== (notification?.id ?? null) &&
    !isStaleHold;

  // The held id as it will stand once this render commits.
  let heldIdAfterCommit = heldNotificationIdRef.current;
  if (heldNotificationOrphaned) heldIdAfterCommit = null;
  if (isFreshHold && notification) heldIdAfterCommit = notification.id;
  const bannerSignalId = notification?.id ?? -1;
  const bannerSignalCount =
    (bannerFocusSignalRef.current.id === bannerSignalId ? bannerFocusSignalRef.current.count : 0) +
    (isFreshHold ? 1 : 0);
  const bannerFocusSignal = notification ? bannerSignalCount : 0;
  const bannerAutoDismiss = !(
    notification &&
    (heldIdAfterCommit === notification.id || notification.persistent)
  );

  // Commits exactly the bookkeeping the values above were derived from. A
  // layout effect, not a passive one: it runs synchronously within the
  // commit, before the passive transition effect below reads the refs it
  // writes, and before any later render can read them. No dependency array
  // on purpose - every committed render must record its own faza, as the old
  // render-time writes did. Idempotent (plain assignments of values computed
  // during render, no increments), so StrictMode's double-invoked mount
  // effect writes the same thing twice, and a discarded render writes
  // nothing at all.
  useLayoutEffect(() => {
    previousFazaRef.current = state.faza;
    pendingTransitionSeqRef.current = transitionSeq;
    if (heldNotificationOrphaned) {
      heldNotificationIdRef.current = null;
      pendingHeadingFocusRef.current = null;
    }
    if (notification !== null) consideredNotificationIdRef.current = notification.id;
    if (isFreshHold && notification) {
      heldNotificationIdRef.current = notification.id;
      pendingHeadingFocusRef.current = headingSelector;
    }
    bannerFocusSignalRef.current = { id: bannerSignalId, count: bannerSignalCount };
  });

  useEffect(() => {
    // A11y fix (2026-09-16, CRITICAL #2): this guard used to be
    // `if (state.faza === "start" && !archiveOpen) return;`, written for the
    // genuine first mount, where there is nothing on screen yet for focus to
    // move away from. But `BACK` (game-reducer.ts) also lands on
    // `faza: "start"` - from the club screen's "Wstecz" - and that guard
    // fired there too, so ClubSelectScreen unmounted with the focused
    // "Wstecz" button inside it, this effect did nothing, and focus fell to
    // `<body>` with nothing announced. Gating on `isFirstRender` instead of
    // just the phase distinguishes the two: a real transition back to
    // "start" (BACK, or CONFIRM_RESTART landing on "wybor" then BACK, etc.)
    // now announces the heading like every other transition, while the
    // actual initial mount - the only case with nothing to move focus away
    // from - still does nothing.
    if (state.faza === "start" && !archiveOpen && isFirstRender) return;

    if (isFreshHold) {
      // Deferred: the banner just took focus instead (bannerFocusSignal,
      // computed above). This transition's own heading is focused once the
      // player closes it - see dismissNotification.
      return;
    }
    if (isStaleHold) {
      // A further transition arrived before the player closed the
      // still-open banner an earlier one created. Moving on wins: drop the
      // stale hold now rather than leaving the banner stuck open for the
      // rest of the career - but NOT by focusing this transition's heading
      // right here. `setNotification(null)` only schedules the banner's
      // removal; the DOM still has it at this exact synchronous point, so a
      // `.focus()` call right here would (rarely, but really - a WebKit e2e
      // run caught it: `document.elementFromPoint` at the freshly focused
      // heading answered with the still-present banner, before React's own
      // follow-up render had committed removing it) hand focus to the
      // heading one render before the thing sitting on top of it is actually
      // gone. Defer instead - the effect below applies pendingHeadingFocusRef
      // once `notification` has actually become null.
      setNotification(null);
      heldNotificationIdRef.current = null;
      pendingHeadingFocusRef.current = headingSelector;
      return;
    }

    // .focus() alone only scrolls "enough" to reveal the element - it can
    // leave a few px of the previous screen's scroll offset behind. Reset
    // explicitly first, then focus without letting it re-scroll on its own.
    window.scrollTo(0, 0);
    rootRef.current?.querySelector<HTMLElement>(headingSelector)?.focus({ preventScroll: true });
    // Deliberately keyed on the transition alone. isFirstRender, isFreshHold,
    // isStaleHold and headingSelector describe THIS render's transition and
    // are read here as a snapshot of it. Listing them would re-run the effect
    // on the very next render, when isFreshHold falls back to false with no
    // transition at all, and focus the heading out from under the banner's
    // close button - the WCAG 2.4.11 bug the hold exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.faza, state.epilogIdx, archiveOpen]);

  // Applies a heading focus that was deferred rather than done immediately -
  // either because a coinciding notification took focus instead
  // (dismissNotification, once the player closes it) or because dropping a
  // stale hold must not focus the new heading until the banner it was
  // covering has actually left the DOM (isStaleHold above). Depending on
  // `notification` alone, rather than doing this inline at each call site,
  // guarantees the banner is already gone by the time this runs: this effect
  // only fires once a render has actually committed `notification === null`,
  // which for a passive effect means the DOM mutation removing it already
  // happened.
  useEffect(() => {
    if (notification !== null) return;
    const pendingSelector = pendingHeadingFocusRef.current;
    if (!pendingSelector) return;
    pendingHeadingFocusRef.current = null;
    window.scrollTo(0, 0);
    rootRef.current?.querySelector<HTMLElement>(pendingSelector)?.focus({ preventScroll: true });
  }, [notification]);

  // Saves exactly once per finished game: saveFinishedGame is idempotent by
  // archiveEntryId (engine revision, seed, club and the full action
  // sequence), so re-entering "final" (there is no path back into it without
  // a fresh START_CAREER or PLAY_AGAIN) or a StrictMode double-invoke is safe.
  useEffect(() => {
    if (state.faza !== "final" || !state.finalne) return;
    if (saveFinishedGame(state)) {
      archiveFailureNoticeShownRef.current = false;
      return;
    }
    if (archiveFailureNoticeShownRef.current) return;
    archiveFailureNoticeShownRef.current = true;
    notify(ARCHIVE_SAVE_FAILED_NOTICE, "neutral", { persistent: true });
  }, [state, notify]);

  // Reload/tab-discard survival: a page that comes back to life after Vite's
  // dev client reconnects, or after a mobile browser evicted the tab from
  // memory, must not lose the career. Fires once on mount - "resumeNotice"
  // never changes after the initial useState computation, and the two cases
  // are mutually exclusive by construction, so this never shows both.
  useEffect(() => {
    if (resumeNotice === "resumed") notify("Wznowiono przerwaną partię.", "neutral");
    else if (resumeNotice === "timedOut") notify(TIMEOUT_NOTICE, "neutral");
  }, [resumeNotice, notify]);

  // A save that failed the schema-13 guard (see game-save.ts's "discarded"
  // contract): shown with no data from the save - the guard already refused
  // to trust any of it - and the key is cleared here, in an effect, never
  // during render. Clearing during the lazy useReducer/useState init above
  // would let React StrictMode's double-invocation wipe the entry before the
  // player ever saw this message, which is exactly the bug the non-
  // destructive inspectGameSave() contract exists to prevent.
  useEffect(() => {
    if (!saveDiscarded) return;
    notify(DISCARDED_SAVE_NOTICE, "neutral");
    clearGameSave();
  }, [saveDiscarded, notify]);

  // Clears whatever markPendingTimeoutNotice() may have left behind, once
  // resumeNotice has already read it above. Unconditional and unguarded
  // because removeItem is idempotent - a StrictMode double-invoke just
  // removes an already-removed key.
  useEffect(() => {
    clearPendingTimeoutNotice();
  }, []);

  // Dispatches once on mount for a career that survived a reload: real time
  // kept passing while the page was gone, so the saved `czas` needs to catch
  // up to now before the countdown resumes - same wall-clock reasoning as
  // the visibilitychange effect below, just anchored to `savedAt` instead of
  // a hidden/visible pair within one session. The banner effect above
  // already showed the right notice synchronously from resumeNotice, so this
  // one only has state to fix, not a message to show - if resumeNotice was
  // "timedOut" via the pending-notice flag rather than a fresh over-budget
  // reading, elapsedSeconds here is small (whatever the reload itself took)
  // and this just nudges czas down a little, exactly as intended. Guarded by
  // a ref (this effect has no cleanup, unlike the listener-based one below)
  // because React's development StrictMode invokes a cleanup-less mount
  // effect twice - an unguarded second dispatch would replay the same
  // elapsedSeconds against whatever RECONCILE_TIME just produced (a freshly
  // drawn card, full czas), timing it out a second time instead of leaving
  // it untouched.
  const reconciledOnMount = useRef(false);
  useEffect(() => {
    if (reconciledOnMount.current) return;
    reconciledOnMount.current = true;
    const resumedGame = resumedSaveRef.current;
    if (!resumedGame) return;
    const elapsedSeconds = Math.floor((Date.now() - resumedGame.savedAt) / 1000);
    if (elapsedSeconds <= 0) return;
    dispatch({ type: "RECONCILE_TIME", elapsedSeconds });
  }, []);

  // Writes only on a structural change (see saveFingerprint), so TICK's
  // once-a-second countdown doesn't stringify the whole career every render.
  const lastFingerprint = useRef<string | null>(null);
  useEffect(() => {
    const fingerprint = saveFingerprint(state);
    if (fingerprint === lastFingerprint.current) return;
    lastFingerprint.current = fingerprint;
    if (isResumable(state)) {
      writeGameSaveWithNotice(state);
      // Belt-and-suspenders alongside the explicit clearSetupDraft() call in
      // the club screen's onStart below: any path that ends up with a
      // resumable career (PLAY_AGAIN included) must not leave a stale setup
      // draft behind to resurface once that career ends.
      clearSetupDraft();
    } else {
      clearGameSave();
    }
  }, [state, writeGameSaveWithNotice]);

  // Catches the countdown's current `czas` right before the tab goes to the
  // background - the fingerprint above only fires on structural change, so
  // without this the last few seconds before backgrounding would be lost.
  // The "visible again" branch is the same-session counterpart to the
  // mount-time reconciliation effect above: a mobile browser suspends
  // setInterval while the screen is locked, so without reconciling against
  // the wall clock here, locking the screen would silently freeze `czas`
  // instead of it running out - exactly the loophole this closes.
  const hiddenAtRef = useRef<number | null>(null);
  useEffect(() => {
    const flush = (): void => {
      if (isResumable(state)) writeGameSaveWithNotice(state);
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        flush();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt === null) return;
      const elapsedSeconds = Math.floor((Date.now() - hiddenAt) / 1000);
      if (elapsedSeconds <= 0) return;
      if (wouldExpire(state, elapsedSeconds)) pendingTimeoutNotice.current = true;
      dispatch({ type: "RECONCILE_TIME", elapsedSeconds });
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [state, writeGameSaveWithNotice]);

  let widok = null;
  if (state.faza === "start")
    widok = (
      <ManagerScreen
        initialManager={state.manager ?? draftPrefillRef.current}
        onContinue={(manager) => dispatch({ type: "START_GAME", manager })}
        timerWl={state.timerWl}
        dispatch={dispatch}
        onOpenArchive={() => setArchiveOpen(true)}
      />
    );
  if (state.faza === "wybor")
    widok = (
      <ClubSelectScreen
        // Read on every entry to this screen rather than once at mount, so
        // "Wstecz" and back again keeps the selection the same way a reload
        // does - the screen writes each pick to the draft as it happens.
        initialSelectedClubId={readSetupDraft()?.clubId ?? null}
        manager={defined(state.manager, "manager")}
        timerWl={state.timerWl}
        onBack={() => dispatch({ type: "BACK" })}
        onStart={(clubId) => {
          clearSetupDraft();
          dispatch({
            type: "START_CAREER",
            clubId,
            manager: defined(state.manager, "manager"),
            seed: randomSeed(),
          });
        }}
      />
    );
  if (state.faza === "przeglad") widok = <MarketScreen state={state} dispatch={dispatch} />;
  if (state.faza === "okno" && state.karta)
    widok = (
      <OfferWindowScreen
        state={state}
        dispatch={dispatch}
        onNotify={notify}
        onDecisionPending={registerPendingDecision}
      />
    );
  if (state.faza === "polSezonu" && state.tabela)
    widok = <HalfSeasonScreen state={state} dispatch={dispatch} />;
  if (state.faza === "koniecSezonu" && state.wynikSezonu)
    widok = <SeasonEndScreen state={state} dispatch={dispatch} />;
  if (state.faza === "werdykt" && state.werdykt)
    widok = <VerdictScreen state={state} dispatch={dispatch} />;
  if (state.faza === "epilog" && state.epilog[state.epilogIdx])
    widok = <EpilogueScreen state={state} dispatch={dispatch} />;
  if (state.faza === "final" && state.finalne)
    widok = (
      <FinalScreen state={state} dispatch={dispatch} onOpenArchive={() => setArchiveOpen(true)} />
    );
  if (archiveOpen) {
    const lastEntryId =
      state.faza === "final" && state.finalne && state.seed !== null && state.club
        ? archiveEntryId({
            engineVersion: ENGINE_REVISION,
            seed: state.seed,
            clubId: state.club.clubId,
            actions: state.akcje,
          })
        : null;
    widok = <ArchiveScreen onClose={() => setArchiveOpen(false)} highlightId={lastEntryId} />;
  }

  return (
    // data-dd-screen is a test contract in the same sense as data-dd-action:
    // tests/e2e/a11y.spec.ts keys its accessibility baseline on it. Screens
    // otherwise share dd-wrap/dd-screen-content and are told apart only by
    // whichever inner class happens to be unique today, which makes the
    // baseline break for reasons that have nothing to do with accessibility.
    // The archive is an overlay over whatever phase is underneath, so it wins.
    <div className="dd-root" ref={rootRef} data-dd-screen={archiveOpen ? "archiwum" : state.faza}>
      {notification && (
        <NotificationBanner
          key={notification.id}
          text={notification.text}
          kind={notification.kind}
          onDismiss={dismissNotification}
          autoDismiss={bannerAutoDismiss}
          focusCloseSignal={bannerFocusSignal}
        />
      )}
      {widok}
    </div>
  );
};

export const App = () => (
  <UiPreferencesProvider>
    <Game />
  </UiPreferencesProvider>
);
