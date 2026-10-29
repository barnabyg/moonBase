import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { catalogue } from "../src/catalogue";

function structureType(id: string) {
  const type = catalogue.structureTypes.find((each) => each.id === id);
  if (type === undefined) throw new Error(`expected a ${id}`);
  return type;
}

async function pause(page: Page): Promise<void> {
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
}

test("the Launch manifest says what each item is for", async ({ page }) => {
  await pause(page);
  await page.getByRole("button", { name: "Launch manifest" }).click();
  const manifest = page.getByRole("dialog", { name: "Launch manifest" });

  const pad = structureType("landing-pad");
  const panels = pad.components.find(
    (need) => need.componentId === "pad-panel",
  );
  await expect(manifest.getByRole("row", { name: /^Pad panel/ })).toContainText(
    `${panels?.count} for each ${pad.label}`,
  );
  await expect(
    manifest.getByRole("row", { name: /^Spare Component/ }),
  ).toContainText("Used up by Maintenance");
  const [oxygen] = catalogue.lifeSupportStocks;
  await expect(manifest.getByRole("row", { name: /^Oxygen,/ })).toContainText(
    `uses ${oxygen?.usePerEarthDayKilograms} kg of oxygen an Earth Day`,
  );
});

test("the Tech Tree says what each Design unlocks, with what it does", async ({
  page,
}) => {
  await pause(page);
  await page.getByRole("button", { name: "Tech Tree" }).click();
  const tree = page.getByRole("dialog", { name: "Tech Tree" });
  const tall = structureType("tall-light-mast");

  const card = tree.getByRole("article", { name: "Tall Light Masts" });
  await expect(card).toContainText(`Unlocks the ${tall.label}`);
  await expect(card).toContainText(`${tall.lightRadiusMetres} m`);
});

test("the Research Tasks screen says what Science buys next, and what each task's Science brings within reach or builds towards", async ({
  page,
}) => {
  await pause(page);
  await page.getByRole("button", { name: "Research Tasks" }).click();
  const research = page.getByRole("dialog", { name: "Research Tasks" });

  const next = research.getByRole("region", { name: "What Science buys next" });
  await expect(next).toContainText("Robots");
  await expect(next).toContainText("20 Science");
  await expect(
    research.getByRole("article", { name: "Dust levitation study" }),
  ).toContainText(/Brings within reach: .*Robots/);
  // One that pays too little on its own says what it builds towards, and
  // how far short it leaves the player: 20 Science for the cheapest
  // Designs, less the 5 it pays.
  const small = research.getByRole("article", {
    name: "Regolith sample analysis",
  });
  await expect(small).not.toContainText("Brings within reach");
  await expect(small).toContainText(/Towards .*Robots.* \(20 Science\)/);
  await expect(small).toContainText("15 Science short after this task");
});

test("the build menu says what each Structure does", async ({ page }) => {
  await pause(page);
  const bank = structureType("battery-bank");

  await expect(
    page
      .getByRole("complementary", { name: "Build menu" })
      .getByRole("button", { name: /^Battery bank/ }),
  ).toHaveAttribute(
    "title",
    new RegExp(`stores ${bank.power.storageKilowattHours} kWh`),
  );
});

test("the build menu offers a parking area from the start, and says what its bays are for", async ({
  page,
}) => {
  await pause(page);
  const area = structureType("parking-area");

  const button = page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /^Parking area/ });
  await expect(button).toBeVisible();
  await expect(button).toContainText("0 available");
  await expect(button).toHaveAttribute(
    "title",
    new RegExp(
      `has ${area.parking?.bayOffsets.length} bays, each with a power socket`,
    ),
  );
});

test("the Tech Tree says what the telescope earns, and its status line explains the observing programme on hover", async ({
  page,
}) => {
  await pause(page);
  const telescope = structureType("telescope");
  const { label, science } = catalogue.observingProgramme;

  await page.getByRole("button", { name: "Tech Tree" }).click();
  const tree = page.getByRole("dialog", { name: "Tech Tree" });
  await tree.getByRole("tab", { name: /^Industry/ }).click();
  const card = tree.getByRole("article", { name: "Optical telescopes" });
  await expect(card).toContainText(`Unlocks the ${telescope.label}`);
  await expect(card).toContainText(
    `observes the sky at Night for the ${label}`,
  );
  await expect(card).toContainText(`a round for ${science} Science`);
  await tree.getByRole("button", { name: "Close" }).click();

  // A base with a telescope observing.
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles(
    fileURLToPath(
      new URL("../test/saves/version-39.moonbase", import.meta.url),
    ),
  );
  await expect(
    page
      .getByRole("complementary", { name: "Status panel" })
      .getByRole("status", { name: "Observing programme" }),
  ).toHaveAttribute(
    "title",
    new RegExp(`^The standing Research Task .* pays ${science} Science\\.`),
  );
});

test("the Guide says what every Component is for", async ({ page }) => {
  await pause(page);
  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog", { name: "Guide" });
  await guide.getByRole("tab", { name: "Components" }).click();
  const components = guide.getByRole("tabpanel", { name: "Components" });

  await expect(
    components.getByRole("article", { name: "Light head", exact: true }),
  ).toContainText("for each Light mast");
  await expect(
    components.getByRole("article", { name: "Airlock", exact: true }),
  ).toContainText("for each Inflatable Habitat");
});
