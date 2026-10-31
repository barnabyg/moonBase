import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { catalogue } from "../src/catalogue";
import { actsCatalogueModule } from "../test/with-acts";
import type { SaveFile } from "./crowded";
import { placeOnClearGround } from "./placement";

// These run on made-up Acts, to try more than the real catalogue has yet. The
// tests of Act 2 itself are in `act-2.spec.ts`.

const milestoneIds = catalogue.milestones.map((milestone) => milestone.id);

/**
 * Shares the page's Milestones out among made-up Acts (`test/with-acts.ts`).
 * Call it before `page.goto`.
 */
async function useActs(page: Page, sizes: readonly number[]): Promise<void> {
  await page.route("**/src/catalogue/catalogue.ts*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: actsCatalogueModule(await response.text(), sizes),
    });
  });
}

/**
 * A sample save of a base with a battery bank, saved with power storage
 * reached, and with these Milestones reached instead. Power storage, if it
 * isn't one of them, is reached in the first game-minute played.
 */
function saveWithReached(reachedMilestoneIds: readonly string[]): SaveFile {
  const save = JSON.parse(
    readFileSync(
      new URL("../test/saves/version-40.moonbase", import.meta.url),
      "utf8",
    ),
  ) as { state: { reachedMilestoneIds: readonly string[] } };
  save.state.reachedMilestoneIds = reachedMilestoneIds;
  return {
    name: "milestones.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  };
}

async function pause(page: Page): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
}

async function load(page: Page, save: SaveFile): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(save);
}

function milestonesSection(page: Page) {
  const panel = page.getByRole("complementary", { name: "Status panel" });
  return {
    panel,
    act: panel.getByRole("status", { name: "Current Act" }),
    asks: panel.getByRole("status", { name: "Act asks" }),
    current: panel.getByRole("status", { name: "Current Milestone" }),
    hint: panel.getByRole("status", { name: "Milestone hint" }),
    next: panel.getByRole("status", { name: "Next Milestone" }),
    living: panel.getByRole("status", { name: "Mission Director" }),
    summary: panel.getByRole("status", { name: "Milestones summary" }),
    toggle: panel.getByText("Milestones", { exact: true }),
    notifications: page.getByRole("log", { name: "Notifications" }),
    skip: page.getByRole("button", { name: "Skip to next event" }),
  };
}

test("with the last Milestone reached, the panel shows the last Act, and says so sensibly, with no line below moving up", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await pause(page);
  const section = milestonesSection(page);
  await expect(section.act).toHaveText("Act 1");
  await expect(section.asks).toHaveText(/^Keep the Mission Director alive/);

  await load(
    page,
    saveWithReached(milestoneIds.filter((id) => id !== "power-storage")),
  );
  await expect(section.act).toHaveText("Act 1");
  await expect(section.current).toHaveText(
    "Now Power storage before the first Night",
  );
  await expect(section.next).toHaveText("Next none left");
  const before = await section.living.boundingBox();

  await section.skip.click();

  await expect(section.notifications).toContainText(
    "Milestone reached: Power storage before the first Night",
  );
  await expect(section.notifications).toContainText(
    "Act 2: Independence begins.",
  );
  await expect(section.act).toHaveText("Act 2: Independence");
  await expect(section.asks).toHaveText(
    "Everything this Act asks of you is done.",
  );
  await expect(section.current).toHaveText("Now Every Milestone reached");
  await expect(section.hint).toContainText("The Campaign carries on");
  await expect(section.next).toHaveText("Next none left");
  const after = await section.living.boundingBox();
  expect(after?.y).toBeGreaterThanOrEqual(before?.y ?? Infinity);

  await section.toggle.click();
  await expect(section.summary).toHaveText("every Milestone reached");
});

test("with several Acts, reaching the Milestone that closes one moves the panel on, with a notification and the next Milestone's Act named beforehand", async ({
  page,
}) => {
  await useActs(page, [1]);
  await page.goto("/?seed=1");
  await pause(page);
  const section = milestonesSection(page);
  await expect(section.act).toHaveText("Act 1");
  await expect(section.asks).toHaveText("Do what Act 1 asks.");
  await expect(section.current).toHaveText(
    "Now Power storage before the first Night",
  );
  await expect(section.next).toHaveText(
    "Next Habitat commissioned, Mission Director moved in, in Act 2: Made-up",
  );

  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Battery bank/ })
    .click();
  await placeOnClearGround(page);
  await expect(page.getByRole("status", { name: "Placement" })).toHaveText(
    "Battery bank planned. The Robot will carry out its Construction.",
  );

  // Skip from event to event until the new Act starts, which stops the skip
  // there.
  for (let skips = 0; skips < 30; skips++) {
    if (
      (await section.notifications.isVisible()) &&
      (await section.notifications.textContent())?.includes("begins") === true
    ) {
      break;
    }
    await section.skip.click();
  }

  await expect(section.notifications).toContainText(
    "Milestone reached: Power storage before the first Night",
  );
  await expect(section.notifications).toContainText(
    "Act 2: Made-up begins. Do what Act 2 asks.",
  );
  await expect(section.act).toHaveText("Act 2: Made-up");
  await expect(section.asks).toHaveText("Do what Act 2 asks.");
  await expect(section.current).toHaveText(
    "Now Habitat commissioned, Mission Director moved in",
  );
  await expect(section.next).toHaveText("Next Lander departs");

  await section.toggle.click();
  await expect(section.summary).toHaveText(
    "Habitat commissioned, Mission Director moved in",
  );
});

test("with several Acts, a loaded save shows the Act its reached Milestones imply with no notification of a new one, and the last Act once all are reached", async ({
  page,
}) => {
  await useActs(page, [1]);
  await page.goto("/?seed=1");
  await pause(page);
  const section = milestonesSection(page);
  await expect(section.act).toHaveText("Act 1");

  await load(page, saveWithReached(["power-storage"]));
  await expect(section.act).toHaveText("Act 2: Made-up");
  await expect(section.asks).toHaveText("Do what Act 2 asks.");
  await section.skip.click();
  await expect(section.notifications).toBeVisible();
  await expect(section.notifications).not.toContainText("begins");

  await load(page, saveWithReached(milestoneIds));
  await expect(section.act).toHaveText("Act 2: Made-up");
  await expect(section.asks).toHaveText(
    "Everything this Act asks of you is done.",
  );
  await expect(section.current).toHaveText("Now Every Milestone reached");
  await expect(section.next).toHaveText("Next none left");
});
