import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue, type PlantRecipe } from "../src/catalogue";
import {
  type Campaign,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import {
  formatBulkResources,
  formatPlant,
  formatPlantRates,
} from "../src/ui/format";
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

/** A Plant's recipe: the one given, or its default. */
function recipeOf(structureTypeId: string, recipeId?: string): PlantRecipe {
  const recipes = catalogue.structureTypes.find(
    (type) => type.id === structureTypeId,
  )?.recipes;
  const recipe =
    recipeId === undefined
      ? recipes?.[0]
      : recipes?.find((candidate) => candidate.id === recipeId);
  if (recipe === undefined) throw new Error(`expected ${structureTypeId}`);
  return recipe;
}

const recipe = recipeOf("vacuum-fabrication-plant");
const siliconPerHour = recipe.inputs[0]?.kilogramsPerHour ?? Number.NaN;
const wafersPerHour = recipe.outputs[0]?.kilogramsPerHour ?? Number.NaN;
const arraySite: GroundPosition = { x: 20, y: 12 };
const plantSite: GroundPosition = { x: 30, y: 22 };
const secondArraySite: GroundPosition = { x: 18, y: 26 };
const extractionSite: GroundPosition = { x: 32, y: 36 };

function bulk(state: Snapshot, resourceId: string): number {
  return (
    state.bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? Number.NaN
  );
}

function plantOf(
  state: Snapshot,
  structureTypeId = "vacuum-fabrication-plant",
): StructureSnapshot {
  const plant = state.structures.find(
    (structure) => structure.structureTypeId === structureTypeId,
  );
  if (plant === undefined) throw new Error(`expected ${structureTypeId}`);
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

/** A solar array, and a vacuum fabrication plant cabled to it. */
function plantBase(): Campaign {
  return base([
    ["solar-array", arraySite],
    ["vacuum-fabrication-plant", plantSite],
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

describe("the vacuum fabrication plant", () => {
  it("turns silicon into wafers at the recipe's rates while it has power", () => {
    const campaign = withBulk(plantBase(), { silicon: 50 });
    campaign.advance(1);
    const before = campaign.snapshot();
    expect(before.lunation.part).toBe("daylight");

    campaign.advance(60);

    const after = campaign.snapshot();
    expect(plantOf(after)).toMatchObject({
      powered: true,
      plant: { running: true, stoppedFor: undefined },
    });
    expect(bulk(after, "silicon") - bulk(before, "silicon")).toBeCloseTo(
      -siliconPerHour,
      6,
    );
    expect(bulk(after, "wafers") - bulk(before, "wafers")).toBeCloseTo(
      wafersPerHour,
      6,
    );
  });

  it("shows the wafers in the status panel after the silicon, in kilograms", () => {
    const campaign = withBulk(plantBase(), { silicon: 50, wafers: 12.5 });

    expect(
      formatBulkResources(
        campaign.snapshot().bulkResources,
        campaign.forecasts().bulkResources,
      )
        .map(({ label, value }) => `${label}: ${value}`)
        .join("; "),
    ).toContain("Silicon: 50 kg; Wafers: 12 kg");
  });

  it("shows how fast the wafers rise and the silicon falls, and what the plant makes and uses", () => {
    const campaign = withBulk(plantBase(), { silicon: 50, wafers: 12.5 });
    campaign.advance(1);
    const state = campaign.snapshot();
    expect(state.lunation.part).toBe("daylight");

    const shown = formatBulkResources(
      state.bulkResources,
      campaign.forecasts().bulkResources,
    );

    const note = (label: string) =>
      shown.find((resource) => resource.label === label)?.note;
    expect(note("Wafers")).toBe(`+${(wafersPerHour * 24).toFixed(1)} kg/day`);
    expect(note("Silicon")).toMatch(
      new RegExp(`^−${(siliconPerHour * 24).toFixed(1)} kg/day, ~`),
    );
    expect(formatPlantRates(plantOf(state))).toBe(
      `making ${wafersPerHour} kg of wafers an hour from ${siliconPerHour} kg of silicon`,
    );
  });

  it("stops once the silicon runs out, and the status panel says so", () => {
    const campaign = withBulk(plantBase(), { silicon: siliconPerHour / 4 });

    campaign.advance(60);

    const state = campaign.snapshot();
    expect(bulk(state, "silicon")).toBe(0);
    expect(bulk(state, "wafers")).toBeCloseTo(wafersPerHour / 4, 6);
    const { plant } = plantOf(state);
    expect(plant).toEqual({
      running: false,
      stoppedFor: {
        reason: "no-input",
        resource: { kind: "bulk-resource", resourceId: "silicon" },
      },
    });
    expect(plant === undefined ? "" : formatPlant(plant)).toBe(
      "stopped: out of Silicon",
    );
  });
});

describe("an extraction plant running for metals and silicon, and a vacuum fabrication plant", () => {
  const extraction = recipeOf("extraction-plant", "metals-and-silicon");
  const siliconMadePerHour =
    extraction.outputs.find(
      (flow) =>
        flow.resource.kind === "bulk-resource" &&
        flow.resource.resourceId === "silicon",
    )?.kilogramsPerHour ?? Number.NaN;

  it("turn Regolith into wafers together, on two solar arrays", () => {
    const campaign = withBulk(
      base([
        ["solar-array", arraySite],
        ["extraction-plant", extractionSite],
        ["vacuum-fabrication-plant", plantSite],
        ["solar-array", secondArraySite],
      ]),
      { regolith: 500, silicon: 0, wafers: 0 },
    );
    const result = campaign.setPlantRecipe(
      plantOf(campaign.snapshot(), "extraction-plant").id,
      "metals-and-silicon",
    );
    expect(result).toEqual({ ok: true });
    const before = campaign.snapshot();
    expect(before.lunation.part).toBe("daylight");

    campaign.advance(6 * 60);

    const after = campaign.snapshot();
    for (const structureTypeId of [
      "extraction-plant",
      "vacuum-fabrication-plant",
    ]) {
      expect(plantOf(after, structureTypeId).plant).toEqual({
        running: true,
        stoppedFor: undefined,
      });
    }
    expect(bulk(after, "regolith")).toBeLessThan(bulk(before, "regolith"));
    // The vacuum fabrication plant keeps up with the silicon the extraction
    // plant makes, from soon after it starts.
    expect(bulk(after, "wafers")).toBeGreaterThan(5 * wafersPerHour);
    expect(bulk(after, "silicon")).toBeLessThan(siliconMadePerHour);
  });
});
