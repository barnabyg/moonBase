import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { structureEntry } from "./base-panel";
import type { SaveFile } from "./crowded";

/** The list at the top of the status panel, shown or not. */
function attentionList(page: Page): Locator {
  return page
    .getByRole("complementary", { name: "Status panel" })
    .getByRole("region", { name: "Needs attention", includeHidden: true });
}

/**
 * A sample save of a base with two solar arrays, an extraction plant and a
 * vacuum fabrication plant waiting for silicon, changed so that the second
 * solar array is Broken and the oxygen run out, with the Mission Director
 * still aboard the Lander, where they need none of the base's.
 */
function troubledSave(): SaveFile {
  const save = JSON.parse(
    readFileSync(
      new URL("../test/saves/version-35.moonbase", import.meta.url),
      "utf8",
    ),
  ) as {
    state: {
      structures: { id: string; conditionPercent: number }[];
      lifeSupport: { stockId: string; kilograms: number }[];
    };
  };
  const { structures, lifeSupport } = save.state;
  const change = <T>(
    all: readonly T[],
    is: (one: T) => boolean,
    to: (one: T) => void,
  ): void => {
    const one = all.find(is);
    if (one === undefined) throw new Error("The sample save has changed.");
    to(one);
  };
  change(
    structures,
    ({ id }) => id === "structure-4",
    (array) => {
      array.conditionPercent = 0;
    },
  );
  change(
    lifeSupport,
    ({ stockId }) => stockId === "oxygen",
    (oxygen) => {
      oxygen.kilograms = 0;
    },
  );
  return {
    name: "troubled.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  };
}

test("the status panel lists what needs attention at its top, most urgent first, and nothing while nothing does; each line leads to where it is dealt with, by mouse or keyboard, and goes once it is", async ({
  page,
}) => {
  await page.goto("/?seed=1");
  // Paused throughout, so that nothing is repaired meanwhile.
  await page.getByRole("button", { name: "Pause" }).click();
  const list = attentionList(page);
  await expect(
    page.getByRole("status", { name: "Current Milestone" }),
  ).toBeVisible();
  // A new Campaign has nothing to report.
  await expect(list).toBeHidden();

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(troubledSave());
  await expect(list).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveText([
    "Oxygen has run out",
    "Solar array is Broken",
    "Vacuum fabrication plant is waiting for Silicon",
  ]);
  // The player switches the extraction plant off, which goes last.
  await structureEntry(page, "Extraction plant")
    .getByRole("button", { name: "Extraction plant" })
    .click();
  const plant = page.getByRole("dialog", { name: "Extraction plant" });
  await plant.getByRole("button", { name: "Switch off" }).click();
  await expect(list.getByRole("listitem")).toHaveText([
    "Oxygen has run out",
    "Solar array is Broken",
    "Vacuum fabrication plant is waiting for Silicon",
    "1 Plant switched off",
  ]);
  // Above everything else in the panel.
  const milestones = page
    .getByRole("complementary", { name: "Status panel" })
    .locator("summary", { hasText: "Milestones" });
  expect((await list.boundingBox())?.y).toBeLessThan(
    (await milestones.boundingBox())?.y ?? 0,
  );

  // Pointing at a line marks what it leads to on the map.
  const map = page.locator("canvas");
  await list
    .getByRole("button", { name: "Vacuum fabrication plant is waiting" })
    .hover();
  await expect(map).toHaveAttribute("data-marked", "structure-3");

  // By mouse, to something on the map: the camera goes to it, a ring marks
  // it and its pop-up opens.
  await list.getByRole("button", { name: "Solar array is Broken" }).click();
  await expect(map).toHaveAttribute("data-marked", "structure-4");
  await expect(page.getByRole("dialog", { name: "Solar array" })).toBeVisible();

  // By keyboard, to the first of the Plants switched off.
  await list.getByRole("button", { name: "1 Plant switched off" }).focus();
  await page.keyboard.press("Enter");
  await expect(map).toHaveAttribute("data-marked", "structure-2");
  await expect(plant).toBeVisible();

  // To a line of the panel itself, in a section that is folded away.
  const statusPanel = page.getByRole("complementary", { name: "Status panel" });
  const oxygen = statusPanel.getByRole("status", {
    name: "Oxygen",
    exact: true,
  });
  await statusPanel.locator("summary", { hasText: "Mission Director" }).click();
  await expect(oxygen).toBeHidden();
  await list.getByRole("button", { name: "Oxygen has run out" }).click();
  await expect(oxygen).toBeVisible();
  await expect(oxygen).toBeInViewport();

  // Switched on again, the Plant's line goes, and the others stay.
  await plant.getByRole("button", { name: "Switch on" }).click();
  await expect(list.getByRole("listitem")).toHaveText([
    "Oxygen has run out",
    "Solar array is Broken",
    "Vacuum fabrication plant is waiting for Silicon",
  ]);
});
