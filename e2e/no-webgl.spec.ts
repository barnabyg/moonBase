import { expect, test } from "@playwright/test";

// A Firefox whose WebGL is switched off, such as one with graphics
// acceleration blocked, cannot draw the base map. The status panel must still
// work, and the player must be told why the map is missing.
test.use({
  launchOptions: { firefoxUserPrefs: { "webgl.disabled": true } },
});

test("without WebGL the clock still runs and the player is told why the map is missing", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText(
    "couldn't start the 3D view",
  );
  await expect(page.getByRole("status", { name: "Game clock" })).toHaveText(
    /^Earth Day 1, \d{2}:00$/,
  );
});
