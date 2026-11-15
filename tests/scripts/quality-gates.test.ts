import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { SIZE_EXCEPTIONS, SIZE_LIMITS } from "../../oxlint.config";
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

  test("size and complexity limits in src/ stay at or below their pins", () => {
    const pinned = {
      "max-lines": 800,
      "max-lines-per-function": 150,
      complexity: 20,
      "max-depth": 4,
      "max-params": 5,
    };
    for (const [rule, max] of Object.entries(pinned)) {
      expect(SIZE_LIMITS[rule as keyof typeof pinned], rule).toBeLessThanOrEqual(max);
    }
  });

  test("files over a size limit may shrink but not grow, and no file joins the list", () => {
    // Measured 2026-11-15. Lower a number when a file shrinks; drop the entry when it fits.
    const pinned: Record<string, Record<string, number>> = {
      "src/logic/game-reducer.ts": {
        "max-lines": 1166,
        "max-lines-per-function": 278,
        complexity: 48,
      },
      "src/data/balance.ts": { "max-lines": 916 },
      "src/ui/app.tsx": { "max-lines": 808, "max-lines-per-function": 741, complexity: 54 },
      "src/ui/screens/club-select-screen.tsx": { "max-lines-per-function": 364 },
      "src/ui/screens/offer-window-screen.tsx": { "max-lines-per-function": 342, complexity: 23 },
      "src/ui/screens/manager-screen.tsx": { "max-lines-per-function": 284 },
      "src/ui/components/squad-drawer.tsx": { "max-lines-per-function": 271 },
      "src/ui/screens/season-end-screen.tsx": { "max-lines-per-function": 245, complexity: 28 },
      "src/ui/screens/final-screen.tsx": { "max-lines-per-function": 214, complexity: 23 },
      "src/ui/components/offer-card.tsx": { "max-lines-per-function": 196, complexity: 38 },
      "src/logic/offers.ts": { "max-lines-per-function": 176, complexity: 31, "max-params": 9 },
      "src/logic/epilogue.ts": { "max-lines-per-function": 165 },
      "src/ui/components/info-popover.tsx": { "max-lines-per-function": 162 },
      "src/ui/screens/market-screen.tsx": { "max-lines-per-function": 160 },
      "src/ui/components/player-reports.tsx": { "max-lines-per-function": 151 },
      "src/logic/european-cups.ts": { "max-params": 6 },
    };
    for (const [file, limits] of Object.entries(SIZE_EXCEPTIONS)) {
      expect(Object.keys(pinned), "a new file on the exception list").toContain(file);
      for (const [rule, max] of Object.entries(limits)) {
        expect(max, `${file} ${rule}`).toBeLessThanOrEqual(pinned[file]?.[rule] ?? 0);
      }
    }
  });

  test("every direct dependency is pinned to an exact version", () => {
    // Decided 2026-11-15: a version moves only through a pull request (Dependabot
    // or a person), never through a range a fresh install resolves differently.
    for (const path of ["package.json", "deploy/package.json"]) {
      const manifest = JSON.parse(read(path)) as Record<string, Record<string, string> | undefined>;
      for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
        for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
          expect(spec, `${path} ${name}`).toMatch(/^\d+\.\d+\.\d+$/);
        }
      }
    }
  });
});
