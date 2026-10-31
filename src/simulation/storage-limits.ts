import { catalogue, type ResourceRef } from "../catalogue";
import { addBulk, bulkInStock } from "./bulk-resources";
import type { CampaignState } from "./campaign";

/**
 * How many kilograms of a resource the base can hold, or undefined if there is
 * no limit to it. This is the one place that says so: it starts from the data
 * catalogue's figure for the base's built-in storage, and whatever else comes to
 * hold a resource adds to it here, which is why it takes the state.
 */
export function storageLimitKilograms(
  _state: CampaignState,
  resource: ResourceRef,
): number | undefined {
  if (resource.kind === "bulk-resource") return undefined;
  return catalogue.lifeSupportStocks.find(
    (stock) => stock.id === resource.stockId,
  )?.storageLimitKilograms;
}

/** How many kilograms of a bulk resource or life support stock the base has. */
export function amountOf(state: CampaignState, resource: ResourceRef): number {
  if (resource.kind === "bulk-resource") {
    return bulkInStock(state, resource.resourceId);
  }
  return (
    state.lifeSupport.find((stock) => stock.stockId === resource.stockId)
      ?.kilograms ?? 0
  );
}

/**
 * How many more kilograms of a resource the base can hold: Infinity with no
 * limit to it, and none once it is at the limit or over.
 */
export function spaceKilograms(
  state: CampaignState,
  resource: ResourceRef,
): number {
  const limit = storageLimitKilograms(state, resource);
  return limit === undefined
    ? Infinity
    : Math.max(limit - amountOf(state, resource), 0);
}

/**
 * Adds kilograms to a bulk resource or life support stock, as far as its limit,
 * or takes them away, and returns how many were added. The rest is lost. A stock
 * already over its limit, as in an older save, keeps what it has.
 */
export function addWithinLimit(
  state: CampaignState,
  resource: ResourceRef,
  kilograms: number,
): number {
  const added = Math.min(kilograms, spaceKilograms(state, resource));
  if (resource.kind === "bulk-resource") {
    addBulk(state, resource.resourceId, added);
    return added;
  }
  const stock = state.lifeSupport.find(
    (candidate) => candidate.stockId === resource.stockId,
  );
  if (stock !== undefined) {
    stock.kilograms = Math.max(stock.kilograms + added, 0);
  }
  return added;
}
