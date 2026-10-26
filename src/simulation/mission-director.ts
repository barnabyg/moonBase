import type { CampaignState } from "./campaign";
import type { DeathCause, GameEvent } from "./events";
import { findStructureType } from "./construction";
import { isDueToBeDismantled } from "./dismantling";

/** Where the Mission Director lives: aboard the Lander, or in a commissioned Habitat. */
export type MissionDirectorResidence =
  | { readonly residence: "lander" }
  | {
      readonly residence: "habitat";
      readonly habitatId: string;
      /** The game-minute they moved in, counted from the start of the Campaign. */
      readonly movedInAtMinute: number;
    };

export type MoveInRefusal =
  | "already-moved-in"
  | "not-a-habitat"
  | "not-commissioned"
  | "being-dismantled"
  | "no-power"
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
 * Moves the Mission Director from the Lander into a commissioned Habitat
 * that has power, at once and for good. Losing its power would kill them.
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
  if (!structure.powered) {
    return refuse(
      "no-power",
      "The Habitat has no power, and the Mission Director can't live in it without.",
    );
  }
  state.missionDirector = {
    residence: "habitat",
    habitatId,
    movedInAtMinute: state.elapsedMinutes,
  };
  return { ok: true };
}

/** Whether the Mission Director lives in the given Structure. */
export function livesIn(state: CampaignState, structureId: string): boolean {
  return (
    state.missionDirector.residence === "habitat" &&
    state.missionDirector.habitatId === structureId
  );
}

/**
 * Kills the Mission Director at once, which ends the Campaign, and returns
 * the event that records it.
 */
export function killMissionDirector(
  state: CampaignState,
  cause: DeathCause,
): GameEvent[] {
  state.ended = { atMinute: state.elapsedMinutes, cause };
  return [
    { kind: "mission-director-died", atMinute: state.elapsedMinutes, cause },
  ];
}

/**
 * Whether the time left before something kills the Mission Director fell to
 * one of the warning levels during the game-minute, all in game-minutes.
 */
export function fellToWarningLevel(
  warningMinutes: readonly number[],
  before: number,
  after: number,
): boolean {
  return warningMinutes.some((level) => before > level && after <= level);
}

function refuse(reason: MoveInRefusal, message: string): MoveInResult {
  return { ok: false, reason, message };
}
