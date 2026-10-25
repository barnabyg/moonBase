import { defineConfig, devices } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env["CI"],
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
  },
  // Desktop Firefox is the only supported target (ADR-0004).
  projects: [{ name: "firefox", use: { ...devices["Desktop Firefox"] } }],
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env["CI"],
  },
});
