/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, test } from "vitest";

import {
  SETUP_DRAFT_STORAGE_KEY,
  clearSetupDraft,
  parseSetupDraft,
  readSetupDraft,
  writeSetupDraftFields,
  type SetupDraft,
} from "../../src/ui/setup-draft";
import { testClub } from "../logic/fixtures";

afterEach(() => {
  clearSetupDraft();
});

describe("parseSetupDraft", () => {
  test("returns null for a missing/non-object value", () => {
    expect(parseSetupDraft(null)).toBeNull();
    expect(parseSetupDraft(undefined)).toBeNull();
    expect(parseSetupDraft("garbage")).toBeNull();
    expect(parseSetupDraft(42)).toBeNull();
    expect(parseSetupDraft([])).toBeNull();
  });

  test("returns null for an unknown schemaVersion", () => {
    expect(parseSetupDraft({ schemaVersion: 2, firstName: "Jan" })).toBeNull();
    expect(parseSetupDraft({})).toBeNull();
  });

  test("accepts a complete, well-formed draft", () => {
    const raw = {
      schemaVersion: 1,
      firstName: "Jan",
      lastName: "Kowalski",
      timerWl: false,
      step: "club",
      clubId: testClub.clubId,
    };
    expect(parseSetupDraft(raw)).toEqual(raw);
  });

  test("discards an unknown club id, not the whole draft", () => {
    const raw = {
      schemaVersion: 1,
      firstName: "Jan",
      lastName: "Kowalski",
      timerWl: true,
      step: "club",
      clubId: "nie-taki-klub",
    };
    const result = parseSetupDraft(raw);
    expect(result).not.toBeNull();
    expect(result!.clubId).toBeNull();
    expect(result!.firstName).toBe("Jan");
  });

  test("discards a non-string club id", () => {
    const result = parseSetupDraft({ schemaVersion: 1, clubId: 42 });
    expect(result!.clubId).toBeNull();
  });

  test("falls back to empty strings for wrongly-typed names", () => {
    const result = parseSetupDraft({ schemaVersion: 1, firstName: 5, lastName: null });
    expect(result!.firstName).toBe("");
    expect(result!.lastName).toBe("");
  });

  test("discards a pathologically long name", () => {
    const tooLong = "a".repeat(500);
    const result = parseSetupDraft({ schemaVersion: 1, firstName: tooLong });
    expect(result!.firstName).toBe("");
  });

  test("falls back to boolean default for a wrongly-typed timerWl", () => {
    expect(parseSetupDraft({ schemaVersion: 1, timerWl: "yes" })!.timerWl).toBe(true);
    expect(parseSetupDraft({ schemaVersion: 1, timerWl: 1 })!.timerWl).toBe(true);
  });

  test("falls back to step 'manager' for anything but the literal 'club'", () => {
    expect(parseSetupDraft({ schemaVersion: 1, step: "club" })!.step).toBe("club");
    expect(parseSetupDraft({ schemaVersion: 1, step: "manager" })!.step).toBe("manager");
    expect(parseSetupDraft({ schemaVersion: 1, step: "whatever" })!.step).toBe("manager");
    expect(parseSetupDraft({ schemaVersion: 1, step: 3 })!.step).toBe("manager");
    expect(parseSetupDraft({ schemaVersion: 1 })!.step).toBe("manager");
  });

  test("missing fields all fall back to defaults without crashing", () => {
    const result = parseSetupDraft({ schemaVersion: 1 });
    expect(result).toEqual<SetupDraft>({
      schemaVersion: 1,
      firstName: "",
      lastName: "",
      timerWl: true,
      step: "manager",
      clubId: null,
    });
  });
});

describe("readSetupDraft / writeSetupDraftFields / clearSetupDraft", () => {
  test("returns null when nothing is stored", () => {
    expect(readSetupDraft()).toBeNull();
  });

  test("a write can be read back", () => {
    writeSetupDraftFields({ firstName: "Jan", step: "manager" });
    expect(readSetupDraft()).toEqual({
      schemaVersion: 1,
      firstName: "Jan",
      lastName: "",
      timerWl: true,
      step: "manager",
      clubId: null,
    });
  });

  test("a write merges onto the existing draft instead of overwriting it", () => {
    writeSetupDraftFields({ firstName: "Jan", lastName: "Kowalski", step: "manager" });
    writeSetupDraftFields({ step: "club", clubId: testClub.clubId });
    expect(readSetupDraft()).toEqual({
      schemaVersion: 1,
      firstName: "Jan",
      lastName: "Kowalski",
      timerWl: true,
      step: "club",
      clubId: testClub.clubId,
    });
  });

  test("clearSetupDraft removes the entry", () => {
    writeSetupDraftFields({ firstName: "Jan" });
    clearSetupDraft();
    expect(readSetupDraft()).toBeNull();
  });

  test("a hand-edited invalid entry in storage is discarded on read, not crashed on", () => {
    window.localStorage.setItem(SETUP_DRAFT_STORAGE_KEY, JSON.stringify({ schemaVersion: 99 }));
    expect(readSetupDraft()).toBeNull();
  });

  test("malformed JSON in storage is discarded, not crashed on", () => {
    window.localStorage.setItem(SETUP_DRAFT_STORAGE_KEY, "{not json");
    expect(readSetupDraft()).toBeNull();
  });

  test("writing after a corrupt entry merges onto defaults, not the corrupt data", () => {
    window.localStorage.setItem(SETUP_DRAFT_STORAGE_KEY, "{not json");
    writeSetupDraftFields({ firstName: "Ola" });
    expect(readSetupDraft()).toEqual({
      schemaVersion: 1,
      firstName: "Ola",
      lastName: "",
      timerWl: true,
      step: "manager",
      clubId: null,
    });
  });
});
