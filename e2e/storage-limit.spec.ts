import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";

async function speed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true })
    .click();
}

/**
 * Starts a base with a water-processing plant running a few batches below the
 * limit, as `npm run try -- full-store` does, with the game paused so that no
 * batch moves on between the steps.
 */
async function loadFullStoreBase(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "full-store");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "full-store.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
}

test("a water-processing plant fills the base's water to its limit, waits for tank space and says so, and the status panel says the water is holding full", async ({
  page,
}) => {
  await loadFullStoreBase(page);
  const plant = page
    .getByRole("group", { name: "Structures", exact: true })
    .getByRole("listitem")
    .filter({ hasText: "Water-processing plant" });
  const water = page
    .getByRole("complementary", { name: "Status panel" })
    .getByRole("status", { name: "Water", exact: true });

  await expect(water).toHaveText(/^Water 397\.\d of 400 kg/);

  await speed(page, "20x");
  await expect(plant).toContainText(
    /waiting for tank space: Water is (399\.\d|400\.0) of 400 kg/,
  );
  await speed(page, "Pause");
  await expect(water).toHaveText(
    /^Water (39\d\.\d|400\.0) of 400 kg · holding full/,
  );
});

test("the Launch manifest warns of what won't fit, and says what becomes of it", async ({
  page,
}) => {
  await loadFullStoreBase(page);
  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  const warning = screen.getByRole("status", { name: "Storage warning" });
  await expect(warning).toBeHidden();

  await screen.getByRole("button", { name: "Add one Water, 50 kg" }).click();

  await expect(warning).toHaveText(
    /^Water: 50 kg on the manifest, room for [\d.]+ kg\. What doesn't fit is lost on landing\.$/,
  );

  await screen.getByRole("button", { name: "Remove one Water, 50 kg" }).click();
  await expect(warning).toBeHidden();
});

test("the Guide says the base's tanks have a limit, and what a Plant does at it", async ({
  page,
}) => {
  await loadFullStoreBase(page);
  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog", { name: "Guide" });

  await expect(
    guide
      .getByRole("tabpanel", { name: "How it works" })
      .getByRole("article", { name: "Power and Night" }),
  ).toContainText("hold 100 kg of oxygen and 400 kg of water");

  await guide.getByRole("tab", { name: "Structures" }).click();
  await expect(
    guide
      .getByRole("tabpanel", { name: "Structures" })
      .getByRole("article", { name: "Water-processing plant", exact: true }),
  ).toContainText("it waits for tank space");
});
