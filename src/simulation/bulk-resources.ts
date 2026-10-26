import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";

/**
 * The base's stock of a bulk resource, such as Regolith, kept at the
 * stockpile and measured in kilograms.
 */
export interface BulkResourceState {
  resourceId: string;
  kilograms: number;
}

export interface BulkResourceSnapshot {
  readonly resourceId: string;
  readonly kilograms: number;
}

/** The bulk resources a Campaign begins with: none of each, in catalogue order. */
export function startingBulkResources(): BulkResourceState[] {
  return catalogue.bulkResources.map((resource) => ({
    resourceId: resource.id,
    kilograms: 0,
  }));
}

export function readBulkResources(
  state: CampaignState,
): BulkResourceSnapshot[] {
  return state.bulkResources.map((stock) => ({ ...stock }));
}

/** How many kilograms of a bulk resource the base has in stock. */
export function bulkInStock(state: CampaignState, resourceId: string): number {
  return (
    state.bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? 0
  );
}

/**
 * Adds kilograms of a bulk resource to the base's stock, or takes them away
 * for a negative amount, never below none.
 */
export function addBulk(
  state: CampaignState,
  resourceId: string,
  kilograms: number,
): void {
  setBulk(state, resourceId, bulkInStock(state, resourceId) + kilograms);
}

/** Sets how many kilograms of a bulk resource the base has in stock, never below none. */
export function setBulk(
  state: CampaignState,
  resourceId: string,
  kilograms: number,
): void {
  const stock = state.bulkResources.find(
    (candidate) => candidate.resourceId === resourceId,
  );
  if (stock !== undefined) stock.kilograms = Math.max(kilograms, 0);
}
