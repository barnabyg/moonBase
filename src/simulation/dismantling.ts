import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  chooseWorkSpot,
  componentsFor,
  findStructureType,
} from "./construction";
import { livesIn } from "./mission-director";

/**
 * The stages of dismantling a Structure: the Robot takes it apart, then
 * carries the Components it recovers back to the Lander's cargo stock.
 */
export type DismantlingStage = "taking-apart" | "returning-components";

export interface DismantlingState {
  /** The id of the Structure being dismantled. */
  id: string;
  structureTypeId: string;
  position: GroundPosition;
  /** Where in the Mission Director's plans it comes, among Constructions and other dismantling. */
  planNumber: number;
  /** Where the Robot stands to take it apart. */
  workSpot: GroundPosition;
  stage: DismantlingStage;
  /** The Robot's working time spent on the current stage so far. */
  workedMinutes: number;
  /** The Components recovered once it has been taken apart; none before. */
  recovered: ComponentCount[];
  /** Whether a Robot has picked up the recovered Components to carry them away. */
  collected: boolean;
}

export type DismantleResult =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * Plans the dismantling of a commissioned Structure. The Robot carries it
 * out as Work Orders, in plan order; the Structure keeps working until the
 * Robot starts taking it apart.
 */
export function dismantleStructure(
  state: CampaignState,
  structureId: string,
): DismantleResult {
  const structure = state.structures.find(
    (candidate) => candidate.id === structureId,
  );
  if (structure === undefined) {
    return {
      ok: false,
      message: `There is no commissioned Structure "${structureId}".`,
    };
  }
  if (isDueToBeDismantled(state, structureId)) {
    return { ok: false, message: "It is already being dismantled." };
  }
  if (livesIn(state, structureId)) {
    return {
      ok: false,
      message: "The Mission Director lives in it, and can't move out.",
    };
  }
  state.dismantlings.push({
    id: structure.id,
    structureTypeId: structure.structureTypeId,
    position: { ...structure.position },
    planNumber: state.nextPlanNumber,
    workSpot: chooseWorkSpot(state, structure),
    stage: "taking-apart",
    workedMinutes: 0,
    recovered: [],
    collected: false,
  });
  state.nextPlanNumber += 1;
  return { ok: true };
}

/** Whether a Structure's dismantling has been planned, and it isn't gone yet. */
export function isDueToBeDismantled(
  state: CampaignState,
  structureId: string,
): boolean {
  return state.dismantlings.some((planned) => planned.id === structureId);
}

/**
 * The Robot's working time the current stage needs, in game-minutes: taking
 * a Structure apart takes as long as assembling it, and unloading its
 * Components at the Lander as long as unloading them at its site did.
 */
export function dismantlingStageMinutes(dismantling: DismantlingState): number {
  const hours = findStructureType(dismantling.structureTypeId)?.stageHours;
  if (hours === undefined) return 0;
  if (dismantling.stage === "taking-apart") {
    return Math.round(hours.assembly * 60);
  }
  const delivery = Math.round(hours.componentDelivery * 60);
  return delivery - Math.floor(delivery / 2);
}

/**
 * Takes a Structure off the base as the Robot starts taking it apart: it
 * leaves its power network, and any cable to or from it goes with it.
 */
export function takeOffBase(state: CampaignState, structureId: string): void {
  state.structures = state.structures.filter(
    (structure) => structure.id !== structureId,
  );
  state.cables = state.cables.filter(
    (cable) =>
      cable.fromStructureId !== structureId &&
      cable.toStructureId !== structureId,
  );
}

/**
 * The Components recovered from a dismantled Structure. The data
 * catalogue's share of them, rounded to the nearest whole Component, is
 * damaged beyond reuse, taken from whichever Component it has most of.
 */
export function recoveredComponents(structureTypeId: string): ComponentCount[] {
  const recovered: { componentId: string; count: number }[] =
    componentsFor(structureTypeId);
  const total = recovered.reduce((sum, need) => sum + need.count, 0);
  const lost = Math.round(total * catalogue.dismantlingLossShare);
  for (let index = 0; index < lost; index++) {
    // The earlier Component in the data catalogue wins a tie.
    const most = recovered.reduce<(typeof recovered)[number] | undefined>(
      (best, count) =>
        best === undefined || count.count > best.count ? count : best,
      undefined,
    );
    if (most !== undefined) most.count -= 1;
  }
  return recovered.filter((count) => count.count > 0);
}
