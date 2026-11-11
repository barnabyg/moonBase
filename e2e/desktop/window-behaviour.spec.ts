// The desktop window behaves like a game rather than a browser: no menu bar,
// and no developer tools in the production build.
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
