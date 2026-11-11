// Saving and loading in the desktop app, with the operating system's save
// and open dialogs (ADR-0006). A test can't click those dialogs, so each one
// is stubbed to answer with a file in the test's own output folder.
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ElectronApplication,
  Locator,
  Page,
  TestInfo,
} from "@playwright/test";
import type { DesktopBridge } from "../../electron/save-bridge";
import { loadCampaign } from "../../src/simulation";
import { formatClock } from "../../src/ui/format";
import {
  closeWindow,
  dialogCalls,
  exitCode,
  expect,
  stubDialog,
  test,
} from "./fixtures";

const samples = fileURLToPath(new URL("../../test/saves/", import.meta.url));

/** Every sample save, oldest format version first, the ended Campaign last. */
async function sampleSaves(): Promise<string[]> {
  const version = (name: string): number =>
    name.includes("ended")
      ? Infinity
      : Number(/^version-(\d+)\.moonbase$/.exec(name)?.[1]);
  return (await readdir(samples))
    .filter((name) => name.endsWith(".moonbase"))
    .sort((a, b) => version(a) - version(b));
}

/** The save the game writes for `text` once it has loaded it, as the browser version would. */
function resaved(text: string): string {
  const result = loadCampaign(text);
  if (!result.ok) throw new Error(result.message);
  return result.campaign.save();
}

function clockOf(text: string): string {
  const result = loadCampaign(text);
  if (!result.ok) throw new Error(result.message);
  return formatClock(result.campaign.snapshot().clock);
}

/** The game, loaded and paused, so nothing changes unless the test does it. */
async function pausedGame(page: Page): Promise<void> {
  await expect(page.getByRole("status", { name: "Game clock" })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
}

function button(within: Page | Locator, name: "Save" | "Load"): Locator {
  return within.getByRole("button", { name, exact: true });
}

/**
 * Clicks a Save button with the save dialog answering `path`, and returns
 * what was written there.
 */
async function saveTo(
  app: ElectronApplication,
  save: Locator,
  path: string,
): Promise<string> {
  await stubDialog(app, "showSaveDialog", { canceled: false, filePath: path });
  await save.click();
  await expect.poll(() => existsSync(path)).toBe(true);
  return readFile(path, "utf8");
}

/** Clicks a Load button with the open dialog answering `path`. */
async function loadFrom(
  app: ElectronApplication,
  load: Locator,
  path: string,
): Promise<void> {
  await stubDialog(app, "showOpenDialog", {
    canceled: false,
    filePaths: [path],
  });
  await load.click();
}

/** A folder in the test's output folder for the files it saves and loads. */
async function savesFolder(testInfo: TestInfo): Promise<string> {
  const folder = testInfo.outputPath("saves");
  await mkdir(folder, { recursive: true });
  return folder;
}

test("Save writes the Campaign through the save dialog, to a file the browser version loads, and the dialog starts in the folder last used, in the next run too", async ({
  launchApp,
  consoleErrors,
}, testInfo) => {
  const saves = await savesFolder(testInfo);
  const first = await launchApp();
  const page = await first.firstWindow();
  await pausedGame(page);
  await page.getByRole("button", { name: "20x" }).click();
  await expect(page.getByRole("status", { name: "Game clock" })).not.toHaveText(
    /^Earth Day 1, 00:/,
  );
  await page.getByRole("button", { name: "Pause" }).click();
  const shown = await page
    .getByRole("status", { name: "Game clock" })
    .textContent();

  const text = await saveTo(
    first,
    button(page, "Save"),
    join(saves, "a.moonbase"),
  );

  // The save format, which the browser version's loader reads.
  expect(JSON.parse(text)).toMatchObject({ format: "moonbase-save" });
  expect(clockOf(text)).toBe(shown);
  const documents = await first.evaluate(({ app }) => app.getPath("documents"));
  const [options] = await dialogCalls(first, "showSaveDialog");
  expect(options).toMatchObject({
    filters: [{ name: "Moon Base save files", extensions: ["moonbase"] }],
  });
  const suggested = (options as { defaultPath: string }).defaultPath;
  expect(dirname(suggested)).toBe(documents);
  expect(suggested).toMatch(/\\moon-base-earth-day-\d+-\d{4}\.moonbase$/);
  await expect(page.getByRole("alert")).toBeHidden();

  await closeWindow(first);
  expect(await exitCode(first)).toBe(0);
  const second = await launchApp();
  const again = await second.firstWindow();
  await pausedGame(again);
  await saveTo(second, button(again, "Save"), join(saves, "b.moonbase"));
  const [next] = await dialogCalls(second, "showSaveDialog");
  expect(dirname((next as { defaultPath: string }).defaultPath)).toBe(saves);
  expect(consoleErrors).toEqual([]);
});

test("Load opens the open dialog, filtered to save files, and loads the file chosen: a save of every format version, from the browser version's samples", async ({
  electronApp,
  window,
  consoleErrors,
}, testInfo) => {
  const saves = await savesFolder(testInfo);
  await pausedGame(window);
  const clock = window.getByRole("status", { name: "Game clock" });
  const gameOver = window.getByRole("dialog", { name: "Game over" });
  const names = await sampleSaves();
  expect(names.length).toBeGreaterThan(40);

  for (const name of names) {
    const sample = await readFile(join(samples, name), "utf8");
    const ended = name.includes("ended");
    await loadFrom(electronApp, button(window, "Load"), join(samples, name));
    await expect(clock, name).toHaveText(clockOf(sample));
    await expect(gameOver, name).toBeVisible({ visible: ended });
    await expect(window.getByRole("alert"), name).toBeHidden();
    // What was loaded is the sample, whole: saved again, it is what the
    // browser version writes for it.
    const written = await saveTo(
      electronApp,
      button(ended ? gameOver : window, "Save"),
      join(saves, `resaved-${name}`),
    );
    expect(written, name).toBe(resaved(sample));
  }

  const [options] = await dialogCalls(electronApp, "showOpenDialog");
  expect(options).toMatchObject({
    filters: [{ name: "Moon Base save files", extensions: ["moonbase"] }],
    properties: ["openFile"],
  });
  expect(consoleErrors).toEqual([]);
});

test("cancelling either dialog changes nothing", async ({
  electronApp,
  window,
  consoleErrors,
}, testInfo) => {
  const saves = await savesFolder(testInfo);
  await pausedGame(window);
  const before = await saveTo(
    electronApp,
    button(window, "Save"),
    join(saves, "before.moonbase"),
  );

  await stubDialog(electronApp, "showSaveDialog", {
    canceled: true,
    filePath: "",
  });
  await button(window, "Save").click();
  await expect
    .poll(() => dialogCalls(electronApp, "showSaveDialog"))
    .toHaveLength(1);

  await stubDialog(electronApp, "showOpenDialog", {
    canceled: true,
    filePaths: [],
  });
  await button(window, "Load").click();
  await expect
    .poll(() => dialogCalls(electronApp, "showOpenDialog"))
    .toHaveLength(1);

  await expect(window.getByRole("alert")).toBeHidden();
  expect(await readdir(saves)).toEqual(["before.moonbase"]);
  const after = await saveTo(
    electronApp,
    button(window, "Save"),
    join(saves, "after.moonbase"),
  );
  expect(after).toBe(before);
  expect(consoleErrors).toEqual([]);
});

test("a file that isn't a save is refused with the reason, as is a file that can't be written, and the Campaign carries on", async ({
  electronApp,
  window,
}, testInfo) => {
  const saves = await savesFolder(testInfo);
  await pausedGame(window);
  const clock = window.getByRole("status", { name: "Game clock" });
  const before = await clock.textContent();
  const notes = join(saves, "notes.moonbase");
  await writeFile(notes, "Earth Day 3: the Habitat is up.");

  await loadFrom(electronApp, button(window, "Load"), notes);

  await expect(window.getByRole("alert")).toHaveText(
    `Couldn't load "notes.moonbase". It isn't a Moon Base save file.`,
  );
  await expect(clock).toHaveText(before ?? "");

  await stubDialog(electronApp, "showSaveDialog", {
    canceled: false,
    filePath: join(saves, "gone", "lost.moonbase"),
  });
  await button(window, "Save").click();
  await expect(window.getByRole("alert")).toHaveText(
    `Couldn't save "lost.moonbase". The file couldn't be written.`,
  );
  expect(await readdir(saves)).toEqual(["notes.moonbase"]);

  await window.getByRole("button", { name: "20x" }).click();
  await expect(clock).not.toHaveText(before ?? "");
});

test("the page gets only the bridge's two functions, and the main process refuses what they wouldn't send", async ({
  electronApp,
  window,
}) => {
  await pausedGame(window);
  await stubDialog(electronApp, "showSaveDialog", {
    canceled: true,
    filePath: "",
  });

  const exposed = await window.evaluate(() => {
    const bridge = Reflect.get(window, "moonbase") as object;
    return {
      keys: Object.keys(bridge).sort(),
      node: typeof Reflect.get(window, "require"),
    };
  });
  expect(exposed).toEqual({
    keys: ["openSaveFile", "saveFile"],
    node: "undefined",
  });

  const refused = await window.evaluate(async () => {
    const bridge = Reflect.get(window, "moonbase") as DesktopBridge;
    const outcomes: string[] = [];
    for (const [name, contents] of [
      ["../../escape.moonbase", "{}"],
      ["notes.txt", "{}"],
      [3, "{}"],
    ] as const) {
      try {
        await bridge.saveFile(name as string, contents);
        outcomes.push("answered");
      } catch {
        outcomes.push("refused");
      }
    }
    return outcomes;
  });
  expect(refused).toEqual(["refused", "refused", "refused"]);
  expect(await dialogCalls(electronApp, "showSaveDialog")).toEqual([]);
});
