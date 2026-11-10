import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { structureEntry } from "./base-panel";

/** How far the pop-up stands to the side of its Structure, in pixels. */
const POP_UP_OFFSET_PX = 28;

/**
 * Loads a sample save of a base with two solar arrays, an extraction plant
 * and a vacuum fabrication plant, paused, so that nothing moves meanwhile.
 */
async function loadBase(page: Page): Promise<void> {
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
  await expect(structureEntry(page, "Solar array ×2")).toBeVisible();
}

/** The id a row of the Base panel stands for. */
async function idOf(row: Locator): Promise<string> {
  const id = await row.getAttribute("data-row");
  if (id === null) throw new Error("The row has no id.");
  return id;
}

/**
 * Expects a Structure's pop-up to stand beside the middle of the map, where
 * the camera looks, which is where its Structure is once the camera has
 * moved to it.
 */
async function expectBesideTheMiddle(page: Page, popUp: Locator) {
  const map = await page.locator("canvas").boundingBox();
  if (map === null) throw new Error("The 3D view has no size.");
  await expect
    .poll(async () => {
      const box = await popUp.boundingBox();
      if (box === null) return "hidden";
      const right = box.x - (map.x + map.width / 2) - POP_UP_OFFSET_PX;
      const down = box.y + box.height / 2 - (map.y + map.height / 2);
      return Math.abs(right) <= 1.5 && Math.abs(down) <= 1.5
        ? "beside the middle"
        : `${right} px right of and ${down} px below it`;
    })
    .toBe("beside the middle");
}

test("choosing a row of the Base panel by its name, with the mouse or the keyboard, moves the camera to it and marks it on the map, and opens a Structure's pop-up; pointing at a row marks it without moving the camera", async ({
  page,
}) => {
  await loadBase(page);
  const map = page.locator("canvas");
  await expect(map).not.toHaveAttribute("data-marked");

  // The second of two with the same name, in the row they share, opened.
  const arrays = structureEntry(page, "Solar array ×2");
  await arrays.locator("summary").click();
  const second = arrays.getByRole("listitem").nth(1);
  await second.getByRole("button", { name: "Solar array" }).click();
  const arrayPopUp = page.getByRole("dialog", { name: "Solar array" });
  await expect(arrayPopUp).toBeVisible();
  await expectBesideTheMiddle(page, arrayPopUp);
  await expect(map).toHaveAttribute("data-marked", await idOf(second));

  // Pointing at another row marks that one, and the camera stays.
  const plant = structureEntry(page, "Vacuum fabrication plant");
  await plant.hover();
  await expect(map).toHaveAttribute("data-marked", await idOf(plant));
  await expect(arrayPopUp).toBeVisible();
  await expectBesideTheMiddle(page, arrayPopUp);

  // From the keyboard, the camera goes to the plant, which stands elsewhere.
  await plant.getByRole("button", { name: "Vacuum fabrication plant" }).focus();
  await page.keyboard.press("Enter");
  const plantPopUp = page.getByRole("dialog", {
    name: "Vacuum fabrication plant",
  });
  await expect(plantPopUp).toBeVisible();
  await expectBesideTheMiddle(page, plantPopUp);
  await expect(arrayPopUp).toBeHidden();

  // A Robot has no pop-up; it is marked where it stands.
  const robot = page
    .getByRole("list", { name: "Robots" })
    .getByRole("listitem")
    .first();
  await robot.getByRole("button", { name: /^Robot/ }).click();
  await expect(map).toHaveAttribute("data-marked", await idOf(robot));
  const machine = page
    .getByRole("list", { name: "Machines" })
    .getByRole("listitem")
    .first();
  await machine.getByRole("button").first().focus();
  await expect(map).toHaveAttribute("data-marked", await idOf(machine));
});
