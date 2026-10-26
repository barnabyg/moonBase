import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import { padUnderLander } from "./lander";
import { addToStock } from "./stockpile";

/**
 * A plan to carry the cargo of the Lander, landed on a landing pad, to the
 * stockpile, which the Robot carries out as a Work Order in plan order.
 */
export interface UnloadingState {
  /** The landing pad the Lander landed on, which the Work Order is for. */
  landingPadId: string;
  /** Where it comes among the Mission Director's plans: after every plan made before the landing. */
  planNumber: number;
  /** The Components to carry: the Lander's cargo when it landed. */
  cargo: ComponentCount[];
  /** The Robot's working time so far, loading at the Lander and then unloading at the stockpile. */
  workedMinutes: number;
  /** Whether the Robot has taken the cargo off the Lander. */
  collected: boolean;
}

export interface UnloadingSnapshot {
  readonly landingPadId: string;
  /** Whether the Robot has taken the cargo off the Lander, to carry it to the stockpile. */
  readonly collected: boolean;
  /** How much of the current step's work is done, from 0 to 1: loading at the Lander, then unloading at the stockpile. */
  readonly stageProgress: number;
  readonly cargo: readonly ComponentCount[];
}

/**
 * Plans the unloading of the Lander when it stands on a landing pad with
 * cargo aboard, unless the cargo of an earlier landing is still on its way
 * to the stockpile.
 */
export function planUnloading(state: CampaignState): void {
  const pad = padUnderLander(state);
  if (
    state.unloading !== undefined ||
    pad === undefined ||
    state.lander.cargo.length === 0
  ) {
    return;
  }
  state.unloading = {
    landingPadId: pad.id,
    planNumber: state.nextPlanNumber,
    cargo: state.lander.cargo.map((count) => ({ ...count })),
    workedMinutes: 0,
    collected: false,
  };
  state.nextPlanNumber += 1;
}

/** The Robot's working time to load the cargo at the Lander, and in all, in game-minutes. */
export function cargoHandlingMinutes(): { loading: number; total: number } {
  const total = Math.round(catalogue.lander.cargoHandlingHours * 60);
  return { loading: Math.floor(total / 2), total };
}

/** Takes the cargo off the Lander as the Robot finishes loading it, and returns what it now carries. */
export function collectCargo(
  state: CampaignState,
  unloading: UnloadingState,
): ComponentCount[] {
  unloading.collected = true;
  unloading.workedMinutes = 0;
  state.lander.cargo = [];
  return unloading.cargo.map((count) => ({ ...count }));
}

/** Puts the cargo into the base's stock as the Robot finishes unloading it at the stockpile. */
export function finishUnloading(
  state: CampaignState,
  unloading: UnloadingState,
): void {
  addToStock(state, unloading.cargo);
  state.unloading = undefined;
}

/** Where the Robot stands to take the cargo off the Lander: beside it, on the side facing the stockpile. */
export function cargoSpot(state: CampaignState): GroundPosition {
  const lander = state.lander.position;
  const stockpile = state.stockpile.position;
  const angle = Math.atan2(stockpile.y - lander.y, stockpile.x - lander.x);
  const reach =
    catalogue.lander.footprintRadiusMetres + catalogue.robot.workingGapMetres;
  return {
    x: lander.x + Math.cos(angle) * reach,
    y: lander.y + Math.sin(angle) * reach,
  };
}

export function readUnloading(
  state: CampaignState,
): UnloadingSnapshot | undefined {
  const { unloading } = state;
  if (unloading === undefined) return undefined;
  const { loading, total } = cargoHandlingMinutes();
  const required = unloading.collected ? total - loading : loading;
  return {
    landingPadId: unloading.landingPadId,
    collected: unloading.collected,
    stageProgress:
      required === 0 ? 0 : Math.min(unloading.workedMinutes / required, 1),
    cargo: unloading.cargo.map((count) => ({ ...count })),
  };
}
