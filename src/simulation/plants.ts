import type { PlantRecipe, ResourceRef } from "../catalogue";
import { addBulk, bulkInStock } from "./bulk-resources";
import type { CampaignState } from "./campaign";
import { structurePerformance } from "./condition";
import {
  findStructureType,
  isBroken,
  type StructureState,
} from "./construction";

/** Why a Plant isn't running. */
export type PlantStop =
  | { readonly reason: "broken" }
  /** It has none of one of its inputs: the first in its recipe it is out of. */
  | { readonly reason: "no-input"; readonly resource: ResourceRef }
  /** Its network had no power to spare for it. */
  | { readonly reason: "no-power" };

/** Whether a Plant is running, and why not if it isn't. */
export interface PlantSnapshot {
  /** Whether it ran during the latest game-minute. */
  readonly running: boolean;
  readonly stoppedFor: PlantStop | undefined;
}

/** The recipe a type of Structure runs, if it is a Plant. */
export function recipeOf(structureTypeId: string): PlantRecipe | undefined {
  return findStructureType(structureTypeId)?.plant;
}

export function isPlant(structure: Pick<StructureState, "structureTypeId">) {
  return recipeOf(structure.structureTypeId) !== undefined;
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

/** Adds kilograms to a bulk resource or life support stock, or takes them away. */
function addTo(
  state: CampaignState,
  resource: ResourceRef,
  kilograms: number,
): void {
  if (resource.kind === "bulk-resource") {
    addBulk(state, resource.resourceId, kilograms);
    return;
  }
  const stock = state.lifeSupport.find(
    (candidate) => candidate.stockId === resource.stockId,
  );
  if (stock !== undefined) {
    stock.kilograms = Math.max(stock.kilograms + kilograms, 0);
  }
}

/** The first of a recipe's inputs that the base has none of, if any. */
function missingInput(
  state: CampaignState,
  recipe: PlantRecipe,
): ResourceRef | undefined {
  return recipe.inputs.find((flow) => amountOf(state, flow.resource) <= 0)
    ?.resource;
}

/**
 * Whether a commissioned Plant would run if it had power: it isn't Broken,
 * and the base has some of every input it takes.
 */
export function wantsToRun(
  state: CampaignState,
  structure: StructureState,
): boolean {
  const recipe = recipeOf(structure.structureTypeId);
  return (
    recipe !== undefined &&
    !isBroken(structure) &&
    missingInput(state, recipe) === undefined
  );
}

/** The power a Plant draws in a game-minute it runs, in kilowatts. */
export function plantDrawKilowatts(
  structure: Pick<StructureState, "structureTypeId">,
): number {
  return recipeOf(structure.structureTypeId)?.drawKilowatts ?? 0;
}

/**
 * Lets every Plant that had power this game-minute run its recipe for it,
 * as fast as its Condition allows: it takes its inputs from the base's
 * stocks and adds its outputs to them. With too little of an input left
 * for the whole game-minute, it runs for as much of it as that allows.
 */
export function runPlants(state: CampaignState): void {
  for (const structure of state.structures) {
    const recipe = recipeOf(structure.structureTypeId);
    if (recipe === undefined || !structure.powered) continue;
    const rate = structurePerformance(structure) / 60;
    const share = Math.min(
      1,
      ...recipe.inputs.map(
        (flow) =>
          amountOf(state, flow.resource) / (flow.kilogramsPerHour * rate),
      ),
    );
    for (const flow of recipe.inputs) {
      addTo(state, flow.resource, -flow.kilogramsPerHour * rate * share);
    }
    for (const flow of recipe.outputs) {
      addTo(state, flow.resource, flow.kilogramsPerHour * rate * share);
    }
  }
}

/**
 * How many kilograms an hour of a resource the base's Plants are making
 * now, as they ran during the latest game-minute.
 */
export function productionPerHour(
  state: CampaignState,
  resource: ResourceRef,
): number {
  return state.structures.reduce((sum, structure) => {
    const recipe = recipeOf(structure.structureTypeId);
    if (recipe === undefined || !structure.powered) return sum;
    const made = recipe.outputs
      .filter((flow) => isSameResource(flow.resource, resource))
      .reduce((total, flow) => total + flow.kilogramsPerHour, 0);
    return sum + made * structurePerformance(structure);
  }, 0);
}

export function isSameResource(a: ResourceRef, b: ResourceRef): boolean {
  return a.kind === "bulk-resource"
    ? b.kind === "bulk-resource" && a.resourceId === b.resourceId
    : b.kind === "life-support" && a.stockId === b.stockId;
}

/** Whether a Plant is running, and why not, or undefined for any other Structure. */
export function readPlant(
  state: CampaignState,
  structure: StructureState,
): PlantSnapshot | undefined {
  const recipe = recipeOf(structure.structureTypeId);
  if (recipe === undefined) return undefined;
  if (structure.powered) return { running: true, stoppedFor: undefined };
  if (isBroken(structure)) {
    return { running: false, stoppedFor: { reason: "broken" } };
  }
  const missing = missingInput(state, recipe);
  return {
    running: false,
    stoppedFor:
      missing === undefined
        ? { reason: "no-power" }
        : { reason: "no-input", resource: { ...missing } },
  };
}
