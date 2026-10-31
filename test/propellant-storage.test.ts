import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue } from "../src/catalogue";
import {
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { describeStructure } from "../src/ui/describe";
import { formatEvent } from "../src/ui/notifications-text";
import { formatBulkResources } from "../src/ui/status-panel-text";
import { describeStructureEntry, formatPlant } from "../src/ui/structure-state";
import { scenario, scenarioOf, type Scenario } from "./scenario";
import { changed, worn } from "./worn";

// Both Plants' Designs are unlocked from the start, with Components for two of
// each Plant and two tanks in the starting stock, and three more solar arrays, so
// that the Plants have power to spare. The Habitat needs no power and keeps the
// Mission Director safe. Only a tank wears by Dust, so that a test can have a worn
// one go Broken within a game-minute it plays, and no Machine draws power for a
// heater.
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
    ["propellant-production", "large-propellant-production"],
  );
  const componentsOf = (id: string) =>
    base.structureTypes.find((type) => type.id === id)?.components ?? [];
  return {
    ...actual,
    catalogue: {
      ...base,
      structureTypes: base.structureTypes.map((type) =>
        type.id === "propellant-tank"
          ? { ...type, dustWearPercentPerHour: 0.06 }
          : type,
      ),
      startingStock: [
        ...base.startingStock,
        ...componentsOf("propellant-plant"),
        ...componentsOf("propellant-plant"),
        ...componentsOf("large-propellant-plant"),
        ...componentsOf("propellant-tank"),
        ...componentsOf("propellant-tank"),
        ...componentsOf("solar-array"),
        ...componentsOf("solar-array"),
        ...componentsOf("solar-array"),
      ],
    },
  };
});

/** The figures the data catalogue is checked against. */
const PLANT_HOLDS = 450;
const TANK_HOLDS = 600;

/** What a propellant tank draws at Night, and loses of its share an Earth Day with no power then. */
const TANK_NIGHT_KILOWATTS = 0.2;
const TANK_LOSS_PER_EARTH_DAY = 0.1;

const solarSite: GroundPosition = { x: 20, y: 12 };
const secondSolarSite: GroundPosition = { x: 20, y: 0 };
const thirdSolarSite: GroundPosition = { x: 20, y: -12 };
const batterySite: GroundPosition = { x: 30, y: 36 };
const habitatSite: GroundPosition = { x: 25, y: -28 };
const plantSite: GroundPosition = { x: 34, y: 12 };

const largePlantSite: GroundPosition = { x: 58, y: 12 };
const tankSite: GroundPosition = { x: 34, y: 24 };

function stockOf(state: Snapshot, resourceId = "propellant"): number {
  const line = state.bulkResources.find(
    (candidate) => candidate.resourceId === resourceId,
  );
  if (line === undefined) throw new Error(`expected ${resourceId}`);
  return line.kilograms;
}

function limitOf(state: Snapshot, resourceId: string): number | undefined {
  return state.bulkResources.find((line) => line.resourceId === resourceId)
    ?.limitKilograms;
}

function typed(state: Snapshot, typeId: string): StructureSnapshot {
  const found = state.structures.find(
    ({ structureTypeId }) => structureTypeId === typeId,
  );
  if (found === undefined) throw new Error(`expected a ${typeId}`);
  return found;
}

function runUntilBuilt(game: Scenario): void {
  for (let hours = 0; game.state.constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    game.advance({ hours: 1 });
  }
}

describe("the propellant limit", () => {
  it("is none at all to start with, and rises by what the data catalogue says for each Plant only once it is commissioned", () => {
    const game = scenario().plan("solar-array", solarSite);
    runUntilBuilt(game);
    expect(limitOf(game.state, "propellant")).toBe(0);

    game.plan("propellant-plant", plantSite);
    game.advance({ minutes: 5 });
    expect(limitOf(game.state, "propellant")).toBe(0);
    runUntilBuilt(game);
    expect(limitOf(game.state, "propellant")).toBe(PLANT_HOLDS);

    game.plan("large-propellant-plant", largePlantSite);
    runUntilBuilt(game);
    expect(limitOf(game.state, "propellant")).toBe(2 * PLANT_HOLDS);
  });

  it("rises by what the data catalogue says for a commissioned tank", () => {
    const game = scenario()
      .plan("solar-array", solarSite)
      .plan("propellant-plant", plantSite);
    runUntilBuilt(game);
    game.plan("propellant-tank", tankSite);
    game.advance({ minutes: 5 });
    expect(limitOf(game.state, "propellant")).toBe(PLANT_HOLDS);
    runUntilBuilt(game);

    expect(limitOf(game.state, "propellant")).toBe(PLANT_HOLDS + TANK_HOLDS);
    expect(typed(game.state, "propellant-tank").tank).toMatchObject({
      resource: { kind: "bulk-resource", resourceId: "propellant" },
      capacityKilograms: TANK_HOLDS,
    });
  });

  it("leaves every other bulk resource with no limit, water ice among them", () => {
    const { state } = scenario();
    for (const line of state.bulkResources) {
      if (line.resourceId !== "propellant") {
        expect(line.limitKilograms).toBeUndefined();
      }
    }
  });
});

/**
 * The Campaign with this much propellant, plenty of Regolith and no spare
 * Components, so that nothing is repaired, as though a save had it so.
 */
function stocked(campaign: Campaign, propellant: number): Campaign {
  return changed(campaign, (state) => {
    for (const line of state.bulkResources) {
      if (line.resourceId === "propellant") line.kilograms = propellant;
      if (line.resourceId === "regolith") line.kilograms = 2000;
    }
    for (const line of state.stockpile.components) {
      if (line.componentId === catalogue.maintenance.spareComponentId) {
        line.count = 0;
      }
    }
  });
}

/** A Propellant plant with power to spare, and whatever else is asked for. */
function plantBase(...more: readonly [string, GroundPosition][]): Scenario {
  const game = scenario()
    .plan("solar-array", solarSite)
    .plan("solar-array", secondSolarSite)
    .plan("solar-array", thirdSolarSite)
    .plan("propellant-plant", plantSite);
  for (const [typeId, site] of more) game.plan(typeId, site);
  runUntilBuilt(game);
  return game;
}

function forecastOf(game: Scenario) {
  return game.campaign
    .forecasts()
    .bulkResources.find(({ resourceId }) => resourceId === "propellant");
}

function rowOf(game: Scenario) {
  return formatBulkResources(
    game.state.bulkResources,
    game.campaign.forecasts().bulkResources,
  ).find(({ label }) => label === "Propellant");
}

function plantNote(state: Snapshot, typeId = "propellant-plant") {
  const { plant } = typed(state, typeId);
  if (plant === undefined) throw new Error("expected a Plant");
  return formatPlant(plant);
}

function tankNote(state: Snapshot) {
  return describeStructureEntry(state, typed(state, "propellant-tank"), false)
    .note;
}

/** Runs the game until the given part of the Lunation has just begun. */
function runUntil(game: Scenario, part: "daylight" | "night"): void {
  do {
    game.advance({ minutes: game.state.lunation.minutesRemaining });
  } while (game.state.lunation.part !== part);
}

/** Plays a game-minute at a time until the thing has happened, with what came of it. */
function until(
  game: Scenario,
  done: (state: Snapshot) => boolean,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (let minutes = 0; minutes < 3 * 24 * 60; minutes++) {
    if (done(game.state)) return events;
    events.push(...game.campaign.advance(1));
  }
  throw new Error("It never happened.");
}

function nearlyBroken(game: Scenario, typeId: string): Scenario {
  return scenarioOf(worn(game.campaign, typed(game.state, typeId).id, 0.002));
}

function broken(game: Scenario, typeId: string): Scenario {
  return scenarioOf(worn(game.campaign, typed(game.state, typeId).id, 0));
}

describe("a Propellant plant with its store full", () => {
  it("stops at the limit, and the Base panel says why, using no power or Regolith", () => {
    const game = scenarioOf(stocked(plantBase().campaign, PLANT_HOLDS - 2));

    game.advance({ hours: 4 });

    expect(stockOf(game.state)).toBe(PLANT_HOLDS);
    expect(typed(game.state, "propellant-plant").plant?.stoppedFor).toEqual({
      reason: "output-full",
      resource: { kind: "bulk-resource", resourceId: "propellant" },
      kilograms: PLANT_HOLDS,
      limitKilograms: PLANT_HOLDS,
    });
    expect(plantNote(game.state)).toContain(
      "waiting for tank space: Propellant is 450.0 of 450 kg",
    );
    const regolith = stockOf(game.state, "regolith");
    game.advance({ hours: 4 });
    expect(stockOf(game.state, "regolith")).toBe(regolith);
    expect(typed(game.state, "propellant-plant").powered).toBe(false);
  });

  it("starts again by itself as soon as a batch fits", () => {
    const full = scenarioOf(stocked(plantBase().campaign, PLANT_HOLDS));
    full.advance({ minutes: 5 });
    expect(typed(full.state, "propellant-plant").powered).toBe(false);

    const game = scenarioOf(stocked(full.campaign, PLANT_HOLDS - 10));
    game.advance({ hours: 3 });

    expect(typed(game.state, "propellant-plant").powered).toBe(true);
    expect(stockOf(game.state)).toBeGreaterThan(PLANT_HOLDS - 10);
  });

  it("makes nothing that discards the excess: every recipe that makes propellant makes nothing else, so that a Plant waits", () => {
    const recipes = catalogue.structureTypes.flatMap(
      ({ recipes: ofType }) => ofType ?? [],
    );
    const making = recipes.filter(({ outputs }) =>
      outputs.some(
        (output) =>
          "resource" in output &&
          output.resource.kind === "bulk-resource" &&
          output.resource.resourceId === "propellant",
      ),
    );
    expect(making).toHaveLength(2);
    for (const { outputs } of making) expect(outputs).toHaveLength(1);
  });

  it("isn't over a limit a Launch could fill: a Launch item brings Components, life support or Robots, and none is propellant", () => {
    expect(catalogue.launch.items.map(({ id }) => id)).not.toContain(
      "propellant",
    );
    expect(
      catalogue.launch.items.flatMap(({ brings }) =>
        brings.kind === "life-support" ? [brings.stockId] : [],
      ),
    ).toEqual(["oxygen", "water"]);
  });
});

describe("a stock over the limit, as from an older save", () => {
  it("stays, is burned and sold as before, and the Plant waits until it has fallen", () => {
    const game = plantBase(["habitat", habitatSite]);
    const moved = game.campaign.moveMissionDirectorIn(
      typed(game.state, "habitat").id,
    );
    if (!moved.ok) throw new Error(moved.message);
    const over = scenarioOf(stocked(game.campaign, 1000));
    over.advance({ hours: 3 });

    expect(stockOf(over.state)).toBe(1000);
    expect(rowOf(over)).toMatchObject({
      value: "1000.0 of 450 kg",
      note: "holding full, over the limit",
    });
    expect(over.state.exports.returnMassKilograms).toBe(400);

    // 100 kg sold takes none to burn: still over, so the Plant goes on waiting.
    const first = over.campaign.loadExports([
      { resourceId: "propellant", kilograms: 100 },
    ]);
    if (!first.ok) throw new Error(first.message);
    const sent = over.campaign.sendLander();
    if (!sent.ok) throw new Error(sent.message);
    over.advance({ minutes: 2 });
    expect(stockOf(over.state)).toBe(900);
    expect(typed(over.state, "propellant-plant").powered).toBe(false);
    for (let skips = 0; over.state.lander.state !== "landed-free"; skips++) {
      if (skips > 100) throw new Error("The Lander never came back.");
      over.campaign.advanceToNextEvent();
    }

    // 300 kg sold takes 400 kg to burn, which leaves room at last.
    const second = over.campaign.loadExports([
      { resourceId: "propellant", kilograms: 300 },
    ]);
    if (!second.ok) throw new Error(second.message);
    const again = over.campaign.sendLander();
    if (!again.ok) throw new Error(again.message);
    over.advance({ minutes: 2 });
    expect(stockOf(over.state)).toBe(200);
    expect(
      typed(over.state, "propellant-plant").plant?.stoppedFor?.reason,
    ).not.toBe("output-full");
  });
});

describe("the forecasts of a full store", () => {
  it("say it is rising only while there is room, then that it is holding full", () => {
    const game = scenarioOf(stocked(plantBase().campaign, 100));
    game.advance({ hours: 2 });
    expect(forecastOf(game)).toMatchObject({
      holdingFull: false,
      kilogramsPerHour: 1,
    });
    expect(rowOf(game)?.note).toBe("+24.0 kg/day");

    const full = scenarioOf(stocked(game.campaign, PLANT_HOLDS));
    full.advance({ minutes: 5 });

    expect(forecastOf(full)).toEqual({
      resourceId: "propellant",
      kilogramsPerHour: 0,
      minutesUntilEmpty: undefined,
      holdingFull: true,
    });
    expect(rowOf(full)).toMatchObject({
      value: "450.0 of 450 kg",
      note: "holding full",
      warning: false,
    });
  });

  it("say so of a Plant finishing its last batch, with no room for another", () => {
    const game = scenarioOf(stocked(plantBase().campaign, PLANT_HOLDS - 1));
    until(game, (state) => typed(state, "propellant-plant").powered);

    expect(forecastOf(game)?.holdingFull).toBe(true);
    expect(forecastOf(game)?.kilogramsPerHour).toBe(0);
  });

  it("don't hold it full for a Plant switched off, and leave a bulk resource with no limit as it was", () => {
    const game = scenarioOf(stocked(plantBase().campaign, PLANT_HOLDS));
    const off = game.campaign.switchPlant(
      typed(game.state, "propellant-plant").id,
      "off",
    );
    if (!off.ok) throw new Error(off.message);
    game.advance({ minutes: 5 });

    expect(forecastOf(game)?.holdingFull).toBe(false);
    expect(rowOf(game)?.note).toBeUndefined();
    expect(
      formatBulkResources(
        game.state.bulkResources,
        game.campaign.forecasts().bulkResources,
      ).find(({ label }) => label === "Regolith")?.value,
    ).toBe("2000 kg");
  });
});

describe("a propellant tank at Night", () => {
  it("holds its share, with what it holds and draws in the Base panel", () => {
    const game = scenarioOf(
      stocked(plantBase(["propellant-tank", tankSite]).campaign, 525),
    );

    expect(typed(game.state, "propellant-tank").tank?.heldKilograms).toBe(300);
    expect(tankNote(game.state)).toContain(
      "holds 300 of 600 kg of propellant, draws 0.2 kW at Night",
    );
  });

  it("draws what the data catalogue says, on top of the rest of the network", () => {
    const game = plantBase(
      ["propellant-tank", tankSite],
      ["battery-bank", batterySite],
    );
    const off = game.campaign.switchPlant(
      typed(game.state, "propellant-plant").id,
      "off",
    );
    if (!off.ok) throw new Error(off.message);
    game.advance({ minutes: 1 });
    const rest = game.state.power.networks[0]?.consumptionKilowatts ?? 0;

    runUntil(game, "night");
    game.advance({ minutes: 1 });

    expect(game.state.power.networks[0]?.consumptionKilowatts).toBeCloseTo(
      rest + TANK_NIGHT_KILOWATTS,
      6,
    );
    expect(typed(game.state, "propellant-tank").tank?.losing).toBe(false);
    expect(tankNote(game.state)).toContain("drawing 0.2 kW");
  });

  it("with no power loses its share at the data catalogue's rate, says so, and has no reserve to stop at", () => {
    const game = scenarioOf(
      stocked(
        (() => {
          const built = scenario().plan("solar-array", solarSite);
          runUntilBuilt(built);
          built.plan("propellant-tank", tankSite);
          runUntilBuilt(built);
          return built;
        })().campaign,
        100,
      ),
    );
    runUntil(game, "night");
    const events: GameEvent[] = [];

    for (let minutes = 0; minutes < 24 * 60; minutes++) {
      events.push(...game.campaign.advance(1));
    }

    // With no Plant, the tank holds it all.
    expect(stockOf(game.state)).toBeCloseTo(
      100 * Math.exp(-TANK_LOSS_PER_EARTH_DAY),
      1,
    );
    expect(limitOf(game.state, "propellant")).toBe(TANK_HOLDS);
    const warned = events.filter(
      (event) => event.kind === "storage-tank-without-power",
    );
    expect(warned[0] && formatEvent(warned[0])).toBe(
      "Propellant tank has no power, and loses what it holds until it has or Daylight comes",
    );
    expect(tankNote(game.state)).toContain("no power: losing propellant");

    runUntil(game, "daylight");
    game.advance({ minutes: 1 });
    const inDaylight = stockOf(game.state);
    expect(inDaylight).toBeCloseTo(
      100 * Math.exp(-TANK_LOSS_PER_EARTH_DAY * 9.5),
      0,
    );
    game.advance({ hours: 1 });
    expect(stockOf(game.state)).toBeCloseTo(inDaylight, 6);
  });
});

describe("a Broken propellant tank", () => {
  it("loses its share at once, a real loss, with a notification, and a repair brings back only the limit", () => {
    const game = nearlyBroken(
      scenarioOf(
        stocked(plantBase(["propellant-tank", tankSite]).campaign, 700),
      ),
      "propellant-tank",
    );
    const off = game.campaign.switchPlant(
      typed(game.state, "propellant-plant").id,
      "off",
    );
    if (!off.ok) throw new Error(off.message);

    const events = until(
      game,
      (state) => typed(state, "propellant-tank").conditionPercent <= 0,
    );

    // Its 600 kg of the 1,050 kg the base can hold is four sevenths of the 700 kg.
    expect(stockOf(game.state)).toBeCloseTo(300, 6);
    expect(limitOf(game.state, "propellant")).toBe(PLANT_HOLDS);
    const lost = events.find((event) => event.kind === "storage-tank-lost");
    expect(lost).toMatchObject({
      structureTypeId: "propellant-tank",
      resource: { kind: "bulk-resource", resourceId: "propellant" },
      cause: "broken",
    });
    expect(lost && formatEvent(lost)).toBe(
      "Propellant tank is Broken, and the 400 kg of propellant it held was lost",
    );
    const left = stockOf(game.state);

    const repaired = scenarioOf(
      worn(game.campaign, typed(game.state, "propellant-tank").id, 100),
    );
    expect(limitOf(repaired.state, "propellant")).toBe(
      PLANT_HOLDS + TANK_HOLDS,
    );
    expect(stockOf(repaired.state)).toBeCloseTo(left, 6);
  });

  it("can lose the whole stock, as nothing keeps a reserve of propellant", () => {
    const built = scenario().plan("solar-array", solarSite);
    runUntilBuilt(built);
    built.plan("propellant-tank", tankSite);
    runUntilBuilt(built);
    const game = nearlyBroken(
      scenarioOf(stocked(built.campaign, 200)),
      "propellant-tank",
    );

    until(
      game,
      (state) => typed(state, "propellant-tank").conditionPercent <= 0,
    );

    expect(stockOf(game.state)).toBe(0);
  });

  it("loses no more than it can hold, when a Broken Plant has left the stock over the limit", () => {
    const game = nearlyBroken(
      broken(
        scenarioOf(
          stocked(plantBase(["propellant-tank", tankSite]).campaign, 900),
        ),
        "propellant-plant",
      ),
      "propellant-tank",
    );
    expect(typed(game.state, "propellant-tank").tank?.heldKilograms).toBe(
      TANK_HOLDS,
    );

    until(
      game,
      (state) => typed(state, "propellant-tank").conditionPercent <= 0,
    );

    expect(stockOf(game.state)).toBeCloseTo(900 - TANK_HOLDS, 6);
  });
});

describe("a dismantled propellant tank", () => {
  it("loses only what no longer fits, with a notification", () => {
    const game = scenarioOf(
      stocked(plantBase(["propellant-tank", tankSite]).campaign, 700),
    );
    const planned = game.campaign.dismantleStructure(
      typed(game.state, "propellant-tank").id,
    );
    if (!planned.ok) throw new Error(planned.message);
    const off = game.campaign.switchPlant(
      typed(game.state, "propellant-plant").id,
      "off",
    );
    if (!off.ok) throw new Error(off.message);

    const events = until(
      game,
      (state) =>
        !state.structures.some(
          ({ structureTypeId }) => structureTypeId === "propellant-tank",
        ),
    );

    expect(limitOf(game.state, "propellant")).toBe(PLANT_HOLDS);
    expect(stockOf(game.state)).toBeCloseTo(PLANT_HOLDS, 6);
    expect(
      events.find((event) => event.kind === "storage-tank-lost"),
    ).toMatchObject({ cause: "dismantled", kilograms: 250 });
  });
});

describe("a Propellant plant no longer there to hold it", () => {
  it("Broken, no longer counts towards the limit, with nothing lost, and a repair brings the limit back", () => {
    const game = broken(
      scenarioOf(stocked(plantBase().campaign, 300)),
      "propellant-plant",
    );
    const events = game.campaign.advance(60);

    expect(limitOf(game.state, "propellant")).toBe(0);
    expect(stockOf(game.state)).toBe(300);
    expect(events.some(({ kind }) => kind === "storage-tank-lost")).toBe(false);
    // No limit worth saying, and no Plant to hold it full.
    expect(rowOf(game)).toMatchObject({ value: "300 kg" });
    expect(forecastOf(game)?.holdingFull).toBe(false);

    const repaired = scenarioOf(
      worn(game.campaign, typed(game.state, "propellant-plant").id, 100),
    );
    expect(limitOf(repaired.state, "propellant")).toBe(PLANT_HOLDS);
    expect(stockOf(repaired.state)).toBe(300);
  });

  it("Broken, leaves another Plant waiting until the stock fits what is left", () => {
    const game = broken(
      scenarioOf(
        stocked(
          plantBase(["large-propellant-plant", largePlantSite]).campaign,
          700,
        ),
      ),
      "propellant-plant",
    );
    game.advance({ hours: 2 });

    expect(limitOf(game.state, "propellant")).toBe(PLANT_HOLDS);
    expect(stockOf(game.state)).toBe(700);
    expect(plantNote(game.state, "large-propellant-plant")).toContain(
      "waiting for tank space: Propellant is 700.0 of 450 kg",
    );
  });

  it("dismantled, leaves a limit of none and all the stock, still there to burn or sell", () => {
    const game = scenarioOf(stocked(plantBase().campaign, 300));
    const planned = game.campaign.dismantleStructure(
      typed(game.state, "propellant-plant").id,
    );
    if (!planned.ok) throw new Error(planned.message);

    const events = until(
      game,
      (state) =>
        !state.structures.some(
          ({ structureTypeId }) => structureTypeId === "propellant-plant",
        ),
    );

    expect(limitOf(game.state, "propellant")).toBe(0);
    expect(stockOf(game.state)).toBeGreaterThanOrEqual(300);
    expect(events.some(({ kind }) => kind === "storage-tank-lost")).toBe(false);
    expect(game.state.exports.returnMassKilograms).toBeGreaterThanOrEqual(250);
  });

  it("leaves a tank on its own holding what it can", () => {
    const game = broken(
      scenarioOf(
        stocked(plantBase(["propellant-tank", tankSite]).campaign, 300),
      ),
      "propellant-plant",
    );
    game.advance({ minutes: 1 });

    expect(limitOf(game.state, "propellant")).toBe(TANK_HOLDS);
    expect(typed(game.state, "propellant-tank").tank?.heldKilograms).toBe(300);
  });
});

describe("the words for propellant storage", () => {
  const typeOf = (id: string) => {
    const type = catalogue.structureTypes.find(
      (candidate) => candidate.id === id,
    );
    if (type === undefined) throw new Error(`expected a ${id}`);
    return type;
  };

  it("say what a Plant holds, that it waits for tank space, and what comes of it Broken", () => {
    for (const id of ["propellant-plant", "large-propellant-plant"]) {
      const words = describeStructure(typeOf(id));
      expect(words).toContain(`It holds ${PLANT_HOLDS} kg of propellant`);
      expect(words).toContain("it waits for tank space");
      expect(words).toContain("Broken");
    }
  });

  it("say what a tank adds and draws, with no reserve of propellant to promise", () => {
    const words = describeStructure(typeOf("propellant-tank"));
    expect(words).toContain(
      `adds ${TANK_HOLDS} kg to what the base can hold of propellant`,
    );
    expect(words).toContain(
      `draws ${TANK_NIGHT_KILOWATTS} kW all through the Night`,
    );
    expect(words).toContain("Broken");
    expect(words).not.toContain("reserve");
  });
});
