import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { placeOnClearGround } from "./placement";

/** A sample save of a Campaign that ended when the Habitat lost power. */
const endedSave = fileURLToPath(
  new URL("../test/saves/version-1-ended.moonbase", import.meta.url),
);

/**
 * Waits until the game has drawn a frame. The game updates its interface in
 * each animation frame, and a callback added now runs after the game's.
 */
async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      }),
  );
}

/**
 * Opens the paused game and skips through it until a solar array is
 * commissioned, with a second one planned that waits for Components.
 */
async function pausedGameUnderWay(page: Page): Promise<Locator> {
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  await panel.getByRole("button", { name: "Pause" }).click();
  const solarArray = page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Solar array/ });
  for (let planned = 0; planned < 2; planned++) {
    await solarArray.click();
    await placeOnClearGround(page);
  }
  const commissioned = page
    .getByRole("log", { name: "Notifications" })
    .getByText("Solar array commissioned");
  const skip = panel.getByRole("button", { name: "Skip to next event" });
  for (
    let skips = 0;
    skips < 10 && !(await commissioned.isVisible());
    skips++
  ) {
    await skip.click();
    await nextFrame(page);
  }
  await expect(commissioned).toBeVisible();
  await nextFrame(page);
  return panel;
}

/** Clicks the button and saves the file it downloads, returning its path. */
async function saveWith(
  page: Page,
  button: Locator,
  path: (name: string) => string,
): Promise<{ name: string; path: string }> {
  const download = page.waitForEvent("download");
  await button.click();
  const file = await download;
  const name = file.suggestedFilename();
  await file.saveAs(path(name));
  return { name, path: path(name) };
}

/** Clicks the button and chooses the file in the file picker it opens. */
async function loadWith(
  page: Page,
  button: Locator,
  file: string | { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await button.click();
  await (await chooser).setFiles(file);
}

test("a Campaign saved to a file carries on from the saved state when the file is loaded after a reload", async ({
  page,
}, testInfo) => {
  const panel = await pausedGameUnderWay(page);
  const statuses = panel.getByRole("status");
  const work = page.getByRole("complementary", { name: "Work" });
  const saved = {
    statuses: await statuses.allTextContents(),
    structures: await panel
      .getByRole("list", { name: "Structures" })
      .textContent(),
    work: await work.textContent(),
  };
  expect(saved.statuses[0]).not.toMatch(/^Earth Day 1, 00:/);

  const file = await saveWith(
    page,
    panel.getByRole("button", { name: "Save", exact: true }),
    (name) => testInfo.outputPath(name),
  );
  expect(file.name).toMatch(/^moon-base-earth-day-\d+-\d{4}\.moonbase$/);

  await page.reload();
  await panel.getByRole("button", { name: "Pause" }).click();
  await expect(statuses.first()).toHaveText(/^Earth Day 1, 00:/);
  await loadWith(
    page,
    panel.getByRole("button", { name: "Load", exact: true }),
    file.path,
  );

  await expect(statuses).toHaveText(saved.statuses);
  await expect(panel.getByRole("list", { name: "Structures" })).toHaveText(
    saved.structures ?? "",
  );
  await expect(work).toHaveText(saved.work ?? "");
  // It carries on from there.
  await panel.getByRole("button", { name: "20x" }).click();
  await expect(statuses.first()).not.toHaveText(saved.statuses[0] ?? "");
});

test("a file that isn't a save is refused with the reason, and the Campaign carries on", async ({
  page,
}) => {
  const panel = await pausedGameUnderWay(page);
  const clock = panel.getByRole("status", { name: "Game clock" });
  const before = await clock.textContent();

  await loadWith(
    page,
    panel.getByRole("button", { name: "Load", exact: true }),
    {
      name: "notes.moonbase",
      mimeType: "text/plain",
      buffer: Buffer.from("Earth Day 3: the Habitat is up."),
    },
  );

  await expect(panel.getByRole("alert")).toHaveText(
    `Couldn't load "notes.moonbase". It isn't a Moon Base save file.`,
  );
  await expect(clock).toHaveText(before ?? "");
  await panel.getByRole("button", { name: "20x" }).click();
  await expect(clock).not.toHaveText(before ?? "");
});

test("the game-over screen saves the ended Campaign, and loads a saved one in its place", async ({
  page,
}, testInfo) => {
  const panel = await pausedGameUnderWay(page);
  const statuses = panel.getByRole("status");
  const savedStatuses = await statuses.allTextContents();
  const alive = await saveWith(
    page,
    panel.getByRole("button", { name: "Save", exact: true }),
    (name) => testInfo.outputPath(`alive-${name}`),
  );

  await loadWith(
    page,
    panel.getByRole("button", { name: "Load", exact: true }),
    endedSave,
  );
  const gameOver = page.getByRole("dialog", { name: "Game over" });
  await expect(gameOver).toBeVisible();
  await expect(gameOver).toContainText(
    "Habitat power failed on Earth Day 10, 07:36, and the Mission Director died at once.",
  );

  const ended = await saveWith(
    page,
    gameOver.getByRole("button", { name: "Save", exact: true }),
    (name) => testInfo.outputPath(`ended-${name}`),
  );
  expect(ended.name).toBe("moon-base-earth-day-10-0736.moonbase");

  await loadWith(
    page,
    gameOver.getByRole("button", { name: "Load", exact: true }),
    { name: "notes.moonbase", mimeType: "text/plain", buffer: Buffer.from("") },
  );
  await expect(gameOver.getByRole("alert")).toHaveText(
    `Couldn't load "notes.moonbase". It isn't a Moon Base save file.`,
  );
  await expect(gameOver).toBeVisible();

  await loadWith(
    page,
    gameOver.getByRole("button", { name: "Load", exact: true }),
    alive.path,
  );
  await expect(gameOver).toBeHidden();
  await expect(statuses).toHaveText(savedStatuses);
});
