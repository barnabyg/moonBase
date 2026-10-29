import { expect, test, type Page } from "@playwright/test";
import { placeOnClearGround } from "./placement";

/**
 * Plans a solar array on clear ground with the game paused, and returns
 * where on the screen it stands.
 */
async function planSolarArray(
  page: Page,
): Promise<{ readonly x: number; readonly y: number }> {
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Solar array/ })
    .click();
  return placeOnClearGround(page);
}

/** A point on the map well away from the solar array, as the placement helper tries others. */
async function emptyGround(
  page: Page,
  site: { readonly x: number; readonly y: number },
): Promise<{ readonly x: number; readonly y: number }> {
  const box = await page.locator("canvas").boundingBox();
  if (box === null) throw new Error("The 3D view has no size.");
  const left = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.75 };
  const right = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.75 };
  return Math.hypot(site.x - left.x, site.y - left.y) >
    Math.hypot(site.x - right.x, site.y - right.y)
    ? left
    : right;
}

test("clicking a Structure on the map shows what it is doing beside it, until Esc, its close button or empty ground closes it", async ({
  page,
}) => {
  const site = await planSolarArray(page);
  const popUp = page.getByRole("dialog", { name: "Solar array" });
  // The click that placed it doesn't open it too.
  await expect(page.getByRole("status", { name: "Placement" })).toHaveText(
    "Solar array planned. The Robot will carry out its Construction.",
  );
  await expect(popUp).toBeHidden();

  await page.mouse.click(site.x, site.y);

  await expect(popUp).toBeVisible();
  await expect(popUp).toContainText("Solar panels on a mast");
  await expect(popUp.getByRole("status", { name: "Stage" })).toHaveText(
    /^Stage Site Preparation \d+%/,
  );
  await expect(popUp.getByRole("status", { name: "State" })).toHaveText(
    "State under Construction",
  );
  // Nothing to choose until it is commissioned.
  await expect(popUp.getByRole("button", { name: "Dismantle" })).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(popUp).toBeHidden();

  await page.mouse.click(site.x, site.y);
  await expect(popUp).toBeVisible();
  await popUp.getByRole("button", { name: "Close" }).click();
  await expect(popUp).toBeHidden();

  await page.mouse.click(site.x, site.y);
  await expect(popUp).toBeVisible();
  const empty = await emptyGround(page, site);
  await page.mouse.click(empty.x, empty.y);
  await expect(popUp).toBeHidden();
});

test("dragging over a Structure moves the camera without opening its pop-up", async ({
  page,
}) => {
  const site = await planSolarArray(page);
  const popUp = page.getByRole("dialog", { name: "Solar array" });

  // Away and back again, ending over it, as a player might when panning.
  await page.mouse.move(site.x, site.y);
  await page.mouse.down();
  await page.mouse.move(site.x + 80, site.y + 20, { steps: 8 });
  await page.mouse.move(site.x, site.y, { steps: 8 });
  await page.mouse.up();

  await expect(popUp).toBeHidden();
});

test("clicking a Structure while placing another places it rather than opening the pop-up", async ({
  page,
}) => {
  const site = await planSolarArray(page);
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Light mast/ })
    .click();

  await page.mouse.click(site.x, site.y);

  await expect(page.getByRole("status", { name: "Placement" })).toHaveText(
    "The light mast would overlap another Structure.",
  );
  await expect(page.getByRole("dialog", { name: "Solar array" })).toBeHidden();
});

test("the pop-up's Dismantle does what the Base panel's does, and the pop-up closes once the Structure is gone", async ({
  page,
}) => {
  const site = await planSolarArray(page);
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const structures = page.getByRole("list", { name: "Structures" });
  await skip.click();
  await expect(structures.getByRole("listitem")).toHaveText([
    /^Solar array Condition \d+% commissioned/,
  ]);

  await page.mouse.click(site.x, site.y);
  const popUp = page.getByRole("dialog", { name: "Solar array" });
  await expect(popUp.getByRole("status", { name: "Stage" })).toHaveText(
    "Stage commissioned",
  );
  await expect(popUp.getByRole("status", { name: "Condition" })).toHaveText(
    /^Condition \d+%/,
  );
  await popUp.getByRole("button", { name: "Dismantle" }).click();

  await expect(popUp.getByRole("status", { name: "Stage" })).toHaveText(
    "Stage to be dismantled",
  );
  await expect(popUp.getByRole("button", { name: "Dismantle" })).toBeHidden();
  await expect(structures.getByRole("listitem")).toHaveText([
    /^Solar array Condition \d+% to be dismantled/,
  ]);
  await expect(page.getByRole("complementary", { name: "Work" })).toContainText(
    "Dismantling the solar array",
  );

  await skip.click();
  await expect(structures).toBeHidden();
  await expect(popUp).toBeHidden();
});
