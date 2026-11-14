import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { structureEntries } from "./base-panel";
import { placeOnClearGround, planSolarArray } from "./placement";

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
  const heldUp = work.locator(".work-panel__row--held-up");
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
