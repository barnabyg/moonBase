import { expect, test, type Locator, type Page } from "@playwright/test";
import { placeOnClearGround } from "./placement";

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

test("Dust wears a solar array down until a Maintenance Work Order is raised for it", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  const speeds = panel.getByRole("group", { name: "Game speed" });
  const notifications = page.getByRole("log", { name: "Notifications" });
  const array = panel
    .getByRole("list", { name: "Structures" })
    .getByRole("listitem")
    .filter({ hasText: /^Solar array/ });

  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Solar array/ })
    .click();
  await placeOnClearGround(page);
  await speeds.getByRole("button", { name: "20x" }).click();

  // At the fastest speed, its Condition soon shows below 100%.
  await expect(array).toHaveText(/Condition 9\d%/);

  // It takes most of a Lunation for Dust to call for Maintenance, so skip
  // ahead from event to event until a Work Order is raised.
  await speeds.getByRole("button", { name: "Pause" }).click();
  const skip = panel.getByRole("button", { name: "Skip to next event" });
  const needed = notifications.getByText(/Solar array needs Maintenance/);
  /** Clicks "Skip to next event" until the target shows, checking only once a frame has drawn the skip. */
  const skipUntil = async (target: Locator) => {
    for (let skips = 0; skips < 30 && !(await target.isVisible()); skips++) {
      await skip.click();
      await nextFrame(page);
    }
    await expect(target).toBeVisible();
  };
  await skipUntil(needed);

  await expect(array).toHaveText(
    /Condition \d+%, Dust coating \d+%, (awaiting|undergoing) Maintenance/,
  );
  await expect(page.getByRole("complementary", { name: "Work" })).toContainText(
    "Maintaining the solar array",
  );
});
