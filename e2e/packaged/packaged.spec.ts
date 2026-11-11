// A smoke test of the packaged app: the Moon Base.exe that `npm run
// package:win` unpacks into release/win-unpacked/, the same files the
// installer installs. It is skipped until that has been built, and tests
// only what packaging can break: the app starts from its app.asar, draws the
// game, carries package.json's version, and, being packaged, ignores the
// variables that point a development run elsewhere.
//
// A packaged app ignores MOONBASE_USER_DATA_DIR, so each launch is given a
// user-data folder of its own with Chromium's --user-data-dir switch, which
// Electron honours too; without it the app would use the player's own,
// %APPDATA%\moon-base.
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron, expect, test } from "@playwright/test";
import { gameUrl, stubDialogsToClose } from "../desktop/fixtures";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const executable = join(root, "release", "win-unpacked", "Moon Base.exe");

test.skip(
  !existsSync(executable),
  "No packaged app in release/win-unpacked; run npm run package:win first.",
);

test("the packaged app starts, draws the game and ignores the development variables", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "moonbase-packaged-"));
  // Where MOONBASE_USER_DATA_DIR points; a packaged app leaves it empty.
  const ignoredDir = await mkdtemp(join(tmpdir(), "moonbase-ignored-"));
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) env[name] = value;
  }
  delete env["ELECTRON_RUN_AS_NODE"];
  const app = await _electron.launch({
    executablePath: executable,
    // CI's runner has no GPU, so WebGL draws in software there; see
    // e2e/desktop/fixtures.ts.
    args: [
      `--user-data-dir=${userDataDir}`,
      ...(process.env["CI"] ? ["--enable-unsafe-swiftshader"] : []),
    ],
    env: {
      ...env,
      // Nothing listens there: a development run would show an error page.
      MOONBASE_DEV_SERVER_URL: "http://127.0.0.1:9/",
      MOONBASE_USER_DATA_DIR: ignoredDir,
      MOONBASE_E2E: "1",
    },
  });
  const errors: string[] = [];
  app.on("console", (message) => {
    if (message.type() === "error") errors.push(`main: ${message.text()}`);
  });
  try {
    // A real dialog would wait on the desktop if closing asked to save.
    await stubDialogsToClose(app);
    const window = await app.firstWindow();
    window.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    window.on("pageerror", (error) => errors.push(error.message));
    await window.waitForLoadState("load");

    const packageJson = JSON.parse(
      await readFile(join(root, "package.json"), "utf8"),
    ) as { version: string };
    expect(
      await app.evaluate(({ app }) => ({
        packaged: app.isPackaged,
        version: app.getVersion(),
        userData: app.getPath("userData"),
        fromAsar: app.getAppPath().endsWith("app.asar"),
      })),
    ).toEqual({
      packaged: true,
      version: packageJson.version,
      userData: userDataDir,
      fromAsar: true,
    });

    expect(window.url()).toBe(gameUrl());
    await expect(window).toHaveTitle("Moon Base");
    await expect(window.getByRole("status", { name: "Game clock" })).toHaveText(
      /^Earth Day 1, /,
    );
    expect(errors).toEqual([]);
    await expect(window.locator("canvas")).toBeVisible();
    expect(
      await window
        .locator("canvas")
        .evaluate((canvas: HTMLCanvasElement) =>
          canvas.getContext("webgl2")?.isContextLost(),
        ),
    ).toBe(false);
    expect(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().map((each) => ({
          visible: each.isVisible(),
          devTools: each.webContents.isDevToolsOpened(),
        })),
      ),
    ).toEqual([{ visible: true, devTools: false }]);
    expect(await readdir(ignoredDir)).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await stubDialogsToClose(app).catch(() => undefined);
    await app.close();
    // Chromium can hold files in it for a moment after the app exits.
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 10 });
    await rm(ignoredDir, { recursive: true, force: true, maxRetries: 10 });
  }
});
