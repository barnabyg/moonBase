import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type StructureType,
  type Catalogue,
} from "../src/catalogue";
import type {
  GroundPosition,
  PowerNetworkSnapshot,
  Snapshot,
  StructureSnapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

// No Machine feels the cold or draws power for a heater at Night, and the
// Robot never has to park one, so that power and time pass as the test
// expects.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutCold } = await import("./without-cold");
  const { withoutDigging } = await import("./without-digging");
  return {
    ...actual,
    catalogue: withoutDigging(withoutCold(actual.catalogue)),
  };
});

function structureType(id: string): StructureType {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === id,
  );
  if (type === undefined) throw new Error(`expected a ${id}`);
  return type;
}
const lightMast = structureType("light-mast");
const solarArray = structureType("solar-array");
const batteryBank = structureType("battery-bank");
const mastSite: GroundPosition = { x: 15, y: -10 };
const solarSite: GroundPosition = { x: 20, y: 12 };
const batterySite: GroundPosition = { x: 30, y: 25 };

/** Runs the game until every planned Construction is commissioned. */
function runUntilBuilt(game: Scenario): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < 5 * 24 * 60; minute++) {
    states.push(game.advance({ minutes: 1 }).state);
    if (game.state.constructions.length === 0) return states;
  }
  throw new Error("The Constructions never finished.");
}

/** Runs the game until the given part of the Lunation has just begun. */
function runUntil(game: Scenario, part: "daylight" | "night"): void {
  do {
    game.advance({ minutes: game.state.lunation.minutesRemaining });
  } while (game.state.lunation.part !== part);
}

function mastOf(state: Snapshot): StructureSnapshot {
  const mast = state.structures.find(
    (structure) => structure.structureTypeId === "light-mast",
  );
  if (mast === undefined) throw new Error("expected a Light Mast");
  return mast;
}

function networkOf(state: Snapshot, structureId: string): PowerNetworkSnapshot {
  const network = state.power.networks.find((candidate) =>
    candidate.structureIds.includes(structureId),
  );
  if (network === undefined) throw new Error("expected a power network");
  return network;
}

/** A solar array, a battery bank and a Light Mast, all commissioned and joined by cable. */
function litBase(): Scenario {
  const game = scenario()
    .plan("solar-array", solarSite)
    .plan("battery-bank", batterySite)
    .plan("light-mast", mastSite);
  runUntilBuilt(game);
  return game;
}

describe("a Light Mast", () => {
  it("comes in the starting stock several times over", () => {
    const masts = Math.min(
      ...lightMast.components.map((need) => {
        const inCargo = catalogue.startingStock
          .filter((stock) => stock.componentId === need.componentId)
          .reduce((total, stock) => total + stock.count, 0);
        return Math.floor(inCargo / need.count);
      }),
    );

    expect(masts).toBeGreaterThanOrEqual(3);
  });

  it("can be planned and goes through all four stages of Construction", () => {
    const game = scenario().plan("light-mast", mastSite);

    const stages = runUntilBuilt(game)
      .flatMap((state) => state.constructions.map((c) => c.stage))
      .filter((stage, index, all) => stage !== all[index - 1]);

    expect(stages).toEqual([
      "site-preparation",
      "component-delivery",
      "assembly",
      "commissioning",
    ]);
    expect(game.state.structures).toEqual([
      expect.objectContaining({
        structureTypeId: "light-mast",
        position: mastSite,
      }),
    ]);
  });

  it("switches on at Night and off in Daylight, drawing power only while it is on", () => {
    const game = litBase();
    const mastId = mastOf(game.state).id;
    const alwaysDrawn =
      solarArray.power.drawKilowatts + batteryBank.power.drawKilowatts;
    expect(game.state.lunation.part).toBe("daylight");
    game.advance({ minutes: 1 });
    expect(mastOf(game.state)).toMatchObject({ lit: false, powered: true });
    expect(networkOf(game.state, mastId).consumptionKilowatts).toBeCloseTo(
      alwaysDrawn,
    );

    runUntil(game, "night");
    game.advance({ minutes: 1 });
    const stored = networkOf(game.state, mastId).storedKilowattHours;
    game.advance({ hours: 1 });

    expect(mastOf(game.state)).toMatchObject({ lit: true, powered: true });
    expect(networkOf(game.state, mastId).consumptionKilowatts).toBeCloseTo(
      alwaysDrawn + lightMast.power.nightDrawKilowatts,
    );
    expect(
      stored - networkOf(game.state, mastId).storedKilowattHours,
    ).toBeCloseTo(alwaysDrawn + lightMast.power.nightDrawKilowatts);

    runUntil(game, "daylight");
    game.advance({ minutes: 1 });

    expect(mastOf(game.state).lit).toBe(false);
    expect(networkOf(game.state, mastId).consumptionKilowatts).toBeCloseTo(
      alwaysDrawn,
    );
  });

  it("is counted in the power forecast for the Night ahead", () => {
    const game = litBase();
    const mastId = mastOf(game.state).id;

    const forecast = game.campaign.forecasts().power.minutesUntilEmpty;

    if (forecast === undefined) throw new Error("expected a forecast");
    game.advance({ minutes: forecast - 1 });
    expect(networkOf(game.state, mastId).storedKilowattHours).toBeGreaterThan(
      0,
    );
    expect(mastOf(game.state).lit).toBe(true);
    game.advance({ minutes: 1 });
    expect(networkOf(game.state, mastId).storedKilowattHours).toBe(0);
    game.advance({ minutes: 1 });
    expect(mastOf(game.state)).toMatchObject({ lit: false, powered: false });
  });

  it("stays dark at Night without power", () => {
    const game = scenario().plan("light-mast", mastSite);
    runUntilBuilt(game);

    runUntil(game, "night");
    game.advance({ hours: 1 });

    expect(mastOf(game.state)).toMatchObject({ lit: false, powered: false });
  });
});

describe("work at Night", () => {
  /** How long the Robot and the excavator take over a solar array, after a wait. */
  function minutesToBuild(wait: (game: Scenario) => void): {
    minutes: number;
    lunation: Snapshot["lunation"]["part"][];
  } {
    const game = scenario();
    wait(game);
    const states = runUntilBuilt(game.plan("solar-array", solarSite));
    return {
      minutes: states.length,
      lunation: states.map((state) => state.lunation.part),
    };
  }

  it("carries on in the dark, with no Light Masts, as fast as in Daylight", () => {
    const inDaylight = minutesToBuild(() => undefined);
    const atNight = minutesToBuild((game) => {
      runUntil(game, "night");
    });

    expect(new Set(inDaylight.lunation)).toEqual(new Set(["daylight"]));
    expect(new Set(atNight.lunation)).toEqual(new Set(["night"]));
    expect(atNight.minutes).toBe(inDaylight.minutes);
  });
});
