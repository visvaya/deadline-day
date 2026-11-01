import { describe, expect, test } from "vitest";
import { migrateStoredUiPreferences } from "../../src/ui/ui-preferences";

describe("migrateStoredUiPreferences", () => {
  test("v1 -> v2: carries a stored explicit choice over under the renamed field", () => {
    // A v1 payload only ever exists because a player explicitly picked a
    // mode (v1 had no "unset" state), so it migrates as an explicit choice,
    // not as "no choice yet" - both directions, so a future change to
    // either value is caught independently.
    expect(
      migrateStoredUiPreferences({ schemaVersion: 1, mobileActionBarMode: "autoHide" })
    ).toEqual({ schemaVersion: 2, actionBarMode: "autoHide" });
    expect(
      migrateStoredUiPreferences({ schemaVersion: 1, mobileActionBarMode: "alwaysVisible" })
    ).toEqual({ schemaVersion: 2, actionBarMode: "alwaysVisible" });
  });

  test("v2 unset: a schemaVersion 2 payload with no actionBarMode stays unset", () => {
    expect(migrateStoredUiPreferences({ schemaVersion: 2 })).toEqual({ schemaVersion: 2 });
  });

  test("v2 set: a valid schemaVersion 2 payload passes through unchanged", () => {
    expect(
      migrateStoredUiPreferences({ schemaVersion: 2, actionBarMode: "alwaysVisible" })
    ).toEqual({ schemaVersion: 2, actionBarMode: "alwaysVisible" });
    expect(migrateStoredUiPreferences({ schemaVersion: 2, actionBarMode: "autoHide" })).toEqual({
      schemaVersion: 2,
      actionBarMode: "autoHide",
    });
  });

  test("garbage/invalid -> unset", () => {
    expect(
      migrateStoredUiPreferences({ schemaVersion: 1, mobileActionBarMode: "sometimes" })
    ).toEqual({ schemaVersion: 2 });
    expect(migrateStoredUiPreferences({ schemaVersion: 2, actionBarMode: "sometimes" })).toEqual({
      schemaVersion: 2,
    });
    expect(migrateStoredUiPreferences(null)).toEqual({ schemaVersion: 2 });
    expect(migrateStoredUiPreferences(undefined)).toEqual({ schemaVersion: 2 });
    expect(migrateStoredUiPreferences({ schemaVersion: 3, actionBarMode: "autoHide" })).toEqual({
      schemaVersion: 2,
    });
  });
});
