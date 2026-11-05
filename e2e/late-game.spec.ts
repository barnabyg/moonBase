import { expect, test, type Page } from "@playwright/test";
import { LATE_GAME_SCIENCE, tryScenarios } from "../test/try-scenarios";
import { structureEntry } from "./base-panel";
import { placeOnClearGround } from "./placement";

async function speed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true })
    .click();
}

/**
 * Starts the base `npm run try -- late-game` does, with the game paused so that
 * nothing moves on between the steps.
 */
async function loadLateGame(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "late-game");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "late-game.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
}

function buildButton(page: Page, name: RegExp) {
  return page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name });
}

test("the Tech Tree offers a Vault cistern for all the Science a late base has, and unlocking it brings its Structure and its Launch item", async ({
  page,
}) => {
  await loadLateGame(page);
  await expect(buildButton(page, /^Vault cistern/)).toBeHidden();

  await page.getByRole("button", { name: "Tech Tree" }).click();
  const tree = page.getByRole("dialog", { name: "Tech Tree" });
  await tree.getByRole("tab", { name: /^Life Support/ }).click();
  await expect(
    tree.getByRole("heading", { name: "Growing halls", exact: true }),
  ).toBeVisible();
  await tree.getByRole("tab", { name: /^Protection/ }).click();
  await expect(tree).toContainText("Vault cistern");
  await expect(tree).toContainText(`${LATE_GAME_SCIENCE} Science`);
  await tree.getByRole("button", { name: "Unlock Vault cistern" }).click();
  await expect(
    page.getByRole("status", { name: "Science", exact: true }),
  ).toContainText("0");
  await page.keyboard.press("Escape");

  await expect(buildButton(page, /^Vault cistern/)).toBeVisible();
  await page.getByRole("button", { name: "Launch manifest" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Launch manifest" })
      .getByRole("row", { name: /^Cistern cell/ }),
  ).toBeVisible();
});

test("a growing hall, built on the late base, says what it is doing and earns its first round, and the Guide says what it asks for", async ({
  page,
}) => {
  await loadLateGame(page);

  await buildButton(page, /^Growing hall/).click();
  // Far enough out for its wide footprint to find clear ground on the screen.
  const box = await page.locator("canvas").boundingBox();
  if (box === null) throw new Error("The 3D view has no size.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 1_500);
  await placeOnClearGround(page);
  // Its Assembly and commissioning, and then its round, are longer than an
  // expectation should wait for, even at 20x on a slow runner, so the game
  // stays paused and skips from event to event.
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const hall = structureEntry(page, "Growing hall");
  const growing = hall.filter({ hasText: "using 2 kg of water an hour" });
  for (let skips = 0; skips < 60 && (await growing.count()) === 0; skips++) {
    await skip.click();
  }
  await expect(hall).toContainText("growing");
  await expect(hall).toContainText(
    "using 2 kg of water an hour, for 100 Science a round",
  );
  const round = page.getByText("Growing hall: a round of growing complete");
  for (let skips = 0; skips < 60 && !(await round.isVisible()); skips++) {
    await skip.click();
  }
  await expect(round).toBeVisible();

  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog", { name: "Guide" });
  await expect(guide).toContainText("the Growing halls Design");
  await expect(guide).toContainText("a vault cistern");
});
