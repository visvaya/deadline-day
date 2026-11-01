import { globSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";

import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

const TEST_FILES = "tests/**/*.test.{ts,tsx}";

/**
 * Engine tests share one module graph per worker (`isolate: false`): the
 * engine is pure functions with no module state, and a fresh worker per file
 * cost 0.3 s on CI and 2-3 s on the owner's laptop for each of ~130 files.
 * Everything that can leave state behind keeps its own worker: the UI tests,
 * and any file that asks for another environment or mocks, stubs, spies or
 * fakes timers. Classified by reading the files, so a new test that starts
 * mocking moves to the isolated project by itself instead of leaking into
 * its neighbours.
 */
const NEEDS_OWN_WORKER =
  /@vitest-environment|\bvi\.(?:mock|doMock|stubGlobal|stubEnv|spyOn|useFakeTimers)\b/;
const ISOLATED_TEST_FILES = globSync(TEST_FILES)
  .map((file) => file.replaceAll("\\", "/"))
  .filter(
    (file) => file.startsWith("tests/ui/") || NEEDS_OWN_WORKER.test(readFileSync(file, "utf8"))
  );

export default defineConfig({
  plugins: [react()],
  test: {
    // Node by default: 74 of 90 test files never touch a DOM, and giving
    // them a jsdom one cost 409 s of environment time against 94 s of wall
    // clock on tests/logic alone. Under that load a pure-logic test doing
    // 0.8 s of real work could pass the 5 s default timeout and fail for
    // reasons that had nothing to do with it.
    //
    // The files that DO need a document say so themselves, with a
    // `@vitest-environment jsdom` docblock at the top. Per file rather than
    // per directory because three engine tests and two script tests need one
    // while their neighbours do not, so a directory rule would be a lie in
    // both directions.
    environment: "node",
    // Vitest's default is one worker fewer than the cores, which on a
    // two-core CI runner means a single worker and a serial suite. CI gets
    // every core; locally the default stays, because the machine is often
    // shared with other work.
    ...(process.env.CI ? { maxWorkers: availableParallelism() } : {}),
    // .tsx too: a component whose whole subject is interaction reads far
    // better as JSX than as nested createElement calls.
    //
    // `*.statistical.test.ts` files hold distribution checks over tens of
    // thousands of simulated seasons, players or careers (leak independence,
    // rail saturation, criterion calibration). v8 coverage instrumentation
    // slowed them three to six times (season-form-criterion 47 s -> 197 s,
    // analyst-report's independence block 23 s -> 145 s) while the engine
    // code they run is covered by the unit tests anyway. `pnpm test:coverage`
    // therefore excludes them and `pnpm test:statistical` runs them
    // uninstrumented; `pnpm test` and `pnpm verify` run both. A file earns
    // the suffix by its subject - a sampled property - never by being slow.
    // `include` lives in the projects below: with `extends: true` a project's
    // include is added to the root one, so a root include would put every
    // file into the isolated project as well.
    setupFiles: ["tests/browser-stubs.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "engine",
          include: [TEST_FILES],
          exclude: [...configDefaults.exclude, ...ISOLATED_TEST_FILES],
          isolate: false,
        },
      },
      { extends: true, test: { name: "isolated", include: ISOLATED_TEST_FILES } },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary"],
      // Engine only: coverage thresholds on the UI layer produce tests written
      // for the metric rather than for the
      // behaviour, and the DOM-parity test already covers the UI where it
      // matters. The engine is the opposite case: it is where a wrong number
      // hides without anything crashing.
      include: ["src/logic/**", "src/data/**"],
      // Set about two points under what the engine actually has (lines / functions /
      // branches / statements 98.1 / 98.7 / 91.1 / 97.3, remeasured
      // 2026-09-24; 97.9 / 97.0 / 88.7 / 97.0 when first measured on
      // 2026-08-17), not at an 80% floor. A threshold of 80 against a real
      // 98 would let a
      // third of the engine stop being tested without complaining - the point
      // of the number is to protect what exists, and the floor was written
      // when none of it did. Raise these when the real figure rises, keeping
      // the two-point margin so a small helper does not force a test written
      // for the metric; do not lower them to make a run pass.
      thresholds: { lines: 96, functions: 96, branches: 89, statements: 95 },
    },
  },
});
