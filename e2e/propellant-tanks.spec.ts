import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";
import { structureEntry } from "./base-panel";
import { placeOnClearGround } from "./placement";

// The smallest screen the status panel is laid out for.
test.use({ viewport: { width: 1920, height: 1080 } });

async function speed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true })
    .click();
}

/**
 * Starts a base with a propellant plant and a propellant tank three batches from
 * full, as `npm run try -- propellant-tanks` does, with the game paused.
 */
async function loadBase(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "propellant-tanks");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "propellant-tanks.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
}

function propellantRow(page: Page) {
  return page
    .getByRole("complementary", { name: "Status panel" })
    .getByRole("status", { name: "Bulk resources", exact: true })
    .locator("[data-row]")
    .filter({ hasText: "Propellant" });
}

test("the status panel shows propellant against its limit, and at the limit the Plant waits and the Base panel says why", async ({
  page,
}) => {
  await loadBase(page);

  await expect(propellantRow(page)).toContainText("1047.0 of 1050 kg");
  await expect(structureEntry(page, "Propellant tank")).toContainText(
    "holds 598.3 of 600 kg of propellant, draws 0.2 kW at Night",
  );

  await speed(page, "5x");
  await expect(structureEntry(page, "Propellant plant")).toContainText(
    "waiting for tank space: Propellant is 1050.0 of 1050 kg",
  );
  await expect(propellantRow(page)).toContainText("holding full");
  await expect(propellantRow(page)).not.toContainText("kg/day");
  // It says so on one line, with nothing cut off.
  const size = await propellantRow(page).evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    overflow: element.scrollWidth - element.clientWidth,
  }));
  expect(size.height).toBeLessThan(20);
  expect(size.overflow).toBeLessThanOrEqual(0);
});

test("a second tank, picked from the build menu and commissioned, raises the limit with no propellant of its own, and its pop-up says what it holds", async ({
  page,
}) => {
  await loadBase(page);
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Propellant tank/ })
    .click();
  const site = await placeOnClearGround(page);
  await page.mouse.click(site.x, site.y);
  const popUp = page.getByRole("dialog", { name: "Propellant tank" });
  await expect(popUp).toContainText("under Construction");

  await speed(page, "20x");
  await expect(propellantRow(page)).toContainText("of 1650 kg");
  await speed(page, "Pause");

  await expect(popUp.getByRole("status", { name: "Tank" })).toContainText(
    "of 600 kg of propellant",
  );
});

test("a dismantled Propellant plant lowers the limit and loses nothing, with no notification of a loss", async ({
  page,
}) => {
  await loadBase(page);

  await structureEntry(page, "Propellant plant")
    .getByRole("button", { name: "Dismantle" })
    .click();
  await speed(page, "20x");

  await expect(propellantRow(page)).toContainText("of 600 kg");
  await speed(page, "Pause");
  await expect(propellantRow(page)).toContainText(
    /^Propellant\s*10\d\d\.\d of 600 kg/,
  );
  await expect(
    page.getByRole("log", { name: "Notifications" }).getByText(/was lost/),
  ).toHaveCount(0);
});

test("the Guide says what limits propellant, and the Launch manifest offers the tank's parts and no propellant", async ({
  page,
}) => {
  await loadBase(page);
  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog", { name: "Guide" });

  await expect(
    guide
      .getByRole("tabpanel", { name: "How it works" })
      .getByRole("article", { name: "Power and Night" }),
  ).toContainText("Propellant has a limit as well");

  await guide.getByRole("tab", { name: "Structures" }).click();
  const structures = guide.getByRole("tabpanel", { name: "Structures" });
  await expect(
    structures.getByRole("article", { name: "Propellant tank", exact: true }),
  ).toContainText("adds 600 kg to what the base can hold of propellant");
  await expect(
    structures.getByRole("article", { name: "Propellant plant", exact: true }),
  ).toContainText("It holds 450 kg of propellant");
  await guide.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  await expect(
    screen.getByRole("button", { name: /Add one Propellant tank shell/ }),
  ).toBeVisible();
  await expect(
    screen.getByRole("button", { name: /Add one Propellant,/ }),
  ).toHaveCount(0);
});
