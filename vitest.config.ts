import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The adapter tests spawn real `tsc` processes and `tsImport()` fixture
    // projects — one worker per CPU oversubscribes memory on a small dev box
    // and starves them into timeouts. Half the CPUs plus a budget that fits a
    // real tsc spawn keeps them honest without hiding an actual hang. CI
    // runners aren't memory-starved, so they keep the full worker count.
    maxWorkers: process.env.CI ? undefined : "50%",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**"],
      exclude: ["src/cli.ts", "src/cli/run.ts"],
    },
  },
});
