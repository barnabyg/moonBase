import { catalogue, type ComponentCount } from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  componentsFor,
  type ConstructionStage,
  type ConstructionState,
  type StructureState,
} from "./construction";
import type { DismantlingStage } from "./dismantling";
import { machineOn, nearestFreeMachine } from "./machines";
import { findCable, nearestPoweredStructure, type CableTarget } from "./power";

/**
 * A unit of the Robot's work on a Construction, on dismantling a Structure,
 * or on laying cable to a Structure cut off from power. A Robot claims one at
 * a time and carries it out before it looks for another.
 */
export interface WorkOrder {
  /**
   * The Structure it is for: one under Construction (whose id it keeps once
   * commissioned), one being dismantled or one cut off from power.
   */
  readonly structureId: string;
  readonly kind: WorkOrderKind;
}

export type WorkOrderKind =
  | "prepare-site"
  | "deliver-components"
  | "assemble"
  | "commission"
  | "lay-cable"
  | "dismantle"
  | "return-components";

/** Why nobody can work on a Construction for now. */
export type ConstructionWait =
  | {
      readonly reason: "missing-components";
      /** How many of each Component the cargo stock is short of. */
      readonly missing: readonly ComponentCount[];
    }
  | {
      /** Every Machine that could do the stage is working on another Construction. */
      readonly reason: "machine-busy";
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
  if (construction.stage !== "site-preparation") return undefined;
  const machineTypeId = catalogue.sitePreparationMachineTypeId;
  return machineOn(state, construction.id) !== undefined ||
    nearestFreeMachine(state, machineTypeId, construction.position) !==
      undefined
    ? undefined
    : { reason: "machine-busy", machineTypeId };
}

/**
 * The Components a Construction can't get from the cargo stock, until it has
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
      const inStock =
        state.cargo.find((stock) => stock.componentId === need.componentId)
          ?.count ?? 0;
      const left = Math.max(inStock - claimedEarlier(need.componentId), 0);
      return { componentId: need.componentId, count: need.count - left };
    })
    .filter((shortfall) => shortfall.count > 0);
}

/**
 * Finds the Work Order a Robot should claim next: the first one that nobody
 * else has claimed and that can be worked on now, taking the Constructions,
 * dismantling and cables to Structures cut off from power in the order they
 * were planned. Each Construction's current stage comes before laying its
 * cable, which can be done at any stage before Commissioning.
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
  const free = (structureId: string, kind: WorkOrderKind) =>
    !claimed.some(
      (other) => other.structureId === structureId && other.kind === kind,
    );
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
    ...state.reconnections.map((reconnection) => ({
      planNumber: reconnection.planNumber,
      structureId: reconnection.structureId,
      next: () => {
        const structure = reconnecting(state, reconnection.structureId);
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
      // Once activated, the Machine grades the ground without a Robot.
      return (
        findWaitingReason(state, construction) === undefined &&
        machineOn(state, construction.id)?.assignment?.working !== true
      );
    case "deliver-components":
    case "assemble":
      return findWaitingReason(state, construction) === undefined;
  }
}

/**
 * Whether a Construction or Structure still needs its cable laid: it has a
 * cable under way, or none yet and there is a powered Structure to lay one
 * from.
 */
export function needsCable(state: CampaignState, target: CableTarget): boolean {
  const cable = findCable(state, target.id);
  return cable === undefined
    ? nearestPoweredStructure(state, target.position) !== undefined
    : !cable.complete;
}

/**
 * The commissioned Structure cut off from power that a cable is planned to,
 * unless it is due to be dismantled.
 */
export function reconnecting(
  state: CampaignState,
  structureId: string,
): StructureState | undefined {
  if (
    !state.reconnections.some(
      (reconnection) => reconnection.structureId === structureId,
    ) ||
    state.dismantlings.some((planned) => planned.id === structureId)
  ) {
    return undefined;
  }
  return state.structures.find((structure) => structure.id === structureId);
}

/** Whether a claimed Work Order still has work left in it. */
export function isOpen(state: CampaignState, workOrder: WorkOrder): boolean {
  const dismantling = state.dismantlings.find(
    (candidate) => candidate.id === workOrder.structureId,
  );
  if (dismantling !== undefined) {
    return dismantlingKinds[dismantling.stage] === workOrder.kind;
  }
  const structure = reconnecting(state, workOrder.structureId);
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
