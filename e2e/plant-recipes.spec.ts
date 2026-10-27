import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * A sample save of a Campaign with the Mission Director in the Habitat, and
 * an extraction plant running for metals and silicon in Daylight.
 */
const metalsSave = fileURLToPath(
  new URL("../test/saves/version-25.moonbase", import.meta.url),
);

test("choosing the extraction plant's recipe in the status panel changes what it makes, and the oxygen forecast follows", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  await panel.getByRole("button", { name: "Pause" }).click();
  const chooser = page.waitForEvent("filechooser");
  await panel.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(metalsSave);

  const structures = panel.getByRole("list", { name: "Structures" });
  const recipe = structures.getByRole("combobox", {
    name: "Extraction plant recipe",
  });
  const oxygen = panel.getByRole("status", { name: "Oxygen", exact: true });
  await expect(recipe).toHaveValue("metals-and-silicon");
  await expect(recipe.getByRole("option")).toHaveText([
    "Oxygen",
    "Metals and silicon",
  ]);
  await expect(oxygen).toHaveText(/^Oxygen: 24\.9 kg, runs out in /);
  // Only a Plant with more than one recipe has a choice.
  await expect(structures.getByRole("combobox")).toHaveCount(1);

  await recipe.selectOption({ label: "Oxygen" });

  await expect(recipe).toHaveValue("oxygen");
  await expect(oxygen).toHaveText(
    "Oxygen: 24.9 kg, rising 2.8 kg an Earth Day",
  );
  await expect(panel.getByRole("alert")).toBeHidden();
  // It carries on running, now for oxygen.
  await panel.getByRole("button", { name: "20x" }).click();
  await expect(oxygen).toHaveText(/^Oxygen: 2[5-9]\.\d kg, rising /);
  await expect(recipe).toHaveValue("oxygen");
});
