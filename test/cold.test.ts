import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type MachineSnapshot,
  type RobotActivity,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";
import { changed, worn } from "./worn";

// Dust wears nothing down, so that only the cold changes a Machine's
// Condition.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDust } = await import("./without-dust");
  return { ...actual, catalogue: withoutDust(actual.catalogue) };
});

const arraySite: GroundPosition = { x: 20, y: 12 };
const bankSite: GroundPosition = { x: -30, y: 4 };
const habitatSite: GroundPosition = { x: 30, y: -30 };
const mastSite: GroundPosition = { x: 40, y: -45 };
const { plugInReachMetres, parkingLeadHours } = catalogue.cold;
const machineType = (id: string) => {
  const type = catalogue.machineTypes.find((candidate) => candidate.id === id);
  if (type === undefined) throw new Error(`expected a ${id}`);
  return type;
};
const heaters = catalogue.machineTypes.reduce(
  (sum, type) => sum + type.heaterKilowatts,
  0,
);

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

function structure(state: Snapshot, type: string): StructureSnapshot {
  const found = state.structures.find((s) => s.structureTypeId === type);
  if (found === undefined) throw new Error(`expected a ${type}`);
  return found;
}

function machines(campaign: Campaign): readonly MachineSnapshot[] {
  return campaign.snapshot().machines;
}

/** Advances to the given number of game-minutes before Night falls. */
function untilBeforeNight(campaign: Campaign, minutes: number): void {
  const { lunation } = campaign.snapshot();
  if (lunation.part !== "daylight") throw new Error("expected Daylight");
  campaign.advance(lunation.minutesRemaining - minutes);
}

/** Advances to the first game-minute of Night, and one more, so that its power has been supplied. */
function intoNight(campaign: Campaign): void {
  untilBeforeNight(campaign, 0);
  campaign.advance(1);
  expect(campaign.snapshot().lunation.part).toBe("night");
}

describe("being plugged in", () => {
  it("needs a Machine to stand within reach of a powered Structure", () => {
    const { campaign } = poweredBase();
    const bank = structure(campaign.snapshot(), "battery-bank");

    for (const machine of machines(campaign)) {
      const radius =
        catalogue.structureTypes.find((t) => t.id === "battery-bank")
          ?.footprintRadiusMetres ?? 0;
      const gap =
        Math.hypot(
          machine.position.x - bank.position.x,
          machine.position.y - bank.position.y,
        ) -
        radius -
        machineType(machine.machineTypeId).footprintRadiusMetres;
      expect(machine.pluggedIn).toBe(gap <= plugInReachMetres);
    }
  });
});

describe("parking", () => {
  it("has the Robot drive every idle Machine that isn't plugged in to a powered Structure before Night", () => {
    const { campaign } = poweredBase();
    untilBeforeNight(campaign, parkingLeadHours * 60 + 1);
    expect(machines(campaign).some((m) => !m.pluggedIn)).toBe(true);
    expect(campaign.snapshot().parking).toEqual([]);

    const drives = new Set<string>();
    for (let minutes = 0; minutes < parkingLeadHours * 60; minutes++) {
      campaign.advance(1);
      const activity = campaign.snapshot().robots[0]?.activity;
      if (activity?.kind === "driving-machine" && "structureId" in activity) {
        drives.add(`${activity.machineId} to ${activity.structureId}`);
        const machine = machines(campaign).find(
          (m) => m.id === activity.machineId,
        );
        expect(machine?.activity.kind).toBe("being-parked");
      }
    }

    // Still Daylight, a game-minute before Night falls.
    expect(campaign.snapshot().lunation).toMatchObject({
      part: "daylight",
      minutesRemaining: 1,
    });
    expect(drives.size).toBeGreaterThan(0);
    expect(machines(campaign).map((m) => m.pluggedIn)).toEqual([true, true]);
    // Only the Rover, parked after the Machines, may still be on its way.
    expect(
      campaign
        .snapshot()
        .parking.filter((parking) => parking.subject.kind === "machine"),
    ).toEqual([]);
  });

  it("isn't raised when there is no powered Structure to park beside", () => {
    const { campaign } = scenario();
    intoNight(campaign);

    expect(campaign.snapshot().parking).toEqual([]);
    expect(machines(campaign).map((m) => m.pluggedIn)).toEqual([false, false]);
  });

  it("comes after Maintenance and before Constructions", () => {
    const game = poweredBase();
    untilBeforeNight(game.campaign, parkingLeadHours * 60 + 1);
    game.plan("light-mast", mastSite);
    const bankId = structure(game.state, "battery-bank").id;
    const mastId = game.state.constructions[0]?.id ?? "";
    const campaign = worn(game.campaign, bankId, 40);
    const work = (activity: RobotActivity | undefined): string | undefined => {
      if (activity === undefined || activity.kind === "idle") return undefined;
      if (activity.kind === "driving-machine" && "structureId" in activity) {
        return activity.structureId === mastId ? "construction" : "parking";
      }
      if ("machineId" in activity) return "parking";
      if (!("structureId" in activity)) return undefined;
      if (activity.structureId === mastId) return "construction";
      return activity.structureId === bankId ? "maintenance" : undefined;
    };

    const order: string[] = [];
    for (let minutes = 0; !order.includes("construction"); minutes++) {
      if (minutes > 24 * 60) throw new Error("The Construction never started.");
      campaign.advance(1);
      const kind = work(campaign.snapshot().robots[0]?.activity);
      if (kind !== undefined && order.at(-1) !== kind) order.push(kind);
    }

    expect(order).toEqual(["maintenance", "parking", "construction"]);
  });

  it("happens during Night too, whenever a Machine becomes idle and isn't plugged in, after work away from power that leaves it in the cold", () => {
    const game = poweredBase();
    untilBeforeNight(game.campaign, 0);
    game.advance({ minutes: 1 });
    expect(game.state.machines.map((m) => m.pluggedIn)).toEqual([true, true]);
    game.plan("light-mast", mastSite);
    const { campaign } = game;
    const excavator = () => machines(campaign)[0];

    let coldMinutes = 0;
    let lostToCold = 0;
    for (let minutes = 0; ; minutes++) {
      if (minutes > 24 * 60) throw new Error("Site Preparation never ended.");
      const before = excavator()?.conditionPercent ?? 0;
      const wasPowered = excavator()?.powered ?? true;
      campaign.advance(1);
      if (!wasPowered) {
        coldMinutes += 1;
        lostToCold += before - (excavator()?.conditionPercent ?? 0);
      }
      if (campaign.snapshot().constructions[0]?.stage !== "site-preparation") {
        break;
      }
    }
    expect(coldMinutes).toBeGreaterThan(60);
    expect(lostToCold).toBeCloseTo(
      (coldMinutes * machineType("excavator").coldWearPercentPerNightHour) / 60,
      6,
    );

    for (let minutes = 0; excavator()?.pluggedIn !== true; minutes++) {
      if (minutes > 24 * 60) throw new Error("The excavator was never parked.");
      campaign.advance(1);
    }
    expect(campaign.snapshot().lunation.part).toBe("night");
  });
});

describe("heaters", () => {
  it("draw their power from the network of plugged-in Machines at Night, and the power forecast counts them", () => {
    const { campaign } = poweredBase();
    intoNight(campaign);
    const [network] = campaign.snapshot().power.networks;

    const structuresDraw = ["solar-array", "battery-bank"].reduce(
      (sum, id) =>
        sum +
        (catalogue.structureTypes.find((type) => type.id === id)?.power
          .drawKilowatts ?? Number.NaN),
      0,
    );
    expect(machines(campaign).map((m) => m.powered)).toEqual([true, true]);
    expect(network?.consumptionKilowatts).toBeCloseTo(
      structuresDraw + heaters,
      9,
    );
    expect(campaign.forecasts().power.minutesUntilEmpty).toBe(
      Math.ceil(
        ((network?.storedKilowattHours ?? 0) / (structuresDraw + heaters)) * 60,
      ),
    );
  });

  it("come after the Habitat, which is still supplied first", () => {
    const game = buildAll(poweredBase().plan("habitat", habitatSite));
    intoNight(game.campaign);
    // Only just enough left for the Habitat's next game-minute.
    const habitat = structure(game.state, "habitat");
    const habitatDraw =
      (catalogue.structureTypes.find((t) => t.id === "habitat")?.power
        .drawKilowatts ?? 0) / 60;
    const short = changed(game.campaign, (state) => {
      for (const saved of state.structures) {
        saved.storedKilowattHours =
          saved.id === structure(game.state, "battery-bank").id
            ? habitatDraw + 1e-6
            : 0;
      }
    });

    short.advance(1);

    expect(
      short.snapshot().structures.find((s) => s.id === habitat.id)?.powered,
    ).toBe(true);
    expect(machines(short).map((m) => [m.pluggedIn, m.powered])).toEqual([
      [true, false],
      [true, false],
    ]);
  });
});

describe("the cold", () => {
  it("wears down a Machine left unpowered at Night faster than a parked one, which it doesn't wear at all", () => {
    const parked = poweredBase().campaign;
    const unpowered = scenario().campaign;
    for (const campaign of [parked, unpowered]) intoNight(campaign);
    const before = (campaign: Campaign) =>
      machines(campaign).map((m) => m.conditionPercent);
    const parkedBefore = before(parked);
    const unpoweredBefore = before(unpowered);

    for (const campaign of [parked, unpowered]) campaign.advance(10 * 60);

    expect(before(parked)).toEqual(parkedBefore);
    for (const [index, machine] of machines(unpowered).entries()) {
      expect(
        (unpoweredBefore[index] ?? 0) - machine.conditionPercent,
      ).toBeCloseTo(
        10 * machineType(machine.machineTypeId).coldWearPercentPerNightHour,
        6,
      );
    }
  });

  it("wears down a plugged-in Machine whose network can't supply its heater", () => {
    const game = poweredBase();
    intoNight(game.campaign);
    const flat = changed(game.campaign, (state) => {
      for (const saved of state.structures) saved.storedKilowattHours = 0;
    });
    flat.advance(1);
    const before = machines(flat).map((m) => m.conditionPercent);

    flat.advance(60);

    expect(machines(flat).map((m) => [m.pluggedIn, m.powered])).toEqual([
      [true, false],
      [true, false],
    ]);
    for (const [index, machine] of machines(flat).entries()) {
      expect((before[index] ?? 0) - machine.conditionPercent).toBeCloseTo(
        machineType(machine.machineTypeId).coldWearPercentPerNightHour,
        6,
      );
    }
  });

  it("doesn't wear anything in Daylight", () => {
    const { campaign } = scenario();
    const before = machines(campaign).map((m) => m.conditionPercent);

    campaign.advance(24 * 60);

    expect(machines(campaign).map((m) => m.conditionPercent)).toEqual(before);
  });

  it("raises Maintenance for a Machine it wears below the threshold", () => {
    const { campaign } = scenario();
    intoNight(campaign);

    const events: GameEvent[] = [];
    for (let hours = 0; events.length === 0; hours++) {
      if (hours > 10 * 24) throw new Error("No Maintenance was raised.");
      events.push(
        ...campaign
          .advance(60)
          .filter(
            (event) =>
              event.kind === "maintenance-needed" &&
              event.target.kind === "machine",
          ),
      );
    }

    expect(events[0]).toMatchObject({
      target: { kind: "machine" },
      restoresCondition: true,
    });
  });
});

describe("parking and power through saving and loading", () => {
  it("carry on exactly as they would have", () => {
    const { campaign } = poweredBase();
    untilBeforeNight(campaign, parkingLeadHours * 60 - 30);
    expect(campaign.snapshot().parking.length).toBeGreaterThan(0);

    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
    expect(loaded.campaign.advance(12 * 60)).toEqual(campaign.advance(12 * 60));
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
  });
});
