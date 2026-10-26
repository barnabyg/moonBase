import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type { GroundPosition, Snapshot } from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

const solarArray = catalogue.structureTypes.find(
  (type) => type.id === "solar-array",
);
if (solarArray === undefined) throw new Error("expected a solar array");

const sites: readonly GroundPosition[] = [
  { x: 20, y: 12 },
  { x: -20, y: -15 },
  { x: 25, y: -20 },
];

/** Runs the game one game-minute at a time for a while, returning the state after every minute. */
function run(game: Scenario, minutes: number): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < minutes; minute++) {
    states.push(game.advance({ minutes: 1 }).state);
  }
  return states;
}

/** The Constructions the Robot worked on, in the order it started on them. */
function constructionsWorkedOn(states: Snapshot[]): string[] {
  const ids = states.flatMap((state) =>
    state.robots.flatMap((robot) =>
      robot.activity.kind === "idle" ? [] : [robot.activity.constructionId],
    ),
  );
  return ids.filter((id, index) => ids.indexOf(id) === index);
}

describe("several Constructions", () => {
  it("are worked on in the order they were planned", () => {
    const game = scenario()
      .plan("solar-array", sites[1] as GroundPosition)
      .plan("solar-array", sites[0] as GroundPosition);
    const [first, second] = game.state.constructions.map((c) => c.id);

    const states = run(game, 3 * 24 * 60);

    expect(constructionsWorkedOn(states)).toEqual([first, second]);
    // The first gets the cargo stock's only solar array, so it is commissioned.
    expect(game.state.structures).toEqual([
      expect.objectContaining({ id: first, position: sites[1] }),
    ]);
    const commissioned = states.findIndex((state) =>
      state.structures.some((structure) => structure.id === first),
    );
    const secondStarted = states.findIndex((state) =>
      state.robots.some(
        (robot) =>
          robot.activity.kind !== "idle" &&
          robot.activity.constructionId === second,
      ),
    );
    expect(secondStarted).toBeGreaterThan(commissioned);
  });

  it.each([
    ["solar-array", "battery-bank"],
    ["battery-bank", "solar-array"],
  ] as const)(
    "are commissioned in the order they were planned: %s, then %s",
    (first, second) => {
      const game = scenario()
        .plan(first, sites[0] as GroundPosition)
        .plan(second, sites[1] as GroundPosition);

      while (game.state.constructions.length > 0) {
        game.campaign.advanceToNextEvent();
      }

      expect(
        game.state.structures.map((structure) => structure.structureTypeId),
      ).toEqual([first, second]);
    },
  );

  it("leave a Construction whose Components aren't in stock waiting, with the reason, while the Robot moves on", () => {
    const game = scenario();
    for (const site of sites) game.plan("solar-array", site);
    const [, waiting, next] = game.state.constructions.map((c) => c.id);

    run(game, 3 * 24 * 60);

    const waitingConstruction = game.state.constructions.find(
      (construction) => construction.id === waiting,
    );
    expect(waitingConstruction).toMatchObject({
      stage: "component-delivery",
      stageProgress: 0,
      componentsTaken: false,
      waiting: { reason: "missing-components", missing: solarArray.components },
    });
    // The Robot moved on to the next Construction and prepared its site too.
    const nextConstruction = game.state.constructions.find(
      (construction) => construction.id === next,
    );
    expect(nextConstruction).toMatchObject({
      stage: "component-delivery",
      waiting: { reason: "missing-components" },
    });
    expect(game.state.robots[0]?.activity).toEqual({ kind: "idle" });
  });

  it("don't show a Construction as waiting for Components it can still get", () => {
    const game = scenario()
      .plan("solar-array", sites[0] as GroundPosition)
      .plan("solar-array", sites[1] as GroundPosition);

    for (const state of run(game, 6 * 60)) {
      for (const construction of state.constructions) {
        expect(construction.waiting?.reason).not.toBe("missing-components");
      }
    }
  });
});
