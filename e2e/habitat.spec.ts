import { expect, test } from "@playwright/test";
import { placeOnClearGround } from "./placement";

test("the Mission Director moves from the Lander into a commissioned Habitat, which then can't be dismantled", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const missionDirector = page.getByRole("status", {
    name: "Mission Director",
  });
  const lander = page.getByRole("status", { name: "Lander" });
  await expect(missionDirector).toHaveText("Living aboard the Lander");
  await expect(lander).toHaveText("Lander landed · Mission Director aboard");

  // The Habitat needs power, so a solar array comes first and the Robot
  // cables the Habitat to it.
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  await buildMenu.getByRole("button", { name: /Solar array/ }).click();
  await placeOnClearGround(page);
  await buildMenu.getByRole("button", { name: /Inflatable Habitat/ }).click();
  await placeOnClearGround(page);
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const notifications = page.getByRole("log", { name: "Notifications" });
  await skip.click();
  await expect(notifications).toContainText("Solar array commissioned");
  await skip.click();
  await expect(notifications).toContainText("Inflatable Habitat commissioned");

  const structures = page.getByRole("list", { name: "Structures" });
  // Dust has worn the solar array down a little since it was commissioned.
  await expect(structures.getByRole("listitem")).toHaveText([
    /^Solar array Condition 9\d% commissioned · Dust coating \d+%(?!,)/,
    /^Inflatable Habitat Condition 100% commissioned · unshielded(?!,)/,
  ]);
  await structures.getByRole("button", { name: "Move in" }).click();

  await expect(missionDirector).toHaveText("Living in the Inflatable Habitat");
  await expect(lander).toHaveText("Lander landed · free to fly");
  await expect(structures.getByRole("listitem")).toHaveText([
    /^Solar array/,
    /, the Mission Director's home/,
  ]);
  await expect(
    structures.getByRole("button", { name: "Move in" }),
  ).toBeHidden();

  await structures
    .getByRole("listitem")
    .filter({ hasText: "Inflatable Habitat" })
    .getByRole("button", { name: "Dismantle" })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "The Mission Director lives in it, and can't move out.",
  );
  await expect(page.getByRole("complementary", { name: "Work" })).toHaveText(
    "WorkNo work under way",
  );
  // It goes away by itself after a few seconds.
  await expect(page.getByRole("alert")).toBeHidden();
});
