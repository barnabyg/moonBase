import { expect, test, type Page } from "@playwright/test";
import { designInTree, pickDesign } from "./tech-tree";

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

test("the Tech Tree draws every Design in one tree, and picking one says what it costs, why it can't be unlocked yet and what it takes to get there", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const notifications = page.getByRole("log", { name: "Notifications" });
  const science = page.getByRole("status", { name: "Science", exact: true });
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();

  // Earn a little Science first.
  await page.getByRole("button", { name: "Research Tasks" }).click();
  const research = page.getByRole("dialog", { name: "Research Tasks" });
  await expect(
    research.getByRole("article", { name: "Sintered block testing" }),
  ).toBeHidden();
  await research
    .getByRole("button", { name: "Start Regolith sample analysis" })
    .click();
  await research.getByRole("button", { name: "Close" }).click();
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const completed = notifications.getByText(
    "Regolith sample analysis complete, earning 5 Science",
  );
  for (let skips = 0; skips < 20 && !(await completed.isVisible()); skips++) {
    await skip.click();
    await nextFrame(page);
  }
  await expect(science).toHaveText("5");

  await page.getByRole("button", { name: "Tech Tree" }).click();
  const screen = page.getByRole("dialog", { name: "Tech Tree" });
  await expect(
    screen.getByRole("status", { name: "Science to spend" }),
  ).toHaveText("5 Science to spend");
  // Every category is a column of the one tree, with how many are unlocked.
  for (const category of ["Power 2/7", "Mobility 2/6"]) {
    await expect(screen.getByRole("group", { name: "Designs" })).toContainText(
      category,
    );
  }
  // A starting Design is unlocked, and says what it lets the base have.
  const solarNode = designInTree(screen, "Solar arrays");
  await expect(solarNode).toContainText("Starting");
  await expect(solarNode).toContainText("Solar array");
  await expect(solarNode).toHaveAttribute("data-state", "unlocked");
  const solar = await pickDesign(screen, "Solar arrays");
  await expect(solarNode).toHaveAttribute("aria-pressed", "true");
  await expect(solar).toContainText("✓ Unlocked");
  await expect(
    solar.getByRole("button", { name: "Unlock Solar arrays" }),
  ).toBeHidden();

  // One beyond them, with its cost, what it needs first and why it is out of reach.
  await expect(designInTree(screen, "Large battery banks")).toContainText(
    "25 Science",
  );
  const large = await pickDesign(screen, "Large battery banks");
  await expect(solarNode).toHaveAttribute("aria-pressed", "false");
  await expect(large).toContainText("25 Science");
  await expect(large).toContainText("Needs 20 more Science");
  await expect(
    large.getByRole("button", { name: "✓ Battery banks", exact: true }),
  ).toBeVisible();

  // One further along lists what is still to unlock to reach it, each after
  // what it needs, and what that all costs.
  const lights = await pickDesign(screen, "Landing pad lights");
  await expect(lights).toContainText("Needs Tall Light Masts first");
  await expect(lights.getByRole("listitem")).toHaveText([
    "Large battery banks 25 Science",
    "Tall Light Masts 150 Science",
    "Landing pad lights 220 Science",
  ]);
  await expect(lights).toContainText(
    "3 Designs, 395 Science in all; the base has 5 Science.",
  );
  // Picking one there picks it in the tree.
  await lights
    .getByRole("listitem")
    .getByRole("button", { name: "Large battery banks" })
    .click();
  await expect(designInTree(screen, "Large battery banks")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(large.getByRole("heading", { level: 3 })).toHaveText(
    "Large battery banks",
  );

  await large
    .getByRole("button", { name: "Unlock Large battery banks" })
    .click();
  await expect(screen.getByRole("alert")).toHaveText(
    "Large battery banks needs 25 Science, and the base has 5.",
  );
  await expect(science).toHaveText("5");
});
