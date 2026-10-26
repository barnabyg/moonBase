import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type RoverSnapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";
import { worn } from "./worn";

// Only the cold and Maintenance change the Rover's Condition, and the Robot
// doesn't dig Regolith when it has nothing else to do.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDust } = await import("./without-dust");
  const { withoutDigging } = await import("./without-digging");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  return {
    ...actual,
    catalogue: withoutMicrometeorites(
      withoutDigging(withoutDust(actual.catalogue)),
    ),
  };
});

const { rover: roverType } = catalogue;
const arraySite: GroundPosition = { x: 20, y: 12 };
const bankSite: GroundPosition = { x: -30, y: 4 };

function roverOf(campaign: Campaign): RoverSnapshot {
  const [rover] = campaign.snapshot().rovers;
  if (rover === undefined) throw new Error("expected a Rover");
  return rover;
}

/** Runs the game until the Robot has carried out every planned Construction. */
function buildAll(game: Scenario): Scenario {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
  return game;
}

/** A solar array and a battery bank cabled to it, built in the first Daylight. */
function poweredBase(): Scenario {
  return buildAll(
    scenario().plan("solar-array", arraySite).plan("battery-bank", bankSite),
  );
}

/** Advances through the first game-minute of Night, and one more, so that its power has been supplied. */
function intoNight(campaign: Campaign): void {
  const { lunation } = campaign.snapshot();
  if (lunation.part !== "daylight") throw new Error("expected Daylight");
  campaign.advance(lunation.minutesRemaining + 1);
}

describe("the Rover", () => {
  it("comes in the starting cargo, parked near the Lander at full Condition", () => {
    const { state } = scenario();

    expect(state.rovers).toEqual([
      {
        id: "rover-1",
        position: catalogue.landingSite.roverPositions[0],
        activity: { kind: "idle" },
        conditionPercent: 100,
        performance: 1,
        pluggedIn: false,
        powered: false,
      },
    ]);
  });

  it("can't have a Structure placed over it", () => {
    const { campaign } = scenario();
    const { position } = roverOf(campaign);

    expect(
      campaign.checkPlacement({ structureTypeId: "light-mast", position }),
    ).toEqual({
      ok: false,
      reason: "overlaps-rover",
      message: "The light mast would overlap the Rover.",
    });
  });

  it("is kept through saving and loading", () => {
    const campaign = worn(scenario().campaign, "rover-1", 63);

    expect(roverOf(campaign).conditionPercent).toBe(63);
    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.campaign.snapshot().rovers).toEqual(
      campaign.snapshot().rovers,
    );
  });
});

describe("the cold of Night on the Rover", () => {
  it("wears down a Rover left unpowered, at the catalogue's rate", () => {
    const { campaign } = scenario();
    intoNight(campaign);
    const before = roverOf(campaign).conditionPercent;

    campaign.advance(10 * 60);

    expect(before - roverOf(campaign).conditionPercent).toBeCloseTo(
      10 * roverType.coldWearPercentPerNightHour,
      6,
    );
  });

  it("is spared by having the Robot park the Rover within plug-in reach of a powered Structure before Night", () => {
    const { campaign } = poweredBase();
    expect(roverOf(campaign).pluggedIn).toBe(false);
    const drives = new Set<string>();
    const { lunation } = campaign.snapshot();
    for (let minute = 0; minute <= lunation.minutesRemaining; minute++) {
      campaign.advance(1);
      const activity = campaign.snapshot().robots[0]?.activity;
      if (activity?.kind === "driving-rover") {
        drives.add(activity.roverId);
        expect(roverOf(campaign).activity.kind).toBe("being-parked");
      }
    }
    expect(drives).toEqual(new Set(["rover-1"]));
    campaign.advance(1);
    expect(campaign.snapshot().lunation.part).toBe("night");
    expect(roverOf(campaign)).toMatchObject({
      activity: { kind: "idle" },
      pluggedIn: true,
      powered: true,
    });

    campaign.advance(24 * 60);

    expect(roverOf(campaign).conditionPercent).toBe(100);
  });

  it("has its heater draw power from the network it is plugged in to at Night", () => {
    const { campaign } = poweredBase();
    const { lunation } = campaign.snapshot();
    campaign.advance(lunation.minutesRemaining + 1);
    const night = campaign.snapshot();

    const machineHeaters = night.machines.filter(
      (machine) => machine.powered,
    ).length;
    const structures = catalogue.structureTypes
      .filter((type) => ["solar-array", "battery-bank"].includes(type.id))
      .reduce(
        (sum, type) =>
          sum + type.power.drawKilowatts + type.power.nightDrawKilowatts,
        0,
      );
    expect(night.power.networks[0]?.consumptionKilowatts).toBeCloseTo(
      structures +
        machineHeaters * 0.2 +
        (roverOf(campaign).powered ? roverType.heaterKilowatts : 0),
      6,
    );
    expect(roverOf(campaign).powered).toBe(true);
  });
});

describe("Maintenance of the Rover", () => {
  it("is raised below the threshold, and has the Robot bring spare Components and restore it to 100%", () => {
    const campaign = worn(scenario().campaign, "rover-1", 45);
    const spares = Math.ceil(
      (100 - 45) / catalogue.maintenance.conditionPercentPerSpareComponent,
    );
    const stockBefore = campaign
      .snapshot()
      .stockpile.components.find(
        (stock) => stock.componentId === "spare-component",
      )?.count;
    const events: GameEvent[] = [];

    for (let hours = 0; hours < 24; hours++) {
      events.push(...campaign.advance(60));
    }

    expect(events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["maintenance-needed", "maintenance-completed"]),
    );
    expect(
      events.find((event) => event.kind === "maintenance-completed"),
    ).toMatchObject({
      target: { kind: "rover", roverId: "rover-1" },
      spareComponents: spares,
    });
    expect(roverOf(campaign).conditionPercent).toBe(100);
    expect(
      campaign
        .snapshot()
        .stockpile.components.find(
          (stock) => stock.componentId === "spare-component",
        )?.count,
    ).toBe((stockBefore ?? 0) - spares);
  });

  it("brings a Broken Rover back into use", () => {
    const campaign = worn(scenario().campaign, "rover-1", 0);
    expect(roverOf(campaign).performance).toBe(0);
    expect(campaign.snapshot().maintenance).toEqual([]);

    campaign.advance(1);
    expect(campaign.snapshot().maintenance[0]).toMatchObject({
      target: { kind: "rover", roverId: "rover-1" },
      spareComponents: 5,
    });

    campaign.advance(24 * 60);
    expect(roverOf(campaign)).toMatchObject({
      conditionPercent: 100,
      performance: 1,
    });
  });

  it("waits while the base's stock has too few spare Components", () => {
    const campaign = worn(scenario().campaign, "rover-1", 45, 1);

    campaign.advance(6 * 60);

    expect(campaign.snapshot().maintenance[0]).toMatchObject({
      target: { kind: "rover", roverId: "rover-1" },
      waiting: { reason: "missing-spare-components", missing: 2 },
    });
    expect(roverOf(campaign).conditionPercent).toBe(45);
  });
});

describe("the spare Components forecast", () => {
  it("counts the cold wearing down the Rover at Night", () => {
    const { campaign } = scenario();
    intoNight(campaign);
    const unpowered = campaign
      .snapshot()
      .machines.filter((machine) => !machine.powered);
    const machineCold = unpowered.reduce(
      (sum, machine) =>
        sum +
        (catalogue.machineTypes.find(
          (type) => type.id === machine.machineTypeId,
        )?.coldWearPercentPerNightHour ?? 0),
      0,
    );
    const { perEarthDay } = campaign.forecasts().spareComponents;

    expect(perEarthDay).toBeCloseTo(
      ((machineCold + roverType.coldWearPercentPerNightHour) * 24) /
        catalogue.maintenance.conditionPercentPerSpareComponent,
      6,
    );
  });
});
