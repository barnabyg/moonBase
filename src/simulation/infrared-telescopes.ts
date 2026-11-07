import { batchHoursOf } from "../catalogue";
import type { CampaignState } from "./campaign";
import { structurePerformance } from "./condition";
import { findStructureType, type StructureState } from "./construction";
import type { GameEvent, InfraredRoundLoss } from "./events";
import { structuresInTheWay } from "./keep-clear";
import { recipeOf } from "./plants";

// The infrared telescope (ADR-0009). It is a Plant, for its propellant: its recipe
// takes it a batch at a time, never what the Lander needs for the Exports set to
// load, and is counted by the forecasts, like any other's. Its power it draws as a
// Night load, as the optical telescope does (see `supplyPower`), only at Night and
// only while no lit Structure is within its dark radius (see `plantCantRun`). What
// it has that no Plant does is here: rounds of its own survey, which a shortage
// loses, as a Greenhouse's are.

/** How close to a whole round counts as one, as below full performance it adds fractions of a game-minute. */
const MINUTE_TOLERANCE = 1e-9;

/** Whether a Structure is an infrared telescope. */
export function isInfraredTelescope(
  structure: Pick<StructureState, "structureTypeId">,
): boolean {
  return (
    findStructureType(structure.structureTypeId)?.observingRounds !== undefined
  );
}

/**
 * Runs every infrared telescope's round for a game-minute, once its Plant has
 * worked. One that observed adds its performance's share of the game-minute.
 * Once the round has its length, its Science is added to the base's, and the next
 * starts with anything observed beyond it. One short of propellant or power, with
 * a lit Structure within its dark radius, or switched off, loses what it has
 * observed. Daylight only pauses it, and a Broken one keeps it, as a Plant's batch
 * waits for its repair.
 */
export function runInfraredTelescopes(state: CampaignState): GameEvent[] {
  return state.structures.flatMap((structure): GameEvent[] => {
    const rounds = findStructureType(
      structure.structureTypeId,
    )?.observingRounds;
    if (rounds === undefined) return [];
    if (structure.powered) {
      structure.observedMinutes += structurePerformance(structure);
      const length = rounds.lengthHours * 60;
      if (structure.observedMinutes < length - MINUTE_TOLERANCE) return [];
      structure.observedMinutes = Math.max(
        structure.observedMinutes - length,
        0,
      );
      state.science += rounds.science;
      return [
        {
          kind: "infrared-round-completed",
          atMinute: state.elapsedMinutes,
          structureId: structure.id,
          structureTypeId: structure.structureTypeId,
          science: rounds.science,
        },
      ];
    }
    const reason = whyTheRoundIsLost(structure);
    if (reason === undefined) return [];
    const observed = structure.observedMinutes;
    structure.observedMinutes = 0;
    const recipe = recipeOf(structure);
    return observed <= (recipe === undefined ? 0 : batchHoursOf(recipe) * 60)
      ? []
      : [
          {
            kind: "infrared-round-lost",
            atMinute: state.elapsedMinutes,
            structureId: structure.id,
            structureTypeId: structure.structureTypeId,
            reason,
          },
        ];
  });
}

/** What an infrared telescope that didn't observe this game-minute lost its round to, if it did. */
function whyTheRoundIsLost(
  structure: StructureState,
): InfraredRoundLoss | undefined {
  switch (structure.plantStop?.reason) {
    case "no-input":
      return "propellant";
    case "no-power":
    case "night":
      return "power";
    case "too-close":
      return "light";
    case "switched-off":
      return "switched-off";
    default:
      return undefined;
  }
}

/** Why an infrared telescope didn't observe during the latest game-minute. */
export type InfraredStop =
  "daylight" | "light" | "propellant" | "power" | "switched-off" | "broken";

/** An infrared telescope, as the player sees it. */
export interface InfraredTelescopeSnapshot {
  readonly structureId: string;
  /** Whether it observed during the latest game-minute. */
  readonly observing: boolean;
  /** How much of its current round is done, from 0 to 1. */
  readonly progress: number;
  /**
   * Game-minutes of observing at its performance until its round is complete;
   * undefined once it is Broken.
   */
  readonly minutesLeft: number | undefined;
  /** Why it didn't observe during the latest game-minute; undefined while it did. */
  readonly stoppedFor: InfraredStop | undefined;
  /** The ids of the lit Structures within its dark radius, which stop it observing. */
  readonly inTheWay: readonly string[];
}

export function readInfraredTelescopes(
  state: CampaignState,
): InfraredTelescopeSnapshot[] {
  return state.structures.flatMap((structure) => {
    const rounds = findStructureType(
      structure.structureTypeId,
    )?.observingRounds;
    if (rounds === undefined) return [];
    const length = rounds.lengthHours * 60;
    const performance = structurePerformance(structure);
    const left = Math.max(length - structure.observedMinutes, 0);
    return [
      {
        structureId: structure.id,
        observing: structure.powered,
        progress: Math.min(structure.observedMinutes / length, 1),
        minutesLeft:
          performance === 0
            ? undefined
            : Math.ceil(left / performance - MINUTE_TOLERANCE),
        stoppedFor: structure.powered ? undefined : stopOf(structure),
        inTheWay: structuresInTheWay(
          structure.structureTypeId,
          structure.position,
          state.structures,
          structure.id,
        ).map((other) => other.id),
      },
    ];
  });
}

function stopOf(structure: StructureState): InfraredStop {
  switch (structure.plantStop?.reason) {
    case "broken":
      return "broken";
    case "daylight":
      return "daylight";
    case "too-close":
      return "light";
    case "no-input":
      return "propellant";
    case "switched-off":
      return "switched-off";
    default:
      return "power";
  }
}
