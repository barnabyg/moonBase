import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type {
  GroundPosition,
  MachineSnapshot,
  RobotSnapshot,
  Snapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

const excavatorType = catalogue.machineTypes.find(
  (type) => type.id === "excavator",
);
const solarArray = catalogue.structureTypes.find(
  (type) => type.id === "solar-array",
);
const batteryBank = catalogue.structureTypes.find(
  (type) => type.id === "battery-bank",
);
if (
  excavatorType === undefined ||
  solarArray === undefined ||
  batteryBank === undefined
) {
  throw new Error("expected an excavator, a solar array and a battery bank");
}
const site: GroundPosition = { x: 20, y: 12 };
const otherSite: GroundPosition = { x: -20, y: -15 };

function distanceBetween(a: GroundPosition, b: GroundPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function robotOf(state: Snapshot): RobotSnapshot {
  const [robot] = state.robots;
  if (robot === undefined) throw new Error("expected a Robot");
  return robot;
}

function excavatorOf(state: Snapshot): MachineSnapshot {
  const excavator = state.machines.find(
    (machine) => machine.machineTypeId === "excavator",
  );
  if (excavator === undefined) throw new Error("expected an excavator");
  return excavator;
}

/** Runs the game one game-minute at a time, returning the state after every minute. */
function run(game: Scenario, minutes: number): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < minutes; minute++) {
    states.push(game.advance({ minutes: 1 }).state);
  }
  return states;
}

/** The states up to the end of the first Construction's Site Preparation. */
function untilSitePrepared(game: Scenario): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < 24 * 60; minute++) {
    const state = game.advance({ minutes: 1 }).state;
    states.push(state);
    if (state.constructions[0]?.stage !== "site-preparation") return states;
  }
  throw new Error("Site Preparation never finished.");
}

function withoutRepeats<T>(values: T[]): T[] {
  return values.filter((value, index) => value !== values[index - 1]);
}

describe("the excavator", () => {
  it("has landed with the Lander, and stands idle where the data catalogue puts it", () => {
    const { state } = scenario();

    expect(excavatorOf(state)).toMatchObject({
      activity: { kind: "idle" },
      position: catalogue.landingSite.machines.find(
        (machine) => machine.machineTypeId === "excavator",
      )?.position,
    });
  });

  it("is walked to, driven to the site and activated by the Robot during Site Preparation", () => {
    const game = scenario().plan("solar-array", site);
    const start = excavatorOf(game.state).position;

    const states = untilSitePrepared(game);

    const robotSteps = withoutRepeats(
      states.map((state) => robotOf(state).activity.kind),
    );
    expect(robotSteps.slice(0, 5)).toEqual([
      "walking",
      "driving-machine",
      // Climbing down to the controls beside it.
      "walking",
      "activating-machine",
      "idle",
    ]);
    const firstDrive = states.find(
      (state) => robotOf(state).activity.kind === "driving-machine",
    );
    expect(firstDrive && robotOf(firstDrive).position).toEqual(
      firstDrive && excavatorOf(firstDrive).position,
    );
    // The last minute, the Robot sets off for the Components.
    for (const state of states.slice(0, -1)) {
      const { activity, position } = robotOf(state);
      if (activity.kind === "walking") {
        expect(activity).toMatchObject({ destination: "machine" });
      }
      // It activates the excavator from the ground beside it, not from inside it.
      if (activity.kind === "activating-machine") {
        expect(
          distanceBetween(position, excavatorOf(state).position),
        ).toBeGreaterThan(excavatorType.footprintRadiusMetres);
      }
    }
    // It now stands just outside the site's footprint, ready to grade it.
    const parked = excavatorOf(game.state).position;
    expect(parked).not.toEqual(start);
    expect(distanceBetween(parked, site)).toBeGreaterThanOrEqual(
      solarArray.footprintRadiusMetres + excavatorType.footprintRadiusMetres,
    );
    expect(distanceBetween(parked, site)).toBeLessThanOrEqual(
      solarArray.footprintRadiusMetres +
        excavatorType.footprintRadiusMetres +
        catalogue.robot.workingGapMetres,
    );
  });

  it("is driven at its driving speed, round the Lander", () => {
    const game = scenario().plan("solar-array", { x: 25, y: 5 });
    let previous = excavatorOf(game.state).position;

    for (const state of untilSitePrepared(game)) {
      const { position } = excavatorOf(state);
      expect(distanceBetween(previous, position)).toBeLessThanOrEqual(
        excavatorType.drivingSpeedMetresPerHour / 60 + 1e-9,
      );
      expect(distanceBetween(position, state.lander.position)).toBeGreaterThan(
        catalogue.lander.footprintRadiusMetres +
          excavatorType.footprintRadiusMetres,
      );
      previous = position;
    }
  });

  it("takes the Robot the excavator's activation time to activate", () => {
    const states = untilSitePrepared(scenario().plan("solar-array", site));

    expect(
      states.filter(
        (state) => robotOf(state).activity.kind === "activating-machine",
      ),
    ).toHaveLength(excavatorType.activationHours * 60);
  });

  it("then grades the ground by itself for the Site Preparation time, without the Robot", () => {
    const game = scenario().plan("solar-array", site);
    const id = game.state.constructions[0]?.id;

    const states = untilSitePrepared(game);

    const grading = states.filter(
      (state) => excavatorOf(state).activity.kind === "working",
    );
    expect(grading).toHaveLength(solarArray.stageHours.sitePreparation * 60);
    for (const state of grading) {
      expect(excavatorOf(state).activity).toEqual({
        kind: "working",
        constructionId: id,
      });
    }
    // The Robot has no part in the grading, so it is free for other Work
    // Orders. Here there are none until the ground is graded, when it sets
    // off for the Components in the same game-minute.
    for (const state of grading.slice(0, -1)) {
      expect(robotOf(state).activity).toEqual({ kind: "idle" });
    }
    expect(robotOf(game.state).activity).toMatchObject({
      kind: "walking",
      structureId: id,
      destination: "lander",
    });
    // On the last minute the ground is graded and Component delivery begins.
    const progress = grading
      .slice(0, -1)
      .map((state) => state.constructions[0]?.stageProgress ?? 0);
    expect(progress[0]).toBeLessThan(0.05);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(game.state.constructions[0]?.stage).toBe("component-delivery");
  });

  it("sits idle at the site once Site Preparation is done, until it is needed again", () => {
    const game = scenario().plan("solar-array", site);
    untilSitePrepared(game);
    const parked = excavatorOf(game.state).position;

    const states = run(game, 2 * 24 * 60);

    expect(game.state.structures).toHaveLength(1);
    for (const state of states) {
      expect(excavatorOf(state)).toMatchObject({
        position: parked,
        activity: { kind: "idle" },
      });
    }
  });

  it("is driven on to the next site when the next Construction needs it", () => {
    const game = scenario()
      .plan("solar-array", site)
      .plan("battery-bank", otherSite);
    const [first, second] = game.state.constructions.map((c) => c.id);

    const states = run(game, 3 * 24 * 60);

    // While the first site is being graded, the second has to wait.
    const busyElsewhere = states.filter((state) =>
      state.constructions.some(
        (construction) =>
          construction.id === first &&
          construction.stage === "site-preparation" &&
          construction.stageProgress > 0,
      ),
    );
    expect(busyElsewhere.length).toBeGreaterThan(0);
    for (const state of busyElsewhere) {
      expect(
        state.constructions.find((construction) => construction.id === second)
          ?.waiting,
      ).toEqual({ reason: "machine-busy", machineTypeId: "excavator" });
    }
    expect(
      distanceBetween(excavatorOf(game.state).position, otherSite),
    ).toBeLessThanOrEqual(
      batteryBank.footprintRadiusMetres +
        excavatorType.footprintRadiusMetres +
        catalogue.robot.workingGapMetres,
    );
    expect(game.state.structures.map((structure) => structure.id)).toEqual([
      first,
      second,
    ]);
  });

  it("can't have a Structure placed over it", () => {
    const { campaign, state } = scenario();
    const { position } = excavatorOf(state);

    expect(
      campaign.planConstruction({
        structureTypeId: "solar-array",
        position: {
          x: position.x - solarArray.footprintRadiusMetres,
          y: position.y - 1,
        },
      }),
    ).toMatchObject({
      ok: false,
      reason: "overlaps-machine",
      message: "The solar array would overlap the excavator.",
    });
  });
});
