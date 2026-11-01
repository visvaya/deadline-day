import { defineConfig } from "@playwright/test";

/**
 * Phase 3's smoke test - a single Playwright run against the built bundle
 * (not `pnpm dev`), so it exercises the same tsc/vite output that ships,
 * without HMR or the dev error overlay as a source of flake.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  // Two workers on CI, one per core of the runner: each test has its own
  // browser context and storage, so they share nothing but the static
  // preview server. Locally one, so a run does not crowd out other work.
  workers: process.env.CI ? 2 : 1,
  // One retry on CI only. A test that passes on retry is reported as flaky
  // rather than hidden, and costs seconds instead of a rerun of the whole
  // job. Locally a failure stays a failure.
  retries: process.env.CI ? 1 : 0,
  // CI keeps an HTML report so a failed run can be read from the uploaded
  // artifact (.github/workflows/ci.yml); locally the list is enough.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    // Free when the run passes, and the only way to diagnose a failure that
    // happened on a CI machine rather than in front of someone.
    screenshot: "only-on-failure",
    video: "off",
    trace: "retain-on-failure",
    // Our club-detail scroll honours prefers-reduced-motion and becomes
    // instant under it. Without this, Playwright's click races the smooth
    // scroll animation: it resolves the target as stable, scrolls to a
    // position that is stale by the click, and the element ends up outside
    // the viewport again. This also exercises the reduced-motion path,
    // which is the one accessibility-sensitive players get.
    contextOptions: {
      reducedMotion: "reduce",
    },
  },
  // WebKit earns its place here rather than doubling the run for symmetry's
  // sake: this is a mobile-first game whose layout rules are exactly the ones
  // WebKit renders differently - the 360px no-horizontal-overflow guarantee,
  // DragScroller's overflow containers and their mask-image edge fades. Both
  // projects get a fresh browser context per test, so running them in
  // parallel leaves determinism unchanged.
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "pnpm build && pnpm preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
