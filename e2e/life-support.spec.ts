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

test("oxygen and water run down in the Habitat, warnings come without pausing the game, and the battery running flat at Night ends the Campaign", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  // Frames come slowly with software rendering in CI, so run at 20x to see
  // the clock move (as in startup.spec.ts).
  const speeds = page.getByRole("group", { name: "Game speed" });
  const twentyTimes = speeds.getByRole("button", { name: "20x" });
  await twentyTimes.click();
  const oxygen = panel.getByRole("status", { name: "Oxygen", exact: true });
  const water = panel.getByRole("status", { name: "Water", exact: true });
  const habitatPower = panel.getByRole("status", { name: "Habitat power" });
  const radiationDose = panel.getByRole("status", { name: "Radiation Dose" });
  await expect(oxygen).toHaveText("Oxygen 25.0 kg · safe aboard the Lander");
  await expect(water).toHaveText("Water 108.0 kg · safe aboard the Lander");
  await expect(habitatPower).toBeHidden();
  await expect(radiationDose).toHaveText(
    "Radiation 0.0 / 600 mSv · none aboard the Lander",
  );

  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  for (const structure of [
    /Solar array/,
    /Battery bank/,
    /Inflatable Habitat/,
  ]) {
    await buildMenu.getByRole("button", { name: structure }).click();
    await placeOnClearGround(page);
  }
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const notifications = page.getByRole("log", { name: "Notifications" });

  /** Clicks "Skip to next event" until the target shows, checking only once a frame has drawn the skip. */
  const skipUntil = async (target: Locator) => {
    for (let skips = 0; skips < 10 && !(await target.isVisible()); skips++) {
      await skip.click();
      await nextFrame(page);
    }
    await expect(target).toBeVisible();
  };

  await skipUntil(notifications.getByText("Inflatable Habitat commissioned"));
  await page
    .getByRole("list", { name: "Structures" })
    .getByRole("button", { name: "Move in" })
    .click();
  await expect(oxygen).toHaveText(/^Oxygen 2\d\.\d kg · lasts 2[89]d/);
  await expect(water).toHaveText(/^Water \d+\.\d kg · lasts (29|30)d/);
  await expect(habitatPower).toHaveText(/^Habitat power on · fails in \d+d/);
  await expect(radiationDose).toHaveText(
    /^Radiation \d+\.\d \/ 600 mSv · \+30\.0 a day, limit in (19|20)d/,
  );

  await skipUntil(
    notifications.getByText("Habitat power will fail in 1 Earth Day"),
  );
  await expect(twentyTimes).toHaveAttribute("aria-pressed", "true");
  const clock = page.getByRole("status", { name: "Game clock" });
  const warnedAt = await clock.textContent();
  await expect(clock).not.toHaveText(warnedAt ?? "");

  // Paused, so that the next warnings come from skips rather than while
  // running between clicks.
  await speeds.getByRole("button", { name: "Pause" }).click();
  await skipUntil(notifications.getByText("Habitat power will fail in 1 hour"));
  // Then left to run, without clicking anything the game-over screen could
  // cover, until the battery runs flat.
  await twentyTimes.click();
  const gameOver = page.getByRole("dialog", { name: "Game over" });
  await expect(gameOver).toBeVisible();
  await expect(gameOver).toContainText(
    /Habitat power failed on Earth Day \d+, \d{2}:\d{2}, and the Mission Director died at once\./,
  );
  await expect(habitatPower).toHaveText("Habitat power failed");
  const diedAt = await clock.textContent();
  await page.waitForTimeout(1_000);
  await expect(clock).toHaveText(diedAt ?? "");
  // Nothing can go on after a death, so Escape leaves the screen up.
  await page.keyboard.press("Escape");
  await expect(gameOver).toBeVisible();

  await gameOver.getByRole("button", { name: "Start a new Campaign" }).click();

  await expect(gameOver).toBeHidden();
  await expect(clock).toHaveText(/^Earth Day 1, /);
  await expect(oxygen).toHaveText("Oxygen 25.0 kg · safe aboard the Lander");
  await expect(habitatPower).toBeHidden();
});
