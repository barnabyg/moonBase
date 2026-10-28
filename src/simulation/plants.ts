import type { PlantRecipe, ResourceRef } from "../catalogue";
import { addBulk, bulkInStock } from "./bulk-resources";
import type { CampaignState } from "./campaign";
import { structurePerformance } from "./condition";
import {
  findStructureType,
  isBroken,
  type StructureState,
} from "./construction";
import { recordLifeSupport } from "./self-sufficiency";

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

export type SetRecipeRefusal =
  "unknown-structure" | "not-a-plant" | "unknown-recipe" | "campaign-ended";

export type SetRecipeResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: SetRecipeRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

/** The recipes a type of Structure can run, the default first: none unless it is a Plant. */
export function recipesOf(structureTypeId: string): readonly PlantRecipe[] {
  return findStructureType(structureTypeId)?.recipes ?? [];
}

/** The recipe a Structure runs, if it is a Plant: the one chosen for it, or else its default. */
export function recipeOf(
  structure: Pick<StructureState, "structureTypeId" | "recipeId">,
): PlantRecipe | undefined {
  const recipes = recipesOf(structure.structureTypeId);
  return (
    recipes.find((recipe) => recipe.id === structure.recipeId) ?? recipes[0]
  );
}

/** The recipe a newly commissioned Structure runs: its type's default, if it is a Plant. */
export function defaultRecipeId(structureTypeId: string): string | undefined {
  return recipesOf(structureTypeId)[0]?.id;
}

export function isPlant(structure: Pick<StructureState, "structureTypeId">) {
  return recipesOf(structure.structureTypeId).length > 0;
}

/**
 * Has a commissioned Plant run one of its type's recipes from the next
 * game-minute on, in place of the one it runs now. It is a setting, so no
 * Robot works on it. A Structure that isn't a commissioned Plant, or a
 * recipe its type doesn't have, is refused with the reason.
 */
export function setPlantRecipe(
  state: CampaignState,
  structureId: string,
  recipeId: string,
): SetRecipeResult {
  const structure = state.structures.find(
    (candidate) => candidate.id === structureId,
  );
  if (structure === undefined) {
    return refuse(
      "unknown-structure",
      `There is no commissioned Structure "${structureId}".`,
    );
  }
  const label = labelOf(structure.structureTypeId);
  const recipes = recipesOf(structure.structureTypeId);
  if (recipes.length === 0) {
    return refuse(
      "not-a-plant",
      `The ${label} isn't a Plant, so it runs no recipe.`,
    );
  }
  if (!recipes.some((recipe) => recipe.id === recipeId)) {
    const choices = recipes.map((recipe) => recipe.label);
    const last = choices.pop() ?? "";
    const can =
      choices.length === 0 ? last : `${choices.join(", ")} or ${last}`;
    return refuse(
      "unknown-recipe",
      `The ${label} has no recipe "${recipeId}". It can run ${can}.`,
    );
  }
  structure.recipeId = recipeId;
  return { ok: true };
}

function labelOf(structureTypeId: string): string {
  return (
    findStructureType(structureTypeId)?.label.toLowerCase() ?? structureTypeId
  );
}

function refuse(reason: SetRecipeRefusal, message: string): SetRecipeResult {
  return { ok: false, reason, message };
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
  const recipe = recipeOf(structure);
  return (
    recipe !== undefined &&
    !isBroken(structure) &&
    missingInput(state, recipe) === undefined
  );
}

/** The power a Plant draws in a game-minute it runs, in kilowatts. */
export function plantDrawKilowatts(
  structure: Pick<StructureState, "structureTypeId" | "recipeId">,
): number {
  return recipeOf(structure)?.drawKilowatts ?? 0;
}

/**
 * Lets every Plant that had power this game-minute run the recipe chosen
 * for it, as fast as its Condition allows: it takes its inputs from the
 * base's stocks and adds its outputs to them. With too little of an input
 * left for the whole game-minute, it runs for as much of it as that allows.
 */
export function runPlants(state: CampaignState): void {
  for (const structure of state.structures) {
    const recipe = recipeOf(structure);
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
      const made = flow.kilogramsPerHour * rate * share;
      addTo(state, flow.resource, made);
      if (flow.resource.kind === "life-support") {
        recordLifeSupport(state, flow.resource.stockId, { produced: made });
      }
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
  return flowPerHour(state, resource, (recipe) => recipe.outputs);
}

/**
 * How many kilograms an hour of a resource the base's Plants are using up
 * now, as they ran during the latest game-minute.
 */
export function consumptionPerHour(
  state: CampaignState,
  resource: ResourceRef,
): number {
  return flowPerHour(state, resource, (recipe) => recipe.inputs);
}

function flowPerHour(
  state: CampaignState,
  resource: ResourceRef,
  flows: (recipe: PlantRecipe) => PlantRecipe["inputs"],
): number {
  return state.structures.reduce((sum, structure) => {
    const recipe = recipeOf(structure);
    if (recipe === undefined || !structure.powered) return sum;
    const moved = flows(recipe)
      .filter((flow) => isSameResource(flow.resource, resource))
      .reduce((total, flow) => total + flow.kilogramsPerHour, 0);
    return sum + moved * structurePerformance(structure);
  }, 0);
}

/**
 * Whether any of the base's Plants makes a resource with the recipe it is
 * set to, and isn't Broken, whether or not it ran during the latest
 * game-minute.
 */
export function isMadeByPlants(
  state: CampaignState,
  resource: ResourceRef,
): boolean {
  return state.structures.some(
    (structure) =>
      !isBroken(structure) &&
      (recipeOf(structure)?.outputs ?? []).some((flow) =>
        isSameResource(flow.resource, resource),
      ),
  );
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
  const recipe = recipeOf(structure);
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
