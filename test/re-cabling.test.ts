import { describe, expect, it, vi } from "vitest";
import { catalogue } from "../src/catalogue";
import type {
  CableSnapshot,
  GroundPosition,
  PowerNetworkSnapshot,
  Snapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// The starting stock holds one solar array's Components, and dismantling it
// loses some, so these scenarios start with enough for a second one.
vi.mock(import("../src/catalogue"), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    catalogue: {
      ...original.catalogue,
      startingStock: [
        ...original.catalogue.startingStock,
        { componentId: "solar-panel", count: 2 },
        { componentId: "array-mast", count: 1 },
      ],
    },
  };
});

const solarSite: GroundPosition = { x: 20, y: 12 };
const secondSolarSite: GroundPosition = { x: -20, y: 15 };
const batterySite: GroundPosition = { x: 30, y: 25 };
const mastSite: GroundPosition = { x: 15, y: -10 };
const secondMastSite: GroundPosition = { x: 10, y: -25 };
const metresPerMinute = catalogue.robot.cableLayingSpeedMetresPerHour / 60;

/** Runs the game a game-minute at a time until the condition holds, returning every state. */
function runUntil(
  game: Scenario,
  done: (state: Snapshot) => boolean,
): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < 10 * 24 * 60; minute++) {
    if (done(game.state)) return states;
    states.push(game.advance({ minutes: 1 }).state);
  }
  throw new Error("It never happened.");
}

/** Runs the game until every planned Construction and dismantling is done. */
function runUntilIdle(game: Scenario): Snapshot[] {
  return runUntil(
    game,
    (state) =>
      state.constructions.length === 0 && state.dismantlings.length === 0,
  );
}

/** Plans Constructions in order, returning the ids of the Structures they build. */
function planAll(
  game: Scenario,
  plans: readonly [string, GroundPosition][],
): string[] {
  return plans.map(([structureTypeId, position]) => {
    const result = game.campaign.planConstruction({
      structureTypeId,
      position,
    });
    if (!result.ok) throw new Error(result.message);
    return result.constructionId;
  });
}

function cableTo(state: Snapshot, structureId: string): CableSnapshot {
  const cable = state.cables.find(
    (candidate) => candidate.toStructureId === structureId,
  );
  if (cable === undefined)
    throw new Error(`expected a cable to ${structureId}`);
  return cable;
}

function networkOf(state: Snapshot, structureId: string): PowerNetworkSnapshot {
  const network = state.power.networks.find((candidate) =>
    candidate.structureIds.includes(structureId),
  );
  if (network === undefined) throw new Error("expected a power network");
  return network;
}

function cableLength(route: readonly GroundPosition[]): number {
  return route
    .slice(1)
    .reduce(
      (total, point, index) =>
        total +
        Math.hypot(
          point.x - (route[index]?.x ?? point.x),
          point.y - (route[index]?.y ?? point.y),
        ),
      0,
    );
}

/** Runs the game until the given part of the Lunation has just begun. */
function runUntilPart(game: Scenario, part: "daylight" | "night"): void {
  do {
    game.advance({ minutes: game.state.lunation.minutesRemaining });
  } while (game.state.lunation.part !== part);
}

describe("a Structure cut off from power", () => {
  it("is cabled again from the nearest powered Structure once the solar array it was cabled from is dismantled", () => {
    const game = scenario();
    const [solarId, batteryId, mastId] = planAll(game, [
      ["solar-array", solarSite],
      ["battery-bank", batterySite],
      ["light-mast", mastSite],
    ]);
    runUntilIdle(game);
    expect(cableTo(game.state, mastId ?? "").fromStructureId).toBe(solarId);

    game.campaign.dismantleStructure(solarId ?? "");
    runUntilIdle(game);
    runUntil(game, (state) =>
      state.cables.some(
        (cable) => cable.toStructureId === mastId && cable.complete,
      ),
    );

    expect(cableTo(game.state, mastId ?? "")).toMatchObject({
      fromStructureId: batteryId,
      complete: true,
    });
    expect(networkOf(game.state, mastId ?? "").structureIds).toEqual([
      batteryId,
      mastId,
    ]);
    runUntilPart(game, "night");
    game.advance({ minutes: 1 });
    expect(
      game.state.structures.find((structure) => structure.id === mastId),
    ).toMatchObject({ powered: true, lit: true });
  });

  it("waits with no power source in reach, and is cabled live from a new solar array once it is commissioned", () => {
    const game = scenario();
    const [firstSolarId, mastId] = planAll(game, [
      ["solar-array", solarSite],
      ["light-mast", mastSite],
    ]);
    runUntilIdle(game);

    game.campaign.dismantleStructure(firstSolarId ?? "");
    const [secondSolarId] = planAll(game, [["solar-array", secondSolarSite]]);
    const building = runUntilIdle(game);
    // Nothing was powered while the new solar array was being built, so the
    // Robot never worked on the Light Mast and the new solar array got no cable.
    expect(
      building.some((state) =>
        state.robots.some(
          (robot) =>
            "structureId" in robot.activity &&
            robot.activity.structureId === mastId,
        ),
      ),
    ).toBe(false);
    expect(game.state.cables).toEqual([]);

    const laying = runUntil(game, (state) =>
      state.cables.some(
        (cable) => cable.toStructureId === mastId && cable.complete,
      ),
    );

    const cable = cableTo(game.state, mastId ?? "");
    expect(cable.fromStructureId).toBe(secondSolarId);
    expect(networkOf(game.state, mastId ?? "").structureIds).toEqual([
      mastId,
      secondSolarId,
    ]);
    // Laid live: it grows behind the Robot, at its cable laying speed.
    const laid = laying
      .flatMap((state) => state.cables)
      .map((each) => cableLength(each.route));
    expect(laid).toEqual([...laid].sort((a, b) => a - b));
    const minutes = laying.filter(
      (state) =>
        state.robots[0]?.activity.kind === "laying-cable" &&
        state.robots[0].activity.structureId === mastId,
    ).length;
    const length = cableLength(cable.route);
    expect(length).toBeGreaterThan(20);
    expect(minutes).toBeGreaterThanOrEqual(length / metresPerMinute - 1e-6);
    expect(minutes).toBeLessThan(length / metresPerMinute + 1);
  });

  it("is cabled once a powered Structure is commissioned, even if it was commissioned before any power source existed", () => {
    const game = scenario();
    const [mastId, solarId] = planAll(game, [
      ["light-mast", mastSite],
      ["solar-array", solarSite],
    ]);
    runUntilIdle(game);
    runUntil(game, (state) =>
      state.cables.some(
        (cable) => cable.toStructureId === mastId && cable.complete,
      ),
    );

    expect(game.state.cables).toEqual([
      expect.objectContaining({
        fromStructureId: solarId,
        toStructureId: mastId,
      }),
    ]);
  });

  it("is cabled later if it was commissioned with no cable because the only power source was due to be dismantled", () => {
    const game = scenario();
    const [firstSolarId] = planAll(game, [["solar-array", solarSite]]);
    runUntilIdle(game);
    const [mastId] = planAll(game, [["light-mast", mastSite]]);
    game.campaign.dismantleStructure(firstSolarId ?? "");
    runUntil(game, (state) =>
      state.structures.some((structure) => structure.id === mastId),
    );
    expect(game.state.cables).toEqual([]);

    const [secondSolarId] = planAll(game, [["solar-array", secondSolarSite]]);
    runUntilIdle(game);
    runUntil(game, (state) =>
      state.cables.some(
        (cable) => cable.toStructureId === mastId && cable.complete,
      ),
    );

    expect(game.state.cables).toEqual([
      expect.objectContaining({
        fromStructureId: secondSolarId,
        toStructureId: mastId,
      }),
    ]);
  });

  it("gets one cable for all the Structures cut off with it, laid to the one that had none", () => {
    const game = scenario();
    const [solarId, batteryId, mastId, secondMastId] = planAll(game, [
      ["solar-array", solarSite],
      ["battery-bank", batterySite],
      ["light-mast", mastSite],
      ["light-mast", secondMastSite],
    ]);
    runUntilIdle(game);
    expect(cableTo(game.state, secondMastId ?? "").fromStructureId).toBe(
      mastId,
    );

    game.campaign.dismantleStructure(solarId ?? "");
    runUntilIdle(game);
    runUntil(game, (state) =>
      state.cables.some(
        (cable) => cable.toStructureId === mastId && cable.complete,
      ),
    );
    game.advance({ earthDays: 1 });

    expect(game.state.cables).toEqual([
      expect.objectContaining({
        fromStructureId: mastId,
        toStructureId: secondMastId,
      }),
      expect.objectContaining({
        fromStructureId: batteryId,
        toStructureId: mastId,
      }),
    ]);
    expect(networkOf(game.state, secondMastId ?? "").structureIds).toEqual([
      batteryId,
      mastId,
      secondMastId,
    ]);
  });

  it("is cabled in plan order, after the Constructions planned before it was cut off", () => {
    const game = scenario();
    const [solarId, , mastId] = planAll(game, [
      ["solar-array", solarSite],
      ["battery-bank", batterySite],
      ["light-mast", mastSite],
    ]);
    runUntilIdle(game);

    game.campaign.dismantleStructure(solarId ?? "");
    const [laterMastId] = planAll(game, [["light-mast", secondMastSite]]);
    runUntil(game, (state) => state.cables.length < 2);
    const states = runUntil(game, (state) =>
      state.cables.some(
        (cable) => cable.toStructureId === mastId && cable.complete,
      ),
    );

    const firstMinute = (done: (state: Snapshot) => boolean) =>
      states.findIndex(done);
    const laterMastCommissioned = firstMinute((state) =>
      state.structures.some((structure) => structure.id === laterMastId),
    );
    const recablingStarted = firstMinute((state) => {
      const activity = state.robots[0]?.activity;
      return (
        activity !== undefined &&
        "structureId" in activity &&
        activity.structureId === mastId
      );
    });
    expect(laterMastCommissioned).toBeGreaterThan(0);
    expect(recablingStarted).toBeGreaterThan(laterMastCommissioned);
  });

  it("isn't cabled again if it is due to be dismantled", () => {
    const game = scenario();
    const [solarId, , mastId] = planAll(game, [
      ["solar-array", solarSite],
      ["battery-bank", batterySite],
      ["light-mast", mastSite],
    ]);
    runUntilIdle(game);

    game.campaign.dismantleStructure(solarId ?? "");
    game.campaign.dismantleStructure(mastId ?? "");
    const states = runUntilIdle(game);
    game.advance({ earthDays: 1 });

    expect(
      states.filter((state) =>
        state.robots.some((robot) => robot.activity.kind === "laying-cable"),
      ),
    ).toEqual([]);
    expect(game.state.cables).toEqual([]);
  });
});
