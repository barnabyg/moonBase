import type { Campaign } from "../simulation";

/**
 * The Campaign being played, which a Campaign loaded from a save can take
 * the place of. It passes every call on to whichever Campaign is in it now,
 * so the game loop and the interface can keep holding the slot.
 */
export interface CampaignSlot extends Campaign {
  /** Puts the given Campaign in place of the one in the slot. */
  replace(campaign: Campaign): void;
}

export function createCampaignSlot(first: Campaign): CampaignSlot {
  let current = first;
  return {
    advance: (gameMinutes) => current.advance(gameMinutes),
    advanceToNextEvent: () => current.advanceToNextEvent(),
    checkPlacement: (plan) => current.checkPlacement(plan),
    planConstruction: (plan) => current.planConstruction(plan),
    cancelConstruction: (constructionId) =>
      current.cancelConstruction(constructionId),
    dismantleStructure: (structureId) =>
      current.dismantleStructure(structureId),
    moveMissionDirectorIn: (habitatId) =>
      current.moveMissionDirectorIn(habitatId),
    forecasts: () => current.forecasts(),
    snapshot: () => current.snapshot(),
    save: () => current.save(),
    replace(campaign) {
      current = campaign;
    },
  };
}
