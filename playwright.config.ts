import { defineConfig, devices } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env["CI"],
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    // Headless Firefox on a GPU-less Linux machine can't create an OpenGL
    // context, so CI runs Firefox with a window inside a virtual X display
    // (see .github/workflows/verify.yml).
    headless: process.env["PLAYWRIGHT_HEADED"] !== "1",
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
    stdout: "pipe",
  },
});
