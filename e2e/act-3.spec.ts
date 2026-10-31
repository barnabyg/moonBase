import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";

// Act 3, on the real data catalogue, as the player meets it.

let act3Save: string | undefined;

/** Starts the game at the start of Act 3, as `npm run try -- act-3` does, paused. */
async function loadAct3(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "act-3");
  if (scenario === undefined) throw new Error("expected an act-3 scenario");
  // It takes a while to play there, so that a worker does it only once.
  act3Save ??= scenario.save();
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause", exact: true })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "act-3.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(act3Save),
  });
  const panel = page.getByRole("complementary", { name: "Status panel" });
  await expect(panel.getByRole("status", { name: "Current Act" })).toHaveText(
    "Act 3: Scale",
  );
}

test("the Exports tab shows a Return Mass raised by the propellant in stock, and refuses more than that", async ({
  page,
}) => {
  await loadAct3(page);

  await page.getByRole("button", { name: "Launch manifest" }).click();
  await page.getByRole("tab", { name: "Exports" }).click();
  await expect(page.getByText("Return Mass: 0 of 350 kg")).toBeVisible();

  await page.getByRole("spinbutton", { name: "Circuit boards" }).fill("150");
  await page.getByRole("spinbutton", { name: "Metals" }).fill("150");
  await page.getByRole("spinbutton", { name: "Metals" }).blur();
  await expect(
    page.getByText("Return Mass: 300 of 350 kg, burning 400 kg of propellant"),
  ).toBeVisible();

  await page.getByRole("spinbutton", { name: "Metals" }).fill("250");
  await page.getByRole("spinbutton", { name: "Metals" }).blur();
  await expect(page.getByText(/over the Lander's Return Mass/)).toBeVisible();
});
