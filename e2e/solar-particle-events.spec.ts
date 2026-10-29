import { expect, test, type Locator, type Page } from "@playwright/test";

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

test("a Solar Particle Event is announced hours ahead, shown while it is coming and under way, and gives no dose aboard the Lander", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  await page.getByRole("button", { name: "Pause" }).click();
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const notifications = page.getByRole("log", { name: "Notifications" });
  const event = panel.getByRole("status", { name: "Solar Particle Event" });
  const radiationDose = panel.getByRole("status", { name: "Radiation Dose" });

  /** Clicks "Skip to next event" until the target shows, checking only once a frame has drawn the skip. */
  const skipUntil = async (target: Locator) => {
    for (let skips = 0; skips < 20 && !(await target.isVisible()); skips++) {
      await skip.click();
      await nextFrame(page);
    }
    await expect(target).toBeVisible();
  };

  await expect(event).toBeHidden();
  await skipUntil(
    notifications.getByText(/Solar Particle Event coming in 4 hours/),
  );
  await expect(event).toHaveText(
    /^Solar Particle Event starts in 4h, lasts .+ · 10× the dose rate$/,
  );

  await skip.click();
  await expect(
    notifications.getByText(/Solar Particle Event under way, for /),
  ).toBeVisible();
  await expect(event).toHaveText(
    /^Solar Particle Event under way, ends in .+ · 10× the dose rate$/,
  );
  await expect(radiationDose).toHaveText(
    "Radiation 0.0 / 600 mSv · none aboard the Lander",
  );

  await skip.click();
  await expect(
    notifications.getByText("Solar Particle Event over"),
  ).toBeVisible();
  await expect(event).toBeHidden();
});
