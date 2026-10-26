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

test("oxygen and water run down in the Habitat, warnings come without pausing the game, and running out ends the Campaign", async ({
  page,
}) => {
  // Software rendering in CI draws frames several times slower than locally.
  test.setTimeout(60_000);
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  // Frames come slowly with software rendering in CI, so run at 20x to see
  // the clock move (as in startup.spec.ts).
  const speeds = panel.getByRole("group", { name: "Game speed" });
  const twentyTimes = speeds.getByRole("button", { name: "20x" });
  await twentyTimes.click();
  const oxygen = panel.getByRole("status", { name: "Oxygen" });
  const water = panel.getByRole("status", { name: "Water" });
  await expect(oxygen).toHaveText(
    "Oxygen: 25.0 kg, kept safe aboard the Lander",
  );
  await expect(water).toHaveText(
    "Water: 108.0 kg, kept safe aboard the Lander",
  );

  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Inflatable Habitat/ })
    .click();
  await placeOnClearGround(page);
  const skip = panel.getByRole("button", { name: "Skip to next event" });
  await skip.click();
  const notifications = page.getByRole("log", { name: "Notifications" });
  await expect(notifications).toContainText("Inflatable Habitat commissioned");
  await panel
    .getByRole("list", { name: "Structures" })
    .getByRole("button", { name: "Move in" })
    .click();
  await expect(oxygen).toHaveText(
    /^Oxygen: 2\d\.\d kg, runs out in 2[89] Earth Days/,
  );
  await expect(water).toHaveText(
    /^Water: \d+\.\d kg, runs out in (29|30) Earth Days/,
  );

  /** Clicks "Skip to next event" until the target shows, checking only once a frame has drawn the skip. */
  const skipUntil = async (target: Locator) => {
    for (let skips = 0; skips < 10 && !(await target.isVisible()); skips++) {
      await skip.click();
      await nextFrame(page);
    }
    await expect(target).toBeVisible();
  };

  await skipUntil(
    notifications.getByText("Oxygen will run out in 7 Earth Days"),
  );
  await expect(twentyTimes).toHaveAttribute("aria-pressed", "true");
  const clock = panel.getByRole("status", { name: "Game clock" });
  const warnedAt = await clock.textContent();
  await expect(clock).not.toHaveText(warnedAt ?? "", { timeout: 15_000 });

  // Paused, so that the death comes from a skip rather than while running
  // between clicks, when the game-over screen would cover the button.
  await speeds.getByRole("button", { name: "Pause" }).click();
  await skipUntil(
    notifications.getByText("Oxygen will run out in 1 Earth Day"),
  );
  // Oxygen runs out before the water's last warning, so the next event is
  // the death, which comes long before a running game would reach it.
  await twentyTimes.click();
  const gameOver = page.getByRole("dialog", { name: "Game over" });
  await skipUntil(gameOver);
  await expect(gameOver).toContainText(
    /The oxygen in the Habitat ran out on Earth Day \d+, \d{2}:\d{2}, and the Mission Director died at once\./,
  );
  await expect(oxygen).toHaveText("Oxygen: 0.0 kg, ran out");
  const diedAt = await clock.textContent();
  await page.waitForTimeout(1_000);
  await expect(clock).toHaveText(diedAt ?? "");
  // Nothing can go on after a death, so Escape leaves the screen up.
  await page.keyboard.press("Escape");
  await expect(gameOver).toBeVisible();

  await gameOver.getByRole("button", { name: "Start a new Campaign" }).click();

  await expect(gameOver).toBeHidden();
  await expect(clock).toHaveText(/^Earth Day 1, /);
  await expect(oxygen).toHaveText(
    "Oxygen: 25.0 kg, kept safe aboard the Lander",
  );
});
