import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { structuresList } from "./base-panel";
import { placeOnClearGround } from "./placement";

interface SavedStructure {
  id: string;
  structureTypeId: string;
  position: { x: number; y: number };
  conditionPercent: number;
}

/**
 * Structures added to the sample save, in the order they were built: two
 * kinds of light, and two kinds of Habitat, the first with Regolith
 * shielding and a water wall over it, built either side of the second.
 */
const ADDED: readonly [string, { x: number; y: number }][] = [
  ["light-mast", { x: -40, y: 20 }],
  ["habitat", { x: -40, y: -40 }],
  ["regolith-shielding", { x: -40, y: -40 }],
  ["tall-light-mast", { x: -60, y: 20 }],
  ["hardened-habitat", { x: -60, y: -40 }],
  ["water-wall", { x: -40, y: -40 }],
];

/**
 * A sample save of a Campaign with two solar arrays, built either side of an
 * extraction plant and a vacuum fabrication plant, and in its stock the
 * Components for another solar array and a battery bank. The second solar
 * array is made Broken, and the extraction plant low on Condition. With
 * `more`, it has lights and Habitats too.
 */
function brokenArraySave({ more = false } = {}): {
  name: string;
  mimeType: string;
  buffer: Buffer;
} {
  const save = JSON.parse(
    readFileSync(
      new URL("../test/saves/version-35.moonbase", import.meta.url),
      "utf8",
    ),
  ) as {
    state: { structures: SavedStructure[]; nextStructureNumber: number };
  };
  const { structures } = save.state;
  const conditionOf = (id: string, percent: number) => {
    const structure = structures.find((each) => each.id === id);
    if (structure === undefined) throw new Error(`expected a ${id}`);
    structure.conditionPercent = percent;
  };
  conditionOf("structure-2", 30);
  conditionOf("structure-4", 0);
  const first = structures[0];
  if (more && first !== undefined) {
    for (const [structureTypeId, position] of ADDED) {
      structures.push({
        ...first,
        id: `structure-${String(save.state.nextStructureNumber++)}`,
        structureTypeId,
        position,
        conditionPercent: 100,
      });
    }
  }
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
  { inPlace = false, more = false } = {},
): Promise<void> {
  if (!inPlace) {
    await page.goto("/?seed=1");
    await page.getByRole("button", { name: "Pause" }).click();
  }
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(brokenArraySave({ more }));
  await expect(entriesOf(structuresList(page))).toHaveCount(
    4 + (more ? ADDED.length : 0),
  );
}

/** A group of Structures, by its label, folded or not. */
function groupOf(page: Page, label: string): Locator {
  return structuresList(page)
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

test("the Base panel lists Structures by what they are for, in a fixed order, with each Habitat's shielding and water wall under it, and each group folds on its own, stays as it was left after a reload, and shows when one in it is Broken or low on Condition", async ({
  page,
}) => {
  await loadBrokenArrayBase(page, { more: true });
  const structures = structuresList(page);
  const habitats = groupOf(page, "Habitats");
  const power = groupOf(page, "Power");
  const lights = groupOf(page, "Lights");
  const industry = groupOf(page, "Industry");

  // The groups in their own order, wherever their Structures came in the
  // build, each with how many it holds.
  await expect(structures.locator("summary")).toHaveText([
    /^Habitats\s*4$/,
    /^Power\s*2$/,
    /^Lights\s*2$/,
    /^Industry\s*2$/,
  ]);
  // The Inflatable Habitat's shielding and water wall straight after it,
  // though the Hardened Habitat was built between them.
  await expect(habitats.getByRole("listitem")).toHaveText([
    /^Inflatable Habitat/,
    /^Regolith shielding/,
    /^Water wall/,
    /^Hardened Habitat/,
  ]);
  const left = async (entry: Locator): Promise<number> =>
    (await entry.locator(".entry__name").boundingBox())?.x ?? 0;
  const [habitat, shielding, wall, hardened] = await habitats
    .getByRole("listitem")
    .all();
  if (!habitat || !shielding || !wall || !hardened) throw new Error("entries");
  expect(await left(shielding)).toBeGreaterThan(await left(habitat));
  expect(await left(wall)).toBe(await left(shielding));
  expect(await left(hardened)).toBe(await left(habitat));
  await expect(lights.getByRole("listitem")).toHaveText([
    /^Light mast/,
    /^Tall Light Mast/,
  ]);
  await expect(power.getByRole("listitem")).toHaveText([
    /^Solar array Condition 97%/,
    /^Solar array Condition 0%/,
  ]);
  await expect(industry.getByRole("listitem")).toHaveText([
    /^Extraction plant Condition 30%/,
    /^Vacuum fabrication plant/,
  ]);
  const needsAttention = (group: Locator) =>
    group.getByTitle("Something here needs attention");
  await expect(needsAttention(power)).toBeVisible();
  await expect(needsAttention(industry)).toBeVisible();
  await expect(needsAttention(lights)).toBeHidden();

  // Folded from the keyboard, the solar arrays are out of sight, but not
  // the Broken one's warning, and the other groups stay open.
  await power.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(entriesOf(power)).toHaveCount(2);
  for (const entry of await entriesOf(power).all()) {
    await expect(entry).toBeHidden();
  }
  await expect(needsAttention(power)).toBeVisible();
  await expect(power.locator("summary")).toHaveText(/^Power\s*2$/);
  await expect(lights.getByRole("listitem").first()).toBeVisible();

  // Still folded on the next visit.
  await loadBrokenArrayBase(page, { more: true });
  await expect(entriesOf(power).first()).toBeHidden();
  await expect(lights.getByRole("listitem").first()).toBeVisible();

  // Opened again, its controls still work.
  await power.locator("summary").focus();
  await page.keyboard.press(" ");
  const first = power.getByRole("listitem").first();
  await expect(first).toBeVisible();
  await first.getByRole("button", { name: "Dismantle" }).click();
  await expect(first).toContainText("to be dismantled");
});

test("building a Structure puts it in its place in its group, folded or not, or in a new group in its place, open; dismantling the last of a group takes it away, and loading a Campaign lists its own", async ({
  page,
}) => {
  await loadBrokenArrayBase(page);
  const structures = structuresList(page);
  const power = groupOf(page, "Power");
  const industry = groupOf(page, "Industry");
  const skip = page.getByRole("button", { name: "Skip to next event" });
  /** Skips to the next event until the target shows, up to a limit. */
  const skipUntil = async (target: Locator): Promise<void> => {
    for (let skips = 0; skips < 40 && !(await target.isVisible()); skips++) {
      await skip.click();
    }
    await expect(target).toBeVisible();
  };
  await power.locator("summary").click();
  await expect(entriesOf(power).first()).toBeHidden();

  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  for (const name of [/Battery bank/, /Light mast/, /Solar array/]) {
    await buildMenu.getByRole("button", { name }).click();
    await placeOnClearGround(page);
  }
  for (const entry of await industry.getByRole("listitem").all()) {
    await entry.getByRole("button", { name: "Dismantle" }).click();
  }

  // The lights come between Power and Industry, open.
  const lights = groupOf(page, "Lights");
  await skipUntil(lights.getByRole("listitem"));
  await expect(lights.locator("summary")).toHaveText(/^Lights\s*1$/);
  await skipUntil(power.locator("summary", { hasText: /4$/ }));
  // The new solar array went in with the others, ahead of the battery
  // bank built before it, in its folded group, which stayed folded.
  await expect(entriesOf(power)).toHaveText([
    /^Solar array/,
    /^Solar array/,
    /^Solar array/,
    /^Battery bank/,
  ]);
  await expect(entriesOf(power).last()).toBeHidden();

  for (let skips = 0; skips < 40 && (await industry.count()) > 0; skips++) {
    await skip.click();
  }
  await expect(structures.locator("summary")).toHaveText([
    /^Power\s*4$/,
    /^Lights\s*1$/,
  ]);

  // Loaded in place, the save's own Structures replace them, the solar
  // arrays still folded.
  await loadBrokenArrayBase(page, { inPlace: true });
  await expect(structures.locator("summary")).toHaveText([
    /^Power\s*2$/,
    /^Industry\s*2$/,
  ]);
  await expect(entriesOf(power).first()).toBeHidden();
});
