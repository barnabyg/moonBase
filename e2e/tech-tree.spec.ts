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

test("the Tech Tree screen shows each Design by category with its cost, prerequisites and state, and says why one can't be unlocked yet", async ({
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
  // Power is shown first, one category to a tab.
  const power = screen.getByRole("tabpanel", { name: /^Power/ });
  await expect(screen.getByRole("tab", { name: /^Power/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // A starting Design is unlocked, and has no Unlock button.
  const solar = power.getByRole("article", { name: "Solar arrays" });
  await expect(solar).toContainText("Starting");
  await expect(solar).toContainText("Unlocked");
  await expect(
    solar.getByRole("button", { name: "Unlock Solar arrays" }),
  ).toBeHidden();
  // One beyond them, with its cost, what it needs first and why it is out of reach.
  const large = power.getByRole("article", { name: "Large battery banks" });
  await expect(large).toContainText("25 Science");
  await expect(large).toContainText("Battery banks");
  await expect(large).toContainText("Needs 20 more Science");
  // Another category is a tab away.
  await screen.getByRole("tab", { name: /^Mobility/ }).click();
  await expect(power).toBeHidden();
  await expect(
    screen
      .getByRole("tabpanel", { name: /^Mobility/ })
      .getByRole("article", { name: "Landing pad lights" }),
  ).toContainText("Needs Tall Light Masts first");

  await screen.getByRole("tab", { name: /^Power/ }).click();
  await screen
    .getByRole("button", { name: "Unlock Large battery banks" })
    .click();
  await expect(screen.getByRole("alert")).toHaveText(
    "Large battery banks needs 25 Science, and the base has 5.",
  );
  await expect(science).toHaveText("5");
});
