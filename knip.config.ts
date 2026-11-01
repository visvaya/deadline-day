import type { KnipConfig } from "knip";

/**
 * Dead-code and unused-export detection.
 *
 * Written in TypeScript rather than JSON so every exception can carry the
 * reason it exists. That matters more here than usual: one of knip's
 * findings below is not merely wrong but dangerous to act on.
 *
 * Run through `pnpm quality:dead`, which sets KNIP_DISABLE_RAW_TRANSFER=1.
 * That flag is not optional on Windows - see the script in package.json.
 */
const config: KnipConfig = {
  // Tests are entry points, not incidental files. Without this every helper
  // a test imports and nothing else would read as dead, which is the usual
  // way this tool gets configured into uselessness.
  entry: ["scripts/*.{ts,mjs}", "tests/**/*.test.ts"],
  project: ["src/**/*.{ts,tsx}", "scripts/**/*.{ts,mjs}", "tests/**/*.ts"],

  // No ignoreDependencies: knip's commitlint plugin finds @commitlint/cli
  // through commitlint.config.mjs. If a future knip reports it unused, DO NOT
  // remove the package: scripts/git-hooks.mjs runs it via `pnpm exec` from the
  // commit-msg hook, and without it conventional commits stop being enforced.

  // Exclude exports tagged @internal from being reported as unused.
  // Applies to MetricSemantics and MetricDisplayScale, forward-looking public
  // types for a later UI step (not yet implemented).
  tags: ["-internal"],
};

export default config;
