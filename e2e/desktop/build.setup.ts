// Builds the desktop app (`npm run build:desktop`: dist/ and dist-electron/)
// before the electron project's tests launch it, so they never test a stale
// build. It takes a few seconds. playwright.config.ts makes the electron
// project depend on it; `--no-deps` skips it when the build is known current.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test as setup } from "@playwright/test";

setup("build the desktop app", () => {
  // One command string, so the shell can find npm.cmd on Windows.
  const build = spawnSync("npm run --silent build:desktop", {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    shell: true,
    encoding: "utf8",
  });
  if (build.status !== 0) {
    throw new Error(
      `npm run build:desktop failed:\n${build.stdout}\n${build.stderr}`,
    );
  }
});
