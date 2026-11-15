import { expect, test, type Page } from "@playwright/test";
import { catalogue } from "../src/catalogue";
import { isInBuildMenu } from "../src/simulation";
import { groupBuildOptions } from "../src/ui/build-menu-text";
import { tryScenarios } from "../test/try-scenarios";
import { placeOnClearGround } from "./placement";

/**
 * Starts the base `npm run try -- everything-unlocked` does, with the game
 * paused so that nothing moves on between the steps.
 */
async function loadEverythingUnlocked(page: Page): Promise<void> {
  const scenario = tryScenarios.find(({ id }) => id === "everything-unlocked");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "everything-unlocked.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });
}

const offered = catalogue.structureTypes.filter(isInBuildMenu);

/** The headings of the build menu's groups that show, in order. */
function headings(page: Page) {
  return page
    .getByRole("complementary", { name: "Build menu" })
    .locator(".build-group:not([hidden]) > summary");
}

/** Matches a group's heading: its label, then a number. */
function heading(label: string): RegExp {
  return new RegExp(String.raw`^${label}\s*\d+(?!\d)`);
}

/**
 * Each shown group's heading number, and the sum of the badges of the
 * Structures it shows that the stock limits, by group label.
 */
function headingCounts(
  page: Page,
): Promise<{ label: string; heading: string; badges: number }[]> {
  return page
    .getByRole("complementary", { name: "Build menu" })
    .evaluate((menu) =>
      [...menu.querySelectorAll<HTMLElement>(".build-group:not([hidden])")].map(
        (group) => {
          const title = group.querySelector(":scope > summary");
          const badges = [
            ...group.querySelectorAll<HTMLElement>(
              "button:not([hidden]) .build-menu__stock > span:first-child",
            ),
          ]
            .map((badge) => badge.textContent)
            .filter((text) => text !== "–")
            .reduce((total, text) => total + Number(text), 0);
          return {
            label: title?.firstElementChild?.textContent ?? "",
            heading:
              title?.querySelector(".panel-section__count > span:first-child")
                ?.textContent ?? "",
            badges,
          };
        },
      ),
    );
}

/** Checks that each group's heading counts what its Structures' badges add up to. */
async function expectHeadingsToCountBadges(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      (await headingCounts(page)).filter(
        ({ heading, badges }) => heading !== String(badges),
      ),
    )
    .toEqual([]);
}

test("a new Campaign's build menu shows only the groups that offer something, in the Base panel's order", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const starting = new Set(
    catalogue.designs.filter(({ starting }) => starting).map(({ id }) => id),
  );
  const expected = groupBuildOptions(
    offered.filter(({ designId }) => starting.has(designId)),
  );
  expect(expected.length).toBeLessThan(catalogue.structureListGroups.length);
  await expect(headings(page)).toHaveText(
    expected.map(({ label }) => heading(label)),
    { useInnerText: true },
  );
  await expectHeadingsToCountBadges(page);
});

test("with every Design unlocked the build menu lists them by what they are for, sets back those whose Components aren't in stock, and each group folds and stays folded after a reload", async ({
  page,
}) => {
  await loadEverythingUnlocked(page);
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  const groups = groupBuildOptions(offered);
  await expect(headings(page)).toHaveText(
    groups.map(({ label }) => heading(label)),
    { useInnerText: true },
  );
  // Each heading counts what the stock could build now, and says so.
  await expectHeadingsToCountBadges(page);
  await expect(
    buildMenu.locator(".build-group > summary", { hasText: /^Power/ }),
  ).toHaveText(/^Power\d+ can be built now from stock$/);

  // A Design is found under its group.
  const power = buildMenu.getByRole("group", { name: "Power" });
  await expect(
    power.getByRole("button", { name: /^Solar array/ }),
  ).toBeVisible();
  await expect(
    buildMenu
      .getByRole("group", { name: "Science" })
      .getByRole("button", { name: /^Infrared telescope/ }),
  ).toBeVisible();

  // What the stock can't supply is set back, in words as well as looks.
  const short = buildMenu.getByRole("button", { name: / 0 available$/ });
  const ready = buildMenu.getByRole("button", {
    name: / [1-9]\d* available$/,
  });
  await expect(short.first()).toBeVisible();
  await expect(ready.first()).toBeVisible();
  await expect(short.first()).toHaveCSS("border-top-style", "dashed");
  await expect(ready.first()).toHaveCSS("border-top-style", "solid");
  await expect(short.first()).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  expect(
    await ready
      .first()
      .evaluate((button) => getComputedStyle(button).backgroundColor),
  ).not.toBe("rgba(0, 0, 0, 0)");

  // A group folds away, with nothing beside its heading but the number.
  const powerHeading = buildMenu.locator(".build-group > summary", {
    hasText: /^Power/,
  });
  await powerHeading.click();
  await expect(power.getByRole("button").first()).toBeHidden();
  await expect(
    buildMenu.getByRole("status", { name: "Power summary" }),
  ).toBeHidden();

  await page.reload();
  await expect(
    buildMenu.locator(".build-group > summary", { hasText: /^Power/ }),
  ).toBeVisible();
  await expect(
    buildMenu.getByRole("button", { name: /^Solar array/ }),
  ).toBeHidden();
  await expect(
    buildMenu.getByRole("button", { name: /^Battery bank/ }),
  ).toBeHidden();
});

test("a group's heading counts down as a planned Construction takes the stock's Components", async ({
  page,
}) => {
  await loadEverythingUnlocked(page);
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  const powerCount = async () =>
    Number(
      (await headingCounts(page)).find(({ label }) => label === "Power")
        ?.heading,
    );
  await expectHeadingsToCountBadges(page);
  const before = await powerCount();
  expect(before).toBeGreaterThan(0);

  await buildMenu.getByRole("button", { name: /^Battery bank \d+/ }).click();
  await placeOnClearGround(page);
  await expect(page.getByRole("status", { name: "Placement" })).toContainText(
    "planned.",
  );
  await expect.poll(powerCount).toBeLessThan(before);
  await expectHeadingsToCountBadges(page);
});

test("the grouped build menu fits a narrow left column without cutting a Design's name or badge", async ({
  page,
}) => {
  await loadEverythingUnlocked(page);
  // As narrow as the left column gets on a small window.
  await page.addStyleTag({ content: ".left-column { width: 290px; }" });
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  await expect(
    buildMenu.getByRole("button", { name: /^Solar array/ }),
  ).toBeVisible();
  const overflowing = await buildMenu.evaluate((menu) =>
    [menu, ...menu.querySelectorAll("button, summary")]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.textContent),
  );
  expect(overflowing).toEqual([]);
});

test("once Whipple shielding is unlocked, a tick in the Power group puts the next battery bank of either size in a Whipple-shielded cabinet, and the build menu says so", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  const shielded = buildMenu.getByRole("checkbox", {
    name: "Whipple-shielded cabinet",
  });
  await expect(
    buildMenu.getByRole("button", { name: /^Battery bank/ }),
  ).toBeVisible();
  await expect(shielded).toBeHidden();

  await loadEverythingUnlocked(page);
  const power = buildMenu.getByRole("group", { name: "Power" });
  const small = power.getByRole("button", { name: /^Battery bank/ });
  const large = power.getByRole("button", { name: /^Large battery bank/ });
  // No entry of its own: the cabinet is a choice made for either size.
  await expect(power.getByRole("button", { name: /Whipple/ })).toHaveCount(0);
  await expect(shielded).toBeVisible();
  await expect(shielded).not.toBeChecked();
  await expect(small).toHaveAttribute(
    "title",
    /The next one will be a battery bank\b/,
  );

  await shielded.check();
  await expect(small).toHaveAttribute(
    "title",
    /The next one will be a Whipple-shielded battery bank\b/,
  );
  await expect(large).toHaveAttribute(
    "title",
    /The next one will be a Whipple-shielded large battery bank\b/,
  );

  await large.click();
  const placement = page.getByRole("status", { name: "Placement" });
  await expect(placement).toContainText(
    "Click the map to place the Whipple-shielded large battery bank.",
  );
  await placeOnClearGround(page);
  await expect(placement).toContainText(
    "Whipple-shielded large battery bank planned.",
  );
});
