import { catalogue } from "../catalogue";
import type {
  MaintenanceSnapshot,
  Snapshot,
  StructureSnapshot,
} from "../simulation";
import {
  formatDustCoating,
  formatPerformance,
  formatPlant,
  formatPlantRates,
  maintenanceState,
  type Stat,
} from "./format";

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
