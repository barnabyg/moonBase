import { defineConfig } from "vitest/config";

// A timeout is there to stop a test that hangs, not to judge its speed (see
// docs/verification.md). The longest scenario tests take about 1 s locally
// and up to about 6 s on CI, which runs Vitest about 2.5 times slower than a
// developer machine; Vitest's 5 s default failed them there. 60 s is ten times
// the slowest seen in CI.
const timeoutMs = 60_000;

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: timeoutMs,
    hookTimeout: timeoutMs,
  },
});
