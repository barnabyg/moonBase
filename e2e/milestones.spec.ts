import { expect, test } from "@playwright/test";
import { tryScenarios } from "../test/try-scenarios";
import { placeOnClearGround } from "./placement";

test("a fresh game shows power storage as the current Milestone, and commissioning the battery bank from the starting stock reaches it and makes moving in current", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  const current = page.getByRole("status", { name: "Current Milestone" });
  const hint = page.getByRole("status", { name: "Milestone hint" });
  const next = page.getByRole("status", { name: "Next Milestone" });
  const place = page.getByRole("status", {
    name: "Place in the Act",
  });
  await expect(current).toHaveText("Now Power storage before the first Night");
  await expect(place).toHaveText("Milestone 1 of 9");
  await expect(hint).toContainText("battery banks from the starting stock");
  await expect(next).toHaveText(
    "Next Habitat commissioned, Mission Director moved in",
  );

  await page
    .getByRole("complementary", { name: "Build menu" })
    .getByRole("button", { name: /Battery bank/ })
    .click();
  await placeOnClearGround(page);
  await expect(page.getByRole("status", { name: "Placement" })).toHaveText(
    "Battery bank planned. The Robot will carry out its Construction.",
  );

  // Skip from event to event until the Milestone is reached, which stops
  // the skip there.
  const skip = page.getByRole("button", { name: "Skip to next event" });
  const notifications = page.getByRole("log", { name: "Notifications" });
  for (let skips = 0; skips < 30; skips++) {
    if (
      (await notifications.isVisible()) &&
      (await notifications.textContent())?.includes("Milestone reached") ===
        true
    ) {
      break;
    }
    await skip.click();
  }

  await expect(notifications).toContainText("Battery bank commissioned");
  await expect(notifications).toContainText(
    "Milestone reached: Power storage before the first Night",
  );
  await expect(current).toHaveText(
    "Now Habitat commissioned, Mission Director moved in",
  );
  await expect(place).toHaveText("Milestone 2 of 9");
  await expect(hint).toContainText("inflatable Habitat");
  await expect(next).toHaveText("Next Lander departs");
});

test("a Milestone with something to measure shows how far along it is, under its name", async ({
  page,
}) => {
  const scenario = tryScenarios.find(({ id }) => id === "crew-habitat");
  if (scenario === undefined) throw new Error("expected the scenario");
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  const panel = page.getByRole("complementary", { name: "Status panel" });
  const progress = panel.getByRole("status", { name: /^Milestone progress, / });
  // Power storage is either there or not.
  await expect(progress).toHaveCount(0);

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "crew-habitat.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(scenario.save()),
  });

  await expect(
    panel.getByRole("status", { name: "Current Milestone" }),
  ).toHaveText("Now Large-scale Crew Habitat commissioned");
  await expect(
    panel.getByRole("status", { name: "Place in the Act" }),
  ).toHaveText("Milestone 3 of 3");
  // The Large-scale Crew Habitat being commissioned has been stocked.
  await expect(progress).toHaveText([
    "Oxygen 612 of 612 kg",
    "Water 2549 of 2549 kg",
  ]);
  // They sit between the Milestone's name and its hint.
  const top = async (name: string | RegExp): Promise<number> =>
    (await panel.getByRole("status", { name }).first().boundingBox())?.y ?? 0;
  expect(await top("Current Milestone")).toBeLessThan(
    await top(/^Milestone progress, /),
  );
  const hintTop = await top("Milestone hint");
  expect(await top(/^Milestone progress, /)).toBeLessThan(hintTop);

  // Its long hint, shown whole.
  await panel.getByRole("button", { name: "Show all" }).click();
  await expect(panel.getByRole("button", { name: "Show less" })).toBeVisible();

  // Reached, the Milestone takes its measures with it but not their room,
  // so that nothing below them moves up.
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "20x" })
    .click();
  const celebration = page.getByRole("dialog", { name: "Ready for Crew" });
  await expect(celebration).toBeVisible();
  await celebration.getByRole("button", { name: "Carry on" }).click();
  await expect(
    panel.getByRole("status", { name: "Current Milestone" }),
  ).toHaveText("Now Every Milestone reached");
  await expect(progress).toHaveCount(0);
  expect(await top("Milestone hint")).toBeGreaterThanOrEqual(hintTop - 1);
  // The hint that follows is short, so it is folded again with no button,
  // and gives back the room the long one took.
  const hint = panel.getByRole("status", { name: "Milestone hint" });
  await expect(hint).toContainText("The Campaign carries on");
  await expect(panel.getByRole("button", { name: "Show less" })).toBeHidden();
  await expect(panel.getByRole("button", { name: "Show all" })).toBeHidden();
  const twoLines =
    2 *
    (await hint.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).lineHeight),
    ));
  await expect
    .poll(async () => (await hint.locator("xpath=..").boundingBox())?.height)
    .toBeLessThanOrEqual(twoLines + 1);
});

test("a long Milestone hint shows its first two lines until the player asks for the rest, by keyboard or by mouse", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  await page
    .getByRole("group", { name: "Game speed" })
    .getByRole("button", { name: "Pause" })
    .click();
  const panel = page.getByRole("complementary", { name: "Status panel" });
  const hint = panel.getByRole("status", { name: "Milestone hint" });
  const showAll = panel.getByRole("button", { name: "Show all" });
  const showLess = panel.getByRole("button", { name: "Show less" });
  const height = async (): Promise<number> =>
    (await hint.boundingBox())?.height ?? 0;
  const twoLines =
    2 *
    (await hint.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).lineHeight),
    ));

  // All of it is there to be read aloud, though only two lines show.
  await expect(hint).toContainText(
    "the Habitat needs all of them to get through one.",
  );
  await expect(showAll).toHaveAttribute("aria-expanded", "false");
  expect(await height()).toBeLessThanOrEqual(twoLines + 1);
  const below = panel.getByRole("status", { name: "Next Milestone" });
  const foldedTop = (await below.boundingBox())?.y ?? 0;

  await showAll.focus();
  await page.keyboard.press("Enter");
  await expect(showLess).toHaveAttribute("aria-expanded", "true");
  await expect(showLess).toBeFocused();
  expect(await height()).toBeGreaterThan(twoLines + 1);

  // Folded again, it gives back the room the rest of it took.
  await showLess.click();
  await expect(showAll).toBeVisible();
  expect(await height()).toBeLessThanOrEqual(twoLines + 1);
  await expect
    .poll(async () => (await below.boundingBox())?.y)
    .toBeCloseTo(foldedTop, 0);
});
