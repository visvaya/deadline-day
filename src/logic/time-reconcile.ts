import type { GameState } from "../data/types";

/**
 * Whole seconds between two wall-clock readings in milliseconds. The UI reads
 * the clock; the engine only sees the difference, as RECONCILE_TIME's
 * `elapsedSeconds`.
 */
export const elapsedWholeSeconds = (fromMs: number, nowMs: number): number =>
  Math.floor((nowMs - fromMs) / 1000);

/** Whether `elapsedSeconds` of real time would blow through the countdown on
 * an open, timed offer - shared by the reload-resume and same-session
 * backgrounding paths in app.tsx, since both reconcile against the wall clock. */
export const wouldExpire = (state: GameState, elapsedSeconds: number): boolean =>
  elapsedSeconds > 0 &&
  state.faza === "okno" &&
  state.timerWl &&
  state.karta !== null &&
  elapsedSeconds >= state.czas;
