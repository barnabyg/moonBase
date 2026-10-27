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

test("an Expedition started from the Expeditions screen comes back with water ice for the base's stock", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  const notifications = page.getByRole("log", { name: "Notifications" });
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  await expect(panel.getByRole("status", { name: "Expedition" })).toHaveText(
    "Expedition none under way",
  );

  await panel.getByRole("button", { name: "Expeditions" }).click();
  const screen = page.getByRole("dialog", { name: "Expeditions" });
  await screen.getByRole("button", { name: "Start an Expedition" }).click();
  await expect(
    screen.getByRole("status", { name: "Expedition under way" }),
  ).toHaveText(/^Leaving once the Robot/);
  // A second one is refused, with the reason.
  await screen.getByRole("button", { name: "Start an Expedition" }).click();
  await expect(screen.getByRole("alert")).toHaveText(
    "An Expedition is already under way.",
  );
  await screen.getByRole("button", { name: "Close" }).click();

  // Skip from event to event: it leaves the map, then some Earth Days
  // later it is back, with other events on the way.
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const left = notifications.getByText(/Expedition left the map/);
  const back = notifications.getByText(
    /Expedition back with 200 kg of water ice/,
  );
  let sawLeave = false;
  for (let skips = 0; skips < 60 && !(await back.isVisible()); skips++) {
    await skip.click();
    await nextFrame(page);
    // Straight after the skip that took it off the map, it shows as away.
    if (!sawLeave && (await left.isVisible())) {
      sawLeave = true;
      await expect(
        panel.getByRole("status", { name: "Expedition" }),
      ).toHaveText(/^Expedition away, back in 3 Earth Days$/);
    }
  }
  expect(sawLeave).toBe(true);
  await expect(back).toBeVisible();

  await expect(
    panel.getByRole("status", { name: "Bulk resources" }),
  ).toContainText("Water ice 200 kg");
  await expect(panel.getByRole("status", { name: "Expedition" })).toHaveText(
    "Expedition none under way",
  );
});
