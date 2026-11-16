import type { ComponentCount, GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  componentsFor,
  stageMachine,
  stageMinutes,
  type ConstructionStage,
  type ConstructionState,
  findStructureType,
} from "./construction";
import { arrivalSpot, isClimbingDown, type ArrivalState } from "./arrival";
import type { GameEvent } from "./events";
import { expeditionOf } from "./expeditions";
import { isClaimedBy } from "./maintenance";
import { defaultRecipeId } from "./plants";
import { nextFraction } from "./random";
import {
  robotPerformance,
  startSelfRepair,
  wearRobot,
  type SelfRepairState,
} from "./self-repair";
import { stockpileSpot, takeFromStock } from "./stockpile";
import {
  claimWorkOrder,
  drivenWorkOrder,
  isOpen,
  isSameWorkOrder,
  type WorkOrder,
} from "./work-orders";
import { fillWaterWall } from "./water-wall";
import { layCable } from "./robot-cabling";
import { workOnDismantling } from "./robot-dismantling";
import { goOnExpedition } from "./robot-expedition";
import { loadLander, unloadLander } from "./robot-lander";
import { positionMachine, setDigging } from "./robot-machines";
import { maintain } from "./robot-maintenance";
import { park } from "./robot-parking";
import { repairItself } from "./robot-self-repair";
import { samePlace, stepRobot, walkRobotTo } from "./robot-walking";

/**
 * Where a walking Robot is heading: a Construction's site, the base's
 * stockpile, a Machine, the powered Structure that a cable is laid from, or
 * the Lander, to take its cargo off.
 */
export type WalkingDestination =
  "site" | "stockpile" | "machine" | "cable" | "lander";

/**
 * What a Robot did during the latest game-minute, and for which Structure: one
 * under Construction (whose id the Structure keeps once commissioned), one
 * being dismantled, one cut off from power, the landing pad the Lander
 * whose cargo it is unloading landed on, or one it is maintaining; or for
 * which Machine it is maintaining.
 */
export type RobotActivity =
  | { readonly kind: "idle" }
  | {
      readonly kind: "walking";
      readonly structureId: string;
      readonly destination: WalkingDestination;
    }
  | {
      /**
       * Walking to the stockpile for the Exports to load onto the Lander on
       * a landing pad, or carrying them to the Lander.
       */
      readonly kind: "walking";
      readonly purpose: "exports";
      readonly destination: "stockpile" | "lander";
    }
  | {
      /**
       * Loading the Exports to load at the stockpile, or putting them aboard
       * the Lander on a landing pad.
       */
      readonly kind: "loading-exports" | "putting-exports-aboard";
    }
  | {
      readonly kind: "walking";
      /** The Machine it is to maintain, park or set digging. */
      readonly machineId: string;
      /** Fetching spare Components from the stockpile for it, or walking to it. */
      readonly destination: "stockpile" | "machine";
    }
  | {
      readonly kind: "walking";
      /** The Rover it is to maintain or park. */
      readonly roverId: string;
      /** Fetching spare Components from the stockpile for it, or walking to it. */
      readonly destination: "stockpile" | "rover";
    }
  | {
      /** Loading spare Components at the stockpile to maintain a Machine, or restoring the Machine's Condition. */
      readonly kind: "loading-components" | "maintaining";
      readonly machineId: string;
    }
  | {
      /** Loading spare Components at the stockpile to maintain a Rover, or restoring the Rover's Condition. */
      readonly kind: "loading-components" | "maintaining";
      readonly roverId: string;
    }
  | {
      /** Driving a Rover, aboard it, to park it beside a powered Structure. */
      readonly kind: "driving-rover";
      readonly roverId: string;
      readonly structureId: string;
    }
  | {
      /** Driving a Rover, aboard it, off the map on an Expedition or back. */
      readonly kind: "driving-rover";
      readonly roverId: string;
      readonly purpose: "expedition";
    }
  | {
      /**
       * "on-expedition": away beyond the base in the Rover.
       * "unloading-expedition": unloading what an Expedition brought back
       * at the stockpile.
       */
      readonly kind: "on-expedition" | "unloading-expedition";
    }
  | {
      /**
       * Walking to repair itself: to the stockpile for spare Components,
       * then to the Habitat or the Lander the Mission Director lives in.
       */
      readonly kind: "walking-to-repair";
      readonly destination: "stockpile" | "habitat" | "lander";
    }
  | {
      /** Loading spare Components at the stockpile to repair itself, or repairing itself. */
      readonly kind: "loading-spare-components" | "repairing-itself";
    }
  | {
      /**
       * Brought by a Launch, climbing down from the Lander as it lands, or
       * then walking to the stockpile, to join the others at work.
       */
      readonly kind: "climbing-down" | "walking-to-stockpile";
    }
  | {
      /** Driving a Machine to the site, aboard it, or setting it going there. */
      readonly kind: "driving-machine" | "activating-machine";
      readonly structureId: string;
      readonly machineId: string;
    }
  | {
      /** Driving a Machine beside the stockpile, aboard it, or setting it digging there. */
      readonly kind: "driving-machine" | "activating-machine";
      readonly machineId: string;
      readonly purpose: "digging";
    }
  | {
      readonly kind:
        /** Loading Components at the stockpile, for a Construction or, spare ones, for Maintenance. */
        | "loading-components"
        | "unloading-components"
        | "assembling"
        | "commissioning"
        | "laying-cable"
        /** Taking a Structure apart. */
        | "dismantling"
        /** Unloading the Components recovered from a Structure at the stockpile. */
        | "returning-components"
        /** Taking the Lander's cargo off it. */
        | "loading-cargo"
        /** Unloading the Lander's cargo at the stockpile. */
        | "unloading-cargo"
        /** Working on a Structure to restore its Condition. */
        | "maintaining"
        /** Cleaning the Dust coating off a solar array. */
        | "cleaning";
      readonly structureId: string;
    };

export interface RobotState {
  id: string;
  position: GroundPosition;
  activity: RobotActivity;
  carrying: ComponentCount[];
  /**
   * The Work Order the Robot has claimed and is carrying out, which it
   * keeps while it repairs itself.
   */
  workOrder: WorkOrder | undefined;
  /**
   * How intact it is, from 100% down to the data catalogue's floor: a
   * Robot is never Broken.
   */
  conditionPercent: number;
  /** Its repair of itself, which goes ahead of everything, while it is under way. */
  selfRepair: SelfRepairState | undefined;
  /**
   * Its arrival, once a Launch has brought it, until it is at the stockpile
   * ready for work: it goes ahead of everything.
   */
  arrival: ArrivalState | undefined;
}

/**
 * Lets the Robot do one game-minute of work, as fast as its Condition
 * allows: first wearing it down by Dust for the game-minute before, if it
 * wasn't idle. A Robot a Launch has just brought does nothing but arrive
 * until it is at the stockpile. Once it has set off on an Expedition, it
 * does nothing else until the Expedition is over. Otherwise, below the
 * data catalogue's threshold, it repairs itself ahead of everything else;
 * then it works on its Work Order, and once it has none, it sets off on
 * any Expedition it is to go on, or else claims the next Work Order in
 * plan order. Returns any events.
 */
export function workRobot(
  state: CampaignState,
  robot: RobotState,
): GameEvent[] {
  wearRobot(robot);
  if (robot.arrival !== undefined) return arrive(state, robot, robot.arrival);
  if (robot.workOrder !== undefined && !isOpen(state, robot.workOrder)) {
    robot.workOrder = undefined;
  }
  const expedition = expeditionOf(state, robot.id);
  if (expedition !== undefined && expedition.stage !== "boarding") {
    return goOnExpedition(state, robot, expedition);
  }
  const started = startSelfRepair(state, robot);
  if (robot.selfRepair !== undefined) {
    return [...started, ...repairItself(state, robot, robot.selfRepair)];
  }
  if (expedition !== undefined && robot.workOrder === undefined) {
    return goOnExpedition(state, robot, expedition);
  }
  robot.workOrder ??= claimWorkOrder(state, robot);
  const { workOrder } = robot;
  if (workOrder?.kind === "lay-cable") {
    return layCable(state, robot, workOrder.structureId);
  }
  if (workOrder?.kind === "unload-lander") return unloadLander(state, robot);
  if (workOrder?.kind === "load-lander") return loadLander(state, robot);
  const maintenance = state.maintenance.find((candidate) =>
    isClaimedBy(robot, candidate.target),
  );
  if (maintenance !== undefined) return maintain(state, robot, maintenance);
  const parking =
    workOrder?.kind === "park-machine" || workOrder?.kind === "park-rover"
      ? state.parking.find((candidate) =>
          isSameWorkOrder(drivenWorkOrder(candidate.target, "park"), workOrder),
        )
      : undefined;
  if (parking !== undefined) return park(state, robot, parking);
  if (workOrder?.kind === "dig") {
    return setDigging(state, robot, workOrder.machineId);
  }
  if (
    workOrder !== undefined &&
    ("machineId" in workOrder || "roverId" in workOrder)
  ) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  const dismantling = state.dismantlings.find(
    (candidate) => candidate.id === workOrder?.structureId,
  );
  if (dismantling !== undefined) {
    return workOnDismantling(state, robot, dismantling);
  }
  const construction = state.constructions.find(
    (candidate) => candidate.id === workOrder?.structureId,
  );
  if (construction === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  const machineStage = stageMachine(construction);
  if (machineStage !== undefined) {
    return positionMachine(state, robot, construction, machineStage);
  }
  const { id } = construction;
  const walkTo = (spot: GroundPosition, destination: WalkingDestination) =>
    walkRobotTo(state, robot, id, spot, destination);
  const workFor = (
    kind:
      | "loading-components"
      | "unloading-components"
      | "assembling"
      | "commissioning",
    untilMinutes: number,
  ): boolean => {
    robot.activity = { kind, structureId: id };
    construction.workedMinutes += robotPerformance(robot);
    return construction.workedMinutes >= untilMinutes;
  };

  const required = stageMinutes(construction);
  switch (construction.stage) {
    case "site-preparation":
      // Always a Machine's work, which the Robot only sets going (above).
      robot.workOrder = undefined;
      robot.activity = { kind: "idle" };
      return [];

    case "component-delivery": {
      // Half the handling time is loading at the stockpile, half unloading at the site.
      const loadingMinutes = Math.floor(required / 2);
      if (!construction.componentsTaken) {
        if (!walkTo(stockpileSpot(state, construction), "stockpile")) {
          return [];
        }
        const needed = componentsFor(construction.structureTypeId);
        if (!takeFromStock(state, needed)) {
          // Another Robot took them first; this Construction now waits.
          robot.workOrder = undefined;
          robot.activity = { kind: "idle" };
          return [];
        }
        robot.carrying = needed;
        construction.componentsTaken = true;
      }
      if (construction.workedMinutes < loadingMinutes) {
        workFor("loading-components", loadingMinutes);
        return [];
      }
      if (
        walkTo(construction.workSpot, "site") &&
        workFor("unloading-components", required)
      ) {
        robot.carrying = [];
        moveOn(construction, "assembly");
      }
      return [];
    }

    case "assembly":
      if (!walkTo(construction.workSpot, "site")) return [];
      if (!fillWaterWall(state, construction)) {
        // The water ran short on the way; this Construction now waits.
        robot.workOrder = undefined;
        robot.activity = { kind: "idle" };
        return [];
      }
      if (workFor("assembling", required)) {
        moveOn(construction, "commissioning");
      }
      return [];

    case "commissioning":
      if (
        !walkTo(construction.workSpot, "site") ||
        !workFor("commissioning", required)
      ) {
        return [];
      }
      return finishCommissioning(state, construction);
  }
}

/** Ends a Commissioning attempt, which may fail and then starts again. */
function finishCommissioning(
  state: CampaignState,
  construction: ConstructionState,
): GameEvent[] {
  const failureChance =
    findStructureType(construction.structureTypeId)
      ?.commissioningFailureChance ?? 0;
  if (nextFraction(state.random) < failureChance) {
    construction.failedCommissionings += 1;
    construction.workedMinutes = 0;
    return [];
  }
  state.constructions = state.constructions.filter(
    (other) => other !== construction,
  );
  state.structures.push({
    id: construction.id,
    structureTypeId: construction.structureTypeId,
    position: { ...construction.position },
    powered: false,
    lit: false,
    storedKilowattHours: 0,
    conditionPercent: 100,
    dustCoatingPercent: 0,
    recipeId: defaultRecipeId(construction.structureTypeId),
    batch: undefined,
    plantStop: undefined,
    switchedOff: false,
    growingMinutes: 0,
    observedMinutes: 0,
    arrayId: construction.arrayId,
  });
  return [
    {
      kind: "construction-completed",
      atMinute: state.elapsedMinutes,
      structureId: construction.id,
      structureTypeId: construction.structureTypeId,
    },
  ];
}

function moveOn(
  construction: ConstructionState,
  stage: ConstructionStage,
): void {
  construction.stage = stage;
  construction.workedMinutes = 0;
}

/**
 * Lets a Robot a Launch has just brought do one game-minute of arriving: it
 * climbs down from the Lander, then walks to the stockpile, where it is
 * ready for work. Returns the event once it is there.
 */
function arrive(
  state: CampaignState,
  robot: RobotState,
  arrival: ArrivalState,
): GameEvent[] {
  if (isClimbingDown(robot)) {
    robot.activity = { kind: "climbing-down" };
    arrival.workedMinutes += 1;
    return [];
  }
  const spot = arrivalSpot(state);
  if (!samePlace(robot.position, spot)) {
    stepRobot(state, robot, spot);
    robot.activity = { kind: "walking-to-stockpile" };
    return [];
  }
  robot.arrival = undefined;
  robot.activity = { kind: "idle" };
  return [
    {
      kind: "robot-arrived",
      atMinute: state.elapsedMinutes,
      robotId: robot.id,
    },
  ];
}
