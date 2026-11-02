import { catalogue } from "../catalogue";
import type { GameEvent } from "../simulation";

/** What a celebration says: its title, and a paragraph under it. */
export interface Celebration {
  readonly title: string;
  readonly text: string;
}

/**
 * What to celebrate among the events of a game-minute: the celebration of a
 * Milestone reached then, if it has one; undefined otherwise.
 */
export function findCelebration(
  events: readonly GameEvent[],
): Celebration | undefined {
  for (const event of events) {
    if (event.kind !== "milestone-reached") continue;
    const celebration = catalogue.milestones.find(
      (milestone) => milestone.id === event.milestoneId,
    )?.celebration;
    if (celebration !== undefined) return celebration;
  }
  return undefined;
}
