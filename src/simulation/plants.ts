import type { PlantRecipe, ResourceFlow, ResourceRef } from "../catalogue";
import { addBulk, bulkInStock } from "./bulk-resources";
import type { CampaignState } from "./campaign";
import { structurePerformance } from "./condition";
import {
  findStructureType,
  isBroken,
  type StructureState,
} from "./construction";
import { recordLifeSupport } from "./self-sufficiency";

/**
 * How many game-minutes of work at full performance a Plant's batch takes:
 * a batch is a game-hour of its recipe.
 */
export const BATCH_MINUTES = 60;

/** A batch a Plant has started and not yet finished. */
export interface PlantBatch {
  /** The recipe it took the batch's inputs for, which it finishes it with. */
  recipeId: string;
  /** Game-minutes of work done on it at full performance: less at a lower Condition. */
  minutesWorked: number;
}

/** Why a Plant didn't run during the latest game-minute. */
export type PlantStop =
  | { readonly reason: "broken" }
  /**
   * It has no batch started and too little of one of its inputs to start
   * one: the first in its recipe it is short of.
   */
  | { readonly reason: "no-input"; readonly resource: ResourceRef }
  /** It was Night, when no network has power to spare for a Plant. */
  | { readonly reason: "night" }
  /** Its network had no power to spare for it in Daylight. */
  | { readonly reason: "no-power" };

/** Why a Plant isn't running, as the player sees it. */
export type PlantStopSnapshot =
  | Exclude<PlantStop, { readonly reason: "no-input" }>
  | {
      readonly reason: "no-input";
      readonly resource: ResourceRef;
      /** How much of it the base has, up to what a batch needs. */
      readonly kilograms: number;
      /** How much of it a batch needs. */
      readonly kilogramsNeeded: number;
    };

/** Whether a Plant is running, why not if it isn't, and how far its batch has got. */
export interface PlantSnapshot {
  /** Whether it worked on a batch during the latest game-minute. */
  readonly running: boolean;
  readonly stoppedFor: PlantStopSnapshot | undefined;
  /**
   * The batch it has started and not finished, with the game-minutes of
   * work left on it as fast as its Condition allows; undefined between
   * batches.
   */
  readonly batch:
    { readonly recipeId: string; readonly minutesLeft: number } | undefined;
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

/**
 * The recipe a Structure is set to run, if it is a Plant: the one chosen
 * for it, or else its default. A batch it has started goes on with the
 * recipe it was started with (see `workingRecipeOf`).
 */
export function recipeOf(
  structure: Pick<StructureState, "structureTypeId" | "recipeId">,
): PlantRecipe | undefined {
  const recipes = recipesOf(structure.structureTypeId);
  return (
    recipes.find((recipe) => recipe.id === structure.recipeId) ?? recipes[0]
  );
}

/** The recipe a Plant is working with: its batch's, while it has one, or else the one it is set to. */
export function workingRecipeOf(
  structure: Pick<StructureState, "structureTypeId" | "recipeId" | "batch">,
): PlantRecipe | undefined {
  const { batch } = structure;
  return batch === undefined
    ? recipeOf(structure)
    : recipeOf({ ...structure, recipeId: batch.recipeId });
}

/** The recipe a newly commissioned Structure runs: its type's default, if it is a Plant. */
export function defaultRecipeId(structureTypeId: string): string | undefined {
  return recipesOf(structureTypeId)[0]?.id;
}

export function isPlant(structure: Pick<StructureState, "structureTypeId">) {
  return recipesOf(structure.structureTypeId).length > 0;
}

/**
 * Has a commissioned Plant run one of its type's recipes from its next
 * batch on, in place of the one it runs now: a batch it has started it
 * finishes with the recipe it took the inputs for. It is a setting, so no
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

/** How many kilograms of a resource a batch takes in or puts out. */
function batchKilograms(flow: ResourceFlow): number {
  return (flow.kilogramsPerHour * BATCH_MINUTES) / 60;
}

/** Kilograms too few to count, from rounding in adding up a stock. */
const AMOUNT_TOLERANCE = 1e-9;

/** Game-minutes too few to count, from rounding in adding up work. */
const MINUTE_TOLERANCE = 1e-9;

/**
 * The kilograms of each bulk resource and life support stock that the
 * Plants given power so far in a game-minute will take as they start their
 * batches, so that no two count on the same kilograms.
 */
export type BatchClaims = Map<string, number>;

function claimKey(resource: ResourceRef): string {
  return resource.kind === "bulk-resource"
    ? `bulk-resource:${resource.resourceId}`
    : `life-support:${resource.stockId}`;
}

/**
 * The first of a recipe's inputs that the base has too little of to start
 * a batch, once what other Plants have claimed is set aside, if any.
 */
function shortInput(
  state: CampaignState,
  recipe: PlantRecipe,
  claims: BatchClaims,
): ResourceRef | undefined {
  return recipe.inputs.find(
    (flow) =>
      amountOf(state, flow.resource) -
        (claims.get(claimKey(flow.resource)) ?? 0) <
      batchKilograms(flow) - AMOUNT_TOLERANCE,
  )?.resource;
}

/**
 * Why a commissioned Plant couldn't run whatever power it had, if it
 * couldn't: it is Broken, or it has no batch started and too little of an
 * input to start one, beyond what other Plants have claimed this
 * game-minute. Undefined for any other Structure.
 */
export function plantCantRun(
  state: CampaignState,
  structure: StructureState,
  claims: BatchClaims,
): PlantStop | undefined {
  const recipe = recipeOf(structure);
  if (recipe === undefined) return undefined;
  if (isBroken(structure)) return { reason: "broken" };
  if (structure.batch !== undefined) return undefined;
  const resource = shortInput(state, recipe, claims);
  return resource === undefined
    ? undefined
    : { reason: "no-input", resource: { ...resource } };
}

/**
 * Claims the inputs a Plant given power will take as it starts a batch
 * this game-minute, if it has none started.
 */
export function claimBatchInputs(
  structure: StructureState,
  claims: BatchClaims,
): void {
  if (structure.batch !== undefined) return;
  for (const flow of recipeOf(structure)?.inputs ?? []) {
    const key = claimKey(flow.resource);
    claims.set(key, (claims.get(key) ?? 0) + batchKilograms(flow));
  }
}

/** The power a Plant draws in a game-minute it runs, in kilowatts. */
export function plantDrawKilowatts(
  structure: Pick<StructureState, "structureTypeId" | "recipeId" | "batch">,
): number {
  return workingRecipeOf(structure)?.drawKilowatts ?? 0;
}

/**
 * Lets every Plant that had power this game-minute work on a batch, as
 * fast as its Condition allows. One with no batch started starts one with
 * the recipe it is set to, taking a batch's inputs from the base's stocks,
 * which it claimed as it was given power (see `supplyPower`). A batch is
 * done after
 * `BATCH_MINUTES` of work at full performance, when its outputs are added
 * to the base's stocks. A batch keeps the work done on it while its Plant
 * has no power, as at Night, or is Broken.
 */
export function runPlants(state: CampaignState): void {
  for (const structure of state.structures) {
    if (!isPlant(structure) || !structure.powered) continue;
    if (structure.batch === undefined) {
      const recipe = recipeOf(structure);
      if (recipe === undefined) continue;
      for (const flow of recipe.inputs) {
        addTo(state, flow.resource, -batchKilograms(flow));
      }
      structure.batch = { recipeId: recipe.id, minutesWorked: 0 };
    }
    structure.batch.minutesWorked += structurePerformance(structure);
    if (structure.batch.minutesWorked < BATCH_MINUTES - MINUTE_TOLERANCE) {
      continue;
    }
    for (const flow of workingRecipeOf(structure)?.outputs ?? []) {
      const made = batchKilograms(flow);
      addTo(state, flow.resource, made);
      if (flow.resource.kind === "life-support") {
        recordLifeSupport(state, flow.resource.stockId, { produced: made });
      }
    }
    structure.batch = undefined;
  }
}

/**
 * How many kilograms an hour of a resource the base's Plants are making
 * now: what those that worked on a batch during the latest game-minute
 * make in an hour of their recipes, as fast as their Condition allows.
 */
export function productionPerHour(
  state: CampaignState,
  resource: ResourceRef,
): number {
  return flowPerHour(state, resource, (recipe) => recipe.outputs);
}

/**
 * How many kilograms an hour of a resource the base's Plants are using up
 * now: what those that worked on a batch during the latest game-minute
 * use in an hour of their recipes, as fast as their Condition allows.
 */
export function consumptionPerHour(
  state: CampaignState,
  resource: ResourceRef,
): number {
  return flowPerHour(state, resource, (recipe) => recipe.inputs);
}

/**
 * How many kilograms of a resource a forecast counts on, for a stock that
 * changes in a batch at a time, so that the forecast runs on smoothly
 * through each batch and never ahead of the stock. Only the Plants that
 * ran during the latest game-minute count, as their rates do. What is left
 * of the inputs one took for its batch counts with the stock, as if it used
 * them evenly; its outputs count a batch late, as they come only as the
 * batch finishes: what its batch has made so far, less a whole batch.
 */
export function kilogramsToCountOn(
  state: CampaignState,
  resource: ResourceRef,
): number {
  return state.structures.reduce(
    (sum, structure) => {
      const recipe = workingRecipeOf(structure);
      if (recipe === undefined || !structure.powered) return sum;
      // Just finished, it has no batch: the next one's is still to come.
      const done =
        structure.batch === undefined
          ? 0
          : Math.min(structure.batch.minutesWorked / BATCH_MINUTES, 1);
      const kilograms = (flows: PlantRecipe["inputs"]) =>
        flows
          .filter((flow) => isSameResource(flow.resource, resource))
          .reduce((total, flow) => total + batchKilograms(flow), 0);
      const held = structure.batch === undefined ? 0 : 1 - done;
      return (
        sum +
        kilograms(recipe.inputs) * held -
        kilograms(recipe.outputs) * (1 - done)
      );
    },
    amountOf(state, resource),
  );
}

function flowPerHour(
  state: CampaignState,
  resource: ResourceRef,
  flows: (recipe: PlantRecipe) => PlantRecipe["inputs"],
): number {
  return state.structures.reduce((sum, structure) => {
    const recipe = workingRecipeOf(structure);
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

/**
 * Whether a Plant is running, why not, and how far its batch has got, or
 * undefined for any other Structure.
 */
export function readPlant(
  state: CampaignState,
  structure: StructureState,
): PlantSnapshot | undefined {
  const recipe = recipeOf(structure);
  if (recipe === undefined) return undefined;
  const batch = readBatch(structure);
  if (structure.powered) return { running: true, stoppedFor: undefined, batch };
  return {
    running: false,
    stoppedFor: readStop(
      state,
      recipe,
      structure.plantStop ?? stopOf(structure),
    ),
    batch,
  };
}

function readBatch(structure: StructureState): PlantSnapshot["batch"] {
  const { batch } = structure;
  if (batch === undefined) return undefined;
  const performance = structurePerformance(structure);
  const left = BATCH_MINUTES - batch.minutesWorked;
  // Broken, it works at no pace: say what is left at full performance.
  const minutes = performance > 0 ? left / performance : left;
  return {
    recipeId: batch.recipeId,
    minutesLeft: Math.max(Math.ceil(minutes - MINUTE_TOLERANCE), 0),
  };
}

/** Why a Plant isn't running when nothing has said why, as just after loading a save. */
function stopOf(structure: StructureState): PlantStop {
  return isBroken(structure) ? { reason: "broken" } : { reason: "no-power" };
}

function readStop(
  state: CampaignState,
  recipe: PlantRecipe,
  stop: PlantStop,
): PlantStopSnapshot {
  if (stop.reason !== "no-input") return { ...stop };
  const flow = recipe.inputs.find((input) =>
    isSameResource(input.resource, stop.resource),
  );
  const needed = flow === undefined ? 0 : batchKilograms(flow);
  return {
    reason: "no-input",
    resource: { ...stop.resource },
    // A Plant later in the game-minute may have made enough since, for it
    // to start a batch in the next one.
    kilograms: Math.min(amountOf(state, stop.resource), needed),
    kilogramsNeeded: needed,
  };
}
