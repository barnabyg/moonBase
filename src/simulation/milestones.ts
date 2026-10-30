import {
  catalogue,
  type Act,
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
  /**
   * The Act of the current Milestone, or the last Act once every one is
   * reached. It is worked out from the Milestones reached rather than saved.
   */
  readonly currentActId: string;
}

/** Names a Milestone, for example "Lander departs". */
export function milestoneLabel(milestoneId: string): string {
  return findMilestone(milestoneId)?.label ?? milestoneId;
}

/** Tells a new player what to do to reach a Milestone. */
export function milestoneHint(milestoneId: string): string {
  return findMilestone(milestoneId)?.hint ?? "";
}

/** Says which Act a Milestone belongs to. */
export function milestoneActId(milestoneId: string): string {
  return findMilestone(milestoneId)?.actId ?? "";
}

/** Names an Act, for example "Act 2: Independence". */
export function actLabel(actId: string): string {
  return findAct(actId)?.label ?? actId;
}

/** Says what an Act asks of the player. */
export function actAsks(actId: string): string {
  return findAct(actId)?.asks ?? "";
}

function findMilestone(id: string): Milestone | undefined {
  return catalogue.milestones.find((milestone) => milestone.id === id);
}

function findAct(id: string): Act | undefined {
  return catalogue.acts.find((act) => act.id === id);
}

/** The Milestones reached, and the ones to aim for now and next. */
export function readMilestones(state: CampaignState): MilestonesSnapshot {
  const [currentId, nextId] = notReached(state).map(
    (milestone) => milestone.id,
  );
  return {
    reachedIds: [...state.reachedMilestoneIds],
    currentId,
    nextId,
    currentActId: currentActId(state),
  };
}

function notReached(state: CampaignState): readonly Milestone[] {
  return catalogue.milestones.filter(
    (milestone) => !state.reachedMilestoneIds.includes(milestone.id),
  );
}

function currentActId(state: CampaignState): string {
  return notReached(state)[0]?.actId ?? catalogue.acts.at(-1)?.id ?? "";
}

/**
 * Reaches every Milestone, not reached yet, whose condition holds at the end
 * of the game-minute that has just passed, in catalogue order, and gives a
 * notification for each, then one more if that has moved the current Act on.
 * `events` are those of that game-minute, for the conditions that are moments
 * rather than state.
 */
export function watchMilestones(
  state: CampaignState,
  events: readonly GameEvent[],
): GameEvent[] {
  const actIdBefore = currentActId(state);
  const reached = catalogue.milestones.flatMap((milestone): GameEvent[] => {
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
  const actId = currentActId(state);
  return actId === actIdBefore
    ? reached
    : [
        ...reached,
        { kind: "act-started", atMinute: state.elapsedMinutes, actId },
      ];
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
