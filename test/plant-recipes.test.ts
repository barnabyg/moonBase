import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue, type PlantRecipe } from "../src/catalogue";
import {
  createCampaign,
  loadCampaign,
  lunationMinutes,
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { formatPlantRates } from "../src/ui/structure-state";
import { DEFAULT_SEED } from "./scenario";
import { changed } from "./worn";

// Only the Plants and the Mission Director change the oxygen and water:
// nothing wears down, the Robot digs no Regolith, and the Habitat needs no
// power and keeps the Mission Director alive for as long as a test runs.
vi.mock("../src/catalogue", async (importOriginal) => {
  const actual = await importOriginal<{ catalogue: Catalogue }>();
  const { withoutDigging } = await import("./without-digging");
  const { withoutDust } = await import("./without-dust");
  const { withoutMicrometeorites } = await import("./without-micrometeorites");
  const { withoutCold } = await import("./without-cold");
  const { safeHabitat } = await import("./safe-habitat");
  return {
    ...actual,
    catalogue: safeHabitat(
      withoutCold(
        withoutMicrometeorites(withoutDust(withoutDigging(actual.catalogue))),
      ),
      ["power", "radiation", "life-support", "solar-particle-events"],
    ),
  };
});

function recipesOf(structureTypeId: string): readonly PlantRecipe[] {
  return (
    catalogue.structureTypes.find((type) => type.id === structureTypeId)
      ?.recipes ?? []
  );
}

function recipe(structureTypeId: string, recipeId: string): PlantRecipe {
  const found = recipesOf(structureTypeId).find(
    (candidate) => candidate.id === recipeId,
  );
  if (found === undefined) throw new Error(`expected ${recipeId}`);
  return found;
}

/** The kilograms an hour a recipe makes of a bulk resource or life support stock. */
function made(recipe: PlantRecipe, id: string): number {
  return recipe.outputs
    .filter((flow) =>
      flow.resource.kind === "bulk-resource"
        ? flow.resource.resourceId === id
        : flow.resource.stockId === id,
    )
    .reduce((sum, flow) => sum + flow.kilogramsPerHour, 0);
}

const oxygenRecipe = recipe("extraction-plant", "oxygen");
const metalsRecipe = recipe("extraction-plant", "metals-and-silicon");
const oxygenUsePerHour =
  (catalogue.lifeSupportStocks.find((stock) => stock.id === "oxygen")
    ?.usePerEarthDayKilograms ?? Number.NaN) / 24;
const windowMinutes =
  lunationMinutes(catalogue.lunation).lunation *
  catalogue.selfSufficiency.windowLunations;
const plans: readonly [string, GroundPosition][] = [
  ["solar-array", { x: 20, y: 12 }],
  ["battery-bank", { x: -30, y: 4 }],
  ["habitat", { x: 30, y: -30 }],
  ["extraction-plant", { x: 30, y: 22 }],
  ["water-processing-plant", { x: -25, y: 20 }],
];

/**
 * A base with an extraction plant and a water-processing plant built from
 * Components brought as Launches would, Regolith and water ice in stock,
 * and the Mission Director moved into its Habitat. Built once, and loaded
 * afresh for each test.
 */
let baseText: string | undefined;
function base(): Campaign {
  if (baseText === undefined) {
    const campaign = changed(
      createCampaign({ seed: DEFAULT_SEED }),
      (state) => {
        for (const type of catalogue.structureTypes) {
          if (type.recipes === undefined) continue;
          for (const need of type.components) {
            const stock = state.stockpile.components.find(
              (candidate) => candidate.componentId === need.componentId,
            );
            if (stock !== undefined) stock.count += need.count;
          }
        }
      },
    );
    for (const [structureTypeId, position] of plans) {
      const planned = campaign.planConstruction({ structureTypeId, position });
      if (!planned.ok) throw new Error(planned.message);
    }
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 10 * 24) throw new Error("The Constructions never finished.");
      campaign.advance(60);
    }
    const habitat = structureOf(campaign.snapshot(), "habitat");
    const result = campaign.moveMissionDirectorIn(habitat.id);
    if (!result.ok) throw new Error(result.message);
    baseText = changed(campaign, (state) => {
      for (const stock of state.bulkResources) {
        if (stock.resourceId === "regolith") stock.kilograms = 20_000;
        if (stock.resourceId === "water-ice") stock.kilograms = 5_000;
      }
    }).save();
  }
  const loaded = loadCampaign(baseText);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
}

function structureOf(
  state: Snapshot,
  structureTypeId: string,
): StructureSnapshot {
  const found = state.structures.find(
    (structure) => structure.structureTypeId === structureTypeId,
  );
  if (found === undefined) throw new Error(`expected ${structureTypeId}`);
  return found;
}

/** The base with both Plants running, in Daylight. */
function running(): Campaign {
  const campaign = base();
  for (let hours = 0; ; hours++) {
    if (hours > 30 * 24) throw new Error("The Plants never ran.");
    const state = campaign.snapshot();
    if (
      ["extraction-plant", "water-processing-plant"].every(
        (id) => structureOf(state, id).plant?.running === true,
      )
    ) {
      return campaign;
    }
    campaign.advance(60);
  }
}

function bulk(state: Snapshot, resourceId: string): number {
  return (
    state.bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? Number.NaN
  );
}

function lifeSupport(state: Snapshot, stockId: string): number {
  return (
    state.lifeSupport.find((stock) => stock.stockId === stockId)?.kilograms ??
    Number.NaN
  );
}

function forecastOf(campaign: Campaign, stockId: string) {
  const found = campaign
    .forecasts()
    .lifeSupport.find((candidate) => candidate.stockId === stockId);
  if (found === undefined) throw new Error(`expected ${stockId}`);
  return found;
}

function selfSufficientIn(campaign: Campaign, stockId: string) {
  const found = campaign
    .snapshot()
    .selfSufficiency.find((candidate) => candidate.stockId === stockId);
  if (found === undefined) throw new Error(`expected ${stockId}`);
  return found;
}

/** Advances an hour at a time until an event comes, returning it. */
function until(
  campaign: Campaign,
  matches: (event: GameEvent) => boolean,
  hours: number,
): GameEvent | undefined {
  for (let hour = 0; hour < hours; hour++) {
    const found = campaign.advance(60).find(matches);
    if (found !== undefined) return found;
  }
  return undefined;
}

function setRecipe(
  campaign: Campaign,
  structureTypeId: string,
  recipeId: string,
): void {
  const plant = structureOf(campaign.snapshot(), structureTypeId);
  const result = campaign.setPlantRecipe(plant.id, recipeId);
  if (!result.ok) throw new Error(result.message);
}

describe("a Plant's recipe", () => {
  it("is the first of its type's recipes once it is commissioned", () => {
    const state = base().snapshot();

    expect(structureOf(state, "extraction-plant").recipeId).toBe("oxygen");
    expect(structureOf(state, "water-processing-plant").recipeId).toBe(
      recipesOf("water-processing-plant")[0]?.id,
    );
    expect(structureOf(state, "solar-array").recipeId).toBeUndefined();
  });

  it("changes what the extraction plant makes from its next batch, with no Robot work", () => {
    const campaign = running();
    const robotBefore = campaign.snapshot().robots[0];
    expect(forecastOf(campaign, "oxygen").kilogramsPerEarthDay).toBeCloseTo(
      (made(oxygenRecipe, "oxygen") - oxygenUsePerHour) * 24,
      6,
    );

    setRecipe(campaign, "extraction-plant", "metals-and-silicon");

    const set = campaign.snapshot();
    expect(structureOf(set, "extraction-plant").recipeId).toBe(
      "metals-and-silicon",
    );
    expect(set.robots[0]).toEqual(robotBefore);
    expect(set.constructions).toEqual([]);
    expect(set.maintenance).toEqual([]);
    campaign.advance(1);
    const before = campaign.snapshot();
    campaign.advance(60);
    const after = campaign.snapshot();
    expect(structureOf(after, "extraction-plant").plant?.running).toBe(true);
    const change = (read: (state: Snapshot) => number) =>
      read(after) - read(before);
    expect(change((state) => bulk(state, "regolith"))).toBeCloseTo(
      -(metalsRecipe.inputs[0]?.kilogramsPerHour ?? Number.NaN),
      6,
    );
    for (const resourceId of ["metals", "silicon"]) {
      expect(change((state) => bulk(state, resourceId))).toBeCloseTo(
        made(metalsRecipe, resourceId),
        6,
      );
    }
    expect(change((state) => lifeSupport(state, "oxygen"))).toBeCloseTo(
      made(metalsRecipe, "oxygen") - oxygenUsePerHour,
      6,
    );
    // The oxygen forecast follows the new recipe: the stock is falling.
    const forecast = forecastOf(campaign, "oxygen");
    expect(forecast.kilogramsPerEarthDay).toBeCloseTo(
      (made(metalsRecipe, "oxygen") - oxygenUsePerHour) * 24,
      6,
    );
    expect(forecast.minutesUntilEmpty).toBeDefined();
  });

  it("lets a batch the extraction plant has started finish with the recipe it started it with", () => {
    const campaign = running();
    campaign.advance(30);
    const before = campaign.snapshot();
    expect(structureOf(before, "extraction-plant").plant?.batch).toEqual({
      recipeId: "oxygen",
      minutesLeft: 30,
    });

    setRecipe(campaign, "extraction-plant", "metals-and-silicon");

    const set = structureOf(campaign.snapshot(), "extraction-plant");
    expect(formatPlantRates(set)).toMatch(
      /^making 0\.15 kg of oxygen.* from 4 kg of regolith; Metals and silicon from the next batch$/,
    );
    campaign.advance(30);
    const after = campaign.snapshot();
    expect(bulk(after, "silicon") - bulk(before, "silicon")).toBeCloseTo(
      made(oxygenRecipe, "silicon"),
      6,
    );
    campaign.advance(1);
    expect(
      structureOf(campaign.snapshot(), "extraction-plant").plant?.batch
        ?.recipeId,
    ).toBe("metals-and-silicon");
  });

  it("switched to metals and silicon, loses the base its self-sufficiency in oxygen", () => {
    const campaign = base();
    const gained = until(
      campaign,
      (event) =>
        event.kind === "self-sufficiency-gained" && event.stockId === "oxygen",
      (2 * windowMinutes) / 60,
    );
    expect(gained).toBeDefined();

    setRecipe(campaign, "extraction-plant", "metals-and-silicon");
    const lost = until(
      campaign,
      (event) =>
        event.kind === "self-sufficiency-lost" && event.stockId === "oxygen",
      windowMinutes / 60,
    );

    expect(lost).toBeDefined();
    expect(selfSufficientIn(campaign, "oxygen").selfSufficient).toBe(false);
    expect(selfSufficientIn(campaign, "oxygen").coveredShare).toBeLessThan(1);
    // The water-processing plant carries on.
    expect(selfSufficientIn(campaign, "water").selfSufficient).toBe(true);
  });

  it("can be switched back, and is kept through saving and loading", () => {
    const campaign = running();
    setRecipe(campaign, "extraction-plant", "metals-and-silicon");
    campaign.advance(60);
    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    expect(
      structureOf(loaded.campaign.snapshot(), "extraction-plant").recipeId,
    ).toBe("metals-and-silicon");
    expect(loaded.campaign.advance(6 * 60)).toEqual(campaign.advance(6 * 60));
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());

    setRecipe(loaded.campaign, "extraction-plant", "oxygen");
    loaded.campaign.advance(1);
    expect(
      forecastOf(loaded.campaign, "oxygen").kilogramsPerEarthDay,
    ).toBeGreaterThan(0);
  });

  it("is refused, saying why, for a Structure that isn't a commissioned Plant, or a recipe it doesn't have", () => {
    const campaign = base();
    const state = campaign.snapshot();
    const extraction = structureOf(state, "extraction-plant");
    const array = structureOf(state, "solar-array");

    expect(campaign.setPlantRecipe("no-such-structure", "oxygen")).toEqual({
      ok: false,
      reason: "unknown-structure",
      message: 'There is no commissioned Structure "no-such-structure".',
    });
    expect(campaign.setPlantRecipe(array.id, "oxygen")).toEqual({
      ok: false,
      reason: "not-a-plant",
      message: "The solar array isn't a Plant, so it runs no recipe.",
    });
    for (const recipeId of ["water", "slag"]) {
      expect(campaign.setPlantRecipe(extraction.id, recipeId)).toEqual({
        ok: false,
        reason: "unknown-recipe",
        message: `The extraction plant has no recipe "${recipeId}". It can run Oxygen or Metals and silicon.`,
      });
    }
    expect(structureOf(campaign.snapshot(), "extraction-plant").recipeId).toBe(
      "oxygen",
    );
  });

  it("in a save, must be one the Plant has, or the save is refused as damaged", () => {
    const document = JSON.parse(base().save()) as {
      state: { structures: { structureTypeId: string; recipeId: unknown }[] };
    };
    const index = document.state.structures.findIndex(
      (structure) => structure.structureTypeId === "extraction-plant",
    );
    const plant = document.state.structures[index];
    if (plant === undefined) throw new Error("expected an extraction plant");
    plant.recipeId = "water";

    expect(loadCampaign(JSON.stringify(document))).toEqual({
      ok: false,
      reason: "damaged",
      message: `The save file is damaged: state.structures.${index}.recipeId isn't one of "oxygen", "metals-and-silicon".`,
    });
  });

  it("in a save, of a batch the Plant has started, must be one the Plant has, or the save is refused as damaged", () => {
    const document = JSON.parse(running().save()) as {
      state: {
        structures: { structureTypeId: string; batch: unknown }[];
      };
    };
    const index = document.state.structures.findIndex(
      (structure) => structure.structureTypeId === "extraction-plant",
    );
    const plant = document.state.structures[index];
    if (plant === undefined) throw new Error("expected an extraction plant");
    plant.batch = { recipeId: "water", minutesWorked: 10 };

    expect(loadCampaign(JSON.stringify(document))).toEqual({
      ok: false,
      reason: "damaged",
      message: `The save file is damaged: state.structures.${index}.batch.recipeId isn't one of "oxygen", "metals-and-silicon".`,
    });
  });

  it("is refused once the Campaign has ended", () => {
    const loaded = loadCampaign(
      readFileSync(
        new URL("./saves/version-1-ended.moonbase", import.meta.url),
        "utf8",
      ),
    );
    if (!loaded.ok) throw new Error(loaded.message);

    expect(
      loaded.campaign.setPlantRecipe("structure-1", "metals-and-silicon"),
    ).toEqual({
      ok: false,
      reason: "campaign-ended",
      message: "The Campaign is over: the Mission Director has died.",
    });
  });

  it("leaves a Plant with a single recipe running it as before, whatever the extraction plant runs", () => {
    const campaign = running();
    const water = structureOf(campaign.snapshot(), "water-processing-plant");
    const [only] = recipesOf("water-processing-plant");
    if (only === undefined) throw new Error("expected a recipe");
    expect(recipesOf("water-processing-plant")).toHaveLength(1);
    const waterForecast = () => forecastOf(campaign, "water");
    const before = waterForecast().kilogramsPerEarthDay;

    expect(campaign.setPlantRecipe(water.id, only.id)).toEqual({ ok: true });
    setRecipe(campaign, "extraction-plant", "metals-and-silicon");
    campaign.advance(60);

    expect(
      structureOf(campaign.snapshot(), "water-processing-plant"),
    ).toMatchObject({
      recipeId: only.id,
      plant: { running: true, stoppedFor: undefined },
    });
    expect(waterForecast().kilogramsPerEarthDay).toBeCloseTo(before, 6);
    expect(campaign.setPlantRecipe(water.id, "oxygen")).toMatchObject({
      ok: false,
      reason: "unknown-recipe",
    });
  });
});
