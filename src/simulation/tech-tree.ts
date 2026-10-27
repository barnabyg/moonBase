import { catalogue, type Design } from "../catalogue";
import type { CampaignState } from "./campaign";
import type { GameEvent } from "./events";

export type UnlockDesignRefusal =
  | "unknown-design"
  | "already-unlocked"
  | "prerequisite-missing"
  | "not-enough-science"
  | "campaign-ended";

/** A Design unlocked, as the notification of it says. */
export type DesignUnlockedEvent = Extract<
  GameEvent,
  { readonly kind: "design-unlocked" }
>;

export type UnlockDesignResult =
  | {
      readonly ok: true;
      /** The notification that it has been unlocked. */
      readonly event: DesignUnlockedEvent;
    }
  | {
      readonly ok: false;
      readonly reason: UnlockDesignRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

/** The ids of the Designs unlocked when a Campaign begins, in catalogue order. */
export function startingDesignIds(): string[] {
  return catalogue.designs
    .filter((design) => design.starting)
    .map((design) => design.id);
}

/**
 * Unlocks a Design at once, taking its cost off the base's Science, as long
 * as every Design it needs first is unlocked. It adds nothing to the base.
 */
export function unlockDesign(
  state: CampaignState,
  designId: string,
): UnlockDesignResult {
  const design = findDesign(designId);
  if (design === undefined) {
    return refuse(
      "unknown-design",
      `There is no Design called "${designId}" in the Tech Tree.`,
    );
  }
  if (state.unlockedDesignIds.includes(design.id)) {
    return refuse("already-unlocked", `${design.label} is already unlocked.`);
  }
  const missing = design.prerequisiteDesignIds.find(
    (id) => !state.unlockedDesignIds.includes(id),
  );
  if (missing !== undefined) {
    return refuse(
      "prerequisite-missing",
      `${design.label} needs ${designLabel(missing)} unlocked first.`,
    );
  }
  if (state.science < design.scienceCost) {
    return refuse(
      "not-enough-science",
      `${design.label} needs ${design.scienceCost} Science, and the base has ${state.science}.`,
    );
  }
  state.science -= design.scienceCost;
  state.unlockedDesignIds.push(design.id);
  return {
    ok: true,
    event: {
      kind: "design-unlocked",
      atMinute: state.elapsedMinutes,
      designId: design.id,
      science: design.scienceCost,
    },
  };
}

/** Whether a Design is unlocked; one the catalogue doesn't have never is. */
export function isDesignUnlocked(
  state: CampaignState,
  designId: string,
): boolean {
  return state.unlockedDesignIds.includes(designId);
}

/** Names a Design, for a refusal. */
export function designLabel(designId: string): string {
  return findDesign(designId)?.label ?? designId;
}

function findDesign(id: string): Design | undefined {
  return catalogue.designs.find((design) => design.id === id);
}

function refuse(
  reason: UnlockDesignRefusal,
  message: string,
): UnlockDesignResult {
  return { ok: false, reason, message };
}
