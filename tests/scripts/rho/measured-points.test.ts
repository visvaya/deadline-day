import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  RHO_ENVELOPE_LOWER,
  RHO_ENVELOPE_UPPER,
  RHO_ESTIMATE,
  ROUNDED,
} from "../../../scripts/rho/measured-points";

const report = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../docs/decisions/_rho-2026-09-01.md"),
  "utf8"
);

/** First occurrence, which is the ten-season window - the sensitivity window
 * repeats the same row labels further down. */
const rowValue = (label: string): string => {
  const match = report.split("\n").find((line) => line.includes(label));
  if (!match) throw new Error(`no row labelled "${label}" in the pinned report`);
  const cells = match.split("|").map((cell) => cell.trim());
  return cells[cells.length - 2]!.replaceAll("*", "");
};

describe("the simulated points match the pinned measurement", () => {
  // Task 6 simulates rho values imported from a generated module while the
  // verdict is read off a report. If the two ever drift apart, the study
  // would be answering a question about one rho and concluding about
  // another - and nothing else would notice.
  it("agrees with the report to the four decimals the report prints", () => {
    expect(ROUNDED.estimate).toBe(rowValue("**ρ̂**"));
    expect(ROUNDED.profile).toBe(rowValue("przedział profilowy 99%"));
    expect(ROUNDED.block).toBe(rowValue("przedział blokowy"));
    expect(ROUNDED.envelope).toBe(rowValue("obwiednia konserwatywna"));
  });

  it("keeps the full-precision values consistent with their rounded form", () => {
    expect(RHO_ESTIMATE.toFixed(4)).toBe(ROUNDED.estimate);
    expect(`[${RHO_ENVELOPE_LOWER.toFixed(4)}; ${RHO_ENVELOPE_UPPER.toFixed(4)}]`).toBe(
      ROUNDED.envelope
    );
  });

  it("carries more precision than the report prints, which is the point", () => {
    // Simulating a rounded rho would answer a question about a different rho:
    // the draws gate admits a window 0.036 wide.
    expect(RHO_ESTIMATE).not.toBe(Number(ROUNDED.estimate));
    expect(Math.abs(RHO_ESTIMATE - Number(ROUNDED.estimate))).toBeLessThan(5e-5);
  });
});
