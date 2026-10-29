import { catalogue } from "../catalogue";
import type { Snapshot, StructureSnapshot } from "../simulation";
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

export function isTelescope(structureTypeId: string): boolean {
  return (
    catalogue.structureTypes.find((type) => type.id === structureTypeId)
      ?.telescope === true
  );
}

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
export function structureState(
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
 * What state a Structure is in, for its entry: anything out of the
 * ordinary, such as being Broken, a Plant's running and what it makes and
 * uses, a telescope observing, the Mission Director living in it or its
 * Dust coating, or that it is commissioned if nothing else.
 */
export function describeStructureState(
  snapshot: Snapshot,
  structure: StructureSnapshot,
  toBeDismantled: boolean,
): Stat {
  const maintenance = snapshot.maintenance.find(
    ({ target }) =>
      target.kind === "structure" && target.structureId === structure.id,
  );
  const state = structureState(structure, toBeDismantled);
  const notes = [
    formatPlantRates(structure),
    structure.observing ? "observing" : undefined,
    structure.lit
      ? "lit"
      : structure.savingPower
        ? isTelescope(structure.structureTypeId)
          ? "not observing, to save power"
          : "light off to save power"
        : undefined,
    isHabitat(structure.structureTypeId)
      ? structure.shielded
        ? "shielded"
        : "unshielded"
      : undefined,
    structure.waterWalled ? "water-walled" : undefined,
    isHome(snapshot, structure.id) ? "the Mission Director's home" : undefined,
    formatPerformance(structure.performance),
    formatDustCoating(structure),
    maintenanceState(maintenance),
  ].filter((note) => note !== undefined);
  return notes.length === 0
    ? { value: state }
    : { value: state, note: notes.join(", ") };
}
