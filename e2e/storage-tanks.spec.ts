import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";
import { placeOnClearGround } from "./placement";

async function speed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true })
    .click();
}

/**
 * Starts a base with a water tank and an oxygen tank half full, as `npm run try
 * -- storage-tanks` does, with the game paused so that nothing moves on between
 * the steps.
 */
async function loadTankBase(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "storage-tanks");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "storage-tanks.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
}

function stockLine(page: Page, name: string) {
  return page
    .getByRole("complementary", { name: "Status panel" })
    .getByRole("status", { name, exact: true });
}

function entryOf(page: Page, name: string) {
  return page
    .getByRole("group", { name: "Structures", exact: true })
    .getByRole("listitem")
    .filter({ hasText: name });
}

test("the status panel counts the tanks in each limit, and the Base panel says what each holds and draws, in Daylight and at Night", async ({
  page,
}) => {
  await loadTankBase(page);

  await expect(stockLine(page, "Water")).toHaveText(
    /^Water 700(\.0)? of 1400 kg/,
  );
  await expect(stockLine(page, "Oxygen")).toHaveText(
    /^Oxygen 200(\.0)? of 400 kg/,
  );
  await expect(entryOf(page, "Water tank")).toContainText(
    "holds 500 of 1000 kg of water, draws 0.05 kW at Night",
  );
  await expect(entryOf(page, "Oxygen tank")).toContainText(
    "holds 150 of 300 kg of oxygen, draws 0.15 kW at Night",
  );

  await speed(page, "5x");
  await expect(entryOf(page, "Oxygen tank")).toContainText("drawing 0.15 kW");
  await speed(page, "Pause");
  await expect(entryOf(page, "Water tank")).toContainText("drawing 0.05 kW");
});

test("a second water tank, picked from the build menu and commissioned, raises the limit with no water of its own, and its pop-up says what it holds", async ({
  page,
}) => {
  await loadTankBase(page);
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Water tank/ })
    .click();
  const site = await placeOnClearGround(page);
  await page.mouse.click(site.x, site.y);
  const popUp = page.getByRole("dialog", { name: "Water tank" });
  await expect(popUp).toContainText("under Construction");

  await speed(page, "20x");
  await expect(stockLine(page, "Water")).toHaveText(/of 2400 kg/);
  await speed(page, "Pause");

  await expect(stockLine(page, "Water")).toHaveText(
    /^Water 700(\.0)? of 2400 kg/,
  );
  await expect(popUp.getByRole("status", { name: "Tank" })).toContainText(
    "of 1000 kg of water",
  );
});

test("a dismantled oxygen tank takes what no longer fits with it, with a notification, and the limit falls", async ({
  page,
}) => {
  await loadTankBase(page);

  await entryOf(page, "Oxygen tank")
    .getByRole("button", { name: "Dismantle" })
    .click();
  await speed(page, "20x");

  await expect(stockLine(page, "Oxygen")).toHaveText(
    /^Oxygen 100(\.0)? of 100 kg/,
  );
  await expect(
    page
      .getByRole("log", { name: "Notifications" })
      .getByText(
        "Oxygen tank is being taken apart, and the 100 kg of oxygen with no room left was lost",
      ),
  ).toBeVisible();
});

test("the Guide and the Tech Tree say what the tanks do, and the Launch manifest offers their parts and no bulk supplies", async ({
  page,
}) => {
  await loadTankBase(page);
  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog", { name: "Guide" });

  await expect(
    guide
      .getByRole("tabpanel", { name: "How it works" })
      .getByRole("article", { name: "Power and Night" }),
  ).toContainText("A storage tank (the Bulk supply tanks Design)");

  await guide.getByRole("tab", { name: "Structures" }).click();
  const card = guide
    .getByRole("tabpanel", { name: "Structures" })
    .getByRole("article", { name: "Oxygen tank", exact: true });
  await expect(card).toContainText(
    "adds 300 kg to what the base can hold of oxygen",
  );
  await expect(card).toContainText(
    "draws 0.15 kW all through the Night, and nothing in Daylight",
  );
  await expect(card).toContainText("1 oxygen sphere and 1 tank cooler");

  await guide.getByRole("tab", { name: "Technologies" }).click();
  const design = guide
    .getByRole("tabpanel", { name: "Technologies" })
    .getByRole("article", { name: "Bulk supply tanks" });
  await expect(design).toContainText("Water tank");
  await expect(design).toContainText("Oxygen tank");
  await expect(design).toContainText("Cryogenic boil-off trial");
  await guide.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  await expect(
    screen.getByRole("button", { name: /Add one Oxygen sphere/ }),
  ).toBeVisible();
  await expect(
    screen.getByRole("button", { name: /Add one Liquid oxygen tank/ }),
  ).toHaveCount(0);
  await expect(
    screen.getByRole("button", { name: /Add one Bulk water tank/ }),
  ).toHaveCount(0);
});
