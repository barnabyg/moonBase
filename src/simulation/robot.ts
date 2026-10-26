import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import { addToStock, takeFromStock } from "./cargo";
import {
  chooseMachineSpot,
  componentsFor,
  findStructureType,
  stageMachine,
  stageMinutes,
  type ConstructionStage,
  type ConstructionState,
  type StageMachine,
} from "./construction";
import {
  dismantlingStageMinutes,
  recoveredComponents,
  takeOffBase,
  type DismantlingState,
} from "./dismantling";
import type { GameEvent } from "./events";
import {
  findMachineType,
  machineFootprintRadius,
  machineOn,
  nearestFreeMachine,
  type MachineState,
} from "./machines";
import { cableTo, extendRoute } from "./power";
import { nextFraction } from "./random";
import { stepTowards } from "./walking";
import { findStructureToReconnect } from "./reconnection";
import { claimWorkOrder, isOpen, type WorkOrder } from "./work-orders";

/**
 * Where a walking Robot is heading: a Construction's site, the Lander, a
 * Machine, or the powered Structure that a cable is laid from.
 */
export type WalkingDestination = "site" | "lander" | "machine" | "cable";

/**
 * What a Robot did during the latest game-minute, and for which Structure: one
 * under Construction (whose id the Structure keeps once commissioned), one
 * being dismantled or one cut off from power.
 */
export type RobotActivity =
  | { readonly kind: "idle" }
  | {
      readonly kind: "walking";
      readonly structureId: string;
      readonly destination: WalkingDestination;
    }
  | {
      /** Driving a Machine to the site, aboard it, or setting it going there. */
      readonly kind: "driving-machine" | "activating-machine";
      readonly structureId: string;
      readonly machineId: string;
    }
  | {
      readonly kind:
        | "loading-components"
        | "unloading-components"
        | "assembling"
        | "commissioning"
        | "laying-cable"
        /** Taking a Structure apart. */
        | "dismantling"
        /** Unloading the Components recovered from a Structure at the Lander. */
        | "returning-components";
      readonly structureId: string;
    };

export interface RobotState {
  id: string;
  position: GroundPosition;
  activity: RobotActivity;
  carrying: ComponentCount[];
  /** The Work Order the Robot has claimed and is carrying out. */
  workOrder: WorkOrder | undefined;
}

/** How close to the Lander's centre a Robot may walk. */
const LANDER_CLEARANCE_METRES = catalogue.lander.footprintRadiusMetres + 0.5;

/**
 * Lets the Robot do one game-minute of work on its Work Order, claiming the
 * next one in plan order when it has none, and returns any events.
 */
export function workRobot(
  state: CampaignState,
  robot: RobotState,
): GameEvent[] {
  if (robot.workOrder !== undefined && !isOpen(state, robot.workOrder)) {
    robot.workOrder = undefined;
  }
  robot.workOrder ??= claimWorkOrder(state, robot);
  const { workOrder } = robot;
  if (workOrder?.kind === "lay-cable") {
    return layCable(state, robot, workOrder.structureId);
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
    construction.workedMinutes += 1;
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
      // Half the handling time is loading at the Lander, half unloading at the site.
      const loadingMinutes = Math.floor(required / 2);
      if (!construction.componentsTaken) {
        if (!walkTo(landerSpot(state, construction), "lander")) return [];
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
      if (
        walkTo(construction.workSpot, "site") &&
        workFor("assembling", required)
      ) {
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

/**
 * Lets the Robot do one game-minute of work on a stage of Construction that a
 * Machine carries out: it drives the nearest free Machine of the right type
 * to the site and activates it, and the Machine then does the stage by
 * itself.
 */
function positionMachine(
  state: CampaignState,
  robot: RobotState,
  construction: ConstructionState,
  machineStage: StageMachine,
): GameEvent[] {
  const { id } = construction;
  const walkTo = (spot: GroundPosition) =>
    walkRobotTo(state, robot, id, spot, "machine");
  const machine =
    machineOn(state, id) ?? assignMachine(state, construction, machineStage);
  const assignment = machine?.assignment;
  if (machine === undefined || assignment === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  const type = findMachineType(machine.machineTypeId);
  if (!samePlace(machine.position, assignment.destination)) {
    if (!walkTo(machine.position)) return [];
    machine.position = stepTowards(
      machine.position,
      assignment.destination,
      {
        centre: state.lander.position,
        radius:
          LANDER_CLEARANCE_METRES +
          machineFootprintRadius(machine.machineTypeId),
      },
      (type?.drivingSpeedMetresPerHour ?? 0) / 60,
    );
    robot.position = { ...machine.position };
    robot.activity = {
      kind: "driving-machine",
      structureId: id,
      machineId: machine.id,
    };
    return [];
  }
  // Once there, it climbs down and sets the Machine going from beside it.
  if (!walkTo(beside(machine, construction))) return [];
  robot.activity = {
    kind: "activating-machine",
    structureId: id,
    machineId: machine.id,
  };
  assignment.activationMinutes += 1;
  if (
    assignment.activationMinutes >=
    Math.round((type?.activationHours ?? 0) * 60)
  ) {
    assignment.working = true;
  }
  return [];
}

/**
 * Lets the Robot do one game-minute of laying cable to a Construction or to a
 * Structure cut off from power: it walks to the powered Structure, then pays
 * the cable out behind it as it walks to the other one.
 */
function layCable(
  state: CampaignState,
  robot: RobotState,
  structureId: string,
): GameEvent[] {
  const target =
    state.constructions.find((candidate) => candidate.id === structureId) ??
    findStructureToReconnect(state, structureId);
  const cable = target === undefined ? undefined : cableTo(state, target);
  if (cable === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  if (cable.route.length === 0) {
    if (!walkRobotTo(state, robot, structureId, cable.start, "cable")) {
      return [];
    }
    cable.route.push({ ...cable.start });
  }
  robot.position = stepTowards(
    robot.position,
    cable.end,
    { centre: state.lander.position, radius: LANDER_CLEARANCE_METRES },
    catalogue.robot.cableLayingSpeedMetresPerHour / 60,
  );
  extendRoute(cable.route, robot.position);
  robot.activity = { kind: "laying-cable", structureId };
  cable.complete = samePlace(robot.position, cable.end);
  return [];
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

/** Gives a stage of a Construction to the nearest free Machine of the type that carries it out. */
function assignMachine(
  state: CampaignState,
  construction: ConstructionState,
  { stage, machineTypeId }: StageMachine,
): MachineState | undefined {
  const machine = nearestFreeMachine(
    state,
    machineTypeId,
    construction.position,
  );
  if (machine === undefined) return undefined;
  machine.assignment = {
    constructionId: construction.id,
    stage,
    destination: chooseMachineSpot(state, construction, machine),
    activationMinutes: 0,
    working: false,
  };
  return machine;
}

/** Where a Robot stands to activate a Machine: just outside it, beside the site. */
function beside(
  machine: MachineState,
  construction: ConstructionState,
): GroundPosition {
  const reach =
    machineFootprintRadius(machine.machineTypeId) +
    catalogue.robot.workingGapMetres / 2;
  // At right angles to the line from the site to the Machine.
  const angle =
    Math.atan2(
      machine.position.y - construction.position.y,
      machine.position.x - construction.position.x,
    ) +
    Math.PI / 2;
  return {
    x: machine.position.x + Math.cos(angle) * reach,
    y: machine.position.y + Math.sin(angle) * reach,
  };
}

function samePlace(a: GroundPosition, b: GroundPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

function moveOn(
  construction: ConstructionState,
  stage: ConstructionStage,
): void {
  construction.stage = stage;
  construction.workedMinutes = 0;
}

/**
 * Lets the Robot do one game-minute of work on dismantling a Structure: it
 * takes the Structure apart, then picks up the Components it recovered and
 * carries them to the Lander, where they go back into the cargo stock.
 */
function workOnDismantling(
  state: CampaignState,
  robot: RobotState,
  dismantling: DismantlingState,
): GameEvent[] {
  const { id } = dismantling;
  const walkTo = (spot: GroundPosition, destination: WalkingDestination) =>
    walkRobotTo(state, robot, id, spot, destination);
  const required = dismantlingStageMinutes(dismantling);
  switch (dismantling.stage) {
    case "taking-apart":
      if (!walkTo(dismantling.workSpot, "site")) return [];
      // From the first minute of taking it apart, it no longer works.
      if (dismantling.workedMinutes === 0) takeOffBase(state, id);
      robot.activity = { kind: "dismantling", structureId: id };
      dismantling.workedMinutes += 1;
      if (dismantling.workedMinutes < required) return [];
      dismantling.recovered = recoveredComponents(dismantling.structureTypeId);
      // Something with no Components, such as Regolith shielding, is gone
      // once it has been taken apart.
      if (dismantling.recovered.length === 0) {
        return finishDismantling(state, dismantling);
      }
      dismantling.stage = "returning-components";
      dismantling.workedMinutes = 0;
      return [];

    case "returning-components":
      if (!dismantling.collected) {
        if (!walkTo(dismantling.workSpot, "site")) return [];
        robot.carrying = dismantling.recovered.map((count) => ({ ...count }));
        dismantling.collected = true;
      }
      if (!walkTo(landerSpot(state, dismantling), "lander")) return [];
      robot.activity = { kind: "returning-components", structureId: id };
      dismantling.workedMinutes += 1;
      if (dismantling.workedMinutes < required) return [];
      addToStock(state, dismantling.recovered);
      robot.carrying = [];
      return finishDismantling(state, dismantling);
  }
}

/** Ends a Structure's dismantling, once anything recovered from it is back in stock. */
function finishDismantling(
  state: CampaignState,
  dismantling: DismantlingState,
): GameEvent[] {
  state.dismantlings = state.dismantlings.filter(
    (other) => other !== dismantling,
  );
  return [
    {
      kind: "structure-dismantled",
      atMinute: state.elapsedMinutes,
      structureId: dismantling.id,
      structureTypeId: dismantling.structureTypeId,
    },
  ];
}

/**
 * Walks the Robot one game-minute towards a spot, round the Lander, for work
 * on a Structure. Says whether it was already there.
 */
function walkRobotTo(
  state: CampaignState,
  robot: RobotState,
  structureId: string,
  spot: GroundPosition,
  destination: WalkingDestination,
): boolean {
  if (samePlace(robot.position, spot)) return true;
  robot.position = stepTowards(
    robot.position,
    spot,
    { centre: state.lander.position, radius: LANDER_CLEARANCE_METRES },
    catalogue.robot.walkingSpeedMetresPerHour / 60,
  );
  robot.activity = { kind: "walking", structureId, destination };
  return false;
}

/** Where the Robot stands to load or unload Components: beside the Lander, on the side facing the site. */
function landerSpot(
  state: CampaignState,
  site: { readonly workSpot: GroundPosition },
): GroundPosition {
  const lander = state.lander.position;
  const { workSpot } = site;
  const angle = Math.atan2(workSpot.y - lander.y, workSpot.x - lander.x);
  const reach =
    catalogue.lander.footprintRadiusMetres + catalogue.robot.workingGapMetres;
  return {
    x: lander.x + Math.cos(angle) * reach,
    y: lander.y + Math.sin(angle) * reach,
  };
}
