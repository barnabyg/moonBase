import { catalogue, type PerformanceCurve } from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  findStructureType,
  isBroken,
  type StructureState,
} from "./construction";
import type { GameEvent } from "./events";
import { usesPower } from "./power";

/**
 * How well something works at a Condition, from 1 down to 0: fully at or
 * above the curve's threshold, falling along the curve below it, and not at
 * all once Broken.
 */
export function performanceAt(
  curve: PerformanceCurve,
  conditionPercent: number,
): number {
  if (conditionPercent <= 0) return 0;
  if (conditionPercent >= curve.thresholdPercent) return 1;
  return (conditionPercent / curve.thresholdPercent) ** curve.exponent;
}

/**
 * How well a Structure does its job, from 1 down to 0 once it is Broken. A
 * solar array's generation, a battery bank's storage capacity, a Light
 * Mast's light, a Plant's rate and how fast a telescope observes fall
 * along the data catalogue's curve;
 * anything else, such as a Habitat or Regolith shielding, works fully
 * until it is Broken.
 */
export function structurePerformance(
  structure: Pick<StructureState, "structureTypeId" | "conditionPercent">,
): number {
  if (isBroken(structure)) return 0;
  const type = findStructureType(structure.structureTypeId);
  const partial =
    type !== undefined &&
    (type.power.generationKilowatts > 0 ||
      type.power.storageKilowattHours > 0 ||
      type.lightRadiusMetres > 0 ||
      type.recipes !== undefined ||
      type.telescope === true);

  return partial
    ? performanceAt(catalogue.structurePerformance, structure.conditionPercent)
    : 1;
}

/**
 * Whether a commissioned Structure operated during the latest game-minute:
 * it isn't Broken and, if it has anything to do with power, it had power.
 * One with nothing to do with power, such as Regolith shielding, always
 * operates.
 */
export function isOperating(structure: StructureState): boolean {
  return (
    !isBroken(structure) &&
    (!usesPower(structure.structureTypeId) || structure.powered)
  );
}

/**
 * Wears down by Dust every commissioned Structure that operated during the
 * latest game-minute it was supplied power for, at its type's rate in the
 * data catalogue, and returns an event for each one it left Broken. It
 * comes first in a game-minute, so a Structure maintained back to 100%
 * ends the game-minute at 100%.
 */
export function wearStructures(state: CampaignState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const structure of state.structures) {
    const rate =
      findStructureType(structure.structureTypeId)?.dustWearPercentPerHour ?? 0;
    if (rate === 0 || !isOperating(structure)) continue;
    structure.conditionPercent = Math.max(
      structure.conditionPercent - rate / 60,
      0,
    );
    if (isBroken(structure)) {
      events.push({
        kind: "structure-broken",
        atMinute: state.elapsedMinutes,
        structureId: structure.id,
        structureTypeId: structure.structureTypeId,
      });
    }
  }
  return events;
}
