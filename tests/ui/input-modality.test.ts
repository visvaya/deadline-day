/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { getInputModality } from "../../src/ui/input-modality";

// Every test starts from a known baseline: a real pointerdown, exactly the
// signal the tracker itself listens for, rather than reaching into its
// private state. The module is a plain, always-listening singleton (see its
// own doc comment for why it is not a hook), so without this reset a test
// order dependency would silently creep in - a later test would otherwise
// inherit whatever "keyboard"/"pointer" modality the previous one left
// behind instead of starting from a clean slate.
beforeEach(() => {
  window.dispatchEvent(new Event("pointerdown", { bubbles: true }));
});

afterEach(() => {
  window.dispatchEvent(new Event("pointerdown", { bubbles: true }));
});

describe("input modality tracker", () => {
  test("defaults to pointer modality", () => {
    expect(getInputModality()).toBe("pointer");
  });

  test("switches to keyboard modality after a real keydown", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(getInputModality()).toBe("keyboard");
  });

  test("a bare modifier keydown does not switch modality on its own", () => {
    // Browsers fire "keydown" for Shift alone, including while a mouse
    // selection or drag is in progress - treating that as "the player
    // switched to the keyboard" would flip modality behind a pointer user's
    // back for a key that never, by itself, activates anything.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
    expect(getInputModality()).toBe("pointer");
  });

  test("switches back to pointer after a pointerdown following a keydown", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(getInputModality()).toBe("keyboard");

    window.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(getInputModality()).toBe("pointer");
  });

  test("switches back to pointer after a touchstart following a keydown", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(getInputModality()).toBe("keyboard");

    window.dispatchEvent(new Event("touchstart", { bubbles: true }));
    expect(getInputModality()).toBe("pointer");
  });
});
