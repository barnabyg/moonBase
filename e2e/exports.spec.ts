import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * A sample save of a Campaign with the Mission Director in the Habitat, the
 * Lander free to fly, and 46.5 kg of wafers in the base's stock, 30 kg of
 * them to load.
 */
const wafersSave = fileURLToPath(
  new URL("../test/saves/version-22.moonbase", import.meta.url),
);

/**
 * A sample save of a Campaign with the Lander on its landing pad, and the
 * Robot carrying 30 kg of wafers from the stockpile to it.
 */
const loadingSave = fileURLToPath(
  new URL("../test/saves/version-24.moonbase", import.meta.url),
);

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

test("wafers loaded onto the Lander are sold when it reaches Earth, and the Funding rises by their value", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  await panel.getByRole("button", { name: "Pause" }).click();
  const chooser = page.waitForEvent("filechooser");
  await panel.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(wafersSave);
  const funding = page.getByRole("status", { name: "Funding" });
  await expect(funding).toHaveText("Funding: $400M");

  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  await expect(screen.getByRole("row", { name: /Wafers/ })).toContainText(
    "46 kg$1.5M a kg",
  );
  const kilograms = screen.getByRole("spinbutton", {
    name: "Kilograms of Wafers to load",
  });
  await expect(kilograms).toHaveValue("30");
  const returnMass = screen.getByRole("status", { name: "Return Mass" });
  await expect(returnMass).toHaveText("Return Mass: 30 of 100 kg");

  // More than the base has in stock is refused, and the amount stays.
  await kilograms.fill("50");
  await kilograms.press("Enter");
  await expect(screen.getByRole("alert")).toHaveText(
    "That would load 50 kg of wafers, more than the 46.5 kg in stock.",
  );
  await expect(kilograms).toHaveValue("30");

  await kilograms.fill("40");
  await kilograms.press("Enter");
  await expect(returnMass).toHaveText("Return Mass: 40 of 100 kg");
  await expect(screen.getByRole("status", { name: "Export value" })).toHaveText(
    "Value: $60M, sold when the Lander reaches Earth",
  );
  await screen.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Send the Lander" }).click();
  await skipUntil(page, "Lander took off for Earth with 40 kg of wafers");
  await expect(page.getByRole("status", { name: "Lander" })).toContainText(
    "Lander: travelling to Earth with 40 kg of wafers",
  );
  await expect(
    page.getByRole("status", { name: "Bulk resources" }),
  ).toContainText("Wafers: 6 kg");
  await skipUntil(page, "Lander reached Earth");

  await expect(page.getByRole("log", { name: "Notifications" })).toContainText(
    "Lander reached Earth for turnaround, and sold 40 kg of wafers for $60M",
  );
  await expect(funding).toHaveText("Funding: $460M");
});

test("on a landing pad, the Robot carries the wafers to the Lander, which can't leave until they're aboard", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  const panel = page.getByRole("complementary", { name: "Status panel" });
  await panel.getByRole("button", { name: "Pause" }).click();
  const chooser = page.waitForEvent("filechooser");
  await panel.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(loadingSave);

  const lander = page.getByRole("status", { name: "Lander" });
  await expect(lander).toHaveText(
    "Lander: landed on the landing pad, waiting for the Robot to load 30 kg of wafers",
  );
  const work = page.getByRole("complementary", { name: "Work" });
  await expect(work).toContainText("Loading the Lander");
  await expect(work).toContainText("Carrying to the Lander: 0%");
  await expect(work).toContainText(
    "Robot carrying 30 kg of wafers to the Lander",
  );

  // Once the Robot has them, they can't be changed until they're aboard.
  await page.getByRole("button", { name: "Launch manifest" }).click();
  const screen = page.getByRole("dialog", { name: "Launch manifest" });
  await expect(screen).toContainText(
    "The Robot is carrying 30 kg of wafers to the Lander. More can be loaded once they're aboard.",
  );
  await expect(
    screen.getByRole("spinbutton", { name: "Kilograms of Wafers to load" }),
  ).toBeDisabled();
  await screen.getByRole("button", { name: "Close" }).click();

  await panel.getByRole("button", { name: "Send the Lander" }).click();
  await expect(panel.getByRole("alert")).toHaveText(
    "The Exports to load aren't aboard yet. The Robot has to finish loading them onto the Lander first.",
  );

  await skipUntil(page, "Robot loaded the Lander: 30 kg of wafers now aboard");
  await expect(work).toBeHidden();
  await expect(lander).toHaveText(
    "Lander: landed on the landing pad with 30 kg of wafers aboard, free to fly",
  );
  await panel.getByRole("button", { name: "Send the Lander" }).click();
  await skipUntil(page, "Lander took off for Earth with 30 kg of wafers");
});
