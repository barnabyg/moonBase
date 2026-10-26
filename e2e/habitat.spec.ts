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
  await expect(missionDirector).toHaveText(
    "Mission Director: aboard the Lander",
  );
  await expect(lander).toHaveText(
    "Lander: landed, with the Mission Director aboard",
  );

  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Inflatable Habitat/ })
    .click();
  await placeOnClearGround(page);
  await page.getByRole("button", { name: "Skip to next event" }).click();

  const structures = page.getByRole("list", { name: "Structures" });
  // Nothing powers it yet, and moving in is allowed anyway.
  await expect(structures.getByRole("listitem")).toHaveText([
    /^Inflatable Habitat: commissioned, no power/,
  ]);
  await structures.getByRole("button", { name: "Move in" }).click();

  await expect(missionDirector).toHaveText(
    "Mission Director: living in the inflatable habitat",
  );
  await expect(lander).toHaveText("Lander: landed, free to fly");
  await expect(structures.getByRole("listitem")).toHaveText([
    /, the Mission Director's home/,
  ]);
  await expect(
    structures.getByRole("button", { name: "Move in" }),
  ).toBeHidden();

  await structures.getByRole("button", { name: "Dismantle" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The Mission Director lives in it, and can't move out.",
  );
  await expect(page.getByRole("complementary", { name: "Work" })).toBeHidden();
  // It goes away by itself after a few seconds.
  await expect(page.getByRole("alert")).toBeHidden({ timeout: 15_000 });
});
