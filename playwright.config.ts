import { availableParallelism } from "node:os";
import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets two checkouts (such as git worktrees) run their end-to-end
// tests at once: each starts its own dev server rather than reusing another's.
const port = Number(process.env["E2E_PORT"] ?? 4173);
// One address for both the dev server and the browser: Vite binds
// "localhost" to ::1 alone on Windows.
const host = "127.0.0.1";
// PLAYWRIGHT_HEADED=1 shows the browser's windows, to watch a test.
const headed = process.env["PLAYWRIGHT_HEADED"] === "1";
// E2E_SHARD, such as "2/4", runs that share of the tests, so CI can spread them
// over several runners (see docs/verification.md).
const shard = /^(\d+)\/(\d+)$/.exec(process.env["E2E_SHARD"] ?? "");

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env["CI"],
  retries: 0,
  shard: shard && { current: Number(shard[1]), total: Number(shard[2]) },
  // In CI, stop at the first failure and report it, rather than making whoever
  // is waiting sit through every remaining test first (see
  // docs/verification.md). Local runs still try them all.
  maxFailures: process.env["CI"] ? 1 : 0,
  // Headed windows on one display can hold back each other's animation
  // frames, and the game only updates what it shows once a frame, so headed
  // runs use one worker. Headless runs use half the CPU cores, but no more
  // than 4: each page makes a WebGL context as the game starts, and with 8 or
  // 10 starting at once on a developer's PC some pages stalled for minutes
  // before they loaded (see docs/verification.md).
  workers: headed
    ? 1
    : Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2))),
  reporter: "list",
  // A timeout is there to stop a test that hangs, not to judge its speed.
  // docs/verification.md has the slowest times seen in CI against each limit.
  timeout: 300_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL: `http://${host}:${port}`,
    headless: !headed,
    // Beside the page snapshot a failure leaves anyway, as CI keeps them.
    screenshot: "only-on-failure",
  },
  // Chromium, the desktop app's engine, runs the tests in e2e/ against the dev
  // server, as a quick stand-in for the desktop window (ADR-0010). The electron project runs those in e2e/desktop/ against
  // the desktop app's production build, which desktop-build makes first. Pick
  // one with --project.
  projects: [
    {
      name: "desktop-build",
      testDir: "e2e/desktop",
      testMatch: "build.setup.ts",
    },
    {
      name: "electron",
      testDir: "e2e/desktop",
      // Each test launches its own app with its own user-data folder, so the
      // tests in a file can run side by side too.
      fullyParallel: true,
      dependencies: ["desktop-build"],
    },
    {
      // The packaged app that npm run package:win unpacks into
      // release/win-unpacked/, the files the installer installs. Its test is
      // skipped until that has been built (see docs/desktop-release.md).
      name: "packaged",
      testDir: "e2e/packaged",
    },
    {
      name: "chromium",
      testIgnore: ["desktop/**", "packaged/**"],
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Headless Chromium draws WebGL in software (SwiftShader) unless
          // told to use the GPU, and on a developer's PC that made tests up
          // to five times slower. CI has no GPU, so it keeps
          // SwiftShader, which Playwright enables with
          // --enable-unsafe-swiftshader: headless, with no display needed.
          // Set CI=1 to draw in software locally as CI does.
          args: process.env["CI"] ? [] : ["--enable-gpu"],
        },
      },
    },
  ],
  webServer: {
    command: `npx vite --host ${host} --port ${port} --strictPort`,
    url: `http://${host}:${port}`,
    reuseExistingServer: !process.env["CI"],
  },
});
