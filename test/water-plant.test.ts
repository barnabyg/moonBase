import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue, type PlantRecipe } from "../src/catalogue";
import {
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { formatLifeSupport } from "../src/ui/format";
import { scenario } from "./scenario";
import { changed } from "./worn";

// Nothing wears down at random or in the cold, the Robot digs no Regolith,
// and the Mission Director comes to no harm in the Habitat from radiation,
// or from its power failing at Night with no battery bank.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDigging } = await import("./without-digging");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { withoutCold } = await import("./without-cold");
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: safeHabitat(
      withoutCold(withoutMicrometeorites(withoutDigging(actual.catalogue))),
      ["radiation", "solar-particle-events", "power"],
    ),
  };
});

const plantType = catalogue.structureTypes.find(
  (type) => type.id === "water-processing-plant",
);
// The default recipe, which a newly commissioned Plant runs.
const recipe: PlantRecipe | undefined = plantType?.recipes?.[0];
if (plantType === undefined || recipe === undefined) {
  throw new Error("expected a water-processing plant");
}
const icePerHour = recipe.inputs[0]?.kilogramsPerHour ?? Number.NaN;
const waterPerHour = recipe.outputs[0]?.kilogramsPerHour ?? Number.NaN;
const arraySite: GroundPosition = { x: 20, y: 12 };
const plantSite: GroundPosition = { x: 30, y: 22 };
const habitatSite: GroundPosition = { x: 30, y: -30 };

function ice(state: Snapshot): number {
  return (
    state.bulkResources.find((stock) => stock.resourceId === "water-ice")
      ?.kilograms ?? Number.NaN
  );
}

function water(state: Snapshot): number {
  return (
    state.lifeSupport.find((stock) => stock.stockId === "water")?.kilograms ??
    Number.NaN
  );
}

function plantOf(state: Snapshot): StructureSnapshot {
  const plant = state.structures.find(
    (structure) => structure.structureTypeId === "water-processing-plant",
  );
  if (plant === undefined) throw new Error("expected a water-processing plant");
  return plant;
}

/**
 * A solar array, a water-processing plant and any other Structures given,
 * built in the first Daylight from Components brought as a Launch would.
 */
function plantBase(others: readonly [string, GroundPosition][] = []): Campaign {
  const campaign = changed(scenario().campaign, (state) => {
    for (const need of plantType?.components ?? []) {
      const stock = state.stockpile.components.find(
        (candidate) => candidate.componentId === need.componentId,
      );
      if (stock !== undefined) stock.count += need.count;
    }
  });
  for (const [structureTypeId, position] of [
    ["solar-array", arraySite],
    ["water-processing-plant", plantSite],
    ...others,
  ] as const) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    campaign.advance(60);
  }
  return campaign;
}

/** The Campaign as saved, with the given water ice in the base's stock. */
function withIce(campaign: Campaign, kilograms: number): Campaign {
  return changed(campaign, (state) => {
    for (const stock of state.bulkResources) {
      if (stock.resourceId === "water-ice") stock.kilograms = kilograms;
    }
  });
}

describe("the water-processing plant", () => {
  it("turns the water ice an Expedition brings back into water", () => {
    const campaign = plantBase();
    const started = campaign.startExpedition();
    if (!started.ok) throw new Error(started.message);
    const events: GameEvent[] = [];
    while (campaign.snapshot().expedition !== undefined) {
      events.push(...campaign.advance(60));
    }
    expect(events.map((event) => event.kind)).toContain("expedition-returned");
    // The plant has taken a batch's ice at most since it was unloaded.
    expect(ice(campaign.snapshot())).toBeGreaterThanOrEqual(
      catalogue.expeditions.kilograms - icePerHour - 1e-9,
    );
    // Into the next Daylight, if it came back at Night.
    if (campaign.snapshot().lunation.part === "night") {
      campaign.advance(campaign.snapshot().lunation.minutesRemaining + 1);
    }
    campaign.advance(1);
    const before = campaign.snapshot();

    campaign.advance(60);

    const after = campaign.snapshot();
    expect(plantOf(after).plant).toMatchObject({
      running: true,
      stoppedFor: undefined,
    });
    expect(ice(after) - ice(before)).toBeCloseTo(-icePerHour, 6);
    expect(water(after) - water(before)).toBeCloseTo(waterPerHour, 6);
  });

  it("waits with less than a batch's ice, taking none, saying so", () => {
    const campaign = withIce(plantBase(), 0.5);

    campaign.advance(60);

    expect(ice(campaign.snapshot())).toBe(0.5);
    expect(plantOf(campaign.snapshot()).plant).toEqual({
      running: false,
      stoppedFor: {
        reason: "no-input",
        resource: { kind: "bulk-resource", resourceId: "water-ice" },
        kilograms: 0.5,
        kilogramsNeeded: icePerHour,
      },
      batch: undefined,
    });
  });

  it("says roughly how long the ice will keep it running at the current rate", () => {
    const campaign = withIce(plantBase(), 50);
    campaign.advance(2);

    expect(
      campaign
        .forecasts()
        .bulkResources.find((stock) => stock.resourceId === "water-ice"),
    ).toEqual({
      resourceId: "water-ice",
      kilogramsPerHour: expect.closeTo(-icePerHour, 6) as number,
      // As if the batch started 2 game-minutes ago used its ice evenly.
      minutesUntilEmpty: expect.closeTo(
        (50 / icePerHour) * 60 - 2,
        -1,
      ) as number,
    });
  });
});

describe("the water forecast", () => {
  it("shows the stock rising while the plant makes more than the Mission Director uses, with no warnings", () => {
    const base = plantBase([["habitat", habitatSite]]);
    const habitat = base
      .snapshot()
      .structures.find((structure) => structure.structureTypeId === "habitat");
    const movedIn = base.moveMissionDirectorIn(habitat?.id ?? "");
    if (!movedIn.ok) throw new Error(movedIn.message);
    // Little enough water that, without the plant, warnings would come.
    const campaign = changed(withIce(base, 500), (state) => {
      for (const stock of state.lifeSupport) {
        if (stock.stockId === "water") stock.kilograms = 10;
      }
    });
    campaign.advance(1);

    const forecast = campaign
      .forecasts()
      .lifeSupport.find((stock) => stock.stockId === "water");
    expect(forecast?.minutesUntilEmpty).toBeUndefined();
    expect(forecast?.kilogramsPerEarthDay).toBeCloseTo(
      waterPerHour * 24 -
        (catalogue.lifeSupportStocks.find((stock) => stock.id === "water")
          ?.usePerEarthDayKilograms ?? 0),
      6,
    );

    const events = campaign.advance(6 * 60);
    expect(
      events.filter((event) => event.kind === "life-support-warning"),
    ).toEqual([]);
    expect(water(campaign.snapshot())).toBeGreaterThan(10);
  });

  /**
   * A water-processing plant running with plenty of ice, the Mission
   * Director moved in, and a day of Daylight left, with the water given in
   * stock.
   */
  function dayBeforeNight(waterKilograms: number): Campaign {
    const base = plantBase([["habitat", habitatSite]]);
    const habitat = base
      .snapshot()
      .structures.find((structure) => structure.structureTypeId === "habitat");
    const movedIn = base.moveMissionDirectorIn(habitat?.id ?? "");
    if (!movedIn.ok) throw new Error(movedIn.message);
    base.advance(base.snapshot().lunation.minutesRemaining - 24 * 60);
    const campaign = changed(withIce(base, 500), (state) => {
      for (const stock of state.lifeSupport) {
        if (stock.stockId === "water") stock.kilograms = waterKilograms;
      }
    });
    campaign.advance(1);
    expect(campaign.snapshot().lunation.part).toBe("daylight");
    return campaign;
  }

  const use =
    catalogue.lifeSupportStocks.find((stock) => stock.id === "water")
      ?.usePerEarthDayKilograms ?? Number.NaN;
  const nightMinutes = catalogue.lunation.nightEarthDays * 24 * 60;
  const nightUse = (use * nightMinutes) / (24 * 60);

  it("looks ahead to the Night, when the plant stands idle, and warns before nightfall if the water won't last it", () => {
    // Rising now, but well short of the Night's use at nightfall.
    const campaign = dayBeforeNight(5);
    const state = campaign.snapshot();
    const toNight = state.lunation.minutesRemaining;
    // With what the batch started a game-minute ago has made so far.
    const atNightfall =
      water(state) +
      waterPerHour / 60 +
      ((waterPerHour - use / 24) * toNight) / 60;
    expect(atNightfall).toBeLessThan(nightUse);

    const forecast = campaign
      .forecasts()
      .lifeSupport.find((stock) => stock.stockId === "water");

    expect(forecast?.kilogramsPerEarthDay).toBeGreaterThan(0);
    // The status panel says so, though the water is rising now.
    const stock = state.lifeSupport.find(({ stockId }) => stockId === "water");
    if (stock === undefined || forecast === undefined) {
      throw new Error("expected water");
    }
    expect(
      formatLifeSupport(stock, forecast, state.missionDirector).note,
    ).toMatch(
      /^rising .* kg a day, but lasts only .*: Plants stand idle at Night$/,
    );
    expect(forecast.minutesUntilEmpty).toBeCloseTo(
      toNight + (atNightfall / use) * 24 * 60,
      -1,
    );
    const events = campaign.advance(toNight - 1);
    expect(campaign.snapshot().lunation.part).toBe("daylight");
    expect(
      events.filter(
        (event) =>
          event.kind === "life-support-warning" && event.stockId === "water",
      ),
    ).not.toEqual([]);
  });

  it("gives no warning while the water at nightfall will last the Night", () => {
    const campaign = dayBeforeNight(nightUse + 5);

    const forecast = campaign
      .forecasts()
      .lifeSupport.find((stock) => stock.stockId === "water");

    expect(forecast?.minutesUntilEmpty).toBeUndefined();
    // Through the Night ahead and into the next Daylight.
    const events = [
      ...campaign.advance(campaign.snapshot().lunation.minutesRemaining),
      ...campaign.advance(nightMinutes + 60),
    ];
    expect(
      events.filter((event) => event.kind === "life-support-warning"),
    ).toEqual([]);
    expect(campaign.snapshot().ended).toBeUndefined();
  });
});
