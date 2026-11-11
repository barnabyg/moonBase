import { availableParallelism } from "node:os";
import { defineConfig, devices } from "@playwright/test";

// E2E_PORT lets two checkouts (such as git worktrees) run their end-to-end
// tests at once: each starts its own dev server rather than reusing another's.
const port = Number(process.env["E2E_PORT"] ?? 4173);
// One address for both the dev server and Firefox. Vite binds "localhost" to
// ::1 alone on Windows, while Firefox tries both ::1 and 127.0.0.1 for it, so
// a page slow to connect fell back to 127.0.0.1, where nothing listens, and
// failed with NS_ERROR_CONNECTION_REFUSED, hiding why it was slow (see
// docs/verification.md).
const host = "127.0.0.1";
// Headless Firefox on a GPU-less Linux machine can't create an OpenGL
// context, so CI runs Firefox with a window inside a virtual X display
// (see .github/workflows/end-to-end.yml).
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
  // overall, as both contend for the same CPUs. Headless runs use half the CPU
  // cores, but no more than 4: each Firefox makes a WebGL context as the game
  // starts, and with 8 or 10 starting at once on a developer's PC some pages
  // stalled for minutes before they loaded (see docs/verification.md).
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
  // Firefox until the browser version is dropped, and Chromium, the engine of
  // the desktop app that replaces it (ADR-0010). Pick one with --project.
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
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Headless Chromium draws WebGL in software (SwiftShader) unless
          // told to use the GPU, and on a developer's PC that made tests up
          // to five times slower than Firefox's. CI has no GPU, so it keeps
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
