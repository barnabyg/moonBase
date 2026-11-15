import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";
import { structureEntry, structurePopUp } from "./base-panel";

/**
 * Starts the infrared telescope's base after a Survey came back with a dark site
 * found, as `npm run try -- observing-sites` does, with the game paused so that
 * nothing moves on between the steps.
 */
async function loadSiteBase(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "observing-sites");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause", exact: true })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "observing-sites.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
}

test("the Expeditions screen lists the dark site a Survey found and shows it on the map, and the telescope off it says so", async ({
  page,
}) => {
  await loadSiteBase(page);
  await structureEntry(page, "Infrared telescope")
    .getByRole("button")
    .first()
    .click();
  await expect(structurePopUp(page)).toContainText(
    /Site\s*not wholly on the dark site, \d+ m from the Lander/,
  );
  await structurePopUp(page).getByRole("button", { name: "Close" }).click();

  await page
    .getByRole("complementary", { name: "Status panel" })
    .getByRole("button", { name: "Expeditions" })
    .click();
  const screen = page.getByRole("dialog", { name: "Expeditions" });
  const sites = screen.getByRole("region", { name: "Observing sites" });
  await expect(sites).toContainText(
    /Dark site, \d+ m from the Lander: an infrared telescope standing wholly on it works its rounds 50% faster\./,
  );
  await sites
    .getByRole("button", { name: "Show the dark site on the map" })
    .click();

  await expect(screen).toBeHidden();
  await expect(page.locator("canvas")).toHaveAttribute("data-marked", "dark");
});
