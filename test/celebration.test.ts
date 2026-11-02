import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type { GameEvent } from "../src/simulation";
import { findCelebration } from "../src/ui/celebration-text";

const last = catalogue.milestones.at(-1);
const first = catalogue.milestones[0];
const everyId = catalogue.milestones.map(({ id }) => id);

function reached(milestoneId: string): GameEvent {
  return { kind: "milestone-reached", atMinute: 60, milestoneId };
}

describe("the celebration", () => {
  it("is found as the last Milestone is reached with every other reached, among other events, with what it says", () => {
    if (last === undefined || first === undefined) {
      throw new Error("expected Milestones");
    }

    expect(
      findCelebration([reached(first.id), reached(last.id)], everyId),
    ).toEqual({
      title: "Ready for Crew",
      text: expect.stringMatching(/next phase/) as string,
    });
  });

  it("waits, if the last Milestone comes early, until every other is reached, and comes then", () => {
    if (last === undefined || first === undefined) {
      throw new Error("expected Milestones");
    }
    const allButFirst = everyId.filter((id) => id !== first.id);

    expect(findCelebration([reached(last.id)], allButFirst)).toBeUndefined();
    expect(findCelebration([reached(first.id)], everyId)).toMatchObject({
      title: "Ready for Crew",
    });
  });

  it("isn't found while the last Milestone is still to reach, nor for no Milestone at all", () => {
    if (first === undefined || last === undefined) {
      throw new Error("expected Milestones");
    }
    const allButLast = everyId.filter((id) => id !== last.id);

    expect(findCelebration([reached(first.id)], allButLast)).toBeUndefined();
    expect(findCelebration([], everyId)).toBeUndefined();
  });
});
