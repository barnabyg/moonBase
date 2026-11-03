import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
} from "../catalogue";
import type { CampaignState } from "./campaign";
import {
  chooseWorkSpot,
  findStructureType,
  shieldingOver,
  waterWallOver,
} from "./construction";
import { padUnderLander } from "./lander";
import { livesIn } from "./mission-director";
import type { CableState } from "./power";

/**
 * The stages of dismantling a Structure: the Robot takes it apart, then
 * carries the spare Components it recovers back to the base's stock at the
 * stockpile.
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
  if (padUnderLander(state)?.id === structureId) {
    return {
      ok: false,
      message:
        "The Lander stands on it. Send the Lander before dismantling it.",
    };
  }
  if (livesIn(state, structureId)) {
    return {
      ok: false,
      message:
        "The Mission Director lives in it. Move them to another Habitat first.",
    };
  }
  if (
    findStructureType(structure.structureTypeId)?.habitat === true &&
    shieldingOver(state, structure) !== undefined
  ) {
    return {
      ok: false,
      message:
        "Its Regolith shielding is over it, and must be dismantled first.",
    };
  }
  const type = findStructureType(structure.structureTypeId);
  const wall =
    type?.shieldsHabitat === true || type?.buried === true
      ? waterWallOver(state, structure)
      : undefined;
  if (wall !== undefined) {
    return {
      ok: false,
      message: `Its ${(findStructureType(wall.structureTypeId)?.label ?? "water wall").toLowerCase()} is over it, and must be dismantled first.`,
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
 * Components at the stockpile as long as unloading them at its site did.
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
 * leaves its power network, and any cable to or from it goes with it. What
 * drew power through it stays on the network, as the cables it joined stay
 * joined. Otherwise the Habitat the Mission Director lives in could be left
 * with too little to last, as on a battery bank of its own with the solar
 * arrays on another network, and the Robot would lay no cable to it, as it
 * would still have a power source.
 */
export function takeOffBase(state: CampaignState, structureId: string): void {
  const joined = state.cables.filter(
    (cable) =>
      cable.complete &&
      (cable.fromStructureId === structureId ||
        cable.toStructureId === structureId),
  );
  state.structures = state.structures.filter(
    (structure) => structure.id !== structureId,
  );
  state.cables = state.cables.filter(
    (cable) =>
      cable.fromStructureId !== structureId &&
      cable.toStructureId !== structureId,
  );
  joinUpCables(state, structureId, joined);
}

/**
 * Joins what a Structure's cables joined, now that it has gone: everything it
 * fed takes its power from whatever fed it, or if nothing did, from the first
 * of them, along the cables already lying there.
 */
function joinUpCables(
  state: CampaignState,
  structureId: string,
  joined: readonly CableState[],
): void {
  const incoming = joined.find((cable) => cable.toStructureId === structureId);
  const outgoing = joined.filter(
    (cable) => cable.fromStructureId === structureId,
  );
  const [first, ...rest] = outgoing;
  if (first === undefined) return;
  const feeds = incoming === undefined ? rest : outgoing;
  for (const cable of feeds) {
    state.cables.push(
      incoming === undefined
        ? {
            fromStructureId: first.toStructureId,
            toStructureId: cable.toStructureId,
            start: first.end,
            end: cable.end,
            route: [...[...first.route].reverse(), ...cable.route],
            complete: true,
          }
        : {
            fromStructureId: incoming.fromStructureId,
            toStructureId: cable.toStructureId,
            start: incoming.start,
            end: cable.end,
            route: [...incoming.route, ...cable.route],
            complete: true,
          },
    );
  }
}

/**
 * The Components recovered from a dismantled Structure: the spare Components
 * the data catalogue says it gives back, in place of what it was built from.
 */
export function recoveredComponents(structureTypeId: string): ComponentCount[] {
  const count =
    findStructureType(structureTypeId)?.dismantlingSpareComponents ?? 0;
  return count === 0
    ? []
    : [{ componentId: catalogue.maintenance.spareComponentId, count }];
}
