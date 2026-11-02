import { catalogue } from "../catalogue";
import type { GameEvent } from "../simulation";

/** What a celebration says: its title, and a paragraph under it. */
export interface Celebration {
  readonly title: string;
  readonly text: string;
}

/**
 * What to celebrate among the events of a game-minute: once a Milestone reached
 * then leaves none still to reach, the celebration of a Milestone that has one,
 * as the last does; undefined otherwise. So a Milestone with a celebration that
 * is reached before the others, as Milestones may be, is celebrated only as the
 * last of them is reached.
 */
export function findCelebration(
  events: readonly GameEvent[],
  reachedIds: readonly string[],
): Celebration | undefined {
  if (
    !events.some((event) => event.kind === "milestone-reached") ||
    catalogue.milestones.some(({ id }) => !reachedIds.includes(id))
  ) {
    return undefined;
  }
  return catalogue.milestones.find(
    (milestone) => milestone.celebration !== undefined,
  )?.celebration;
}
