import type { ResourceRef } from "../catalogue";
import type { CampaignState } from "./campaign";
import { structurePerformance } from "./condition";
import {
  findStructureType,
  isBroken,
  type StructureState,
} from "./construction";

// The automated experiments lab (ADR-0009). It is a Plant, for its water and
// oxygen: its recipe takes them a batch at a time, keeps the reserve, and is counted
// by the forecasts, like any other's, and it starts no batch while no Research
// Task is running (see `plantCantRun`). Its power it draws as a Greenhouse does,
// as a Structure and a Night load (see `supplyPower`). What it has that no Plant
// does is here: the game-minutes it adds to the Research Task running.

/** Whether a Structure is an automated experiments lab. */
export function isExperimentsLab(
  structure: Pick<StructureState, "structureTypeId">,
): boolean {
  return (
    findStructureType(structure.structureTypeId)?.speedsResearch !== undefined
  );
}

/**
 * The game-minutes more the Research Task running advances in a game-minute,
 * from the labs that had their power, water and oxygen during it: each adds its
 * type's speed-up times its performance.
 */
export function researchSpeedUp(state: CampaignState): number {
  return state.structures.reduce((sum, structure) => {
    const speedUp = findStructureType(
      structure.structureTypeId,
    )?.speedsResearch;
    if (speedUp === undefined || !structure.powered) return sum;
    return (
      sum + speedUp.addedMinutesPerMinute * structurePerformance(structure)
    );
  }, 0);
}

/** What a lab that isn't speeding up the Research Task running lacks. */
export type ExperimentsLabShortage =
  | { readonly reason: "power" }
  | { readonly reason: "supply"; readonly resource: ResourceRef }
  | { readonly reason: "broken" }
  | { readonly reason: "switched-off" };

/** The base's automated experiments labs, as the Research Tasks screen shows them. */
export interface ExperimentsLabsSnapshot {
  /** How many are commissioned. */
  readonly labs: number;
  /** How many sped up the Research Task running during the latest game-minute. */
  readonly speedingUp: number;
  /** Those that couldn't, while a Research Task is running, and why. */
  readonly short: readonly {
    readonly structureId: string;
    readonly shortOf: ExperimentsLabShortage;
  }[];
}

export function readExperimentsLabs(
  state: CampaignState,
): ExperimentsLabsSnapshot {
  const labs = state.structures.filter(isExperimentsLab);
  const running = state.researchTask !== undefined;
  return {
    labs: labs.length,
    speedingUp: running ? labs.filter((lab) => lab.powered).length : 0,
    short: running
      ? labs.flatMap((lab) => {
          const shortOf = shortageOf(lab);
          return shortOf === undefined
            ? []
            : [{ structureId: lab.id, shortOf }];
        })
      : [],
  };
}

function shortageOf(lab: StructureState): ExperimentsLabShortage | undefined {
  if (lab.powered) return undefined;
  if (isBroken(lab)) return { reason: "broken" };
  if (lab.switchedOff && lab.batch === undefined) {
    return { reason: "switched-off" };
  }
  const stop = lab.plantStop;
  if (stop?.reason === "no-input") {
    return { reason: "supply", resource: { ...stop.resource } };
  }
  // A Research Task has just started: it says what it lacks from the next game-minute.
  if (stop?.reason === "no-research-task") return undefined;
  return { reason: "power" };
}
