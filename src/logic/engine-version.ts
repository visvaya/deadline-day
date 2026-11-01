/**
 * Two version numbers that have nothing to do with each other, kept apart on
 * purpose.
 *
 * CURRENT_VERSION (src/data/changelog.ts) is what the player reads. It moves
 * when there is something worth telling them and stays put when there is not.
 *
 * ENGINE_REVISION is what a save file is allowed to trust. It must move
 * whenever the reducer's behaviour changes, whether or not the change is
 * worth a changelog line - a mid-career save produced by a different engine
 * can be shape-valid and still meaningless, so resuming it would hand the
 * player a career that quietly stopped being the one they were playing.
 *
 * Conflating the two is how this went stale: the save guard was pointed at
 * CURRENT_VERSION, which sat at 0.82 through the match engine, the formation
 * rewrite and two recalibrations. The guard was doing its job; it was just
 * watching a number nobody was moving.
 *
 * Bumping this is not a matter of remembering. tests/golden/engine-revision.
 * test.ts fails whenever the golden traces change without it, which is the
 * same signal - traces are the engine's own fingerprint.
 */
export const ENGINE_REVISION = "2026-09-22.2";

/**
 * The vocabulary a recorded replay was written in used to live here as
 * `REPLAY_FORMAT_VERSION`, re-exported from production code for two test
 * files to compare against. Task 6F (2026-09-14) removed that production
 * use: the v1 golden adapter (tests/golden/headless.ts) now checks the
 * literal `"reducer-v1"` directly, and the v2 shape a replay carries is
 * recognised by its own structure (`{seed, clubId, manager, actions,
 * engineVersion}`), not by a second version field. A recorded v2 replay's
 * `engineVersion` is simply the `ENGINE_REVISION` that produced it - see
 * `ReplayV2` in src/ui/game-archive.ts and the recorder in
 * tests/golden/record.test.ts.
 */
