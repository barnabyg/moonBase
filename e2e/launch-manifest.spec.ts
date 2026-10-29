import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
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
 * A sample save of a Campaign an hour after the Lander left Earth with a
 * manifest paid for at the full Launch fee, just after Reusable boosters
 * was unlocked.
 */
const boostersSave = fileURLToPath(
  new URL("../test/saves/version-36.moonbase", import.meta.url),
);

test("Reusable boosters cuts the Launch fee from the next Launch, leaving the one already paid for as it was", async ({
  page,
}) => {
  const { reducedFee } = catalogue.launch;
  await page.goto("/?seed=1");
  await page.getByRole("button", { name: "Pause" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(boostersSave);

  // The Tech Tree card says what unlocking it brought.
  await page.getByRole("button", { name: "Tech Tree" }).click();
  const tree = page.getByRole("dialog", { name: "Tech Tree" });
  await tree.getByRole("tab", { name: /^Mobility/ }).click();
  const card = tree
    .getByRole("tabpanel", { name: /^Mobility/ })
    .getByRole("article", { name: "Reusable boosters" });
  await expect(card).toContainText(
    `Cuts the Launch fee from $${fee}M to $${reducedFee.feeMillionDollars}M.`,
  );
  await expect(card).toContainText("✓ Unlocked");
  await tree.getByRole("button", { name: "Close" }).click();

  // The manifest on its way was paid for at the full fee.
  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  const cost = screen.getByRole("status", { name: "Launch cost" });
  await expect(cost).toHaveText(
    `Cost: $${fee + 9}M, paid as the Lander left Earth`,
  );
  await screen.getByRole("button", { name: "Close" }).click();

  const landed = page
    .getByRole("log", { name: "Notifications" })
    .getByText("Lander landed with");
  const skip = page.getByRole("button", { name: "Skip to next event" });
  for (let skips = 0; skips < 20 && !(await landed.isVisible()); skips++) {
    await skip.click();
  }
  await expect(landed).toBeVisible();

  // The next one costs the reduced fee.
  await page.getByRole("button", { name: "Launch manifest" }).click();
  await screen.getByRole("button", { name: "Add one Water, 50 kg" }).click();
  await expect(cost).toContainText(
    `Cost: $${reducedFee.feeMillionDollars + water.priceMillionDollars}M of `,
  );
  await expect(cost).toContainText(
    `including the $${reducedFee.feeMillionDollars}M Launch fee`,
  );
});
