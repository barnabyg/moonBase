import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  chooseMachineSpot,
  componentsFor,
  findStructureType,
  stageMinutes,
  type ConstructionStage,
  type ConstructionState,
} from "./construction";
import type { GameEvent } from "./events";
import {
  findMachineType,
  machineOn,
  nearestFreeMachine,
  type MachineState,
} from "./machines";
import { nextFraction } from "./random";
import { stepTowards } from "./walking";
import { claimWorkOrder, isOpen, type WorkOrder } from "./work-orders";

/** What a Robot did during the latest game-minute, and for which Construction. */
export type RobotActivity =
  | { readonly kind: "idle" }
  | {
      readonly kind: "walking";
      readonly constructionId: string;
      readonly destination: "site" | "lander" | "machine";
    }
  | {
      /** Driving a Machine to the site, aboard it, or setting it going there. */
      readonly kind: "driving-machine" | "activating-machine";
      readonly constructionId: string;
      readonly machineId: string;
    }
  | {
      readonly kind:
        | "loading-components"
        | "unloading-components"
        | "assembling"
        | "commissioning";
      readonly constructionId: string;
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
  const construction = state.constructions.find(
    (candidate) => candidate.id === workOrder?.constructionId,
  );
  if (construction === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  const { id } = construction;
  const walkTo = (
    spot: GroundPosition,
    destination: "site" | "lander" | "machine",
  ): boolean => {
    if (samePlace(robot.position, spot)) return true;
    robot.position = stepTowards(
      robot.position,
      spot,
      {
        centre: state.lander.position,
        radius: LANDER_CLEARANCE_METRES,
      },
      catalogue.robot.walkingSpeedMetresPerHour / 60,
    );
    robot.activity = { kind: "walking", constructionId: id, destination };
    return false;
  };
  const workFor = (
    kind:
      | "loading-components"
      | "unloading-components"
      | "assembling"
      | "commissioning",
    untilMinutes: number,
  ): boolean => {
    robot.activity = { kind, constructionId: id };
    construction.workedMinutes += 1;
    return construction.workedMinutes >= untilMinutes;
  };
  const required = stageMinutes(construction);

  switch (construction.stage) {
    case "site-preparation": {
      // The Robot positions and activates a Machine, which then grades the
      // ground by itself.
      const machine =
        machineOn(state, id) ?? assignMachine(state, construction);
      const task = machine?.task;
      if (machine === undefined || task === undefined) {
        robot.workOrder = undefined;
        robot.activity = { kind: "idle" };
        return [];
      }
      const type = findMachineType(machine.machineTypeId);
      if (!samePlace(machine.position, task.destination)) {
        if (!walkTo(machine.position, "machine")) return [];
        machine.position = stepTowards(
          machine.position,
          task.destination,
          {
            centre: state.lander.position,
            radius:
              LANDER_CLEARANCE_METRES + (type?.footprintRadiusMetres ?? 0),
          },
          (type?.drivingSpeedMetresPerHour ?? 0) / 60,
        );
        robot.position = { ...machine.position };
        robot.activity = {
          kind: "driving-machine",
          constructionId: id,
          machineId: machine.id,
        };
        return [];
      }
      // Once there, it climbs down and sets the Machine going from beside it.
      if (!walkTo(beside(machine, construction), "machine")) return [];
      robot.activity = {
        kind: "activating-machine",
        constructionId: id,
        machineId: machine.id,
      };
      task.activationMinutes += 1;
      if (
        task.activationMinutes >= Math.round((type?.activationHours ?? 0) * 60)
      ) {
        task.working = true;
      }
      return [];
    }

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

/** Gives a Construction's Site Preparation to the nearest free Machine that can do it. */
function assignMachine(
  state: CampaignState,
  construction: ConstructionState,
): MachineState | undefined {
  const machine = nearestFreeMachine(
    state,
    catalogue.sitePreparationMachineTypeId,
    construction.position,
  );
  if (machine === undefined) return undefined;
  machine.task = {
    constructionId: construction.id,
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
    (findMachineType(machine.machineTypeId)?.footprintRadiusMetres ?? 0) +
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

/** Where the Robot stands to load Components: beside the Lander, on the side facing the site. */
function landerSpot(
  state: CampaignState,
  construction: ConstructionState,
): GroundPosition {
  const lander = state.lander.position;
  const { workSpot } = construction;
  const angle = Math.atan2(workSpot.y - lander.y, workSpot.x - lander.x);
  const reach =
    catalogue.lander.footprintRadiusMetres + catalogue.robot.workingGapMetres;
  return {
    x: lander.x + Math.cos(angle) * reach,
    y: lander.y + Math.sin(angle) * reach,
  };
}

/** Takes the Components from the cargo stock if they are all there; otherwise takes nothing. */
function takeFromStock(
  state: CampaignState,
  needed: readonly ComponentCount[],
): boolean {
  const stockOf = (componentId: string) =>
    state.cargo.find((stock) => stock.componentId === componentId);
  if (
    needed.some((need) => (stockOf(need.componentId)?.count ?? 0) < need.count)
  ) {
    return false;
  }
  for (const need of needed) {
    const stock = stockOf(need.componentId);
    if (stock !== undefined) stock.count -= need.count;
  }
  return true;
}
