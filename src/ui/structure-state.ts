import {
  batchHoursOf,
  catalogue,
  componentOutputs,
  resourceOutputs,
  type GrowingRounds,
  type ResourceFlow,
  type ResourceRef,
} from "../catalogue";
import {
  isExperimentsLab,
  isInfraredTelescope,
  isGreenhouse,
  recipeOf,
  workingRecipeOf,
  type MaintenanceSnapshot,
  type PlantSnapshot,
  type RadioArraySnapshot,
  type Snapshot,
  type StructureSnapshot,
} from "../simulation";
import { maintenanceState } from "./base-panel-text";
import { formatComponentsMade, formatHours } from "./describe";
import {
  formatKilogramAmount,
  formatPerformance,
  formatScience,
  formatShortDuration,
  listInWords,
  plural,
} from "./format";
import { formatKeptClearOf } from "./keep-clear-text";
import { inSentence, resourceRefLabel } from "./labels";
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
 * what a Plant or a radio telescope array is doing, or else whether it has
 * power. A radio telescope array is found among the given ones.
 */
export function structureStatus(
  structure: StructureSnapshot,
  toBeDismantled: boolean,
  radioArrays: readonly RadioArraySnapshot[] = [],
): string {
  if (toBeDismantled) return "to be dismantled";
  if (structure.conditionPercent <= 0) return "Broken";
  if (structure.plant === undefined) {
    const array = radioArrays.find(
      ({ structureId }) => structureId === structure.id,
    );
    if (array !== undefined) return formatRadioArray(structure, array);
    return structure.powered ? "commissioned" : "no power";
  }
  if (isGreenhouse(structure)) return formatGreenhouse(structure);
  if (isInfraredTelescope(structure)) return formatInfraredTelescope(structure);
  if (
    isExperimentsLab(structure) &&
    structure.plant.running &&
    !structure.switchedOff
  ) {
    return "speeding up the Research Task running";
  }
  return formatPlant(structure.plant, structure.switchedOff) ?? "commissioned";
}

/** The rounds of growing a type of Structure has, if it is a Greenhouse. */
export function growingRoundsOf(
  structureTypeId: string,
): GrowingRounds | undefined {
  return catalogue.structureTypes.find((type) => type.id === structureTypeId)
    ?.growing;
}

/**
 * Says what a Greenhouse is doing, for example "growing, 2d 4h left of this
 * round", or why it isn't. Its batches of water are its own business: it is the
 * round that the player has at stake.
 */
export function formatGreenhouse(
  structure: Pick<
    StructureSnapshot,
    | "structureTypeId"
    | "plant"
    | "growingMinutes"
    | "performance"
    | "switchedOff"
  >,
): string {
  const { plant } = structure;
  if (plant?.running === true) {
    if (structure.switchedOff) return "growing to the end of its last batch";
    const rounds = growingRoundsOf(structure.structureTypeId);
    const left =
      ((rounds?.lengthHours ?? 0) * 60 - structure.growingMinutes) /
      structure.performance;
    return `growing, ${formatShortDuration(Math.max(Math.ceil(left), 0))} left of this round`;
  }
  const stop = plant?.stoppedFor?.reason;
  if (stop === "no-power" || stop === "night") {
    return "no power: starts a new round once it has some";
  }
  return plant === undefined
    ? "commissioned"
    : (formatPlant(plant, structure.switchedOff) ?? "commissioned");
}

/**
 * Says what an infrared telescope is doing, for example "observing, 1d 8h left of
 * this round", or why it isn't. Its batches of propellant are its own business: it
 * is the round that the player has at stake.
 */
export function formatInfraredTelescope(
  structure: Pick<
    StructureSnapshot,
    | "structureTypeId"
    | "plant"
    | "observedMinutes"
    | "performance"
    | "switchedOff"
  >,
): string {
  const { plant } = structure;
  const rounds = catalogue.structureTypes.find(
    (type) => type.id === structure.structureTypeId,
  )?.observingRounds;
  const left = Math.max(
    Math.ceil(
      ((rounds?.lengthHours ?? 0) * 60 - structure.observedMinutes) /
        structure.performance,
    ),
    0,
  );
  if (plant?.running === true) {
    if (structure.switchedOff) return "observing to the end of its last batch";
    return `observing, ${formatShortDuration(left)} left of this round`;
  }
  switch (plant?.stoppedFor?.reason) {
    case "daylight":
      return structure.observedMinutes > 0
        ? `waiting for Night, ${formatShortDuration(left)} left of this round`
        : "waiting for Night";
    case "too-close":
      return `can't observe: ${formatKeptClearOf(structure.structureTypeId) ?? "something is too near"}`;
    case "no-power":
    case "night":
      return "no power: starts a new round once it has some";
    default:
      return plant === undefined
        ? "commissioned"
        : (formatPlant(plant, structure.switchedOff) ?? "commissioned");
  }
}

/**
 * Says what a radio telescope array is doing, for example "working, 18h left of
 * this round", or why it isn't, for example "can't work: a Plant is within its
 * quiet radius".
 */
export function formatRadioArray(
  structure: Pick<StructureSnapshot, "structureTypeId">,
  array: Pick<RadioArraySnapshot, "stoppedFor" | "minutesLeft">,
): string {
  switch (array.stoppedFor) {
    case undefined:
      return array.minutesLeft === undefined
        ? "working"
        : `working, ${formatShortDuration(array.minutesLeft)} left of this round`;
    case "plant":
      return `can't work: ${formatKeptClearOf(structure.structureTypeId) ?? "something is too near"}`;
    case "power":
      return "no power: starts a new round once it has some";
    case "broken":
      return "Broken";
  }
}

/**
 * How many antenna fields a radio telescope array has, how many of them add
 * nothing, and what it earns with them, for example "1 antenna field, about 89
 * Science a Lunation" or "3 antenna fields, 1 adding nothing, about 177 Science a
 * Lunation".
 */
export function formatAntennaFields(
  array: Pick<
    RadioArraySnapshot,
    "antennaFields" | "antennaFieldsAddingNothing" | "sciencePerLunation"
  >,
): string {
  const idle =
    array.antennaFieldsAddingNothing > 0
      ? `, ${array.antennaFieldsAddingNothing} adding nothing`
      : "";
  return `${plural(array.antennaFields, "antenna field")}${idle}, about ${formatScience(Math.round(array.sciencePerLunation))} a Lunation`;
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
  /** A radio telescope array's antenna fields and what it earns with them. */
  readonly antennaFields: string | undefined;
  /** What a storage tank holds and draws. */
  readonly tank: string | undefined;
  /** Whether its light is on, or its Night load off to save power. */
  readonly light: string | undefined;
  /** Whether a Habitat is buried, shielded or neither. */
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
    antennaFields: radioArrayNote(snapshot, structure),
    tank: formatTank(structure, snapshot.lunation.part === "night"),
    light: structure.lit
      ? "lit"
      : structure.savingPower
        ? isTelescope(structure.structureTypeId)
          ? "not observing, to save power"
          : "light off to save power"
        : undefined,
    shielding: isHabitat(structure.structureTypeId)
      ? structure.buried
        ? "buried"
        : structure.shielded
          ? "shielded"
          : "unshielded"
      : undefined,
    waterWall: structure.waterWalled
      ? structure.buried
        ? "with a vault cistern"
        : "water-walled"
      : undefined,
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
  const state = structureStatus(
    structure,
    toBeDismantled,
    snapshot.radioArrays,
  );
  const {
    plantRates,
    observing,
    antennaFields,
    tank,
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
    antennaFields,
    tank,
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
 * Says what a storage tank holds of the stock, out of what it adds to the limit,
 * and what it draws to keep it, for example "holds 150 of 300 kg of oxygen, draws
 * 0.15 kW at Night", or that it is losing it for want of power; undefined for
 * anything else, and for a Broken one, which holds nothing and draws nothing.
 */
export function formatTank(
  structure: Pick<
    StructureSnapshot,
    "structureTypeId" | "tank" | "conditionPercent"
  >,
  night: boolean,
): string | undefined {
  const { tank } = structure;
  if (tank === undefined || structure.conditionPercent <= 0) return undefined;
  const stock = inSentence(resourceRefLabel(tank.resource));
  if (tank.losing) return `no power: losing ${stock}`;
  const kilowatts =
    catalogue.structureTypes.find(({ id }) => id === structure.structureTypeId)
      ?.power.nightUpkeepKilowatts ?? 0;
  const holds = `holds ${formatKilogramAmount(tank.heldKilograms)} of ${tank.addsKilograms} kg of ${stock}`;
  if (kilowatts === 0) return holds;
  return `${holds}, ${night ? `drawing ${kilowatts} kW` : `draws ${kilowatts} kW at Night`}`;
}

/**
 * Says what a running Plant makes and uses an hour, as fast as its
 * Condition allows, for example "making 0.3 kg of wafers an hour from
 * 0.35 kg of silicon", or, for one that makes Components, what a batch
 * does, for example "making 1 spare Component every 24 hours from 3.6 kg of
 * metals", and the recipe it switches to from its next batch if it was
 * switched during this one and will start another; undefined for one that
 * isn't running, or is running on and off.
 */
export function formatPlantRates(
  structure: Pick<
    StructureSnapshot,
    "structureTypeId" | "recipeId" | "performance" | "plant" | "switchedOff"
  >,
): string | undefined {
  const { plant } = structure;
  // Running a game-minute at a time, it makes and uses nothing like its rates.
  if (plant?.running !== true || plant.runningOnAndOff === true) {
    return undefined;
  }
  const chosen = recipeOf(structure);
  // A batch it has started goes on with the recipe it was started with.
  const recipe = workingRecipeOf({ ...structure, batch: plant.batch });
  if (recipe === undefined) return undefined;
  const flows = (resources: readonly ResourceFlow[], rate: number) =>
    listInWords(
      resources.map(
        (flow) =>
          `${plantKilograms(flow.kilogramsPerHour * rate)} kg of ${inSentence(resourceRefLabel(flow.resource))}`,
      ),
    );
  const next =
    chosen === undefined || chosen === recipe || structure.switchedOff
      ? ""
      : `; ${chosen.label} from the next batch`;
  const rounds = growingRoundsOf(structure.structureTypeId);
  if (rounds !== undefined) {
    return `using ${flows(recipe.inputs, structure.performance)} an hour, for ${formatScience(rounds.science)} a round`;
  }
  if (isExperimentsLab(structure)) {
    return `using ${flows(recipe.inputs, structure.performance)} an hour`;
  }
  const observing = catalogue.structureTypes.find(
    (type) => type.id === structure.structureTypeId,
  )?.observingRounds;
  if (observing !== undefined) {
    return `boiling off ${flows(recipe.inputs, structure.performance)} an hour, for ${formatScience(observing.science)} a round`;
  }
  const components = componentOutputs(recipe);
  if (components.length > 0) {
    const hours = batchHoursOf(recipe);
    // As fast as its Condition allows, a batch still takes the same inputs.
    const every = formatHours(Math.ceil(hours / structure.performance));
    return `making ${formatComponentsMade(components)} every ${every} from ${flows(recipe.inputs, hours)}${next}`;
  }
  const { performance } = structure;
  const from =
    recipe.inputs.length === 0
      ? "the ground"
      : flows(recipe.inputs, performance);
  return `making ${flows(resourceOutputs(recipe), performance)} an hour from ${from}${next}`;
}

/** Kilograms a Plant takes in or puts out, to the hundredth of one, for example "0.35". */
function plantKilograms(kilograms: number): string {
  return String(Number(kilograms.toFixed(2)));
}

/**
 * Says whether a Plant is running, why not, and how much of its batch is
 * left, for its line in the status panel, for example "running, 40 min
 * left of this batch", "waiting for Silicon: 0.12 of 0.35 kg", "waiting for
 * Water: 49.5 of 50 kg, to leave the Mission Director's reserve of 49 kg",
 * "waiting for tank space: Water is 399.5 of 400 kg", "running on and off:
 * little stored power to spare" or "switched off"; undefined once it is Broken, which the line says already. Given
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
  if (plant.runningOnAndOff === true) {
    return `running on and off: little stored power to spare${left}`;
  }
  const stop = plant.stoppedFor;
  switch (stop?.reason) {
    case undefined:
      return `running${left}`;
    case "broken":
      return undefined;
    case "no-input":
      return `waiting for ${resourceRefLabel(stop.resource)}: ${plantKilograms(stop.kilograms)} of ${plantKilograms(stop.kilogramsNeeded)} kg`;
    case "reserve":
      return `waiting for ${resourceRefLabel(stop.resource)}: ${plantKilograms(stop.kilograms)} of ${plantKilograms(stop.kilogramsNeeded)} kg, to leave the Mission Director's reserve of ${plantKilograms(stop.reserveKilograms)} kg`;
    case "output-full":
      return `waiting for ${isDug(stop.resource) ? "room to store it" : "tank space"}: ${resourceRefLabel(stop.resource)} is ${stop.kilograms.toFixed(1)} of ${plantKilograms(stop.limitKilograms)} kg`;
    case "night":
      return `idle at Night: no stored power to spare${left}`;
    case "no-power":
      return `waiting for power to spare${left}`;
    case "switched-off":
      return "switched off";
    case "switched-on":
      return "switched on: starts a batch as soon as it can";
    case "no-research-task":
      return "idle: no Research Task running to speed up";
    case "daylight":
      return `idle in Daylight: works only at Night${left}`;
    case "too-close":
      return "idle: too near a Structure it must be kept clear of";
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

/** Whether a resource is the one the data catalogue has dug, which is heaped and binned rather than kept in tanks. */
function isDug(resource: ResourceRef): boolean {
  return (
    resource.kind === "bulk-resource" &&
    resource.resourceId === catalogue.digging.resourceId
  );
}

/** What the Base panel notes of a radio telescope array's antenna fields, if it is one. */
function radioArrayNote(
  snapshot: Pick<Snapshot, "radioArrays">,
  structure: Pick<StructureSnapshot, "id">,
): string | undefined {
  const array = snapshot.radioArrays.find(
    ({ structureId }) => structureId === structure.id,
  );
  return array === undefined ? undefined : formatAntennaFields(array);
}
