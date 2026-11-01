import { IMIONA, NAZWISKA } from "../data/name-pools";
import { MANAGER_PROFANITY_TOKENS } from "../data/profanity";
import type { ManagerIdentity } from "../data/types";
import { createRng, pick, randomSeed } from "./rng";
import { at } from "./invariant";

// ManagerIdentity itself lives in data/types.ts (a dependency leaf) - see
// that file for its documentation. This module owns the validation and
// drawing functions that operate on the shape, not the shape itself.

/**
 * Which of the two name fields a validation result is about - used by the
 * manager form (Task 5) to decide which input to highlight and where to hang
 * `aria-invalid`/`aria-describedby`.
 */
export type ManagerField = "firstName" | "lastName";

export type ManagerValidationResult =
  | { readonly ok: true; readonly value: ManagerIdentity }
  | { readonly ok: false; readonly field: ManagerField | "manager"; readonly message: string };

const MIN_CODE_POINTS = 2;
const MAX_CODE_POINTS = 30;

/**
 * Maximum number of combining marks (`\p{M}`) allowed in a row after a single
 * base character - the "Zalgo" guard. Two accommodates real names that
 * legitimately stack two marks on one letter (Vietnamese vowel + tone mark;
 * Hebrew/Arabic vocalisation can go further but is not in the name pools
 * this validator serves). A limit on the total marks in the name was
 * considered and rejected: it would punish a long name that happens to carry
 * several accented letters, none of them stacked, which is not the shape
 * this guard exists to catch.
 */
const MAX_CONSECUTIVE_COMBINING_MARKS = 2;

const CURLY_APOSTROPHE = String.fromCharCode(0x2019);
const SEPARATORS = new Set([" ", "-", "'", CURLY_APOSTROPHE]);

/**
 * Control characters (C0, DEL, C1) and Unicode bidi format characters (ALM,
 * LRM/RLM, the LRE/RLE/PDF/LRO/RLO override family, and the LRI/RLI/FSI/PDI
 * isolate family), as numeric code point ranges rather than a regex literal.
 * Typing any of these directly into source - even as a `\uXXXX` escape
 * inside a regex literal - makes the file itself carry a raw control or bidi
 * character, which is exactly what this check exists to keep out of player
 * input.
 *
 * Checked against the RAW value, before anything is normalised: a hostile
 * value must never reach NFC or the length/shape checks in a form that looks
 * harmless.
 */
const CONTROL_OR_BIDI_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x061c, 0x061c],
  [0x200e, 0x200f],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];

const containsControlOrBidi = (value: string): boolean => {
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (CONTROL_OR_BIDI_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end)) {
      return true;
    }
  }
  return false;
};

const isLetter = (char: string): boolean => /\p{L}/u.test(char);
const isCombiningMark = (char: string): boolean => /\p{M}/u.test(char);

const FIELD_LABEL: Record<ManagerField, string> = {
  firstName: "Imię",
  lastName: "Nazwisko",
};

/**
 * NFC-normalises, trims and collapses runs of plain U+0020 spaces to one.
 *
 * Deliberately does not touch tabs, non-breaking spaces or any other
 * whitespace variant - those fail the shape check in `validateManagerIdentity`
 * rather than being silently folded here, so a value that looks like a space
 * but is not one never sneaks through as if it were.
 */
export const normalizeManagerName = (value: string): string =>
  value.normalize("NFC").trim().replace(/ {2,}/g, " ");

/** Lowercases and strips combining marks, so "Kurwa" and its diacritic
 * variants match the same profanity token regardless of accents. */
const foldForProfanityMatch = (value: string): string =>
  value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

const isSeparatorChar = (char: string): boolean => SEPARATORS.has(char);

const containsProfanityToken = (normalized: string): boolean => {
  const folded = foldForProfanityMatch(normalized);
  const tokens: string[] = [];
  let current = "";
  for (const char of folded) {
    if (isSeparatorChar(char)) {
      tokens.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  tokens.push(current);
  return tokens.some((token) => (MANAGER_PROFANITY_TOKENS as readonly string[]).includes(token));
};

/**
 * Shape check on an already-normalised value: Unicode letters and combining
 * marks, joined by at most one space/hyphen/apostrophe at a time, starting
 * and ending on a letter. Digits, HTML-shaped punctuation and any other
 * separator are rejected.
 */
const hasValidShape = (normalized: string): boolean => {
  const chars = Array.from(normalized);
  if (chars.length === 0) return false;
  if (
    !isLetter(at(chars, 0, "manager name first char")) ||
    !isLetter(at(chars, chars.length - 1, "manager name last char"))
  )
    return false;

  for (let i = 0; i < chars.length; i += 1) {
    const char = at(chars, i, "manager name char");
    if (isLetter(char) || isCombiningMark(char)) continue;
    if (SEPARATORS.has(char)) {
      const previous = chars[i - 1];
      if (previous !== undefined && SEPARATORS.has(previous)) return false;
      continue;
    }
    return false;
  }
  return true;
};

/**
 * True when a run of combining marks after a single base character exceeds
 * `MAX_CONSECUTIVE_COMBINING_MARKS` - the diacritic-stacking ("Zalgo") shape.
 * Operates on an already-normalised value, same as `hasValidShape`, since
 * NFC is what decides which marks precompose into a base letter and which
 * stay as separate combining code points.
 */
const hasExcessiveCombiningMarks = (normalized: string): boolean => {
  let run = 0;
  for (const char of normalized) {
    if (isCombiningMark(char)) {
      run += 1;
      if (run > MAX_CONSECUTIVE_COMBINING_MARKS) return true;
    } else {
      run = 0;
    }
  }
  return false;
};

type FieldValidationResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly field: ManagerField; readonly message: string };

const rejectField = (field: ManagerField, message: string): FieldValidationResult => ({
  ok: false,
  field,
  message,
});

/**
 * Validates and normalises a single field's raw value. Order matters: raw
 * control characters and bidi overrides are rejected first (see
 * `containsControlOrBidi`), then the value is normalised (see
 * `normalizeManagerName`), and only then are length and shape checked -
 * that ordering is what makes `"  Jan   Maria  "` valid rather than
 * rejected for its surrounding whitespace.
 */
const validateNameField = (raw: string, field: ManagerField): FieldValidationResult => {
  const label = FIELD_LABEL[field];

  if (containsControlOrBidi(raw)) {
    return rejectField(field, `${label} zawiera niedozwolone znaki.`);
  }

  const normalized = normalizeManagerName(raw);
  const codePointCount = Array.from(normalized).length;

  if (codePointCount < MIN_CODE_POINTS || codePointCount > MAX_CODE_POINTS) {
    return rejectField(field, `${label} musi mieć od 2 do 30 znaków.`);
  }

  if (!hasValidShape(normalized)) {
    return rejectField(
      field,
      `${label} może zawierać tylko litery, pojedynczą spację, myślnik albo apostrof.`
    );
  }

  if (hasExcessiveCombiningMarks(normalized)) {
    return rejectField(field, `${label} ma zbyt wiele znaków diakrytycznych na jednej literze.`);
  }

  if (containsProfanityToken(normalized)) {
    return rejectField(field, `Wybierz inne ${label.toLowerCase()}.`);
  }

  return { ok: true, value: normalized };
};

/** One field's error, as reported by {@link validateManagerIdentityFields}. */
export type ManagerFieldError = { readonly field: ManagerField; readonly message: string };

export type ManagerFormValidationResult =
  | { readonly ok: true; readonly value: ManagerIdentity }
  | { readonly ok: false; readonly errors: readonly ManagerFieldError[] };

/**
 * Validates BOTH name fields and reports every failing one, instead of
 * stopping at the first (that is what `validateManagerIdentity` below still
 * does, for the callers - the reducer, the save guard, the archive guard -
 * that only ever need a single ok/not-ok answer and must not change
 * behaviour). The manager form calls this one so a player who leaves both
 * fields empty sees both messages at once rather than fixing them one
 * round-trip at a time.
 *
 * Reuses `validateNameField` for each field - the single source of the
 * actual rules - rather than re-implementing any of the checks above.
 * `errors` is ordered firstName-then-lastName, which the form relies on to
 * pick the FIRST invalid field to focus.
 */
export const validateManagerIdentityFields = (
  firstName: string,
  lastName: string
): ManagerFormValidationResult => {
  const firstNameResult = validateNameField(firstName, "firstName");
  const lastNameResult = validateNameField(lastName, "lastName");

  const errors: ManagerFieldError[] = [];
  if (!firstNameResult.ok) errors.push({ field: "firstName", message: firstNameResult.message });
  if (!lastNameResult.ok) errors.push({ field: "lastName", message: lastNameResult.message });
  if (errors.length > 0) return { ok: false, errors };

  // Both ok() here - TypeScript can't narrow the pushed-to-errors check
  // above by itself, so the branch below asserts what the empty-errors
  // check already guarantees.
  return {
    ok: true,
    value: {
      firstName: (firstNameResult as { readonly ok: true; readonly value: string }).value,
      lastName: (lastNameResult as { readonly ok: true; readonly value: string }).value,
    },
  };
};

/**
 * Validates and normalises a manager identity from `unknown`, so the
 * reducer can refuse a malformed action even if something bypassed the
 * setup form entirely.
 */
export const validateManagerIdentity = (value: unknown): ManagerValidationResult => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, field: "manager", message: "Podaj imię i nazwisko menedżera." };
  }

  const record = value as Record<string, unknown>;
  const { firstName, lastName } = record;

  if (typeof firstName !== "string" || typeof lastName !== "string") {
    return { ok: false, field: "manager", message: "Podaj imię i nazwisko menedżera." };
  }

  const firstNameResult = validateNameField(firstName, "firstName");
  if (!firstNameResult.ok) return firstNameResult;

  const lastNameResult = validateNameField(lastName, "lastName");
  if (!lastNameResult.ok) return lastNameResult;

  return {
    ok: true,
    value: { firstName: firstNameResult.value, lastName: lastNameResult.value },
  };
};

/**
 * Draws a random manager identity from the same name pools the squad
 * generator uses.
 *
 * Uses its own RNG instance (`createRng(randomSeed())`), never the career
 * RNG: at this point in the flow the career seed does not exist yet, and
 * even if it did, drawing from it would shift the career's random stream by
 * however many times the player clicked "Losuj". Every drawn pair is run
 * through `validateManagerIdentity` so the pools can never smuggle in a
 * value the reducer would otherwise reject.
 */
export const randomManagerIdentity = (): ManagerIdentity => {
  const rng = createRng(randomSeed());
  const firstName = pick(rng, IMIONA);
  const lastName = pick(rng, NAZWISKA);
  const result = validateManagerIdentity({ firstName, lastName });
  if (!result.ok) {
    throw new Error(
      `randomManagerIdentity: drawn pair "${firstName} ${lastName}" failed validation: ${result.message}`
    );
  }
  return result.value;
};
