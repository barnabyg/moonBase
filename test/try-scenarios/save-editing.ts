import { readFileSync } from "node:fs";
import { catalogue } from "../../src/catalogue";
import {
  createCampaign,
  loadCampaign,
  type Campaign,
} from "../../src/simulation";
import { REFERENCE_SEED } from "../reference-campaign";
import { toGameMinutes } from "../scenario";

/** The parts of a save's state that scenarios edit. */
export interface EditableSaveState {
  unlockedDesignIds: string[];
  science: number;
  fundingMillionDollars: number;
  bulkResources: { resourceId: string; kilograms: number }[];
  reachedMilestoneIds: string[];
  stockpile: { components: { componentId: string; count: number }[] };
  radiationDoseMillisieverts: number;
  lifeSupport: { stockId: string; kilograms: number }[];
}

/** The Campaign as a save's text, with its state changed as the edit says. */
export function saveWith(
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
export function plantBaseSaveWith(
  edit: (state: EditableSaveState) => void,
): string {
  const loaded = loadCampaign(
    readFileSync(
      new URL("../saves/version-35.moonbase", import.meta.url),
      "utf8",
    ),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  return saveWith(loaded.campaign, edit);
}

/** Every Design unlocked, and Funding enough to fill a manifest with anything. */
export function unlockEverything(state: EditableSaveState): void {
  state.unlockedDesignIds = catalogue.designs.map((design) => design.id);
  state.fundingMillionDollars = 5000;
}

/** Some of every bulk resource, so that they all show in the status panel. */
export function stockEveryBulkResource(state: EditableSaveState): void {
  state.bulkResources = catalogue.bulkResources.map((resource, index) => ({
    resourceId: resource.id,
    kilograms: 40 + index * 25,
  }));
}

/** Sets the stock of one bulk resource. */
export function stockOf(
  state: EditableSaveState,
  resourceId: string,
  kilograms: number,
): void {
  for (const stock of state.bulkResources) {
    if (stock.resourceId === resourceId) stock.kilograms = kilograms;
  }
}

/** Every Milestone reached but one. */
export function reachEveryMilestoneBut(
  state: EditableSaveState,
  milestoneId: string,
): void {
  state.reachedMilestoneIds = catalogue.milestones
    .map((milestone) => milestone.id)
    .filter((id) => id !== milestoneId);
}

/** Adds Components to the base's stock, as a Launch would have brought. */
export function addComponents(
  state: EditableSaveState,
  counts: readonly { componentId: string; count: number }[],
): void {
  for (const { componentId, count } of counts) {
    for (const stock of state.stockpile.components) {
      if (stock.componentId === componentId) stock.count += count;
    }
  }
}

/**
 * Fills every life support stock to its storage limit, whatever it held: a
 * scenario's way of living on while it is tried, and of ending with no more than
 * the base can hold after building on more.
 */
export function fillStocks(state: EditableSaveState): void {
  for (const stock of state.lifeSupport) {
    stock.kilograms =
      catalogue.lifeSupportStocks.find(({ id }) => id === stock.stockId)
        ?.storageLimitKilograms ?? stock.kilograms;
  }
}
