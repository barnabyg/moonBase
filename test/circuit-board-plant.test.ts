import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue, type PlantRecipe } from "../src/catalogue";
import {
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import {
  formatBulkResources,
  formatEvent,
  formatPlant,
} from "../src/ui/format";
import { scenario } from "./scenario";
import { changed } from "./worn";

// Nothing wears down at random or in the cold, the Robot digs no Regolith,
// and the Mission Director comes to no harm in the Habitat, which draws no
// power, through the Lander's round trip.
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
      ["power", "radiation", "solar-particle-events"],
    ),
  };
});

function recipeOf(structureTypeId: string): PlantRecipe {
  const recipe = catalogue.structureTypes.find(
    (type) => type.id === structureTypeId,
  )?.recipes?.[0];
  if (recipe === undefined) throw new Error(`expected ${structureTypeId}`);
  return recipe;
}

const recipe = recipeOf("circuit-board-plant");

/** How many kilograms of a bulk resource the recipe takes in or puts out an hour. */
function rateOf(flows: PlantRecipe["inputs"], resourceId: string): number {
  return (
    flows.find(
      (flow) =>
        flow.resource.kind === "bulk-resource" &&
        flow.resource.resourceId === resourceId,
    )?.kilogramsPerHour ?? Number.NaN
  );
}

const wafersPerHour = rateOf(recipe.inputs, "wafers");
const metalsPerHour = rateOf(recipe.inputs, "metals");
const boardsPerHour = rateOf(recipe.outputs, "circuit-boards");
const boardPrice =
  catalogue.exports.find((sold) => sold.resourceId === "circuit-boards")
    ?.priceMillionDollarsPerKilogram ?? Number.NaN;
const arraySite: GroundPosition = { x: 20, y: 12 };
const plantSite: GroundPosition = { x: 30, y: 22 };
const habitatSite: GroundPosition = { x: 25, y: -20 };

function bulk(state: Snapshot, resourceId: string): number {
  return (
    state.bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? Number.NaN
  );
}

function plantOf(state: Snapshot): StructureSnapshot {
  const plant = state.structures.find(
    (structure) => structure.structureTypeId === "circuit-board-plant",
  );
  if (plant === undefined) throw new Error("expected circuit-board-plant");
  return plant;
}

/**
 * The Structures given, built in the first Daylight from Components
 * brought for each as a Launch would.
 */
function base(plans: readonly [string, GroundPosition][]): Campaign {
  const campaign = changed(scenario().campaign, (state) => {
    for (const [structureTypeId] of plans) {
      const type = catalogue.structureTypes.find(
        (candidate) => candidate.id === structureTypeId,
      );
      for (const need of type?.components ?? []) {
        const stock = state.stockpile.components.find(
          (candidate) => candidate.componentId === need.componentId,
        );
        if (stock !== undefined) stock.count += need.count;
      }
    }
  });
  for (const [structureTypeId, position] of plans) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 10 * 24) throw new Error("The Constructions never finished.");
    campaign.advance(60);
  }
  return campaign;
}

/** A solar array, and a circuit board plant cabled to it. */
function plantBase(): Campaign {
  return base([
    ["solar-array", arraySite],
    ["circuit-board-plant", plantSite],
  ]);
}

/** The Campaign as saved, with the bulk resources set as given. */
function withBulk(
  campaign: Campaign,
  kilograms: Readonly<Record<string, number>>,
): Campaign {
  return changed(campaign, (state) => {
    for (const stock of state.bulkResources) {
      stock.kilograms = kilograms[stock.resourceId] ?? stock.kilograms;
    }
  });
}

/** Skips from event to event until one of the kind happens, returning every event on the way. */
function skipUntil(campaign: Campaign, kind: GameEvent["kind"]): GameEvent[] {
  const events: GameEvent[] = [];
  for (let skips = 0; !events.some((event) => event.kind === kind); skips++) {
    if (skips > 100) throw new Error(`No ${kind} event came.`);
    events.push(...campaign.advanceToNextEvent());
  }
  return events;
}

describe("the circuit board plant", () => {
  it("turns wafers and metals into circuit boards at the recipe's rates while it has power", () => {
    const campaign = withBulk(plantBase(), { wafers: 20, metals: 20 });
    campaign.advance(1);
    const before = campaign.snapshot();
    expect(before.lunation.part).toBe("daylight");

    campaign.advance(60);

    const after = campaign.snapshot();
    expect(plantOf(after)).toMatchObject({
      powered: true,
      plant: { running: true, stoppedFor: undefined },
    });
    expect(bulk(after, "wafers") - bulk(before, "wafers")).toBeCloseTo(
      -wafersPerHour,
      6,
    );
    expect(bulk(after, "metals") - bulk(before, "metals")).toBeCloseTo(
      -metalsPerHour,
      6,
    );
    expect(
      bulk(after, "circuit-boards") - bulk(before, "circuit-boards"),
    ).toBeCloseTo(boardsPerHour, 6);
  });

  it("shows the circuit boards in the status panel after the wafers, in kilograms", () => {
    const campaign = withBulk(plantBase(), {
      wafers: 12.5,
      "circuit-boards": 7.8,
    });

    expect(
      formatBulkResources(
        campaign.snapshot().bulkResources,
        campaign.forecasts().bulkResources,
      )
        .map(({ label, value }) => `${label}: ${value}`)
        .join("; "),
    ).toContain("Wafers: 12 kg; Circuit boards: 7 kg");
  });

  it.each([
    ["wafers", "Wafers", { wafers: wafersPerHour / 4, metals: 20 }],
    ["metals", "Metals", { wafers: 20, metals: metalsPerHour / 4 }],
  ] as const)(
    "stops once the %s run out, and the status panel names them",
    (resourceId, label, stock) => {
      const campaign = withBulk(plantBase(), stock);

      campaign.advance(60);

      const state = campaign.snapshot();
      expect(bulk(state, resourceId)).toBe(0);
      expect(bulk(state, "circuit-boards")).toBeCloseTo(boardsPerHour / 4, 6);
      const { plant } = plantOf(state);
      expect(plant).toEqual({
        running: false,
        stoppedFor: {
          reason: "no-input",
          resource: { kind: "bulk-resource", resourceId },
        },
      });
      expect(plant === undefined ? "" : formatPlant(plant)).toBe(
        `stopped: out of ${label}`,
      );
    },
  );

  it("doesn't start without one of its inputs, naming the one it is out of", () => {
    const campaign = withBulk(plantBase(), { wafers: 20, metals: 0 });

    campaign.advance(60);

    const state = campaign.snapshot();
    expect(bulk(state, "wafers")).toBe(20);
    expect(bulk(state, "circuit-boards")).toBe(0);
    const { plant } = plantOf(state);
    expect(plant === undefined ? "" : formatPlant(plant)).toBe(
      "stopped: out of Metals",
    );
  });
});

describe("circuit boards as an Export", () => {
  it("are loaded onto the Lander as it takes off, and sold at their price as it reaches Earth", () => {
    const built = withBulk(
      base([
        ["habitat", habitatSite],
        ["solar-array", arraySite],
        ["circuit-board-plant", plantSite],
      ]),
      { wafers: 20, metals: 20 },
    );
    const habitat = built
      .snapshot()
      .structures.find((structure) => structure.structureTypeId === "habitat");
    const movedIn = built.moveMissionDirectorIn(habitat?.id ?? "");
    if (!movedIn.ok) throw new Error(movedIn.message);
    built.advance(10 * 60);
    expect(bulk(built.snapshot(), "circuit-boards")).toBeGreaterThan(3);
    const funding = built.snapshot().fundingMillionDollars;

    expect(
      built.loadExports([{ resourceId: "circuit-boards", kilograms: 3 }]),
    ).toEqual({ ok: true });
    expect(built.snapshot().exports).toMatchObject({
      massKilograms: 3,
      valueMillionDollars: 3 * boardPrice,
    });
    expect(built.sendLander()).toEqual({ ok: true });
    const events = skipUntil(built, "lander-reached-earth");

    const boards = [{ resourceId: "circuit-boards", kilograms: 3 }];
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "lander-took-off", exports: boards }),
    );
    const reached = events.find(
      (event) => event.kind === "lander-reached-earth",
    );
    expect(reached).toMatchObject({
      sold: boards,
      earnedMillionDollars: 3 * boardPrice,
    });
    expect(reached === undefined ? "" : formatEvent(reached)).toBe(
      `Lander reached Earth for turnaround, and sold 3 kg of circuit boards for $${3 * boardPrice}M`,
    );
    expect(built.snapshot().fundingMillionDollars).toBe(
      funding + 3 * boardPrice,
    );
  });
});
