import { catalogue, type ResourceRef, type StorageTank } from "../catalogue";
import { addBulk, bulkInStock } from "./bulk-resources";
import type { CampaignState } from "./campaign";
import {
  findStructureType,
  isBroken,
  type StructureState,
} from "./construction";

/**
 * How many kilograms of a resource the base can hold, or undefined if there is
 * no limit to it. This is the one place that says so: the data catalogue's figure
 * for the base's built-in storage, and each working storage tank's for it.
 */
export function storageLimitKilograms(
  state: CampaignState,
  resource: ResourceRef,
): number | undefined {
  const own = ownStorageKilograms(resource);
  if (own === undefined) return undefined;
  return workingTanks(state).reduce((limit, structure) => {
    const tank = storageTankOf(structure);
    return tank !== undefined && sameResource(tank.resource, resource)
      ? limit + tank.kilograms
      : limit;
  }, own);
}

/** What the base holds of a resource with no tank, or undefined if it has no limit. */
function ownStorageKilograms(resource: ResourceRef): number | undefined {
  if (resource.kind === "bulk-resource") return undefined;
  return catalogue.lifeSupportStocks.find(
    (stock) => stock.id === resource.stockId,
  )?.storageLimitKilograms;
}

/** What a Structure holds if it is a storage tank, whatever state it is in. */
export function storageTankOf(
  structure: Pick<StructureState, "structureTypeId">,
): StorageTank | undefined {
  return findStructureType(structure.structureTypeId)?.storageTank;
}

/**
 * The commissioned storage tanks that aren't Broken. One that is to be dismantled
 * still counts until the Robot starts on it, when it comes off the base.
 */
export function workingTanks(state: CampaignState): StructureState[] {
  return state.structures.filter(
    (structure) =>
      storageTankOf(structure) !== undefined && !isBroken(structure),
  );
}

export function sameResource(a: ResourceRef, b: ResourceRef): boolean {
  return a.kind === "bulk-resource"
    ? b.kind === "bulk-resource" && a.resourceId === b.resourceId
    : b.kind === "life-support" && a.stockId === b.stockId;
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
