import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { catalogue } from "../src/catalogue";
import { tryScenarios } from "../test/try-scenarios";
import type { SaveFile } from "./crowded";
import { placeOnClearGround } from "./placement";

// Act 2, on the real data catalogue, as the player meets it.

const act1Ids = catalogue.milestones
  .filter(({ actId }) => actId === "act-1")
  .map(({ id }) => id);

/** A sample save of a base with a battery bank, with these Milestones reached. */
function saveWithReached(reachedMilestoneIds: readonly string[]): SaveFile {
  const save = JSON.parse(
    readFileSync(
      new URL("../test/saves/version-40.moonbase", import.meta.url),
      "utf8",
    ),
  ) as { state: { reachedMilestoneIds: readonly string[] } };
  save.state.reachedMilestoneIds = reachedMilestoneIds;
  return {
    name: "act-2.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  };
}

async function speed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true })
    .click();
}

async function load(page: Page, save: SaveFile): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(save);
}

function milestonesSection(page: Page) {
  const panel = page.getByRole("complementary", { name: "Status panel" });
  return {
    act: panel.getByRole("status", { name: "Current Act" }),
    asks: panel.getByRole("status", { name: "Act asks" }),
    current: panel.getByRole("status", { name: "Current Milestone" }),
    hint: panel.getByRole("status", { name: "Milestone hint" }),
    next: panel.getByRole("status", { name: "Next Milestone" }),
    living: panel.getByRole("status", { name: "Mission Director" }),
    notifications: page.getByRole("log", { name: "Notifications" }),
    skip: page.getByRole("button", { name: "Skip to next event" }),
  };
}

/** Clicks "Skip to next event" until the notification list shows the text. */
async function skipUntil(page: Page, text: string): Promise<void> {
  const { notifications, skip } = milestonesSection(page);
  for (let skips = 0; skips < 60; skips++) {
    if (
      (await notifications.isVisible()) &&
      (await notifications.textContent())?.includes(text) === true
    ) {
      return;
    }
    await skip.click();
  }
  await expect(notifications).toContainText(text);
}

let act2Save: string | undefined;

/** Starts the game at the start of Act 2, as `npm run try -- act-2` does, paused. */
async function loadAct2(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "act-2");
  if (scenario === undefined) throw new Error("expected an act-2 scenario");
  // It takes a while to play there, so that a worker does it only once.
  act2Save ??= scenario.save();
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  await load(page, {
    name: "act-2.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(act2Save),
  });
  await expect(milestonesSection(page).act).toHaveText("Act 2: Independence");
}

test("the Milestone that closes Act 1 brings a notification that Act 2 begins, and moves the panel on to it, with no line below moving up", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const section = milestonesSection(page);
  await expect(section.act).toHaveText("Act 1");
  await expect(section.asks).toHaveText(/^Keep the Mission Director alive/);

  await load(
    page,
    saveWithReached(act1Ids.filter((id) => id !== "power-storage")),
  );
  await expect(section.act).toHaveText("Act 1");
  await expect(section.current).toHaveText(
    "Now Power storage before the first Night",
  );
  await expect(section.next).toHaveText(
    "Next Workshop running, in Act 2: Independence",
  );
  const before = await section.living.boundingBox();

  await section.skip.click();

  await expect(section.notifications).toContainText(
    "Milestone reached: Power storage before the first Night",
  );
  await expect(section.notifications).toContainText(
    "Act 2: Independence begins.",
  );
  await expect(section.act).toHaveText("Act 2: Independence");
  await expect(section.asks).toHaveText(/^Stop relying on Earth/);
  await expect(section.current).toHaveText("Now Workshop running");
  await expect(section.hint).toContainText("Parts machining");
  await expect(section.next).toHaveText(
    "Next Self-sufficiency in spare Components",
  );
  const after = await section.living.boundingBox();
  expect(after?.y).toBeGreaterThanOrEqual(before?.y ?? Infinity);
});

test("an older save with all nine of Act 1's Milestones reached loads straight into Act 2, with no notification that it begins", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const section = milestonesSection(page);

  await load(page, saveWithReached(act1Ids));

  await expect(section.act).toHaveText("Act 2: Independence");
  await expect(section.current).toHaveText("Now Workshop running");
  await section.skip.click();
  await expect(section.notifications).toBeVisible();
  await expect(section.notifications).not.toContainText("begins");
});

test("Act 2 from its start: unlock and ship a Workshop, sell metals beside circuit boards, build it, and the panel follows", async ({
  page,
}) => {
  await loadAct2(page);
  const section = milestonesSection(page);
  await expect(section.current).toHaveText("Now Workshop running");

  await page.getByRole("button", { name: "Tech Tree" }).click();
  const tree = page.getByRole("dialog", { name: "Tech Tree" });
  await tree.getByRole("tab", { name: /^Industry/ }).click();
  const industry = tree.getByRole("tabpanel", { name: /^Industry/ });
  await industry
    .getByRole("button", { name: "Unlock Molten regolith electrolysis" })
    .click();
  await industry
    .getByRole("button", { name: "Unlock Parts machining" })
    .click();
  // Act 2's dearer Designs are there, and say what they bring.
  await expect(
    industry.getByRole("article", { name: "Array fabrication" }),
  ).toContainText("Unlocks the Array works");
  await tree.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Launch manifest" }).click();
  const manifest = page.getByRole("dialog", { name: "Launch manifest" });
  await manifest.getByRole("button", { name: "Add one Machine tool" }).click();
  await manifest
    .getByRole("button", { name: "Add one Casting furnace" })
    .click();
  await manifest.getByRole("tab", { name: "Exports" }).click();
  await expect(manifest.getByRole("row", { name: /Metals/ })).toContainText(
    "$1M a kg",
  );
  const load = (name: string) =>
    manifest.getByRole("spinbutton", { name: `Kilograms of ${name} to load` });
  await load("Circuit boards").fill("60");
  await load("Circuit boards").press("Enter");
  await load("Metals").fill("41");
  await load("Metals").press("Enter");
  await expect(manifest.getByRole("alert")).toContainText("Return Mass");
  await load("Metals").fill("40");
  await load("Metals").press("Enter");
  await expect(
    manifest.getByRole("status", { name: "Return Mass" }),
  ).toHaveText("Return Mass: 100 of 100 kg");
  await manifest.getByRole("button", { name: "Close" }).click();

  await skipUntil(page, "Robot loaded the Lander");
  await page.getByRole("button", { name: "Send the Lander" }).click();
  await skipUntil(page, "Milestone reached: Metals sold");
  await expect(section.notifications).toContainText(
    "sold 60 kg of circuit boards and 40 kg of metals for $220M",
  );
  // Reached out of order, so the Act's first still stands.
  await expect(section.current).toHaveText("Now Workshop running");
  await skipUntil(page, "Robot unloaded the Lander");

  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Workshop/ })
    .click();
  await placeOnClearGround(page);
  await skipUntil(page, "Milestone reached: Workshop running");
  await expect(section.current).toHaveText(
    "Now Self-sufficiency in spare Components",
  );
  await expect(
    page.getByRole("status", { name: "Self-sufficiency in spare Components" }),
  ).toHaveText(/^Spares (no|not yet)/);
});

test("the Guide covers Act 2's Structures, and the Launch manifest offers their parts once unlocked", async ({
  page,
}) => {
  await loadAct2(page);
  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog", { name: "Guide" });
  await expect(
    guide
      .getByRole("tabpanel", { name: "How it works" })
      .getByRole("article", { name: "Launches and Funding" }),
  ).toContainText("metals");
  await guide.getByRole("tab", { name: "Structures" }).click();
  const structures = guide.getByRole("tabpanel", { name: "Structures" });
  await expect(
    structures.getByRole("article", { name: "Concentrator tower" }),
  ).toContainText("generates 100 kW in Daylight");
  await expect(
    structures.getByRole("article", { name: "Array works" }),
  ).toContainText(
    "turning 2.4 kg of silicon and 2.4 kg of metals into 1 solar panel every 24 hours",
  );
  await expect(
    structures.getByRole("article", { name: "Thermal store" }),
  ).toContainText("stores 6000 kWh");
  await expect(
    structures.getByRole("article", { name: "Cold-trap ice line" }),
  ).toContainText("making 0.4 kg of water ice an hour from the ground");
});
