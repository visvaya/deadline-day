/**
 * The source-club cell sweep over 200 000 players per type, split from
 * offer-source-club.test.ts because `*.statistical.test.ts` files run
 * without coverage instrumentation (vite.config.ts).
 */
import { expect, test } from "vitest";

import type { Player } from "../../src/data/types";
import { mean, sample, variance } from "./source-club-sample";

/**
 * The rule the whole task exists to protect, in the form that is actually
 * testable.
 *
 * Comparing the gap MARGINALLY proves nothing: the shift subtracts the same
 * number from ovr and from sufit, so the marginal gap is preserved by
 * construction and the assertion cannot fail. Measured: 0.000, always.
 *
 * Conditioning on the visible ovr ALONE is the opposite mistake - it shows a
 * difference of up to 9.9 ovr, and that difference is not a leak. At ovr 62
 * a player from a strong club can only be a "mlody" (a "gotowy" starts at
 * 67), while one from a clubOvr-51 club can only be a shifted "gotowy". The
 * gap differs because the TYPE differs, and the type is visible: the age
 * bands are disjoint (17-21 / 24-28 / 30-34) and the age is printed on the
 * card beside the position.
 *
 * So the property is conditional on age. Measured over 360 000 players,
 * clubOvr 72 against 51: 0.09 mean difference across comparable (ovr, age)
 * cells and 0.49 in the worst of forty - which is 3.5 standard errors at
 * n = 2000, so noise rather than structure.
 */
test("at a given (age, ovr) cell, the gap does not depend on the source club", () => {
  const cells: number[] = [];

  for (const typ of ["mlody", "gotowy", "weteran"] as const) {
    // Independent seeds per club - sharing them would compare a player with
    // himself and turn this back into the tautology described above.
    //
    // Bucketed in one pass rather than filtered per cell. Filtering inside
    // the (ovr, age) loops walked 200 000 players 861 times per type, which
    // is a billion comparisons and took 67 seconds - under a 120 s timeout
    // that made the test pass or fail depending on what else the machine was
    // doing. Same numbers, one pass.
    const bucket = (players: readonly Player[]) => {
      const byCell = new Map<string, number[]>();
      for (const p of players) {
        const key = `${p.ovr}:${p.wiek}`;
        const cell = byCell.get(key);
        if (cell) cell.push(p.sufit - p.ovr);
        else byCell.set(key, [p.sufit - p.ovr]);
      }
      return byCell;
    };

    const strong = bucket(sample(72, typ, 0));
    const weak = bucket(sample(51, typ, 3_000_000));

    for (const [key, s] of strong) {
      const w = weak.get(key);
      if (w === undefined || s.length < 3000 || w.length < 3000) continue;

      // Compared as a z-score, not as raw ovr: the per-cell standard error
      // is about 0.18 at this sample size, so an absolute 0.25 threshold
      // would be tighter than the noise floor (see the plan's decision 1).
      const se = Math.sqrt(variance(s) / s.length + variance(w) / w.length);
      // A veteran's ceiling IS his ovr, so his gap has no spread at all and
      // the standard error is exactly zero. That cell is not degenerate, it
      // is the strongest possible pass - the two means have to match
      // exactly, and a z-score of 0/0 would only turn it into NaN.
      if (se === 0) {
        expect(mean(s)).toBe(mean(w));
        cells.push(0);
        continue;
      }
      cells.push(Math.abs(mean(s) - mean(w)) / se);
    }
  }

  // Enough cells to be worth calling a sweep - if the sample ever shrinks,
  // this fails rather than passing vacuously.
  expect(cells.length).toBeGreaterThan(20);
  const worst = Math.max(...cells);
  expect(worst, `najgorsza komórka: z = ${worst.toFixed(2)}`).toBeLessThan(4);
  // 60 s against a measured 7 s alone and 13 s under coverage instrumentation.
  // The margin is the point: at 120 s against 67 s this test passed or failed
  // depending on what else the machine happened to be running.
}, 60000);
