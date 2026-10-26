import { catalogue, type ComponentCount } from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  componentsFor,
  type ConstructionStage,
  type ConstructionState,
} from "./construction";
import { machineOn, nearestFreeMachine } from "./machines";
import { nearestPoweredStructure } from "./power";

/**
 * A unit of the Robot's work on a Construction. A Robot claims one at a time
 * and carries it out before it looks for another.
 */
export interface WorkOrder {
  readonly constructionId: string;
  readonly kind: WorkOrderKind;
}

export type WorkOrderKind =
  | "prepare-site"
  | "deliver-components"
  | "assemble"
  | "commission"
  | "lay-cable";

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
 * else has claimed and that can be worked on now, taking the Constructions in
 * the order they were planned. Each Construction's current stage comes before
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
  for (const construction of state.constructions) {
    for (const kind of [
      workOrderKinds[construction.stage],
      "lay-cable",
    ] as const) {
      if (
        !claimed.some(
          (order) =>
            order.constructionId === construction.id && order.kind === kind,
        ) &&
        canBeWorkedOn(state, construction, kind)
      ) {
        return { constructionId: construction.id, kind };
      }
    }
  }
  return undefined;
}

/** Whether a Robot can carry out a kind of Work Order on a Construction now. */
function canBeWorkedOn(
  state: CampaignState,
  construction: ConstructionState,
  kind: WorkOrderKind,
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
        machineOn(state, construction.id)?.task?.working !== true
      );
    case "deliver-components":
    case "assemble":
      return findWaitingReason(state, construction) === undefined;
  }
}

/**
 * Whether a Construction still needs its cable laid: it has a cable under way,
 * or none yet and there is a powered Structure to lay one from.
 */
export function needsCable(
  state: CampaignState,
  construction: ConstructionState,
): boolean {
  const cable = state.cables.find(
    (candidate) => candidate.toStructureId === construction.id,
  );
  return cable === undefined
    ? nearestPoweredStructure(state, construction.position) !== undefined
    : !cable.complete;
}

/** Whether a claimed Work Order still has work left in it. */
export function isOpen(state: CampaignState, order: WorkOrder): boolean {
  const construction = state.constructions.find(
    (candidate) => candidate.id === order.constructionId,
  );
  if (construction === undefined) return false;
  if (order.kind === "lay-cable") return needsCable(state, construction);
  return (
    workOrderKinds[construction.stage] === order.kind &&
    machineOn(state, construction.id)?.task?.working !== true
  );
}
