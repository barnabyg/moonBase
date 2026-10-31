import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { catalogue } from "../src/catalogue";
import { CROWDED_LAUNCH_ITEMS } from "../test/crowded-catalogue";
import { freshSaveWith, tryScenarios } from "../test/try-scenarios";
import { useCrowdedCatalogue } from "./crowded";

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

/** Loads the text of a save into the game, paused so that nothing changes yet. */
async function loadSave(
  page: Page,
  testInfo: TestInfo,
  save: string,
): Promise<void> {
  const file = testInfo.outputPath("prepared.moonbase");
  writeFileSync(file, save);
  await page.getByRole("button", { name: "Pause" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(file);
}

/** A Campaign with every Design unlocked and Funding for anything. */
function everythingUnlocked(): string {
  const scenario = tryScenarios.find(
    (candidate) => candidate.id === "everything-unlocked",
  );
  if (scenario === undefined) throw new Error("expected everything-unlocked");
  return scenario.save();
}

/** The Launch items whose rows are shown on the Imports tab, from the top. */
async function rowsShown(screen: Locator): Promise<string[]> {
  return screen
    .locator("tr[data-row]")
    .evaluateAll((rows) =>
      rows
        .filter((row) => row.checkVisibility())
        .map((row) => (row as HTMLElement).dataset["row"] ?? ""),
    );
}

test("at the start of a Campaign, the Imports tab lists its items in groups, with no box to find one", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  await expect(
    screen
      .getByRole("region", { name: "Power" })
      .getByRole("row", { name: /^Solar panel/ }),
  ).toBeVisible();
  await expect(
    screen
      .getByRole("region", { name: "Supplies" })
      .getByRole("row", { name: /^Oxygen/ }),
  ).toBeVisible();
  // None of Protection's Designs is unlocked yet.
  await expect(screen.getByRole("region", { name: "Protection" })).toBeHidden();
  await expect(screen.getByRole("searchbox")).toBeHidden();
});

test("on a catalogue of 80 Launch items, the player can find an item by what it is called or what it is for, with the bars still in sight", async ({
  page,
}, testInfo) => {
  await useCrowdedCatalogue(page);
  await page.goto("/?seed=1");
  await loadSave(page, testInfo, everythingUnlocked());
  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  const find = screen.getByRole("searchbox", { name: "Find an item" });
  const shown = screen.getByRole("status", { name: "Items shown" });
  const payloadMass = screen.getByRole("status", { name: "Payload Mass" });
  const cost = screen.getByRole("status", { name: "Launch cost" });
  await expect(shown).toHaveText(`${CROWDED_LAUNCH_ITEMS} items`);
  const all = await rowsShown(screen);
  expect(all).toHaveLength(CROWDED_LAUNCH_ITEMS);

  // Scrolled to the far end, the bars and the box are still in sight.
  const last = screen.locator(`tr[data-row="${all.at(-1) ?? ""}"]`);
  await last.scrollIntoViewIfNeeded();
  for (const inSight of [payloadMass, cost, find, last]) {
    await expect(inSight).toBeInViewport();
  }

  // By what it is called, in any case.
  await find.fill("MADE-UP PART 20");
  await expect(shown).toHaveText(`Showing 1 of ${CROWDED_LAUNCH_ITEMS} items`);
  await expect(
    screen.getByRole("row", { name: /^Made-up part 20\b/ }),
  ).toBeVisible();

  // By what it is for: an array mast doesn't say "solar" in its name, only
  // in the Structures it goes into.
  await find.fill("solar array");
  await expect(screen.getByRole("row", { name: /^Array mast/ })).toBeVisible();
  await expect(screen.getByRole("row", { name: /^Oxygen/ })).toBeHidden();

  // With its mass and price, and a group with nothing to show goes.
  await find.fill("telescope");
  await expect(
    screen.getByRole("row", { name: /^Telescope optics/ }),
  ).toContainText("140 kg, $18M");
  await expect(screen.getByRole("region", { name: "Power" })).toBeHidden();
  await expect(screen.getByRole("region", { name: "Industry" })).toBeVisible();

  // Chosen from what is left, which counts towards the bars as usual.
  await screen
    .getByRole("button", { name: "Add one Telescope optics" })
    .click();
  await expect(payloadMass).toHaveText(`Payload Mass: 140 of ${limit} kg`);

  // By the name of a group.
  await find.fill("supplies");
  await expect(
    screen.getByRole("row", { name: /^Spare Component/ }),
  ).toBeVisible();
  await expect(screen.getByRole("row", { name: /^Solar panel/ })).toBeHidden();

  // Nothing found says so, and clearing it brings them all back.
  await find.fill("no such thing");
  await expect(shown).toHaveText("No items match");
  expect(await rowsShown(screen)).toHaveLength(0);
  await screen.getByRole("button", { name: "Clear" }).click();
  await expect(find).toHaveValue("");
  await expect(find).toBeFocused();
  await expect(shown).toHaveText(`${CROWDED_LAUNCH_ITEMS} items`);

  // The Exports tab is as it was, and what was typed waits on the Imports tab.
  await find.fill("telescope");
  await screen.getByRole("tab", { name: "Exports" }).click();
  await expect(
    screen.getByRole("spinbutton", { name: "Kilograms of Wafers to load" }),
  ).toBeVisible();
  await expect(find).toBeHidden();
  await screen.getByRole("tab", { name: "Imports" }).click();
  await expect(find).toHaveValue("telescope");
  await expect(shown).toHaveText(`Showing 2 of ${CROWDED_LAUNCH_ITEMS} items`);
});

test("at the fastest game speed, what the player types to find an item stays as it is, with the caret where they left it", async ({
  page,
}, testInfo) => {
  await useCrowdedCatalogue(page);
  await page.goto("/?seed=1");
  await loadSave(page, testInfo, everythingUnlocked());
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: /^\d+x$/ })
    .last()
    .click();
  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  const find = screen.getByRole("searchbox", { name: "Find an item" });
  await find.click();
  await page.keyboard.type("batery");
  await expect(find).toHaveValue("batery");
  await expect(screen.getByRole("status", { name: "Items shown" })).toHaveText(
    "No items match",
  );

  // The caret back to just after "bat", then the game left to run on.
  await page.keyboard.press("Home");
  for (let moves = 0; moves < 3; moves++) {
    await page.keyboard.press("ArrowRight");
  }
  const clock = page.getByRole("status", { name: "Game clock" });
  const before = (await clock.textContent()) ?? "";
  await expect(clock).not.toHaveText(before);
  await expect(find).toBeFocused();
  await expect(find).toHaveValue("batery");

  // The next key goes in there, and the list follows it.
  await page.keyboard.type("t");
  await expect(find).toHaveValue("battery");
  await expect(
    screen.getByRole("row", { name: /^Battery module/ }),
  ).toBeVisible();
  await expect(find).toBeFocused();
  expect(
    await find.evaluate((input) => (input as HTMLInputElement).selectionStart),
  ).toBe(4);
});

test("a Design unlocked adds its group in its place, with every other row in the same order", async ({
  page,
}, testInfo) => {
  await page.goto("/?seed=1");
  await loadSave(
    page,
    testInfo,
    freshSaveWith((state) => {
      state.science = 100;
    }),
  );
  await expect(
    page.getByRole("status", { name: "Science", exact: true }),
  ).toHaveText("100");

  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  await expect(screen.getByRole("region", { name: "Protection" })).toBeHidden();
  const before = await rowsShown(screen);
  await screen.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Tech Tree" }).click();
  const tree = page.getByRole("dialog", { name: "Tech Tree" });
  await tree.getByRole("tab", { name: /^Protection/ }).click();
  await tree
    .getByRole("button", { name: "Unlock Dust-sealed solar arrays" })
    .click();
  await tree.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Launch manifest" }).click();
  await expect(
    screen.getByRole("region", { name: "Protection" }),
  ).toBeVisible();
  const after = await rowsShown(screen);
  expect(after.filter((row) => before.includes(row))).toEqual(before);
  // After Construction and before Life Support, as in the Tech Tree, not at
  // the end.
  const sealed = after.indexOf("sealed-array-mast");
  expect(sealed).toBeGreaterThan(after.indexOf("mast-pole"));
  expect(sealed).toBeLessThan(after.indexOf("habitat-core"));
});
