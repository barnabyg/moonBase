import { describe, expect, it, vi } from "vitest";
import type { Catalogue } from "../src/catalogue";
import type { GameEvent } from "../src/simulation";
import { scenario } from "./scenario";

// Two Robots at the landing site, and Dust wears nothing down, so that only
// Micrometeorites and their repairs of themselves change a Robot's
// Condition.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withTwoRobots } = await import("./two-robots");
  const { withoutDust } = await import("./without-dust");
  return {
    ...actual,
    catalogue: withTwoRobots(withoutDust(actual.catalogue)),
  };
});

describe("Micrometeorites with two Robots", () => {
  it("strike each Robot on its own, leaving the other's Condition as it was", () => {
    // A seed whose Micrometeorites strike both Robots within 20 Earth Days.
    const { campaign } = scenario(2);
    const expected = new Map([
      ["robot-1", 100],
      ["robot-2", 100],
    ]);
    const struck = new Set<string>();

    for (let minute = 0; minute < 20 * 24 * 60; minute++) {
      const events = campaign.advance(1);
      const robotEvents = events.flatMap((event: GameEvent) => {
        if (
          event.kind === "micrometeorite-strike" &&
          event.target.kind === "robot"
        ) {
          struck.add(event.target.robotId);
          console.log("STRUCK", event.target.robotId, event.atMinute / 1440);
          return [[event.target.robotId, event.conditionPercent] as const];
        }
        return event.kind === "robot-repaired"
          ? [[event.robotId, event.conditionPercent] as const]
          : [];
      });
      if (robotEvents.length === 0) continue;
      for (const [robotId, conditionPercent] of robotEvents) {
        expected.set(robotId, conditionPercent);
      }
      const robots = campaign.snapshot().robots;
      expect(
        new Map(robots.map((robot) => [robot.id, robot.conditionPercent])),
      ).toEqual(expected);
    }

    expect([...struck].sort()).toEqual(["robot-1", "robot-2"]);
  });
});

describe("determinism with two Robots", () => {
  it("gives identical snapshots for the same seed and the same commands", () => {
    const play = () => {
      const game = scenario(42)
        .plan("solar-array", { x: 20, y: 12 })
        .plan("light-mast", { x: -20, y: 12 })
        .advance({ hours: 5 });
      game.campaign.startExpedition();
      return game
        .plan("battery-bank", { x: -30, y: -10 })
        .advance({ earthDays: 12 }).state;
    };

    expect(play()).toEqual(play());
  });
});
