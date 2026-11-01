import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type Catalogue,
  type StructureType,
} from "../src/catalogue";
import {
  loadCampaign,
  reserveKilograms,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { formatEvent } from "../src/ui/notifications-text";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { changed, worn } from "./worn";

// A Greenhouse's Design is unlocked from the start, with two Greenhouses'
// Components and a large battery bank's in the starting stock. Nothing wears down
// by Dust or Micrometeorites, no Machine draws power for a heater at Night, and the
// Habitat draws none, so that what the base's stocks and battery banks do is the
// Greenhouse's alone.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  const { withoutDust } = await import("./without-dust");
  const { withoutCold } = await import("./without-cold");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { withoutDigging } = await import("./without-digging");
  const { safeHabitat } = await import("./safe-habitat");
  const greenhouse = actual.catalogue.structureTypes.find(
    (type) => type.id === "greenhouse",
  );
  const base = withDesigns(
    withoutDigging(
      withoutMicrometeorites(
        withoutCold(
          withoutDust(
            safeHabitat(actual.catalogue, [
              "power",
              "radiation",
              "solar-particle-events",
            ]),
          ),
        ),
      ),
    ),
    [
      greenhouse?.designId ?? "greenhouse-design-missing",
      "large-battery-banks",
      "bulk-supply-tanks",
      "water-processing",
    ],
  );
  return {
    ...actual,
    catalogue: {
      ...base,
      // So that only water can end a long test.
      lifeSupportStocks: base.lifeSupportStocks.map((stock) =>
        stock.id === "oxygen"
          ? { ...stock, usePerEarthDayKilograms: 0 }
          : stock,
      ),
      // A second of each, for the tests that build two.
      startingStock: [
        ...base.startingStock,
        ...(greenhouse?.components ?? []),
        ...(actual.catalogue.structureTypes.find(
          (type) => type.id === "water-processing-plant",
        )?.components ?? []),
        ...(actual.catalogue.structureTypes.find(
          (type) => type.id === "solar-array",
        )?.components ?? []),
        {
          componentId: actual.catalogue.maintenance.spareComponentId,
          count: 30,
        },
      ],
    },
  };
});

function structureType(id: string): StructureType {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === id,
  );
  if (type === undefined) throw new Error(`expected a ${id}`);
  return type;
}
const greenhouse = structureType("greenhouse");
const { growing } = greenhouse;
if (growing === undefined) throw new Error("expected rounds of growing");
const roundMinutes = growing.lengthHours * 60;
const waterPerHour =
  greenhouse.recipes?.[0]?.inputs[0]?.kilogramsPerHour ?? Number.NaN;

const solarSite: GroundPosition = { x: 20, y: 12 };
const batterySite: GroundPosition = { x: 30, y: 25 };
const secondSolarSite: GroundPosition = { x: 18, y: 28 };
const greenhouseSite: GroundPosition = { x: 34, y: 10 };
const secondGreenhouseSite: GroundPosition = { x: 48, y: 12 };
const habitatSite: GroundPosition = { x: 25, y: -20 };
const plantSite: GroundPosition = { x: 46, y: 28 };
const secondPlantSite: GroundPosition = { x: 56, y: 28 };
const tankSite: GroundPosition = { x: 60, y: 14 };

function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 8 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

function runUntil(game: Scenario, part: "daylight" | "night"): void {
  do {
    game.advance({ minutes: game.state.lunation.minutesRemaining });
  } while (game.state.lunation.part !== part);
}

function greenhousesOf(state: Snapshot): StructureSnapshot[] {
  return state.structures.filter(
    (structure) => structure.structureTypeId === greenhouse.id,
  );
}

function completed(events: readonly GameEvent[]): GameEvent[] {
  return events.filter((event) => event.kind === "greenhouse-round-completed");
}

function structureIdOf(event: GameEvent): string | undefined {
  return event.kind === "greenhouse-round-completed"
    ? event.structureId
    : undefined;
}

function lost(events: readonly GameEvent[]): GameEvent[] {
  return events.filter((event) => event.kind === "greenhouse-round-lost");
}

function water(state: Snapshot): number {
  return (
    state.lifeSupport.find(({ stockId }) => stockId === "water")?.kilograms ?? 0
  );
}

/** The Campaign as saved, but with so much water. */
function withWater(game: Scenario, kilograms: number): Scenario {
  return scenarioOf(
    changed(game.campaign, (saved) => {
      for (const stock of saved.lifeSupport) {
        if (stock.stockId === "water") stock.kilograms = kilograms;
      }
    }),
  );
}

/** The Campaign as saved, but with so much energy stored in each battery bank. */
function withStored(game: Scenario, kilowattHours: number): Scenario {
  return scenarioOf(
    changed(game.campaign, (saved) => {
      for (const structure of saved.structures) {
        if (structure.storedKilowattHours > 0) {
          structure.storedKilowattHours = kilowattHours;
        }
      }
    }),
  );
}

/** Solar arrays, large battery banks and a Greenhouse, all commissioned and cabled. */
function greenhouseBase(): Scenario {
  const game = scenario()
    .plan("solar-array", solarSite)
    .plan("solar-array", secondSolarSite)
    .plan("large-battery-bank", batterySite)
    .plan(greenhouse.id, greenhouseSite);
  runUntilBuilt(game);
  return game;
}

/** `greenhouseBase`, with the Mission Director moved in to a Habitat that draws nothing, drinking the base's water. */
function livedIn(game: Scenario): Scenario {
  game.plan("habitat", habitatSite);
  runUntilBuilt(game);
  const home = game.state.structures.find(
    ({ structureTypeId }) => structureTypeId === "habitat",
  );
  const moved = game.campaign.moveMissionDirectorIn(home?.id ?? "");
  if (!moved.ok) throw new Error(moved.message);
  return game;
}

describe("a Greenhouse", () => {
  it("is a Plant with no battery bank to charge first: it grows in Daylight, taking its water a batch at a time, drawing its Daylight power", () => {
    const game = withWater(greenhouseBase(), 300);
    game.advance({ hours: 1 });
    expect(game.state.lunation.part).toBe("daylight");
    const [house] = greenhousesOf(game.state);

    expect(house?.plant).toMatchObject({ running: true });
    const before = water(game.state);
    game.advance({ hours: 5 });

    expect(water(game.state)).toBeCloseTo(before - 5 * waterPerHour, 5);
    const network = game.state.power.networks.find(({ structureIds }) =>
      structureIds.includes(house?.id ?? ""),
    );
    const others =
      2 * structureType("solar-array").power.drawKilowatts +
      structureType("large-battery-bank").power.drawKilowatts;
    expect(network?.consumptionKilowatts).toBeCloseTo(
      others + (greenhouse.power.daylightDrawKilowatts ?? 0),
    );
  });

  it("goes on through the Night, drinking and drawing its lamps' power, and is lit", () => {
    const game = withWater(greenhouseBase(), 300);
    runUntil(game, "night");
    const nightWater = water(game.state);
    game.advance({ hours: 24 });

    const [house] = greenhousesOf(game.state);
    expect(house).toMatchObject({ lit: true });
    expect(house?.plant).toMatchObject({ running: true });
    expect(water(game.state)).toBeCloseTo(nightWater - 24 * waterPerHour, 5);
    const network = game.state.power.networks.find(({ structureIds }) =>
      structureIds.includes(house?.id ?? ""),
    );
    const others =
      2 * structureType("solar-array").power.drawKilowatts +
      structureType("large-battery-bank").power.drawKilowatts;
    expect(network?.consumptionKilowatts).toBeCloseTo(
      others + greenhouse.power.nightDrawKilowatts,
    );
  });

  it("completes a round after its length, Daylight and Night alike, earning its Science through the base's Science, with a notification", () => {
    const game = withWater(greenhouseBase(), 390);
    const house = greenhousesOf(game.state)[0];
    // It has been growing since it was commissioned.
    const grown = house?.growingMinutes ?? 0;
    const science = game.state.science;

    const before = game.campaign.advance(roundMinutes - grown - 1);
    expect(completed(before)).toEqual([]);

    const events = completed(game.campaign.advance(1));
    expect(events).toEqual([
      {
        kind: "greenhouse-round-completed",
        atMinute: game.state.clock.elapsedMinutes,
        structureId: house?.id,
        structureTypeId: "greenhouse",
        science: growing.science,
      },
    ]);
    const [event] = events;
    if (event === undefined) throw new Error("expected an event");
    expect(formatEvent(event)).toBe(
      `Greenhouse: a round of growing complete, earning ${growing.science} Science`,
    );
    expect(game.state.science).toBe(science + growing.science);
    expect(greenhousesOf(game.state)[0]?.growingMinutes).toBe(0);
    // Not a Research Task: nothing is completed for good.
    expect(game.state.completedResearchTaskIds).toEqual([]);
  });

  it("earns twice as fast with two, each growing its own round", () => {
    const game = greenhouseBase().plan(greenhouse.id, secondGreenhouseSite);
    runUntilBuilt(game);
    const refilled = withWater(game, 400);
    const science = refilled.state.science;

    const events = refilled.campaign.advance(roundMinutes);

    expect(completed(events)).toHaveLength(2);
    expect(new Set(completed(events).map(structureIdOf)).size).toBe(2);
    expect(refilled.state.science).toBe(science + 2 * growing.science);
  });

  it("grows more slowly at a low Condition, using less water for it", () => {
    const game = withWater(greenhouseBase(), 300);
    const id = greenhousesOf(game.state)[0]?.id ?? "";
    const { thresholdPercent } = catalogue.structurePerformance;
    const half = scenarioOf(worn(game.campaign, id, thresholdPercent / 2, 0));
    const grown = greenhousesOf(half.state)[0]?.growingMinutes ?? 0;

    half.advance({ hours: 2 });

    expect(greenhousesOf(half.state)[0]?.growingMinutes).toBeCloseTo(
      grown + 60,
    );
  });

  it("goes on exactly as an uninterrupted run would when saved and loaded part-way through a round", () => {
    const game = withWater(greenhouseBase(), 300);
    game.advance({ hours: 7 });

    const loaded = loadCampaign(game.campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    const original = game.campaign.advance(roundMinutes);
    const reloaded = loaded.campaign.advance(roundMinutes);
    expect(completed(original)).toHaveLength(1);
    expect(reloaded).toEqual(original);
    expect(loaded.campaign.save()).toBe(game.campaign.save());
  });
});

describe("a Greenhouse short of water", () => {
  it("never takes it below the reserve, loses its round with a notification, and starts a new one by itself once there is a batch's worth above the reserve", () => {
    const game = greenhouseBase();
    const reserve = reserveKilograms("water");
    const short = withWater(game, reserve + 10 * waterPerHour);

    const events = short.campaign.advance(14 * 60);

    const losses = lost(events);
    expect(losses).toHaveLength(1);
    const [loss] = losses;
    if (loss === undefined) throw new Error("expected an event");
    expect(loss).toMatchObject({
      reason: "water",
      structureId: greenhousesOf(short.state)[0]?.id,
    });
    expect(formatEvent(loss)).toBe(
      "Greenhouse: its round of growing lost for want of water. It starts a new one by itself",
    );
    expect(water(short.state)).toBeCloseTo(reserve, 5);
    expect(short.state.ended).toBeUndefined();
    const [house] = greenhousesOf(short.state);
    expect(house?.growingMinutes).toBe(0);
    expect(house?.plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "reserve" },
    });

    // What it took for the round lost doesn't come back.
    const refilled = withWater(short, reserve + 5 * waterPerHour);
    refilled.advance({ hours: 2 });
    expect(greenhousesOf(refilled.state)[0]?.plant).toMatchObject({
      running: true,
    });
    expect(greenhousesOf(refilled.state)[0]?.growingMinutes).toBe(2 * 60);
  });

  it("stops first, so that the Mission Director drinks the reserve on their own and doesn't die of it", () => {
    const game = livedIn(greenhouseBase());
    const reserve = reserveKilograms("water");
    const short = withWater(game, reserve + 3 * waterPerHour);

    short.advance({ hours: 24 * 10 });

    expect(short.state.ended).toBeUndefined();
    const use =
      catalogue.lifeSupportStocks.find(({ id }) => id === "water")
        ?.usePerEarthDayKilograms ?? 0;
    // At most a batch and what they drink above it, then only what they drink.
    expect(water(short.state)).toBeGreaterThan(reserve - 10.5 * use);
    expect(greenhousesOf(short.state)[0]?.plant).toMatchObject({
      running: false,
    });
  });

  it("says nothing of a round only just begun, so that a base just short of water isn't told so every hour", () => {
    const game = withWater(greenhouseBase(), 300);
    const reserve = reserveKilograms("water");
    const short = withWater(game, reserve + waterPerHour);
    // The round has been growing a while: this first loss is told of.
    expect(lost(short.campaign.advance(3 * 60))).toHaveLength(1);

    const hourly: GameEvent[] = [];
    for (let hour = 0; hour < 5; hour++) {
      const again = withWater(short, reserve + waterPerHour);
      hourly.push(...lost(again.campaign.advance(3 * 60)));
    }
    expect(hourly).toEqual([]);
  });
});

describe("a Greenhouse short of power", () => {
  it("is cut off with no battery bank at Night, losing its round, and starts by itself at Daylight", () => {
    const game = scenario()
      .plan("solar-array", solarSite)
      .plan(greenhouse.id, greenhouseSite);
    runUntilBuilt(game);
    const wet = withWater(game, 390);
    wet.advance({ hours: 2 });
    expect(greenhousesOf(wet.state)[0]?.plant).toMatchObject({ running: true });

    runUntil(wet, "night");
    const events = wet.campaign.advance(5);

    // It had grown up to Night's falling, so this is no round only just begun.
    expect(lost(events)).toMatchObject([{ reason: "power" }]);
    const [house] = greenhousesOf(wet.state);
    expect(house).toMatchObject({ lit: false, growingMinutes: 0 });
    expect(house?.plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "no-power" },
    });

    const day = withWater(wet, 300);
    runUntil(day, "daylight");
    day.advance({ hours: 1 });
    expect(greenhousesOf(day.state)[0]?.plant).toMatchObject({ running: true });
  });

  it("gives up its lamps at Night to keep the battery banks' reserve for everything else, and says so by a notification", () => {
    const game = withWater(greenhouseBase(), 390);
    runUntil(game, "night");
    // A few hours of its lamps above what everything else needs through the
    // rest of the Night and the reserve after it.
    const solarDraw = 2 * structureType("solar-array").power.drawKilowatts;
    const bankDraw = structureType("large-battery-bank").power.drawKilowatts;
    const everythingElse =
      ((solarDraw + bankDraw) *
        (game.state.lunation.minutesRemaining +
          catalogue.nightReserveHours * 60)) /
      60;
    const short = withStored(
      game,
      everythingElse + 5 * greenhouse.power.nightDrawKilowatts,
    );

    const events = short.campaign.advance(10 * 60);

    expect(lost(events)).toMatchObject([{ reason: "power" }]);
    const [loss] = lost(events);
    if (loss === undefined) throw new Error("expected an event");
    expect(formatEvent(loss)).toBe(
      "Greenhouse: its round of growing lost for want of power. It starts a new one by itself",
    );
    expect(greenhousesOf(short.state)[0]).toMatchObject({
      lit: false,
      growingMinutes: 0,
    });
    // Nothing else went without.
    expect(
      short.state.structures
        .filter(({ structureTypeId }) => structureTypeId !== greenhouse.id)
        .every(({ powered }) => powered),
    ).toBe(true);
  });

  it("keeps what it has grown while Broken, for its repair, as a Plant's batch does", () => {
    const game = withWater(greenhouseBase(), 300);
    const id = greenhousesOf(game.state)[0]?.id ?? "";
    const grown = greenhousesOf(game.state)[0]?.growingMinutes ?? 0;
    const broken = scenarioOf(worn(game.campaign, id, 0, 0));

    const events = broken.campaign.advance(30);

    expect(lost(events)).toEqual([]);
    expect(greenhousesOf(broken.state)[0]?.growingMinutes).toBe(grown);
  });
});

describe("switching a Greenhouse off", () => {
  it("finishes its batch, then draws no power, takes no water, gives up its round with a notification, and starts a new one when switched on", () => {
    const game = withWater(greenhouseBase(), 300);
    game.advance({ hours: 10 });
    const id = greenhousesOf(game.state)[0]?.id ?? "";

    const off = game.campaign.switchPlant(id, "off");
    expect(off.ok).toBe(true);
    const events = game.campaign.advance(60);

    expect(lost(events)).toMatchObject([{ reason: "switched-off" }]);
    const [loss] = lost(events);
    if (loss === undefined) throw new Error("expected an event");
    expect(formatEvent(loss)).toBe(
      "Greenhouse: its round of growing given up, as it was switched off. It starts a new one by itself",
    );
    const held = water(game.state);
    game.advance({ hours: 2 });
    expect(water(game.state)).toBe(held);
    const [house] = greenhousesOf(game.state);
    expect(house).toMatchObject({ switchedOff: true, growingMinutes: 0 });
    const network = game.state.power.networks.find(({ structureIds }) =>
      structureIds.includes(id),
    );
    expect(network?.consumptionKilowatts).toBeCloseTo(
      2 * structureType("solar-array").power.drawKilowatts +
        structureType("large-battery-bank").power.drawKilowatts,
    );

    expect(game.campaign.switchPlant(id, "on").ok).toBe(true);
    game.advance({ hours: 1 });
    expect(greenhousesOf(game.state)[0]?.plant).toMatchObject({
      running: true,
    });
  });
});

describe("the water forecast with a Greenhouse", () => {
  const useKilogramsPerHour =
    (catalogue.lifeSupportStocks.find(({ id }) => id === "water")
      ?.usePerEarthDayKilograms ?? 0) / 24;

  function waterForecast(game: Scenario) {
    const forecast = game.campaign
      .forecasts()
      .lifeSupport.find(({ stockId }) => stockId === "water");
    if (forecast === undefined) throw new Error("expected a forecast");
    return forecast;
  }

  it("counts its use through the Night, down to the reserve, then what the Mission Director uses, with no Plant making water", () => {
    const game = livedIn(greenhouseBase());
    runUntil(game, "night");
    const reserve = reserveKilograms("water");
    const stocked = withWater(game, reserve + 50);
    stocked.advance({ minutes: 1 });

    const { minutesUntilEmpty, kilogramsPerEarthDay } = waterForecast(stocked);
    const held = water(stocked.state);
    const toReserve = (held - reserve) / (waterPerHour + useKilogramsPerHour);
    expect((minutesUntilEmpty ?? 0) / 60).toBeGreaterThan(
      toReserve + reserve / useKilogramsPerHour - 2,
    );
    expect((minutesUntilEmpty ?? 0) / 60).toBeLessThan(
      toReserve + reserve / useKilogramsPerHour + 2,
    );
    expect(kilogramsPerEarthDay).toBeCloseTo(
      -(waterPerHour + useKilogramsPerHour) * 24,
      5,
    );
  });

  it("gives its warnings, at Night with a Plant that has no ice, once the reserve runs down, in good time rather than at dawn", () => {
    const game = livedIn(
      greenhouseBase().plan("water-processing-plant", plantSite),
    );
    runUntilBuilt(game);
    runUntil(game, "night");
    // Plants hold it at the reserve at dusk, and the Mission Director drinks that.
    // It lasts to Daylight, so only knowing that the Plant has no ice brings the
    // first warning before it: at dawn it would leave them under five Earth Days,
    // when a Launch takes ten.
    const stocked = withWater(game, reserveKilograms("water"));
    const nightLeft = stocked.state.lunation.minutesRemaining;

    const events = stocked.campaign.advance(nightLeft - 60);

    expect(stocked.state.lunation.part).toBe("night");
    expect(
      events.filter(
        (event) =>
          event.kind === "life-support-warning" && event.stockId === "water",
      ),
    ).toHaveLength(1);
    expect(stocked.state.ended).toBeUndefined();
  });

  it("says nothing while the reserve is safe, though it is drinking through the Night with a Plant ready for the Daylight", () => {
    const game = livedIn(
      greenhouseBase().plan("water-processing-plant", plantSite),
    );
    runUntilBuilt(game);
    const iced = scenarioOf(
      changed(game.campaign, (saved) => {
        for (const stock of saved.bulkResources) {
          if (stock.resourceId === "water-ice") stock.kilograms = 2000;
        }
      }),
    );
    runUntil(iced, "night");
    // From a stock that takes it to the reserve well before Daylight.
    const stocked = withWater(iced, 150);

    const events = stocked.campaign.advance(
      stocked.state.lunation.minutesRemaining - 60,
    );

    expect(stocked.state.ended).toBeUndefined();
    expect(
      events.filter(
        (event) =>
          event.kind === "life-support-warning" && event.stockId === "water",
      ),
    ).toEqual([]);
  });

  it("says when it will reach the reserve, Night included, though the stock is rising now", () => {
    const game = livedIn(
      greenhouseBase()
        .plan("water-processing-plant", plantSite)
        .plan("water-processing-plant", secondPlantSite),
    );
    runUntilBuilt(game);
    const iced = scenarioOf(
      changed(game.campaign, (saved) => {
        for (const stock of saved.bulkResources) {
          if (stock.resourceId === "water-ice") stock.kilograms = 2000;
        }
      }),
    );
    runUntil(iced, "daylight");
    iced.advance({
      minutes: iced.state.lunation.minutesRemaining - 3 * 60,
    });
    const reserve = reserveKilograms("water");
    const stocked = withWater(iced, reserve + 60);
    stocked.advance({ minutes: 1 });

    const forecast = waterForecast(stocked);
    expect(forecast.kilogramsPerEarthDay).toBeGreaterThan(0);
    // Three hours' rise, then a Night it can't last at this rate.
    const hours = (forecast.minutesUntilReserve ?? Infinity) / 60;
    expect(hours).toBeGreaterThan(3);
    expect(hours).toBeLessThan(120);
  });
});

describe("what a Greenhouse asks of a base", () => {
  /** The Science a base earns over some Lunations, with plenty of ice. */
  function scienceOver(
    plants: readonly GroundPosition[],
    lunations: number,
  ): { science: number; lost: number } {
    const game = greenhouseBase();
    for (const site of plants) game.plan("water-processing-plant", site);
    runUntilBuilt(game);
    const home = livedIn(game);
    const iced = scenarioOf(
      changed(home.campaign, (saved) => {
        for (const stock of saved.bulkResources) {
          if (stock.resourceId === "water-ice") stock.kilograms = 20000;
        }
      }),
    );
    const science = iced.state.science;
    const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
    const events = iced.campaign.advance(
      lunations * (daylightEarthDays + nightEarthDays) * 24 * 60,
    );
    return { science: iced.state.science - science, lost: lost(events).length };
  }

  it("is more than one Water-processing plant can feed: the second makes it earn far more", () => {
    const one = scienceOver([plantSite], 4);
    const two = scienceOver([plantSite, secondPlantSite], 4);

    // The starting water carries one for a while; after that it starves.
    expect(two.science).toBeGreaterThan(one.science * 1.5);
    expect(two.lost).toBeLessThan(one.lost + 1);
  });

  it("takes about 900 kg of water ice a Lunation with the Mission Director, and that is several Expeditions or Cold-trap ice lines", () => {
    const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
    const lunationHours = (daylightEarthDays + nightEarthDays) * 24;
    const use =
      catalogue.lifeSupportStocks.find(({ id }) => id === "water")
        ?.usePerEarthDayKilograms ?? 0;
    const waterPerLunation =
      waterPerHour * lunationHours + use * (daylightEarthDays + nightEarthDays);
    const plant = structureType("water-processing-plant").recipes?.[0];
    const ice = plant?.inputs[0]?.kilogramsPerHour ?? 0;
    const made = (plant?.outputs[0] as { kilogramsPerHour: number })
      .kilogramsPerHour;
    const icePerLunation = (waterPerLunation * ice) / made;
    const plantPerDaylight = made * daylightEarthDays * 24;
    const lineIcePerDaylight =
      (
        structureType("cold-trap-ice-line").recipes?.[0]?.outputs[0] as {
          kilogramsPerHour: number;
        }
      ).kilogramsPerHour *
      daylightEarthDays *
      24;

    expect(waterPerLunation).toBeCloseTo(811, 0);
    expect(icePerLunation).toBeCloseTo(901, 0);
    expect(waterPerLunation).toBeGreaterThan(plantPerDaylight);
    expect(icePerLunation / catalogue.expeditions.kilograms).toBeGreaterThan(4);
    expect(icePerLunation / lineIcePerDaylight).toBeGreaterThan(4);
  });

  /** Two Greenhouses or one, and what is left of a full store at the end of a Night. */
  function throughANight(
    greenhouses: number,
    withTank: boolean,
  ): { lost: readonly GameEvent[]; game: Scenario } {
    const game = greenhouseBase();
    if (greenhouses > 1) game.plan(greenhouse.id, secondGreenhouseSite);
    if (withTank) game.plan("water-tank", tankSite);
    runUntilBuilt(game);
    const home = livedIn(game);
    // It is still the first Daylight: the starting water lasts to its end.
    expect(home.state.lunation.part).toBe("daylight");
    home.advance({ minutes: home.state.lunation.minutesRemaining - 60 });
    const limit =
      home.state.lifeSupport.find(({ stockId }) => stockId === "water")
        ?.limitKilograms ?? 0;
    const full = withStored(withWater(home, limit), 800);
    // All the way to the end of the Night, with no Plant to fill the store again.
    const events = full.campaign.advance(
      full.state.lunation.minutesRemaining +
        catalogue.lunation.nightEarthDays * 24 * 60 -
        1,
    );
    expect(full.state.ended).toBeUndefined();
    return { lost: lost(events), game: full };
  }

  it("can get through a Night on the base's own tanks, full at dusk", () => {
    const { lost: losses, game } = throughANight(1, false);
    expect(losses).toEqual([]);
    expect(greenhousesOf(game.state)[0]?.plant).toMatchObject({
      running: true,
    });
  });

  it("can't with a second on the base's own tanks, but can with a water tank", () => {
    const bare = throughANight(2, false);
    expect(bare.lost.length).toBeGreaterThan(0);
    expect(
      bare.lost.every(
        (event) =>
          event.kind === "greenhouse-round-lost" && event.reason === "water",
      ),
    ).toBe(true);

    const tanked = throughANight(2, true);
    expect(tanked.lost).toEqual([]);
    expect(
      greenhousesOf(tanked.game.state).every(
        ({ plant }) => plant?.running === true,
      ),
    ).toBe(true);
  });
});
