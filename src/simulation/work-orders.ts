import type { ComponentCount } from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  componentsFor,
  stageMachine,
  type ConstructionStage,
  type ConstructionState,
} from "./construction";
import { isDiggingWanted } from "./digging";
import { isSameDriven, type DrivenTarget } from "./driven";

import type { DismantlingStage } from "./dismantling";
import { isMachineBroken, machineOn, nearestFreeMachine } from "./machines";
import {
  findMaintenance,
  findMaintenanceWait,
  isUnderMaintenance,
} from "./maintenance";
import {
  findCable,
  nearestPoweredStructure,
  usesPower,
  type CableTarget,
} from "./power";
import { findStructureToReconnect } from "./reconnection";
import { inStock } from "./stockpile";

/**
 * A unit of the Robot's work on a Construction, on dismantling a Structure,
 * on laying cable to a Structure cut off from power, on unloading the
 * Lander, on Maintenance of a Structure, Machine or Rover, on parking a
 * Machine or Rover, or on setting a Machine digging. A Robot claims one at
 * a time and carries it out before it looks for another.
 */
export type WorkOrder =
  | {
      /**
       * The Structure it is for: one under Construction (whose id it keeps
       * once commissioned), one being dismantled, one cut off from power,
       * the landing pad the Lander being unloaded landed on, or one to be
       * maintained.
       */
      readonly structureId: string;
      readonly kind: StructureWorkOrderKind;
    }
  | {
      /** The Machine it is for. */
      readonly machineId: string;
      readonly kind: MachineWorkOrderKind;
    }
  | {
      /** The Rover it is for. */
      readonly roverId: string;
      readonly kind: RoverWorkOrderKind;
    };

/**
 * The kinds of Work Order on a Machine: Maintenance, parking it where it
 * can plug in, or setting it digging beside the stockpile.
 */
export type MachineWorkOrderKind = "maintain-machine" | "park-machine" | "dig";

/** The kinds of Work Order on a Rover: Maintenance, or parking it where it can plug in. */
export type RoverWorkOrderKind = "maintain-rover" | "park-rover";

export type WorkOrderKind =
  StructureWorkOrderKind | MachineWorkOrderKind | RoverWorkOrderKind;

/** The kinds of Work Order on a Structure. */
export type StructureWorkOrderKind =
  | "prepare-site"
  | "deliver-components"
  | "assemble"
  | "commission"
  | "lay-cable"
  | "dismantle"
  | "return-components"
  | "unload-lander"
  | "maintain";

/** Why nobody can work on a Construction for now. */
export type ConstructionWait =
  | {
      readonly reason: "missing-components";
      /** How many of each Component the base's stock is short of. */
      readonly missing: readonly ComponentCount[];
    }
  | {
      /**
       * No Machine that could carry out the stage is free: "machine-busy",
       * every one is working on another Construction; "machine-broken", one
       * is Broken, until it has been maintained; "machine-maintained", one is
       * undergoing Maintenance.
       */
      readonly reason: "machine-busy" | "machine-broken" | "machine-maintained";
      readonly machineTypeId: string;
    };

/** The Robot's Work Order at each stage of Construction. */
const workOrderKinds = {
  "site-preparation": "prepare-site",
  "component-delivery": "deliver-components",
  assembly: "assemble",
  commissioning: "commission",
} as const satisfies Record<ConstructionStage, WorkOrderKind>;

/** The Robot's Work Order at each stage of dismantling. */
const dismantlingKinds = {
  "taking-apart": "dismantle",
  "returning-components": "return-components",
} as const satisfies Record<DismantlingStage, WorkOrderKind>;

/** Says why a Construction is waiting, or undefined if it can be worked on. */
export function findWaitingReason(
  state: CampaignState,
  construction: ConstructionState,
): ConstructionWait | undefined {
  const missing = missingComponents(state, construction);
  if (missing.length > 0) return { reason: "missing-components", missing };
  const machineTypeId = stageMachine(construction)?.machineTypeId;
  if (machineTypeId === undefined) return undefined;
  if (
    machineOn(state, construction.id) !== undefined ||
    nearestFreeMachine(state, machineTypeId, construction.position) !==
      undefined
  ) {
    return undefined;
  }
  const idle = state.machines.filter(
    (machine) =>
      machine.machineTypeId === machineTypeId &&
      machine.assignment === undefined,
  );
  if (idle.some(isMachineBroken)) {
    return { reason: "machine-broken", machineTypeId };
  }
  return idle.some((machine) =>
    isUnderMaintenance(state, { kind: "machine", machineId: machine.id }),
  )
    ? { reason: "machine-maintained", machineTypeId }
    : { reason: "machine-busy", machineTypeId };
}

/**
 * The Components a Construction can't get from the base's stock, until it has
 * taken them. Constructions planned earlier have first claim on the stock, so
 * one that can't be supplied waits from the start and no work is spent on it.
 */
function missingComponents(
  state: CampaignState,
  construction: ConstructionState,
): ComponentCount[] {
  if (construction.componentsTaken) return [];
  const earlier = state.constructions.slice(
    0,
    state.constructions.indexOf(construction),
  );
  const claimedEarlier = (componentId: string) =>
    earlier
      .filter((other) => !other.componentsTaken)
      .flatMap((other) => componentsFor(other.structureTypeId))
      .filter((need) => need.componentId === componentId)
      .reduce((total, need) => total + need.count, 0);
  return componentsFor(construction.structureTypeId)
    .map((need) => {
      const left = Math.max(
        inStock(state, need.componentId) - claimedEarlier(need.componentId),
        0,
      );
      return { componentId: need.componentId, count: need.count - left };
    })
    .filter((shortfall) => shortfall.count > 0);
}

/**
 * Finds the Work Order a Robot should claim next: the first one that nobody
 * else has claimed and that can be worked on now. Maintenance comes first,
 * in the order it was raised, then parking Machines; then the
 * Constructions, dismantling, unloading of the Lander and cables to
 * Structures cut off from power, in the order they were planned; and last,
 * setting a Machine digging. Each Construction's current stage comes before
 * laying its cable, which can be done at any stage before Commissioning.
 */
export function claimWorkOrder(
  state: CampaignState,
  claimant: { readonly id: string },
): WorkOrder | undefined {
  const claimed = state.robots.flatMap((robot) =>
    robot.id === claimant.id || robot.workOrder === undefined
      ? []
      : [robot.workOrder],
  );
  const isFree = (workOrder: WorkOrder) =>
    !claimed.some((other) => isSameWorkOrder(other, workOrder));
  const free = (structureId: string, kind: StructureWorkOrderKind) =>
    isFree({ structureId, kind });
  for (const maintenance of state.maintenance) {
    const { target } = maintenance;
    const workOrder: WorkOrder =
      target.kind === "structure"
        ? { structureId: target.structureId, kind: "maintain" }
        : drivenWorkOrder(target, "maintain");
    if (
      isFree(workOrder) &&
      findMaintenanceWait(state, maintenance) === undefined
    ) {
      return workOrder;
    }
  }
  for (const parking of state.parking) {
    const workOrder = drivenWorkOrder(parking.target, "park");
    if (isFree(workOrder)) return workOrder;
  }
  const plans = [
    ...state.constructions.map((construction) => ({
      planNumber: construction.planNumber,
      structureId: construction.id,
      next: () =>
        [workOrderKinds[construction.stage], "lay-cable" as const].find(
          (kind) =>
            free(construction.id, kind) &&
            canBeWorkedOn(state, construction, kind),
        ),
    })),
    ...state.dismantlings.map((dismantling) => ({
      planNumber: dismantling.planNumber,
      structureId: dismantling.id,
      next: () => {
        const kind = dismantlingKinds[dismantling.stage];
        return free(dismantling.id, kind) ? kind : undefined;
      },
    })),
    ...(state.unloading === undefined
      ? []
      : [
          {
            planNumber: state.unloading.planNumber,
            structureId: state.unloading.landingPadId,
            next: () =>
              state.unloading !== undefined &&
              free(state.unloading.landingPadId, "unload-lander")
                ? ("unload-lander" as const)
                : undefined,
          },
        ]),
    ...state.reconnections.map((reconnection) => ({
      planNumber: reconnection.planNumber,
      structureId: reconnection.structureId,
      next: () => {
        const structure = findStructureToReconnect(
          state,
          reconnection.structureId,
        );
        return structure !== undefined &&
          free(structure.id, "lay-cable") &&
          needsCable(state, structure)
          ? ("lay-cable" as const)
          : undefined;
      },
    })),
  ].sort((a, b) => a.planNumber - b.planNumber);
  for (const { structureId, next } of plans) {
    const kind = next();
    if (kind !== undefined) return { structureId, kind };
  }
  for (const machine of state.machines) {
    const workOrder: WorkOrder = { machineId: machine.id, kind: "dig" };
    if (isFree(workOrder) && isDiggingWanted(state, machine)) return workOrder;
  }
  return undefined;
}

/** Whether a Robot can carry out a kind of Work Order on a Construction now. */
function canBeWorkedOn(
  state: CampaignState,
  construction: ConstructionState,
  kind: (typeof workOrderKinds)[ConstructionStage] | "lay-cable",
): boolean {
  switch (kind) {
    case "lay-cable":
      return (
        needsCable(state, construction) &&
        missingComponents(state, construction).length === 0
      );
    case "commission":
      return !needsCable(state, construction);
    case "prepare-site":
    case "deliver-components":
    case "assemble":
      // Once activated, a Machine carries out its stage without a Robot.
      return (
        findWaitingReason(state, construction) === undefined &&
        machineOn(state, construction.id)?.assignment?.working !== true
      );
  }
}

/**
 * Whether a Construction or Structure still needs its cable laid: it has
 * something to do with power, and it has a cable under way, or none yet and
 * there is a powered Structure to lay one from.
 */
export function needsCable(state: CampaignState, target: CableTarget): boolean {
  if (!usesPower(target.structureTypeId)) return false;
  const cable = findCable(state, target.id);
  return cable === undefined
    ? nearestPoweredStructure(state, target.position) !== undefined
    : !cable.complete;
}

/** The Work Order to maintain or park a Machine or Rover. */
export function drivenWorkOrder(
  target: DrivenTarget,
  work: "maintain" | "park",
): WorkOrder {
  return target.kind === "machine"
    ? {
        machineId: target.machineId,
        kind: work === "maintain" ? "maintain-machine" : "park-machine",
      }
    : {
        roverId: target.roverId,
        kind: work === "maintain" ? "maintain-rover" : "park-rover",
      };
}

/** Whether two Work Orders are the same one. */
export function isSameWorkOrder(a: WorkOrder, b: WorkOrder): boolean {
  if (a.kind !== b.kind) return false;
  if ("machineId" in a) return "machineId" in b && a.machineId === b.machineId;
  if ("roverId" in a) return "roverId" in b && a.roverId === b.roverId;
  return "structureId" in b && a.structureId === b.structureId;
}

/** The Structure a Work Order is for, or undefined if it is for a Machine, or there is none. */
export function structureOf(
  workOrder: WorkOrder | undefined,
): string | undefined {
  return workOrder !== undefined && "structureId" in workOrder
    ? workOrder.structureId
    : undefined;
}

/** Whether a claimed Work Order still has work left in it. */
export function isOpen(state: CampaignState, workOrder: WorkOrder): boolean {
  if ("roverId" in workOrder) {
    const target: DrivenTarget = { kind: "rover", roverId: workOrder.roverId };
    return workOrder.kind === "park-rover"
      ? state.parking.some((parking) => isSameDriven(parking.target, target))
      : findMaintenance(state, target) !== undefined;
  }
  if ("machineId" in workOrder) {
    const { machineId } = workOrder;
    const target: DrivenTarget = { kind: "machine", machineId };
    switch (workOrder.kind) {
      case "park-machine":
        return state.parking.some((parking) =>
          isSameDriven(parking.target, target),
        );
      case "maintain-machine":
        return (
          findMaintenance(state, { kind: "machine", machineId }) !== undefined
        );
      case "dig": {
        const machine = state.machines.find(
          (candidate) => candidate.id === machineId,
        );
        return machine !== undefined && isDiggingWanted(state, machine);
      }
    }
  }
  if (workOrder.kind === "maintain") {
    return (
      findMaintenance(state, {
        kind: "structure",
        structureId: workOrder.structureId,
      }) !== undefined
    );
  }
  if (workOrder.kind === "unload-lander") {
    return state.unloading?.landingPadId === workOrder.structureId;
  }
  const dismantling = state.dismantlings.find(
    (candidate) => candidate.id === workOrder.structureId,
  );
  if (dismantling !== undefined) {
    return dismantlingKinds[dismantling.stage] === workOrder.kind;
  }
  const structure = findStructureToReconnect(state, workOrder.structureId);
  if (structure !== undefined) {
    return workOrder.kind === "lay-cable" && needsCable(state, structure);
  }
  const construction = state.constructions.find(
    (candidate) => candidate.id === workOrder.structureId,
  );
  if (construction === undefined) return false;
  if (workOrder.kind === "lay-cable") return needsCable(state, construction);
  return (
    workOrderKinds[construction.stage] === workOrder.kind &&
    machineOn(state, construction.id)?.assignment?.working !== true
  );
}
