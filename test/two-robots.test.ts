import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import type {
  Campaign,
  GameEvent,
  GroundPosition,
  RobotActivity,
  RobotSnapshot,
  Snapshot,
} from "../src/simulation";
import { scenario, toGameMinutes, type Scenario } from "./scenario";
import {
  describeWork,
  formatEvent,
  isEveryRobotOnExpedition,
  isFor,
  robotLabel,
} from "../src/ui/format";
import { changed, withSpares, worn } from "./worn";

// Two Robots at the landing site; nothing strikes at random, and nobody
// digs Regolith, so that they have nothing to do but what a test gives them.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withTwoRobots } = await import("./two-robots");
  const { withoutDigging } = await import("./without-digging");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  return {
    ...actual,
    catalogue: withTwoRobots(
      withoutMicrometeorites(withoutDigging(actual.catalogue)),
    ),
  };
});

const firstSite: GroundPosition = { x: 20, y: 12 };
const secondSite: GroundPosition = { x: -20, y: 12 };
const { parkingLeadHours } = catalogue.cold;
const { spareComponentId } = catalogue.maintenance;

/** Runs the game one game-minute at a time for as long as given, or until a condition holds, returning the state after every minute. */
function runUntil(
  game: Scenario,
  done: (state: Snapshot) => boolean,
  minutes = 5 * 24 * 60,
): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < minutes; minute++) {
    game.advance({ minutes: 1 });
    states.push(game.state);
    if (done(game.state)) return states;
  }
  throw new Error("The condition never held.");
}

/** The Structure a Robot's activity is for, if any. */
function structureOf(activity: RobotActivity): string | undefined {
  return "structureId" in activity ? activity.structureId : undefined;
}

function onMap(position: GroundPosition): boolean {
  return (
    Math.abs(position.x) <= catalogue.map.widthMetres / 2 &&
    Math.abs(position.y) <= catalogue.map.depthMetres / 2
  );
}

/** A scenario that goes on from a Campaign, such as one loaded from a save. */
function scenarioOf(campaign: Campaign): Scenario {
  const self: Scenario = {
    campaign,
    advance(duration) {
      campaign.advance(toGameMinutes(duration));
      return self;
    },
    plan(structureTypeId, position) {
      const result = campaign.planConstruction({ structureTypeId, position });
      if (!result.ok) throw new Error(result.message);
      return self;
    },
    get state() {
      return campaign.snapshot();
    },
  };
  return self;
}

/** The Robots whose activity is for a Machine or Rover, by its id. */
function handlers(state: Snapshot, id: string): string[] {
  return state.robots
    .filter(
      ({ activity }) =>
        ("machineId" in activity && activity.machineId === id) ||
        ("roverId" in activity && activity.roverId === id),
    )
    .map((each) => each.id);
}

/**
 * What a Robot's activity takes, that no other Robot may take at the same
 * time: a Machine or Rover, the cable to a Structure, the work on a
 * Structure, or the Exports to load onto the Lander.
 */
function takenBy(activity: RobotActivity): string[] {
  if ("machineId" in activity) return [`machine ${activity.machineId}`];
  if ("roverId" in activity) return [`rover ${activity.roverId}`];
  if ("purpose" in activity) return ["exports"];
  if (
    activity.kind === "loading-exports" ||
    activity.kind === "putting-exports-aboard"
  ) {
    return ["exports"];
  }
  if (!("structureId" in activity)) return [];
  return activity.kind === "laying-cable" ||
    (activity.kind === "walking" && activity.destination === "cable")
    ? [`cable to ${activity.structureId}`]
    : [`work on ${activity.structureId}`];
}

function inStock(state: Snapshot, componentId: string): number {
  return (
    state.stockpile.components.find((each) => each.componentId === componentId)
      ?.count ?? 0
  );
}

function idle(state: Snapshot): boolean {
  return state.robots.every(({ activity }) => activity.kind === "idle");
}

function robot(state: Snapshot, id: string): RobotSnapshot {
  const found = state.robots.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`expected ${id}`);
  return found;
}

describe("two Robots", () => {
  it("start side by side at the landing site", () => {
    expect(scenario().state.robots.map((each) => each.id)).toEqual([
      "robot-1",
      "robot-2",
    ]);
  });

  it("work on two Constructions planned together at the same time, each on its own, and both are commissioned", () => {
    const game = scenario()
      .plan("light-mast", firstSite)
      .plan("light-mast", secondSite);
    const [first, second] = game.state.constructions.map(({ id }) => id);

    const states = runUntil(game, (state) => state.constructions.length === 0);

    const together = states.filter((state) => {
      const worked = state.robots.map((each) => structureOf(each.activity));
      return worked.includes(first) && worked.includes(second);
    });
    expect(together.length).toBeGreaterThan(0);
    expect(game.state.structures.map((each) => each.structureTypeId)).toEqual([
      "light-mast",
      "light-mast",
    ]);
    for (const state of states) {
      const [one, two] = state.robots.map((each) => structureOf(each.activity));
      if (one !== undefined) expect(one).not.toBe(two);
    }
  });
});

describe("the Condition of two Robots", () => {
  it("is worn down by Dust only for the Robot at work", () => {
    const game = scenario().plan("light-mast", firstSite);

    const states = runUntil(game, (state) => state.constructions.length === 0);

    expect(
      states.some((state) => robot(state, "robot-2").activity.kind !== "idle"),
    ).toBe(false);
    expect(robot(game.state, "robot-1").conditionPercent).toBeLessThan(100);
    expect(robot(game.state, "robot-2").conditionPercent).toBe(100);
  });

  it("has only the Robot worn below the threshold repair itself, while the other carries on with the Work Orders", () => {
    const campaign = worn(scenario().campaign, "robot-2", 5);
    const game = scenarioOf(campaign).plan("light-mast", firstSite);
    const events: GameEvent[] = [];

    const states: Snapshot[] = [];
    for (let minute = 0; minute < 24 * 60; minute++) {
      events.push(...game.campaign.advance(1));
      states.push(game.state);
    }

    expect(
      events
        .filter(
          (event) =>
            event.kind === "robot-self-repair-started" ||
            event.kind === "robot-repaired",
        )
        .map((event) => [event.kind, "robotId" in event && event.robotId]),
    ).toEqual([
      ["robot-self-repair-started", "robot-2"],
      ["robot-repaired", "robot-2"],
    ]);
    expect(robot(game.state, "robot-2").conditionPercent).toBe(100);
    expect(
      states.some((state) => robot(state, "robot-1").selfRepair !== undefined),
    ).toBe(false);
    // The other Robot builds the light mast meanwhile.
    expect(
      states.some(
        (state) =>
          robot(state, "robot-2").activity.kind === "repairing-itself" &&
          structureOf(robot(state, "robot-1").activity) !== undefined,
      ),
    ).toBe(true);
    expect(game.state.structures).toHaveLength(1);
  });
});

describe("the base's stock with two Robots", () => {
  it("gives the Components for one Construction to one Robot, and the other Construction waits for more", () => {
    // The starting stock has the Components for one solar array.
    const game = scenario()
      .plan("solar-array", firstSite)
      .plan("solar-array", secondSite);

    const states = runUntil(game, (state) => state.structures.length > 0);
    game.advance({ hours: 12 });

    for (const state of [...states, game.state]) {
      const carrying = state.robots.filter((each) =>
        each.carrying.some(({ componentId }) => componentId === "solar-panel"),
      );
      expect(carrying.length).toBeLessThanOrEqual(1);
      expect(inStock(state, "solar-panel")).toBeGreaterThanOrEqual(0);
    }
    expect(game.state.structures).toHaveLength(1);
    expect(game.state.constructions).toEqual([
      expect.objectContaining({ componentsTaken: false }),
    ]);
    expect(game.state.constructions[0]?.waiting?.reason).toBe(
      "missing-components",
    );
    expect(inStock(game.state, "solar-panel")).toBe(0);
  });

  it("gives the spare Components for one Maintenance to one Robot, and the other waits for more", () => {
    const campaign = changed(scenario().campaign, (state) => {
      for (const machine of state.machines) machine.conditionPercent = 50;
      // Enough for one of the two.
      withSpares(state, 4);
    });
    const game = scenarioOf(campaign);

    const states = runUntil(
      game,
      (state) => state.maintenance.length === 1 && idle(state),
      24 * 60,
    );

    for (const state of states) {
      const carrying = state.robots.filter((each) =>
        each.carrying.some(
          ({ componentId }) => componentId === spareComponentId,
        ),
      );
      expect(carrying.length).toBeLessThanOrEqual(1);
    }
    expect(
      game.state.machines.map(({ conditionPercent }) => conditionPercent),
    ).toEqual([100, 50]);
    expect(game.state.maintenance).toEqual([
      expect.objectContaining({
        waiting: { reason: "missing-spare-components", missing: 2 },
      }),
    ]);
    expect(inStock(game.state, spareComponentId)).toBe(1);
  });
});

describe("Machines and Rovers with two Robots", () => {
  // With the battery bank beside the Rover, it is plugged in already, and
  // only the regolith printer is to be parked.
  it.each([
    { id: "regolith-printer-2", bankSite: { x: 0, y: 18 } },
    { id: "rover-1", bankSite: secondSite },
  ])(
    "are never maintained by one Robot while the other parks them: $id",
    ({ id, bankSite }) => {
      const built = scenario()
        .plan("solar-array", firstSite)
        .plan("battery-bank", bankSite);
      runUntil(built, (state) => state.constructions.length === 0);
      const { minutesRemaining } = built.state.lunation;
      built.advance({ minutes: minutesRemaining - parkingLeadHours * 60 });
      runUntil(built, (state) => handlers(state, id).length > 0, 24 * 60);
      expect(built.state.parking.map(({ subject }) => subject)).toContainEqual(
        expect.objectContaining(
          id.startsWith("rover") ? { roverId: id } : { machineId: id },
        ),
      );
      const game = scenarioOf(worn(built.campaign, id, 50));

      const states = runUntil(
        game,
        (state) => state.parking.length === 0 && state.maintenance.length === 0,
        24 * 60,
      );

      for (const state of states) {
        for (const each of [...state.machines, ...state.rovers]) {
          expect(handlers(state, each.id).length).toBeLessThanOrEqual(1);
        }
      }
      // It is maintained once it has been parked.
      const parked = states.findIndex(
        (state) => !state.parking.some(({ underWay }) => underWay),
      );
      const maintained = states.findIndex((state) =>
        state.robots.some(({ activity }) => activity.kind === "maintaining"),
      );
      expect(parked).toBeGreaterThan(0);
      expect(maintained).toBeGreaterThan(parked);
      expect(
        [...game.state.machines, ...game.state.rovers].find(
          (each) => each.id === id,
        )?.conditionPercent,
      ).toBe(100);
    },
  );
});

describe("two Robots at work on a growing base", () => {
  it("never take the same work, Machine or Rover at once", () => {
    const game = scenario()
      .plan("solar-array", firstSite)
      .plan("battery-bank", secondSite)
      .plan("light-mast", { x: 30, y: -20 })
      .plan("light-mast", { x: -30, y: -20 });
    const states: Snapshot[] = [];
    // Through the first Night, when the Machines and the Rover are parked.
    const minutes = game.state.lunation.minutesRemaining + 12 * 60;
    for (let minute = 0; minute < minutes; minute++) {
      game.advance({ minutes: 1 });
      states.push(game.state);
    }

    for (const state of states) {
      const taken = state.robots.flatMap(({ activity }) => takenBy(activity));
      expect(new Set(taken).size).toBe(taken.length);
    }
    expect(game.state.structures).toHaveLength(4);
    expect(
      states.some((state) =>
        state.robots.every((each) => takenBy(each.activity).length > 0),
      ),
    ).toBe(true);
    expect(states.some((state) => state.parking.length > 0)).toBe(true);
  });
});

describe("an Expedition with two Robots", () => {
  it("takes the Robot that is free, while the other carries on with its Work Orders until it is back", () => {
    const game = scenario()
      .plan("light-mast", firstSite)
      .advance({ minutes: 1 });
    expect(robot(game.state, "robot-1").activity.kind).not.toBe("idle");
    expect(robot(game.state, "robot-2").activity.kind).toBe("idle");

    const started = game.campaign.startExpedition();

    expect(started.ok).toBe(true);
    expect(game.state.expedition?.robotId).toBe("robot-2");
    const states = runUntil(
      game,
      (state) => state.expedition === undefined,
      30 * 24 * 60,
    );
    const away = states.filter((state) => state.expedition?.stage === "away");
    expect(away.length).toBeGreaterThan(0);
    // The light mast is commissioned while the other Robot is away.
    expect(
      away.some((state) =>
        state.structures.some((each) => each.structureTypeId === "light-mast"),
      ),
    ).toBe(true);
    for (const state of states) {
      const first = robot(state, "robot-1");
      expect(first.activity.kind).not.toBe("on-expedition");
      expect(first.activity.kind).not.toBe("driving-rover");
      expect(onMap(first.position)).toBe(true);
    }
    expect(
      states.some(
        (state) => robot(state, "robot-2").activity.kind === "on-expedition",
      ),
    ).toBe(true);
  });

  it("waits for the other Robot to finish maintaining the Rover before the Robot that is free drives it off", () => {
    const campaign = worn(scenario().campaign, "rover-1", 50);
    const game = scenarioOf(campaign);
    runUntil(game, (state) => handlers(state, "rover-1").length > 0);
    expect(handlers(game.state, "rover-1")).toEqual(["robot-1"]);

    game.campaign.startExpedition();

    expect(game.state.expedition?.robotId).toBe("robot-2");
    const states = runUntil(
      game,
      (state) => state.expedition === undefined,
      30 * 24 * 60,
    );
    for (const state of states) {
      expect(handlers(state, "rover-1").length).toBeLessThanOrEqual(1);
    }
    const leaving = states.findIndex(
      (state) => state.expedition?.stage === "driving-out",
    );
    expect(leaving).toBeGreaterThan(0);
    // By the time it drives off, the Rover has been maintained.
    expect(states[leaving]?.maintenance).toEqual([]);
    expect(
      states.some(
        (state) => robot(state, "robot-2").activity.kind === "on-expedition",
      ),
    ).toBe(true);
  });

  it("keeps the other Robot off the Rover while it is out, even when it is due for Maintenance", () => {
    const game = scenario();
    game.campaign.startExpedition();
    runUntil(game, (state) => state.expedition?.stage === "away", 24 * 60);
    const loaded = scenarioOf(worn(game.campaign, "rover-1", 50));
    expect(loaded.state.expedition?.robotId).toBe("robot-1");

    const states = runUntil(
      loaded,
      (state) => state.expedition === undefined,
      30 * 24 * 60,
    );

    for (const state of states.filter(({ expedition }) => expedition)) {
      expect(handlers(state, "rover-1")).not.toContain("robot-2");
    }
    // Once back, it is maintained.
    runUntil(loaded, (state) => state.maintenance.length === 0, 24 * 60);
    expect(loaded.state.rovers[0]?.conditionPercent).toBe(100);
  });

  it("takes the first Robot when both are free", () => {
    const game = scenario();

    game.campaign.startExpedition();

    expect(game.state.expedition?.robotId).toBe("robot-1");
  });
});

describe("the interface with two Robots", () => {
  it("names each Robot in the Base panel, and a lone Robot just Robot", () => {
    const { robots } = scenario().state;

    expect(robots.map((each) => robotLabel(each.id, robots))).toEqual([
      "Robot 1",
      "Robot 2",
    ]);
    expect(robotLabel("robot-1", [{ id: "robot-1" }])).toBe("Robot");
  });

  it("numbers each Robot by its id, not by where it comes in the list", () => {
    const robots = [{ id: "robot-2" }, { id: "robot-1" }];

    expect(robots.map((each) => robotLabel(each.id, robots))).toEqual([
      "Robot 2",
      "Robot 1",
    ]);
  });

  it("names the Robot that repairs itself in the notifications", () => {
    const campaign = worn(scenario().campaign, "robot-2", 5);
    const game = scenarioOf(campaign).plan("light-mast", firstSite);
    const events: GameEvent[] = [];
    for (let minute = 0; minute < 24 * 60; minute++) {
      events.push(...game.campaign.advance(1));
    }
    const { robots } = game.state;

    expect(
      events
        .filter(
          (event) =>
            event.kind === "robot-self-repair-started" ||
            event.kind === "robot-repaired",
        )
        .map((event) => formatEvent(event, robots)),
    ).toEqual([
      "Robot 2 at 5% Condition, going to repair itself at the Lander",
      "Robot 2 repaired itself, back to 100%, using 5 spare Components",
    ]);
  });

  it("names the Robot a Micrometeorite strikes in the notification, and a lone Robot just the Robot", () => {
    const { robots } = scenario().state;
    const strike: GameEvent = {
      kind: "micrometeorite-strike",
      atMinute: 0,
      target: { kind: "robot", robotId: "robot-2" },
      conditionPercent: 80,
    };

    expect(formatEvent(strike, robots)).toBe(
      "Micrometeorite struck Robot 2, leaving it at 80% Condition",
    );
    expect(formatEvent(strike, [{ id: "robot-2" }])).toBe(
      "Micrometeorite struck the Robot, leaving it at 80% Condition",
    );
  });

  it("says what each Robot at work on a Construction is doing", () => {
    const game = scenario()
      .plan("solar-array", firstSite)
      .plan("battery-bank", secondSite);
    const states = runUntil(game, (state) => state.constructions.length === 0);
    const onBoth = (state: Snapshot) =>
      state.constructions.find(
        (construction) =>
          state.robots.filter((each) => isFor(each.activity, construction.id))
            .length === 2,
      );
    const both = states.find((state) => onBoth(state) !== undefined);
    const construction = both === undefined ? undefined : onBoth(both);
    if (both === undefined || construction === undefined) {
      throw new Error("expected both Robots on one Construction");
    }

    const work = describeWork(construction, both).split("; ");

    expect(work).toHaveLength(2);
    expect(work.filter((each) => each.includes("power cable"))).toHaveLength(1);
  });

  it("has the Work Orders wait for an Expedition only while every Robot is on it", () => {
    const game = scenario();
    game.campaign.startExpedition();
    runUntil(game, (state) => state.expedition?.stage === "away", 24 * 60);
    const { robots, expedition } = game.state;

    expect(isEveryRobotOnExpedition(robots, expedition)).toBe(false);
    expect(isEveryRobotOnExpedition(robots.slice(0, 1), expedition)).toBe(true);
  });
});
