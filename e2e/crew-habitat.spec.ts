import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";

/**
 * Starts a base with a stocked Large-scale Crew Habitat being commissioned and
 * every other Milestone reached, as `npm run try -- crew-habitat` does, with the
 * game paused so that nothing moves on between the steps.
 */
async function loadBase(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "crew-habitat");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "crew-habitat.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
  // What the Milestones' title says is "Now", shown once the section is folded.
  await expect(
    page.getByRole("status", {
      name: "Milestones summary",
      includeHidden: true,
    }),
  ).toHaveText("Large-scale Crew Habitat commissioned");
}

function speedButton(page: Page, name: string) {
  return page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true });
}

async function speed(page: Page, name: string): Promise<void> {
  await speedButton(page, name).click();
}

test("commissioning a Large-scale Crew Habitat celebrates the last Milestone, pausing the game until the player carries on", async ({
  page,
}) => {
  await loadBase(page);
  const celebration = page.getByRole("dialog", { name: "Ready for Crew" });
  await expect(celebration).toBeHidden();

  await speed(page, "20x");

  await expect(celebration).toBeVisible();
  await expect(celebration).toContainText("next phase");
  await expect(celebration).toContainText("goes on");
  await expect(speedButton(page, "Pause")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await celebration.getByRole("button", { name: "Carry on" }).click();

  await expect(celebration).toBeHidden();
  await expect(speedButton(page, "20x")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByText("Milestone reached: Large-scale Crew Habitat commissioned"),
  ).toBeVisible();
});
