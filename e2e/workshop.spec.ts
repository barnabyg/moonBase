import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";
import { placeOnClearGround } from "./placement";

/**
 * Starts a base with a Workshop running, as `npm run try -- workshop` does,
 * with the game paused so that no batch moves on between the steps.
 */
async function loadWorkshopBase(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "workshop");
  if (scenario === undefined) throw new Error("expected a workshop scenario");
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "workshop.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
}

async function speed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true })
    .click();
}

test("the Base panel and the forecast say what a Workshop is making, and follow it being switched off and its metals running out", async ({
  page,
}) => {
  await loadWorkshopBase(page);
  const workshop = page
    .getByRole("list", { name: "Structures" })
    .getByRole("listitem")
    .filter({ hasText: "Workshop" });
  const spares = page
    .getByRole("complementary", { name: "Status panel" })
    .getByRole("status", { name: "Spare Components", exact: true });

  await expect(workshop).toContainText(
    /Condition \d+% running, \d+[dh]( \d+h)? left of this batch · making 1 spare Component every 24 hours from 3\.6 kg of metals/,
  );
  await expect(spares).toHaveText(/^Spares \d+ in stock · rising 0\.\d a day$/);

  await workshop.getByRole("button", { name: "Switch off" }).click();
  await expect(workshop).toContainText(
    /running, \d+[dh]( \d+h)? left of its last batch before switching off/,
  );
  // The batch under way finishes, but the forecast counts on none of it.
  await expect(spares).toHaveText(
    /^Spares \d+ in stock · last .*, Workshop switched off$/,
  );
  await workshop.getByRole("button", { name: "Switch on" }).click();
  await expect(spares).toHaveText(/· rising 0\.\d a day$/);

  // Its metals run out: its stock rises as they go, and then it waits.
  const stock = async () =>
    Number(/(\d+) in stock/.exec((await spares.textContent()) ?? "")?.[1]);
  const before = await stock();
  await speed(page, "20x");
  await expect(workshop).toContainText(/waiting for Metals: [\d.]+ of 3\.6 kg/);
  await speed(page, "Pause");
  expect(await stock()).toBeGreaterThan(before);
  await expect(spares).toHaveText(/^Spares \d+ in stock · last /);
});

test("the Guide and the Tech Tree say what a Workshop does and what it takes", async ({
  page,
}) => {
  await loadWorkshopBase(page);
  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog", { name: "Guide" });

  await expect(
    guide
      .getByRole("tabpanel", { name: "How it works" })
      .getByRole("article", { name: "Repairs and Maintenance" }),
  ).toContainText("in a Workshop");

  await guide.getByRole("tab", { name: "Structures" }).click();
  const card = guide
    .getByRole("tabpanel", { name: "Structures" })
    .getByRole("article", { name: "Workshop", exact: true });
  await expect(card).toContainText(
    "turning 3.6 kg of metals into 1 spare Component every 24 hours",
  );
  await expect(card).toContainText("1 machine tool and 1 casting furnace");
  await expect(card).toContainText("batches, here of 24 hours");

  await guide.getByRole("tab", { name: "Technologies" }).click();
  const design = guide
    .getByRole("tabpanel", { name: "Technologies" })
    .getByRole("article", { name: "Parts machining" });
  await expect(design).toContainText("Unlocks the Workshop");
  await expect(design).toContainText("Machined part wear trial");
  await guide.getByRole("button", { name: "Close" }).click();
});

test("clicked on the map, a Workshop built from the build menu says in its pop-up what it makes", async ({
  page,
}) => {
  await loadWorkshopBase(page);
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Workshop/ })
    .click();
  const site = await placeOnClearGround(page);

  await page.mouse.click(site.x, site.y);
  const popUp = page.getByRole("dialog", { name: "Workshop" });
  await expect(popUp).toContainText("under Construction");

  await speed(page, "20x");
  await expect(popUp.getByRole("status", { name: "Recipe" })).toHaveText(
    "Recipe Spare Components",
  );
  await expect(popUp.getByRole("status", { name: "Output" })).toHaveText(
    /making 1 spare Component every 24 hours from 3\.6 kg of metals/,
  );
  await speed(page, "Pause");
  await expect(
    popUp.getByRole("button", { name: /Switch (off|on)/ }),
  ).toBeVisible();
});
