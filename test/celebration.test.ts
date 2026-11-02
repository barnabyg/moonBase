import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type { GameEvent } from "../src/simulation";
import { findCelebration } from "../src/ui/celebration-text";

const last = catalogue.milestones.at(-1);
const first = catalogue.milestones[0];

function reached(milestoneId: string): GameEvent {
  return { kind: "milestone-reached", atMinute: 60, milestoneId };
}

describe("the celebration", () => {
  it("is found as the last Milestone is reached, among other events, with what it says", () => {
    if (last === undefined || first === undefined) {
      throw new Error("expected Milestones");
    }

    expect(findCelebration([reached(first.id), reached(last.id)])).toEqual({
      title: "Ready for Crew",
      text: expect.stringMatching(/next phase/) as string,
    });
  });

  it("isn't found for any other Milestone, nor for no Milestone at all", () => {
    if (first === undefined) throw new Error("expected Milestones");

    expect(findCelebration([reached(first.id)])).toBeUndefined();
    expect(findCelebration([])).toBeUndefined();
  });
});
