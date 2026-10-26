import { expect, test, type Page } from "@playwright/test";

/**
 * Moves the pointer over the 3D view until the build menu says the
 * Structure may be placed there, then clicks to place it.
 */
async function placeOnClearGround(page: Page): Promise<void> {
  const box = await page.locator("canvas").boundingBox();
  if (box === null) throw new Error("The 3D view has no size.");
  const placement = page.getByRole("status", { name: "Placement" });
  for (const [across, down] of [
    [0.3, 0.75],
    [0.7, 0.75],
    [0.25, 0.6],
    [0.75, 0.6],
    [0.5, 0.85],
  ] as const) {
    const x = box.x + box.width * across;
    const y = box.y + box.height * down;
    await page.mouse.move(x, y);
    const text = await placement.textContent();
    if (text?.startsWith("Click to place") === true) {
      await page.mouse.click(x, y);
      return;
    }
  }
  throw new Error("Found no clear ground to place the Structure on.");
}

test("the Robot carries out the Construction of a solar array placed on the map, and a second one waits for Components", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/?seed=1");
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  const solarArray = buildMenu.getByRole("button", { name: /Solar array/ });
  await expect(solarArray).toContainText("1 available");

  await solarArray.click();
  await placeOnClearGround(page);

  await expect(page.getByRole("status", { name: "Placement" })).toHaveText(
    "Solar array planned. The Robot will carry out its Construction.",
  );
  const constructions = page.getByRole("complementary", {
    name: "Constructions",
  });
  await expect(constructions).toContainText("Site Preparation");
  // Its Components are promised, so a second one would have to wait for more.
  await expect(solarArray).toContainText("0 available");
  await solarArray.click();
  await expect(page.getByRole("status", { name: "Placement" })).toContainText(
    "Its Components aren't in the cargo stock, so its Construction will wait for them.",
  );
  await placeOnClearGround(page);

  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "20x" })
    .click();

  await expect(
    page.getByRole("list", { name: "Structures" }).getByRole("listitem"),
  ).toHaveText(["Solar array: commissioned"], { timeout: 45_000 });
  await expect(
    page.getByRole("status", { name: "Power", exact: true }),
  ).toHaveText(/^Power: [1-9]\d*\.\d\d kW generated, \d+\.\d\d kW used$/);
  await expect(page.getByRole("status", { name: "Stored power" })).toHaveText(
    "Stored: no battery banks",
  );
  await expect(constructions).toContainText(
    "Waiting: 2 solar panels and 1 array mast aren't in the cargo stock",
  );
  await expect(solarArray).toContainText("0 available");
});

test("a solar array can't be placed over the Lander", async ({ page }) => {
  await page.goto("/?seed=1");
  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Solar array/ })
    .click();
  const box = await page.locator("canvas").boundingBox();
  if (box === null) throw new Error("The 3D view has no size.");

  // The game opens looking straight at the Lander.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page.getByRole("status", { name: "Placement" })).toHaveText(
    "The solar array would overlap the Lander.",
  );
  await expect(
    page.getByRole("complementary", { name: "Constructions" }),
  ).toBeHidden();
});
