import {
  KARA_PLACA,
  WAGE_AT_PIVOT,
  WAGE_PIVOT_OVR,
  WAGE_SLOPE,
  WOLNY_WAGE_PREMIUM,
} from "../data/balance";
import type { OfferType, Player } from "../data/types";

/**
 * Wage curve and squad wage aggregates.
 *
 * The curve is `WAGE_AT_PIVOT x exp((ovr - 70) / slope)` and reads nothing
 * but the ovr - not the club, not the hidden ceiling, not a staff report.
 * The prototype's flat `0.066 x exp((ovr - 58) / 8.5)` understated the
 * payroll of the strongest squads by nearly a factor of three; the
 * parameters here come from the option-A fit of 2026-09-09.
 */
export const baseWage = (ovr: number): number =>
  WAGE_AT_PIVOT * Math.exp((ovr - WAGE_PIVOT_OVR) / WAGE_SLOPE);

export const playerWage = (player: Player): number =>
  baseWage(player.ovr) * (player.mnoznikPlacy ?? 1);

export const totalPayroll = (squad: readonly Player[]): number =>
  squad.reduce((sum, player) => sum + playerWage(player), 0);

export const averageWage = (squad: readonly Player[]): number =>
  squad.length ? totalPayroll(squad) / squad.length : 0;

/**
 * The wage multiplier a signing lands on, before any haggle.
 *
 * One source because there were two: the reducer applied it when the transfer
 * actually happened, and the offer window recomputed it for the card preview.
 * They agreed, and the comment at the preview site said they had to - which is
 * the setup, not the safeguard. A third card type with its own premium would
 * have desynced the preview from the charge without failing anything.
 *
 * The haggle discount deliberately stays at the reducer: only a concluded
 * transfer can have been haggled, so a preview has nothing to apply it to.
 */
export const signingWageMultiplier = (typ: OfferType, stalls: number): number =>
  (typ === "WOLNY" ? WOLNY_WAGE_PREMIUM : 1) * (1 + KARA_PLACA * stalls);
