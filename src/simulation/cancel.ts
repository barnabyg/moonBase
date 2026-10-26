import type { ComponentCount } from "../catalogue";
import type { CampaignState } from "./campaign";
import { addToStock } from "./stockpile";
import { structureOf } from "./work-orders";
import {
  componentsFor,
  stageMinutes,
  type ConstructionState,
} from "./construction";

export type CancelResult =
  | {
      readonly ok: true;
      /** The unused Components that went back into the base's stock. */
      readonly returned: readonly ComponentCount[];
    }
  | { readonly ok: false; readonly message: string };

/**
 * The Components a Construction has taken from the base's stock and not yet
 * put into its Structure. Assembly uses them up one by one, so none are left
 * once Commissioning begins.
 */
export function unusedComponents(
  construction: ConstructionState,
): ComponentCount[] {
  if (!construction.componentsTaken) return [];
  const components = componentsFor(construction.structureTypeId);
  const total = components.reduce((sum, need) => sum + need.count, 0);
  let used = 0;
  if (construction.stage === "assembly") {
    const required = stageMinutes(construction);
    used =
      required === 0
        ? total
        : Math.floor((construction.workedMinutes / required) * total);
  } else if (construction.stage === "commissioning") {
    used = total;
  }
  // The Components are used in the order the data catalogue lists them.
  return components.flatMap((need) => {
    const usedHere = Math.min(need.count, used);
    used -= usedHere;
    return need.count > usedHere
      ? [{ componentId: need.componentId, count: need.count - usedHere }]
      : [];
  });
}

/**
 * Cancels an unfinished Construction: it is removed, along with any cable
 * being laid to it, and its unused Components go straight back into the
 * base's stock. Any Robot or Machine working on it stops.
 */
export function cancelConstruction(
  state: CampaignState,
  constructionId: string,
): CancelResult {
  const construction = state.constructions.find(
    (candidate) => candidate.id === constructionId,
  );
  if (construction === undefined) {
    return {
      ok: false,
      message: `There is no unfinished Construction "${constructionId}".`,
    };
  }
  const returned = unusedComponents(construction);
  addToStock(state, returned);
  state.constructions = state.constructions.filter(
    (other) => other !== construction,
  );
  state.cables = state.cables.filter(
    (cable) => cable.toStructureId !== constructionId,
  );
  for (const machine of state.machines) {
    if (machine.assignment?.constructionId === constructionId) {
      machine.assignment = undefined;
      machine.activity = { kind: "idle" };
    }
  }
  for (const robot of state.robots) {
    if (structureOf(robot.workOrder) === constructionId) {
      robot.workOrder = undefined;
      robot.carrying = [];
      robot.activity = { kind: "idle" };
    }
  }
  return { ok: true, returned };
}
