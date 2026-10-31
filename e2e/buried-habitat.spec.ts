import { expect, test, type Page } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";

/**
 * Starts a base with the Mission Director behind a water wall at a high dose
 * and a Buried Habitat ready, as `npm run try -- buried-habitat` does, with the
 * game paused so that nothing moves on between the steps.
 */
async function loadBase(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "buried-habitat");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await speed(page, "Pause");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "buried-habitat.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
  await expect(missionDirector(page)).toHaveText(
    "Living in the Inflatable Habitat",
  );
}

async function speed(page: Page, name: string): Promise<void> {
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name, exact: true })
    .click();
}

function missionDirector(page: Page) {
  return page.getByRole("status", { name: "Mission Director" });
}

function radiation(page: Page) {
  return page
    .getByRole("complementary", { name: "Status panel" })
    .getByRole("status", { name: "Radiation Dose" });
}

function structure(page: Page, label: RegExp) {
  return page
    .getByRole("list", { name: "Structures" })
    .getByRole("listitem")
    .filter({ hasText: label });
}

/**
 * Clicks across the 3D view, as a player finds a thing on the map, until a
 * pop-up with the given name opens saying the given text, and returns where it
 * clicked.
 */
async function clickOnMap(
  page: Page,
  name: string,
  says: string,
): Promise<{ x: number; y: number }> {
  const box = await page.locator("canvas").boundingBox();
  if (box === null) throw new Error("The 3D view has no size.");
  const popUp = page.getByRole("dialog", { name });
  // Where the middle of the view shows clear of the panels, above the Lander.
  for (let down = 0.25; down < 0.6; down += 0.025) {
    for (let across = 0.27; across < 0.75; across += 0.02) {
      const point = {
        x: box.x + box.width * across,
        y: box.y + box.height * down,
      };
      await page.mouse.click(point.x, point.y);
      if (
        (await popUp.isVisible()) &&
        (await popUp.textContent())?.includes(says) === true
      ) {
        return point;
      }
    }
  }
  throw new Error(`Nothing on the map opened ${name} saying ${says}.`);
}

test("the Mission Director moves from behind a water wall into a Buried Habitat: the dose stays, its rate falls, and the old Habitat can go", async ({
  page,
}) => {
  await loadBase(page);
  const home = structure(page, /^Inflatable Habitat.*water-walled/);
  const buried = structure(page, /^Buried Habitat/);

  await expect(radiation(page)).toContainText("568.0 / 600 mSv");
  await expect(radiation(page)).toContainText(
    /\+0\.[12] a day, limit in 21\dd/,
  );
  await expect(buried).toContainText("buried");
  await expect(buried.getByRole("button", { name: "Move here" })).toBeVisible();
  await expect(home.getByRole("button", { name: /^Move/ })).toBeHidden();

  // Regolith shielding has no place on it, and the build menu says why.
  const point = await clickOnMap(
    page,
    "Buried Habitat",
    "buried under the Regolith",
  );
  const popUp = page.getByRole("dialog", { name: "Buried Habitat" });
  await expect(popUp.getByRole("status", { name: "Residents" })).toContainText(
    "nobody",
  );
  await expect(popUp.getByRole("status", { name: "Shielding" })).toContainText(
    "buried under the Regolith",
  );
  await expect(popUp.getByRole("status", { name: "Dose rate" })).toHaveText(
    "Dose rate 0.015 mSv a day",
  );
  await expect(popUp.getByRole("button", { name: "Move here" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /^Regolith shielding/ })
    .click();
  // The click found the top of the mound, and the ground it stands on is below.
  const placement = page.getByRole("status", { name: "Placement" });
  const refusal =
    "A Buried Habitat is already under the Regolith, and needs no shielding over it.";
  for (
    let below = 0;
    below < 80 && (await placement.textContent()) !== refusal;
    below += 8
  ) {
    await page.mouse.move(point.x, point.y + below);
  }
  await expect(placement).toHaveText(refusal);
  await page.keyboard.press("Escape");

  await buried.getByRole("button", { name: "Move here" }).click();

  await expect(missionDirector(page)).toHaveText(
    "Living in the Buried Habitat",
  );
  await expect(radiation(page)).toContainText("568.0 / 600 mSv");
  await expect(radiation(page)).toContainText(
    /\+0\.015 a day, limit in 21\d\dd/,
  );
  await expect(buried).toContainText("the Mission Director's home");
  await expect(buried.getByRole("button", { name: /^Move/ })).toBeHidden();
  await expect(home.getByRole("button", { name: "Move here" })).toBeVisible();
  await expect(popUp).toBeHidden();

  // It can't be dismantled now, and the old one can, its shielding first.
  await buried.getByRole("button", { name: "Dismantle" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The Mission Director lives in it. Move them to another Habitat first.",
  );
  await home.getByRole("button", { name: "Dismantle" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Its Regolith shielding is over it, and must be dismantled first.",
  );
  await structure(page, /^Water wall/)
    .getByRole("button", { name: "Dismantle" })
    .click();
  await expect(page.getByRole("complementary", { name: "Work" })).toContainText(
    "Dismantling the water wall",
  );

  // A Solar Particle Event multiplies the new rate as it does any other.
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const event = page
    .getByRole("complementary", { name: "Status panel" })
    .getByRole("status", { name: "Solar Particle Event" });
  for (
    let skips = 0;
    skips < 60 && !(await event.textContent())?.includes("under way");
    skips++
  ) {
    await skip.click();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        }),
    );
  }
  await expect(event).toContainText("10× the dose rate");
  await expect(radiation(page)).toContainText(/\+0\.1 a day/);
});

test("the Mission Director can move into a bare Habitat, where the pop-up, the status panel and a notification all warn of it", async ({
  page,
}) => {
  await loadBase(page);
  const bare = structure(page, /^Inflatable Habitat.*unshielded/);
  await expect(bare).toBeVisible();

  // Two Habitats share the name: the bare one's pop-up is the one with this.
  await clickOnMap(page, "Inflatable Habitat", "30.00 mSv a day");
  const popUp = page.getByRole("dialog", { name: "Inflatable Habitat" });
  await expect(popUp.getByRole("status", { name: "Dose rate" })).toHaveText(
    /^Dose rate 30\.00 mSv a day · moving here raises it from 0\.15, and the limit would come in 1d 2h$/,
  );
  await popUp.getByRole("button", { name: "Close" }).click();

  await bare.getByRole("button", { name: "Move here" }).click();

  await expect(missionDirector(page)).toHaveText(
    "Living in the Inflatable Habitat",
  );
  await expect(radiation(page)).toContainText(/\+30\.0 a day, limit in 1d 2h/);
  await page.getByRole("button", { name: "Skip to next event" }).click();
  await expect(page.getByRole("log", { name: "Notifications" })).toContainText(
    "Radiation Dose will reach the limit in",
  );
});

test("the Guide explains a Buried Habitat, and the Launch manifest offers its kit", async ({
  page,
}) => {
  await loadBase(page);

  await page.getByRole("button", { name: "Guide" }).click();
  const guide = page.getByRole("dialog", { name: "Guide" });
  await expect(guide).toContainText("A Buried Habitat cuts its rate to 0.015");
  await guide.getByRole("tab", { name: "Structures" }).click();
  await expect(guide).toContainText("already under the Regolith");
  await guide.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Launch manifest" }).click();
  await expect(
    page.getByRole("rowheader", { name: /^Vault section/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("rowheader", { name: /^Deep life support core/ }),
  ).toBeVisible();
});
