import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type Catalogue,
  type PlantRecipe,
  type ResourceRef,
} from "../src/catalogue";
import {
  type Campaign,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { scenario } from "./scenario";
import { changed } from "./worn";

// Water electrolysis, Molten regolith electrolysis and Integrated
// fabrication are unlocked from the start, with a kit for each of their
// Plants in the starting stock. Nothing wears down, the Robot digs no
// Regolith, and no Machine feels the cold, so that each Plant runs at just
// the rates its recipes set.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withDesigns } = await import("./with-designs");
  const { withoutDust } = await import("./without-dust");
  const { withoutDigging } = await import("./without-digging");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { withoutCold } = await import("./without-cold");
  return {
    ...actual,
    catalogue: withDesigns(
      withoutCold(
        withoutMicrometeorites(withoutDigging(withoutDust(actual.catalogue))),
      ),
      [
        "water-electrolysis",
        "molten-regolith-electrolysis",
        "integrated-fabrication",
      ],
    ),
  };
});

const arraySite: GroundPosition = { x: 20, y: 12 };
const plantSite: GroundPosition = { x: 30, y: 24 };

/** Each new Plant with each of its recipes. */
const cases = [
  "electrolysis-plant",
  "large-extraction-plant",
  "integrated-fabrication-plant",
].flatMap((typeId) => {
  const type = catalogue.structureTypes.find(
    (candidate) => candidate.id === typeId,
  );
  if (type?.recipes === undefined) throw new Error(`expected a ${typeId}`);
  return type.recipes.map(
    (recipe, index) =>
      [type.label, recipe.label, typeId, recipe, index] as const,
  );
});

function amountOf(state: Snapshot, resource: ResourceRef): number {
  return resource.kind === "bulk-resource"
    ? (state.bulkResources.find(
        (stock) => stock.resourceId === resource.resourceId,
      )?.kilograms ?? Number.NaN)
    : (state.lifeSupport.find((stock) => stock.stockId === resource.stockId)
        ?.kilograms ?? Number.NaN);
}

function plantOf(state: Snapshot, typeId: string): StructureSnapshot {
  const plant = state.structures.find(
    (structure) => structure.structureTypeId === typeId,
  );
  if (plant === undefined) throw new Error(`expected a ${typeId}`);
  return plant;
}

/**
 * A solar array and the Plant, built in the first Daylight from the kit in
 * the starting stock, running the given recipe, with 100 kg of each of its
 * inputs in stock.
 */
function plantBase(typeId: string, recipe: PlantRecipe): Campaign {
  const { campaign } = scenario()
    .plan("solar-array", arraySite)
    .plan(typeId, plantSite);
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 5 * 24) throw new Error("The Constructions never finished.");
    campaign.advance(60);
  }
  const chosen = campaign.setPlantRecipe(
    plantOf(campaign.snapshot(), typeId).id,
    recipe.id,
  );
  if (!chosen.ok) throw new Error(chosen.message);
  return changed(campaign, (state) => {
    for (const flow of recipe.inputs) {
      const { resource } = flow;
      if (resource.kind === "bulk-resource") {
        const stock = state.bulkResources.find(
          (candidate) => candidate.resourceId === resource.resourceId,
        );
        if (stock !== undefined) stock.kilograms = 100;
      } else {
        const stock = state.lifeSupport.find(
          (candidate) => candidate.stockId === resource.stockId,
        );
        if (stock !== undefined) stock.kilograms = 100;
      }
    }
  });
}

describe.each(cases)("the %s running for %s", (_, __, typeId, recipe) => {
  it("takes in and puts out what its recipe says for each hour, while a solar array powers it in Daylight", () => {
    const campaign = plantBase(typeId, recipe);
    campaign.advance(1);
    const before = campaign.snapshot();
    expect(before.lunation.part).toBe("daylight");

    campaign.advance(60);

    const after = campaign.snapshot();
    expect(plantOf(after, typeId).plant).toMatchObject({
      running: true,
      stoppedFor: undefined,
    });
    for (const flow of recipe.inputs) {
      expect(
        amountOf(before, flow.resource) - amountOf(after, flow.resource),
      ).toBeCloseTo(flow.kilogramsPerHour);
    }
    for (const flow of recipe.outputs) {
      expect(
        amountOf(after, flow.resource) - amountOf(before, flow.resource),
      ).toBeCloseTo(flow.kilogramsPerHour);
    }
  });
});

describe("the electrolysis plant", () => {
  it("makes as much oxygen in a few Earth Days of Daylight as the Mission Director uses in a Lunation, from under a fifth of an Expedition's water ice", () => {
    const type = catalogue.structureTypes.find(
      (candidate) => candidate.id === "electrolysis-plant",
    );
    const [recipe] = type?.recipes ?? [];
    if (recipe === undefined) throw new Error("expected a recipe");
    const campaign = plantBase("electrolysis-plant", recipe);
    const oxygen = { kind: "life-support", stockId: "oxygen" } as const;
    const ice = { kind: "bulk-resource", resourceId: "water-ice" } as const;
    const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
    const used =
      (catalogue.lifeSupportStocks.find((stock) => stock.id === "oxygen")
        ?.usePerEarthDayKilograms ?? Number.NaN) *
      (daylightEarthDays + nightEarthDays);
    const before = campaign.snapshot();

    campaign.advance(3 * 24 * 60);

    const after = campaign.snapshot();
    expect(after.lunation.part).toBe("daylight");
    expect(amountOf(after, oxygen) - amountOf(before, oxygen)).toBeGreaterThan(
      used,
    );
    expect(amountOf(before, ice) - amountOf(after, ice)).toBeLessThan(
      catalogue.expeditions.kilograms / 5,
    );
  });
});

describe("the Integrated fabrication plant waiting for metals", () => {
  it("says it waits for silicon instead, once switched to wafers, before a game-minute is played", () => {
    const [circuitBoards, wafers] =
      catalogue.structureTypes.find(
        (type) => type.id === "integrated-fabrication-plant",
      )?.recipes ?? [];
    if (circuitBoards === undefined || wafers === undefined) {
      throw new Error("expected two recipes");
    }
    // Enough silicon for a batch of circuit boards, but not of wafers.
    const campaign = changed(
      plantBase("integrated-fabrication-plant", circuitBoards),
      (state) => {
        for (const stock of state.bulkResources) {
          if (stock.resourceId === "metals") stock.kilograms = 0;
          if (stock.resourceId === "silicon") stock.kilograms = 0.5;
        }
      },
    );
    campaign.advance(1);
    const waiting = () =>
      plantOf(campaign.snapshot(), "integrated-fabrication-plant").plant
        ?.stoppedFor;
    expect(waiting()).toMatchObject({
      reason: "no-input",
      resource: { kind: "bulk-resource", resourceId: "metals" },
    });

    const result = campaign.setPlantRecipe(
      plantOf(campaign.snapshot(), "integrated-fabrication-plant").id,
      wafers.id,
    );

    expect(result).toEqual({ ok: true });
    expect(waiting()).toEqual({
      reason: "no-input",
      resource: { kind: "bulk-resource", resourceId: "silicon" },
      kilograms: 0.5,
      kilogramsNeeded: wafers.inputs[0]?.kilogramsPerHour,
    });
  });
});
