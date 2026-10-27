import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  findStructureType,
  hazardShare,
  type StructureState,
} from "./construction";

/** Whether Dust coats a type of Structure: only solar arrays, those that generate power. */
export function isCoatedByDust(structureTypeId: string): boolean {
  return (
    (findStructureType(structureTypeId)?.power.generationKilowatts ?? 0) > 0
  );
}

/**
 * Lets Dust settle on every solar array during a game-minute of Daylight,
 * at the data catalogue's rate times its type's share of Dust coating, up
 * to a full coating; none settles at Night.
 */
export function coatSolarArrays(state: CampaignState, daylight: boolean): void {
  if (!daylight) return;
  const perMinute = catalogue.dustCoating.percentPerDaylightHour / 60;
  for (const structure of state.structures) {
    if (!isCoatedByDust(structure.structureTypeId)) continue;
    structure.dustCoatingPercent = Math.min(
      structure.dustCoatingPercent +
        perMinute * hazardShare(structure.structureTypeId, "dustCoating"),
      100,
    );
  }
}

/**
 * The share of its output a solar array keeps under its Dust coating, from
 * 1 when clean: a full coating takes away the data catalogue's share, and a
 * partial one its part of that.
 */
export function outputUnderCoating(
  structure: Pick<StructureState, "dustCoatingPercent">,
): number {
  return (
    1 -
    (catalogue.dustCoating.outputLossAtFullCoating *
      structure.dustCoatingPercent) /
      100
  );
}

/** Whether a solar array's Dust coating has passed the threshold for cleaning. */
export function isDueForCleaning(
  structure: Pick<StructureState, "structureTypeId" | "dustCoatingPercent">,
): boolean {
  return (
    isCoatedByDust(structure.structureTypeId) &&
    structure.dustCoatingPercent >
      catalogue.dustCoating.cleaningThresholdPercent
  );
}
