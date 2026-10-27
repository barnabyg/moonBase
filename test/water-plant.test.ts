import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue, type PlantRecipe } from "../src/catalogue";
import {
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { scenario } from "./scenario";
import { changed } from "./worn";

// Nothing wears down at random or in the cold, the Robot digs no Regolith,
// and the Mission Director comes to no harm in the Habitat from radiation.
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
      ["radiation", "solar-particle-events"],
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
    // The plant has started on the ice the moment it was unloaded.
    expect(ice(campaign.snapshot())).toBeGreaterThan(
      catalogue.expeditions.kilograms - icePerHour,
    );
    // Into the next Daylight, if it came back at Night.
    if (campaign.snapshot().lunation.part === "night") {
      campaign.advance(campaign.snapshot().lunation.minutesRemaining + 1);
    }
    campaign.advance(1);
    const before = campaign.snapshot();

    campaign.advance(60);

    const after = campaign.snapshot();
    expect(plantOf(after).plant).toEqual({
      running: true,
      stoppedFor: undefined,
    });
    expect(ice(after) - ice(before)).toBeCloseTo(-icePerHour, 6);
    expect(water(after) - water(before)).toBeCloseTo(waterPerHour, 6);
  });

  it("stops once the ice runs out, saying so", () => {
    const campaign = withIce(plantBase(), 0.5);

    campaign.advance(60);

    expect(ice(campaign.snapshot())).toBe(0);
    expect(plantOf(campaign.snapshot()).plant).toEqual({
      running: false,
      stoppedFor: {
        reason: "no-input",
        resource: { kind: "bulk-resource", resourceId: "water-ice" },
      },
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
      minutesUntilEmpty: expect.closeTo(
        (ice(campaign.snapshot()) / icePerHour) * 60,
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
});
