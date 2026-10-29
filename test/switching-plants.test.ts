import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue, type PlantRecipe } from "../src/catalogue";
import {
  createCampaign,
  loadCampaign,
  type Campaign,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { DEFAULT_SEED } from "./scenario";
import { changed } from "./worn";

// Only the Plants and the Mission Director change the stocks: nothing
// wears down, the Robot digs no Regolith, and the Habitat needs no power
// and keeps the Mission Director alive for as long as a test runs.
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

function recipeOf(structureTypeId: string): PlantRecipe {
  const found = catalogue.structureTypes.find(
    (type) => type.id === structureTypeId,
  )?.recipes?.[0];
  if (found === undefined) throw new Error(`expected ${structureTypeId}`);
  return found;
}

const waterRecipe = recipeOf("water-processing-plant");
const icePerHour = waterRecipe.inputs[0]?.kilogramsPerHour ?? Number.NaN;
const waterPerHour = waterRecipe.outputs[0]?.kilogramsPerHour ?? Number.NaN;
const waterUsePerHour =
  (catalogue.lifeSupportStocks.find((stock) => stock.id === "water")
    ?.usePerEarthDayKilograms ?? Number.NaN) / 24;

/**
 * A Campaign with the Components of the Structures given brought to the
 * base's stock, as Launches would, and those Structures built, Regolith
 * and water ice in stock, and the Mission Director moved into a Habitat if
 * one is among them.
 */
function built(plans: readonly [string, GroundPosition][]): Campaign {
  const campaign = changed(createCampaign({ seed: DEFAULT_SEED }), (state) => {
    for (const [structureTypeId] of plans) {
      const type = catalogue.structureTypes.find(
        (candidate) => candidate.id === structureTypeId,
      );
      if (type?.recipes === undefined) continue;
      for (const need of type.components) {
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
  const habitat = campaign
    .snapshot()
    .structures.find((structure) => structure.structureTypeId === "habitat");
  if (habitat !== undefined) {
    const result = campaign.moveMissionDirectorIn(habitat.id);
    if (!result.ok) throw new Error(result.message);
  }
  return changed(campaign, (state) => {
    for (const stock of state.bulkResources) {
      if (stock.resourceId === "regolith") stock.kilograms = 20_000;
      if (stock.resourceId === "water-ice") stock.kilograms = 5_000;
    }
  });
}

/**
 * A base with a water-processing plant, the Mission Director moved into
 * its Habitat, in Daylight with the plant running. Built once, and loaded
 * afresh for each test.
 */
let baseText: string | undefined;
function running(): Campaign {
  if (baseText === undefined) {
    const campaign = built([
      ["solar-array", { x: 20, y: 12 }],
      ["battery-bank", { x: -30, y: 4 }],
      ["habitat", { x: 30, y: -30 }],
      ["water-processing-plant", { x: -25, y: 20 }],
    ]);
    for (let hours = 0; ; hours++) {
      if (hours > 30 * 24) throw new Error("The plant never ran.");
      if (waterPlantOf(campaign.snapshot()).plant?.running === true) break;
      campaign.advance(60);
    }
    baseText = campaign.save();
  }
  const loaded = loadCampaign(baseText);
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
}

function structureOf(
  state: Snapshot,
  structureTypeId: string,
  index = 0,
): StructureSnapshot {
  const found = state.structures.filter(
    (structure) => structure.structureTypeId === structureTypeId,
  )[index];
  if (found === undefined) throw new Error(`expected ${structureTypeId}`);
  return found;
}

function waterPlantOf(state: Snapshot): StructureSnapshot {
  return structureOf(state, "water-processing-plant");
}

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

function switchPlant(
  campaign: Campaign,
  structureId: string,
  setting: "on" | "off",
): void {
  const result = campaign.switchPlant(structureId, setting);
  if (!result.ok) throw new Error(result.message);
}

/**
 * Advances a game-minute at a time until the Plant has no batch started,
 * which after a Night may wait for the battery banks to charge.
 */
function untilBatchDone(campaign: Campaign, structureId: string): void {
  for (let minutes = 0; ; minutes++) {
    const plant = campaign
      .snapshot()
      .structures.find((structure) => structure.id === structureId);
    if (plant?.plant?.batch === undefined) return;
    if (minutes > 3 * 24 * 60) throw new Error("The batch never finished.");
    campaign.advance(1);
  }
}

describe("a Plant switched off", () => {
  it("stops the water-processing plant using water ice and making water from its next batch on, saying it is switched off", () => {
    const campaign = running();
    const plantId = waterPlantOf(campaign.snapshot()).id;

    switchPlant(campaign, plantId, "off");
    untilBatchDone(campaign, plantId);
    const before = campaign.snapshot();
    campaign.advance(3 * 60);

    const after = campaign.snapshot();
    expect(ice(after)).toBe(ice(before));
    expect(water(after) - water(before)).toBeCloseTo(-3 * waterUsePerHour, 6);
    expect(waterPlantOf(after)).toMatchObject({
      switchedOff: true,
      powered: false,
      plant: {
        running: false,
        stoppedFor: { reason: "switched-off" },
        batch: undefined,
      },
    });
  });
});

describe("a Plant switched off at Night", () => {
  it("says it is switched off rather than idle at Night, and finishes any batch it has started in the next Daylight", () => {
    const campaign = running();
    const plantId = waterPlantOf(campaign.snapshot()).id;
    // Its batches end as Night falls: switched off for half an hour, it
    // starts the next half an hour later, so that Night falls half way
    // through one.
    switchPlant(campaign, plantId, "off");
    untilBatchDone(campaign, plantId);
    campaign.advance(30);
    switchPlant(campaign, plantId, "on");
    campaign.advance(campaign.snapshot().lunation.minutesRemaining + 1);
    expect(campaign.snapshot().lunation.part).toBe("night");
    expect(waterPlantOf(campaign.snapshot()).plant?.batch).toBeDefined();

    switchPlant(campaign, plantId, "off");

    expect(waterPlantOf(campaign.snapshot()).plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "night" },
    });
    campaign.advance(campaign.snapshot().lunation.minutesRemaining + 1);
    untilBatchDone(campaign, plantId);
    campaign.advance(1);
    expect(waterPlantOf(campaign.snapshot()).plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "switched-off" },
      batch: undefined,
    });
  });
});

describe("a Plant switched off with a batch under way", () => {
  it("finishes the batch, which took its inputs as it started, then stops", () => {
    const campaign = running();
    const plantId = waterPlantOf(campaign.snapshot()).id;
    campaign.advance(1);
    const minutesLeft =
      waterPlantOf(campaign.snapshot()).plant?.batch?.minutesLeft ?? 0;
    expect(minutesLeft).toBeGreaterThan(0);
    const before = campaign.snapshot();

    switchPlant(campaign, plantId, "off");

    expect(waterPlantOf(campaign.snapshot())).toMatchObject({
      switchedOff: true,
      plant: { running: true, batch: { minutesLeft } },
    });
    campaign.advance(minutesLeft);
    const after = campaign.snapshot();
    expect(ice(after)).toBe(ice(before));
    expect(water(after) - water(before)).toBeCloseTo(
      waterPerHour - (minutesLeft / 60) * waterUsePerHour,
      6,
    );
    campaign.advance(1);
    expect(waterPlantOf(campaign.snapshot()).plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "switched-off" },
      batch: undefined,
    });
  });
});

describe("the forecasts, with a Plant switched off", () => {
  it("count the only water-processing plant as making nothing, so the water shows falling at once", () => {
    const campaign = running();
    campaign.advance(1);
    const forecastOf = () =>
      campaign
        .forecasts()
        .lifeSupport.find((stock) => stock.stockId === "water");
    expect(forecastOf()?.kilogramsPerEarthDay).toBeGreaterThan(0);

    switchPlant(campaign, waterPlantOf(campaign.snapshot()).id, "off");

    // Though it is still finishing the batch under way.
    expect(waterPlantOf(campaign.snapshot()).plant?.batch).toBeDefined();
    const forecast = forecastOf();
    expect(forecast?.kilogramsPerEarthDay).toBeCloseTo(
      -waterUsePerHour * 24,
      6,
    );
    // From what is in stock now: the batch's water comes only as it finishes.
    expect(forecast?.minutesUntilEmpty).toBe(
      Math.ceil((water(campaign.snapshot()) / waterUsePerHour) * 60),
    );
    expect(
      campaign
        .forecasts()
        .bulkResources.find((stock) => stock.resourceId === "water-ice"),
    ).toEqual({
      resourceId: "water-ice",
      kilogramsPerHour: 0,
      minutesUntilEmpty: undefined,
    });
  });

  it("follow it again once it is switched back on and running", () => {
    const campaign = running();
    const plantId = waterPlantOf(campaign.snapshot()).id;
    const rate = campaign
      .forecasts()
      .bulkResources.find(
        (stock) => stock.resourceId === "water-ice",
      )?.kilogramsPerHour;
    switchPlant(campaign, plantId, "off");
    untilBatchDone(campaign, plantId);
    campaign.advance(60);

    switchPlant(campaign, plantId, "on");
    campaign.advance(1);

    expect(rate).toBeCloseTo(-icePerHour, 6);
    expect(
      campaign
        .forecasts()
        .bulkResources.find((stock) => stock.resourceId === "water-ice")
        ?.kilogramsPerHour,
    ).toBeCloseTo(-icePerHour, 6);
  });
});

describe("a Plant switched back on", () => {
  it("says at once that it is switched on, not what it waited for last, until it next runs", () => {
    const campaign = running();
    const plantId = waterPlantOf(campaign.snapshot()).id;
    switchPlant(campaign, plantId, "off");
    untilBatchDone(campaign, plantId);
    campaign.advance(60);
    expect(campaign.snapshot().lunation.part).toBe("daylight");

    switchPlant(campaign, plantId, "on");

    expect(waterPlantOf(campaign.snapshot()).plant).toEqual({
      running: false,
      stoppedFor: { reason: "switched-on" },
      batch: undefined,
    });
    campaign.advance(1);
    expect(waterPlantOf(campaign.snapshot()).plant).toMatchObject({
      running: true,
      stoppedFor: undefined,
    });
  });

  it("switched off and on again as a batch finishes, reads as it did before", () => {
    const campaign = running();
    const plantId = waterPlantOf(campaign.snapshot()).id;
    campaign.advance(1);
    untilBatchDone(campaign, plantId);
    const before = waterPlantOf(campaign.snapshot()).plant;
    expect(before).toMatchObject({ running: true, batch: undefined });

    switchPlant(campaign, plantId, "off");
    expect(waterPlantOf(campaign.snapshot()).plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "switched-off" },
    });
    switchPlant(campaign, plantId, "on");

    expect(waterPlantOf(campaign.snapshot()).plant).toEqual(before);
  });

  it("starts making water again from its next game-minute, with no rebuilding and no Robot work", () => {
    const campaign = running();
    const plantId = waterPlantOf(campaign.snapshot()).id;
    switchPlant(campaign, plantId, "off");
    untilBatchDone(campaign, plantId);
    campaign.advance(60);
    const off = campaign.snapshot();

    switchPlant(campaign, plantId, "on");

    const on = campaign.snapshot();
    expect(waterPlantOf(on).switchedOff).toBe(false);
    expect(on.robots).toEqual(off.robots);
    expect(on.constructions).toEqual([]);
    expect(on.maintenance).toEqual([]);
    campaign.advance(1);
    const started = campaign.snapshot();
    expect(waterPlantOf(started).plant).toMatchObject({
      running: true,
      stoppedFor: undefined,
      batch: { minutesLeft: 59 },
    });
    expect(ice(off) - ice(started)).toBeCloseTo(icePerHour, 6);
    campaign.advance(59);
    expect(water(campaign.snapshot()) - water(started)).toBeCloseTo(
      waterPerHour - (59 / 60) * waterUsePerHour,
      6,
    );
  });
});

describe("a Plant switched off on a network short of spare power", () => {
  /**
   * A solar array with two extraction plants and, commissioned after them,
   * a water-processing plant, which the array can't spare enough power to
   * run beside both, in Daylight.
   */
  function crowded(): Campaign {
    const campaign = built([
      ["solar-array", { x: 20, y: 12 }],
      ["extraction-plant", { x: 30, y: 22 }],
      ["extraction-plant", { x: -30, y: 4 }],
      ["water-processing-plant", { x: -25, y: 20 }],
    ]);
    campaign.advance(1);
    return campaign;
  }

  it("leaves the power it would have drawn in Daylight to the Plant after it", () => {
    const campaign = crowded();
    const before = campaign.snapshot();
    expect(before.lunation.part).toBe("daylight");
    expect(structureOf(before, "extraction-plant", 0).plant?.running).toBe(
      true,
    );
    expect(structureOf(before, "extraction-plant", 1).plant?.running).toBe(
      true,
    );
    expect(waterPlantOf(before).plant?.stoppedFor).toEqual({
      reason: "no-power",
    });
    const firstId = structureOf(before, "extraction-plant", 0).id;

    switchPlant(campaign, firstId, "off");
    untilBatchDone(campaign, firstId);
    campaign.advance(1);

    const after = campaign.snapshot();
    expect(structureOf(after, "extraction-plant", 0)).toMatchObject({
      powered: false,
      plant: { running: false, stoppedFor: { reason: "switched-off" } },
    });
    expect(waterPlantOf(after).plant?.running).toBe(true);
    expect(
      after.power.networks[0]?.consumptionKilowatts ?? Number.NaN,
    ).toBeCloseTo(
      (before.power.networks[0]?.consumptionKilowatts ?? Number.NaN) -
        recipeOf("extraction-plant").drawKilowatts +
        waterRecipe.drawKilowatts,
      6,
    );
  });
});

describe("switching a Plant", () => {
  it("is kept through saving and loading, and plays on exactly as it would have", () => {
    const campaign = running();
    const plantId = waterPlantOf(campaign.snapshot()).id;
    switchPlant(campaign, plantId, "off");
    campaign.advance(30);

    const loaded = loadCampaign(campaign.save());

    if (!loaded.ok) throw new Error(loaded.message);
    expect(waterPlantOf(loaded.campaign.snapshot()).switchedOff).toBe(true);
    expect(loaded.campaign.advance(3 * 60)).toEqual(campaign.advance(3 * 60));
    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
  });

  it("is refused, saying why, for a Structure that isn't a commissioned Plant", () => {
    const campaign = running();
    const array = structureOf(campaign.snapshot(), "solar-array");

    expect(campaign.switchPlant("no-such-structure", "off")).toEqual({
      ok: false,
      reason: "unknown-structure",
      message: 'There is no commissioned Structure "no-such-structure".',
    });
    for (const setting of ["off", "on"] as const) {
      expect(campaign.switchPlant(array.id, setting)).toEqual({
        ok: false,
        reason: "not-a-plant",
        message:
          "The solar array isn't a Plant, so it can't be switched off or on.",
      });
    }
    expect(structureOf(campaign.snapshot(), "solar-array").switchedOff).toBe(
      false,
    );
  });

  it("is refused once the Campaign has ended", () => {
    const loaded = loadCampaign(
      readFileSync(
        new URL("./saves/version-1-ended.moonbase", import.meta.url),
        "utf8",
      ),
    );
    if (!loaded.ok) throw new Error(loaded.message);

    expect(loaded.campaign.switchPlant("structure-1", "off")).toEqual({
      ok: false,
      reason: "campaign-ended",
      message: "The Campaign is over: the Mission Director has died.",
    });
  });

  it("in a save, can't have switched off a Structure that isn't a Plant, or the save is refused as damaged", () => {
    const document = JSON.parse(running().save()) as {
      state: {
        structures: { structureTypeId: string; switchedOff: unknown }[];
      };
    };
    const index = document.state.structures.findIndex(
      (structure) => structure.structureTypeId === "solar-array",
    );
    const array = document.state.structures[index];
    if (array === undefined) throw new Error("expected a solar array");
    array.switchedOff = true;

    expect(loadCampaign(JSON.stringify(document))).toEqual({
      ok: false,
      reason: "damaged",
      message: `The save file is damaged: state.structures.${index}.switchedOff is true, though the Structure isn't a Plant.`,
    });
  });
});
