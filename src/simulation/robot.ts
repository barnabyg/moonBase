import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  chooseDiggingSpot,
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
import { addBulk } from "./bulk-resources";
import type { GameEvent } from "./events";
import {
  awayMinutes,
  exitPointFrom,
  expeditionOf,
  returnSpot,
  unloadingMinutes,
  wearRoverOnExpedition,
  type ExpeditionState,
} from "./expeditions";
import { isRoverBroken, roverPerformance } from "./rovers";
import {
  findMachineType,
  machineFootprintRadius,
  machineOn,
  machinePerformance,
  nearestFreeMachine,
  wearMachine,
  type MachineState,
} from "./machines";
import {
  currentStep,
  findWorn,
  finishMaintenance,
  plannedVisit,
  spareComponentsFor,
  spares,
  type MaintenanceState,
} from "./maintenance";
import type { ParkingState } from "./parking";
import { cableTo, extendRoute } from "./power";
import { nextFraction } from "./random";
import { stepTowards } from "./walking";
import { findStructureToReconnect } from "./reconnection";
import {
  finishSelfRepair,
  robotPerformance,
  selfRepairMinutes,
  startSelfRepair,
  wearRobot,
  type SelfRepairState,
} from "./self-repair";
import {
  addCounts,
  addToStock,
  stockpileSpot,
  takeFromStock,
} from "./stockpile";
import {
  cargoHandlingMinutes,
  cargoSpot,
  collectCargo,
  finishUnloading,
} from "./unloading";
import {
  claimWorkOrder,
  drivenWorkOrder,
  isOpen,
  isSameWorkOrder,
  type WorkOrder,
} from "./work-orders";
import {
  bodyOf,
  drivenPerformance,
  drivenSpec,
  findDriven,
  wearDriven,
  type Driven,
} from "./driven";
import { isClaimedBy } from "./maintenance";

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
}

/** How close to the Lander's centre a Robot may walk. */
const LANDER_CLEARANCE_METRES = catalogue.lander.footprintRadiusMetres + 0.5;

/**
 * Lets the Robot do one game-minute of work, as fast as its Condition
 * allows: first wearing it down by Dust for the game-minute before, if it
 * wasn't idle. Once it has set off on an Expedition, it does nothing else
 * until the Expedition is over. Otherwise, below the data catalogue's
 * threshold, it repairs itself ahead of everything else; then it works on
 * its Work Order, and once it has none, it sets off on any Expedition it
 * is to go on, or else claims the next Work Order in plan order. Returns
 * any events.
 */
export function workRobot(
  state: CampaignState,
  robot: RobotState,
): GameEvent[] {
  wearRobot(robot);
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
function setDigging(
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
function setGoing(
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
      {
        centre: state.lander.position,
        radius:
          LANDER_CLEARANCE_METRES +
          machineFootprintRadius(machine.machineTypeId),
      },
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
  // Back from repairing itself, it goes on from where the cable got to.
  const laid = cable.route.at(-1) ?? cable.start;
  if (!walkRobotTo(state, robot, structureId, laid, "cable")) return [];
  robot.position = stepTowards(
    robot.position,
    cable.end,
    { centre: state.lander.position, radius: LANDER_CLEARANCE_METRES },
    (catalogue.robot.cableLayingSpeedMetresPerHour * robotPerformance(robot)) /
      60,
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
    conditionPercent: 100,
    dustCoatingPercent: 0,
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
 * carries them to the stockpile, where they go back into the base's stock.
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
      dismantling.workedMinutes += robotPerformance(robot);
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
      if (!walkTo(stockpileSpot(state, dismantling), "stockpile")) return [];
      robot.activity = { kind: "returning-components", structureId: id };
      dismantling.workedMinutes += robotPerformance(robot);
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
 * Lets the Robot do one game-minute of unloading the Lander, landed on a
 * landing pad: it walks to the Lander and takes the cargo off, then carries
 * it to the stockpile, where it joins the base's stock.
 */
function unloadLander(state: CampaignState, robot: RobotState): GameEvent[] {
  const { unloading } = state;
  if (unloading === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  const id = unloading.landingPadId;
  const { loading, total } = cargoHandlingMinutes();
  if (!unloading.collected) {
    if (!walkRobotTo(state, robot, id, cargoSpot(state), "lander")) return [];
    robot.activity = { kind: "loading-cargo", structureId: id };
    unloading.workedMinutes += robotPerformance(robot);
    if (unloading.workedMinutes >= loading) {
      robot.carrying = collectCargo(state, unloading);
    }
    return [];
  }
  const spot = stockpileSpot(state, { workSpot: cargoSpot(state) });
  if (!walkRobotTo(state, robot, id, spot, "stockpile")) return [];
  robot.activity = { kind: "unloading-cargo", structureId: id };
  unloading.workedMinutes += robotPerformance(robot);
  if (unloading.workedMinutes < total - loading) return [];
  const components = unloading.cargo.map((count) => ({ ...count }));
  finishUnloading(state, unloading);
  robot.carrying = [];
  return [
    { kind: "lander-unloaded", atMinute: state.elapsedMinutes, components },
  ];
}

/**
 * Lets the Robot do one game-minute of Maintenance on a Structure or
 * Machine. To restore its Condition, the Robot takes the spare Components
 * it needs from the base's stock and loads them at the stockpile, then
 * carries them there and works on it until its Condition is back to 100%,
 * using them up. To clean a solar array, it walks straight there; after
 * restoring Condition, it cleans on the same visit.
 */
function maintain(
  state: CampaignState,
  robot: RobotState,
  maintenance: MaintenanceState,
): GameEvent[] {
  const worn = findWorn(state, maintenance.target);
  if (worn === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  const walkTo = (spot: GroundPosition, destination: "stockpile" | "site") =>
    worn.kind === "structure"
      ? walkRobotTo(state, robot, worn.structure.id, spot, destination)
      : walkRobotToDriven(
          state,
          robot,
          worn,
          spot,
          destination === "site" ? "there" : "stockpile",
        );
  const working = (
    kind: "loading-components" | "maintaining",
  ): RobotActivity => {
    switch (worn.kind) {
      case "structure":
        return { kind, structureId: worn.structure.id };
      case "machine":
        return { kind, machineId: worn.machine.id };
      case "rover":
        return { kind, roverId: worn.rover.id };
    }
  };
  if (maintenance.visit === undefined) {
    // A Machine or Rover stays where it is once it is being maintained.
    if (worn.kind !== "structure") {
      maintenance.workSpot = besideDriven(state, worn);
    }
    let visit = plannedVisit(state, maintenance, worn);
    if (visit.spareComponents > 0) {
      if (!walkTo(stockpileSpot(state, maintenance), "stockpile")) return [];
      if (!takeFromStock(state, spares(visit.spareComponents))) {
        // Another Robot took them first. This Maintenance now waits for
        // more, unless there is an array to clean meanwhile.
        if (!visit.cleaning) {
          robot.workOrder = undefined;
          robot.activity = { kind: "idle" };
          return [];
        }
        visit = { spareComponents: 0, cleaning: true };
      }
    }
    maintenance.visit = visit;
    robot.carrying = spares(visit.spareComponents);
  }
  const current = currentStep(maintenance.visit, maintenance.workedMinutes);
  if (current?.step === "loading-spare-components") {
    robot.activity = working("loading-components");
    maintenance.workedMinutes += robotPerformance(robot);
    return [];
  }
  if (current !== undefined) {
    if (!walkTo(maintenance.workSpot, "site")) return [];
    robot.activity =
      current.step === "cleaning" && worn.kind === "structure"
        ? { kind: "cleaning", structureId: worn.structure.id }
        : working("maintaining");
    maintenance.workedMinutes += robotPerformance(robot);
    if (
      currentStep(maintenance.visit, maintenance.workedMinutes) !== undefined
    ) {
      return [];
    }
  }
  robot.carrying = [];
  return finishMaintenance(state, maintenance, worn);
}

/**
 * Lets the Robot do one game-minute of parking a Machine or Rover: it walks
 * to it, then drives it, as fast as its Condition allows, to its spot
 * beside a powered Structure, where it plugs in.
 */
function park(
  state: CampaignState,
  robot: RobotState,
  parking: ParkingState,
): GameEvent[] {
  const driven = findDriven(state, parking.target);
  if (driven === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  const body = bodyOf(driven);
  if (samePlace(body.position, parking.destination)) {
    state.parking = state.parking.filter((other) => other !== parking);
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  if (!walkRobotToDriven(state, robot, driven, body.position, "there")) {
    return [];
  }
  const spec = drivenSpec(driven);
  body.position = stepTowards(
    body.position,
    parking.destination,
    {
      centre: state.lander.position,
      radius: LANDER_CLEARANCE_METRES + spec.footprintRadiusMetres,
    },
    (spec.drivingSpeedMetresPerHour * drivenPerformance(driven)) / 60,
  );
  robot.position = { ...body.position };
  const { structureId } = parking;
  if (driven.kind === "machine") {
    robot.activity = {
      kind: "driving-machine",
      structureId,
      machineId: driven.machine.id,
    };
    driven.machine.activity = { kind: "being-parked", structureId };
  } else {
    robot.activity = {
      kind: "driving-rover",
      roverId: driven.rover.id,
      structureId,
    };
    driven.rover.activity = { kind: "being-parked", structureId };
  }
  const broken = wearDriven(state, driven, spec.dustWearPercentPerDrivingHour);
  if (broken.length > 0) {
    state.parking = state.parking.filter((other) => other !== parking);
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
  }
  return broken;
}

/** Where a Robot stands to maintain a Machine or Rover: just outside it, on the side facing the stockpile. */
function besideDriven(state: CampaignState, driven: Driven): GroundPosition {
  const { position } = bodyOf(driven);
  const reach =
    drivenSpec(driven).footprintRadiusMetres +
    catalogue.robot.workingGapMetres / 2;
  const angle = Math.atan2(
    state.stockpile.position.y - position.y,
    state.stockpile.position.x - position.x,
  );
  return {
    x: position.x + Math.cos(angle) * reach,
    y: position.y + Math.sin(angle) * reach,
  };
}

/**
 * Walks the Robot one game-minute towards a spot, round the Lander, for
 * Maintenance or parking of a Machine or Rover: to the stockpile, or to
 * the Machine or Rover itself. Says whether it was already there.
 */
function walkRobotToDriven(
  state: CampaignState,
  robot: RobotState,
  driven: Driven,
  spot: GroundPosition,
  destination: "stockpile" | "there",
): boolean {
  if (samePlace(robot.position, spot)) return true;
  stepRobot(state, robot, spot);
  robot.activity =
    driven.kind === "machine"
      ? {
          kind: "walking",
          machineId: driven.machine.id,
          destination: destination === "there" ? "machine" : "stockpile",
        }
      : {
          kind: "walking",
          roverId: driven.rover.id,
          destination: destination === "there" ? "rover" : "stockpile",
        };
  return false;
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
  stepRobot(state, robot, spot);
  robot.activity = { kind: "walking", structureId, destination };
  return false;
}

/**
 * Walks the Robot one game-minute's step towards a spot, round the Lander,
 * as fast as its Condition allows.
 */
function stepRobot(
  state: CampaignState,
  robot: RobotState,
  spot: GroundPosition,
): void {
  robot.position = stepTowards(
    robot.position,
    spot,
    { centre: state.lander.position, radius: LANDER_CLEARANCE_METRES },
    (catalogue.robot.walkingSpeedMetresPerHour * robotPerformance(robot)) / 60,
  );
}

/**
 * Lets the Robot do one game-minute of repairing itself: it fetches the
 * spare Components it needs from the stockpile, if it set off for them,
 * and loads them, then walks to where the Mission Director lives and
 * repairs itself there. Anything it was carrying for its Work Order stays
 * with it.
 */
function repairItself(
  state: CampaignState,
  robot: RobotState,
  selfRepair: SelfRepairState,
): GameEvent[] {
  const walkTo = (
    spot: GroundPosition,
    destination: "stockpile" | "habitat" | "lander",
  ): boolean => {
    if (samePlace(robot.position, spot)) return true;
    stepRobot(state, robot, spot);
    robot.activity = { kind: "walking-to-repair", destination };
    return false;
  };
  if (selfRepair.spareComponents === undefined) {
    if (
      !walkTo(stockpileSpot(state, { workSpot: selfRepair.spot }), "stockpile")
    ) {
      return [];
    }
    const needed = spareComponentsFor(robot);
    // If they have gone meanwhile, the repair is a makeshift one.
    selfRepair.spareComponents = takeFromStock(state, spares(needed))
      ? needed
      : 0;
    addCounts(robot.carrying, spares(selfRepair.spareComponents));
  }
  const { loading, total } = selfRepairMinutes(selfRepair.spareComponents);
  if (selfRepair.workedMinutes < loading) {
    robot.activity = { kind: "loading-spare-components" };
    selfRepair.workedMinutes += 1;
    return [];
  }
  if (!walkTo(selfRepair.spot, selfRepair.home)) return [];
  robot.activity = { kind: "repairing-itself" };
  selfRepair.workedMinutes += 1;
  if (selfRepair.workedMinutes < total) return [];
  removeCounts(robot.carrying, spares(selfRepair.spareComponents));
  return finishSelfRepair(state, robot, selfRepair.spareComponents);
}

/**
 * Lets the Robot do one game-minute of an Expedition: it walks to the
 * Rover, drives it to the nearest map edge and off the map, is away for the
 * data catalogue's time, then drives back onto the map to the stockpile and
 * unloads what it brought back, which joins the base's stock. A Rover
 * Broken before it is driven off calls the Expedition off. Returns any
 * events.
 */
function goOnExpedition(
  state: CampaignState,
  robot: RobotState,
  expedition: ExpeditionState,
): GameEvent[] {
  const rover = state.rovers.find(
    (candidate) => candidate.id === expedition.roverId,
  );
  if (rover === undefined) {
    state.expedition = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  const atMinute = state.elapsedMinutes;
  /** Drives the Rover one game-minute towards a spot, and says whether it is there. */
  const drive = (spot: GroundPosition): boolean => {
    rover.position = stepTowards(
      rover.position,
      spot,
      {
        centre: state.lander.position,
        radius: LANDER_CLEARANCE_METRES + catalogue.rover.footprintRadiusMetres,
      },
      (catalogue.rover.drivingSpeedMetresPerHour * roverPerformance(rover)) /
        60,
    );
    robot.position = { ...rover.position };
    robot.activity = {
      kind: "driving-rover",
      roverId: rover.id,
      purpose: "expedition",
    };
    rover.activity = { kind: "on-expedition" };
    wearRoverOnExpedition(rover);
    return samePlace(rover.position, spot);
  };
  /** Drives the Rover back onto the map, beside the stockpile, to unload. */
  const driveBack = (): GameEvent[] => {
    if (drive(returnSpot(state, expedition.exitPoint ?? rover.position))) {
      expedition.stage = "unloading";
    }
    return [];
  };
  switch (expedition.stage) {
    case "boarding": {
      if (isRoverBroken(rover)) {
        state.expedition = undefined;
        robot.activity = { kind: "idle" };
        return [{ kind: "expedition-called-off", atMinute }];
      }
      const driven: Driven = { kind: "rover", rover };
      if (
        !walkRobotToDriven(
          state,
          robot,
          driven,
          besideDriven(state, driven),
          "there",
        )
      ) {
        return [];
      }
      expedition.stage = "driving-out";
      expedition.exitPoint = exitPointFrom(rover.position);
      return [];
    }
    case "driving-out": {
      const exit = expedition.exitPoint ?? exitPointFrom(rover.position);
      if (!drive(exit)) return [];
      expedition.stage = "away";
      expedition.returnsAtMinute = atMinute + awayMinutes();
      return [
        {
          kind: "expedition-left",
          atMinute,
          returnsAtMinute: expedition.returnsAtMinute,
        },
      ];
    }
    case "away":
      if (atMinute < (expedition.returnsAtMinute ?? atMinute)) {
        robot.activity = { kind: "on-expedition" };
        rover.activity = { kind: "on-expedition" };
        wearRoverOnExpedition(rover);
        return [];
      }
      expedition.stage = "driving-back";
      return driveBack();
    case "driving-back":
      return driveBack();
    case "unloading": {
      robot.activity = { kind: "unloading-expedition" };
      expedition.workedMinutes += robotPerformance(robot);
      if (expedition.workedMinutes < unloadingMinutes()) return [];
      const { resourceId, kilograms } = catalogue.expeditions;
      addBulk(state, resourceId, kilograms);
      state.expedition = undefined;
      return [{ kind: "expedition-returned", atMinute, resourceId, kilograms }];
    }
  }
}

/** Takes Components out of a list of counts, dropping any count that comes to none. */
function removeCounts(
  counts: ComponentCount[],
  removed: readonly ComponentCount[],
): void {
  for (const { componentId, count } of removed) {
    const index = counts.findIndex(
      (other) => other.componentId === componentId,
    );
    const existing = counts[index];
    if (existing === undefined) continue;
    const left = existing.count - count;
    if (left > 0) counts[index] = { componentId, count: left };
    else counts.splice(index, 1);
  }
}
