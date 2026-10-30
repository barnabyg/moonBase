import { expect, test, type Page } from "@playwright/test";
import { catalogue } from "../src/catalogue";

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

test("Science from a Research Task unlocks a Design, whose Components then appear on the Launch manifest screen and its Structure in the build menu", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const notifications = page.getByRole("log", { name: "Notifications" });
  const science = page.getByRole("status", { name: "Science", exact: true });
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  const largeBank = buildMenu.getByRole("button", {
    name: /^Large battery bank/,
  });
  const manifest = page.getByRole("dialog", { name: "Launch manifest" });
  const largeModule = manifest.getByRole("row", {
    name: /^Large battery module/,
  });
  const largeCabinet = manifest.getByRole("row", {
    name: /^Large battery cabinet/,
  });
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();

  // Neither the Components nor the Structure is offered before the Design is unlocked.
  await expect(
    buildMenu.getByRole("button", { name: /^Battery bank/ }),
  ).toBeVisible();
  await expect(largeBank).toBeHidden();
  await page.getByRole("button", { name: "Launch manifest" }).click();
  await expect(
    manifest.getByRole("row", { name: /^Battery module/ }),
  ).toBeVisible();
  await expect(largeModule).toBeHidden();
  await expect(largeCabinet).toBeHidden();
  await manifest.getByRole("button", { name: "Close" }).click();

  // One Research Task pays enough Science for Large battery banks.
  await page.getByRole("button", { name: "Research Tasks" }).click();
  const research = page.getByRole("dialog", { name: "Research Tasks" });
  await research
    .getByRole("button", { name: "Start Seismic monitoring" })
    .click();
  await research.getByRole("button", { name: "Close" }).click();
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const completed = notifications.getByText(
    "Seismic monitoring complete, earning 30 Science",
  );
  for (let skips = 0; skips < 20 && !(await completed.isVisible()); skips++) {
    await skip.click();
    await nextFrame(page);
  }
  await expect(completed).toBeVisible();
  await expect(science).toHaveText("30");

  await page.getByRole("button", { name: "Tech Tree" }).click();
  const tree = page.getByRole("dialog", { name: "Tech Tree" });
  await tree
    .getByRole("button", { name: "Unlock Large battery banks" })
    .click();
  await expect(
    notifications.getByText("Large battery banks unlocked, for 25 Science"),
  ).toBeVisible();
  await expect(science).toHaveText("5");
  // Its card now says only that it is unlocked, no longer what it needed.
  const largeCard = tree.getByRole("article", { name: "Large battery banks" });
  await expect(largeCard).toContainText("✓ Unlocked");
  await expect(largeCard.getByText("Needs", { exact: true })).toBeHidden();
  await tree.getByRole("button", { name: "Close" }).click();

  // Its Components can now be shipped, with their mass and price.
  await page.getByRole("button", { name: "Launch manifest" }).click();
  await expect(largeModule).toBeVisible();
  await expect(largeModule).toContainText("170 kg, $10M");
  await expect(largeCabinet).toContainText("160 kg, $5M");
  await manifest
    .getByRole("button", { name: "Add one Large battery module" })
    .click();
  await expect(
    manifest.getByRole("status", { name: "Payload Mass" }),
  ).toHaveText(
    `Payload Mass: 170 of ${catalogue.launch.payloadMassLimitKilograms} kg`,
  );
  await manifest.getByRole("button", { name: "Close" }).click();

  // And its Structure planned, though unlocking added none of its
  // Components to the base's stock.
  await expect(largeBank).toBeVisible();
  await expect(largeBank).toContainText("0 available");
  await largeBank.click();
  await expect(
    buildMenu.getByRole("status", { name: "Placement" }),
  ).toContainText(
    "Click the map to place the large battery bank. Right-click or press Esc to cancel. Its Components aren't in the base's stock, so its Construction will wait for them.",
  );
});

test("Science unlocks Robots, and then a Robot is on the Launch manifest screen with its mass and price", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const notifications = page.getByRole("log", { name: "Notifications" });
  const manifest = page.getByRole("dialog", { name: "Launch manifest" });
  const robot = manifest.getByRole("row", { name: /^Robot/ });
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();

  // Not offered before the Design is unlocked.
  await page.getByRole("button", { name: "Launch manifest" }).click();
  await expect(
    manifest.getByRole("row", { name: /^Solar panel/ }),
  ).toBeVisible();
  await expect(robot).toBeHidden();
  await manifest.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Research Tasks" }).click();
  const research = page.getByRole("dialog", { name: "Research Tasks" });
  await research
    .getByRole("button", { name: "Start Seismic monitoring" })
    .click();
  await research.getByRole("button", { name: "Close" }).click();
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const completed = notifications.getByText(
    "Seismic monitoring complete, earning 30 Science",
  );
  for (let skips = 0; skips < 20 && !(await completed.isVisible()); skips++) {
    await skip.click();
    await nextFrame(page);
  }
  await expect(completed).toBeVisible();

  await page.getByRole("button", { name: "Tech Tree" }).click();
  const tree = page.getByRole("dialog", { name: "Tech Tree" });
  await tree.getByRole("tab", { name: /^Mobility/ }).click();
  await tree.getByRole("button", { name: "Unlock Robots" }).click();
  await expect(
    notifications.getByText("Robots unlocked, for 20 Science"),
  ).toBeVisible();
  await tree.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Launch manifest" }).click();
  await expect(robot).toContainText("300 kg, $50M");
  await manifest.getByRole("button", { name: "Add one Robot" }).click();
  await expect(
    manifest.getByRole("status", { name: "Payload Mass" }),
  ).toHaveText(
    `Payload Mass: 300 of ${catalogue.launch.payloadMassLimitKilograms} kg`,
  );
  await expect(
    manifest.getByRole("status", { name: "Launch cost" }),
  ).toContainText("$200M");
});
