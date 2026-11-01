// Shared helper for tests that need a scratch directory on disk.
//
// Every test that called `mkdtemp(join(tmpdir(), ...))` directly and never
// removed it leaked a directory on every run - 2 200 of them accumulated on
// one machine, 280 (277 MB) on a nearly full C drive (found 2026-09-24).
// This module centralises creation and cleanup so a new test cannot repeat
// that mistake without the guard in tests/scripts/repository-guards.test.ts
// catching it.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { onTestFinished } from "vitest";

/**
 * The base directory new temp dirs are created under. Defaults to the OS
 * temp directory; set DD_TEST_TMPDIR to point it at another drive for local
 * runs (for example one on another drive).
 * CI runs without the override. Created with `recursive: true` so a
 * configured-but-missing directory still works.
 */
export const testTempRoot = (): string => {
  const configured = process.env.DD_TEST_TMPDIR;
  const root = configured && configured.trim() !== "" ? configured : tmpdir();
  mkdirSync(root, { recursive: true });
  return root;
};

/**
 * Creates a fresh temp directory under testTempRoot() and registers its
 * removal via vitest's onTestFinished, so it is deleted after the current
 * test even if that test fails. Must be called while a test is running -
 * onTestFinished throws when there is no active test context (for example
 * at module load or inside a bare describe() body).
 */
export const makeTestTempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(testTempRoot(), `deadline-day-${prefix}-`));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
