import {
  catalogue,
  componentOutputs,
  type Act,
  type Milestone,
  type MilestoneCondition,
} from "../catalogue";
import { bulkInStock } from "./bulk-resources";
import type { CampaignState } from "./campaign";
import { findStructureType, isShielded } from "./construction";
import type { GameEvent } from "./events";
import { readExports } from "./exports";
import { earthDaysOfUseKilograms } from "./life-support-reserve";
import { isPlant, recipeOf } from "./plants";
import {
  readSelfSufficiency,
  readSpareComponentSufficiency,
} from "./self-sufficiency";
import { storageLimitKilograms } from "./storage-limits";
import { hasTakenItsFills } from "./water-wall";

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
  /**
   * Where the current Milestone comes among its Act's, in catalogue order
   * whatever has been reached, counted from 1, and how many the Act has;
   * undefined once every one is reached.
   */
  readonly place: { readonly number: number; readonly of: number } | undefined;
  /**
   * How far along the current Milestone is, for one with something to
   * measure; none for the many that are simply done or not, or once every
   * one is reached.
   */
  readonly measures: readonly MilestoneMeasure[];
}

/**
 * Something that shows how far along a Milestone is. It is guidance only:
 * what reaches the Milestone is its condition (see `MilestoneCondition`).
 */
export type MilestoneMeasure =
  /**
   * The share of what the Mission Director used of a life support stock
   * that the base's Plants made, as self-sufficiency is judged: it is
   * reached at 1 or more over a whole window.
   */
  | {
      readonly kind: "life-support-made";
      readonly stockId: string;
      /** Undefined while they have used none. */
      readonly share: number | undefined;
      /** Whether a whole window has passed, so that it can be judged. */
      readonly windowComplete: boolean;
    }
  /** The same for the spare Components repairs used. */
  | {
      readonly kind: "spare-components-made";
      readonly share: number | undefined;
      readonly windowComplete: boolean;
    }
  /**
   * The Return Mass as things stand, against the mass of Exports the Lander
   * has to take off with.
   */
  | {
      readonly kind: "return-mass";
      readonly kilograms: number;
      readonly targetKilograms: number;
    }
  /** The Exports aboard the Lander and to load, against the same mass. */
  | {
      readonly kind: "exports-loaded";
      readonly kilograms: number;
      readonly targetKilograms: number;
    }
  /**
   * A life support stock that a Structure is stocked with as its Assembly
   * starts, against what that takes with the Mission Director's reserve
   * left over. Once one being built has taken it, the stock counts as there.
   */
  | {
      readonly kind: "stocked-with";
      readonly stockId: string;
      readonly kilograms: number;
      readonly targetKilograms: number;
      /** What the base can hold of it, or undefined if there is no limit. */
      readonly limitKilograms: number | undefined;
    };

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
  const [current, next] = notReached(state);
  return {
    reachedIds: [...state.reachedMilestoneIds],
    currentId: current?.id,
    nextId: next?.id,
    currentActId: currentActId(state),
    place: current === undefined ? undefined : placeOf(current),
    measures: current === undefined ? [] : measuresOf(state, current.condition),
  };
}

/** Where a Milestone comes among its Act's, counted from 1, and how many the Act has. */
function placeOf(milestone: Milestone): { number: number; of: number } {
  const inAct = catalogue.milestones.filter(
    (other) => other.actId === milestone.actId,
  );
  return { number: inAct.indexOf(milestone) + 1, of: inAct.length };
}

/** What there is to measure of a Milestone that isn't reached, from its condition. */
function measuresOf(
  state: CampaignState,
  condition: MilestoneCondition,
): MilestoneMeasure[] {
  switch (condition.kind) {
    case "self-sufficient":
      return readSelfSufficiency(state)
        .filter((judged) => judged.stockId === condition.stockId)
        .map((judged) => ({
          kind: "life-support-made",
          stockId: judged.stockId,
          share: judged.coveredShare,
          windowComplete: judged.windowComplete,
        }));
    case "self-sufficient-in-spare-components": {
      const judged = readSpareComponentSufficiency(state);
      return [
        {
          kind: "spare-components-made",
          share: judged.coveredShare,
          windowComplete: judged.windowComplete,
        },
      ];
    }
    case "exports-carried": {
      const exports = readExports(state);
      const aboard = exports.aboard.reduce(
        (mass, line) => mass + line.kilograms,
        0,
      );
      return [
        {
          kind: "return-mass",
          kilograms: exports.returnMassKilograms,
          targetKilograms: condition.kilograms,
        },
        {
          kind: "exports-loaded",
          kilograms: exports.massKilograms + aboard,
          targetKilograms: condition.kilograms,
        },
      ];
    }
    case "structure-commissioned": {
      const fills =
        findStructureType(condition.structureTypeId)?.stockedWith ?? [];
      const taken = state.constructions.some(
        (construction) =>
          construction.structureTypeId === condition.structureTypeId &&
          hasTakenItsFills(construction),
      );
      return fills.map((fill) => {
        const targetKilograms =
          fill.kilograms +
          earthDaysOfUseKilograms(fill.stockId, fill.reserveEarthDays);
        const inStock =
          state.lifeSupport.find((stock) => stock.stockId === fill.stockId)
            ?.kilograms ?? 0;
        return {
          kind: "stocked-with",
          stockId: fill.stockId,
          kilograms: taken ? targetKilograms : inStock,
          targetKilograms,
          limitKilograms: storageLimitKilograms(state, {
            kind: "life-support",
            stockId: fill.stockId,
          }),
        };
      });
    }
    default:
      return [];
  }
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
          event.kind === "lander-reached-earth" &&
          event.sold.some(
            ({ resourceId }) =>
              condition.resourceId === undefined ||
              resourceId === condition.resourceId,
          ),
      );
    case "component-being-made":
      return state.structures.some(
        (structure) =>
          isPlant(structure) &&
          structure.batch !== undefined &&
          componentOutputs(recipeOf(structure)).some(
            ({ componentId }) => componentId === condition.componentId,
          ),
      );
    case "self-sufficient-in-spare-components":
      return readSpareComponentSufficiency(state).selfSufficient;
    case "self-sufficient":
      return readSelfSufficiency(state).some(
        (judged) =>
          judged.stockId === condition.stockId && judged.selfSufficient,
      );
    case "bulk-resource-in-stock":
      return bulkInStock(state, condition.resourceId) > 0;
    case "exports-carried":
      return events.some(
        (event) =>
          event.kind === "lander-took-off" &&
          event.exports.reduce((mass, line) => mass + line.kilograms, 0) >=
            condition.kilograms,
      );
    case "mission-director-lives-in": {
      const { missionDirector } = state;
      return (
        missionDirector.residence === "habitat" &&
        state.structures.some(
          (structure) =>
            structure.id === missionDirector.habitatId &&
            structure.structureTypeId === condition.structureTypeId,
        )
      );
    }
    case "structure-commissioned":
      return state.structures.some(
        (structure) => structure.structureTypeId === condition.structureTypeId,
      );
  }
}
