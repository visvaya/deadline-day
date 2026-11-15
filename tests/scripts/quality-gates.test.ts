import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { BUNDLE_SIZE_BUDGETS } from "../../scripts/check-bundle-size.mjs";
import { KNOWN_ABSENT } from "../../scripts/doc-links-core";
import viteConfig from "../../vite.config";

/**
 * Every numeric quality gate of the repository, pinned in one place.
 *
 * Gates only tighten. Each one sits in its own tool's config, where a looser
 * number would pass review unnoticed; this test fails when any of them moves
 * the wrong way. Tightening a gate means raising (or lowering) the pin here in
 * the same change. Loosening one needs a recorded decision with its reason,
 * named in the pull request, and the new pin here.
 */

const read = (path: string): string => readFileSync(path, "utf8");

describe("quality gates only tighten", () => {
  test("engine coverage floors stay at or above their pins", () => {
    const thresholds = viteConfig.test?.coverage?.thresholds ?? {};
    expect(thresholds).toMatchObject({
      lines: expect.any(Number),
      functions: expect.any(Number),
      branches: expect.any(Number),
      statements: expect.any(Number),
    });
    const pinned = { lines: 96, functions: 96, branches: 89, statements: 95 };
    for (const [metric, floor] of Object.entries(pinned)) {
      expect(thresholds[metric as keyof typeof pinned], metric).toBeGreaterThanOrEqual(floor);
    }
  });

  test("duplication allows no clone of 30 lines or more", () => {
    const script = (JSON.parse(read("package.json")) as { scripts: Record<string, string> })
      .scripts["quality:duplicates"];
    expect(script).toMatch(/--threshold 0(\s|$)/);
    const jscpd = JSON.parse(read(".jscpd.json")) as { minLines: number };
    expect(jscpd.minLines).toBeLessThanOrEqual(30);
  });

  test("bundle budgets stay at or below their pins", () => {
    expect(BUNDLE_SIZE_BUDGETS.jsGzipBytesBudget).toBeLessThanOrEqual(140 * 1024);
    expect(BUNDLE_SIZE_BUDGETS.cssGzipBytesBudget).toBeLessThanOrEqual(12 * 1024);
  });

  test("dependencies wait at least three days in the game and in deploy/", () => {
    // Owner's decision of 2026-11-14: three days, in pnpm and in Dependabot's cooldown.
    for (const path of ["pnpm-workspace.yaml", "deploy/pnpm-workspace.yaml"]) {
      const minutes = Number(/^minimumReleaseAge:\s*(\d+)/m.exec(read(path))?.[1]);
      expect(minutes, path).toBeGreaterThanOrEqual(3 * 24 * 60);
    }
    // A semver-specific cooldown overrides the default for its update type.
    const cooldowns = [
      ...read(".github/dependabot.yml").matchAll(
        /["']?(?:default|semver-major|semver-minor|semver-patch)-days["']?\s*:\s*["']?(\d+)/g
      ),
    ].map(([, days]) => Number(days));
    expect(cooldowns.length).toBeGreaterThan(0);
    for (const days of cooldowns) expect(days).toBeGreaterThanOrEqual(3);
  });

  test("the documentation link check keeps its exception list from growing", () => {
    expect(KNOWN_ABSENT.size).toBeLessThanOrEqual(5);
  });
});
