import { readFileSync } from "node:fs";
import { catalogue } from "../src/catalogue";
import { createCampaign, loadCampaign, type Campaign } from "../src/simulation";
import { REFERENCE_SEED } from "./reference-campaign";
import { toGameMinutes } from "./scenario";

// What `npm run try` can start the game in, so that a change can be tried by
// hand without playing up to it (see docs/trying-things.md). A scenario may
// play the Campaign through the simulation interface, or edit the save's text
// to get there faster: this is a way to look at something, not a test of the
// game's balance.

export interface TryScenario {
  /** What to type after `npm run try --`. */
  readonly id: string;
  /** What state the game starts in. */
  readonly title: string;
  /** What to do, and what should happen, in words the player knows. */
  readonly steps: readonly string[];
  /** Runs on a catalogue crowded with made-up items (`crowded-catalogue.ts`). */
  readonly crowded?: boolean;
  /** Plays too far to prepare in the tests. */
  readonly slow?: boolean;
  /** Prepares the Campaign, and returns it as the text of a save. */
  save(): string;
}

/** The parts of a save's state that scenarios edit. */
export interface EditableSaveState {
  unlockedDesignIds: string[];
  science: number;
  fundingMillionDollars: number;
  bulkResources: { resourceId: string; kilograms: number }[];
}

/** The Campaign as a save's text, with its state changed as the edit says. */
function saveWith(
  campaign: Campaign,
  edit: (state: EditableSaveState) => void,
): string {
  const save = JSON.parse(campaign.save()) as { state: EditableSaveState };
  edit(save.state);
  return JSON.stringify(save, undefined, 2);
}

/** A Campaign an hour in, with the save's state changed as the edit says. */
export function freshSaveWith(
  edit: (state: EditableSaveState) => void,
): string {
  const campaign = createCampaign({ seed: REFERENCE_SEED });
  campaign.advance(toGameMinutes({ hours: 1 }));
  return saveWith(campaign, edit);
}

/**
 * A base in Daylight with an extraction plant and a vacuum fabrication plant
 * running, from a sample save, with the state changed as the edit says.
 */
function plantBaseSaveWith(edit: (state: EditableSaveState) => void): string {
  const loaded = loadCampaign(
    readFileSync(new URL("saves/version-35.moonbase", import.meta.url), "utf8"),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  return saveWith(loaded.campaign, edit);
}

/** Every Design unlocked, and Funding enough to fill a manifest with anything. */
function unlockEverything(state: EditableSaveState): void {
  state.unlockedDesignIds = catalogue.designs.map((design) => design.id);
  state.fundingMillionDollars = 5000;
}

/** Some of every bulk resource, so that they all show in the status panel. */
function stockEveryBulkResource(state: EditableSaveState): void {
  state.bulkResources = catalogue.bulkResources.map((resource, index) => ({
    resourceId: resource.id,
    kilograms: 40 + index * 25,
  }));
}

/** Sets the stock of one bulk resource. */
function stockOf(
  state: EditableSaveState,
  resourceId: string,
  kilograms: number,
): void {
  for (const stock of state.bulkResources) {
    if (stock.resourceId === resourceId) stock.kilograms = kilograms;
  }
}

export const tryScenarios: readonly TryScenario[] = [
  {
    id: "everything-unlocked",
    title: "An hour into a Campaign with every Design unlocked and $5,000M",
    steps: [
      "Open the Launch manifest: every item the game has today is listed, under Supplies, then Power, Construction, Protection, Life Support, Industry and Mobility, with a box above them to find one.",
      'Type "telescope" in the box: only the telescope\'s two parts stay, under Industry, and it says "Showing 2 of 42 items".',
      "Press + on one of them: the bars and the box stay in sight, and the rows don't move.",
      "Press Clear: all 42 come back, in the same order.",
    ],
    save: () => freshSaveWith(unlockEverything),
  },
  {
    id: "crowded",
    title:
      "A base with two Plants running, every Design unlocked and $5,000M, on a catalogue crowded with made-up items: 80 Launch items and 15 bulk resources, all in stock",
    crowded: true,
    steps: [
      'Set the game to 20x and open the Launch manifest: it says "80 items", in groups. Scroll to the end: the Payload Mass and cost bars and the box to find an item stay in sight at the top.',
      'Type "solar array" in the box, slowly, with the game running: nothing you type is lost or moved, and only what goes into a solar array stays, even an Array mast, which doesn\'t say "solar" in its name.',
      "Press + on an item a dozen times, then − as many: its count and the bars change, and no row moves.",
      "Open the Exports tab and come back: what you typed is still there. Press Clear: all 80 come back, in the same order.",
      "Look down the status panel's Bulk resources: 15 lines, one each, in columns, all readable. Those changing say how fast a day, and those falling roughly how long they last.",
      "Silicon is in the warning colour, with a dot beside the section's title, as it will run out in under 3 Earth Days.",
      'Click the Bulk resources title to fold it: beside the title it says how long silicon lasts and how much Regolith there is, for example "Silicon 2d · Regolith 1500 kg", and the dot stays.',
      "Reload the page: the section is still folded. Open it again, reload, and set the game to 20x: as the silicon runs down, no line below moves up and down.",
    ],
    save: () =>
      plantBaseSaveWith((state) => {
        unlockEverything(state);
        stockEveryBulkResource(state);
        stockOf(state, "regolith", 1500);
        stockOf(state, "silicon", 18);
      }),
  },
];
