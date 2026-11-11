// The desktop window behaves like a game rather than a browser: no menu bar
// and no developer tools in the production build, one game at a time, and
// outside links open in the player's default browser.
import type { ElectronApplication } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Presses a key as the keyboard does, through the window's input. */
async function press(
  app: ElectronApplication,
  keyCode: string,
  modifiers: ("control" | "shift")[] = [],
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, { keyCode, modifiers }) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents;
      contents?.sendInputEvent({ type: "keyDown", keyCode, modifiers });
      contents?.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    },
    { keyCode, modifiers },
  );
}

test("the production build has no menu bar and no developer tools", async ({
  electronApp,
  window,
  consoleErrors,
}) => {
  await expect(
    window.getByRole("status", { name: "Game clock" }),
  ).toBeVisible();

  const shown = await electronApp.evaluate(({ BrowserWindow, Menu }) => {
    const [game] = BrowserWindow.getAllWindows();
    if (game === undefined) throw new Error("No window is open.");
    const contents = game.webContents;
    // Not even when asked for directly.
    contents.openDevTools();
    return {
      applicationMenu: Menu.getApplicationMenu(),
      devToolsOpen: contents.isDevToolsOpened(),
    };
  });
  expect(shown).toEqual({ applicationMenu: null, devToolsOpen: false });

  await press(electronApp, "F12");
  await press(electronApp, "I", ["control", "shift"]);
  // Alt would show a hidden menu bar, if there were one.
  await press(electronApp, "Alt");
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => {
        const [game] = BrowserWindow.getAllWindows();
        return {
          devToolsOpen: game?.webContents.isDevToolsOpened(),
          menuBarVisible: game?.isMenuBarVisible(),
        };
      }),
    )
    .toEqual({ devToolsOpen: false, menuBarVisible: false });
  expect(consoleErrors).toEqual([]);
});

test("starting the game again while it runs brings the running game's window to the front, and opens no other", async ({
  electronApp,
  window,
  startAgain,
  consoleErrors,
}) => {
  await expect(
    window.getByRole("status", { name: "Game clock" }),
  ).toBeVisible();
  await electronApp.evaluate(({ BrowserWindow }) => {
    const [game] = BrowserWindow.getAllWindows();
    if (game === undefined) throw new Error("No window is open.");
    game.minimize();
    // Counts the times the window is focused.
    const focus = game.focus.bind(game);
    Reflect.set(globalThis, "focused", 0);
    game.focus = () => {
      Reflect.set(
        globalThis,
        "focused",
        Number(Reflect.get(globalThis, "focused")) + 1,
      );
      focus();
    };
  });
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.isMinimized(),
      ),
    )
    .toBe(true);

  // It quits at once, well before a game would have opened.
  expect(await startAgain(15_000)).toBe(0);

  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) => {
        const windows = BrowserWindow.getAllWindows();
        return {
          windows: windows.length,
          minimized: windows[0]?.isMinimized(),
          visible: windows[0]?.isVisible(),
          focused: Reflect.get(globalThis, "focused") as unknown,
        };
      }),
    )
    .toEqual({ windows: 1, minimized: false, visible: true, focused: 1 });
  await expect(
    window.getByRole("status", { name: "Game clock" }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("a link to an outside page opens in the default browser, never in the game's window", async ({
  electronApp,
  window,
  consoleErrors,
}) => {
  await expect(
    window.getByRole("status", { name: "Game clock" }),
  ).toBeVisible();
  // No real browser opens: shell.openExternal only notes what it was given.
  await electronApp.evaluate(({ shell }) => {
    const opened: string[] = [];
    Reflect.set(globalThis, "opened", opened);
    Reflect.set(shell, "openExternal", (url: string) => {
      opened.push(url);
      return Promise.resolve();
    });
  });
  const gameAddress = window.url();

  // The game has no outside links yet, so the test adds each in turn, and
  // clicks it as the player would. It does so from the main process, as
  // Playwright's page would wait on the navigation the main process stops.
  for (const [href, newWindow] of [
    ["https://example.com/moon", true],
    ["file:///C:/Windows/win.ini", false],
    ["https://example.com/base", false],
  ] as const) {
    await electronApp.evaluate(
      async ({ BrowserWindow }, { href, newWindow }) => {
        const contents = BrowserWindow.getAllWindows()[0]?.webContents;
        await contents?.executeJavaScript(
          `{
            const link = document.createElement("a");
            link.href = ${JSON.stringify(href)};
            ${newWindow ? 'link.target = "_blank";' : ""}
            document.body.append(link);
            link.click();
            link.remove();
          }`,
          true,
        );
      },
      { href, newWindow },
    );
  }

  await expect
    .poll(() =>
      electronApp.evaluate(() => Reflect.get(globalThis, "opened") as unknown),
    )
    .toEqual(["https://example.com/moon", "https://example.com/base"]);
  const after = await electronApp.evaluate(async ({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    const contents = windows[0]?.webContents;
    return {
      windows: windows.length,
      url: contents?.getURL(),
      // The game still runs in it.
      clock: (await contents?.executeJavaScript(
        `document.querySelector('[role="status"][aria-label="Game clock"]') !== null`,
      )) as unknown,
    };
  });
  expect(after).toEqual({ windows: 1, url: gameAddress, clock: true });
  // Chromium itself refuses the file, before the main process hears of it.
  expect(consoleErrors).toEqual([
    "Not allowed to load local resource: file:///C:/Windows/win.ini",
  ]);
});
