import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { test } from "vitest";

import type { ManagerIdentity } from "../../src/data/types";
import { ENGINE_REVISION } from "../../src/logic/engine-version";
import type { ReplayV2 } from "../../src/ui/game-archive";
import { playHeadless } from "./headless";
import { scenarios } from "./scenarios";

const MAX_ATTEMPTS = 200;

// pnpm sets this to the script name being run. Recording is a manual,
// deliberate act - skipped under plain `pnpm test`, which does not set it.
const recording = process.env.npm_lifecycle_event === "golden:record";

const replaysDir = join(process.cwd(), "tests", "golden", "replays");
if (recording && !existsSync(replaysDir)) mkdirSync(replaysDir, { recursive: true });

/**
 * The one manager identity a recorded golden replay carries. Fixed, not
 * drawn: nothing about which decisions a scenario's policy makes depends on
 * the manager's name, and a stable value keeps re-recordings free of
 * incidental diffs.
 */
const RECORDING_MANAGER: ManagerIdentity = { firstName: "Jan", lastName: "Kowalski" };

/**
 * Writes v2 replays (`{seed, clubId, manager, actions, engineVersion}`), per
 * docs/decisions/golden-master.md. This recorder is not run today -
 * `pnpm golden:record` stays a deliberate, manual act, and re-recording all
 * thirteen scenarios as v2 is step 8's job once new-seed coverage has been
 * swept. Until then the frozen v1 `.replay.json` files are read through
 * `playGoldenV1Replay` (see headless.ts), never through this recorder.
 */
for (const scenario of scenarios) {
  test.skipIf(!recording)(`record: ${scenario.slug}`, () => {
    let seed = scenario.seed;
    let actions: string[] | undefined;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const result = playHeadless({
        seed,
        clubId: scenario.clubId,
        manager: RECORDING_MANAGER,
        policy: scenario.policy,
      });
      if (scenario.coverage(result.events)) {
        actions = result.akcje;
        break;
      }
      seed = (seed + 1) >>> 0;
    }

    if (!actions) {
      throw new Error(
        `Scenario "${scenario.slug}" never satisfied its coverage predicate within ${MAX_ATTEMPTS} attempts starting at seed ${scenario.seed}`
      );
    }

    const replay: ReplayV2 = {
      seed,
      clubId: scenario.clubId,
      manager: RECORDING_MANAGER,
      actions,
      engineVersion: ENGINE_REVISION,
    };
    writeFileSync(
      join(replaysDir, `${scenario.slug}.replay.json`),
      `${JSON.stringify(replay, null, 2)}\n`
    );
  });
}
