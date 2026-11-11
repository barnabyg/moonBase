// Fullscreen in the desktop app: F11 and the top bar's Full screen button
// toggle the window's own fullscreen, and Escape, which closes the game's
// screens and cancels placing a Structure, never leaves it.
//
// A fullscreen window covers the screen of whoever runs the tests, so each
// test leaves fullscreen as it ends, pass or fail.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ElectronApplication, Page } from "@playwright/test";
import { catalogue } from "../../src/catalogue";
import { structureEntries, structurePopUp } from "../base-panel";
import { expect, stubDialog, test } from "./fixtures";

const samples = fileURLToPath(new URL("../../test/saves/", import.meta.url));

async function isFullScreen(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(
    ({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isFullScreen() ?? false,
  );
}

async function leaveFullScreen(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isFullScreen()) window.setFullScreen(false);
    }
  });
}

/**
 * Presses F11 as the keyboard does, through the window's input, where the
 * main process catches it. Playwright's own key presses go straight to the
 * page, past the main process, so they can't stand in for it.
 */
async function pressF11(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    contents?.sendInputEvent({ type: "keyDown", keyCode: "F11" });
    contents?.sendInputEvent({ type: "keyUp", keyCode: "F11" });
  });
}

function fullScreenButton(page: Page) {
  return page
    .getByRole("region", { name: "Game controls" })
    .getByRole("button", { name: "Full screen" });
}

/** Loads `path` with the Load button, the open dialog answering it. */
async function load(
  app: ElectronApplication,
  page: Page,
  path: string,
): Promise<void> {
  await stubDialog(app, "showOpenDialog", {
    canceled: false,
    filePaths: [path],
  });
  await page.getByRole("button", { name: "Load", exact: true }).click();
}

test.afterEach(async ({ electronApp }) => {
  await leaveFullScreen(electronApp);
});

test("F11 and the Full screen button each enter and leave fullscreen, and the button shows which the window is in", async ({
  electronApp,
  window,
  consoleErrors,
}) => {
  const button = fullScreenButton(window);
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect(await isFullScreen(electronApp)).toBe(false);

  await pressF11(electronApp);
  await expect.poll(() => isFullScreen(electronApp)).toBe(true);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await pressF11(electronApp);
  await expect.poll(() => isFullScreen(electronApp)).toBe(false);
  await expect(button).toHaveAttribute("aria-pressed", "false");

  await button.click();
  await expect.poll(() => isFullScreen(electronApp)).toBe(true);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  // The page fills the screen.
  const [screen, page] = await Promise.all([
    electronApp.evaluate(
      ({ screen }) => screen.getPrimaryDisplay().bounds.width,
    ),
    window.evaluate(() => innerWidth),
  ]);
  expect(page).toBe(screen);
  await button.click();
  await expect.poll(() => isFullScreen(electronApp)).toBe(false);
  await expect(button).toHaveAttribute("aria-pressed", "false");

  // Left by something other than the button or F11, the button follows.
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setFullScreen(true);
  });
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setFullScreen(false);
  });
  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect(consoleErrors).toEqual([]);
});

test("in fullscreen, Escape closes what it closes, and never leaves fullscreen", async ({
  electronApp,
  window,
  consoleErrors,
}, testInfo) => {
  const escape = async (): Promise<void> => {
    await window.keyboard.press("Escape");
    expect(await isFullScreen(electronApp)).toBe(true);
  };
  await expect(
    window.getByRole("status", { name: "Game clock" }),
  ).toBeVisible();
  // Paused before anything else, and kept paused through the load (a loaded
  // Campaign keeps the speed): the save below reaches its last Milestone in
  // its first game-minute played, and that celebration must come only when
  // the test skips to it, not while a slow step lets game time pass.
  const pause = window.getByRole("button", { name: "Pause" });
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  await fullScreenButton(window).click();
  await expect.poll(() => isFullScreen(electronApp)).toBe(true);

  // With nothing open.
  await escape();

  // A base with a battery bank, with every Milestone reached but power
  // storage, which the first game-minute played reaches, so the celebration
  // that every Milestone is reached comes with the skip below.
  const save = JSON.parse(
    await readFile(join(samples, "version-40.moonbase"), "utf8"),
  ) as { state: { reachedMilestoneIds: readonly string[] } };
  save.state.reachedMilestoneIds = catalogue.milestones
    .map(({ id }) => id)
    .filter((id) => id !== "power-storage");
  const milestones = testInfo.outputPath("milestones.moonbase");
  await writeFile(milestones, JSON.stringify(save));
  await load(electronApp, window, milestones);
  await expect(structureEntries(window).first()).toBeVisible();
  await expect(pause).toHaveAttribute("aria-pressed", "true");

  // The structure pop-up.
  await structureEntries(window).first().getByRole("button").first().click();
  const popUp = structurePopUp(window);
  await expect(popUp).toBeVisible();
  await escape();
  await expect(popUp).toBeHidden();

  // Placing a Structure from the build menu.
  const solarArray = window
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Solar array/ });
  await solarArray.click();
  await expect(solarArray).toHaveAttribute("aria-pressed", "true");
  await escape();
  await expect(solarArray).toHaveAttribute("aria-pressed", "false");

  // A screen opened from the top bar.
  await window.getByRole("button", { name: "Guide" }).click();
  const guide = window.getByRole("dialog", { name: "Guide" });
  await expect(guide).toBeVisible();
  await escape();
  await expect(guide).toBeHidden();

  // The celebration.
  await window.getByRole("button", { name: "Skip to next event" }).click();
  const celebration = window.getByRole("dialog", { name: "Ready for Crew" });
  await expect(celebration).toBeVisible();
  await escape();
  await expect(celebration).toBeHidden();

  // The game-over screen, which stays, as nothing can go on after a death.
  await load(electronApp, window, join(samples, "version-1-ended.moonbase"));
  const gameOver = window.getByRole("dialog", { name: "Game over" });
  await expect(gameOver).toBeVisible();
  await escape();
  await escape();
  await expect(gameOver).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
