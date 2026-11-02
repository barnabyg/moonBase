import { defineConfig } from "vitest/config";

// A timeout is there to stop a test that hangs, not to judge its speed. Vitest's
// 5 s default failed the longest scenario tests on CI, whose runners' speed
// varies a lot from one run to the next. docs/verification.md has the slowest
// times seen against this limit.
const timeoutMs = 120_000;

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: timeoutMs,
    hookTimeout: timeoutMs,
    // In CI, stop at the first failure rather than play out the rest of the
    // run first, as the end-to-end tests do (see docs/verification.md). Local
    // runs still report every failure.
    bail: process.env["CI"] ? 1 : 0,
  },
});
