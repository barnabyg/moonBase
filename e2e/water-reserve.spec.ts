import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";

async function speed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true })
    .click();
}

/**
 * Starts a base with an optics works running a few batches above the Mission
 * Director's reserve, as `npm run try -- water-reserve` does, with the game
 * paused so that no batch moves on between the steps.
 */
async function loadOpticsBase(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "water-reserve");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "water-reserve.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
}

test("an optics works says it uses water, stops at the Mission Director's reserve and says why, the status panel explains the fall, and it starts again once there is water to spare", async ({
  page,
}) => {
  await loadOpticsBase(page);
  const structures = page.getByRole("list", { name: "Structures" });
  const works = structures
    .getByRole("listitem")
    .filter({ hasText: "Optics works" });
  const water = page
    .getByRole("complementary", { name: "Status panel" })
    .getByRole("status", { name: "Water", exact: true });

  await expect(works).toContainText(
    "making 0.2 kg of precision optics an hour from 0.8 kg of silicon, 0.2 kg of metals and 1 kg of water",
  );
  await expect(water).toHaveText(
    /^Water 5\d\.\d of 400 kg · lasts .*, water-processing plant switched off, optics works using 24 kg a day$/,
  );

  await speed(page, "20x");
  await expect(works).toContainText(
    /waiting for Water: [\d.]+ of 50 kg, to leave the Mission Director's reserve of 49 kg/,
  );
  await speed(page, "Pause");
  await expect(water).toHaveText(
    /^Water 4\d\.\d of 400 kg · lasts 1[234]d.*, water-processing plant switched off, optics works waiting at the reserve$/,
  );

  await structures
    .getByRole("listitem")
    .filter({ hasText: "Water-processing plant" })
    .getByRole("button", { name: "Switch on" })
    .click();
  await speed(page, "20x");
  await expect(works).toContainText("from 0.8 kg of silicon");
});

test("the Guide says an optics works takes water and leaves the reserve", async ({
  page,
}) => {
  await loadOpticsBase(page);
  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog", { name: "Guide" });

  await expect(
    guide
      .getByRole("tabpanel", { name: "How it works" })
      .getByRole("article", { name: "Power and Night" }),
  ).toContainText("a reserve kept for the Mission Director");

  await guide.getByRole("tab", { name: "Structures" }).click();
  const card = guide
    .getByRole("tabpanel", { name: "Structures" })
    .getByRole("article", { name: "Optics works", exact: true });
  await expect(card).toContainText("1 kg of water into");
  await expect(card).toContainText(
    "below the Mission Director's reserve of 49 kg",
  );
});
