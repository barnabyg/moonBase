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

test("the Research Tasks screen says what Science buys next, and what each task's Science brings within reach", async ({
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
  await expect(
    research.getByRole("article", { name: "Regolith sample analysis" }),
  ).not.toContainText("Brings within reach");
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
