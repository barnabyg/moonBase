import { expect, test, type Page } from "@playwright/test";
import { placeOnClearGround } from "./placement";

/** Clicks "Skip to next event" until the notification list shows the text. */
async function skipUntil(page: Page, text: string): Promise<void> {
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const notifications = page.getByRole("log", { name: "Notifications" });
  for (let skips = 0; skips < 30; skips++) {
    // The list is hidden, and so not found, until the first event.
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

test("the Lander brings a paid-for manifest from Earth, and its cargo joins the base's stock", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  await buildMenu.getByRole("button", { name: /Solar array/ }).click();
  await placeOnClearGround(page);
  await buildMenu.getByRole("button", { name: /Inflatable Habitat/ }).click();
  await placeOnClearGround(page);
  await skipUntil(page, "Inflatable Habitat commissioned");

  // The Habitat can't get through a Night on the starting battery bank, and
  // unshielded it can't take a Solar Particle Event on top of a round trip,
  // so the Mission Director waits aboard the Lander until both are past.
  await skipUntil(page, "Daylight has come");
  await skipUntil(page, "Solar Particle Event over");
  const structures = page.getByRole("list", { name: "Structures" });
  await structures.getByRole("button", { name: "Move in" }).click();
  await expect(
    page.getByRole("status", { name: "Mission Director" }),
  ).toHaveText("Mission Director: living in the inflatable habitat");

  const stock = page.getByRole("status", { name: "Base's stock" });
  await expect(stock).toHaveText(
    "Stock: 3 battery modules, 1 battery cabinet, 4 mast poles and 4 light heads",
  );
  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  await screen.getByRole("button", { name: "Add one Solar panel" }).click();
  await screen.getByRole("button", { name: "Add one Solar panel" }).click();
  await screen.getByRole("button", { name: "Add one Array mast" }).click();
  // The Launch fee, two solar panels at $4M and an array mast at $3M.
  await expect(screen.getByRole("status", { name: "Launch cost" })).toHaveText(
    "Cost: $161M of $400M Funding, including the $150M Launch fee",
  );
  await screen.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Send the Lander" }).click();
  const lander = page.getByRole("status", { name: "Lander" });
  await expect(lander).toContainText("Lander: travelling to Earth");
  await skipUntil(page, "Lander left Earth");
  await expect(page.getByRole("status", { name: "Funding" })).toHaveText(
    "Funding: $239M",
  );
  await skipUntil(page, "Lander landed");

  await expect(lander).toHaveText("Lander: landed, free to fly");
  await expect(page.getByRole("status", { name: "Funding" })).toHaveText(
    "Funding: $239M",
  );
  await expect(stock).toHaveText(
    "Stock: 2 solar panels, 1 array mast, 3 battery modules, 1 battery cabinet, 4 mast poles and 4 light heads",
  );
  await expect(page.getByRole("log", { name: "Notifications" })).toContainText(
    "Lander landed with 2 × Solar panel and 1 × Array mast",
  );
});
