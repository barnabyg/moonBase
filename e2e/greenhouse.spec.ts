import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";
import { doing, structureEntry } from "./base-panel";

async function speed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true })
    .click();
}

/**
 * Starts a base with a Greenhouse growing a few hours before Night, on a day's water
 * above the reserve, as `npm run try -- greenhouse` does, with the game paused so
 * that nothing moves on between the steps.
 */
async function loadGreenhouseBase(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "greenhouse");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "greenhouse.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
}

function waterLine(page: Page) {
  return page
    .getByRole("complementary", { name: "Status panel" })
    .getByRole("status", { name: "Water", exact: true });
}

test("the Base panel and status panel say what a Greenhouse is doing, and it goes on through the Night until a shortage of water loses its round, with a notification", async ({
  page,
}) => {
  await loadGreenhouseBase(page);
  const greenhouse = structureEntry(page, "Greenhouse");

  await expect(greenhouse).toContainText("growing");
  await expect(greenhouse).toContainText("left of this round");
  await expect(doing(greenhouse)).toHaveAttribute(
    "title",
    "using 1 kg of water an hour, for 20 Science a round",
  );
  await expect(waterLine(page)).toContainText("Greenhouse using 24 kg a day");
  await expect(waterLine(page)).toContainText("down to the reserve in");

  await speed(page, "20x");
  await expect(
    page.getByText("Greenhouse: its round of growing lost for want of water"),
  ).toBeVisible();
  await speed(page, "Pause");
  await expect(greenhouse).toContainText("waiting for Water");
  await expect(greenhouse).toContainText(
    "the Mission Director's reserve of 49 kg",
  );
  await expect(waterLine(page)).toContainText(
    "Greenhouse waiting at the reserve",
  );
});

test("a Greenhouse switched off gives up its round, and its Structure can be switched back on from the Base panel", async ({
  page,
}) => {
  await loadGreenhouseBase(page);
  const greenhouse = structureEntry(page, "Greenhouse");

  await greenhouse.getByRole("button", { name: "Switch off" }).click();
  await speed(page, "5x");
  await expect(
    page.getByText("Greenhouse: its round of growing given up"),
  ).toBeVisible();
  await speed(page, "Pause");
  await expect(greenhouse).toContainText("switched off");

  await greenhouse.getByRole("button", { name: "Switch on" }).click();
  await speed(page, "5x");
  await expect(greenhouse).toContainText("growing");
});

test("a Greenhouse can be picked in the build menu, and the Guide says what it asks for", async ({
  page,
}) => {
  await loadGreenhouseBase(page);

  const build = page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Greenhouse/ });
  await expect(build).toBeVisible();

  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog", { name: "Guide" });
  await expect(guide).toContainText("a shortage of water or power loses");
});
