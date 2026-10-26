import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type {
  GroundPosition,
  RobotActivity,
  Snapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

const solarArray = catalogue.structureTypes.find(
  (type) => type.id === "solar-array",
);
if (solarArray === undefined) throw new Error("expected a solar array");
const site: GroundPosition = { x: 20, y: 12 };
const metresPerMinute = catalogue.robot.walkingSpeedMetresPerHour / 60;

function distanceBetween(a: GroundPosition, b: GroundPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function robotOf(state: Snapshot) {
  const [robot] = state.robots;
  if (robot === undefined) throw new Error("expected a Robot");
  return robot;
}

/**
 * Runs the game one game-minute at a time until no Construction is left,
 * returning the state after every minute.
 */
function runUntilBuilt(game: Scenario): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < 5 * 24 * 60; minute++) {
    game.advance({ minutes: 1 });
    states.push(game.state);
    if (game.state.constructions.length === 0) return states;
  }
  throw new Error("The Construction never finished.");
}

function minutesSpent(states: Snapshot[], kind: RobotActivity["kind"]) {
  return states.filter((state) => robotOf(state).activity.kind === kind).length;
}

function withoutRepeats<T>(values: T[]): T[] {
  return values.filter((value, index) => value !== values[index - 1]);
}

/** Seeds whose solar array is commissioned at the first attempt, or not. */
function findSeed(firstAttemptFails: boolean): number {
  for (let seed = 1; seed < 200; seed++) {
    const states = runUntilBuilt(scenario(seed).plan("solar-array", site));
    const failed = states.some((state) =>
      state.constructions.some((c) => c.failedCommissionings > 0),
    );
    if (failed === firstAttemptFails) return seed;
  }
  throw new Error("No seed found.");
}

describe("the Construction of a solar array", () => {
  it("goes through Site Preparation, Component delivery, Assembly and Commissioning, in that order", () => {
    const game = scenario().plan("solar-array", site);

    const states = runUntilBuilt(game);

    const stages = withoutRepeats(
      states.flatMap((state) =>
        state.constructions.map((construction) => construction.stage),
      ),
    );
    expect(stages).toEqual([
      "site-preparation",
      "component-delivery",
      "assembly",
      "commissioning",
    ]);
    expect(game.state.structures).toEqual([
      expect.objectContaining({
        structureTypeId: "solar-array",
        position: site,
      }),
    ]);
  });

  it("has the Robot walk at its walking speed, and work standing just outside the site", () => {
    const states = runUntilBuilt(scenario().plan("solar-array", site));

    for (const [index, state] of states.entries()) {
      const robot = robotOf(state);
      if (robot.activity.kind === "walking") {
        const before = robotOf(states[index - 1] ?? scenario().state);
        expect(
          distanceBetween(before.position, robot.position),
        ).toBeLessThanOrEqual(metresPerMinute + 1e-9);
      }
      if (
        robot.activity.kind === "assembling" ||
        robot.activity.kind === "commissioning"
      ) {
        const reach = distanceBetween(robot.position, site);
        expect(reach).toBeGreaterThan(solarArray.footprintRadiusMetres);
        expect(reach).toBeLessThanOrEqual(
          solarArray.footprintRadiusMetres +
            catalogue.robot.workingGapMetres +
            1e-9,
        );
      }
    }
  });

  it("spends the data catalogue's working time on each stage", () => {
    const states = runUntilBuilt(
      scenario(findSeed(false)).plan("solar-array", site),
    );
    const { stageHours } = solarArray;

    expect(
      states.filter((state) =>
        state.machines.some((machine) => machine.activity.kind === "working"),
      ),
    ).toHaveLength(stageHours.sitePreparation * 60);
    expect(
      minutesSpent(states, "loading-components") +
        minutesSpent(states, "unloading-components"),
    ).toBe(stageHours.componentDelivery * 60);
    expect(minutesSpent(states, "assembling")).toBe(stageHours.assembly * 60);
    expect(minutesSpent(states, "commissioning")).toBe(
      stageHours.commissioning * 60,
    );
  });

  it("shows each stage's progress rising from 0 to 1", () => {
    const states = runUntilBuilt(scenario().plan("solar-array", site));

    const assembly = states
      .flatMap((state) => state.constructions)
      .filter((construction) => construction.stage === "assembly")
      .map((construction) => construction.stageProgress);
    expect(assembly[0]).toBeLessThan(0.05);
    expect(assembly.at(-1)).toBeGreaterThan(0.95);
    expect(assembly).toEqual([...assembly].sort((a, b) => a - b));
  });

  it("takes the Components from the Lander's cargo stock during Component delivery", () => {
    const game = scenario();
    const startingStock = game.state.cargo;
    expect(startingStock).toEqual(catalogue.startingCargo);

    const states = runUntilBuilt(game.plan("solar-array", site));

    for (const state of states) {
      const [construction] = state.constructions;
      if (construction === undefined) continue;
      expect(construction.componentsTaken).toBe(
        !state.cargo.every(
          (stock, index) => stock.count === startingStock[index]?.count,
        ),
      );
    }
    const stockDuring = (stage: string) =>
      states.filter((state) => state.constructions[0]?.stage === stage);
    for (const state of stockDuring("site-preparation")) {
      expect(state.cargo).toEqual(startingStock);
    }
    const carried = states.filter(
      (state) => robotOf(state).carrying.length > 0,
    );
    expect(carried.length).toBeGreaterThan(0);
    for (const state of carried) {
      expect(state.constructions[0]?.stage).toBe("component-delivery");
      expect(robotOf(state).carrying).toEqual(solarArray.components);
    }
    expect(game.state.cargo).toEqual(
      startingStock.map((stock) => ({
        componentId: stock.componentId,
        count:
          stock.count -
          (solarArray.components.find(
            (need) => need.componentId === stock.componentId,
          )?.count ?? 0),
      })),
    );
  });

  it("has the Robot walk round the Lander rather than through it", () => {
    const farSide = { x: -25, y: 8 };
    const states = runUntilBuilt(scenario().plan("solar-array", farSide));

    for (const state of states) {
      expect(
        distanceBetween(robotOf(state).position, state.lander.position),
      ).toBeGreaterThan(catalogue.lander.footprintRadiusMetres);
    }
  });

  it.each([0, 45, 90, 135, 180, 225, 270, 315])(
    "commissions a solar array right beside the Lander, at %i° round it",
    (degrees) => {
      const reach =
        catalogue.lander.footprintRadiusMetres +
        solarArray.footprintRadiusMetres +
        0.5;
      const angle = (degrees * Math.PI) / 180;
      const game = scenario().plan("solar-array", {
        x: Math.cos(angle) * reach,
        y: Math.sin(angle) * reach,
      });

      runUntilBuilt(game);

      expect(game.state.structures).toHaveLength(1);
    },
  );

  it("has the excavator work from clear ground, not from inside a neighbouring Structure", () => {
    // The side of the first site away from the Lander lies inside the second.
    const first = { x: 20, y: 0 };
    const second = { x: 20 + solarArray.footprintRadiusMetres * 2 + 0.5, y: 0 };
    const game = scenario()
      .plan("solar-array", first)
      .plan("solar-array", second);
    const firstId = game.state.constructions[0]?.id;

    const grading: Snapshot[] = [];
    for (let minute = 0; minute < 24 * 60; minute++) {
      const state = game.advance({ minutes: 1 }).state;
      if (
        state.machines.some(
          (machine) =>
            machine.activity.kind === "working" &&
            machine.activity.constructionId === firstId,
        )
      ) {
        grading.push(state);
      }
    }
    expect(grading.length).toBeGreaterThan(0);
    for (const state of grading) {
      for (const machine of state.machines) {
        expect(
          distanceBetween(machine.position, second),
        ).toBeGreaterThanOrEqual(solarArray.footprintRadiusMetres);
      }
    }
  });

  it("retries a Commissioning that fails, until the solar array is commissioned", () => {
    const game = scenario(findSeed(true)).plan("solar-array", site);

    const states = runUntilBuilt(game);

    const failures = Math.max(
      ...states.flatMap((state) =>
        state.constructions.map((c) => c.failedCommissionings),
      ),
    );
    expect(failures).toBeGreaterThan(0);
    expect(minutesSpent(states, "commissioning")).toBe(
      (failures + 1) * solarArray.stageHours.commissioning * 60,
    );
    expect(game.state.structures).toHaveLength(1);
  });

  it("counts the solar array's completion as an event to skip to", () => {
    const { campaign } = scenario().plan("solar-array", site);

    const events = campaign.advanceToNextEvent();

    const { clock, structures } = campaign.snapshot();
    expect(events).toEqual([
      {
        kind: "construction-completed",
        atMinute: clock.elapsedMinutes,
        structureId: structures[0]?.id,
        structureTypeId: "solar-array",
      },
    ]);
    expect(campaign.snapshot().lunation.part).toBe("daylight");
  });

  it("leaves the Robot idle once there is no Construction left", () => {
    const game = scenario();
    expect(robotOf(game.state).activity).toEqual({ kind: "idle" });

    runUntilBuilt(game.plan("solar-array", site));
    game.advance({ minutes: 1 });

    expect(robotOf(game.state).activity).toEqual({ kind: "idle" });
  });
});
