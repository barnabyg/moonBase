import type { CampaignState } from "./campaign";
import { findStructureType } from "./construction";
import { isDueToBeDismantled } from "./dismantling";

/** Where the Mission Director lives: aboard the Lander, or in a commissioned Habitat. */
export type MissionDirectorResidence =
  | { readonly residence: "lander" }
  | { readonly residence: "habitat"; readonly habitatId: string };

export type MoveInRefusal =
  | "already-moved-in"
  | "not-a-habitat"
  | "not-commissioned"
  | "being-dismantled"
  | "campaign-ended";

export type MoveInResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: MoveInRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

/**
 * Moves the Mission Director from the Lander into a commissioned Habitat, at
 * once and for good, whether or not the Habitat has power.
 */
export function moveMissionDirectorIn(
  state: CampaignState,
  habitatId: string,
): MoveInResult {
  if (state.missionDirector.residence === "habitat") {
    return refuse(
      "already-moved-in",
      "The Mission Director has already moved into a Habitat.",
    );
  }
  const construction = state.constructions.find(
    (candidate) => candidate.id === habitatId,
  );
  if (
    construction !== undefined &&
    findStructureType(construction.structureTypeId)?.habitat === true
  ) {
    return refuse(
      "not-commissioned",
      "The Habitat must be commissioned before the Mission Director can move in.",
    );
  }
  const structure = state.structures.find(
    (candidate) => candidate.id === habitatId,
  );
  if (
    structure === undefined ||
    findStructureType(structure.structureTypeId)?.habitat !== true
  ) {
    return refuse(
      "not-a-habitat",
      "The Mission Director can only move into a commissioned Habitat.",
    );
  }
  if (isDueToBeDismantled(state, habitatId)) {
    return refuse(
      "being-dismantled",
      "The Mission Director can't move into a Habitat that is to be dismantled.",
    );
  }
  state.missionDirector = { residence: "habitat", habitatId };
  return { ok: true };
}

/** Whether the Mission Director lives in the given Structure. */
export function livesIn(state: CampaignState, structureId: string): boolean {
  return (
    state.missionDirector.residence === "habitat" &&
    state.missionDirector.habitatId === structureId
  );
}

function refuse(reason: MoveInRefusal, message: string): MoveInResult {
  return { ok: false, reason, message };
}
