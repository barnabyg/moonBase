import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";
import { structureEntry } from "./base-panel";

async function speed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true })
    .click();
}

/**
 * Starts a base with an infrared telescope observing at Night, out past the dark
 * radius of a Light Mast by the battery banks, as `npm run try --
 * infrared-telescope` does, with the game paused so that nothing moves on between
 * the steps.
 */
async function loadTelescopeBase(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "infrared-telescope");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "infrared-telescope.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
}

test("the status panel and the Base panel say an infrared telescope is observing at Night, and what it boils off", async ({
  page,
}) => {
  await loadTelescopeBase(page);
  const telescope = structureEntry(page, "Infrared telescope");

  await expect(telescope).toContainText("observing,");
  await expect(telescope).toContainText(
    "boiling off 2 kg of propellant an hour, for 24 Science a round",
  );
  await expect(
    page
      .getByRole("complementary", { name: "Status panel" })
      .getByRole("status", { name: "Infrared survey" }),
  ).toContainText("Deep infrared survey · 1 infrared telescope observing,");
});

test("placing an infrared telescope by the base says which lit Structure within its dark radius would stop it", async ({
  page,
}) => {
  await loadTelescopeBase(page);
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Infrared telescope/ })
    .click();
  const placement = page.getByRole("status", { name: "Placement" });
  const box = await page.locator("canvas").boundingBox();
  if (box === null) throw new Error("The 3D view has no size.");

  // The game opens looking at the Lander, within 80 m of the Light Mast. Somewhere
  // round it is clear enough to place one.
  let found = "";
  for (const [across, down] of [
    [0.3, 0.75],
    [0.7, 0.75],
    [0.25, 0.6],
    [0.75, 0.6],
    [0.5, 0.85],
  ] as const) {
    await page.mouse.move(
      box.x + box.width * across,
      box.y + box.height * down,
    );
    found = (await placement.textContent()) ?? "";
    if (found.startsWith("Click to place")) break;
  }

  expect(found).toContain(
    "It won't work here: 1 lit Structure within its dark radius of 80 m: light mast.",
  );
  await page.keyboard.press("Escape");
});

test("an infrared telescope with a lit Structure moved within its dark radius stops observing and says why", async ({
  page,
}) => {
  const scenario = tryScenarios.find(({ id }) => id === "infrared-telescope");
  if (scenario === undefined) throw new Error("expected the scenario");
  // The Light Mast by the battery banks moved to within 80 m of the telescope,
  // which is 5 hours into its round, so that it has more than a batch's worth to
  // lose.
  const document = JSON.parse(scenario.save()) as {
    state: {
      structures: {
        structureTypeId: string;
        position: { x: number; y: number };
        observedMinutes: number;
      }[];
    };
  };
  for (const structure of document.state.structures) {
    if (structure.structureTypeId === "infrared-telescope") {
      structure.observedMinutes = 5 * 60;
    }
  }
  const mast = document.state.structures.find(
    ({ structureTypeId }) => structureTypeId === "light-mast",
  );
  if (mast === undefined) throw new Error("expected a Light Mast");
  mast.position = { x: 100, y: 25 };
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "infrared-telescope.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(document)),
  });

  await speed(page, "1x");
  const telescope = structureEntry(page, "Infrared telescope");
  await expect(telescope).toContainText(
    "can't observe: a lit Structure is within its dark radius",
  );
  await speed(page, "Pause");
  await expect(
    page
      .getByRole("log", { name: "Notifications" })
      .getByText(
        "Infrared telescope: its round of observing lost to a light within its dark radius",
      ),
  ).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Status panel" })
      .getByRole("status", { name: "Infrared survey" }),
  ).toContainText("a lit Structure within its dark radius");
});
