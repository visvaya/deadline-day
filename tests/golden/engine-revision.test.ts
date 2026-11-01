import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { ENGINE_REVISION } from "../../src/logic/engine-version";

/**
 * Ties ENGINE_REVISION to the golden traces, so that bumping it stops being
 * something a person has to remember.
 *
 * The traces are the engine's own fingerprint: they change if and only if the
 * reducer behaves differently. So "the traces moved and the revision did not"
 * is exactly the mistake worth catching - it means a save written by the old
 * engine will still be accepted by the new one, resumed, and quietly finish
 * as a career the player was never playing.
 *
 * That is not hypothetical. The guard in game-save.ts was pointed at
 * CURRENT_VERSION, which sat at 0.82 while the match engine replaced the
 * season, formations replaced the position list and the legacy thresholds
 * were recalibrated twice. It passed every one of them.
 *
 * WHEN THIS FAILS after a deliberate `pnpm golden:retrace`:
 *   1. bump ENGINE_REVISION in src/logic/engine-version.ts
 *   2. paste the digest this test reports into EXPECTED_TRACE_DIGEST below
 * Both in the same commit as the retrace. Updating only the digest defeats
 * the entire point of the test.
 */
const EXPECTED_REVISION = "2026-09-22.2";
const EXPECTED_TRACE_DIGEST = "117bef8e7d473e29";

const traceDigest = (): string => {
  const dir = join(process.cwd(), "tests", "golden", "traces");
  const hash = createHash("sha256");
  // Sorted so the digest depends on the traces, not on how the filesystem
  // happens to enumerate them.
  for (const file of readdirSync(dir).sort()) {
    hash.update(file);
    hash.update(readFileSync(join(dir, file)));
  }
  return hash.digest("hex").slice(0, 16);
};

test("the engine revision moves whenever the golden traces do", () => {
  expect(
    traceDigest(),
    `Golden traces changed. Bump ENGINE_REVISION in src/logic/engine-version.ts and update EXPECTED_TRACE_DIGEST here, in the same commit as the retrace.`
  ).toBe(EXPECTED_TRACE_DIGEST);
});

test("the revision recorded here is the one the game ships", () => {
  // Guards the other half: bumping the constant without touching this file
  // would leave the digest pinned to an engine that no longer exists.
  expect(ENGINE_REVISION).toBe(EXPECTED_REVISION);
});
