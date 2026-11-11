import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";
import { doing, structureEntry } from "./base-panel";
import { placeOnClearGround } from "./placement";

// A full HD screen, with room for the status panel to show the lines checked.
test.use({ viewport: { width: 1920, height: 1080 } });

async function speed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true })
    .click();
}

/**
 * Starts a base with a propellant plant, a bucket-wheel digger and a Regolith
 * bin, as `npm run try -- regolith-digger` does, with the game paused.
 */
async function loadBase(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "regolith-digger");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "regolith-digger.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
}

function regolithRow(page: Page) {
  return page
    .getByRole("complementary", { name: "Status panel" })
    .getByRole("status", { name: "Bulk resources", exact: true })
    .locator("[data-row]")
    .filter({ hasText: "Regolith" });
}

test("the status panel shows Regolith against the heap's and the bin's limit, and the digger adds to it by itself", async ({
  page,
}) => {
  await loadBase(page);

  await expect(regolithRow(page)).toContainText("4800.0 of 5000 kg");
  const bin = structureEntry(page, "Regolith bin");
  await expect(bin).toContainText("holds 2880 of 3000 kg of Regolith");
  await expect(bin).not.toContainText("kW");

  await speed(page, "5x");
  await expect(
    doing(structureEntry(page, "Bucket-wheel digger")),
  ).toHaveAttribute(
    "title",
    "making 30 kg of Regolith an hour from the ground",
  );
  await expect(regolithRow(page)).toContainText(/\+\d+\.\d kg\/day/);
});

test("a second bin, picked from the build menu and commissioned, raises the limit by 3000 kg with no cable", async ({
  page,
}) => {
  await loadBase(page);
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Regolith bin/ })
    .click();
  const site = await placeOnClearGround(page);
  await page.mouse.click(site.x, site.y);
  const popUp = page.getByRole("dialog", { name: "Regolith bin" });
  await expect(popUp).toContainText("under Construction");

  await speed(page, "20x");
  await expect(regolithRow(page)).toContainText("of 8000 kg");
  await speed(page, "Pause");

  await expect(popUp.getByRole("status", { name: "Tank" })).toContainText(
    "of 3000 kg of Regolith",
  );
});

test("the Guide says what the bin and the digger do, and the Launch manifest offers their parts", async ({
  page,
}) => {
  await loadBase(page);
  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog", { name: "Guide" });

  await expect(
    guide
      .getByRole("tabpanel", { name: "How it works" })
      .getByRole("article", { name: "Power and Night" }),
  ).toContainText("The heap holds 2000 kg of Regolith");

  await guide.getByRole("tab", { name: "Structures" }).click();
  const structures = guide.getByRole("tabpanel", { name: "Structures" });
  await expect(
    structures.getByRole("article", { name: "Regolith bin", exact: true }),
  ).toContainText("adds 3000 kg to what the base can hold of Regolith");
  await expect(
    structures.getByRole("article", {
      name: "Bucket-wheel digger",
      exact: true,
    }),
  ).toContainText("making 30 kg of Regolith an hour");
  await guide.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  for (const part of ["Bucket-wheel head", "Regolith conveyor"]) {
    await expect(
      screen.getByRole("button", { name: new RegExp(`Add one ${part}`) }),
    ).toBeVisible();
  }
  await expect(
    screen.getByRole("button", { name: /Add one Regolith bin walls/ }),
  ).toBeVisible();
});
