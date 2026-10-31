import {
  batchHoursOf,
  catalogue,
  componentOutputs,
  resourceOutputs,
  type ResourceFlow,
} from "../catalogue";
import {
  recipeOf,
  workingRecipeOf,
  type MaintenanceSnapshot,
  type PlantSnapshot,
  type Snapshot,
  type StructureSnapshot,
} from "../simulation";
import { maintenanceState } from "./base-panel-text";
import { formatComponentsMade, formatHours } from "./describe";
import { formatPerformance, formatShortDuration, listInWords } from "./format";
import { resourceRefLabel } from "./labels";
import type { Stat } from "./stat";

// What state a commissioned Structure is in, in words, for the Base panel's
// entry for it and the pop-up shown when it is clicked on the map.

/** Whether a Structure is to be dismantled, or is being. */
export function isToBeDismantled(
  snapshot: Pick<Snapshot, "dismantlings">,
  structureId: string,
): boolean {
  return snapshot.dismantlings.some(
    (dismantling) => dismantling.id === structureId,
  );
}

/** Whether the Mission Director lives in a Structure. */
export function isHome(
  snapshot: Pick<Snapshot, "missionDirector">,
  structureId: string,
): boolean {
  return (
    snapshot.missionDirector.residence === "habitat" &&
    snapshot.missionDirector.habitatId === structureId
  );
}

/** The Maintenance Work Order for a Structure, awaiting the Robot or under way, if there is one. */
export function maintenanceOf(
  snapshot: Pick<Snapshot, "maintenance">,
  structureId: string,
): MaintenanceSnapshot | undefined {
  return snapshot.maintenance.find(
    ({ target }) =>
      target.kind === "structure" && target.structureId === structureId,
  );
}

/** Whether a type of Structure is a telescope, which observes at Night for the observing programme. */
export function isTelescope(structureTypeId: string): boolean {
  return (
    catalogue.structureTypes.find((type) => type.id === structureTypeId)
      ?.telescope === true
  );
}

/** Whether a type of Structure is a Habitat, which the Mission Director can live in. */
export function isHabitat(structureTypeId: string): boolean {
  return (
    catalogue.structureTypes.find((type) => type.id === structureTypeId)
      ?.habitat === true
  );
}

/**
 * What state a Structure is in, in a few words: to be dismantled, Broken,
 * what a Plant is doing, or else whether it has power.
 */
export function structureStatus(
  structure: StructureSnapshot,
  toBeDismantled: boolean,
): string {
  if (toBeDismantled) return "to be dismantled";
  if (structure.conditionPercent <= 0) return "Broken";
  if (structure.plant === undefined) {
    return structure.powered ? "commissioned" : "no power";
  }
  return formatPlant(structure.plant, structure.switchedOff) ?? "commissioned";
}

/**
 * Anything out of the ordinary about a commissioned Structure, each in a
 * few words, or undefined where there is nothing to say.
 */
export interface StructureNotes {
  /** What a running Plant makes and uses an hour. */
  readonly plantRates: string | undefined;
  /** Whether a telescope is observing. */
  readonly observing: string | undefined;
  /** Whether its light is on, or its Night load off to save power. */
  readonly light: string | undefined;
  /** Whether a Habitat is shielded. */
  readonly shielding: string | undefined;
  readonly waterWall: string | undefined;
  /** Whether the Mission Director lives in it. */
  readonly home: string | undefined;
  /** How well it works, if its Condition has cut its output. */
  readonly performance: string | undefined;
  readonly dustCoating: string | undefined;
  /** Whether it is awaiting or undergoing Maintenance. */
  readonly maintenance: string | undefined;
}

export function structureNotes(
  snapshot: Snapshot,
  structure: StructureSnapshot,
): StructureNotes {
  return {
    plantRates: formatPlantRates(structure),
    observing: structure.observing ? "observing" : undefined,
    light: structure.lit
      ? "lit"
      : structure.savingPower
        ? isTelescope(structure.structureTypeId)
          ? "not observing, to save power"
          : "light off to save power"
        : undefined,
    shielding: isHabitat(structure.structureTypeId)
      ? structure.shielded
        ? "shielded"
        : "unshielded"
      : undefined,
    waterWall: structure.waterWalled ? "water-walled" : undefined,
    home: isHome(snapshot, structure.id)
      ? "the Mission Director's home"
      : undefined,
    performance: formatPerformance(structure.performance),
    dustCoating: formatDustCoating(structure),
    maintenance: maintenanceState(maintenanceOf(snapshot, structure.id)),
  };
}

/**
 * What the Base panel's entry for a Structure says of it: its status, and
 * as notes anything out of the
 * ordinary, such as being Broken, a Plant's running and what it makes and
 * uses, a telescope observing, the Mission Director living in it or its
 * Dust coating, or that it is commissioned if nothing else.
 */
export function describeStructureEntry(
  snapshot: Snapshot,
  structure: StructureSnapshot,
  toBeDismantled: boolean,
): Stat {
  const state = structureStatus(structure, toBeDismantled);
  const {
    plantRates,
    observing,
    light,
    shielding,
    waterWall,
    home,
    performance,
    dustCoating,
    maintenance,
  } = structureNotes(snapshot, structure);
  const notes = [
    plantRates,
    observing,
    light,
    shielding,
    waterWall,
    home,
    performance,
    dustCoating,
    maintenance,
  ].filter((note) => note !== undefined);
  return notes.length === 0
    ? { value: state }
    : { value: state, note: notes.join(", ") };
}

/**
 * Says what a running Plant makes and uses an hour, as fast as its
 * Condition allows, for example "making 0.3 kg of wafers an hour from
 * 0.35 kg of silicon", or, for one that makes Components, what a batch
 * does, for example "making 1 spare Component every 24 hours from 3.6 kg of
 * metals", and the recipe it switches to from its next batch if it was
 * switched during this one and will start another; undefined for one that
 * isn't running.
 */
export function formatPlantRates(
  structure: Pick<
    StructureSnapshot,
    "structureTypeId" | "recipeId" | "performance" | "plant" | "switchedOff"
  >,
): string | undefined {
  const { plant } = structure;
  if (plant?.running !== true) return undefined;
  const chosen = recipeOf(structure);
  // A batch it has started goes on with the recipe it was started with.
  const recipe = workingRecipeOf({ ...structure, batch: plant.batch });
  if (recipe === undefined) return undefined;
  const flows = (resources: readonly ResourceFlow[], rate: number) =>
    listInWords(
      resources.map(
        (flow) =>
          `${plantKilograms(flow.kilogramsPerHour * rate)} kg of ${resourceRefLabel(flow.resource).toLowerCase()}`,
      ),
    );
  const next =
    chosen === undefined || chosen === recipe || structure.switchedOff
      ? ""
      : `; ${chosen.label} from the next batch`;
  const components = componentOutputs(recipe);
  if (components.length > 0) {
    const hours = batchHoursOf(recipe);
    // As fast as its Condition allows, a batch still takes the same inputs.
    const every = formatHours(Math.ceil(hours / structure.performance));
    return `making ${formatComponentsMade(components)} every ${every} from ${flows(recipe.inputs, hours)}${next}`;
  }
  const { performance } = structure;
  return `making ${flows(resourceOutputs(recipe), performance)} an hour from ${flows(recipe.inputs, performance)}${next}`;
}

/** Kilograms a Plant takes in or puts out, to the hundredth of one, for example "0.35". */
function plantKilograms(kilograms: number): string {
  return String(Number(kilograms.toFixed(2)));
}

/**
 * Says whether a Plant is running, why not, and how much of its batch is
 * left, for its line in the status panel, for example "running, 40 min
 * left of this batch", "waiting for Silicon: 0.12 of 0.35 kg" or "switched
 * off"; undefined once it is Broken, which the line says already. Given
 * that it is switched off, a batch it has started is its last.
 */
export function formatPlant(
  plant: PlantSnapshot,
  switchedOff = false,
): string | undefined {
  const batch = switchedOff
    ? "its last batch before switching off"
    : "this batch";
  const left =
    plant.batch === undefined
      ? ""
      : `, ${formatBatchLeft(plant.batch.minutesLeft)} left of ${batch}`;
  const stop = plant.stoppedFor;
  switch (stop?.reason) {
    case undefined:
      return `running${left}`;
    case "broken":
      return undefined;
    case "no-input":
      return `waiting for ${resourceRefLabel(stop.resource)}: ${plantKilograms(stop.kilograms)} of ${plantKilograms(stop.kilogramsNeeded)} kg`;
    case "night":
      return `idle at Night: no stored power to spare${left}`;
    case "no-power":
      return `waiting for power to spare${left}`;
    case "switched-off":
      return "switched off";
    case "switched-on":
      return "switched on: starts a batch as soon as it can";
  }
}

/** How long a batch has left: in minutes up to an hour, as most batches are, and otherwise in hours. */
function formatBatchLeft(minutes: number): string {
  return minutes <= 60 ? `${minutes} min` : formatShortDuration(minutes);
}

/** Says how thickly Dust coats a solar array, for example "Dust coating 12%"; undefined for anything else. */
export function formatDustCoating(
  structure: Pick<StructureSnapshot, "structureTypeId" | "dustCoatingPercent">,
): string | undefined {
  const generates =
    (catalogue.structureTypes.find(
      (type) => type.id === structure.structureTypeId,
    )?.power.generationKilowatts ?? 0) > 0;
  return generates
    ? `Dust coating ${Math.round(structure.dustCoatingPercent)}%`
    : undefined;
}
