import { defineConfig } from "vitest/config";

// A timeout is there to stop a test that hangs, not to judge its speed (see
// docs/verification.md). The longest scenario tests take up to about 12 s on
// CI; Vitest's 5 s default failed them there. 120 s is ten times the slowest
// seen in CI, as the runners' speed varies a lot from one run to the next.
const timeoutMs = 120_000;

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: timeoutMs,
    hookTimeout: timeoutMs,
  },
});
