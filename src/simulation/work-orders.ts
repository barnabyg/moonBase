import type { ComponentCount } from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  componentsFor,
  type ConstructionStage,
  type ConstructionState,
} from "./construction";

/**
 * A unit of the Robot's work on a Construction. A Robot claims one at a time
 * and carries it out before it looks for another.
 */
export interface WorkOrder {
  readonly constructionId: string;
  readonly kind: WorkOrderKind;
}

export type WorkOrderKind =
  "prepare-site" | "deliver-components" | "assemble" | "commission";

/** Why nobody can work on a Construction for now. */
export type ConstructionWait = {
  readonly reason: "missing-components";
  /** How many of each Component the cargo stock is short of. */
  readonly missing: readonly ComponentCount[];
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
  if (
    construction.stage !== "component-delivery" ||
    construction.componentsTaken
  ) {
    return undefined;
  }
  const missing = componentsFor(construction.structureTypeId)
    .map((need) => ({
      componentId: need.componentId,
      count:
        need.count -
        (state.cargo.find((stock) => stock.componentId === need.componentId)
          ?.count ?? 0),
    }))
    .filter((shortfall) => shortfall.count > 0);
  return missing.length === 0
    ? undefined
    : { reason: "missing-components", missing };
}

/**
 * Finds the Work Order a Robot should claim next: the first one that nobody
 * else has claimed and that isn't waiting, taking the Constructions in the
 * order they were planned.
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
    const kind = workOrderKinds[construction.stage];
    if (
      claimed.some(
        (order) =>
          order.constructionId === construction.id && order.kind === kind,
      ) ||
      findWaitingReason(state, construction) !== undefined
    ) {
      continue;
    }
    return { constructionId: construction.id, kind };
  }
  return undefined;
}

/** Whether a claimed Work Order still has work left in it. */
export function isOpen(state: CampaignState, order: WorkOrder): boolean {
  const construction = state.constructions.find(
    (candidate) => candidate.id === order.constructionId,
  );
  return (
    construction !== undefined &&
    workOrderKinds[construction.stage] === order.kind
  );
}
