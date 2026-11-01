import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { BOARD_REINVESTMENT_RATE } from "../../src/data/balance";
import { boardSharePercent } from "../../src/ui/board-share";
import { FORECAST_NOTE } from "../../src/ui/components/hud";

/**
 * The one number in the activation that is stated twice - once as arithmetic
 * and once as copy - and therefore the one that can drift without anything
 * noticing.
 */

describe("boardSharePercent", () => {
  test("renders the live constant, not a number typed into the copy", () => {
    expect(boardSharePercent()).toBe(`${Math.round(BOARD_REINVESTMENT_RATE * 100)}%`);
    expect(boardSharePercent()).toBe("30%");
  });

  test("the HUD note quotes the same share", () => {
    expect(FORECAST_NOTE).toContain(boardSharePercent());
  });

  test("no player-facing screen types the share out by hand", () => {
    // The three strings that explain the rate all go through the helper. A
    // literal here is exactly the drift the helper exists to prevent, and it
    // would only show up the day a joint calibration moves the rate.
    for (const file of [
      "src/ui/components/hud.tsx",
      "src/ui/screens/market-screen.tsx",
      "src/ui/screens/season-end-screen.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      const copy = source
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"));
      expect(copy.join("\n"), file).not.toMatch(/\d+% (wyniku|bilansu)/);
    }
  });

  test("refuses a rate the copy cannot render", () => {
    // Not a hypothetical guard for its own sake: a rate needing decimals is a
    // different design question, and rounding 0.305 down to "30%" would print
    // a number the game does not use.
    const whole = (rate: number): boolean => Number.isInteger(Math.round(rate * 100 * 1e9) / 1e9);
    expect(whole(BOARD_REINVESTMENT_RATE)).toBe(true);
    expect(whole(0.305)).toBe(false);
  });
});
