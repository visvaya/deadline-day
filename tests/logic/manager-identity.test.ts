import { describe, expect, it } from "vitest";

import { IMIONA, NAZWISKA } from "../../src/data/name-pools";
import {
  normalizeManagerName,
  randomManagerIdentity,
  validateManagerIdentity,
  validateManagerIdentityFields,
} from "../../src/logic/manager-identity";

// Special characters used below are built from code points rather than typed
// literally, so the source file never carries a raw control character or a
// raw bidi-override character - both of which trip security scanners (and,
// for the control character, would not even be visible in a diff).
const NULL_BYTE = String.fromCharCode(0x0000);
const RTL_OVERRIDE = String.fromCharCode(0x202e);
const LEFT_TO_RIGHT_ISOLATE = String.fromCharCode(0x2066);
const POP_DIRECTIONAL_ISOLATE = String.fromCharCode(0x2069);
const CURLY_APOSTROPHE = String.fromCharCode(0x2019);
const COMBINING_DIAERESIS = String.fromCharCode(0x0308);

describe("normalizeManagerName", () => {
  it("trims surrounding whitespace and collapses internal runs of spaces", () => {
    expect(normalizeManagerName("  Jan   Maria  ")).toBe("Jan Maria");
  });

  it("applies Unicode NFC normalisation", () => {
    // "Zoe" + combining diaeresis NFC-normalises to the precomposed "Zoë".
    expect(normalizeManagerName(`Zoe${COMBINING_DIAERESIS}`)).toBe("Zoë");
  });

  it("does not touch a value that is already normalised", () => {
    expect(normalizeManagerName("Kowalski")).toBe("Kowalski");
  });
});

describe("validateManagerIdentity", () => {
  const valid = { firstName: "Jan", lastName: "Kowalski" };

  it("accepts a plain, valid pair", () => {
    const result = validateManagerIdentity(valid);
    expect(result).toEqual({ ok: true, value: valid });
  });

  it("trims and collapses whitespace before any other check, and does not reject on it", () => {
    const result = validateManagerIdentity({
      firstName: "  Jan   Maria  ",
      lastName: " Kowalski ",
    });
    expect(result).toEqual({
      ok: true,
      value: { firstName: "Jan Maria", lastName: "Kowalski" },
    });
  });

  it("accepts letters joined by a single space, hyphen or apostrophe", () => {
    expect(validateManagerIdentity({ firstName: "Anna-Maria", lastName: "Kowalski" }).ok).toBe(
      true
    );
    expect(validateManagerIdentity({ firstName: "Jan", lastName: "O'Brien" }).ok).toBe(true);
    expect(
      validateManagerIdentity({ firstName: "Jan", lastName: `O${CURLY_APOSTROPHE}Brien` }).ok
    ).toBe(true);
    expect(validateManagerIdentity({ firstName: "Jan", lastName: "Kowalski-Nowak" }).ok).toBe(true);
  });

  it("accepts Unicode letters and combining marks", () => {
    expect(validateManagerIdentity({ firstName: "Zoë", lastName: "Müller" }).ok).toBe(true);
    expect(validateManagerIdentity({ firstName: "Łukasz", lastName: "Żółć" }).ok).toBe(true);
  });

  // --- not-an-object / missing-fields rejection class ---

  it("rejects a non-object value", () => {
    for (const bad of [null, undefined, "Jan Kowalski", 42, true, ["Jan", "Kowalski"]]) {
      const result = validateManagerIdentity(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.field).toBe("manager");
    }
  });

  it("rejects an object missing a field", () => {
    expect(validateManagerIdentity({ firstName: "Jan" }).ok).toBe(false);
    expect(validateManagerIdentity({ lastName: "Kowalski" }).ok).toBe(false);
    expect(validateManagerIdentity({}).ok).toBe(false);
  });

  it("rejects a field that is not a string", () => {
    expect(validateManagerIdentity({ firstName: 5, lastName: "Kowalski" }).ok).toBe(false);
    expect(validateManagerIdentity({ firstName: "Jan", lastName: null }).ok).toBe(false);
  });

  // --- control characters and bidi overrides, checked before normalising ---

  it("rejects raw control characters", () => {
    const result = validateManagerIdentity({
      firstName: `Ja${NULL_BYTE}n`,
      lastName: "Kowalski",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("firstName");
  });

  it("rejects a bidi override embedded in the name", () => {
    const result = validateManagerIdentity({
      firstName: "Jan",
      lastName: `Kowal${RTL_OVERRIDE}ski`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("lastName");
  });

  it("rejects bidi isolate control characters", () => {
    const result = validateManagerIdentity({
      firstName: `${LEFT_TO_RIGHT_ISOLATE}Jan${POP_DIRECTIONAL_ISOLATE}`,
      lastName: "Kowalski",
    });
    expect(result.ok).toBe(false);
  });

  // --- length, checked after normalising ---

  it("rejects a name shorter than 2 code points after trimming", () => {
    expect(validateManagerIdentity({ firstName: "J", lastName: "Kowalski" }).ok).toBe(false);
    expect(validateManagerIdentity({ firstName: "  J  ", lastName: "Kowalski" }).ok).toBe(false);
  });

  it("accepts a name exactly 2 code points long", () => {
    expect(validateManagerIdentity({ firstName: "Li", lastName: "Kowalski" }).ok).toBe(true);
  });

  it("rejects a name longer than 30 code points", () => {
    const tooLong = "A".repeat(31);
    expect(validateManagerIdentity({ firstName: tooLong, lastName: "Kowalski" }).ok).toBe(false);
  });

  it("accepts a name exactly 30 code points long", () => {
    const exact = "A".repeat(30);
    expect(validateManagerIdentity({ firstName: exact, lastName: "Kowalski" }).ok).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(validateManagerIdentity({ firstName: "", lastName: "Kowalski" }).ok).toBe(false);
  });

  it("rejects a value that is only whitespace", () => {
    expect(validateManagerIdentity({ firstName: "   ", lastName: "Kowalski" }).ok).toBe(false);
  });

  // --- shape ---

  it("rejects a name not starting or ending with a letter", () => {
    expect(validateManagerIdentity({ firstName: "-Jan", lastName: "Kowalski" }).ok).toBe(false);
    expect(validateManagerIdentity({ firstName: "Jan-", lastName: "Kowalski" }).ok).toBe(false);
    expect(validateManagerIdentity({ firstName: "'Jan", lastName: "Kowalski" }).ok).toBe(false);
    expect(validateManagerIdentity({ firstName: "Jan'", lastName: "Kowalski" }).ok).toBe(false);
  });

  it("trims a trailing separator that is whitespace, since trimming runs first", () => {
    // Trailing whitespace is removed by normalizeManagerName before the
    // shape check runs, so it can never itself cause a rejection here -
    // unlike a trailing hyphen or apostrophe, which survives trimming.
    expect(validateManagerIdentity({ firstName: "Jan ", lastName: "Kowalski" }).ok).toBe(true);
  });

  it("rejects two separators in a row", () => {
    expect(validateManagerIdentity({ firstName: "Jan--Maria", lastName: "Kowalski" }).ok).toBe(
      false
    );
    expect(validateManagerIdentity({ firstName: "Jan -Maria", lastName: "Kowalski" }).ok).toBe(
      false
    );
    expect(validateManagerIdentity({ firstName: "Jan- Maria", lastName: "Kowalski" }).ok).toBe(
      false
    );
    expect(validateManagerIdentity({ firstName: "Jan''Maria", lastName: "Kowalski" }).ok).toBe(
      false
    );
  });

  it("rejects digits", () => {
    expect(validateManagerIdentity({ firstName: "Jan3", lastName: "Kowalski" }).ok).toBe(false);
  });

  it("rejects HTML-shaped input", () => {
    expect(validateManagerIdentity({ firstName: "<script>", lastName: "Kowalski" }).ok).toBe(false);
    expect(validateManagerIdentity({ firstName: "Jan", lastName: "Kowalski<b>" }).ok).toBe(false);
  });

  it("rejects other punctuation", () => {
    for (const bad of ["Jan.", "Jan,", "Jan_Maria", "Jan/Maria", "Jan@Maria", "Jan!"]) {
      expect(validateManagerIdentity({ firstName: bad, lastName: "Kowalski" }).ok).toBe(false);
    }
  });

  // --- combining mark stacking ("Zalgo") ---

  it("accepts a plain Polish name unaffected by the combining-mark guard", () => {
    // "Łukasz"/"Żółć" are single code points per letter after NFC - no
    // combining marks survive normalisation at all.
    expect(validateManagerIdentity({ firstName: "Łukasz", lastName: "Żółć" }).ok).toBe(true);
  });

  // Vietnamese stacks a vowel-quality mark (circumflex) with a tone mark
  // (tilde) on one base vowel; unlike most single-mark Latin diacritics,
  // this pair does not further precompose under NFC, so both marks survive
  // as separate combining code points - exactly the shape this guard must
  // still accept.
  const COMBINING_CIRCUMFLEX = String.fromCharCode(0x0302);
  const COMBINING_TILDE = String.fromCharCode(0x0303);
  const COMBINING_GRAVE = String.fromCharCode(0x0300);

  it("accepts exactly two combining marks stacked on one base letter", () => {
    // Marks sit on the middle letter, not the last, since a name must still
    // end on a letter - a trailing combining mark fails the shape check
    // regardless of this guard.
    const stacked = `n${COMBINING_CIRCUMFLEX}${COMBINING_TILDE}`;
    expect(validateManagerIdentity({ firstName: `A${stacked}na`, lastName: "Kowalski" }).ok).toBe(
      true
    );
  });

  it("rejects three or more combining marks stacked on one base letter", () => {
    const zalgo = `n${COMBINING_CIRCUMFLEX}${COMBINING_TILDE}${COMBINING_GRAVE}`;
    const result = validateManagerIdentity({ firstName: `A${zalgo}na`, lastName: "Kowalski" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe("firstName");
      expect(result.message).toBe("Imię ma zbyt wiele znaków diakrytycznych na jednej literze.");
    }
  });

  it("accepts marks distributed across several base letters even past the per-letter limit in total", () => {
    // Four marks total, never more than two on any single base letter -
    // a total cap on marks would wrongly reject this.
    const name = `a${COMBINING_CIRCUMFLEX}${COMBINING_TILDE}b${COMBINING_CIRCUMFLEX}${COMBINING_TILDE}c`;
    expect(validateManagerIdentity({ firstName: name, lastName: "Kowalski" }).ok).toBe(true);
  });

  // --- profanity, whole-token match after diacritic stripping ---

  it("rejects the exact profanity tokens, case-insensitively", () => {
    expect(validateManagerIdentity({ firstName: "Kurwa", lastName: "Kowalski" }).ok).toBe(false);
    expect(validateManagerIdentity({ firstName: "KURWA", lastName: "Kowalski" }).ok).toBe(false);
    expect(validateManagerIdentity({ firstName: "Jan", lastName: "Pizda" }).ok).toBe(false);
    expect(validateManagerIdentity({ firstName: "Chuj", lastName: "Kowalski" }).ok).toBe(false);
    expect(validateManagerIdentity({ firstName: "Jebac", lastName: "Kowalski" }).ok).toBe(false);
    expect(validateManagerIdentity({ firstName: "Skurwysyn", lastName: "Kowalski" }).ok).toBe(
      false
    );
  });

  it("rejects a profanity token joined by a hyphen or apostrophe", () => {
    expect(validateManagerIdentity({ firstName: "Jan-Kurwa", lastName: "Kowalski" }).ok).toBe(
      false
    );
  });

  it("does not reject names that merely contain a profanity token as a substring", () => {
    expect(validateManagerIdentity({ firstName: "Kurwanowski", lastName: "Kowalski" }).ok).toBe(
      true
    );
    expect(validateManagerIdentity({ firstName: "Szczepan", lastName: "Kowalski" }).ok).toBe(true);
    expect(validateManagerIdentity({ firstName: "Jan", lastName: "Kutschera" }).ok).toBe(true);
  });

  // --- message contract ---

  it("returns a Polish message that never quotes the rejected input", () => {
    const raw = "Jan3";
    const result = validateManagerIdentity({ firstName: raw, lastName: "Kowalski" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toContain(raw);
      expect(result.field).toBe("firstName");
    }
  });
});

describe("validateManagerIdentityFields", () => {
  it("accepts a valid pair", () => {
    const result = validateManagerIdentityFields("Jan", "Kowalski");
    expect(result).toEqual({ ok: true, value: { firstName: "Jan", lastName: "Kowalski" } });
  });

  it("reports both fields when both are empty", () => {
    const result = validateManagerIdentityFields("", "");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      { field: "firstName", message: "Imię musi mieć od 2 do 30 znaków." },
      { field: "lastName", message: "Nazwisko musi mieć od 2 do 30 znaków." },
    ]);
  });

  it("reports only the offending field when the other is valid", () => {
    const onlyFirstInvalid = validateManagerIdentityFields("", "Kowalski");
    expect(onlyFirstInvalid.ok).toBe(false);
    if (!onlyFirstInvalid.ok) {
      expect(onlyFirstInvalid.errors).toEqual([
        { field: "firstName", message: "Imię musi mieć od 2 do 30 znaków." },
      ]);
    }

    const onlyLastInvalid = validateManagerIdentityFields("Jan", "");
    expect(onlyLastInvalid.ok).toBe(false);
    if (!onlyLastInvalid.ok) {
      expect(onlyLastInvalid.errors).toEqual([
        { field: "lastName", message: "Nazwisko musi mieć od 2 do 30 znaków." },
      ]);
    }
  });

  it("normalises both fields the same way validateManagerIdentity does", () => {
    const result = validateManagerIdentityFields("  Jan   Maria  ", " Kowalski ");
    expect(result).toEqual({
      ok: true,
      value: { firstName: "Jan Maria", lastName: "Kowalski" },
    });
  });
});

describe("randomManagerIdentity", () => {
  it("draws 200 pairs, all from the name pools and all valid", () => {
    for (let i = 0; i < 200; i += 1) {
      const identity = randomManagerIdentity();
      expect(IMIONA).toContain(identity.firstName);
      expect(NAZWISKA).toContain(identity.lastName);
      const result = validateManagerIdentity(identity);
      expect(result.ok).toBe(true);
    }
  });
});
