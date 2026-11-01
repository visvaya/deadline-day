/** Pure formatting helpers used across the simulation. Mirrors prototype :31-34. */

export const zaokr = (x: number, n = 1): number => Math.round(x * 10 ** n) / 10 ** n;

/** Polish comma decimal separator - display only, never a test artifact. */
export const pl = (x: number, n = 2): string => x.toFixed(n).replace(".", ",");

/** Non-breaking space, built from its code point so no escape or invisible
 * character has to survive editing. */
const NBSP = String.fromCharCode(0xa0);

/** An amount in mln EUR as the player reads it: Polish comma and non-breaking
 * spaces, so the amount never breaks at the end of a line. */
export const money = (value: number): string => `${pl(value)}${NBSP}mln${NBSP}€`;

export const ord = (n: number): string => `${n}.`;

export const znak = (x: number): string => (x >= 0 ? "+" : "");

/** "ŁATWY" -> "Łatwy". Difficulty labels (POZIOMY) are stored upper-case. */
export const titleCasePl = (allCaps: string): string =>
  allCaps.charAt(0) + allCaps.slice(1).toLocaleLowerCase("pl");

type PluralForms = readonly [string, string, string];

/** Polish plural inflection, the noun alone: [singular, few (2-4), many (0, 5+, 11-14)].
 * For callers that style the number separately from the word. */
export const pluralFormPl = (count: number, forms: PluralForms): string => {
  const [singular, few, many] = forms;
  if (count === 1) return singular;
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return few;
  return many;
};

/** Polish plural inflection with the number: "1 rok", "22 lata", "25 lat". */
export const pluralPl = (count: number, forms: PluralForms): string =>
  `${count} ${pluralFormPl(count, forms)}`;

export const YEAR_FORMS: PluralForms = ["rok", "lata", "lat"];
export const POINT_FORMS: PluralForms = ["punkt", "punkty", "punktów"];
