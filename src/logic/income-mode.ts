/**
 * The measurement variant of the club's income, and nothing else.
 *
 * A finance baseline needs to know what a club earns by being that club -
 * league revenue against wages and fixed costs - separately from what it
 * earned by winning a cup draw or selling a player. Those one-off streams
 * are large relative to the recurring ones and vary wildly with luck, so
 * they drown the signal the baseline is measuring.
 *
 * Switching them off is therefore a question asked of a run, never a state
 * the game can be in: the mode is passed into each dispatch by the tool that
 * wants it, is never stored in GameState, never serialised into a save or a
 * replay, and defaults to the normal game everywhere. The sporting side is
 * untouched - the club still wins the cup, still plays in Europe, and still
 * loses the player it sold. Only the money is withheld.
 */
export type IncomeMode = "normal" | "finance-control";

export type MeasurementOptions = { readonly incomeMode?: IncomeMode };

/**
 * How much of a one-off receipt is actually credited to the club.
 *
 * Applied at the point the amount enters the settlement, before the balance
 * and the cash are computed, so every downstream number - the season's
 * `bilans`, the verdict, the legacy breakdown - is consistent with it.
 * Subtracting afterwards would leave whichever of them had already been
 * computed disagreeing with the rest.
 */
export const creditedIncome = (amount: number, mode: IncomeMode): number =>
  mode === "finance-control" ? 0 : amount;
