import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { structureEntry } from "./base-panel";

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
  const science = page.getByRole("status", { name: "Science", exact: true });
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

test("three Research Tasks queue behind the one running, start in order by themselves, and survive a save and load", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  const notifications = page.getByRole("log", { name: "Notifications" });
  const running = panel.getByRole("status", { name: "Research Task" });
  const panelQueue = panel.getByRole("status", { name: "Research queue" });
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  // With nothing queued yet, there is no line for the queue.
  await expect(panelQueue).toBeHidden();

  await page.getByRole("button", { name: "Research Tasks" }).click();
  const screen = page.getByRole("dialog", { name: "Research Tasks" });
  const queue = screen.getByRole("region", { name: "Research queue" });
  await expect(queue).toContainText("0 of 3");
  await screen
    .getByRole("button", { name: "Start Regolith sample analysis" })
    .click();
  for (const label of [
    "Ice volatiles assay",
    "Radiation environment survey",
    "Dust levitation study",
  ]) {
    await screen.getByRole("button", { name: `Queue ${label}` }).click();
  }
  const queued = queue.getByRole("listitem");
  await expect(queued).toHaveText([
    /Ice volatiles assay/,
    /Radiation environment survey/,
    /Dust levitation study/,
  ]);
  await expect(queue).toContainText("3 of 3");
  await expect(
    screen.getByRole("article", { name: "Radiation environment survey" }),
  ).toContainText("Queued 2");
  // A fourth is refused, with the reason.
  await screen
    .getByRole("button", { name: "Queue Lander turnaround study" })
    .click();
  await expect(screen.getByRole("alert")).toHaveText(
    "The queue is full: 3 Research Tasks are waiting already.",
  );

  // Removing one keeps the others in order, and lets it be queued again.
  await screen
    .getByRole("button", {
      name: "Remove Radiation environment survey from the queue",
    })
    .click();
  await expect(queued).toHaveText([
    /Ice volatiles assay/,
    /Dust levitation study/,
    /Empty/,
  ]);
  await expect(
    screen.getByRole("button", { name: "Queue Radiation environment survey" }),
  ).toBeVisible();
  await screen.getByRole("button", { name: "Close" }).click();
  await expect(panelQueue).toHaveText(
    "Queued 1. Ice volatiles assay, 2. Dust levitation study",
  );

  // Saved and loaded, the queue is as it was.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = await (await download).path();
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  // With nothing queued yet, there is no line for the queue.
  await expect(panelQueue).toBeHidden();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(saved);
  await expect(panelQueue).toHaveText(
    "Queued 1. Ice volatiles assay, 2. Dust levitation study",
  );

  // Skip from event to event: the next starts as the one running completes.
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const started = notifications.getByText(
    "Ice volatiles assay started from the queue",
  );
  for (let skips = 0; skips < 20 && !(await started.isVisible()); skips++) {
    await skip.click();
    await nextFrame(page);
  }
  await expect(started).toBeVisible();
  await expect(
    notifications.getByText(
      "Regolith sample analysis complete, earning 5 Science",
    ),
  ).toBeVisible();
  await expect(running).toContainText("Ice volatiles assay");
  await expect(panelQueue).toHaveText("Queued 1. Dust levitation study");
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
  const science = page.getByRole("status", { name: "Science", exact: true });
  // A new Campaign has no telescope, so the line isn't shown.
  await expect(observing).toBeHidden();

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(telescopeSave);

  await expect(observing).toHaveText(
    "Observing Night-sky survey · observing, 1d 14h left",
  );
  await expect(structureEntry(page, "Telescope")).toContainText("observing");
  await expect(science).toHaveText("70");
  // Folded, the Research section still shows how far the round has got,
  // after the Research Task running.
  const researchTitle = panel.getByText("Research", { exact: true });
  await researchTitle.click();
  await expect(
    panel.getByRole("status", { name: "Research summary" }),
  ).toHaveText("Thermal cycling survey · 49%, Night-sky survey · 20%");
  await researchTitle.click();
  // The Research Tasks screen shows it beside the task running.
  await page.getByRole("button", { name: "Research Tasks" }).click();
  const tasks = page.getByRole("dialog", { name: "Research Tasks" });
  const standing = tasks.getByRole("status", { name: "Observing programme" });
  await expect(standing).toContainText("Night-sky survey");
  await expect(standing).toContainText("observing, 1d 14h left");
  await expect(standing).toContainText("each round pays 6 Science");
  await tasks.getByRole("button", { name: "Close" }).click();

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

test("the Research section says how fast the base earns Science, and points out Science left unspent with nothing queued", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  const panel = page.getByRole("complementary", { name: "Status panel" });
  const earned = panel.getByRole("status", { name: "Earned an Earth Day" });
  const queue = panel.getByRole("status", { name: "Research queue" });
  // A new Campaign earns none, and has none to spend.
  await expect(earned).toBeHidden();
  await expect(queue).toBeHidden();

  // A Research Task running earns its Science over its length: 5 in 6 hours.
  await page.getByRole("button", { name: "Research Tasks" }).click();
  const screen = page.getByRole("dialog", { name: "Research Tasks" });
  await screen
    .getByRole("button", { name: "Start Regolith sample analysis" })
    .click();
  await screen.getByRole("button", { name: "Close" }).click();
  await expect(earned).toHaveText("Science +20.0 a day");
  await expect(earned).toHaveAttribute(
    "title",
    "As things stand: the Research Task running 20.0 Science an Earth Day.",
  );
  await expect(queue).toBeHidden();

  // The sample has 70 Science in hand, a Research Task running and nothing
  // queued behind it.
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(telescopeSave);
  await expect(queue).toHaveText(
    /^Queued none · Science for (\d+ Designs|[A-Z].+)$/,
  );
  await expect(queue).toHaveClass(/stat--nudge/);

  // With a Research Task queued, the line lists it instead.
  await page.getByRole("button", { name: "Research Tasks" }).click();
  await screen
    .getByRole("button", { name: /^Queue / })
    .first()
    .click();
  await screen.getByRole("button", { name: "Close" }).click();
  await expect(queue).toHaveText(/^Queued 1\. \S.*$/);
  await expect(queue).not.toHaveClass(/stat--nudge/);
});
