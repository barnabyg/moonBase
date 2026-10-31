import { catalogue, type Design } from "../src/catalogue";
import type { Campaign } from "../src/simulation";

/**
 * Completes the Research Tasks on offer, one after another, until the base has
 * at least this much Science.
 */
export function earnScience(campaign: Campaign, science: number): void {
  for (const task of catalogue.researchTasks) {
    if (campaign.snapshot().science >= science) return;
    if (
      task.requiresDesignId !== undefined &&
      !campaign.snapshot().unlockedDesignIds.includes(task.requiresDesignId)
    ) {
      continue;
    }
    if (campaign.snapshot().completedResearchTaskIds.includes(task.id)) {
      continue;
    }
    const result = campaign.startResearchTask(task.id);
    if (!result.ok) throw new Error(result.message);
    campaign.advance(task.lengthHours * 60);
  }
  if (campaign.snapshot().science < science) {
    throw new Error(`The Research Tasks can't earn ${science} Science.`);
  }
}

/**
 * Unlocks a Design, unless it is unlocked already, first unlocking every
 * Design it needs first and earning the Science for it.
 */
export function unlock(campaign: Campaign, designId: string): void {
  if (campaign.snapshot().unlockedDesignIds.includes(designId)) return;
  const design = findDesign(designId);
  for (const needed of design.prerequisiteDesignIds) unlock(campaign, needed);
  earnScience(campaign, design.scienceCost);
  const result = campaign.unlockDesign(design.id);
  if (!result.ok) throw new Error(result.message);
}

export function findDesign(designId: string): Design {
  const design = catalogue.designs.find((entry) => entry.id === designId);
  if (design === undefined) throw new Error(`expected a Design ${designId}`);
  return design;
}

/** Whether a Design is unlocked when a Campaign begins. */
export function isStarting(designId: string): boolean {
  return findDesign(designId).starting;
}
