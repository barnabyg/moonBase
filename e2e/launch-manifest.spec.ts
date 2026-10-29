import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { catalogue } from "../src/catalogue";

const grant = catalogue.programmeGrantMillionDollars;
const limit = catalogue.launch.payloadMassLimitKilograms;
const fee = catalogue.launch.feeMillionDollars;

function launchItem(id: string): {
  massKilograms: number;
  priceMillionDollars: number;
} {
  const item = catalogue.launch.items.find((candidate) => candidate.id === id);
  if (item === undefined) throw new Error(`expected a Launch item ${id}`);
  return item;
}

const core = launchItem("habitat-core");
const water = launchItem("water");

test("the Launch manifest screen totals the items chosen against the Payload Mass limit and the Funding", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await expect(page.getByRole("status", { name: "Funding" })).toHaveText(
    `$${grant}M`,
  );

  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  const payloadMass = screen.getByRole("status", { name: "Payload Mass" });
  const cost = screen.getByRole("status", { name: "Launch cost" });
  await expect(screen.getByRole("row", { name: /Solar panel/ })).toContainText(
    "60 kg, $4M",
  );
  // An empty manifest costs nothing, so the Launch fee isn't shown yet.
  await expect(payloadMass).toHaveText(`Payload Mass: 0 of ${limit} kg`);
  await expect(cost).toHaveText(
    `Cost: nothing of $${grant}M Funding, while the manifest is empty`,
  );

  await screen.getByRole("button", { name: "Add one Habitat core" }).click();
  await screen.getByRole("button", { name: "Add one Water, 50 kg" }).click();
  const oneCost = fee + core.priceMillionDollars + water.priceMillionDollars;
  await expect(payloadMass).toHaveText(
    `Payload Mass: ${core.massKilograms + water.massKilograms} of ${limit} kg`,
  );
  await expect(cost).toHaveText(
    `Cost: $${oneCost}M of $${grant}M Funding, including the $${fee}M Launch fee`,
  );

  await screen.getByRole("button", { name: "Remove one Habitat core" }).click();
  await screen.getByRole("button", { name: "Remove one Water, 50 kg" }).click();
  await expect(cost).toHaveText(
    `Cost: nothing of $${grant}M Funding, while the manifest is empty`,
  );
  await screen.getByRole("button", { name: "Close" }).click();
  await expect(screen).toBeHidden();
});

/**
 * A sample save of a Campaign with the Lander free to fly, an empty Launch
 * manifest and less Funding than the Programme Grant: what the grant was
 * when it was saved.
 */
const sampleSave = fileURLToPath(
  new URL("../test/saves/version-33.moonbase", import.meta.url),
);
const savedFunding = (
  JSON.parse(readFileSync(sampleSave, "utf8")) as {
    state: { fundingMillionDollars: number };
  }
).state.fundingMillionDollars;

test("the Launch manifest screen refuses an item the Funding can't pay for", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page.getByRole("button", { name: "Pause" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(sampleSave);
  await expect(page.getByRole("status", { name: "Funding" })).toHaveText(
    `$${savedFunding}M`,
  );

  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  const cost = screen.getByRole("status", { name: "Launch cost" });
  await screen.getByRole("button", { name: "Add one Habitat core" }).click();
  await screen.getByRole("button", { name: "Add one Water, 50 kg" }).click();
  const oneCost = fee + core.priceMillionDollars + water.priceMillionDollars;
  await expect(cost).toHaveText(
    `Cost: $${oneCost}M of $${savedFunding}M Funding, including the $${fee}M Launch fee`,
  );

  // The Habitat core is the dearest item, so a second one, within the
  // Payload Mass limit, is more than the Funding can pay for.
  expect(oneCost).toBeLessThanOrEqual(savedFunding);
  expect(oneCost + core.priceMillionDollars).toBeGreaterThan(savedFunding);
  expect(2 * core.massKilograms + water.massKilograms).toBeLessThanOrEqual(
    limit,
  );
  await screen.getByRole("button", { name: "Add one Habitat core" }).click();
  await expect(screen.getByRole("alert")).toHaveText(
    `That would bring the manifest's cost to $${oneCost + core.priceMillionDollars}M, more than the Funding balance of $${savedFunding}M, with no Exports aboard or to load to sell first.`,
  );
  // Its count, after its name and its mass and price.
  await expect(
    screen
      .getByRole("row", { name: /Habitat core/ })
      .getByRole("cell")
      .nth(1),
  ).toHaveText("1");
});

test("the Launch manifest screen refuses an item that would go over the Payload Mass limit", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  const payloadMass = screen.getByRole("status", { name: "Payload Mass" });
  const addWater = screen.getByRole("button", { name: "Add one Water, 50 kg" });

  // As many tanks as fit, which cost far less than the Funding.
  const fit = Math.floor(limit / water.massKilograms);
  expect(fee + fit * water.priceMillionDollars).toBeLessThan(grant);
  for (let tanks = 1; tanks <= fit; tanks++) {
    await addWater.click();
    await expect(payloadMass).toHaveText(
      `Payload Mass: ${tanks * water.massKilograms} of ${limit} kg`,
    );
  }
  await addWater.click();

  await expect(screen.getByRole("alert")).toHaveText(
    `That would bring the manifest's Payload Mass to ${(fit + 1) * water.massKilograms} kg, over the Launch's limit of ${limit} kg.`,
  );
  await expect(payloadMass).toHaveText(
    `Payload Mass: ${fit * water.massKilograms} of ${limit} kg`,
  );
});

/**
 * A sample save of a Campaign with the Mission Director in the Habitat, the
 * Lander free to fly at the landing site, and 46.5 kg of wafers in the
 * base's stock, 30 kg of them to load.
 */
const wafersSave = fileURLToPath(
  new URL("../test/saves/version-22.moonbase", import.meta.url),
);

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

test("the Launch manifest counts what the Exports to load will sell for, and the Lander can't leave once they fall short of it", async ({
  page,
}, testInfo) => {
  // The wafers save, with the Funding for the Launch fee alone, a stand-in
  // for the Launches that would have spent the Programme Grant down to it,
  // and an empty manifest.
  const document = JSON.parse(readFileSync(wafersSave, "utf8")) as {
    state: { fundingMillionDollars: number; launchManifest: unknown[] };
  };
  document.state.fundingMillionDollars = fee;
  document.state.launchManifest = [];
  const feeOnlySave = testInfo.outputPath("fee-only.moonbase");
  writeFileSync(feeOnlySave, JSON.stringify(document));
  const panel = launchItem("solar-panel");
  const mast = launchItem("array-mast");
  // A solar array's Components, which 30 kg of wafers pay for, but 5 kg
  // don't.
  const arrayCost =
    fee + 2 * panel.priceMillionDollars + mast.priceMillionDollars;
  const waferPrice =
    catalogue.exports.find((sold) => sold.resourceId === "wafers")
      ?.priceMillionDollarsPerKilogram ?? Number.NaN;
  expect(arrayCost).toBeLessThanOrEqual(fee + 30 * waferPrice);
  expect(arrayCost).toBeGreaterThan(fee + 5 * waferPrice);

  await page.goto("/?seed=1");
  // Paused throughout, so that nothing uses up the wafers meanwhile.
  await page.getByRole("button", { name: "Pause" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(feeOnlySave);
  const funding = page.getByRole("status", { name: "Funding" });
  await expect(funding).toHaveText(`$${fee}M`);

  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  const cost = screen.getByRole("status", { name: "Launch cost" });
  const importsTab = screen.getByRole("tab", { name: "Imports" });
  const exportsTab = screen.getByRole("tab", { name: "Exports" });
  const kilograms = screen.getByRole("spinbutton", {
    name: "Kilograms of Wafers to load",
  });
  const setWafers = async (amount: number): Promise<void> => {
    await exportsTab.click();
    await kilograms.fill(String(amount));
    await kilograms.press("Enter");
    await expect(kilograms).toHaveValue(String(amount));
    await importsTab.click();
  };
  const addPanel = screen.getByRole("button", { name: "Add one Solar panel" });
  const addMast = screen.getByRole("button", { name: "Add one Array mast" });

  // Without the Exports to load, the Funding pays for the fee alone.
  await setWafers(0);
  await addPanel.click();
  await expect(screen.getByRole("alert")).toHaveText(
    `That would bring the manifest's cost to $${fee + panel.priceMillionDollars}M, more than the Funding balance of $${fee}M, with no Exports aboard or to load to sell first.`,
  );

  // With them, a solar array is accepted.
  await setWafers(30);
  await expect(cost).toHaveText(
    `Cost: nothing of $${fee}M Funding and $${30 * waferPrice}M from the Exports to load, while the manifest is empty`,
  );
  await addPanel.click();
  await addPanel.click();
  await addMast.click();
  await expect(cost).toHaveText(
    `Cost: $${arrayCost}M of $${fee}M Funding and $${30 * waferPrice}M from the Exports to load, including the $${fee}M Launch fee`,
  );

  // Lowering them is allowed, but then the Lander can't leave with it.
  await setWafers(5);
  await expect(cost).toHaveText(
    `Cost: $${arrayCost}M of $${fee}M Funding and $${5 * waferPrice}M from the Exports to load, including the $${fee}M Launch fee. The Lander can't leave with it until it costs no more.`,
  );
  await screen.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Send the Lander" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    `The Lander can't leave with a Launch manifest that costs $${arrayCost}M, more than the Funding balance of $${fee}M and the $${5 * waferPrice}M the Exports to load will sell for. Take something off the manifest or load more Exports first.`,
  );

  await page.getByRole("button", { name: "Launch manifest" }).click();
  await setWafers(30);
  await screen.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Send the Lander" }).click();
  await skipUntil(page, "Lander landed with");

  await expect(page.getByRole("log", { name: "Notifications" })).toContainText(
    "Lander landed with 2 × Solar panel and 1 × Array mast",
  );
  await expect(funding).toHaveText(`$${fee + 30 * waferPrice - arrayCost}M`);
});
