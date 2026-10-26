import "./frame-probe";
import { expect, test, type Page } from "@playwright/test";
import { placeOnClearGround } from "./placement";

test("the Robot carries out the Construction of a solar array placed on the map, and a second one waits for Components", async ({
  page,
}) => {
  test.setTimeout(60_000);
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
    "Its Components aren't in the cargo stock, so its Construction will wait for them.",
  );
  await placeOnClearGround(page);

  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "20x" })
    .click();

  await expect(
    page.getByRole("list", { name: "Structures" }).getByRole("listitem"),
  ).toHaveText([/^Solar array: commissioned(?!,)/], { timeout: 45_000 });
  await expect(
    page.getByRole("status", { name: "Power", exact: true }),
  ).toHaveText(/^Power: [1-9]\d*\.\d\d kW generated, \d+\.\d\d kW used$/);
  await expect(page.getByRole("status", { name: "Stored power" })).toHaveText(
    "Stored: no battery banks",
  );
  await expect(work).toContainText(
    "Waiting: 2 solar panels and 1 array mast aren't in the cargo stock",
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
  await expect(page.getByRole("complementary", { name: "Work" })).toBeHidden();
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

  await expect(work).toBeHidden();
  await expect(solarArray).toContainText("1 available");
});

test("dismantling a Structure has the Robot take it apart and return most of its Components", async ({
  page,
}) => {
  await planSolarArray(page);
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const structures = page.getByRole("list", { name: "Structures" });
  await skip.click();
  await expect(structures.getByRole("listitem")).toHaveText([
    /^Solar array: commissioned/,
  ]);

  await structures.getByRole("button", { name: "Dismantle" }).click();

  const work = page.getByRole("complementary", { name: "Work" });
  await expect(work).toContainText("Dismantling the solar array");
  await expect(structures.getByRole("listitem")).toHaveText([
    /^Solar array: to be dismantled/,
  ]);
  await skip.click();
  await expect(work).toBeHidden();
  await expect(structures).toBeHidden();
  // One of its two solar panels was damaged beyond reuse, so another solar
  // array can't be planned from what came back.
  await expect(
    page
      .getByRole("complementary", { name: "Build menu" })
      .getByRole("button", { name: /Solar array/ }),
  ).toContainText("0 available");
});
