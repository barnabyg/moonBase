// Closing the desktop app's window, or quitting, with unsaved progress asks
// whether to save it first; with none, it closes at once. The message box and
// the save dialog are stubbed, as a test can't click them.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ElectronApplication, Page } from "@playwright/test";
import { loadCampaign } from "../../src/simulation";
import { formatClock } from "../../src/ui/format";
import {
  closeWindow,
  dialogCalls,
  exitCode,
  expect,
  hasExited,
  stubDialog,
  test,
} from "./fixtures";

const samples = fileURLToPath(new URL("../../test/saves/", import.meta.url));

const buttons = { save: 0, dontSave: 1, cancel: 2 } as const;

function clock(page: Page) {
  return page.getByRole("status", { name: "Game clock" });
}

/** Lets some game time pass, then pauses, so the Campaign has unsaved progress. */
async function makeProgress(page: Page): Promise<string> {
  await expect(clock(page)).toBeVisible();
  const before = await clock(page).textContent();
  await page.getByRole("button", { name: "20x" }).click();
  await expect(clock(page)).not.toHaveText(before ?? "");
  await page.getByRole("button", { name: "Pause" }).click();
  return (await clock(page).textContent()) ?? "";
}

async function answerQuestion(
  app: ElectronApplication,
  response: number,
): Promise<void> {
  await stubDialog(app, "showMessageBox", { response, checkboxChecked: false });
}

/** Waits for the question before closing to have been asked `times` times. */
async function asked(app: ElectronApplication, times: number): Promise<void> {
  await expect
    .poll(() => dialogCalls(app, "showMessageBox"))
    .toHaveLength(times);
}

/** The window is open and the game in it still runs. */
async function stillPlaying(
  app: ElectronApplication,
  page: Page,
): Promise<void> {
  expect(hasExited(app)).toBe(false);
  expect(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
    ),
  ).toBe(1);
  await makeProgress(page);
}

test("with unsaved progress, closing asks whether to save first, and Save writes the save through the save dialog, then closes", async ({
  electronApp,
  window,
  consoleErrors,
}, testInfo) => {
  const shown = await makeProgress(window);
  const path = testInfo.outputPath("closing.moonbase");
  await answerQuestion(electronApp, buttons.save);
  await stubDialog(electronApp, "showSaveDialog", {
    canceled: false,
    filePath: path,
  });

  await closeWindow(electronApp);

  expect(await exitCode(electronApp)).toBe(0);
  const [question] = await dialogCalls(electronApp, "showMessageBox");
  expect(question).toMatchObject({
    message: "Save the Campaign before closing?",
    buttons: ["Save", "Don't save", "Cancel"],
    defaultId: buttons.save,
    cancelId: buttons.cancel,
  });
  const [options] = await dialogCalls(electronApp, "showSaveDialog");
  expect((options as { defaultPath: string }).defaultPath).toMatch(
    /\\moon-base-earth-day-\d+-\d{4}\.moonbase$/,
  );
  expect(existsSync(path)).toBe(true);
  const saved = loadCampaign(await readFile(path, "utf8"));
  if (!saved.ok) throw new Error(saved.message);
  expect(formatClock(saved.campaign.snapshot().clock)).toBe(shown);
  expect(consoleErrors).toEqual([]);
});

test("Save, then cancelling the save dialog, keeps the window open, and closing again asks again", async ({
  electronApp,
  window,
  consoleErrors,
}) => {
  await makeProgress(window);
  await answerQuestion(electronApp, buttons.save);
  await stubDialog(electronApp, "showSaveDialog", {
    canceled: true,
    filePath: "",
  });

  await closeWindow(electronApp);
  await expect
    .poll(() => dialogCalls(electronApp, "showSaveDialog"))
    .toHaveLength(1);

  await stillPlaying(electronApp, window);
  await answerQuestion(electronApp, buttons.dontSave);
  await closeWindow(electronApp);
  expect(await exitCode(electronApp)).toBe(0);
  await asked(electronApp, 1);
  expect(consoleErrors).toEqual([]);
});

test("Don't save closes without saving", async ({
  electronApp,
  window,
  consoleErrors,
}) => {
  await makeProgress(window);
  await answerQuestion(electronApp, buttons.dontSave);
  await stubDialog(electronApp, "showSaveDialog", {
    canceled: true,
    filePath: "",
  });

  await closeWindow(electronApp);

  expect(await exitCode(electronApp)).toBe(0);
  await asked(electronApp, 1);
  expect(await dialogCalls(electronApp, "showSaveDialog")).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("the top bar's Exit button closes as the window's X does, in fullscreen too: Cancel keeps the window open, and Don't save closes", async ({
  electronApp,
  window,
  consoleErrors,
}) => {
  const exit = window
    .getByRole("region", { name: "Game controls" })
    .getByRole("button", { name: "Exit" });
  await window
    .getByRole("region", { name: "Game controls" })
    .getByRole("button", { name: "Full screen" })
    .click();
  await expect
    .poll(() =>
      electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.isFullScreen(),
      ),
    )
    .toBe(true);
  await makeProgress(window);
  await answerQuestion(electronApp, buttons.cancel);

  await exit.click();
  await asked(electronApp, 1);

  await stillPlaying(electronApp, window);
  await answerQuestion(electronApp, buttons.dontSave);
  await exit.click();
  expect(await exitCode(electronApp)).toBe(0);
  // Stubbing the question again started its log afresh.
  await asked(electronApp, 1);
  expect(await dialogCalls(electronApp, "showSaveDialog")).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("Cancel keeps the window open, and closing again while the question is open asks it once", async ({
  electronApp,
  window,
  consoleErrors,
}) => {
  await makeProgress(window);
  // The player takes a moment to answer, while the window is closed again.
  await stubDialog(
    electronApp,
    "showMessageBox",
    { response: buttons.cancel, checkboxChecked: false },
    { delayMs: 500 },
  );

  await closeWindow(electronApp);
  await closeWindow(electronApp);
  await asked(electronApp, 1);

  await stillPlaying(electronApp, window);
  expect(await dialogCalls(electronApp, "showMessageBox")).toHaveLength(1);
  expect(consoleErrors).toEqual([]);
});

test("quitting with unsaved progress asks too: Cancel keeps the app running, and Don't save quits", async ({
  electronApp,
  window,
  consoleErrors,
}) => {
  const quit = () =>
    electronApp.evaluate(({ app }) => {
      app.quit();
    });
  await makeProgress(window);
  await answerQuestion(electronApp, buttons.cancel);

  await quit();
  await asked(electronApp, 1);
  await stillPlaying(electronApp, window);

  await answerQuestion(electronApp, buttons.dontSave);
  await quit().catch(() => {
    // The app may be gone before the evaluation answers.
  });
  expect(await exitCode(electronApp)).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test("just after saving with the Save button, closing doesn't ask", async ({
  electronApp,
  window,
  consoleErrors,
}, testInfo) => {
  await makeProgress(window);
  const path = testInfo.outputPath("saved.moonbase");
  await stubDialog(electronApp, "showSaveDialog", {
    canceled: false,
    filePath: path,
  });
  await window.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => existsSync(path)).toBe(true);

  await closeWindow(electronApp);

  expect(await exitCode(electronApp)).toBe(0);
  expect(await dialogCalls(electronApp, "showMessageBox")).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("just after loading a Campaign, and on the game-over screen, closing doesn't ask", async ({
  launchApp,
  consoleErrors,
}) => {
  for (const name of ["version-40.moonbase", "version-1-ended.moonbase"]) {
    const app = await launchApp();
    const page = await app.firstWindow();
    await makeProgress(page);
    await stubDialog(app, "showOpenDialog", {
      canceled: false,
      filePaths: [join(samples, name)],
    });
    // Paused, so the Campaign loaded doesn't go on.
    await page.getByRole("button", { name: "Load", exact: true }).click();
    if (name.includes("ended")) {
      await expect(
        page.getByRole("dialog", { name: "Game over" }),
      ).toBeVisible();
    } else {
      const sample = loadCampaign(await readFile(join(samples, name), "utf8"));
      if (!sample.ok) throw new Error(sample.message);
      await expect(clock(page)).toHaveText(
        formatClock(sample.campaign.snapshot().clock),
      );
    }

    await closeWindow(app);

    expect(await exitCode(app), name).toBe(0);
    expect(await dialogCalls(app, "showMessageBox"), name).toEqual([]);
  }
  expect(consoleErrors).toEqual([]);
});
