import { describe, expect, it } from "vitest";
import { catalogue, type StructureType } from "../src/catalogue";
import type {
  GroundPosition,
  PowerNetworkSnapshot,
  Snapshot,
} from "../src/simulation";
import { scenario, type Scenario } from "./scenario";

function structureType(id: string): StructureType {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === id,
  );
  if (type === undefined) throw new Error(`expected a ${id}`);
  return type;
}
const solarArray = structureType("solar-array");
const batteryBank = structureType("battery-bank");
const solarSite: GroundPosition = { x: 20, y: 12 };
const batterySite: GroundPosition = { x: 30, y: 25 };
const metresPerMinute = catalogue.robot.cableLayingSpeedMetresPerHour / 60;

/** Runs the game until every planned Construction is commissioned. */
function runUntilBuilt(game: Scenario): Snapshot[] {
  const states: Snapshot[] = [];
  for (let minute = 0; minute < 5 * 24 * 60; minute++) {
    states.push(game.advance({ minutes: 1 }).state);
    if (game.state.constructions.length === 0) return states;
  }
  throw new Error("The Constructions never finished.");
}

/** Runs the game until Night falls. */
function runUntilNight(game: Scenario): void {
  while (game.state.lunation.part !== "night") {
    game.advance({ minutes: game.state.lunation.minutesRemaining });
  }
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

/** A solar array and then a battery bank, both commissioned and connected. */
function poweredBase(): Scenario {
  const game = scenario()
    .plan("solar-array", solarSite)
    .plan("battery-bank", batterySite);
  runUntilBuilt(game);
  return game;
}

describe("a battery bank", () => {
  it("can be planned and goes through all four stages of Construction", () => {
    const game = scenario().plan("battery-bank", batterySite);

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
        structureTypeId: "battery-bank",
        position: batterySite,
      }),
    ]);
  });
});

describe("laying cable", () => {
  it("isn't needed for the first Structure, as there is nothing powered to lay it from", () => {
    const game = scenario().plan("solar-array", solarSite);

    const states = runUntilBuilt(game);

    expect(game.state.cables).toEqual([]);
    expect(
      states.some((state) => state.robots[0]?.activity.kind === "laying-cable"),
    ).toBe(false);
  });

  it("is part of each later Construction: the Robot lays a visible cable from the nearest powered Structure", () => {
    const game = scenario()
      .plan("solar-array", solarSite)
      .plan("battery-bank", batterySite);
    const [solarId, batteryId] = game.state.constructions.map((c) => c.id);

    const states = runUntilBuilt(game);

    expect(game.state.cables).toEqual([
      expect.objectContaining({
        fromStructureId: solarId,
        toStructureId: batteryId,
        complete: true,
      }),
    ]);
    const [cable] = game.state.cables;
    const route = cable?.route ?? [];
    const first = route[0] ?? { x: NaN, y: NaN };
    const last = route.at(-1) ?? { x: NaN, y: NaN };
    expect(
      Math.hypot(first.x - solarSite.x, first.y - solarSite.y),
    ).toBeCloseTo(solarArray.footprintRadiusMetres);
    expect(
      Math.hypot(last.x - batterySite.x, last.y - batterySite.y),
    ).toBeCloseTo(batteryBank.footprintRadiusMetres);
    // The cable grows as the Robot lays it.
    const laid = states
      .flatMap((state) => state.cables)
      .map((each) => cableLength(each.route));
    expect(laid).toEqual([...laid].sort((a, b) => a - b));
    expect(laid[0]).toBeLessThan(1);
  });

  it("takes time that depends on the cable's length", () => {
    const layingMinutes = (site: GroundPosition) => {
      const game = scenario()
        .plan("solar-array", solarSite)
        .plan("battery-bank", site);
      const states = runUntilBuilt(game);
      return {
        minutes: states.filter(
          (state) => state.robots[0]?.activity.kind === "laying-cable",
        ).length,
        length: cableLength(game.state.cables[0]?.route ?? []),
      };
    };

    const near = layingMinutes(batterySite);
    const far = layingMinutes({ x: 60, y: 80 });

    expect(far.length).toBeGreaterThan(near.length * 2);
    for (const { minutes, length } of [near, far]) {
      expect(minutes).toBe(Math.ceil(length / metresPerMinute - 1e-9));
    }
  });

  it("is the Robot's work while the excavator grades the site by itself", () => {
    const game = scenario()
      .plan("solar-array", solarSite)
      .plan("battery-bank", batterySite);
    const batteryId = game.state.constructions[1]?.id;

    const states = runUntilBuilt(game);

    const grading = states.filter((state) =>
      state.machines.some(
        (machine) =>
          machine.activity.kind === "working" &&
          machine.activity.constructionId === batteryId,
      ),
    );
    expect(grading.length).toBeGreaterThan(0);
    // The last minute of grading, the Robot may start on something else.
    for (const state of grading.slice(0, -1)) {
      const activity = state.robots[0]?.activity;
      expect(activity).toMatchObject({ constructionId: batteryId });
      expect(
        activity?.kind === "laying-cable" ||
          (activity?.kind === "walking" && activity.destination === "cable"),
      ).toBe(true);
    }
  });
});

describe("the power network", () => {
  it("connects only Structures joined by cable", () => {
    const game = poweredBase();
    const [solar, battery] = game.state.structures;

    expect(game.state.power.networks).toEqual([
      expect.objectContaining({ structureIds: [solar?.id, battery?.id] }),
    ]);
  });

  it("produces solar power in Daylight and none at Night", () => {
    const game = poweredBase();
    const solarId = game.state.structures[0]?.id ?? "";
    expect(game.state.lunation.part).toBe("daylight");
    expect(networkOf(game.state, solarId).generationKilowatts).toBe(
      solarArray.power.generationKilowatts,
    );

    runUntilNight(game);
    game.advance({ minutes: 1 });

    expect(networkOf(game.state, solarId).generationKilowatts).toBe(0);
  });

  it("charges the battery bank from any surplus in Daylight, up to its capacity", () => {
    const game = poweredBase();
    const batteryId = game.state.structures[1]?.id ?? "";
    const before = networkOf(game.state, batteryId).storedKilowattHours;

    game.advance({ hours: 1 });
    const after = networkOf(game.state, batteryId).storedKilowattHours;
    game.advance({ earthDays: 2 });

    const surplus =
      solarArray.power.generationKilowatts -
      solarArray.power.drawKilowatts -
      batteryBank.power.drawKilowatts;
    expect(after - before).toBeCloseTo(surplus);
    expect(networkOf(game.state, batteryId)).toMatchObject({
      storedKilowattHours: batteryBank.power.storageKilowattHours,
      storageCapacityKilowattHours: batteryBank.power.storageKilowattHours,
      consumptionKilowatts:
        solarArray.power.drawKilowatts + batteryBank.power.drawKilowatts,
      powered: true,
    });
  });

  it("drains the battery bank through the Night to cover the shortfall", () => {
    const game = poweredBase();
    const batteryId = game.state.structures[1]?.id ?? "";
    runUntilNight(game);

    const stored = [0, 1, 2, 3].map(() => {
      const { storedKilowattHours } = networkOf(game.state, batteryId);
      game.advance({ earthDays: 1 });
      return storedKilowattHours;
    });

    for (const [index, today] of stored.slice(1).entries()) {
      expect((stored[index] ?? 0) - today).toBeCloseTo(
        (solarArray.power.drawKilowatts + batteryBank.power.drawKilowatts) * 24,
      );
    }
  });

  it("gives an unconnected Structure no power, until a cable joins it to a solar array", () => {
    // Nothing is powered when the battery bank is commissioned, so no cable
    // is laid to it; the solar array's cable then joins the two.
    const game = scenario()
      .plan("battery-bank", batterySite)
      .plan("solar-array", solarSite);
    const [batteryId, solarId] = game.state.constructions.map((c) => c.id);
    while (game.state.structures.length === 0) game.advance({ minutes: 1 });
    game.advance({ hours: 1 });

    expect(game.state.cables).toEqual([]);
    expect(networkOf(game.state, batteryId ?? "")).toMatchObject({
      structureIds: [batteryId],
      storedKilowattHours: 0,
      powered: false,
    });
    expect(
      game.state.structures.find((structure) => structure.id === batteryId),
    ).toMatchObject({ powered: false });

    runUntilBuilt(game);
    game.advance({ hours: 1 });

    expect(game.state.cables).toEqual([
      expect.objectContaining({
        fromStructureId: batteryId,
        toStructureId: solarId,
        complete: true,
      }),
    ]);
    expect(networkOf(game.state, batteryId ?? "")).toMatchObject({
      structureIds: [batteryId, solarId],
      powered: true,
    });
    expect(
      networkOf(game.state, batteryId ?? "").storedKilowattHours,
    ).toBeGreaterThan(0);
  });
});

describe("the power forecast", () => {
  it.each(["daylight", "night"] as const)(
    "says when stored power will run out, starting in %s",
    (part) => {
      const game = poweredBase();
      if (part === "night") runUntilNight(game);
      const batteryId = game.state.structures[1]?.id ?? "";

      const forecast = game.campaign
        .forecasts()
        .power.networks.find((network) =>
          network.structureIds.includes(batteryId),
        )?.minutesUntilEmpty;

      if (forecast === undefined) throw new Error("expected a forecast");
      expect(game.campaign.forecasts().power.minutesUntilEmpty).toBe(forecast);
      game.advance({ minutes: forecast - 1 });
      expect(
        networkOf(game.state, batteryId).storedKilowattHours,
      ).toBeGreaterThan(0);
      expect(game.state.lunation.part).toBe("night");
      game.advance({ minutes: 1 });
      expect(networkOf(game.state, batteryId).storedKilowattHours).toBe(0);
    },
  );

  it("says nothing runs out where nothing is stored", () => {
    const game = scenario().plan("solar-array", solarSite);
    runUntilBuilt(game);

    expect(game.campaign.forecasts().power).toEqual({
      minutesUntilEmpty: undefined,
      networks: [
        {
          structureIds: [game.state.structures[0]?.id],
          minutesUntilEmpty: undefined,
        },
      ],
    });
  });
});
