/**
 * The aggregate check from european-cups-careers.test.ts: observed advances
 * against the model over full headless careers. Split off because
 * `*.statistical.test.ts` files run without coverage instrumentation
 * (vite.config.ts).
 */
import { expect, test } from "vitest";

import { EUROPEAN_ADVANCE_ODDS } from "../../src/data/balance";
import { rawAdvance } from "../../scripts/european-cups-audit-core";
import {
  CAREER_POLICIES,
  collectCampaigns,
  qualifyResidual,
} from "../../scripts/european-cups-careers";

const SEED = 0x4e05_7c01;
const CLUBS = ["legia-warszawa", "zaglebie-lubin", "wisla-krakow"] as const;
const POLICIES = { mixed: CAREER_POLICIES.mixed!, alwaysTake: CAREER_POLICIES.alwaysTake! };

/**
 * The claim this defends: `sila` on the season line IS the strength the
 * european draw used. If the two ever came apart, the observed advance rate
 * would drift away from the model read at that strength.
 *
 * Judged against its OWN standard error rather than a fixed band. A small
 * sample of careers puts the residual several points off zero by chance
 * alone - an earlier version of this test asserted a flat 10 pp and failed
 * on exactly that - so the criterion is three sigma, which is a statement
 * about the measurement rather than about how lucky this seed was.
 */
// Plays full headless careers and exceeded 30 s under full-suite load while taking a few seconds alone.
test("obserwowane awanse zgadzają się z modelem przy zapisanej sile", () => {
  const run = collectCampaigns(SEED, 30, CLUBS, POLICIES);
  for (const cup of ["LM", "LE", "LK"] as const) {
    const residual = qualifyResidual(
      run.observations.filter((o) => o.cup === cup),
      (o) => Math.min(1, rawAdvance(EUROPEAN_ADVANCE_ODDS, cup, o.strength).pQualify)
    )!;
    expect(residual.clusters).toBeGreaterThan(10);
    expect(Math.abs(residual.mean)).toBeLessThan(3 * residual.se + 0.02);
  }
}, 60_000);
