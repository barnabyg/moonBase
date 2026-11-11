import { expect, test, type Page } from "@playwright/test";
import { catalogue } from "../src/catalogue";
import { isPlannedAsItself } from "../src/simulation";
import { groupBuildOptions } from "../src/ui/build-menu-text";
import { tryScenarios } from "../test/try-scenarios";

/**
 * Starts the base `npm run try -- everything-unlocked` does, with the game
 * paused so that nothing moves on between the steps.
 */
async function loadEverythingUnlocked(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "everything-unlocked");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "everything-unlocked.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
}

const offered = catalogue.structureTypes.filter(isPlannedAsItself);

/** The headings of the build menu's groups that show, in order. */
function headings(page: Page) {
  return page
    .getByRole("complementary", { name: "Build menu" })
    .locator(".build-group:not([hidden]) > summary");
}

/** Matches an open group's heading: its label and how many it offers. */
function heading(label: string, count: number): RegExp {
  return new RegExp(String.raw`^${label}\s*${count}(?!\d)`);
}

test("a new Campaign's build menu shows only the groups that offer something, in the Base panel's order", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const starting = new Set(
    catalogue.designs.filter(({ starting }) => starting).map(({ id }) => id),
  );
  const expected = groupBuildOptions(
    offered.filter(({ designId }) => starting.has(designId)),
  );
  expect(expected.length).toBeLessThan(catalogue.structureListGroups.length);
  await expect(headings(page)).toHaveText(
    expected.map(({ label, types }) => heading(label, types.length)),
    { useInnerText: true },
  );
});

test("with every Design unlocked the build menu lists them by what they are for, sets back those whose Components aren't in stock, and each group folds and stays folded after a reload", async ({
  page,
}) => {
  await loadEverythingUnlocked(page);
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  const groups = groupBuildOptions(offered);
  await expect(headings(page)).toHaveText(
    groups.map(({ label, types }) => heading(label, types.length)),
    { useInnerText: true },
  );

  // A Design is found under its group.
  const power = buildMenu.getByRole("group", { name: "Power" });
  await expect(
    power.getByRole("button", { name: /^Solar array/ }),
  ).toBeVisible();
  await expect(
    buildMenu
      .getByRole("group", { name: "Science" })
      .getByRole("button", { name: /^Infrared telescope/ }),
  ).toBeVisible();

  // What the stock can't supply is set back, in words as well as looks.
  const short = buildMenu.getByRole("button", { name: / 0 available$/ });
  const ready = buildMenu.getByRole("button", {
    name: / [1-9]\d* available$/,
  });
  await expect(short.first()).toBeVisible();
  await expect(ready.first()).toBeVisible();
  await expect(short.first()).toHaveCSS("border-top-style", "dashed");
  await expect(ready.first()).toHaveCSS("border-top-style", "solid");
  await expect(short.first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(
    await ready
      .first()
      .evaluate((button) => getComputedStyle(button).backgroundColor),
  ).not.toBe("rgba(0, 0, 0, 0)");

  // Folded, a group says how many of its Designs could be built now.
  const powerHeading = buildMenu.locator(".build-group > summary", {
    hasText: /^Power/,
  });
  const summary = buildMenu.getByRole("status", { name: "Power summary" });
  await expect(summary).toBeHidden();
  await powerHeading.click();
  await expect(power.getByRole("button").first()).toBeHidden();
  await expect(summary).toHaveText(/^(\d+|none|all) can be built now$/);

  await page.reload();
  await expect(
    buildMenu.locator(".build-group > summary", { hasText: /^Power/ }),
  ).toBeVisible();
  await expect(
    buildMenu.getByRole("button", { name: /^Solar array/ }),
  ).toBeHidden();
  await expect(
    buildMenu.getByRole("button", { name: /^Battery bank/ }),
  ).toBeHidden();
});

test("the grouped build menu fits a narrow left column without cutting a Design's name or badge", async ({
  page,
}) => {
  await loadEverythingUnlocked(page);
  // As narrow as the left column gets on a small window.
  await page.addStyleTag({ content: ".left-column { width: 290px; }" });
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  await expect(
    buildMenu.getByRole("button", { name: /^Solar array/ }),
  ).toBeVisible();
  const overflowing = await buildMenu.evaluate((menu) =>
    [menu, ...menu.querySelectorAll("button, summary")]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.textContent),
  );
  expect(overflowing).toEqual([]);
});
