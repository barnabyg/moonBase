import {
  catalogue,
  type Milestone,
  type MilestoneCondition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import { findStructureType, isShielded } from "./construction";
import type { GameEvent } from "./events";
import { readSelfSufficiency } from "./self-sufficiency";

/** Which Milestones are reached, and which to aim for now and next. */
export interface MilestonesSnapshot {
  /** The ids of the Milestones reached, in the order they were. */
  readonly reachedIds: readonly string[];
  /**
   * The earliest Milestone in catalogue order that isn't reached yet, or
   * undefined once every one is.
   */
  readonly currentId: string | undefined;
  /** The one after the current Milestone that isn't reached yet, if any. */
  readonly nextId: string | undefined;
}

/** Names a Milestone, for example "Lander departs". */
export function milestoneLabel(milestoneId: string): string {
  return findMilestone(milestoneId)?.label ?? milestoneId;
}

/** Tells a new player what to do to reach a Milestone. */
export function milestoneHint(milestoneId: string): string {
  return findMilestone(milestoneId)?.hint ?? "";
}

function findMilestone(id: string): Milestone | undefined {
  return catalogue.milestones.find((milestone) => milestone.id === id);
}

/** The Milestones reached, and the ones to aim for now and next. */
export function readMilestones(state: CampaignState): MilestonesSnapshot {
  const [currentId, nextId] = catalogue.milestones
    .filter((milestone) => !state.reachedMilestoneIds.includes(milestone.id))
    .map((milestone) => milestone.id);
  return {
    reachedIds: [...state.reachedMilestoneIds],
    currentId,
    nextId,
  };
}

/**
 * Reaches every Milestone, not reached yet, whose condition holds at the end
 * of the game-minute that has just passed, in catalogue order, and gives a
 * notification for each. `events` are those of that game-minute, for the
 * conditions that are moments rather than state.
 */
export function watchMilestones(
  state: CampaignState,
  events: readonly GameEvent[],
): GameEvent[] {
  return catalogue.milestones.flatMap((milestone) => {
    if (
      state.reachedMilestoneIds.includes(milestone.id) ||
      !holds(state, milestone.condition, events)
    ) {
      return [];
    }
    state.reachedMilestoneIds.push(milestone.id);
    return [
      {
        kind: "milestone-reached",
        atMinute: state.elapsedMinutes,
        milestoneId: milestone.id,
      },
    ];
  });
}

function holds(
  state: CampaignState,
  condition: MilestoneCondition,
  events: readonly GameEvent[],
): boolean {
  switch (condition.kind) {
    case "power-storage-commissioned":
      return state.structures.some(
        (structure) =>
          (findStructureType(structure.structureTypeId)?.power
            .storageKilowattHours ?? 0) > 0,
      );
    case "mission-director-moved-in":
      return state.missionDirector.residence === "habitat";
    case "lander-took-off":
      return events.some((event) => event.kind === "lander-took-off");
    case "habitat-shielded": {
      const { missionDirector } = state;
      if (missionDirector.residence !== "habitat") return false;
      const habitat = state.structures.find(
        (structure) => structure.id === missionDirector.habitatId,
      );
      return habitat !== undefined && isShielded(state, habitat);
    }
    case "landing-pad-commissioned":
      return state.structures.some(
        (structure) =>
          findStructureType(structure.structureTypeId)?.landingPad === true,
      );
    case "research-task-completed":
      return state.completedResearchTaskIds.length > 0;
    case "export-sold":
      return events.some(
        (event) =>
          event.kind === "lander-reached-earth" && event.sold.length > 0,
      );
    case "self-sufficient":
      return readSelfSufficiency(state).some(
        (judged) =>
          judged.stockId === condition.stockId && judged.selfSufficient,
      );
  }
}
