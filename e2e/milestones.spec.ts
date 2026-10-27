import { expect, test } from "@playwright/test";
import { placeOnClearGround } from "./placement";

test("a fresh game shows power storage as the current Milestone, and commissioning the battery bank from the starting stock reaches it and makes moving in current", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  const current = page.getByRole("status", { name: "Current Milestone" });
  const hint = page.getByRole("status", { name: "Milestone hint" });
  const next = page.getByRole("status", { name: "Next Milestone" });
  await expect(current).toHaveText("Now Power storage before the first Night");
  await expect(hint).toContainText("battery banks from the starting stock");
  await expect(next).toHaveText(
    "Next Habitat commissioned, Mission Director moved in",
  );

  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Battery bank/ })
    .click();
  await placeOnClearGround(page);
  await expect(page.getByRole("status", { name: "Placement" })).toHaveText(
    "Battery bank planned. The Robot will carry out its Construction.",
  );

  // Skip from event to event until the Milestone is reached, which stops
  // the skip there.
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const notifications = page.getByRole("log", { name: "Notifications" });
  for (let skips = 0; skips < 30; skips++) {
    if (
      (await notifications.isVisible()) &&
      (await notifications.textContent())?.includes("Milestone reached") ===
        true
    ) {
      break;
    }
    await skip.click();
  }

  await expect(notifications).toContainText("Battery bank commissioned");
  await expect(notifications).toContainText(
    "Milestone reached: Power storage before the first Night",
  );
  await expect(current).toHaveText(
    "Now Habitat commissioned, Mission Director moved in",
  );
  await expect(hint).toContainText("inflatable Habitat");
  await expect(next).toHaveText("Next Lander departs");
});
