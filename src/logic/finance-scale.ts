import { BOARD_REINVESTMENT_RATE, MONEY_SCALE_PLN_PER_GAME_MILLION } from "../data/balance";
import { financeProfileFor } from "../data/club-finance-profiles";

/**
 * The two money functions that BOTH `finance.ts` and the opening-budget
 * adapter need, kept in a leaf module of its own.
 *
 * Both used to live in `finance.ts`, and both still re-export from there, so
 * no existing consumer had to move. The split exists because the adapter
 * needs them while `finance.ts` needs the adapter: leaving them where they
 * were would have made that pair a cycle, and a cycle in ESM is an
 * `undefined` at module-initialisation time rather than an error.
 *
 * Nothing else belongs here. Anything only one side needs stays on that side;
 * this file is a leaf on purpose, not a second finance module.
 */

/**
 * The club's repeatable revenue, in millions of game euro.
 *
 * A pure function of the club and the money scale, so it is never carried in
 * `GameState`: a serialised copy would be a second source of truth that goes
 * stale the moment the scale moves.
 *
 * `recurringRevenuePln` is deliberately NOT the club's revenue. Transfers,
 * European money, one-off receipts and the league's placement money are all
 * netted out in the manifest, because the game pays all four out again by
 * its own rules - so leaving them in would pay every club twice.
 */
export const scaledRecurringRevenue = (clubId: string): number =>
  financeProfileFor(clubId).recurringRevenuePln / MONEY_SCALE_PLN_PER_GAME_MILLION;

/**
 * How much of a season's operating balance reaches the transfer budget.
 *
 * Symmetric and linear: a loss lowers the budget by the same share a profit
 * raises it. It deliberately does NOT round - the rounding belongs at the
 * call site, next to the `zaokr(state.kasa + ..., 2)` that already exists, so
 * that two call sites cannot round at different precisions and drift apart.
 *
 * The quantity it takes is the season's OPERATING result, cup prize money
 * included. What it returns is the change to the budget, not the balance
 * itself: the season report keeps showing the full result, and this is only
 * the part of it the board passes on.
 */
export const transferBudgetChange = (seasonOperatingBalance: number): number =>
  seasonOperatingBalance * BOARD_REINVESTMENT_RATE;
