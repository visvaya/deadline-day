import { BOARD_REINVESTMENT_RATE } from "../data/balance";

/**
 * The board's reinvestment share as the player reads it.
 *
 * Derived, never typed out. Three player-facing strings explain the same
 * number - the HUD's help note, the market screen's forecast row and the
 * season-end finance row - and the arithmetic behind it reads
 * `BOARD_REINVESTMENT_RATE`. The constant's own comment frames `0.30` as a
 * gameplay decision a later joint calibration may revisit, so a literal in
 * the copy is a drift waiting to happen: after such a change the season-end
 * screen would print "Bilans sezonu +5,00" beside "Zmiana budżetu, 30%
 * bilansu +2,00" and contradict itself on the one screen that exists to stop
 * the player reading the gap as a bug.
 *
 * Whole percent on purpose. Every rate this has ever carried is a round one,
 * and a rate that needed decimals would be a different design question -
 * `tests/ui/board-share.test.ts` fails rather than quietly rounding 0.305
 * down to "30%".
 */
export const boardSharePercent = (): string => {
  const percent = BOARD_REINVESTMENT_RATE * 100;
  if (!Number.isInteger(Math.round(percent * 1e9) / 1e9)) {
    throw new Error(
      `BOARD_REINVESTMENT_RATE ${BOARD_REINVESTMENT_RATE} is not a whole percent; the player-facing copy cannot render it`
    );
  }
  return `${Math.round(percent)}%`;
};
