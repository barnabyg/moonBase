import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { describeStructure, powerRatings } from "../src/ui/describe";
import { formatEvent } from "../src/ui/notifications-text";
import { describeStructureEntry } from "../src/ui/structure-state";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { changed, worn } from "./worn";

// The tanks' Design is unlocked from the start, with a set of each tank's
// Components in the starting stock, and a second water tank's. Only a tank wears
// by Dust, so that a test can have a worn one go Broken within a game-minute it
// plays. The Habitat needs no power and keeps the Mission Director safe, and no
// Machine draws power for a heater, so that a network draws only what a test
// puts on it.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  const { withoutDigging } = await import("./without-digging");
  const { withoutDust } = await import("./without-dust");
  const { withoutCold } = await import("./without-cold");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { safeHabitat } = await import("./safe-habitat");
  const base = withDesigns(
    safeHabitat(
      withoutCold(
        withoutMicrometeorites(withoutDust(withoutDigging(actual.catalogue))),
      ),
      ["power", "radiation", "solar-particle-events"],
    ),
    ["bulk-supply-tanks"],
  );
  const waterTank = base.structureTypes.find(({ id }) => id === "water-tank");
  const oxygenTank = base.structureTypes.find(({ id }) => id === "oxygen-tank");
  // A tank that is nothing but data, to show that one needs no code of its own.
  const madeUpTank = oxygenTank && {
    ...oxygenTank,
    id: "made-up-tank",
    label: "Made-up tank",
    components: [],
    power: { ...oxygenTank.power, nightUpkeepKilowatts: 0.4 },
    storageTank: {
      resource: { kind: "life-support", stockId: "oxygen" } as const,
      kilograms: 50,
      shareLostPerEarthDayWithoutPower: 0.5,
    },
  };
  return {
    ...actual,
    catalogue: {
      ...base,
      structureTypes: [
        ...base.structureTypes.map((type) =>
          type.id === "water-tank" || type.id === "oxygen-tank"
            ? { ...type, dustWearPercentPerHour: 0.06 }
            : type,
        ),
        ...(madeUpTank === undefined ? [] : [madeUpTank]),
      ],
      startingStock: [...base.startingStock, ...(waterTank?.components ?? [])],
    },
  };
});

/** The figures the data catalogue is checked against. */
const WATER_LIMIT = 400;
const OXYGEN_LIMIT = 100;
const WATER_TANK_KILOGRAMS = 1000;
const OXYGEN_TANK_KILOGRAMS = 300;
const WATER_TANK_NIGHT_KILOWATTS = 0.05;
const OXYGEN_TANK_NIGHT_KILOWATTS = 0.15;
/** What an oxygen tank loses of what it holds, each Earth Day with no power at Night. */
const OXYGEN_TANK_LOSS_PER_EARTH_DAY = 0.1;
/** A fortnight of what the Mission Director drinks. */
const WATER_RESERVE = 49;

const solarSite: GroundPosition = { x: 20, y: 12 };
const batterySite: GroundPosition = { x: 30, y: 25 };
const waterTankSite: GroundPosition = { x: 34, y: 12 };
const oxygenTankSite: GroundPosition = { x: 44, y: 18 };
const secondWaterTankSite: GroundPosition = { x: 34, y: 2 };

function stock(state: Snapshot, stockId: string) {
  const found = state.lifeSupport.find((line) => line.stockId === stockId);
  if (found === undefined) throw new Error(`expected ${stockId}`);
  return found;
}

function typed(state: Snapshot, typeId: string): StructureSnapshot {
  const tank = state.structures.find(
    ({ structureTypeId }) => structureTypeId === typeId,
  );
  if (tank === undefined) throw new Error(`expected a ${typeId}`);
  return tank;
}

function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 5 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

/** Runs the game until the given part of the Lunation has just begun. */
function runUntil(game: Scenario, part: "daylight" | "night"): void {
  do {
    game.advance({ minutes: game.state.lunation.minutesRemaining });
  } while (game.state.lunation.part !== part);
}

/** Tanks on a network with a solar array and a battery bank. */
function tankFarm(): Scenario {
  const game = scenario()
    .plan("solar-array", solarSite)
    .plan("battery-bank", batterySite)
    .plan("water-tank", waterTankSite)
    .plan("oxygen-tank", oxygenTankSite);
  runUntilBuilt(game);
  return game;
}

/** A tank alone with a solar array, so with no power at Night. */
function unpoweredAtNight(typeId: string, site: GroundPosition): Scenario {
  const game = scenario().plan("solar-array", solarSite);
  runUntilBuilt(game);
  game.plan(typeId, site);
  runUntilBuilt(game);
  return game;
}

/** The Campaign with its stocks at the amounts given and no spare Components, so that nothing is repaired. */
function stocked(
  campaign: Campaign,
  kilograms: Readonly<Record<string, number>>,
): Campaign {
  return changed(campaign, (state) => {
    for (const line of state.lifeSupport) {
      line.kilograms = kilograms[line.stockId] ?? line.kilograms;
    }
    for (const line of state.stockpile.components) {
      if (line.componentId === catalogue.maintenance.spareComponentId) {
        line.count = 0;
      }
    }
  });
}

/** Plays a game-minute at a time until the tank has gone, by any means, with what came of it. */
function until(
  game: Scenario,
  gone: (state: Snapshot) => boolean,
): { events: GameEvent[]; before: Snapshot } {
  const events: GameEvent[] = [];
  let before = game.state;
  for (let minutes = 0; minutes < 3 * 24 * 60; minutes++) {
    if (gone(game.state)) return { events, before };
    before = game.state;
    events.push(...game.campaign.advance(1));
  }
  throw new Error("It never happened.");
}

/** The game with a tank worn so low that the next few game-minutes break it. */
function nearlyBroken(game: Scenario, typeId: string): Scenario {
  return scenarioOf(worn(game.campaign, typed(game.state, typeId).id, 0.002));
}

function untilBroken(game: Scenario, typeId: string) {
  return until(game, (state) => typed(state, typeId).conditionPercent <= 0);
}

function untilTakenApart(game: Scenario, typeId: string) {
  return until(
    game,
    (state) =>
      !state.structures.some(
        ({ structureTypeId }) => structureTypeId === typeId,
      ),
  );
}

describe("a commissioned storage tank", () => {
  it("raises its stock's limit by what the data catalogue says, and only once it is commissioned", () => {
    const game = scenario().plan("solar-array", solarSite);
    runUntilBuilt(game);
    expect(stock(game.state, "water").limitKilograms).toBe(WATER_LIMIT);

    game.plan("water-tank", waterTankSite);
    game.advance({ minutes: 5 });
    expect(stock(game.state, "water").limitKilograms).toBe(WATER_LIMIT);
    runUntilBuilt(game);

    expect(stock(game.state, "water").limitKilograms).toBe(
      WATER_LIMIT + WATER_TANK_KILOGRAMS,
    );
    expect(stock(game.state, "oxygen").limitKilograms).toBe(OXYGEN_LIMIT);

    game.plan("oxygen-tank", oxygenTankSite);
    game.plan("water-tank", secondWaterTankSite);
    runUntilBuilt(game);
    expect(stock(game.state, "water").limitKilograms).toBe(
      WATER_LIMIT + 2 * WATER_TANK_KILOGRAMS,
    );
    expect(stock(game.state, "oxygen").limitKilograms).toBe(
      OXYGEN_LIMIT + OXYGEN_TANK_KILOGRAMS,
    );
  });

  it("is shipped empty, so that building one adds nothing to the stock", () => {
    const start = stock(scenario().state, "water").kilograms;

    expect(stock(tankFarm().state, "water").kilograms).toBe(start);
  });

  it("holds its share of the stock, as a battery bank holds its share of the energy", () => {
    const game = scenarioOf(
      stocked(tankFarm().campaign, { water: 700, oxygen: 200 }),
    );

    expect(typed(game.state, "water-tank").tank).toMatchObject({
      resource: { kind: "life-support", stockId: "water" },
      capacityKilograms: WATER_TANK_KILOGRAMS,
      heldKilograms: 500,
    });
    expect(typed(game.state, "oxygen-tank").tank).toMatchObject({
      resource: { kind: "life-support", stockId: "oxygen" },
      capacityKilograms: OXYGEN_TANK_KILOGRAMS,
      heldKilograms: 150,
    });
    expect(typed(game.state, "solar-array").tank).toBeUndefined();
  });

  it("makes room on a Launch manifest for what the base's own tanks wouldn't hold", () => {
    const game = scenario().plan("solar-array", solarSite);
    runUntilBuilt(game);
    const set = game.campaign.setLaunchManifest([
      { itemId: "water", count: 8 },
    ]);
    if (!set.ok) throw new Error(set.message);
    expect(game.state.launchManifest.overLimits).toHaveLength(1);

    game.plan("water-tank", waterTankSite);
    runUntilBuilt(game);

    expect(game.state.launchManifest.overLimits).toHaveLength(0);
  });
});

describe("a storage tank at Night", () => {
  it("draws nothing in Daylight, and at Night what the data catalogue says, on top of the rest of the network", () => {
    const game = tankFarm();
    expect(game.state.lunation.part).toBe("daylight");
    game.advance({ minutes: 1 });
    const rest = game.state.power.networks[0]?.consumptionKilowatts ?? 0;

    runUntil(game, "night");
    game.advance({ minutes: 1 });

    expect(game.state.power.networks[0]?.consumptionKilowatts).toBeCloseTo(
      rest + WATER_TANK_NIGHT_KILOWATTS + OXYGEN_TANK_NIGHT_KILOWATTS,
      6,
    );
    expect(typed(game.state, "water-tank").powered).toBe(true);
    expect(typed(game.state, "water-tank").tank?.losing).toBe(false);
  });

  it("counts in the power forecast, which sees the battery bank run out sooner", () => {
    const atNightOnALittle = (game: Scenario) => {
      runUntil(game, "night");
      return scenarioOf(
        changed(game.campaign, (state) => {
          for (const structure of state.structures) {
            structure.storedKilowattHours =
              structure.storedKilowattHours > 0 ? 20 : 0;
          }
        }),
      );
    };
    const without = scenario()
      .plan("solar-array", solarSite)
      .plan("battery-bank", batterySite);
    runUntilBuilt(without);
    const empties = (game: Scenario) =>
      game.campaign.forecasts().power.minutesUntilEmpty ?? Infinity;

    expect(empties(atNightOnALittle(tankFarm()))).toBeLessThan(
      empties(atNightOnALittle(without)),
    );
  });

  it("isn't a Night load: it keeps drawing with the battery banks down to their reserve, where a light would switch off", () => {
    const low = scenarioOf(
      changed(tankFarm().campaign, (state) => {
        for (const structure of state.structures) {
          structure.storedKilowattHours =
            structure.storedKilowattHours > 0 ? 1 : 0;
        }
      }),
    );
    runUntil(low, "night");
    low.advance({ minutes: 1 });

    expect(typed(low.state, "water-tank").powered).toBe(true);
    expect(typed(low.state, "water-tank").savingPower).toBe(false);
  });

  it("says in the Base panel what it holds and draws, in Daylight and at Night", () => {
    const game = scenarioOf(
      stocked(tankFarm().campaign, { oxygen: 200, water: 700 }),
    );
    const note = (state: Snapshot) =>
      describeStructureEntry(state, typed(state, "oxygen-tank"), false).note;

    expect(note(game.state)).toContain("holds 150 of 300 kg of oxygen");
    expect(note(game.state)).toContain("draws 0.15 kW at Night");

    runUntil(game, "night");
    game.advance({ minutes: 1 });

    expect(note(game.state)).toContain("drawing 0.15 kW");
  });

  it("with no power at Night loses its share at the data catalogue's rate, says so once, and stops as Daylight comes, the limit unchanged", () => {
    const game = scenarioOf(
      stocked(unpoweredAtNight("oxygen-tank", oxygenTankSite).campaign, {
        oxygen: 200,
      }),
    );
    runUntil(game, "night");
    const events: GameEvent[] = [];

    for (let minutes = 0; minutes < 24 * 60; minutes++) {
      events.push(...game.campaign.advance(1));
    }

    // The tank holds three quarters of the stock, the base's own tanks the rest.
    expect(stock(game.state, "oxygen").kilograms).toBeCloseTo(
      200 * Math.exp(-OXYGEN_TANK_LOSS_PER_EARTH_DAY * 0.75),
      1,
    );
    expect(stock(game.state, "oxygen").limitKilograms).toBe(
      OXYGEN_LIMIT + OXYGEN_TANK_KILOGRAMS,
    );
    expect(typed(game.state, "oxygen-tank").tank?.losing).toBe(true);
    const warned = events.filter(
      (event) => event.kind === "storage-tank-without-power",
    );
    expect(warned).toHaveLength(1);
    expect(warned[0] && formatEvent(warned[0])).toBe(
      "Oxygen tank has no power, and loses what it holds until it has or Daylight comes",
    );
    expect(
      describeStructureEntry(
        game.state,
        typed(game.state, "oxygen-tank"),
        false,
      ).note,
    ).toContain("no power: losing oxygen");

    runUntil(game, "daylight");
    game.advance({ minutes: 1 });
    const inDaylight = stock(game.state, "oxygen").kilograms;
    game.advance({ hours: 1 });

    expect(stock(game.state, "oxygen").kilograms).toBeCloseTo(inDaylight, 6);
    expect(typed(game.state, "oxygen-tank").tank?.losing).toBe(false);
  });

  it("with no power never takes a stock below the Mission Director's reserve", () => {
    const game = scenarioOf(
      stocked(unpoweredAtNight("water-tank", waterTankSite).campaign, {
        water: WATER_RESERVE + 0.1,
      }),
    );
    runUntil(game, "night");
    game.advance({ earthDays: 3 });

    // The Mission Director is aboard the Lander, and drinks none of it.
    expect(stock(game.state, "water").kilograms).toBeCloseTo(WATER_RESERVE, 6);
  });
});

describe("a Broken storage tank", () => {
  it("loses its share of the stock at once, with a notification, and the limit falls until it is repaired, with nothing given back", () => {
    const game = nearlyBroken(
      scenarioOf(stocked(tankFarm().campaign, { oxygen: 200, water: 700 })),
      "oxygen-tank",
    );

    const { events, before } = untilBroken(game, "oxygen-tank");

    // Its 300 kg of the 400 kg, as a Broken battery bank loses its stored energy.
    expect(stock(before, "oxygen").kilograms).toBeCloseTo(200, 6);
    expect(stock(game.state, "oxygen").kilograms).toBeCloseTo(50, 6);
    expect(stock(game.state, "oxygen").limitKilograms).toBe(OXYGEN_LIMIT);
    expect(stock(game.state, "water").kilograms).toBeCloseTo(700, 6);
    const lost = events.find((event) => event.kind === "storage-tank-lost");
    expect(lost).toMatchObject({
      structureTypeId: "oxygen-tank",
      resource: { kind: "life-support", stockId: "oxygen" },
      cause: "broken",
    });
    expect(lost && formatEvent(lost)).toBe(
      "Oxygen tank is Broken, and the 150 kg of oxygen it held was lost",
    );
    expect(typed(game.state, "oxygen-tank").tank?.heldKilograms).toBe(0);
    game.advance({ minutes: 1 });
    expect(typed(game.state, "oxygen-tank").powered).toBe(false);

    const repaired = scenarioOf(
      worn(game.campaign, typed(game.state, "oxygen-tank").id, 100),
    );
    repaired.advance({ minutes: 1 });
    expect(stock(repaired.state, "oxygen").limitKilograms).toBe(
      OXYGEN_LIMIT + OXYGEN_TANK_KILOGRAMS,
    );
    expect(stock(repaired.state, "oxygen").kilograms).toBeCloseTo(50, 6);
  });

  it("never takes a stock below the Mission Director's reserve", () => {
    const game = nearlyBroken(
      scenarioOf(stocked(tankFarm().campaign, { water: 60 })),
      "water-tank",
    );

    untilBroken(game, "water-tank");

    expect(stock(game.state, "water").kilograms).toBeCloseTo(WATER_RESERVE, 6);
  });

  it("works fully until then, as its Condition takes nothing off the limit", () => {
    const game = tankFarm();
    const low = scenarioOf(
      worn(game.campaign, typed(game.state, "water-tank").id, 5),
    );

    expect(typed(low.state, "water-tank").performance).toBe(1);
    expect(stock(low.state, "water").limitKilograms).toBe(
      WATER_LIMIT + WATER_TANK_KILOGRAMS,
    );
  });
});

describe("a dismantled storage tank", () => {
  /** The base with its oxygen tank, not worn, to be dismantled. */
  function dismantling(oxygen: number): Scenario {
    const game = scenarioOf(stocked(tankFarm().campaign, { oxygen }));
    const planned = game.campaign.dismantleStructure(
      typed(game.state, "oxygen-tank").id,
    );
    if (!planned.ok) throw new Error(planned.message);
    return game;
  }

  it("still counts until the Robot starts, then only what no longer fits is lost, with a notification", () => {
    const game = dismantling(250);
    expect(stock(game.state, "oxygen").limitKilograms).toBe(
      OXYGEN_LIMIT + OXYGEN_TANK_KILOGRAMS,
    );

    const { events } = untilTakenApart(game, "oxygen-tank");

    expect(stock(game.state, "oxygen").limitKilograms).toBe(OXYGEN_LIMIT);
    expect(stock(game.state, "oxygen").kilograms).toBeCloseTo(OXYGEN_LIMIT, 6);
    const lost = events.find((event) => event.kind === "storage-tank-lost");
    expect(lost).toMatchObject({ cause: "dismantled" });
    expect(lost && formatEvent(lost)).toBe(
      "Oxygen tank is being taken apart, and the 150 kg of oxygen with no room left was lost",
    );
  });

  it("loses nothing if what is left of the base's tanks holds it all", () => {
    const game = dismantling(80);

    const { events } = untilTakenApart(game, "oxygen-tank");

    expect(stock(game.state, "oxygen").kilograms).toBeCloseTo(80, 6);
    expect(events.some((event) => event.kind === "storage-tank-lost")).toBe(
      false,
    );
  });
});

describe("a tank that is another entry in the data catalogue", () => {
  it("raises the limit and draws at Night with no code of its own", () => {
    const game = scenario()
      .plan("solar-array", solarSite)
      .plan("battery-bank", batterySite)
      .plan("made-up-tank", waterTankSite);
    runUntilBuilt(game);

    expect(stock(game.state, "oxygen").limitKilograms).toBe(OXYGEN_LIMIT + 50);
    expect(typed(game.state, "made-up-tank").tank).toMatchObject({
      capacityKilograms: 50,
    });
    game.advance({ minutes: 1 });
    const rest = game.state.power.networks[0]?.consumptionKilowatts ?? 0;
    runUntil(game, "night");
    game.advance({ minutes: 1 });

    expect(game.state.power.networks[0]?.consumptionKilowatts).toBeCloseTo(
      rest + 0.4,
      6,
    );
  });
});

describe("a storage tank's words", () => {
  const typeOf = (id: string) => {
    const type = catalogue.structureTypes.find(
      (candidate) => candidate.id === id,
    );
    if (type === undefined) throw new Error(`expected a ${id}`);
    return type;
  };

  it("says what it adds, what it draws and when, and what becomes of what it holds", () => {
    const words = describeStructure(typeOf("oxygen-tank"));

    expect(words).toContain(
      `adds ${OXYGEN_TANK_KILOGRAMS} kg to what the base can hold of oxygen`,
    );
    expect(words).toContain(
      `draws ${OXYGEN_TANK_NIGHT_KILOWATTS} kW all through the Night, and nothing in Daylight`,
    );
    expect(words).toContain("Broken");
    expect(words).toContain("With no power at Night");
  });

  it("gives its draw among its power ratings", () => {
    expect(powerRatings(typeOf("water-tank"), undefined)).toEqual([
      `draws ${WATER_TANK_NIGHT_KILOWATTS} kW all through the Night, and nothing in Daylight`,
    ]);
  });
});
