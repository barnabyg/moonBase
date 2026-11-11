// The desktop app's smoke tests: the production Electron build starts and
// draws the game, a Structure can be built, time passes, the window closes
// cleanly, and what the game keeps between runs is kept in the app's
// user-data folder.
import { structureEntries } from "../base-panel";
import { placeOnClearGround } from "../placement";
import { closeWindow, exitCode, expect, gameUrl, test } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * Reads the game clock in whole game-hours since the Campaign began, as
 * startup.spec.ts does.
 */
async function readClockHours(page: Page): Promise<number> {
  const text = await page
    .getByRole("status", { name: "Game clock" })
    .textContent();
  const match = /^Earth Day (\d+), (\d{2}):00$/.exec(text ?? "");
  if (match === null)
    throw new Error(`Unexpected game clock text: ${text ?? "(none)"}`);
  const [, day, hour] = match.map(Number);
  return ((day ?? 0) - 1) * 24 + (hour ?? 0);
}

/** Resolves once the page has run `frames` animation frames. */
async function animationFrames(page: Page, frames: number): Promise<void> {
  await page.evaluate(async (count) => {
    for (let frame = 0; frame < count; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, frames);
}

test("the app opens the game in its window, which draws with no errors", async ({
  electronApp,
  window,
  consoleErrors,
  userDataDir,
}) => {
  expect(window.url()).toBe(gameUrl());
  await expect(window).toHaveTitle("Moon Base");
  const shown = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((each) => ({
      title: each.getTitle(),
      visible: each.isVisible(),
    })),
  );
  expect(shown).toEqual([{ title: "Moon Base", visible: true }]);
  // The folder the fixture gave it, not the player's own.
  expect(await electronApp.evaluate(({ app }) => app.getPath("userData"))).toBe(
    userDataDir,
  );

  await expect(window.getByRole("status", { name: "Game clock" })).toHaveText(
    /^Earth Day 1, /,
  );
  // Checked before the 3D view, so a WebGL failure reports its reason.
  expect(consoleErrors).toEqual([]);
  await expect(window.getByRole("alert")).toHaveCount(0);
  await expect(window.locator("canvas")).toBeVisible();
  expect(
    await window
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) =>
        canvas.getContext("webgl2")?.isContextLost(),
      ),
  ).toBe(false);
  await animationFrames(window, 10);
  expect(consoleErrors).toEqual([]);
});

test("a Structure placed from the build menu is built", async ({
  window,
  consoleErrors,
}) => {
  await window.goto(gameUrl("?seed=1"));
  const solarArray = window
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Solar array/ });
  await solarArray.click();
  await placeOnClearGround(window);
  await expect(window.getByRole("status", { name: "Placement" })).toHaveText(
    "Solar array planned. The Robot will carry out its Construction.",
  );

  await window
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "20x" })
    .click();

  await expect(structureEntries(window)).toHaveText([/^Solar array Condition/]);
  expect(consoleErrors).toEqual([]);
});

test("time passes: the clock advances, and stops while paused", async ({
  window,
}) => {
  const speeds = window.getByRole("group", { name: "Game speed" });
  // As in startup.spec.ts, watched at 20x, as software rendering in CI draws
  // too few frames for 1x to keep time.
  await speeds.getByRole("button", { name: "20x" }).click();
  const start = await readClockHours(window);
  await expect.poll(() => readClockHours(window)).toBeGreaterThan(start);

  await speeds.getByRole("button", { name: "Pause" }).click();
  const paused = await readClockHours(window);
  await animationFrames(window, 30);
  expect(await readClockHours(window)).toBe(paused);
});

test("closing the window quits the app cleanly", async ({
  electronApp,
  window,
  consoleErrors,
}) => {
  await expect(
    window.getByRole("status", { name: "Game clock" }),
  ).toBeVisible();

  await closeWindow(electronApp);

  expect(await exitCode(electronApp)).toBe(0);
  expect(consoleErrors).toEqual([]);
});

test("a section folded away stays folded when the app is started again", async ({
  launchApp,
}) => {
  const first = await launchApp();
  const before = await first.firstWindow();
  const idle = before
    .getByRole("complementary", { name: "Work" })
    .getByText("No work under way");
  await expect(idle).toBeVisible();
  await before
    .getByRole("complementary", { name: "Work" })
    .getByText("Work", { exact: true })
    .click();
  await expect(idle).toBeHidden();
  await closeWindow(first);
  expect(await exitCode(first)).toBe(0);

  const second = await launchApp();
  const after = await second.firstWindow();
  const work = after.getByRole("complementary", { name: "Work" });
  await expect(work.getByText("Work", { exact: true })).toBeVisible();
  await expect(work.getByText("No work under way")).toBeHidden();
});

test("under test, an uncaught exception in the main process is reported and exits, rather than waiting in a dialog", async ({
  electronApp,
  window,
  consoleErrors,
}) => {
  await expect(
    window.getByRole("status", { name: "Game clock" }),
  ).toBeVisible();

  await electronApp.evaluate(() => {
    setTimeout(() => {
      throw new Error("A deliberate failure");
    });
  });

  expect(await exitCode(electronApp)).toBe(1);
  expect(consoleErrors).toEqual([
    expect.stringContaining("A deliberate failure"),
  ]);
});
