import { expect, test, type Page } from "@playwright/test";

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

test("a Research Task started from the Research Tasks screen runs for its length and earns Science", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  const notifications = page.getByRole("log", { name: "Notifications" });
  const science = page.getByRole("status", { name: "Science" });
  const running = panel.getByRole("status", { name: "Research Task" });
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  await expect(science).toHaveText("0");
  await expect(running).toHaveText("Task none running");

  await page.getByRole("button", { name: "Research Tasks" }).click();
  const screen = page.getByRole("dialog", { name: "Research Tasks" });
  // Its length and the Science it pays, after its name.
  const firstTask = screen
    .getByRole("row", { name: /Regolith sample analysis/ })
    .getByRole("cell");
  await expect(firstTask.nth(0)).toHaveText("6 hours");
  await expect(firstTask.nth(1)).toHaveText("5 Science");
  await screen
    .getByRole("button", { name: "Start Regolith sample analysis" })
    .click();
  await expect(
    screen.getByRole("status", { name: "Research Task running" }),
  ).toHaveText(
    "Running: Regolith sample analysis, 6 hours left. Another can start once it is complete.",
  );
  // A second one is refused, with the reason.
  await screen
    .getByRole("button", { name: "Start Ice volatiles assay" })
    .click();
  await expect(screen.getByRole("alert")).toHaveText(
    "Regolith sample analysis is running, and only one Research Task runs at a time.",
  );
  await screen.getByRole("button", { name: "Close" }).click();
  await expect(running).toHaveText("Task Regolith sample analysis · 6h left");

  // Skip from event to event until it is complete.
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const completed = notifications.getByText(
    "Regolith sample analysis complete, earning 5 Science",
  );
  for (let skips = 0; skips < 20 && !(await completed.isVisible()); skips++) {
    await skip.click();
    await nextFrame(page);
  }
  await expect(completed).toBeVisible();
  await expect(science).toHaveText("5");
  await expect(running).toHaveText("Task none running");

  await page.getByRole("button", { name: "Research Tasks" }).click();
  await expect(firstTask.nth(2)).toHaveText("Completed");
  await expect(
    screen.getByRole("button", { name: "Start Regolith sample analysis" }),
  ).toBeHidden();
});
