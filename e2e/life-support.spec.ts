import { expect, test } from "@playwright/test";
import { placeOnClearGround } from "./placement";

test("oxygen and water run down in the Habitat, warnings come without pausing the game, and running out ends the Campaign", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  // Frames come slowly with software rendering in CI, so run at 20x to see
  // the clock move (as in startup.spec.ts).
  const twentyTimes = panel
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "20x" });
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

  // Skip ahead until the first warning.
  const warning = notifications.getByText(
    "Oxygen will run out in 7 Earth Days",
  );
  for (let skips = 0; skips < 10 && !(await warning.isVisible()); skips++) {
    await skip.click();
  }
  await expect(warning).toBeVisible();
  await expect(twentyTimes).toHaveAttribute("aria-pressed", "true");
  const clock = panel.getByRole("status", { name: "Game clock" });
  const warnedAt = await clock.textContent();
  await expect(clock).not.toHaveText(warnedAt ?? "", { timeout: 15_000 });

  // Skip on until the Mission Director dies.
  const gameOver = page.getByRole("dialog", { name: "Game over" });
  for (let skips = 0; skips < 10 && !(await gameOver.isVisible()); skips++) {
    await skip.click();
  }
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
