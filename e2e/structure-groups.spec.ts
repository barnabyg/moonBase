import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { placeOnClearGround } from "./placement";

/**
 * A sample save of a Campaign with two solar arrays, built either side of an
 * extraction plant and a vacuum fabrication plant, and in its stock the
 * Components for another solar array and a battery bank. The second solar
 * array is made Broken, and the extraction plant low on Condition.
 */
function brokenArraySave(): { name: string; mimeType: string; buffer: Buffer } {
  const save = JSON.parse(
    readFileSync(
      new URL("../test/saves/version-35.moonbase", import.meta.url),
      "utf8",
    ),
  ) as {
    state: { structures: { id: string; conditionPercent: number }[] };
  };
  const conditionOf = (id: string, percent: number) => {
    const structure = save.state.structures.find((each) => each.id === id);
    if (structure === undefined) throw new Error(`expected a ${id}`);
    structure.conditionPercent = percent;
  };
  conditionOf("structure-2", 30);
  conditionOf("structure-4", 0);
  return {
    name: "broken-array.moonbase",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(save)),
  };
}

/**
 * Loads the save, paused throughout so that nothing is repaired meanwhile,
 * in place of the Campaign being played, or else in a new visit.
 */
async function loadBrokenArrayBase(
  page: Page,
  { inPlace = false } = {},
): Promise<void> {
  if (!inPlace) {
    await page.goto("/?seed=1");
    await page.getByRole("button", { name: "Pause" }).click();
  }
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(brokenArraySave());
  await expect(entriesOf(structuresOf(page))).toHaveCount(4);
}

function structuresOf(page: Page): Locator {
  return page
    .getByRole("complementary", { name: "Base" })
    .getByRole("group", { name: "Structures", exact: true });
}

/** The group of a type's Structures, by the type's label, folded or not. */
function groupOf(page: Page, label: string): Locator {
  return structuresOf(page)
    .locator("details")
    .filter({
      has: page.locator("summary", {
        hasText: new RegExp(String.raw`^${label}\s*\d+$`),
      }),
    });
}

/** A group's entries, folded away or not. */
function entriesOf(group: Locator): Locator {
  return group.getByRole("listitem", { includeHidden: true });
}

test("the Base panel lists Structures together by type, and each type folds on its own, stays as it was left after a reload, and shows when one in it is Broken or low on Condition", async ({
  page,
}) => {
  await loadBrokenArrayBase(page);
  const structures = structuresOf(page);
  const arrays = groupOf(page, "Solar array");
  const extraction = groupOf(page, "Extraction plant");
  const vacuum = groupOf(page, "Vacuum fabrication plant");

  // The two solar arrays together, under a heading with how many there are,
  // though built either side of the Plants.
  await expect(structures.locator("summary")).toHaveText([
    /^Solar array\s*2$/,
    /^Extraction plant\s*1$/,
    /^Vacuum fabrication plant\s*1$/,
  ]);
  await expect(structures.getByRole("listitem")).toHaveText([
    /^Solar array Condition 97%/,
    /^Solar array Condition 0%/,
    /^Extraction plant Condition 30%/,
    /^Vacuum fabrication plant/,
  ]);
  const needsAttention = (group: Locator) =>
    group.getByTitle("Something here needs attention");
  await expect(needsAttention(arrays)).toBeVisible();
  await expect(needsAttention(extraction)).toBeVisible();
  await expect(needsAttention(vacuum)).toBeHidden();

  // Folded from the keyboard, the solar arrays are out of sight, but not
  // the Broken one's warning, and the other groups stay open.
  await arrays.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(entriesOf(arrays)).toHaveCount(2);
  for (const entry of await entriesOf(arrays).all()) {
    await expect(entry).toBeHidden();
  }
  await expect(needsAttention(arrays)).toBeVisible();
  await expect(arrays.locator("summary")).toHaveText(/^Solar array\s*2$/);
  await expect(vacuum.getByRole("listitem")).toBeVisible();

  // Still folded on the next visit.
  await loadBrokenArrayBase(page);
  await expect(entriesOf(arrays).first()).toBeHidden();
  await expect(vacuum.getByRole("listitem")).toBeVisible();

  // Opened again, its controls still work.
  await arrays.locator("summary").focus();
  await page.keyboard.press(" ");
  const first = arrays.getByRole("listitem").first();
  await expect(first).toBeVisible();
  await first.getByRole("button", { name: "Dismantle" }).click();
  await expect(first).toContainText("to be dismantled");
});

test("building a Structure adds it to its type's group, folded or not, or to a new group, open; dismantling the last of a type takes its group away, and loading a Campaign lists its own", async ({
  page,
}) => {
  await loadBrokenArrayBase(page);
  const structures = structuresOf(page);
  const arrays = groupOf(page, "Solar array");
  const extraction = groupOf(page, "Extraction plant");
  const skip = page.getByRole("button", { name: "Skip to next event" });
  /** Skips to the next event until the target shows, up to a limit. */
  const skipUntil = async (target: Locator): Promise<void> => {
    for (let skips = 0; skips < 40 && !(await target.isVisible()); skips++) {
      await skip.click();
    }
    await expect(target).toBeVisible();
  };
  await arrays.locator("summary").click();
  await expect(entriesOf(arrays).first()).toBeHidden();

  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  for (const name of [/Solar array/, /Battery bank/]) {
    await buildMenu.getByRole("button", { name }).click();
    await placeOnClearGround(page);
  }
  await extraction.getByRole("button", { name: "Dismantle" }).click();

  const batteries = groupOf(page, "Battery bank");
  await skipUntil(batteries.getByRole("listitem"));
  await expect(batteries.locator("summary")).toHaveText(/^Battery bank\s*1$/);
  await skipUntil(arrays.locator("summary", { hasText: /3$/ }));
  // The new solar array went into its folded group, which stayed folded.
  await expect(entriesOf(arrays)).toHaveCount(3);
  await expect(entriesOf(arrays).last()).toBeHidden();

  for (let skips = 0; skips < 40 && (await extraction.count()) > 0; skips++) {
    await skip.click();
  }
  await expect(structures.locator("summary")).toHaveText([
    /^Solar array\s*3$/,
    /^Vacuum fabrication plant\s*1$/,
    /^Battery bank\s*1$/,
  ]);

  // Loaded in place, the save's own Structures replace them, the solar
  // arrays still folded.
  await loadBrokenArrayBase(page, { inPlace: true });
  await expect(structures.locator("summary")).toHaveText([
    /^Solar array\s*2$/,
    /^Extraction plant\s*1$/,
    /^Vacuum fabrication plant\s*1$/,
  ]);
  await expect(entriesOf(arrays).first()).toBeHidden();
});
