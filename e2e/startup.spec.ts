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
  const speeds = page.getByRole("group", { name: "Game speed" });
  await expect(speeds.getByRole("button", { name: "1x" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // A game-hour takes 10 real seconds at 1x only while frames come at least
  // every 250 ms; with software rendering in CI they come slower, and the
  // game loop deliberately lets the clock fall behind, so watch it at 20x.
  await speeds.getByRole("button", { name: "20x" }).click();
  const start = await readClockHours(page);
  await expect.poll(() => readClockHours(page)).toBeGreaterThan(start);
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
  await expect.poll(() => readClockHours(page)).toBeGreaterThan(paused + 1);
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

  // A Micrometeorite may strike first, and stop a skip on the way.
  const skip = panel.getByRole("button", { name: "Skip to next event" });
  for (
    let skips = 0;
    skips < 10 && !(await lunation.textContent())?.startsWith("Night");
    skips++
  ) {
    await skip.click();
    await nextFrame(page);
  }

  await expect(page.getByRole("status", { name: "Game clock" })).toHaveText(
    "Earth Day 9, 00:00",
  );
  await expect(lunation).toHaveText("Night: 9 Earth Days 12 hours left");
});

test("panning, rotating and zooming the camera leaves the game unchanged", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  const panel = page.getByRole("complementary", { name: "Status panel" });
  const before = await panel.textContent();
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("The 3D view has no size.");
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // Pan with the left button, rotate with the right, then zoom out and in.
  for (const button of ["left", "right"] as const) {
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down({ button });
    await page.mouse.move(centre.x + 120, centre.y + 40, { steps: 8 });
    await page.mouse.up({ button });
  }
  await page.mouse.wheel(0, 2_000);
  await page.mouse.wheel(0, -1_000);
  await page.waitForTimeout(500);

  expect(await panel.textContent()).toBe(before);
  expect(errors).toEqual([]);
});
