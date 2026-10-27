import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { catalogue } from "../src/catalogue";

/**
 * A sample save of a Campaign an hour into the Assembly of a water wall over
 * the Regolith shielding of the Habitat the Mission Director lives in.
 */
const waterWallSave = fileURLToPath(
  new URL("../test/saves/version-34.moonbase", import.meta.url),
);

const doseRates = catalogue.radiation.doseRateMillisievertsPerEarthDay;

/** A dose rate as the status panel shows it, to a tenth of a millisievert. */
function perDay(millisieverts: number): string {
  return `+${millisieverts.toFixed(1)} a day`;
}

/** Clicks "Skip to next event" until the notification list shows the text. */
async function skipUntil(page: Page, text: string): Promise<void> {
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const notifications = page.getByRole("log", { name: "Notifications" });
  for (let skips = 0; skips < 30; skips++) {
    // The list is hidden, and so not found, until the first event.
    if (
      (await notifications.isVisible()) &&
      (await notifications.textContent())?.includes(text) === true
    ) {
      return;
    }
    await skip.click();
  }
  await expect(notifications).toContainText(text);
}

test("a water wall built over a shielded Habitat shows it as water-walled and cuts the Mission Director's dose rate", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page.getByRole("button", { name: "Pause" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(waterWallSave);

  const structures = page.getByRole("list", { name: "Structures" });
  const habitat = structures
    .getByRole("listitem")
    .filter({ hasText: /^Inflatable Habitat/ });
  const radiationDose = page
    .getByRole("complementary", { name: "Status panel" })
    .getByRole("status", { name: "Radiation Dose" });
  await expect(habitat).toContainText("shielded, the Mission Director's home");
  await expect(habitat).not.toContainText("water-walled");
  await expect(page.getByRole("complementary", { name: "Work" })).toContainText(
    "Water wall",
  );

  await skipUntil(page, "Water wall commissioned");

  await expect(habitat).toContainText(
    "shielded, water-walled, the Mission Director's home",
  );
  await expect(structures.getByRole("listitem")).toContainText([
    /^Water wall Condition 100% commissioned/,
  ]);
  await expect(radiationDose).toContainText(
    perDay(doseRates.waterWalledHabitat),
  );
});
