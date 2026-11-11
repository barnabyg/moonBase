// The desktop window opens where and as the player left it: its size,
// position, and whether it was maximised or full screen, kept in the
// user-data folder's window-state.json. One left off every screen opens on
// the primary screen instead.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ElectronApplication } from "@playwright/test";
import type { Rectangle } from "../../electron/window-state";
import { closeWindow, exitCode, expect, test } from "./fixtures";

interface Shown {
  readonly visible: boolean;
  readonly bounds: Rectangle;
  readonly normalBounds: Rectangle;
  readonly contentSize: readonly number[];
  readonly maximized: boolean;
  readonly fullScreen: boolean;
}

/** How the game window is shown now. */
async function shown(app: ElectronApplication): Promise<Shown> {
  return app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    if (window === undefined) throw new Error("No window is open.");
    return {
      visible: window.isVisible(),
      bounds: window.getBounds(),
      normalBounds: window.getNormalBounds(),
      contentSize: window.getContentSize(),
      maximized: window.isMaximized(),
      fullScreen: window.isFullScreen(),
    };
  });
}

/** Launches the app and waits for its window to be shown. */
async function launched(
  launchApp: () => Promise<ElectronApplication>,
): Promise<ElectronApplication> {
  const app = await launchApp();
  await app.firstWindow();
  await expect.poll(async () => (await shown(app)).visible).toBe(true);
  return app;
}

async function closed(app: ElectronApplication): Promise<void> {
  // Never leave a window covering the screen, even if the close fails.
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isFullScreen()) window.setFullScreen(false);
    }
  });
  await closeWindow(app);
  expect(await exitCode(app)).toBe(0);
}

/**
 * Whether a page size is `expected`, give or take the pixel or two that
 * rounding to the screen's scale, such as 125%, can add or take away.
 */
function near(size: readonly number[], expected: readonly number[]): boolean {
  return expected.every(
    (length, index) => Math.abs((size[index] ?? 0) - length) <= 2,
  );
}

/** The primary screen's work area: the screen less the taskbar. */
async function primaryWorkArea(app: ElectronApplication): Promise<Rectangle> {
  return app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
}

/** A size and place that fits any primary screen the tests run on. */
function somewhere(area: Rectangle): Rectangle {
  return {
    x: area.x + 60,
    y: area.y + 40,
    width: Math.min(1500, area.width - 100),
    height: Math.min(830, area.height - 60),
  };
}

test("the window opens again at the size and place it was left, maximised or full screen if it was", async ({
  launchApp,
  userDataDir,
  consoleErrors,
}) => {
  const first = await launched(launchApp);
  const bounds = somewhere(await primaryWorkArea(first));
  await first.evaluate(({ BrowserWindow }, to) => {
    BrowserWindow.getAllWindows()[0]?.setBounds(to);
  }, bounds);
  await expect.poll(async () => (await shown(first)).bounds).toEqual(bounds);
  await closed(first);
  expect(
    JSON.parse(await readFile(join(userDataDir, "window-state.json"), "utf8")),
  ).toEqual({ bounds, maximized: false, fullScreen: false });

  const second = await launched(launchApp);
  expect(await shown(second)).toMatchObject({
    bounds,
    maximized: false,
    fullScreen: false,
  });
  await second.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.maximize();
  });
  await expect.poll(async () => (await shown(second)).maximized).toBe(true);
  await closed(second);

  const third = await launched(launchApp);
  await expect.poll(async () => (await shown(third)).maximized).toBe(true);
  expect((await shown(third)).normalBounds).toEqual(bounds);
  await third.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window?.unmaximize();
    window?.setFullScreen(true);
  });
  await expect.poll(async () => (await shown(third)).fullScreen).toBe(true);
  // Closed in fullscreen, not through closed(), which would leave it first.
  await closeWindow(third);
  expect(await exitCode(third)).toBe(0);

  const fourth = await launched(launchApp);
  try {
    await expect.poll(async () => (await shown(fourth)).fullScreen).toBe(true);
    await fourth.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setFullScreen(false);
    });
    await expect.poll(async () => (await shown(fourth)).bounds).toEqual(bounds);
  } finally {
    await closed(fourth);
  }
  expect(consoleErrors).toEqual([]);
});

test("a window left on a screen that has gone opens on the primary screen, at its size", async ({
  launchApp,
  userDataDir,
}) => {
  // Far to the right of any desktop the tests run on.
  const size = { width: 1400, height: 800 };
  await writeFile(
    join(userDataDir, "window-state.json"),
    JSON.stringify({
      bounds: { x: 50_000, y: 200, ...size },
      maximized: false,
      fullScreen: false,
    }),
  );

  const app = await launched(launchApp);

  const area = await primaryWorkArea(app);
  const { bounds } = await shown(app);
  expect(bounds).toMatchObject({
    width: Math.min(size.width, area.width),
    height: Math.min(size.height, area.height),
  });
  expect(bounds.x).toBeGreaterThanOrEqual(area.x);
  expect(bounds.y).toBeGreaterThanOrEqual(area.y);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(area.x + area.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(area.y + area.height);
  await closed(app);
});

test("a damaged window state is ignored, and the page is never smaller than 1366 x 660", async ({
  launchApp,
  userDataDir,
  consoleErrors,
}) => {
  await writeFile(join(userDataDir, "window-state.json"), "{ not json");

  const app = await launched(launchApp);

  const area = await primaryWorkArea(app);
  const opened = await shown(app);
  expect(opened.fullScreen).toBe(false);
  // As on a first run: 1600 x 900 where the screen has room for it.
  if (area.width >= 1616 && area.height >= 940) {
    expect(near(opened.contentSize, [1600, 900])).toBe(true);
  }
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window?.unmaximize();
    // As a player drags its frame.
    window?.setSize(800, 600);
  });
  await expect
    .poll(async () => near((await shown(app)).contentSize, [1366, 660]))
    .toBe(true);
  await closed(app);
  expect(consoleErrors).toEqual([]);
});
