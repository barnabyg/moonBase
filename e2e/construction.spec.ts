import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { dismantle, structureEntries, structuresList } from "./base-panel";
import { placeOnClearGround } from "./placement";

test("the Robot carries out the Construction of a solar array placed on the map, and a second one waits for Components", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  const solarArray = buildMenu.getByRole("button", { name: /Solar array/ });
  await expect(solarArray).toContainText("1 available");

  await solarArray.click();
  await placeOnClearGround(page);

  await expect(page.getByRole("status", { name: "Placement" })).toHaveText(
    "Solar array planned. The Robot will carry out its Construction.",
  );
  const work = page.getByRole("complementary", {
    name: "Work",
  });
  await expect(work).toContainText("Site Preparation");
  // Its Components are promised, so a second one would have to wait for more.
  await expect(solarArray).toContainText("0 available");
  await solarArray.click();
  await expect(page.getByRole("status", { name: "Placement" })).toContainText(
    "Its Components aren't in the base's stock, so its Construction will wait for them.",
  );
  await placeOnClearGround(page);

  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "20x" })
    .click();

  await expect(structureEntries(page)).toHaveText([
    /^Solar array Condition 100% Dust coating \d+%(?!,)/,
  ]);
  await expect(
    page.getByRole("status", { name: "Power", exact: true }),
  ).toHaveText(/^Power \+\d+\.\d kW · [1-9]\d*\.\d made, \d+\.\d used$/);
  await expect(page.getByRole("status", { name: "Stored power" })).toHaveText(
    "Stored no battery banks",
  );
  await expect(work).toContainText(
    "Waiting: 2 solar panels and 1 array mast aren't in the base's stock",
  );
  await expect(solarArray).toContainText("0 available");
});

test("a solar array can't be placed over the Lander", async ({ page }) => {
  await page.goto("/?seed=1");
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Solar array/ })
    .click();
  const box = await page.locator("canvas").boundingBox();
  if (box === null) throw new Error("The 3D view has no size.");

  // The game opens looking straight at the Lander.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.getByRole("status", { name: "Placement" })).toHaveText(
    "The solar array would overlap the Lander.",
  );
  await expect(page.getByRole("complementary", { name: "Work" })).toHaveText(
    "WorkNo work under way",
  );
});

/** Plans a solar array on clear ground with the game paused. */
async function planSolarArray(page: Page): Promise<void> {
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Solar array/ })
    .click();
  await placeOnClearGround(page);
}

test("cancelling a Construction removes it and frees its Components", async ({
  page,
}) => {
  await planSolarArray(page);
  const work = page.getByRole("complementary", { name: "Work" });
  const solarArray = page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Solar array/ });
  await expect(solarArray).toContainText("0 available");

  await work.getByRole("button", { name: "Cancel" }).click();

  await expect(work).toHaveText("WorkNo work under way");
  await expect(solarArray).toContainText("1 available");
});

test("work that can't go on is marked, listed below work under way and counted in the Work panel's title", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  // A parking area's Components aren't in the base's stock at the start,
  // and a solar array's are, so the one planned first waits for them.
  await buildMenu.getByRole("button", { name: /^Parking area/ }).click();
  await placeOnClearGround(page);
  await buildMenu.getByRole("button", { name: /Solar array/ }).click();
  await placeOnClearGround(page);

  const work = page.getByRole("complementary", { name: "Work" });
  const rows = work.getByRole("listitem");
  await expect(rows).toHaveText([
    /^Solar array.*Waiting for the Robot/,
    /^Parking area.*Waiting: .* in the base's stock/,
  ]);
  await expect(work.locator(".panel-section__count")).toHaveText("2");
  await expect(work.getByRole("status", { name: "Work summary" })).toHaveText(
    "1 waiting",
  );
  await expect(
    work.getByRole("status", { name: "Work summary" }),
  ).toBeVisible();

  // Told apart by a bar down its side, and not by colour alone.
  const sideBar = (row: typeof work) =>
    row.evaluate((element) => getComputedStyle(element).borderLeftWidth);
  expect(await sideBar(rows.nth(0))).toBe("0px");
  expect(await sideBar(rows.nth(1))).toBe("3px");

  // With the solar array cancelled, the parking area is all there is.
  await rows.nth(0).getByRole("button", { name: "Cancel" }).click();
  await expect(rows).toHaveText([/^Parking area/]);
  await expect(work.locator(".panel-section__count")).toHaveText("1");
});

test("the Work panel folds away like the other sections, and stays folded", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const work = page.getByRole("complementary", { name: "Work" });
  const idle = work.getByText("No work under way");
  await expect(idle).toBeVisible();

  await work.getByText("Work", { exact: true }).click();
  await expect(idle).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Work" }).getByText("Work", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(idle).toBeHidden();
});

test("a Construction that waited for Components is no longer marked once they are its own", async ({
  page,
}) => {
  await planSolarArray(page);
  // A second waits for the first one's Components.
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Solar array/ })
    .click();
  await placeOnClearGround(page);
  const work = page.getByRole("complementary", { name: "Work" });
  const rows = work.getByRole("listitem");
  const heldUp = work.locator(".construction-panel__row--held-up");
  await expect(heldUp).toHaveCount(1);
  await expect(heldUp).toHaveAttribute("data-row", /.+/);
  const second = (await heldUp.getAttribute("data-row")) ?? "";

  await rows.nth(0).getByRole("button", { name: "Cancel" }).click();

  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toHaveAttribute("data-row", second);
  await expect(heldUp).toHaveCount(0);
  await expect(work.getByRole("status", { name: "Work summary" })).toBeHidden();
});

test("in a window too short for the Work and Base panels, the Base panel scrolls and the Work panel keeps its work in sight", async ({
  page,
}) => {
  // A base with Structures enough to list, and a solar array's Components.
  await page.goto("/?seed=1");
  await page.getByRole("button", { name: "Pause" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles(
    fileURLToPath(
      new URL("../test/saves/version-35.moonbase", import.meta.url),
    ),
  );
  // Two Plants, and the row its two solar arrays share.
  await expect(structureEntries(page)).toHaveCount(3);
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Solar array/ })
    .click();
  await placeOnClearGround(page);
  const work = page.getByRole("complementary", { name: "Work" });
  const base = page.getByRole("complementary", { name: "Base" });
  await expect(work).toContainText("Site Preparation");
  await expect(work.getByRole("button", { name: "Cancel" })).toBeVisible();

  await page.setViewportSize({ width: 1920, height: 520 });

  /** How much of a panel is out of sight, to be scrolled to, in pixels. */
  const outOfSight = (panel: typeof work): Promise<number> =>
    panel.evaluate((element) => element.scrollHeight - element.clientHeight);
  await expect.poll(() => outOfSight(base)).toBeGreaterThan(0);
  expect(await outOfSight(work)).toBe(0);
  await expect(work.getByRole("button", { name: "Cancel" })).toBeInViewport({
    ratio: 1,
  });
});

test("dismantling a Structure has the Robot take it apart and return a spare Component", async ({
  page,
}) => {
  await planSolarArray(page);
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const structures = structuresList(page);
  await skip.click();
  await expect(structures.getByRole("listitem")).toHaveText([
    /^Solar array Condition \d+% Dust coating/,
  ]);

  await dismantle(page, structures.getByRole("listitem"));

  const work = page.getByRole("complementary", { name: "Work" });
  await expect(work).toContainText("Dismantling the solar array");
  await expect(structures.getByRole("listitem")).toHaveText([
    /^Solar array Condition \d+% to be dismantled/,
  ]);
  await skip.click();
  await expect(work).toHaveText("WorkNo work under way");
  await expect(structures).toBeHidden();
  await expect(page.getByRole("log", { name: "Notifications" })).toContainText(
    "Solar array dismantled, 1 spare component back in the base's stock",
  );
  // What came back is a spare Component, not its solar panels, so another
  // solar array can't be planned from it.
  await expect(
    page
      .getByRole("complementary", { name: "Build menu" })
      .getByRole("button", { name: /Solar array/ }),
  ).toContainText("0 available");
});
