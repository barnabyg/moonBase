import { describe, expect, it, vi } from "vitest";
import {
  catalogue,
  type Catalogue,
  type PlantRecipe,
  resourceOutputs,
} from "../src/catalogue";
import {
  type Campaign,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { formatBulkResources } from "../src/ui/status-panel-text";
import { formatPlant, formatPlantRates } from "../src/ui/structure-state";
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
const wafersPerHour =
  resourceOutputs(recipe)[0]?.kilogramsPerHour ?? Number.NaN;
const arraySite: GroundPosition = { x: 20, y: 12 };
const plantSite: GroundPosition = { x: 30, y: 22 };
const secondArraySite: GroundPosition = { x: 18, y: 26 };
const extractionSite: GroundPosition = { x: 32, y: 36 };

function fail(): never {
  throw new Error("expected a Plant");
}

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
  it("takes an hour's silicon as it starts a batch, and adds the batch's wafers as it ends an hour later", () => {
    const campaign = withBulk(plantBase(), { silicon: 50, wafers: 0 });

    campaign.advance(1);

    let state = campaign.snapshot();
    expect(state.lunation.part).toBe("daylight");
    expect(plantOf(state).plant).toEqual({
      running: true,
      stoppedFor: undefined,
      batch: { recipeId: recipe.id, minutesLeft: 59 },
    });
    expect(bulk(state, "silicon")).toBeCloseTo(50 - siliconPerHour, 6);
    expect(bulk(state, "wafers")).toBe(0);

    campaign.advance(58);
    state = campaign.snapshot();
    expect(bulk(state, "wafers")).toBe(0);
    expect(formatPlant(plantOf(state).plant ?? fail())).toBe(
      "running, 1 min left of this batch",
    );

    campaign.advance(1);
    state = campaign.snapshot();
    expect(plantOf(state).plant).toEqual({
      running: true,
      stoppedFor: undefined,
      batch: undefined,
    });
    expect(bulk(state, "silicon")).toBeCloseTo(50 - siliconPerHour, 6);
    expect(bulk(state, "wafers")).toBeCloseTo(wafersPerHour, 6);

    // The next batch starts straight after.
    campaign.advance(1);
    expect(bulk(campaign.snapshot(), "silicon")).toBeCloseTo(
      50 - 2 * siliconPerHour,
      6,
    );
  });

  it("waits with less than an hour's silicon, taking none, and says how much it has of what it needs", () => {
    const campaign = withBulk(plantBase(), { silicon: siliconPerHour / 4 });

    campaign.advance(60);

    const state = campaign.snapshot();
    expect(bulk(state, "silicon")).toBeCloseTo(siliconPerHour / 4, 6);
    expect(bulk(state, "wafers")).toBe(0);
    const { plant } = plantOf(state);
    expect(plant).toEqual({
      running: false,
      stoppedFor: {
        reason: "no-input",
        resource: { kind: "bulk-resource", resourceId: "silicon" },
        kilograms: siliconPerHour / 4,
        kilogramsNeeded: siliconPerHour,
      },
      batch: undefined,
    });
    expect(formatPlant(plant ?? fail())).toBe(
      `waiting for Silicon: ${Number((siliconPerHour / 4).toFixed(2))} of ${siliconPerHour} kg`,
    );
  });

  it("stands idle at Night with its batch half done, and finishes it in the next Daylight", () => {
    const built = withBulk(plantBase(), { silicon: 0 });
    built.advance(built.snapshot().lunation.minutesRemaining - 30);
    // An hour's silicon, half an hour before nightfall.
    const campaign = withBulk(built, { silicon: siliconPerHour });
    campaign.advance(30);

    let state = campaign.snapshot();
    expect(state.lunation.part).toBe("night");
    campaign.advance(1);
    state = campaign.snapshot();
    expect(plantOf(state).plant).toEqual({
      running: false,
      stoppedFor: { reason: "night" },
      batch: { recipeId: recipe.id, minutesLeft: 30 },
    });
    expect(formatPlant(plantOf(state).plant ?? fail())).toBe(
      "idle at Night: no stored power to spare, 30 min left of this batch",
    );

    campaign.advance(state.lunation.minutesRemaining + 29);
    expect(bulk(campaign.snapshot(), "wafers")).toBe(0);
    campaign.advance(1);

    state = campaign.snapshot();
    expect(state.lunation.part).toBe("daylight");
    expect(bulk(state, "wafers")).toBeCloseTo(wafersPerHour, 6);
    expect(plantOf(state).plant?.batch).toBeUndefined();
  });

  it("leaves a second plant waiting when the first commissioned takes the silicon for its batch", () => {
    const campaign = withBulk(
      base([
        ["solar-array", arraySite],
        ["vacuum-fabrication-plant", plantSite],
        ["vacuum-fabrication-plant", extractionSite],
        ["solar-array", secondArraySite],
      ]),
      { silicon: 0.5 },
    );

    campaign.advance(1);

    const [first, second] = campaign
      .snapshot()
      .structures.filter(
        (structure) => structure.structureTypeId === "vacuum-fabrication-plant",
      )
      .map((structure) => structure.plant);
    expect(first).toMatchObject({ running: true, batch: { minutesLeft: 59 } });
    expect(second).toEqual({
      running: false,
      stoppedFor: {
        reason: "no-input",
        resource: { kind: "bulk-resource", resourceId: "silicon" },
        kilograms: expect.closeTo(0.5 - siliconPerHour, 6) as number,
        kilogramsNeeded: siliconPerHour,
      },
      batch: undefined,
    });
  });

  it("says the second plant waits for silicon, not power, when one solar array can spare power for only one", () => {
    const campaign = withBulk(
      base([
        ["solar-array", arraySite],
        ["vacuum-fabrication-plant", plantSite],
        ["vacuum-fabrication-plant", extractionSite],
      ]),
      { silicon: 0.5 },
    );

    campaign.advance(1);

    const second = campaign
      .snapshot()
      .structures.filter(
        (structure) => structure.structureTypeId === "vacuum-fabrication-plant",
      )[1]?.plant;
    expect(second?.stoppedFor).toMatchObject({
      reason: "no-input",
      resource: { kind: "bulk-resource", resourceId: "silicon" },
    });
  });

  it("loses the silicon of a batch it hasn't finished once it is dismantled", () => {
    const built = withBulk(plantBase(), { silicon: 0, wafers: 0 });
    built.advance(built.snapshot().lunation.minutesRemaining - 30);
    const campaign = withBulk(built, { silicon: siliconPerHour });
    // Into the Night, when the batch waits half done.
    campaign.advance(31);
    const plant = plantOf(campaign.snapshot());
    expect(plant.plant?.batch).toBeDefined();

    expect(campaign.dismantleStructure(plant.id)).toEqual({ ok: true });
    for (let hours = 0; ; hours++) {
      if (hours > 2 * 24) throw new Error("It was never dismantled.");
      const state = campaign.snapshot();
      if (!state.structures.some(({ id }) => id === plant.id)) break;
      campaign.advance(60);
    }

    const state = campaign.snapshot();
    expect(state.lunation.part).toBe("night");
    expect(bulk(state, "silicon")).toBe(0);
    expect(bulk(state, "wafers")).toBe(0);
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
});

describe("an extraction plant running for oxygen, and a vacuum fabrication plant", () => {
  it("make wafers a batch at a time, once the trickle of silicon fills one, with the vacuum fabrication plant waiting steadily in between", () => {
    const campaign = withBulk(
      base([
        ["solar-array", arraySite],
        ["extraction-plant", extractionSite],
        ["vacuum-fabrication-plant", plantSite],
        ["solar-array", secondArraySite],
      ]),
      { regolith: 500, silicon: 0, wafers: 0 },
    );
    expect(campaign.snapshot().lunation.part).toBe("daylight");

    const shown: string[] = [];
    for (let minute = 0; minute < 20 * 60; minute++) {
      campaign.advance(1);
      const state = campaign.snapshot();
      const plant = plantOf(state).plant ?? fail();
      const line = `${plant.running ? "running" : plant.stoppedFor?.reason} ${formatPlantRates(plantOf(state)) ?? ""} ${
        formatBulkResources(
          state.bulkResources,
          campaign.forecasts().bulkResources,
        ).find((resource) => resource.label === "Wafers")?.note ?? ""
      }`;
      if (shown.at(-1) !== line) shown.push(line);
    }

    // Waiting for silicon, one batch running once 18 of the extraction
    // plant's batches have made enough, then waiting again.
    expect(shown).toHaveLength(3);
    expect(shown[0]).toMatch(/^no-input +$/);
    expect(shown[1]).toBe(
      `running making ${wafersPerHour} kg of wafers an hour from ${siliconPerHour} kg of silicon +${(wafersPerHour * 24).toFixed(1)} kg/day`,
    );
    expect(shown[2]).toBe(shown[0]);
    const state = campaign.snapshot();
    expect(state.lunation.part).toBe("daylight");
    expect(bulk(state, "wafers")).toBeCloseTo(wafersPerHour, 6);
  });
});

describe("an extraction plant running for metals and silicon, and a vacuum fabrication plant", () => {
  const extraction = recipeOf("extraction-plant", "metals-and-silicon");
  const siliconMadePerHour =
    resourceOutputs(extraction).find(
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
    // The vacuum fabrication plant starts a batch as each of the extraction
    // plant's brings it enough silicon, from the second hour on, and keeps
    // up with it.
    expect(bulk(after, "wafers")).toBeCloseTo(5 * wafersPerHour, 6);
    expect(bulk(after, "silicon")).toBeLessThan(2 * siliconMadePerHour);
  });
});
