import { expect, test, type Page } from "@playwright/test";

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/**
 * Reads the game clock in whole game-hours since the Campaign began. The clock
 * shows Earth Days and hours only, so its minutes always read ":00".
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

test("the game loads with no console errors and the clock advances", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);

  await page.goto("/");

  await expect(page.getByRole("status", { name: "Game clock" })).toHaveText(
    /Earth Day 1, /,
  );
  // Checked before the canvas, so a WebGL failure reports its reason.
  expect(errors).toEqual([]);
  await expect(page.locator("canvas")).toBeVisible();
  // At 1x the clock moves on one game-hour every 10 real seconds.
  const start = await readClockHours(page);
  await expect
    .poll(() => readClockHours(page), { timeout: 15_000 })
    .toBeGreaterThan(start);
  expect(errors).toEqual([]);
});

test("pause stops the clock and a faster speed runs it again", async ({
  page,
}) => {
  await page.goto("/");
  const speeds = page.getByRole("group", { name: "Game speed" });

  await speeds.getByRole("button", { name: "Pause" }).click();
  await expect(speeds.getByRole("button", { name: "Pause" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const paused = await readClockHours(page);
  await page.waitForTimeout(1_000);
  expect(await readClockHours(page)).toBe(paused);

  await speeds.getByRole("button", { name: "20x" }).click();
  await expect
    .poll(() => readClockHours(page), { timeout: 5_000 })
    .toBeGreaterThan(paused + 1);
});

test("the status panel shows Daylight running out, and skipping jumps to Night", async ({
  page,
}) => {
  await page.goto("/");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  await panel
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  const lunation = page.getByRole("status", { name: "Lunation" });
  await expect(lunation).toHaveText(
    /^Daylight: (8 Earth Days|7 Earth Days \d+ hours?) left$/,
  );

  await panel.getByRole("button", { name: "Skip to next event" }).click();

  await expect(page.getByRole("status", { name: "Game clock" })).toHaveText(
    "Earth Day 9, 00:00",
  );
  await expect(lunation).toHaveText("Night: 9 Earth Days 12 hours left");
});
