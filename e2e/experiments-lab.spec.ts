import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";
import { structureEntry } from "./base-panel";

async function speed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true })
    .click();
}

/**
 * Starts a base with an automated experiments lab speeding up a long Research
 * Task in Daylight, as `npm run try -- experiments-lab` does, with the game paused
 * so that nothing moves on between the steps.
 */
async function loadLabBase(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "experiments-lab");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "experiments-lab.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
}

test("the Research Tasks screen and the Base panel say how fast an automated experiments lab runs the Research Task, and the Base panel what it uses", async ({
  page,
}) => {
  await loadLabBase(page);
  const lab = structureEntry(page, "Automated experiments lab");

  await expect(lab).toContainText("speeding up the Research Task running");
  await expect(lab).toContainText("0.5 kg of water and 0.1 kg of oxygen");

  await page.getByRole("button", { name: "Research Tasks" }).click();
  const research = page.getByRole("dialog", { name: "Research Tasks" });
  const running = research.getByRole("status", {
    name: "Research Task running",
  });
  await expect(running).toContainText("Solar wind volatiles survey");
  await expect(running).toContainText("left at ×2");
  await expect(running).toContainText(
    "1 automated experiments lab speeding it up",
  );
});

test("an automated experiments lab switched off stops speeding up the Research Task, and the Research Tasks screen says so", async ({
  page,
}) => {
  await loadLabBase(page);
  const lab = structureEntry(page, "Automated experiments lab");

  await lab.getByRole("button", { name: "Switch off" }).click();
  await speed(page, "5x");
  await expect(lab).toContainText("switched off");
  await speed(page, "Pause");

  await page.getByRole("button", { name: "Research Tasks" }).click();
  const running = page
    .getByRole("dialog", { name: "Research Tasks" })
    .getByRole("status", { name: "Research Task running" });
  await expect(running).not.toContainText("left at ×");
  await expect(running).toContainText(
    "1 automated experiments lab switched off",
  );
});

test("an automated experiments lab can be picked in the build menu, and the Guide says what it asks for", async ({
  page,
}) => {
  await loadLabBase(page);

  const build = page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Automated experiments lab/ });
  await expect(build).toBeVisible();

  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog", { name: "Guide" });
  await expect(guide).toContainText(
    "makes the Research Task running advance faster",
  );
});
