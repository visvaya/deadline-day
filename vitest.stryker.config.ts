import { defineConfig } from "vitest/config";

// Mutation testing runs every covering test once per mutant, so it takes only the engine unit tests:
// no UI, golden replays, scripts or sampled `*.statistical.test.ts` distribution checks.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/logic/**/*.test.ts", "tests/rng.test.ts"],
    exclude: ["**/*.statistical.test.ts"],
    setupFiles: ["tests/browser-stubs.ts"],
    // Instrumented code runs several times slower than the plain suite.
    testTimeout: 60_000,
  },
});
