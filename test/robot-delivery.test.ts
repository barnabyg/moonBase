import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type GameEvent,
  type GroundPosition,
  type ManifestLine,
  type RobotSnapshot,
  type Snapshot,
} from "../src/simulation";
import { findDesign, unlock } from "./designs";
import { scenario, type Scenario } from "./scenario";

// The Mission Director has to live in the Habitat through a couple of round
// trips, longer than the starting stock keeps a Habitat powered or the dose
// low, and the Funding has to pay for more than one Launch; and nobody digs
// Regolith, so that the Robots have nothing to do but what a test gives
// them.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { safeHabitat } = await import("./safe-habitat");
  const { withoutDigging } = await import("./without-digging");
  return {
    ...actual,
    catalogue: {
      ...safeHabitat(withoutDigging(actual.catalogue), [
        "power",
        "radiation",
        "life-support",
        "solar-particle-events",
      ]),
      programmeGrantMillionDollars: 2000,
    },
  };
});

/** The Launch item that brings a Robot. */
const robotItem = catalogue.launch.items.find(
  (item) => item.brings.kind === "robot",
);
if (robotItem === undefined) throw new Error("expected a Robot Launch item");
const robotDesign = findDesign(robotItem.designId);

const habitatSite: GroundPosition = { x: 25, y: -20 };
const firstMastSite: GroundPosition = { x: 20, y: 12 };
const secondMastSite: GroundPosition = { x: -20, y: 12 };
const padSite: GroundPosition = { x: 40, y: 25 };
const { landerPosition } = catalogue.landingSite;

const padType = catalogue.structureTypes.find((type) => type.landingPad);
if (padType === undefined) throw new Error("expected a landing pad");
const padComponents: ManifestLine[] = padType.components.map((need) => ({
  itemId: need.componentId,
  count: need.count,
}));

/** Runs the game until the Robots have carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

/**
 * The Mission Director living in a commissioned Habitat, so the Lander is
 * free to fly, and the Design that ships Robots unlocked.
 */
function readyToShip(): Scenario {
  const game = scenario().plan("habitat", habitatSite);
  unlock(game.campaign, robotDesign.id);
  buildAll(game);
  const habitat = game.state.structures.find(
    (structure) => structure.structureTypeId === "habitat",
  );
  const movedIn = game.campaign.moveMissionDirectorIn(habitat?.id ?? "");
  if (!movedIn.ok) throw new Error(movedIn.message);
  return game;
}

function setManifest(game: Scenario, manifest: readonly ManifestLine[]): void {
  const result = game.campaign.setLaunchManifest(manifest);
  if (!result.ok) throw new Error(result.message);
}

function send(game: Scenario): void {
  const result = game.campaign.sendLander();
  if (!result.ok) throw new Error(result.message);
}

/** Skips from event to event until the event comes, returning every event on the way. */
function skipUntil(game: Scenario, kind: GameEvent["kind"]): GameEvent[] {
  const events: GameEvent[] = [];
  for (let skips = 0; !events.some((event) => event.kind === kind); skips++) {
    if (skips > 200) throw new Error(`No ${kind} event came.`);
    events.push(...game.campaign.advanceToNextEvent());
  }
  return events;
}

/** Runs the game a game-minute at a time until a condition holds, returning the state after every minute. */
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

function robot(state: Snapshot, robotId: string): RobotSnapshot {
  const found = state.robots.find((candidate) => candidate.id === robotId);
  if (found === undefined) throw new Error(`expected ${robotId}`);
  return found;
}

function distance(a: GroundPosition, b: GroundPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Whether a spot is within a Robot's working gap of the stockpile's footprint. */
function besideStockpile(state: Snapshot, position: GroundPosition): boolean {
  return (
    distance(position, state.stockpile.position) <=
    catalogue.stockpile.footprintRadiusMetres +
      catalogue.robot.workingGapMetres +
      1e-9
  );
}

/** Whether a spot is within a Robot's working gap of the Lander's footprint. */
function besideLander(state: Snapshot, position: GroundPosition): boolean {
  return (
    distance(position, state.lander.position) <=
    catalogue.lander.footprintRadiusMetres +
      catalogue.robot.workingGapMetres +
      1e-9
  );
}

describe("the Robot Launch item", () => {
  it("belongs to a Mobility Design that isn't unlocked when a Campaign begins", () => {
    expect(robotDesign).toMatchObject({
      category: "mobility",
      starting: false,
    });
  });

  it("can't be put on the Launch manifest before its Design is unlocked, naming the Design", () => {
    const { campaign } = scenario();

    const result = campaign.setLaunchManifest([
      { itemId: robotItem.id, count: 1 },
    ]);

    expect(result).toMatchObject({ ok: false, reason: "design-locked" });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.message).toBe(
      `Robot needs the ${robotDesign.label} Design unlocked first.`,
    );
    expect(campaign.snapshot().launchManifest.items).toEqual([]);
  });

  it("adds no Robot to the base as its Design is unlocked, and then counts towards the manifest's Payload Mass and cost like any other item", () => {
    const { campaign } = scenario();
    const robots = campaign.snapshot().robots;

    unlock(campaign, robotDesign.id);

    expect(campaign.snapshot().robots.map((each) => each.id)).toEqual(
      robots.map((each) => each.id),
    );
    expect(
      campaign.setLaunchManifest([
        { itemId: robotItem.id, count: 2 },
        { itemId: "oxygen", count: 1 },
      ]),
    ).toEqual({ ok: true });
    const oxygen = catalogue.launch.items.find((item) => item.id === "oxygen");
    expect(campaign.snapshot().launchManifest).toMatchObject({
      payloadMassKilograms:
        2 * robotItem.massKilograms + (oxygen?.massKilograms ?? NaN),
      costMillionDollars:
        catalogue.launch.feeMillionDollars +
        2 * robotItem.priceMillionDollars +
        (oxygen?.priceMillionDollars ?? NaN),
    });
  });
});

describe("a Robot shipped by Launch", () => {
  it("lands with the Lander, beside it at full Condition, climbs down and walks to the stockpile, with a notification, ready for work", () => {
    const game = readyToShip();
    const stock = game.state.stockpile;
    setManifest(game, [{ itemId: robotItem.id, count: 1 }]);
    send(game);

    const landing = skipUntil(game, "lander-landed");

    expect(landing).toContainEqual(
      expect.objectContaining({
        kind: "lander-landed",
        delivered: [{ itemId: robotItem.id, count: 1 }],
      }),
    );
    expect(game.state.lander.position).toEqual(landerPosition);
    expect(game.state.robots.map((each) => each.id)).toEqual([
      "robot-1",
      "robot-2",
    ]);
    const arrived = robot(game.state, "robot-2");
    expect(arrived).toMatchObject({
      activity: { kind: "climbing-down" },
      carrying: [],
      conditionPercent: 100,
      selfRepair: undefined,
    });
    expect(besideLander(game.state, arrived.position)).toBe(true);
    // A Robot isn't a Component: nothing joins the base's stock for it.
    expect(game.state.stockpile).toEqual(stock);
    expect(game.state.lander.cargo).toEqual([]);

    const climbing = runUntil(
      game,
      (state) => robot(state, "robot-2").activity.kind !== "climbing-down",
    );
    expect(climbing.length).toBe(
      Math.round(catalogue.robot.climbingDownHours * 60),
    );
    expect(robot(game.state, "robot-2").activity).toEqual({
      kind: "walking-to-stockpile",
    });

    const events = skipUntil(game, "robot-arrived");
    expect(events).toContainEqual({
      kind: "robot-arrived",
      atMinute: game.state.clock.elapsedMinutes,
      robotId: "robot-2",
    });
    const ready = robot(game.state, "robot-2");
    expect(besideStockpile(game.state, ready.position)).toBe(true);
    expect(ready.activity).toEqual({ kind: "idle" });
  });

  it("then works on a Construction alongside the first Robot", () => {
    const game = readyToShip();
    setManifest(game, [{ itemId: robotItem.id, count: 1 }]);
    send(game);
    skipUntil(game, "robot-arrived");

    game.plan("light-mast", firstMastSite).plan("light-mast", secondMastSite);
    const ids = game.state.constructions.map((each) => each.id);
    const states = runUntil(game, (state) => state.constructions.length === 0);

    const workingOn = (state: Snapshot, robotId: string) => {
      const { activity } = robot(state, robotId);
      return "structureId" in activity ? activity.structureId : undefined;
    };
    // At the same time, each on a Construction of its own.
    expect(
      states.some((state) => {
        const first = workingOn(state, "robot-1");
        const second = workingOn(state, "robot-2");
        return (
          first !== undefined &&
          second !== undefined &&
          first !== second &&
          ids.includes(first) &&
          ids.includes(second)
        );
      }),
    ).toBe(true);
    expect(
      game.state.structures.filter((s) => s.structureTypeId === "light-mast"),
    ).toHaveLength(2);
  });

  it("keeps the Lander from leaving until it has climbed down", () => {
    const game = readyToShip();
    setManifest(game, [{ itemId: robotItem.id, count: 1 }]);
    send(game);
    skipUntil(game, "lander-landed");

    expect(game.campaign.sendLander()).toEqual({
      ok: false,
      reason: "robot-aboard",
      message:
        "The Lander can't leave while a Robot is still climbing down from it.",
    });

    runUntil(
      game,
      (state) => robot(state, "robot-2").activity.kind !== "climbing-down",
    );
    expect(game.campaign.sendLander()).toEqual({ ok: true });
  });

  it("numbers each Robot a Launch brings after the others, and every one arrives", () => {
    const game = readyToShip();
    setManifest(game, [{ itemId: robotItem.id, count: 2 }]);
    send(game);
    skipUntil(game, "lander-landed");

    expect(game.state.robots.map((each) => each.id)).toEqual([
      "robot-1",
      "robot-2",
      "robot-3",
    ]);
    const events: GameEvent[] = [];
    for (let skips = 0; events.length < 2; skips++) {
      if (skips > 50) throw new Error("They never both arrived.");
      events.push(
        ...game.campaign
          .advanceToNextEvent()
          .filter((event) => event.kind === "robot-arrived"),
      );
    }
    expect(events.map((event) => "robotId" in event && event.robotId)).toEqual([
      "robot-2",
      "robot-3",
    ]);
  });
});

describe("a Robot shipped by Launch to a landing pad", () => {
  it("climbs down there and walks to the stockpile, without waiting for the unloading Work Order", () => {
    const game = readyToShip();
    setManifest(game, padComponents);
    send(game);
    skipUntil(game, "lander-landed");
    buildAll(game.plan(padType.id, padSite));
    const pad = game.state.structures.find(
      (structure) => structure.structureTypeId === padType.id,
    );
    setManifest(game, [
      { itemId: robotItem.id, count: 1 },
      { itemId: "solar-panel", count: 1 },
    ]);
    send(game);

    skipUntil(game, "lander-landed");

    expect(game.state.lander).toMatchObject({
      position: padSite,
      landingPadId: pad?.id,
      cargo: [{ componentId: "solar-panel", count: 1 }],
    });
    const arrived = robot(game.state, "robot-2");
    expect(arrived.activity).toEqual({ kind: "climbing-down" });
    expect(besideLander(game.state, arrived.position)).toBe(true);

    const events = skipUntil(game, "robot-arrived");

    expect(events.map((event) => event.kind)).not.toContain("lander-unloaded");
    expect(game.state.unloading).toBeDefined();
    expect(
      besideStockpile(game.state, robot(game.state, "robot-2").position),
    ).toBe(true);
  });
});

describe("saving and loading while a Robot arrives", () => {
  it.each([
    ["climbing-down", 5],
    ["walking-to-stockpile", 20],
  ] as const)(
    "carries on exactly as it would have, saved while its activity was %s",
    (kind, minutes) => {
      const game = readyToShip();
      setManifest(game, [{ itemId: robotItem.id, count: 1 }]);
      send(game);
      skipUntil(game, "lander-landed");
      game.advance({ minutes });
      expect(robot(game.state, "robot-2").activity.kind).toBe(kind);

      const loaded = loadCampaign(game.campaign.save());
      if (!loaded.ok) throw new Error(loaded.message);
      expect(loaded.campaign.snapshot()).toEqual(game.state);

      expect(loaded.campaign.advance(24 * 60)).toEqual(
        game.campaign.advance(24 * 60),
      );
      expect(loaded.campaign.snapshot()).toEqual(game.state);
      expect(robot(game.state, "robot-2").activity.kind).not.toBe(
        "walking-to-stockpile",
      );
    },
  );
});
