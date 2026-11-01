import { batchHoursOf } from "../catalogue";
import type { CampaignState } from "./campaign";
import { structurePerformance } from "./condition";
import { findStructureType, type StructureState } from "./construction";
import type { GameEvent, GreenhouseRoundLoss } from "./events";
import { recipeOf } from "./plants";

// A Greenhouse's rounds of growing. It is a Plant, for its water: its recipe takes
// it a batch at a time, keeps the reserve, and is counted by the forecasts, like
// any other's. Its power it draws as a Structure does, by day and at Night, rather
// than on what is left over (see `supplyPower`). What it has that no Plant does is
// here: a round that a shortage loses.

/** How close to a whole round counts as one, as below full performance it adds fractions of a game-minute. */
const MINUTE_TOLERANCE = 1e-9;

/** Whether a Structure is a Greenhouse. */
export function isGreenhouse(
  structure: Pick<StructureState, "structureTypeId">,
): boolean {
  return findStructureType(structure.structureTypeId)?.growing !== undefined;
}

/**
 * Whether a Greenhouse is switched off and has finished its last batch, so that
 * it draws no power.
 */
export function isGreenhouseIdle(
  structure: Pick<StructureState, "structureTypeId" | "switchedOff" | "batch">,
): boolean {
  return (
    isGreenhouse(structure) &&
    structure.switchedOff &&
    structure.batch === undefined
  );
}

/**
 * Runs every Greenhouse's round for a game-minute, once its Plant has worked. One
 * that had its water and power adds its performance's share of the game-minute.
 * Once the round has its length, its Science is added to the base's, and the next
 * starts with anything grown beyond it. One short of either, or switched off, loses
 * what it has grown. A Broken one keeps it, as a Plant's batch waits for its repair.
 */
export function runGreenhouses(state: CampaignState): GameEvent[] {
  return state.structures.flatMap((structure): GameEvent[] => {
    const growing = findStructureType(structure.structureTypeId)?.growing;
    if (growing === undefined) return [];
    if (structure.powered) {
      structure.growingMinutes += structurePerformance(structure);
      const length = growing.lengthHours * 60;
      if (structure.growingMinutes < length - MINUTE_TOLERANCE) return [];
      structure.growingMinutes = Math.max(structure.growingMinutes - length, 0);
      state.science += growing.science;
      return [
        {
          kind: "greenhouse-round-completed",
          atMinute: state.elapsedMinutes,
          structureId: structure.id,
          structureTypeId: structure.structureTypeId,
          science: growing.science,
        },
      ];
    }
    const reason = whyTheRoundIsLost(structure);
    if (reason === undefined) return [];
    const grown = structure.growingMinutes;
    structure.growingMinutes = 0;
    const recipe = recipeOf(structure);
    return grown <= (recipe === undefined ? 0 : batchHoursOf(recipe) * 60)
      ? []
      : [
          {
            kind: "greenhouse-round-lost",
            atMinute: state.elapsedMinutes,
            structureId: structure.id,
            structureTypeId: structure.structureTypeId,
            reason,
          },
        ];
  });
}

/** What a Greenhouse that didn't grow this game-minute lost its round to, if it did. */
function whyTheRoundIsLost(
  structure: StructureState,
): GreenhouseRoundLoss | undefined {
  switch (structure.plantStop?.reason) {
    case "no-input":
      return "water";
    case "no-power":
    case "night":
      return "power";
    case "switched-off":
      return "switched-off";
    default:
      return undefined;
  }
}
