import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * A sample save of a Campaign in its first Night, with a telescope ten
 * hours into a round of the observing programme, on a network with a
 * solar array and three battery banks, and 70 Science in hand.
 */
const telescopeSave = fileURLToPath(
  new URL("../test/saves/version-39.moonbase", import.meta.url),
);

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

test("a Research Task started from the Research Tasks screen runs for its length and earns Science", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  const notifications = page.getByRole("log", { name: "Notifications" });
  const science = page.getByRole("status", { name: "Science" });
  const running = panel.getByRole("status", { name: "Research Task" });
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  await expect(science).toHaveText("0");
  await expect(running).toHaveText("Task none running");

  await page.getByRole("button", { name: "Research Tasks" }).click();
  const screen = page.getByRole("dialog", { name: "Research Tasks" });
  const nowRunning = screen.getByRole("status", {
    name: "Research Task running",
  });
  await expect(nowRunning).toContainText("Nothing running");
  // Its card has its length and the Science it pays.
  const firstTask = screen
    .getByRole("region", { name: "Available" })
    .getByRole("article", { name: "Regolith sample analysis" });
  await expect(firstTask).toContainText("6 hours");
  await expect(firstTask).toContainText("5 Science");
  await screen
    .getByRole("button", { name: "Start Regolith sample analysis" })
    .click();
  await expect(nowRunning).toContainText("Now running");
  await expect(nowRunning).toContainText("Regolith sample analysis");
  await expect(nowRunning).toContainText(
    "6 hours left, then it pays 5 Science",
  );
  await expect(firstTask).toContainText("Running");
  // A second one is refused, with the reason.
  await screen
    .getByRole("button", { name: "Start Ice volatiles assay" })
    .click();
  await expect(screen.getByRole("alert")).toHaveText(
    "Regolith sample analysis is running, and only one Research Task runs at a time.",
  );
  await screen.getByRole("button", { name: "Close" }).click();
  await expect(running).toHaveText("Task Regolith sample analysis · 6h left");

  // Skip from event to event until it is complete.
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const completed = notifications.getByText(
    "Regolith sample analysis complete, earning 5 Science",
  );
  for (let skips = 0; skips < 20 && !(await completed.isVisible()); skips++) {
    await skip.click();
    await nextFrame(page);
  }
  await expect(completed).toBeVisible();
  await expect(science).toHaveText("5");
  await expect(running).toHaveText("Task none running");

  await page.getByRole("button", { name: "Research Tasks" }).click();
  // It has moved under the completed ones.
  await expect(
    screen
      .getByRole("region", { name: "Completed" })
      .getByRole("article", { name: "Regolith sample analysis" }),
  ).toContainText("Completed");
  await expect(
    screen.getByRole("button", { name: "Start Regolith sample analysis" }),
  ).toBeHidden();
});

test("the Research section shows the observing programme a telescope works on at Night, and the Science each round earns", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  const panel = page.getByRole("complementary", { name: "Status panel" });
  const observing = panel.getByRole("status", { name: "Observing programme" });
  const science = page.getByRole("status", { name: "Science" });
  // A new Campaign has no telescope, so the line isn't shown.
  await expect(observing).toBeHidden();

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(telescopeSave);

  await expect(observing).toHaveText(
    "Observing Night-sky survey · observing, 1d 14h left",
  );
  await expect(
    page
      .getByRole("list", { name: "Structures" })
      .getByRole("listitem")
      .filter({ hasText: "Telescope" }),
  ).toContainText("observing");
  await expect(science).toHaveText("70");

  // Skip from event to event until the round is complete.
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const completed = page
    .getByRole("log", { name: "Notifications" })
    .getByText(
      "Night-sky survey: a round of observing complete, earning 6 Science",
    );
  for (let skips = 0; skips < 40 && !(await completed.isVisible()); skips++) {
    await skip.click();
    await nextFrame(page);
  }
  await expect(completed).toBeVisible();
  await expect(science).toHaveText("76");
  await expect(observing).toHaveText(
    "Observing Night-sky survey · observing, 2d left",
  );
});
