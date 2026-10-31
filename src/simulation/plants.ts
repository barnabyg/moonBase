import {
  batchHoursOf,
  catalogue,
  componentOutputs,
  resourceOutputs,
  type PlantRecipe,
  type ResourceFlow,
  type ResourceRef,
  inSentence,
} from "../catalogue";
import { addBulk, bulkInStock } from "./bulk-resources";
import type { CampaignState } from "./campaign";
import { structurePerformance } from "./condition";
import {
  findStructureType,
  isBroken,
  type StructureState,
} from "./construction";
import { readLunation } from "./lunation";
import { recordLifeSupport, recordSpareComponents } from "./self-sufficiency";
import { addToStock, inStock } from "./stockpile";

/**
 * How many game-minutes of work at full performance a batch of a recipe
 * takes: a game-hour of it, unless it says longer.
 */
function batchMinutes(recipe: PlantRecipe): number {
  return batchHoursOf(recipe) * 60;
}

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
  /**
   * It was Night, and its network's battery banks held no more than
   * everything else on it needs through the Night and the reserve after it.
   */
  | { readonly reason: "night" }
  /** Its network had no power to spare for it in Daylight. */
  | { readonly reason: "no-power" }
  /**
   * The player has switched it off, and it has no batch started: it
   * starts none until it is switched on again.
   */
  | { readonly reason: "switched-off" }
  /**
   * It was switched off between batches, and the player has switched it
   * on since: it starts its next batch as soon as it can.
   */
  | { readonly reason: "switched-on" };

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

/** Whether to switch a Plant off or on. */
export type PlantSwitchSetting = "on" | "off";

export type SwitchPlantRefusal =
  "unknown-structure" | "not-a-plant" | "campaign-ended";

export type SwitchPlantResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: SwitchPlantRefusal;
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
  structure: Pick<StructureState, "structureTypeId" | "recipeId"> & {
    readonly batch: Pick<PlantBatch, "recipeId"> | undefined;
  },
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
  // Why it waited may not hold for the new recipe.
  structure.plantStop = undefined;
  return { ok: true };
}

/**
 * Switches a commissioned Plant off or on. Switched off, it starts no new
 * batch, so it takes no inputs and draws no power once any batch it has
 * started is finished, and its share of its network's spare power goes to
 * the Plants after it. Switched on, it starts its next batch as soon as it
 * can. It is a setting, so no Robot works on it. A Structure that isn't a
 * commissioned Plant is refused with the reason.
 */
export function switchPlant(
  state: CampaignState,
  structureId: string,
  setting: PlantSwitchSetting,
): SwitchPlantResult {
  const structure = state.structures.find(
    (candidate) => candidate.id === structureId,
  );
  if (structure === undefined) {
    return refuse(
      "unknown-structure",
      `There is no commissioned Structure "${structureId}".`,
    );
  }
  if (!isPlant(structure)) {
    return refuse(
      "not-a-plant",
      `The ${labelOf(structure.structureTypeId)} isn't a Plant, so it can't be switched off or on.`,
    );
  }
  structure.switchedOff = setting === "off";
  // Switched off, it says so at once (see `readPlant`), and any other
  // reason it had still holds once it is switched on again. Only being
  // switched off no longer does: until it next tries to run, it is
  // switched on, and what it will wait for, if anything, isn't known.
  if (
    !structure.switchedOff &&
    structure.plantStop?.reason === "switched-off"
  ) {
    structure.plantStop = { reason: "switched-on" };
  }
  return { ok: true };
}

function labelOf(structureTypeId: string): string {
  const label = findStructureType(structureTypeId)?.label;
  return label === undefined ? structureTypeId : inSentence(label);
}

/** A refusal of a command to a Plant, with the reason in words the player can read. */
function refuse<Reason extends SetRecipeRefusal | SwitchPlantRefusal>(
  reason: Reason,
  message: string,
): { readonly ok: false; readonly reason: Reason; readonly message: string } {
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

/** How many kilograms of a resource a batch of a recipe takes in or puts out. */
function batchKilograms(recipe: PlantRecipe, flow: ResourceFlow): number {
  return flow.kilogramsPerHour * batchHoursOf(recipe);
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
      batchKilograms(recipe, flow) - AMOUNT_TOLERANCE,
  )?.resource;
}

/**
 * Why a commissioned Plant couldn't run whatever power it had, if it
 * couldn't: it is Broken, or it has no batch started and is switched off,
 * or has too little of an input to start one, beyond what other Plants
 * have claimed this game-minute. Undefined for any other Structure.
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
  if (structure.switchedOff) return { reason: "switched-off" };
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
  const recipe = recipeOf(structure);
  if (recipe === undefined) return;
  for (const flow of recipe.inputs) {
    const key = claimKey(flow.resource);
    claims.set(key, (claims.get(key) ?? 0) + batchKilograms(recipe, flow));
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
 * done after its recipe's length of work at full performance, when its
 * outputs are added to the base's stocks, any Components among them. A batch
 * keeps the work done on it while its Plant has no power, as at Night, or is
 * Broken.
 */
export function runPlants(state: CampaignState): void {
  for (const structure of state.structures) {
    if (!isPlant(structure) || !structure.powered) continue;
    if (structure.batch === undefined) {
      const recipe = recipeOf(structure);
      if (recipe === undefined) continue;
      for (const flow of recipe.inputs) {
        addTo(state, flow.resource, -batchKilograms(recipe, flow));
      }
      structure.batch = { recipeId: recipe.id, minutesWorked: 0 };
    }
    structure.batch.minutesWorked += structurePerformance(structure);
    const working = workingRecipeOf(structure);
    if (
      working === undefined ||
      structure.batch.minutesWorked < batchMinutes(working) - MINUTE_TOLERANCE
    ) {
      continue;
    }
    for (const flow of resourceOutputs(working)) {
      const made = batchKilograms(working, flow);
      addTo(state, flow.resource, made);
      if (flow.resource.kind === "life-support") {
        recordLifeSupport(state, flow.resource.stockId, { produced: made });
      }
    }
    addToStock(state, componentOutputs(working));
    recordSpareComponents(state, {
      made: madeInABatch(working, catalogue.maintenance.spareComponentId),
    });
    structure.batch = undefined;
  }
}

/**
 * How many kilograms an hour of a resource the base's Plants are making
 * now: what those that worked on a batch during the latest game-minute,
 * and aren't switched off, make in an hour of their recipes, as fast as
 * their Condition allows.
 */
export function productionPerHour(
  state: CampaignState,
  resource: ResourceRef,
): number {
  return flowPerHour(state, resource, resourceOutputs);
}

/**
 * How many kilograms an hour of a resource the base's Plants are using up
 * now: what those that worked on a batch during the latest game-minute,
 * and aren't switched off, use in an hour of their recipes, as fast as
 * their Condition allows.
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
 * ran during the latest game-minute, and aren't switched off, count, as
 * their rates do (see `countsOnPlant`). What is left of the inputs one
 * took for its batch counts with the stock, as if it used them evenly; its
 * outputs count a batch late, as they come only as the batch finishes:
 * what its batch has made so far, less a whole batch.
 */
export function kilogramsToCountOn(
  state: CampaignState,
  resource: ResourceRef,
): number {
  return state.structures.reduce(
    (sum, structure) => {
      const recipe = workingRecipeOf(structure);
      if (!countsOnPlant(structure) || recipe === undefined) return sum;
      const done = batchDone(structure, recipe);
      const kilograms = (flows: readonly ResourceFlow[]) =>
        flows
          .filter((flow) => isSameResource(flow.resource, resource))
          .reduce((total, flow) => total + batchKilograms(recipe, flow), 0);
      const held = structure.batch === undefined ? 0 : 1 - done;
      return (
        sum +
        kilograms(recipe.inputs) * held -
        kilograms(resourceOutputs(recipe)) * (1 - done)
      );
    },
    amountOf(state, resource),
  );
}

/**
 * How much of a Plant's batch is done, from 0 to 1. Just finished, it has no
 * batch: the next one's is still to come.
 */
function batchDone(structure: StructureState, recipe: PlantRecipe): number {
  return structure.batch === undefined
    ? 0
    : Math.min(structure.batch.minutesWorked / batchMinutes(recipe), 1);
}

/**
 * How many of a Component a forecast counts on, as `kilogramsToCountOn` does
 * for a resource: what is in stock, less what the Plants counted on have yet
 * to make of their batches, which come only as each finishes. It needn't be a
 * whole number.
 */
export function componentsToCountOn(
  state: CampaignState,
  componentId: string,
): number {
  return state.structures.reduce(
    (sum, structure) => {
      const recipe = workingRecipeOf(structure);
      if (!countsOnPlant(structure) || recipe === undefined) return sum;
      return (
        sum -
        madeInABatch(recipe, componentId) * (1 - batchDone(structure, recipe))
      );
    },
    inStock(state, componentId),
  );
}

/**
 * How many of a Component an hour the base's Plants are making now, as
 * `productionPerHour` says for a resource.
 */
export function componentsPerHour(
  state: CampaignState,
  componentId: string,
): number {
  return state.structures.reduce((sum, structure) => {
    const recipe = workingRecipeOf(structure);
    if (!countsOnPlant(structure) || recipe === undefined) return sum;
    return (
      sum +
      (madeInABatch(recipe, componentId) / batchHoursOf(recipe)) *
        structurePerformance(structure)
    );
  }, 0);
}

function madeInABatch(recipe: PlantRecipe, componentId: string): number {
  return componentOutputs(recipe)
    .filter((output) => output.componentId === componentId)
    .reduce((total, output) => total + output.count, 0);
}

/**
 * Whether any of the base's Plants will make a Component in the next Daylight:
 * one set to, and neither Broken, switched off nor short of an input. Unlike
 * `isMadeByPlants`, one waiting for an input doesn't count, as how soon it
 * will get some isn't known.
 */
export function isComponentMadeByPlants(
  state: CampaignState,
  componentId: string,
): boolean {
  return state.structures.some((structure) => {
    const recipe = recipeOf(structure);
    return (
      recipe !== undefined &&
      madeInABatch(recipe, componentId) > 0 &&
      !structure.switchedOff &&
      plantCantRun(state, structure, new Map()) === undefined
    );
  });
}

/**
 * Whether the forecasts count on what a Plant makes and uses: only while
 * it runs and isn't switched off. One switched off counts as making
 * nothing even while it finishes its last batch: that batch's outputs join
 * the stocks only as it finishes, so counting none of them never runs a
 * forecast ahead of the stocks.
 */
function countsOnPlant(structure: StructureState): boolean {
  return structure.powered && !structure.switchedOff;
}

function flowPerHour(
  state: CampaignState,
  resource: ResourceRef,
  flows: (recipe: PlantRecipe) => readonly ResourceFlow[],
): number {
  return state.structures.reduce((sum, structure) => {
    const recipe = workingRecipeOf(structure);
    if (!countsOnPlant(structure) || recipe === undefined) return sum;
    const moved = flows(recipe)
      .filter((flow) => isSameResource(flow.resource, resource))
      .reduce((total, flow) => total + flow.kilogramsPerHour, 0);
    return sum + moved * structurePerformance(structure);
  }, 0);
}

/**
 * Whether any of the base's Plants makes a resource with the recipe it is
 * set to, and isn't Broken or switched off, whether or not it ran during
 * the latest game-minute.
 */
export function isMadeByPlants(
  state: CampaignState,
  resource: ResourceRef,
): boolean {
  return state.structures.some(
    (structure) =>
      !isBroken(structure) &&
      !structure.switchedOff &&
      resourceOutputs(recipeOf(structure)).some((flow) =>
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
  // Switched off between batches, it starts no other: it says so at once.
  if (
    structure.switchedOff &&
    structure.batch === undefined &&
    !isBroken(structure)
  ) {
    return { running: false, stoppedFor: { reason: "switched-off" }, batch };
  }
  if (structure.powered) return { running: true, stoppedFor: undefined, batch };
  return {
    running: false,
    stoppedFor: readStop(
      state,
      recipe,
      structure.plantStop ?? stopOf(state, structure),
    ),
    batch,
  };
}

function readBatch(structure: StructureState): PlantSnapshot["batch"] {
  const { batch } = structure;
  if (batch === undefined) return undefined;
  const performance = structurePerformance(structure);
  const recipe = workingRecipeOf(structure);
  const left =
    (recipe === undefined ? 0 : batchMinutes(recipe)) - batch.minutesWorked;
  // Broken, it works at no pace: say what is left at full performance.
  const minutes = performance > 0 ? left / performance : left;
  return {
    recipeId: batch.recipeId,
    minutesLeft: Math.max(Math.ceil(minutes - MINUTE_TOLERANCE), 0),
  };
}

/**
 * Why a Plant isn't running when nothing has said why since its recipe was
 * switched, or since an older save was loaded: from the base as it is now.
 */
function stopOf(state: CampaignState, structure: StructureState): PlantStop {
  const now = readLunation(state.elapsedMinutes, catalogue.lunation);
  return (
    plantCantRun(state, structure, new Map()) ??
    (now.part === "night" ? { reason: "night" } : { reason: "no-power" })
  );
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
  const needed = flow === undefined ? 0 : batchKilograms(recipe, flow);
  return {
    reason: "no-input",
    resource: { ...stop.resource },
    // A Plant later in the game-minute may have made enough since, for it
    // to start a batch in the next one.
    kilograms: Math.min(amountOf(state, stop.resource), needed),
    kilogramsNeeded: needed,
  };
}
