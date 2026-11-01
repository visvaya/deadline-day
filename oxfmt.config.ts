import { defineConfig } from "oxfmt";

/**
 * Formatter configuration (oxfmt, migrated from Prettier on 2026-10-21 with
 * `oxfmt --migrate=prettier`).
 * Same options as the Prettier config it replaces. Patterns are gitignore-style,
 * rooted at this directory.
 */
export default defineConfig({
  printWidth: 100,
  semi: true,
  singleQuote: false,
  trailingComma: "es5",
  // Prettier never sorted package.json; keep its key order as written.
  sortPackageJson: false,
  ignorePatterns: [
    "node_modules",
    "dist",
    "package-lock.json",
    "pnpm-lock.yaml",
    "test-results",
    "playwright-report",

    // Nested git worktrees (.worktrees/ in .gitignore). Reformatting another
    // worktree's in-progress files clobbers work that belongs to a different
    // checkout entirely.
    ".worktrees/",

    // Documentation is prose, not code; a formatter reflows
    // their tables and lists.
    "*.md",

    // The retired prototype from before the split into src/ - a dead archive.
    "reference/",

    // The fixture mimics real, minified HTML from a scraped page; the parser
    // in sync-ratings-core.ts matches a one-line <tr>.
    "tests/scripts/fixtures/",

    // One-off local measurement scripts and the coverage provider's
    // in-progress output. Neither is committed, and both are ignored by git
    // only through .git/info/exclude or an interrupted run, so without these
    // lines a leftover file blocks the pre-commit hook for anyone.
    ".scratch/",
    "coverage/",

    // Output of `pnpm fit:opening-budget`: its whole value is being byte-for-
    // byte what the command produces (the report pins input hashes), and a
    // formatter collapses arrays JSON.stringify does not.
    "scripts/data/opening-budget-fit-*.json",

    // The pre-activation RNG snapshot keeps one career per line (18 000
    // careers); a formatter would break every array onto its own lines.
    "scripts/data/opening-budget-activation-2026-09-12/preactivation-rng.json",
  ],
});
