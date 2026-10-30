import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import {
  iceStore,
  iceStoreGround,
  loadCampaign,
  regolithHeapGround,
  uncoveredIceStore,
  type Campaign,
  type GroundPosition,
  type RobotSnapshot,
  type Snapshot,
} from "../src/simulation";
import { returnSpot } from "../src/simulation/expeditions";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { changed } from "./worn";

const { stockpile, landingSite, rover, robot: robotSpec } = catalogue;
const stockpilePosition = landingSite.stockpilePosition;
const ground = iceStoreGround(stockpilePosition);
const heap = regolithHeapGround(stockpilePosition);

function withIce(campaign: Campaign, kilograms: number): Campaign {
  return changed(campaign, (state) => {
    for (const stock of state.bulkResources) {
      if (stock.resourceId === "water-ice") stock.kilograms = kilograms;
    }
  });
}

function distanceBetween(a: GroundPosition, b: GroundPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function levelsAt(kilograms: number): readonly number[] {
  return iceStore(stockpilePosition, kilograms)?.containerLevels ?? [];
}

function robotOf(state: Snapshot): RobotSnapshot {
  const [robot] = state.robots;
  if (robot === undefined) throw new Error("expected a Robot");
  return robot;
}

function runUntil(
  game: Scenario,
  done: (state: Snapshot) => boolean,
): Snapshot {
  for (let minute = 0; minute < 10 * 24 * 60; minute++) {
    if (done(game.state)) return game.state;
    game.advance({ minutes: 1 });
  }
  throw new Error("It never happened.");
}

describe("the amount of ice the store shows", () => {
  it("is nothing with no water ice in stock", () => {
    expect(iceStore(stockpilePosition, 0)).toBeUndefined();
  });

  it("fills one container for each Expedition's 200 kg", () => {
    expect(levelsAt(200)).toEqual([1]);
    expect(levelsAt(400)).toEqual([1, 1]);
  });

  it("shows part of a container for what is left over", () => {
    expect(levelsAt(300)).toEqual([1, 0.5]);
    expect(levelsAt(50)).toEqual([0.25]);
  });

  it("still shows a small stock", () => {
    expect(levelsAt(1)).toEqual([0.1]);
  });

  it("stops at seven full containers, however much the base has", () => {
    expect(levelsAt(1400)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(levelsAt(5000)).toEqual(levelsAt(1400));
  });
});

describe("where the ice store stands", () => {
  it("doesn't move with the stock", () => {
    for (const kilograms of [1, 200, 5000]) {
      expect(iceStore(stockpilePosition, kilograms)?.position).toEqual(
        ground.position,
      );
    }
  });

  it("is outside the stockpile's footprint, close beside it", () => {
    const gap =
      distanceBetween(ground.position, stockpilePosition) -
      ground.radiusMetres -
      stockpile.footprintRadiusMetres;

    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(0.5);
  });

  it("is clear of the Regolith heap and the Lander, with room for a Robot beside the heap", () => {
    expect(
      distanceBetween(ground.position, heap.position) -
        ground.radiusMetres -
        heap.radiusMetres,
    ).toBeGreaterThan(0.5);
    expect(
      distanceBetween(ground.position, landingSite.landerPosition) -
        ground.radiusMetres,
    ).toBeGreaterThan(catalogue.lander.footprintRadiusMetres);
  });

  it("is clear of the excavator digging, whichever way round the stockpile it turns", () => {
    const excavatorRadius =
      catalogue.machineTypes.find((type) => type.id === "excavator")
        ?.footprintRadiusMetres ?? Number.NaN;
    const reach =
      distanceBetween(heap.position, stockpilePosition) +
      heap.radiusMetres +
      excavatorRadius;

    expect(reach).toBeGreaterThanOrEqual(
      distanceBetween(ground.position, stockpilePosition) +
        ground.radiusMetres +
        excavatorRadius,
    );
  });
});

describe("the ice store on the base", () => {
  it("isn't there with no water ice in stock", () => {
    expect(uncoveredIceStore(scenario().state)).toBeUndefined();
  });

  it("is there at the amount the stock gives it", () => {
    const game = scenarioOf(withIce(scenario().campaign, 300));

    expect(uncoveredIceStore(game.state)?.containerLevels).toEqual([1, 0.5]);
  });

  it("hides while a Structure is planned over it", () => {
    const game = scenarioOf(withIce(scenario().campaign, 400));
    const planned = game.campaign.planConstruction({
      structureTypeId: "light-mast",
      position: {
        x: ground.position.x + (ground.position.x - stockpilePosition.x) * 0.5,
        y: ground.position.y + (ground.position.y - stockpilePosition.y) * 0.5,
      },
    });
    if (!planned.ok) throw new Error(planned.message);

    expect(uncoveredIceStore(game.state)).toBeUndefined();
  });

  it("hides under a landing pad, so that the Lander on it never stands on the ice", () => {
    const padRadius =
      catalogue.structureTypes.find((type) => type.id === "landing-pad")
        ?.footprintRadiusMetres ?? Number.NaN;
    const out = {
      x: ground.position.x - stockpilePosition.x,
      y: ground.position.y - stockpilePosition.y,
    };
    const reach = Math.hypot(out.x, out.y);
    const distanceOut = stockpile.footprintRadiusMetres + padRadius + 0.5;
    const game = scenarioOf(withIce(scenario().campaign, 400));
    const planned = game.campaign.planConstruction({
      structureTypeId: "landing-pad",
      position: {
        x: stockpilePosition.x + (out.x / reach) * distanceOut,
        y: stockpilePosition.y + (out.y / reach) * distanceOut,
      },
    });
    if (!planned.ok) throw new Error(planned.message);

    expect(uncoveredIceStore(game.state)).toBeUndefined();
  });

  it("keeps the Robot from loading Components on it, for a site beyond it", () => {
    const site = {
      x: stockpilePosition.x + (ground.position.x - stockpilePosition.x) * 10,
      y: stockpilePosition.y + (ground.position.y - stockpilePosition.y) * 10,
    };
    const game = scenario().plan("solar-array", site);

    const state = runUntil(
      game,
      (current) => robotOf(current).activity.kind === "loading-components",
    );

    const robot = robotOf(state).position;
    expect(
      distanceBetween(robot, ground.position) - ground.radiusMetres,
    ).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(
      distanceBetween(robot, heap.position) - heap.radiusMetres,
    ).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(distanceBetween(robot, stockpilePosition)).toBeCloseTo(
      stockpile.footprintRadiusMetres + robotSpec.workingGapMetres,
      6,
    );
  });

  it("shows the ice an Expedition brings back, which the Robot unloads beside it, and less as it is used", () => {
    const game = scenario();
    const started = game.campaign.startExpedition();
    if (!started.ok) throw new Error(started.message);

    const unloading = runUntil(
      game,
      (current) => robotOf(current).activity.kind === "unloading-expedition",
    );
    expect(uncoveredIceStore(unloading)).toBeUndefined();
    const [roverThere] = unloading.rovers;
    if (roverThere === undefined) throw new Error("expected a Rover");
    expect(distanceBetween(roverThere.position, ground.position)).toBeCloseTo(
      ground.radiusMetres +
        rover.footprintRadiusMetres +
        robotSpec.workingGapMetres,
      3,
    );

    const back = runUntil(game, (current) => current.expedition === undefined);
    expect(uncoveredIceStore(back)?.containerLevels).toEqual([1]);
    expect(
      uncoveredIceStore(scenarioOf(withIce(game.campaign, 100)).state)
        ?.containerLevels,
    ).toEqual([0.5]);
  });

  it("has the Rover stop clear of the mat and the heap, whichever way it comes from", () => {
    const base = { stockpile: { position: stockpilePosition } };
    for (let step = 0; step < 16; step++) {
      const angle = (step / 16) * Math.PI * 2;
      const spot = returnSpot(base, {
        x: stockpilePosition.x + Math.cos(angle) * 400,
        y: stockpilePosition.y + Math.sin(angle) * 400,
      });

      expect(distanceBetween(spot, ground.position)).toBeCloseTo(
        ground.radiusMetres +
          rover.footprintRadiusMetres +
          robotSpec.workingGapMetres,
        6,
      );
      expect(
        distanceBetween(spot, stockpilePosition) -
          stockpile.footprintRadiusMetres -
          rover.footprintRadiusMetres -
          robotSpec.workingGapMetres,
      ).toBeGreaterThanOrEqual(-1e-9);
      expect(
        distanceBetween(spot, heap.position) -
          heap.radiusMetres -
          rover.footprintRadiusMetres,
      ).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});

describe("a save from before the ice store", () => {
  it("loads and shows the ice it holds", () => {
    const loaded = loadCampaign(
      readFileSync(
        new URL("./saves/version-15.moonbase", import.meta.url),
        "utf8",
      ),
    );
    if (!loaded.ok) throw new Error(loaded.message);
    const game = scenarioOf(withIce(loaded.campaign, 200));

    expect(uncoveredIceStore(game.state)?.containerLevels).toEqual([1]);
  });
});
