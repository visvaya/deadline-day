import type { Player, PositionCode } from "../data/types";
import { money, pluralPl, YEAR_FORMS, zaokr, znak } from "./format";

/**
 * Every sentence that reports a transfer decision. The reducer writes them to
 * the log, and the notification shows the same log line (plus the budget
 * forecast below), so the two records of one decision cannot disagree.
 *
 * One grammar for all of them (owner's decision, 2026-10-08): the second
 * person past tense, the player always as `playerFacts`, every amount through
 * `money()`, and the wage named whenever the decision changes the payroll.
 *
 * Player-facing text stays Polish; only code identifiers follow the PL -> EN naming migration.
 */

/** "M. Wójcik (52 OVR, 35 lat)" - the player data every such sentence carries. */
export const playerFacts = (player: Player): string =>
  `${player.nazwa} (${player.ovr} OVR, ${pluralPl(player.wiek, YEAR_FORMS)})`;

const perYear = (wage: number): string => `${money(wage)}/rok`;

// --- Accepted offers ---------------------------------------------------------

export const purchaseMessage = (player: Player, fee: number, wage: number): string =>
  `Kupiłeś ${playerFacts(player)} za ${money(fee)}. Płaca ${perYear(wage)}.`;

export const freeAgentSigningMessage = (player: Player, wage: number): string =>
  `Podpisałeś kontrakt z ${playerFacts(player)} bez odstępnego. Płaca ${perYear(wage)}.`;

export const saleMessage = (
  player: Player,
  fee: number,
  buyerName: string | null,
  wage: number
): string => {
  const buyer = buyerName === null ? "" : ` do klubu ${buyerName}`;
  return `Sprzedałeś ${playerFacts(player)}${buyer} za ${money(fee)}. Płace spadły o ${perYear(wage)}.`;
};

export const extensionMessage = (player: Player, wage: number): string =>
  `Przedłużyłeś kontrakt z ${playerFacts(player)}. Płaca ${perYear(wage)}.`;

/** What a won haggle improved; the transaction sentence follows it. */
export const HAGGLE_WON = {
  lowerFee: "Utargowałeś niższą kwotę.",
  higherFee: "Utargowałeś wyższą kwotę.",
  lowerWage: "Utargowałeś niższą płacę.",
} as const;

// --- Lost haggles ------------------------------------------------------------

export const buyerWithdrewMessage = (player: Player, buyerName: string | null): string =>
  `${buyerName === null ? "Kupiec" : `Kupiec (${buyerName})`} się wycofał. ${playerFacts(player)} zostaje w kadrze.`;

export const freeAgentWentElsewhereMessage = (player: Player): string =>
  `${playerFacts(player)} wybrał inny klub.`;

export const purchaseLostMessage = (player: Player): string =>
  `Przeciągnąłeś strunę. ${playerFacts(player)} przepadł.`;

export const extensionWalkoutMessage = (player: Player, wage: number): string =>
  `${playerFacts(player)} odchodzi od razu, nie czekając na koniec sezonu. Płace spadły o ${perYear(wage)}.`;

// --- Failed and declined offers ----------------------------------------------

export const insufficientFundsMessage = (
  player: Player,
  fee: number,
  cash: number,
  afterStalling: boolean
): string =>
  `${afterStalling ? "Negocjacje nieudane. " : ""}Brak środków na ${playerFacts(player)}: odstępne ${money(fee)}, w kasie ${money(cash)}.`;

export const purchaseDeclinedMessage = (player: Player, fee: number): string =>
  `Odrzuciłeś ofertę: ${playerFacts(player)} za ${money(fee)}.`;

export const freeAgentDeclinedMessage = (player: Player, wage: number): string =>
  `Odrzuciłeś ofertę: ${playerFacts(player)} bez odstępnego, płaca ${perYear(wage)}.`;

export const saleDeclinedMessage = (player: Player, fee: number): string =>
  `Zatrzymałeś ${playerFacts(player)}, odrzucając ${money(fee)}.`;

export const extensionDeclinedMessage = (player: Player): string =>
  `Nie przedłużyłeś kontraktu: ${playerFacts(player)} odejdzie za darmo po sezonie.`;

// --- Side effects appended to a decision -------------------------------------

/** The one sentence that names a squad-depth cut. */
export const squadEvictionMessage = (position: PositionCode, player: Player): string =>
  `Brak miejsca na ${position} – kontrakt rozwiązany: ${playerFacts(player)}.`;

/**
 * Academy players filling a position emptied by a departure, or null when the
 * squad still had cover there. Every debutant joins at the departing player's
 * position, so the first one names it.
 */
export const academyDebutMessage = (debutants: readonly Player[]): string | null => {
  const [first] = debutants;
  if (first === undefined) return null;
  const verb = debutants.length === 1 ? "debiutuje" : "debiutują";
  return `${debutants.map(playerFacts).join(", ")} ${verb} z akademii na ${first.poz}.`;
};

// --- Notification-only sentences ---------------------------------------------

/**
 * The forecast budget change after a decision, or null when the decision left
 * it where it was. Compared at the two decimals the player sees.
 */
export const budgetForecastMessage = (before: number, after: number): string | null => {
  // Rounded first: -0.001 would otherwise print as "-0,00" and differ from
  // "0,00". Math.round gives -0 there, which equals 0 and prints as "0,00".
  const shownBefore = zaokr(before, 2);
  const shownAfter = zaokr(after, 2);
  if (shownBefore === shownAfter) return null;
  const verb = shownAfter > shownBefore ? "rośnie" : "spada";
  return `Prognozowana zmiana budżetu ${verb} do ${znak(shownAfter)}${money(shownAfter)}.`;
};

/**
 * Stalling, announced at once: the new terms are known before the reducer
 * runs. Names every term that moved - a stalled purchase costs more in both
 * fee and wage, and saying only the fee hid half the price of the delay.
 */
export const stallMessage = (
  player: Player,
  fee: { amount: number; rises: boolean } | null,
  wage: number | null
): string => {
  const terms = [
    fee === null ? null : `kwota ${fee.rises ? "wzrosła" : "spadła"} do ${money(fee.amount)}`,
    wage === null ? null : `płaca wzrosła do ${perYear(wage)}`,
  ].filter((term): term is string => term !== null);
  const summary = terms.join(", ");
  return `Przeciągnąłeś negocjacje: ${playerFacts(player)}. ${summary.charAt(0).toUpperCase()}${summary.slice(1)}.`;
};
