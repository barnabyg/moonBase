import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets two checkouts (such as git worktrees) run their end-to-end
// tests at once: each starts its own dev server rather than reusing another's.
const port = Number(process.env["E2E_PORT"] ?? 4173);
// Headless Firefox on a GPU-less Linux machine can't create an OpenGL
// context, so CI runs Firefox with a window inside a virtual X display
// (see .github/workflows/verify.yml).
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
  // Firefox windows sharing one software-rendered display hold back each
  // other's animation frames: in CI, with two workers, one test's page went
  // up to 28 s without a frame while its timers ran on time, and the game
  // only updates what it shows once a frame. One worker is no slower there
  // overall, as both contend for the same CPUs. Headless runs keep Playwright's
  // default of half the CPU cores.
  workers: headed ? 1 : "50%",
  reporter: "list",
  // A timeout is there to stop a test that hangs, not to judge its speed (see
  // docs/verification.md). In CI the slowest test takes about 26 s, and
  // the longest single wait is about 8 s, for a refusal that hides after a
  // fixed 8 s. Each limit is about seven times those or more.
  timeout: 300_000,
  expect: { timeout: 60_000 },
  use: {
    baseURL: `http://localhost:${port}`,
    headless: !headed,
    // Beside the page snapshot a failure leaves anyway, as CI keeps them.
    screenshot: "only-on-failure",
  },
  // Desktop Firefox is the only supported target (ADR-0004).
  projects: [
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: {
          firefoxUserPrefs: {
            // Firefox's graphics blocklist refuses WebGL2 on the software
            // renderer of GPU-less machines such as the CI runner
            // ("AllowWebgl2:false"). Tests need the 3D view, so bypass it.
            "webgl.force-enabled": true,
            // On Linux, use Mesa through GLX rather than EGL. The CI runner
            // image ships Mesa's GLX libraries but not its EGL ones, so this
            // spares CI an apt-get install. No effect on Windows.
            "gfx.x11-egl.force-disabled": true,
          },
        },
      },
    },
  ],
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env["CI"],
  },
});
