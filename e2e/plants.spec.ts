import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * A sample save of a Campaign with an extraction plant half way through a
 * batch of oxygen, and a vacuum fabrication plant with 0.2 kg of silicon,
 * short of the 0.35 kg a batch needs.
 */
const batchSave = fileURLToPath(
  new URL("../test/saves/version-35.moonbase", import.meta.url),
);

test("the Base panel says how much of its batch a Plant has left, and how much of an input one waiting for it has", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page.getByRole("button", { name: "Pause" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(batchSave);

  const plants = page
    .getByRole("list", { name: "Structures" })
    .getByRole("listitem")
    .filter({ hasText: /plant/ });
  await expect(plants).toHaveText([
    /^Extraction plant Condition \d+% running, 30 min left of this batch · making 0\.15 kg of oxygen, 0\.04 kg of metals and 0\.02 kg of silicon an hour from 4 kg of regolith/,
    /^Vacuum fabrication plant Condition \d+% waiting for Silicon: 0\.2 of 0\.35 kg(?! ·)/,
  ]);
});

/**
 * A sample save of a Campaign in Daylight with the Mission Director in the
 * Habitat, a water-processing plant 20 minutes into a batch of water, and
 * an extraction plant switched off after its last batch.
 */
const switchSave = fileURLToPath(
  new URL("../test/saves/version-37.moonbase", import.meta.url),
);

test("the Base panel switches a Plant off and on, the setting is saved, and the forecasts follow it", async ({
  page,
}, testInfo) => {
  await page.goto("/?seed=1");
  // Paused throughout, so that no batch moves on between the steps.
  await page.getByRole("button", { name: "Pause" }).click();
  const loadFile = async (file: string) => {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await (await chooser).setFiles(file);
  };
  await loadFile(switchSave);

  const structures = page
    .getByRole("list", { name: "Structures" })
    .getByRole("listitem");
  const waterPlant = structures.filter({ hasText: "Water-processing plant" });
  const extraction = structures.filter({ hasText: "Extraction plant" });
  const statusPanel = page.getByRole("complementary", { name: "Status panel" });
  const water = statusPanel.getByRole("status", { name: "Water", exact: true });
  const oxygen = statusPanel.getByRole("status", {
    name: "Oxygen",
    exact: true,
  });
  await expect(extraction).toContainText(/Condition \d+% switched off/);
  await expect(oxygen).toHaveText(
    /^Oxygen \d+\.\d kg · lasts .*, extraction plant switched off$/,
  );
  await expect(waterPlant).toContainText(
    /Condition \d+% running, 40 min left of this batch · making 0\.9 kg of water an hour/,
  );
  await expect(water).toHaveText(/^Water \d+\.\d kg · rising /);

  await waterPlant.getByRole("button", { name: "Switch off" }).click();

  // The batch under way finishes, but the forecast counts on none of it.
  await expect(waterPlant).toContainText(
    /Condition \d+% running, 40 min left of its last batch before switching off/,
  );
  await expect(water).toHaveText(
    /^Water \d+\.\d kg · lasts .*, water-processing plant switched off$/,
  );

  // Saved and loaded, it is still switched off.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const saved = testInfo.outputPath("switched-off.moonbase");
  await (await download).saveAs(saved);
  await loadFile(switchSave);
  await expect(
    waterPlant.getByRole("button", { name: "Switch off" }),
  ).toBeVisible();
  await loadFile(saved);
  const switchOn = waterPlant.getByRole("button", { name: "Switch on" });
  await expect(switchOn).toBeVisible();

  await switchOn.click();

  await expect(waterPlant).toContainText(
    /Condition \d+% running, 40 min left of this batch/,
  );
  await expect(water).toHaveText(/^Water \d+\.\d kg · rising /);
  await expect(
    waterPlant.getByRole("button", { name: "Switch off" }),
  ).toBeVisible();
});

test("a Plant switched on between batches says so at once, then starts its next batch", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const speeds = page.getByRole("group", { name: "Game speed" });
  await speeds.getByRole("button", { name: "Pause" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(switchSave);
  const extraction = page
    .getByRole("list", { name: "Structures" })
    .getByRole("listitem")
    .filter({ hasText: "Extraction plant" });
  await expect(extraction).toContainText(/Condition \d+% switched off/);

  // Paused, so that it hasn't tried to run yet.
  await extraction.getByRole("button", { name: "Switch on" }).click();

  await expect(extraction).toContainText(
    /Condition \d+% switched on: starts a batch as soon as it can/,
  );
  await expect(
    extraction.getByRole("button", { name: "Switch off" }),
  ).toBeVisible();
  await speeds.getByRole("button", { name: "1x" }).click();
  await expect(extraction).toContainText(
    /Condition \d+% running, \d+ min left of this batch/,
  );
});
