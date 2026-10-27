import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  putExportsAboard,
  takeExportsFromStock,
  type ExportLine,
} from "./exports";
import { padUnderLander } from "./lander";
import type { RobotState } from "./robot";

/**
 * A plan to carry the Exports to load from the stockpile to the Lander,
 * standing on a landing pad, which the Robot carries out as a Work Order in
 * plan order. The Exports it carries are the Exports to load: until it
 * loads them at the stockpile, the player can change them, and clearing
 * them cancels it.
 */
export interface ExportLoadingState {
  /** The landing pad the Lander stands on, which the Work Order is for. */
  landingPadId: string;
  /** Where it comes among the Mission Director's plans: after every plan made before the Exports were set. */
  planNumber: number;
  /** The Robot's working time so far, loading at the stockpile and then putting them aboard the Lander. */
  workedMinutes: number;
  /** Whether the Robot has loaded the Exports at the stockpile, taking them out of the base's stock. */
  collected: boolean;
}

export interface ExportLoadingSnapshot {
  readonly landingPadId: string;
  /** Whether the Robot has loaded the Exports at the stockpile, to carry them to the Lander. */
  readonly collected: boolean;
  /** How much of the current step's work is done, from 0 to 1: loading at the stockpile, then putting them aboard the Lander. */
  readonly stageProgress: number;
  readonly exports: readonly ExportLine[];
}

/**
 * Plans the loading of the Exports to load onto the Lander when it stands
 * on a working landing pad, unless it is planned already, and cancels it
 * once there are none to load before the Robot has loaded them. At the
 * landing site, beside the stockpile, they go aboard as the Lander takes
 * off instead, with no Work Order.
 */
export function planExportLoading(state: CampaignState): void {
  if (state.exportsToLoad.length === 0) {
    if (state.exportLoading?.collected === false) {
      state.exportLoading = undefined;
    }
    return;
  }
  const pad = padUnderLander(state);
  if (state.exportLoading !== undefined || pad === undefined) return;
  state.exportLoading = {
    landingPadId: pad.id,
    planNumber: state.nextPlanNumber,
    workedMinutes: 0,
    collected: false,
  };
  state.nextPlanNumber += 1;
}

/** The Robot's working time to load the Exports at the stockpile, and in all, in game-minutes. */
export function exportHandlingMinutes(): { loading: number; total: number } {
  const total = Math.round(catalogue.lander.exportHandlingHours * 60);
  return { loading: Math.floor(total / 2), total };
}

/**
 * Takes the Exports to load out of the base's stock as the Robot finishes
 * loading them at the stockpile. If the stock has fallen below them since
 * they were set, it takes what there is, as the Lander does taking off from
 * the landing site, and that is what it carries. With none left at all,
 * there is nothing to carry, and the Work Order is over.
 */
export function collectExports(
  state: CampaignState,
  loading: ExportLoadingState,
): void {
  takeExportsFromStock(state);
  loading.collected = true;
  loading.workedMinutes = 0;
  if (state.exportsToLoad.length === 0) state.exportLoading = undefined;
}

/** Puts the Exports aboard the Lander as the Robot finishes there, and returns them. */
export function finishExportLoading(state: CampaignState): ExportLine[] {
  state.exportLoading = undefined;
  return putExportsAboard(state);
}

/** The Exports a Robot is carrying to the Lander: none unless it has loaded them for it. */
export function exportsCarriedBy(
  state: CampaignState,
  robot: RobotState,
): ExportLine[] {
  return state.exportLoading?.collected === true &&
    robot.workOrder?.kind === "load-lander"
    ? state.exportsToLoad.map((line) => ({ ...line }))
    : [];
}

export function readExportLoading(
  state: CampaignState,
): ExportLoadingSnapshot | undefined {
  const loading = state.exportLoading;
  if (loading === undefined) return undefined;
  const { loading: loadingMinutes, total } = exportHandlingMinutes();
  const required = loading.collected ? total - loadingMinutes : loadingMinutes;
  return {
    landingPadId: loading.landingPadId,
    collected: loading.collected,
    stageProgress:
      required === 0 ? 0 : Math.min(loading.workedMinutes / required, 1),
    exports: state.exportsToLoad.map((line) => ({ ...line })),
  };
}
