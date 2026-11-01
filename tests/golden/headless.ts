import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { GameState } from "../../src/data/types";
import { autoAdvance as autoAdvancePure, simulateGame } from "../../src/logic/simulate";
import type { Action, PlayOptions, PlayResult, Policy } from "../../src/logic/simulate";
import type { MeasurementOptions } from "../../src/logic/income-mode";
import { at } from "../../src/logic/invariant";
import type { Scenario } from "./scenarios";
import { armMathRandomGuard, disarmMathRandomGuard } from "../setup";

export type { Policy, PlayOptions, PlayResult } from "../../src/logic/simulate";

/**
 * Test-only wrapper around src/logic/simulate: arms the Math.random guard
 * around the pure play loop. Phase 1 acceptance criterion 3 requires no
 * simulation code reach Math.random; the linter already forbids it across src/,
 * so this is a belt-and-braces runtime check rather than the primary
 * defence. The guard lives in tests/ (not src/logic/) because it throws on
 * a global that production code must never touch either way.
 */
const withMathRandomGuard = <T>(run: () => T): T => {
  armMathRandomGuard();
  try {
    return run();
  } finally {
    disarmMathRandomGuard();
  }
};

export const playHeadless = (opts: PlayOptions): PlayResult =>
  withMathRandomGuard(() => simulateGame(opts));

export const autoAdvance = (state: GameState, options?: MeasurementOptions): GameState | null =>
  withMathRandomGuard(() => autoAdvancePure(state, options));

/** The literal vocabulary marker every recorded v1 golden replay carries.
 * Checked, not merely documented: see playGoldenV1Replay below. */
const GOLDEN_V1_ENGINE_VERSION = "reducer-v1";

/**
 * The shape of the thirteen frozen `.replay.json` files: recorded before the
 * club model existed, so the club they carry is a difficulty label
 * (`poziom`), not a `clubId`. Never written by new code - see
 * docs/decisions/golden-master.md.
 */
export type GoldenReplayV1 = {
  readonly seed: number;
  readonly poziom: string;
  readonly akcje: readonly string[];
  readonly engineVersion: string;
};

const GOLDEN_REPLAYS_DIR = join(process.cwd(), "tests", "golden", "replays");

const readGoldenReplayV1 = (slug: string): GoldenReplayV1 =>
  JSON.parse(readFileSync(join(GOLDEN_REPLAYS_DIR, `${slug}.replay.json`), "utf8"));

/**
 * The v1 golden adapter (Task 6F): recognises `engineVersion === "reducer-v1"`
 * literally, ignores only the leading `START:<difficulty>` token every v1
 * replay starts with, and plays the rest of the recorded actions through the
 * scenario's own `clubId` (see scenarios.ts) instead of the difficulty the
 * replay was originally recorded under.
 *
 * `.replay.json` files are never edited to carry a club - they stay v1
 * forever, and this adapter is what lets the frozen decisions still drive a
 * career under the club model. Re-recording as v2 is step 8's job, not this
 * one's.
 *
 * The removed club draw shifts the position of every later RNG call by one
 * (retrace category 3 in the Task 6F commit message, 19856ba), and the
 * fixture order stopped following the `CLUBS` literal (category 4) - so a career that used to end in
 * relegation after N recorded decisions can now survive past them, needing
 * decisions the frozen replay never recorded. Rather than crash there
 * (`playHeadless` throws once its queue empties mid-career), this adapter
 * drains the recorded queue first and falls back to the scenario's own
 * `policy` only for whatever the retrace needs beyond it - exactly the
 * function `record.test.ts` would have used to extend the recording itself.
 * `recordedCount` tells the caller how much of `result.akcje` is the frozen
 * recording versus this fallback, so a comparison can hold the recorded
 * prefix to the byte while treating the extension as new, unrecorded ground.
 */
export const playGoldenV1Replay = (
  scenario: Scenario
): {
  readonly replay: GoldenReplayV1;
  readonly result: PlayResult;
  readonly recordedCount: number;
} => {
  const replay = readGoldenReplayV1(scenario.slug);
  if (replay.engineVersion !== GOLDEN_V1_ENGINE_VERSION) {
    throw new Error(
      `${scenario.slug}.replay.json was recorded for a different action vocabulary ` +
        `(engineVersion="${replay.engineVersion}"), not the frozen v1 adapter`
    );
  }
  const recorded = replay.akcje.slice(1).map((token) => token.toLowerCase() as Action);
  let consumed = 0;
  const policy: Policy = (ctx) => {
    if (consumed < recorded.length) {
      const action = at(recorded, consumed, "recorded action");
      consumed += 1;
      return action;
    }
    return scenario.policy(ctx);
  };
  const result = playHeadless({ seed: replay.seed, clubId: scenario.clubId, policy });
  return { replay, result, recordedCount: consumed };
};
