import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  crowdedSave,
  plantBaseSave,
  useCrowdedCatalogue,
  type SaveFile,
} from "./crowded";

// The smallest screen the status panel is laid out for.
test.use({ viewport: { width: 1920, height: 1080 } });

const panelOf = (page: Page): Locator =>
  page.getByRole("complementary", { name: "Status panel" });
const listOf = (page: Page): Locator =>
  panelOf(page).getByRole("status", { name: "Bulk resources", exact: true });
const rowsOf = (page: Page): Locator => listOf(page).locator("[data-row]");

async function setSpeed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name })
    .click();
}

async function load(page: Page, save: string | SaveFile): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(save);
}

test("15 bulk resources stay readable, a line each, and fold away to their headline figures and dot", async ({
  page,
}) => {
  await useCrowdedCatalogue(page);
  await page.goto("/?seed=1");
  await setSpeed(page, "Pause");
  await load(page, crowdedSave());
  const panel = panelOf(page);
  const rows = rowsOf(page);

  // Stock, how fast it is changing, and how long it will last.
  await setSpeed(page, "1x");
  await expect(rows.filter({ hasText: "Silicon" })).toHaveText(
    /^Silicon\s*\d+ kg\s*−\d+\.\d kg\/day, ~\S+/,
  );
  await setSpeed(page, "Pause");
  await expect(rows).toHaveCount(15);

  // Each takes one line, with nothing cut off, the longest name included.
  for (const row of await rows.all()) {
    const size = await row.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      overflow: element.scrollWidth - element.clientWidth,
    }));
    expect(size.height).toBeLessThan(20);
    expect(size.overflow).toBeLessThanOrEqual(0);
  }

  // With the sections above folded, all 15 are in sight without scrolling.
  const title = (name: string) => panel.getByText(name, { exact: true });
  for (const name of ["Milestones", "Mission Director", "Stock"]) {
    await title(name).click();
  }
  for (const row of await rows.all()) {
    await expect(row).toBeInViewport({ ratio: 1 });
  }
  expect(
    await panel.evaluate(
      (element) => element.scrollHeight - element.clientHeight,
    ),
  ).toBe(0);

  // About to run out, silicon needs attention, open or folded.
  const section = panel.locator("details", {
    has: page.getByText("Bulk resources", { exact: true }),
  });
  const dot = section.getByTitle("Something here needs attention");
  await expect(dot).toBeVisible();
  await title("Bulk resources").click();
  await expect(rows.first()).toBeHidden();
  await expect(dot).toBeVisible();
  const summary = panel.getByRole("status", { name: "Bulk resources summary" });
  await expect(summary).toHaveText(/^Silicon \d+[dh] · Regolith \d+ kg$/);
  // Beside its title, and not cut short.
  expect(
    await summary.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  // Still folded on the next visit.
  await page.reload();
  await expect(summary).toBeVisible();
  await expect(rows.first()).toBeHidden();
});

test("a bulk resource shows from when the base first has some, and stays once it is used up, until another Campaign is loaded", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await setSpeed(page, "Pause");
  const rows = rowsOf(page);
  // None so far, and the section says so.
  await expect(rows).toHaveCount(0);
  await expect(listOf(page)).toHaveText("none in stock");

  // Just enough silicon for one more Batch, with nothing making any more.
  await load(
    page,
    plantBaseSave((state) => {
      state.structures = state.structures.filter(
        (structure) => structure.structureTypeId !== "extraction-plant",
      );
      state.bulkResources = [
        { resourceId: "regolith", kilograms: 500 },
        { resourceId: "silicon", kilograms: 0.35 },
      ];
    }),
  );
  const silicon = rows.filter({ hasText: "Silicon" });
  await expect(silicon).toBeVisible();
  await expect(rows.filter({ hasText: "Water ice" })).toHaveCount(0);
  await expect(listOf(page)).not.toContainText("none in stock");

  await setSpeed(page, "20x");
  await expect(rows.filter({ hasText: "Wafers" })).toBeVisible();
  // Used up with nothing going on, it stays.
  await expect(silicon).toHaveText(/^Silicon\s*0 kg\s*$/);
  await setSpeed(page, "Pause");

  // Another Campaign's base starts again from what it has.
  await load(
    page,
    fileURLToPath(
      new URL("../test/saves/version-38.moonbase", import.meta.url),
    ),
  );
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Regolith 2000 kg");
});
