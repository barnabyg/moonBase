import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { dismantle, structuresList } from "./base-panel";
import { placeOnClearGround } from "./placement";

/** A Robot, Machine or Rover in a save, as far as these tests edit it. */
interface SavedWorker {
  conditionPercent: number;
}

/** Which of the base's workers a save has low on Condition. */
type Worn = "robots" | "machines" | "rovers";

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
 * `more`, it has lights and Habitats too, and with `worn`, its Robot, its
 * Machines or its Rover are low on Condition.
 */
function brokenArraySave({
  more = false,
  worn,
}: { more?: boolean; worn?: Worn | undefined } = {}): {
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
    state: {
      structures: SavedStructure[];
      nextStructureNumber: number;
      robots: SavedWorker[];
      machines: SavedWorker[];
      rovers: SavedWorker[];
    };
  };
  if (worn !== undefined) {
    for (const worker of save.state[worn]) worker.conditionPercent = 30;
  }
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
  {
    inPlace = false,
    more = false,
    worn,
  }: { inPlace?: boolean; more?: boolean; worn?: Worn } = {},
): Promise<void> {
  if (!inPlace) {
    await page.goto("/?seed=1");
    await page.getByRole("button", { name: "Pause" }).click();
  }
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await (await chooser).setFiles(brokenArraySave({ more, worn }));
  // Each Structure's row, and the row the two solar arrays share.
  await expect(entriesOf(structuresList(page))).toHaveCount(
    4 + 1 + (more ? ADDED.length : 0),
  );
}

/** A group of Structures, by its label, folded or not. */
function groupOf(page: Page, label: string): Locator {
  return structuresList(page)
    .locator("details")
    .filter({
      has: page.locator("summary", {
        hasText: new RegExp(String.raw`^${label}\s*\d+(?!\d|%)`),
      }),
    });
}

/** The heading of a group or section, and not those of the rows in it. */
function headingOf(group: Locator): Locator {
  return group.locator(":scope > summary");
}

/** A section of the Base panel, by its title, folded or not. */
function sectionOf(page: Page, title: string): Locator {
  return page
    .getByRole("complementary", { name: "Base" })
    .locator("details")
    .filter({
      has: page.locator("summary", {
        hasText: new RegExp(String.raw`^${title}\s*\d+$`),
      }),
    });
}

/** The mark beside a section's own title, and not those of the groups in it. */
function markOf(section: Locator): Locator {
  return section
    .locator(":scope > summary")
    .getByTitle("Something here needs attention");
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
  // build, each with how many it holds and what matters about them.
  const headings = structures.locator(":scope > details > summary");
  await expect(headings).toHaveText([
    /^Habitats\s*4$/,
    /^Power\s*2\s*1 Broken · lowest 97%$/,
    /^Lights\s*2$/,
    /^Industry\s*2\s*lowest 30%$/,
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
  // The two solar arrays share a row, which says what is out of the
  // ordinary among them. The light masts are of two types, and each Plant
  // has its own switch, so those keep a row each.
  const arrays = power.getByRole("listitem").filter({ hasText: "×2" });
  await expect(power.getByRole("listitem")).toHaveText([
    /^Solar array ×2 Condition lowest 0% 1 Broken/,
  ]);
  // It opens from the keyboard to show each, and closes again.
  await arrays.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(arrays.getByRole("listitem")).toHaveText([
    /^Solar array Condition 97% Dust coating/,
    /^Solar array Condition 0% Broken/,
  ]);
  await arrays.locator("summary").click();
  await expect(arrays.getByRole("listitem")).toHaveCount(0);
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
  await headingOf(power).focus();
  await page.keyboard.press("Enter");
  await expect(entriesOf(power)).toHaveCount(3);
  for (const entry of await entriesOf(power).all()) {
    await expect(entry).toBeHidden();
  }
  await expect(needsAttention(power)).toBeVisible();
  // Folded, its heading still says what matters in it.
  await expect(headingOf(power)).toHaveText(
    /^Power\s*2\s*1 Broken · lowest 97%$/,
  );
  await expect(lights.getByRole("listitem").first()).toBeVisible();

  // Still folded on the next visit.
  await loadBrokenArrayBase(page, { more: true });
  await expect(entriesOf(power).first()).toBeHidden();
  await expect(lights.getByRole("listitem").first()).toBeVisible();

  // Opened again, a solar array can still be dismantled, and their row
  // says that one of them is to be.
  await headingOf(power).focus();
  await page.keyboard.press(" ");
  await expect(arrays).toBeVisible();
  await arrays.locator("summary").click();
  const first = arrays.getByRole("listitem").first();
  await dismantle(page, first);
  await expect(first).toContainText("to be dismantled");
  await expect(arrays.locator("summary")).toContainText(
    "1 Broken, 1 to be dismantled",
  );
});

test("Robots & Machines comes above Structures, which shows when a Structure is Broken or low on Condition, folded or not, as Robots & Machines does when a Machine or the Rover is, but not for a worn Robot", async ({
  page,
}) => {
  // A Broken solar array and a worn extraction plant, with Lights to show
  // that a group with neither stays unmarked.
  await loadBrokenArrayBase(page, { more: true });
  const structures = sectionOf(page, "Structures");
  const fleet = sectionOf(page, "Robots & Machines");
  // The short list first, so that it shows however many Structures follow.
  await expect(
    page
      .getByRole("complementary", { name: "Base" })
      .locator(":scope > details > summary"),
  ).toHaveText([/^Robots & Machines\s*\d+$/, /^Structures\s*\d+$/]);
  await expect(markOf(structures)).toBeVisible();
  await expect(markOf(groupOf(page, "Lights"))).toBeHidden();
  await expect(markOf(fleet)).toBeHidden();

  // Folded, its groups' marks are out of sight, and its own is not.
  await structures.locator(":scope > summary").click();
  await expect(markOf(groupOf(page, "Power"))).toBeHidden();
  await expect(markOf(structures)).toBeVisible();
  await structures.locator(":scope > summary").click();

  // A Robot wears down to 10% before it repairs itself, so at 30% it is
  // as it should be.
  await loadBrokenArrayBase(page, { inPlace: true, worn: "robots" });
  await expect(fleet.getByRole("listitem").first()).toContainText(
    "Condition 30%",
  );
  await expect(markOf(fleet)).toBeHidden();

  // Maintenance starts at 70%, so a Machine or the Rover at 30% has been
  // left waiting.
  for (const worn of ["machines", "rovers"] as const) {
    await loadBrokenArrayBase(page, { inPlace: true, worn });
    await expect(markOf(fleet)).toBeVisible();
    await fleet.locator(":scope > summary").click();
    await expect(fleet.getByRole("listitem").first()).toBeHidden();
    await expect(markOf(fleet)).toBeVisible();
    await fleet.locator(":scope > summary").click();
  }
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
  await headingOf(power).click();
  await expect(entriesOf(power).first()).toBeHidden();

  const buildMenu = page.getByRole("complementary", { name: "Build menu" });
  for (const name of [/Battery bank/, /Light mast/, /Solar array/]) {
    await buildMenu.getByRole("button", { name }).click();
    await placeOnClearGround(page);
  }
  for (const entry of await industry.getByRole("listitem").all()) {
    await dismantle(page, entry);
  }

  // The lights come between Power and Industry, open.
  const lights = groupOf(page, "Lights");
  await skipUntil(lights.getByRole("listitem"));
  await expect(headingOf(lights)).toHaveText(/^Lights\s*1$/);
  await skipUntil(
    power.locator(":scope > summary", { hasText: /^Power\s*4(?!\d)/ }),
  );
  // The new solar array went in with the others, in the row they share,
  // ahead of the battery bank built before it, in its folded group, which
  // stayed folded.
  await expect(entriesOf(power)).toHaveText([
    /^Solar array ×3/,
    /^Solar array Condition/,
    /^Solar array Condition/,
    /^Solar array Condition/,
    /^Battery bank/,
  ]);
  await expect(entriesOf(power).last()).toBeHidden();

  for (let skips = 0; skips < 40 && (await industry.count()) > 0; skips++) {
    await skip.click();
  }
  const headings = structures.locator(":scope > details > summary");
  await expect(headings).toHaveText([/^Power\s*4(?!\d)/, /^Lights\s*1(?!\d)/]);

  // Loaded in place, the save's own Structures replace them, the solar
  // arrays still folded.
  await loadBrokenArrayBase(page, { inPlace: true });
  await expect(headings).toHaveText([
    /^Power\s*2\s*1 Broken/,
    /^Industry\s*2\s*lowest/,
  ]);
  await expect(entriesOf(power).first()).toBeHidden();
});

test("a commissioned Structure with nothing to report takes one line, and what its row leaves out can be reached from the keyboard", async ({
  page,
}) => {
  await loadBrokenArrayBase(page, { more: true });
  const base = page.getByRole("complementary", { name: "Base" });
  const mast = groupOf(page, "Lights").getByRole("listitem").first();
  const plant = groupOf(page, "Industry").getByRole("listitem").first();

  // Its name and Condition, and nothing under them: no state, no buttons.
  await expect(mast).toHaveText(/^Light mast\s+Condition\s+100%$/, {
    useInnerText: true,
  });
  const name = await mast.getByRole("button").boundingBox();
  const row = await mast.boundingBox();
  if (name === null || row === null) throw new Error("The row isn't shown.");
  expect(row.height).toBeLessThan(name.height * 2);
  await expect(mast.getByRole("button")).toHaveCount(1);

  // How things are repaired is on each Condition, not above the lists.
  await expect(base).not.toContainText("Repairs are automatic");
  await expect(
    mast.getByTitle(/^Condition\. Repairs are automatic/),
  ).toHaveText("Condition 100%");

  // A Plant keeps what it is doing and its switch, but not Dismantle.
  await expect(plant).toContainText("running");
  await expect(plant.getByRole("button", { name: "Switch off" })).toBeVisible();
  await expect(plant.getByRole("button", { name: "Dismantle" })).toHaveCount(0);

  // From the keyboard, its name opens its pop-up, which has its recipe and
  // Dismantle.
  await plant.getByRole("button", { name: "Extraction plant" }).focus();
  await page.keyboard.press("Enter");
  const popUp = page.getByRole("dialog", { name: "Extraction plant" });
  await expect(popUp.getByRole("status", { name: "Output" })).toContainText(
    // Less than its recipe says, as it is low on Condition.
    /^Output making .* an hour from 2\.4 kg of Regolith/,
  );
  await popUp.getByRole("button", { name: "Dismantle" }).focus();
  await page.keyboard.press("Enter");
  await expect(plant).toContainText("to be dismantled");
});
