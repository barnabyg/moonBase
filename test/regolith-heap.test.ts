import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import {
  regolithHeap,
  regolithHeapGround,
  uncoveredRegolithHeap,
  type Campaign,
  type GroundPosition,
  type MachineSnapshot,
  type RobotSnapshot,
  type Snapshot,
} from "../src/simulation";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { changed, worn } from "./worn";

const { digging, stockpile, landingSite } = catalogue;
const stockpilePosition = landingSite.stockpilePosition;
const heapGround = regolithHeapGround(stockpilePosition);

/** The Campaign as saved, with the base's Regolith set as given. */
function withRegolith(campaign: Campaign, kilograms: number): Campaign {
  return changed(campaign, (state) => {
    for (const stock of state.bulkResources) {
      if (stock.resourceId === "regolith") stock.kilograms = kilograms;
    }
  });
}

function distanceBetween(a: GroundPosition, b: GroundPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function sizeAt(kilograms: number): {
  radiusMetres: number;
  heightMetres: number;
} {
  const heap = regolithHeap(stockpilePosition, kilograms);
  if (heap === undefined) throw new Error(`expected a heap at ${kilograms}`);
  return heap;
}

/** A cone's volume, in cubic metres. */
function volume(heap: { radiusMetres: number; heightMetres: number }): number {
  return (Math.PI * heap.radiusMetres ** 2 * heap.heightMetres) / 3;
}

function excavatorOf(state: Snapshot): MachineSnapshot {
  const excavator = state.machines.find(
    (machine) => machine.machineTypeId === "excavator",
  );
  if (excavator === undefined) throw new Error("expected an excavator");
  return excavator;
}

function robotOf(state: Snapshot): RobotSnapshot {
  const [robot] = state.robots;
  if (robot === undefined) throw new Error("expected a Robot");
  return robot;
}

/** Runs the game a game-minute at a time until the condition holds, returning the state it holds in. */
function runUntil(
  game: Scenario,
  done: (state: Snapshot) => boolean,
): Snapshot {
  for (let minute = 0; minute < 3 * 24 * 60; minute++) {
    if (done(game.state)) return game.state;
    game.advance({ minutes: 1 });
  }
  throw new Error("It never happened.");
}

describe("the heap of the base's Regolith", () => {
  it("isn't there with no Regolith in stock", () => {
    expect(regolithHeap(stockpilePosition, 0)).toBeUndefined();
  });

  it("draws a full stock as a cone about 1.6 m in radius and 1.1 m high, larger than the stockpile's mat", () => {
    const full = sizeAt(digging.fullKilograms);

    expect(full.radiusMetres).toBeCloseTo(1.59, 2);
    expect(full.heightMetres).toBeCloseTo(1.11, 2);
    expect(full.radiusMetres).toBeGreaterThan(stockpile.footprintRadiusMetres);
  });

  it("is drawn larger than the bulk density says, which stays true of loose Regolith", () => {
    expect(stockpile.regolithHeap.bulkDensityKilogramsPerCubicMetre).toBe(1500);
    expect(volume(sizeAt(digging.fullKilograms))).toBeGreaterThan(
      digging.fullKilograms /
        stockpile.regolithHeap.bulkDensityKilogramsPerCubicMetre,
    );
  });

  it("grows with the stock, its radius going with the cube root of the mass", () => {
    const full = sizeAt(digging.fullKilograms);
    const eighth = sizeAt(digging.fullKilograms / 8);

    expect(eighth.radiusMetres).toBeCloseTo(full.radiusMetres / 2, 6);
    expect(eighth.heightMetres).toBeCloseTo(full.heightMetres / 2, 6);
    const radii = [100, 400, 900, 1500, 2000].map(
      (kilograms) => sizeAt(kilograms).radiusMetres,
    );
    expect(radii).toEqual([...radii].sort((a, b) => a - b));
  });

  it("still shows a few kilograms as a small heap", () => {
    const few = sizeAt(3);

    expect(few.radiusMetres).toBe(stockpile.regolithHeap.smallestRadiusMetres);
    expect(few.heightMetres).toBeGreaterThan(0.15);
    expect(few.radiusMetres).toBeLessThan(
      sizeAt(digging.fullKilograms).radiusMetres / 2,
    );
  });

  it("grows no larger than a full stock", () => {
    expect(sizeAt(digging.fullKilograms * 3)).toEqual(
      sizeAt(digging.fullKilograms),
    );
  });

  it("lies just beside the stockpile's mat, on the side away from the landing site and clear of the Lander, wherever it is", () => {
    const { position, radiusMetres } = heapGround;
    const fromMat =
      distanceBetween(position, stockpilePosition) -
      stockpile.footprintRadiusMetres;

    expect(radiusMetres).toBe(sizeAt(digging.fullKilograms).radiusMetres);
    expect(fromMat).toBeGreaterThanOrEqual(radiusMetres);
    expect(fromMat).toBeLessThan(radiusMetres + 0.5);
    expect(
      distanceBetween(position, landingSite.landerPosition) -
        distanceBetween(stockpilePosition, landingSite.landerPosition),
    ).toBeCloseTo(distanceBetween(position, stockpilePosition), 6);
    expect(
      distanceBetween(position, landingSite.landerPosition) - radiusMetres,
    ).toBeGreaterThan(catalogue.lander.footprintRadiusMetres);
    for (const kilograms of [3, 500, 2000]) {
      expect(regolithHeap(stockpilePosition, kilograms)?.position).toEqual(
        position,
      );
    }
  });
});

describe("the heap on the base", () => {
  it("has the excavator stand to dig just beyond it, clear of it, so that it tips onto it", () => {
    const game = scenario();

    const state = runUntil(
      game,
      (current) => excavatorOf(current).activity.kind === "digging",
    );

    const excavator = excavatorOf(state).position;
    const excavatorRadius =
      catalogue.machineTypes.find((type) => type.id === "excavator")
        ?.footprintRadiusMetres ?? Number.NaN;
    const clearance =
      distanceBetween(excavator, heapGround.position) -
      heapGround.radiusMetres -
      excavatorRadius;
    expect(clearance).toBeGreaterThanOrEqual(-1e-9);
    expect(clearance).toBeLessThan(0.5);
    // In line with the stockpile and the heap.
    expect(
      distanceBetween(excavator, heapGround.position) +
        distanceBetween(heapGround.position, stockpilePosition),
    ).toBeCloseTo(distanceBetween(excavator, stockpilePosition), 6);
  });

  it("keeps the Robot from loading Components on it, for a site beyond it", () => {
    const away = {
      x: heapGround.position.x - stockpilePosition.x,
      y: heapGround.position.y - stockpilePosition.y,
    };
    const site = {
      x: stockpilePosition.x + away.x * 10,
      y: stockpilePosition.y + away.y * 10,
    };
    const game = scenario().plan("solar-array", site);

    const state = runUntil(
      game,
      (current) => robotOf(current).activity.kind === "loading-components",
    );

    const robot = robotOf(state).position;
    expect(
      distanceBetween(robot, heapGround.position) - heapGround.radiusMetres,
    ).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(distanceBetween(robot, stockpilePosition)).toBeCloseTo(
      stockpile.footprintRadiusMetres + catalogue.robot.workingGapMetres,
      6,
    );
  });

  it("keeps the Robot off it while it maintains the excavator where it digs", () => {
    const digging = scenario();
    runUntil(
      digging,
      (current) => excavatorOf(current).activity.kind === "digging",
    );
    const game = scenarioOf(
      worn(digging.campaign, excavatorOf(digging.state).id, 40),
    );

    const state = runUntil(
      game,
      (current) => robotOf(current).activity.kind === "maintaining",
    );

    const robot = robotOf(state).position;
    expect(
      distanceBetween(robot, heapGround.position) - heapGround.radiusMetres,
    ).toBeGreaterThanOrEqual(0.5 - 1e-9);
  });

  it("leaves the Robot loading on the side facing the site, for a site elsewhere", () => {
    const site = { x: 30, y: 5 };
    const game = scenario().plan("solar-array", site);

    const state = runUntil(
      game,
      (current) => robotOf(current).activity.kind === "loading-components",
    );

    const robot = robotOf(state).position;
    const bearing = (to: GroundPosition) =>
      Math.atan2(to.y - stockpilePosition.y, to.x - stockpilePosition.x);
    expect(distanceBetween(robot, stockpilePosition)).toBeCloseTo(
      stockpile.footprintRadiusMetres + catalogue.robot.workingGapMetres,
      6,
    );
    // Facing where it works on the site, beside the site's centre.
    expect(Math.abs(bearing(robot) - bearing(site))).toBeLessThan(0.1);
  });
});

describe("the heap of Regolith left uncovered beside the stockpile", () => {
  it("isn't there with no Regolith in stock", () => {
    expect(uncoveredRegolithHeap(scenario().state)).toBeUndefined();
  });

  it("is there at the size the stock gives it", () => {
    const game = scenarioOf(withRegolith(scenario().campaign, 1200));

    expect(uncoveredRegolithHeap(game.state)).toEqual(
      regolithHeap(stockpilePosition, 1200),
    );
  });

  it("isn't there while a Structure is planned or built over it", () => {
    // Just beyond the heap's middle, so that the light mast stands on the
    // heap but clear of the stockpile.
    const out =
      0.9 /
      Math.hypot(
        heapGround.position.x - stockpilePosition.x,
        heapGround.position.y - stockpilePosition.y,
      );
    const mast: GroundPosition = {
      x:
        heapGround.position.x +
        (heapGround.position.x - stockpilePosition.x) * out,
      y:
        heapGround.position.y +
        (heapGround.position.y - stockpilePosition.y) * out,
    };
    const game = scenarioOf(withRegolith(scenario().campaign, 2000));
    const planned = game.campaign.planConstruction({
      structureTypeId: "light-mast",
      position: mast,
    });
    if (!planned.ok) throw new Error(planned.message);

    expect(uncoveredRegolithHeap(game.state)).toBeUndefined();
  });
});
