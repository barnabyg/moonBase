import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";
import { structureEntry } from "./base-panel";

async function speed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true })
    .click();
}

/** Loads a save document, with the game paused so that nothing moves on between the steps. */
async function loadSave(page: Page, save: string): Promise<void> {
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "radio-telescope-array.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(save),
  });
}

/**
 * The save of a base with a radio telescope array working in Daylight, out past
 * the quiet radius of a water-processing plant by the battery banks, as `npm run
 * try -- radio-telescope-array` starts it.
 */
function arrayBaseSave(): string {
  const scenario = tryScenarios.find(
    ({ id }) => id === "radio-telescope-array",
  );
  if (scenario === undefined) throw new Error("expected the scenario");
  return scenario.save();
}

const statusLine = (page: Page) =>
  page
    .getByRole("complementary", { name: "Status panel" })
    .getByRole("status", { name: "Radio survey" });

test("the status panel and the Base panel say a radio telescope array is working, with its antenna field and rate", async ({
  page,
}) => {
  await loadSave(page, arrayBaseSave());
  const array = structureEntry(page, "Radio telescope array");

  await expect(array).toContainText("working,");
  await expect(array).toContainText(
    "1 antenna field, about 89 Science a Lunation",
  );
  await expect(statusLine(page)).toContainText(
    "Radio sky survey · 1 radio telescope array working,",
  );
});

test("placing a radio telescope array by the base says which Plant within its quiet radius would stop it", async ({
  page,
}) => {
  await loadSave(page, arrayBaseSave());
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Radio telescope array/ })
    .click();
  const placement = page.getByRole("status", { name: "Placement" });
  const box = await page.locator("canvas").boundingBox();
  if (box === null) throw new Error("The 3D view has no size.");

  // The game opens looking at the Lander, within 120 m of the water-processing
  // plant. Somewhere in sight is clear enough to place one, which is broad.
  let found = "";
  search: for (let down = 0.95; down > 0.3; down -= 0.1) {
    for (let across = 0.05; across < 1; across += 0.1) {
      await page.mouse.move(
        box.x + box.width * across,
        box.y + box.height * down,
      );
      found = (await placement.textContent()) ?? "";
      if (found.startsWith("Click to place")) break search;
    }
  }

  expect(found).toContain(
    "It won't work here: 1 Plant within its quiet radius of 120 m: water-processing plant.",
  );
  await page.keyboard.press("Escape");
});

test("a radio telescope array with a Plant moved within its quiet radius stops working and says why", async ({
  page,
}) => {
  // The water-processing plant by the battery banks moved to within 120 m of the
  // array, which is 5 hours into its round, so that it has more than an hour's
  // work to lose.
  const document = JSON.parse(arrayBaseSave()) as {
    state: {
      structures: {
        structureTypeId: string;
        position: { x: number; y: number };
        observedMinutes: number;
      }[];
    };
  };
  for (const structure of document.state.structures) {
    if (structure.structureTypeId === "radio-telescope-array") {
      structure.observedMinutes = 5 * 60;
    }
  }
  const plant = document.state.structures.find(
    ({ structureTypeId }) => structureTypeId === "water-processing-plant",
  );
  if (plant === undefined) throw new Error("expected a water-processing plant");
  plant.position = { x: 100, y: 25 };
  await loadSave(page, JSON.stringify(document));

  await speed(page, "1x");
  // It says so as soon as it loads, but loses its round only once the game has
  // moved on a game-minute.
  await expect(
    page
      .getByRole("log", { name: "Notifications" })
      .getByText(
        "Radio telescope array: its round of its survey lost to a Plant within its quiet radius",
      ),
  ).toBeVisible();
  await speed(page, "Pause");
  const array = structureEntry(page, "Radio telescope array");
  await expect(array).toContainText(
    "can't work: a Plant is within its quiet radius",
  );
  await expect(statusLine(page)).toContainText(
    "a Plant within its quiet radius",
  );
});
