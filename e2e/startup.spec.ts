import { expect, test, type Page } from "@playwright/test";

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function readClock(page: Page): Promise<number> {
  const text = await page
    .getByRole("status", { name: "Game clock" })
    .textContent();
  const match = /Earth Day (\d+), (\d{2}):(\d{2})/.exec(text ?? "");
  if (match === null)
    throw new Error(`Unexpected game clock text: ${text ?? "(none)"}`);
  const [, day, hour, minute] = match.map(Number);
  return ((day ?? 0) - 1) * 1440 + (hour ?? 0) * 60 + (minute ?? 0);
}

test("the game loads with no console errors and the clock advances", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);

  await page.goto("/");

  await expect(page.getByRole("status", { name: "Game clock" })).toHaveText(
    /Earth Day 1, /,
  );
  await expect(page.locator("canvas")).toBeVisible();
  const start = await readClock(page);
  await expect
    .poll(() => readClock(page), { timeout: 5_000 })
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
  const paused = await readClock(page);
  await page.waitForTimeout(1_000);
  expect(await readClock(page)).toBe(paused);

  await speeds.getByRole("button", { name: "20x" }).click();
  await expect
    .poll(() => readClock(page), { timeout: 5_000 })
    .toBeGreaterThan(paused + 60);
});
