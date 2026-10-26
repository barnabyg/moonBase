import { expect, test, type Locator, type Page } from "@playwright/test";
import { placeOnClearGround } from "./placement";

/**
 * Waits until the game has drawn a frame. The game updates its interface in
 * each animation frame, and a callback added now runs after the game's.
 */
async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      }),
  );
}

test("Regolith shielding is printed over the Habitat the Mission Director lives in, cutting their dose rate", async ({
  page,
}) => {
  // Software rendering in CI draws frames several times slower than locally.
  test.setTimeout(60_000);
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  const skip = panel.getByRole("button", { name: "Skip to next event" });
  const notifications = page.getByRole("log", { name: "Notifications" });
  const structures = panel.getByRole("list", { name: "Structures" });
  const radiationDose = panel.getByRole("status", { name: "Radiation Dose" });

  /** Clicks "Skip to next event" until the target shows, checking only once a frame has drawn the skip. */
  const skipUntil = async (target: Locator) => {
    for (let skips = 0; skips < 10 && !(await target.isVisible()); skips++) {
      await skip.click();
      await nextFrame(page);
    }
    await expect(target).toBeVisible();
  };

  const shielding = buildMenu.getByRole("button", {
    name: /Regolith shielding/,
  });
  await expect(shielding).toContainText("no Components needed");

  // Planned anywhere before there is a Habitat, it is refused with the reason.
  await shielding.click();
  const box = await page.locator("canvas").boundingBox();
  if (box === null) throw new Error("The 3D view has no size.");
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.75);
  await expect(page.getByRole("status", { name: "Placement" })).toHaveText(
    "Regolith shielding can only be printed over a commissioned Habitat.",
  );
  await page.keyboard.press("Escape");

  for (const structure of [/Solar array/, /Inflatable Habitat/]) {
    await buildMenu.getByRole("button", { name: structure }).click();
    await placeOnClearGround(page);
  }
  await skipUntil(notifications.getByText("Inflatable Habitat commissioned"));
  await structures.getByRole("button", { name: "Move in" }).click();
  await expect(structures.getByRole("listitem")).toHaveText([
    /^Solar array/,
    /^Inflatable Habitat: commissioned, unshielded, the Mission Director's home/,
  ]);
  await expect(radiationDose).toHaveText(/rising 30\.0 mSv an Earth Day/);

  // The only clear ground it can go on is the Habitat.
  await shielding.click();
  await placeOnClearGround(page);
  const work = page.getByRole("complementary", { name: "Work" });
  await expect(work).toContainText("Regolith shielding");
  await skipUntil(notifications.getByText("Regolith shielding commissioned"));

  await expect(structures.getByRole("listitem")).toHaveText([
    /^Solar array/,
    /^Inflatable Habitat: commissioned, shielded, the Mission Director's home/,
    /^Regolith shielding: commissioned(?!,)/,
  ]);
  await expect(radiationDose).toHaveText(/rising 3\.0 mSv an Earth Day/);
});
