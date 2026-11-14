import { catalogue, type GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  chooseDiggingSpot,
  chooseMachineSpot,
  type ConstructionState,
  type StageMachine,
} from "./construction";
import type { GameEvent } from "./events";
import {
  findMachineType,
  machineFootprintRadius,
  machineOn,
  machinePerformance,
  nearestFreeMachine,
  wearMachine,
  type MachineState,
} from "./machines";
import type { RobotActivity, RobotState } from "./robot";
import { samePlace, stepRobot } from "./robot-walking";
import { robotPerformance } from "./self-repair";
import { obstaclesFor, stepTowards } from "./walking";

/**
 * Lets the Robot do one game-minute of work on a stage of Construction that a
 * Machine carries out: it drives the nearest free Machine of the right type
 * to the site and activates it, and the Machine then does the stage by
 * itself.
 */
export function positionMachine(
  state: CampaignState,
  robot: RobotState,
  construction: ConstructionState,
  machineStage: StageMachine,
): GameEvent[] {
  const { id } = construction;
  const machine =
    machineOn(state, id) ?? assignMachine(state, construction, machineStage);
  const assignment = machine?.assignment;
  if (machine === undefined || assignment === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  return setGoing(state, robot, machine, assignment, construction.position, {
    walking: { kind: "walking", structureId: id, destination: "machine" },
    driving: {
      kind: "driving-machine",
      structureId: id,
      machineId: machine.id,
    },
    activating: {
      kind: "activating-machine",
      structureId: id,
      machineId: machine.id,
    },
  });
}

/**
 * Lets the Robot do one game-minute of setting a Machine digging: it drives
 * the Machine to clear ground beside the stockpile and activates it, and
 * the Machine then digs by itself.
 */
export function setDigging(
  state: CampaignState,
  robot: RobotState,
  machineId: string,
): GameEvent[] {
  const machine = state.machines.find(
    (candidate) => candidate.id === machineId,
  );
  if (machine === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  machine.digging ??= {
    destination: chooseDiggingSpot(state, machine),
    activationMinutes: 0,
    working: false,
  };
  return setGoing(
    state,
    robot,
    machine,
    machine.digging,
    state.stockpile.position,
    {
      walking: { kind: "walking", machineId, destination: "machine" },
      driving: { kind: "driving-machine", machineId, purpose: "digging" },
      activating: { kind: "activating-machine", machineId, purpose: "digging" },
    },
  );
}

/**
 * Lets the Robot do one game-minute of setting a Machine going: it walks to
 * the Machine and drives it to where it works, as fast as the Machine's
 * Condition allows, then climbs down and activates it from beside it,
 * doing each with the activity given for it.
 */
export function setGoing(
  state: CampaignState,
  robot: RobotState,
  machine: MachineState,
  positioning: {
    readonly destination: GroundPosition;
    activationMinutes: number;
    working: boolean;
  },
  site: GroundPosition,
  activities: {
    readonly walking: RobotActivity & { readonly kind: "walking" };
    readonly driving: RobotActivity & { readonly kind: "driving-machine" };
    readonly activating: RobotActivity & {
      readonly kind: "activating-machine";
    };
  },
): GameEvent[] {
  const walkTo = (spot: GroundPosition): boolean => {
    if (samePlace(robot.position, spot)) return true;
    stepRobot(state, robot, spot);
    robot.activity = activities.walking;
    return false;
  };
  const type = findMachineType(machine.machineTypeId);
  if (!samePlace(machine.position, positioning.destination)) {
    if (!walkTo(machine.position)) return [];
    // As fast as its Condition allows, wearing it down by Dust.
    machine.position = stepTowards(
      machine.position,
      positioning.destination,
      obstaclesFor(state, machineFootprintRadius(machine.machineTypeId)),
      ((type?.drivingSpeedMetresPerHour ?? 0) * machinePerformance(machine)) /
        60,
    );
    robot.position = { ...machine.position };
    robot.activity = activities.driving;
    const broken = wearMachine(
      state,
      machine,
      type?.dustWearPercentPerDrivingHour ?? 0,
    );
    // A Machine that breaks stops where it stands, with the Robot aboard.
    if (broken.length > 0) {
      robot.workOrder = undefined;
      robot.activity = { kind: "idle" };
    }
    return broken;
  }
  // Once there, it climbs down and sets the Machine going from beside it.
  if (!walkTo(beside(machine, site))) return [];
  robot.activity = activities.activating;
  positioning.activationMinutes += robotPerformance(robot);
  if (
    positioning.activationMinutes >=
    Math.round((type?.activationHours ?? 0) * 60)
  ) {
    positioning.working = true;
  }
  return [];
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
  // Digging gives way to Construction.
  machine.digging = undefined;
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
function beside(machine: MachineState, site: GroundPosition): GroundPosition {
  const reach =
    machineFootprintRadius(machine.machineTypeId) +
    catalogue.robot.workingGapMetres / 2;
  // At right angles to the line from the site to the Machine.
  const angle =
    Math.atan2(machine.position.y - site.y, machine.position.x - site.x) +
    Math.PI / 2;
  return {
    x: machine.position.x + Math.cos(angle) * reach,
    y: machine.position.y + Math.sin(angle) * reach,
  };
}
