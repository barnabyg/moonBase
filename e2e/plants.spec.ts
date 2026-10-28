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
