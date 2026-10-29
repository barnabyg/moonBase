import { describe, expect, it, vi } from "vitest";
import { catalogue, type Catalogue, type PlantRecipe } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GroundPosition,
  type Snapshot,
  type StructureSnapshot,
} from "../src/simulation";
import { formatPlant } from "../src/ui/format";
import { scenario } from "./scenario";
import { changed, worn } from "./worn";

// Nothing but the Plant wears its Condition down, the Robot digs no
// Regolith unless a test asks, and the Mission Director comes to no harm
// in the Habitat from anything but power.
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
  (type) => type.id === "extraction-plant",
);
// The default recipe, which a newly commissioned Plant runs.
const recipe: PlantRecipe | undefined = plantType?.recipes?.[0];
if (plantType === undefined || recipe === undefined) {
  throw new Error("expected an extraction plant");
}
const arraySite: GroundPosition = { x: 20, y: 12 };
const plantSite: GroundPosition = { x: 30, y: 22 };
const bankSite: GroundPosition = { x: -30, y: 4 };
const habitatSite: GroundPosition = { x: 30, y: -30 };

/** The kilograms an hour the recipe moves of a bulk resource or life support stock. */
function perHour(
  flows: PlantRecipe["inputs"],
  kind: "bulk-resource" | "life-support",
  id: string,
): number {
  return flows
    .filter((flow) =>
      flow.resource.kind === "bulk-resource"
        ? kind === "bulk-resource" && flow.resource.resourceId === id
        : kind === "life-support" && flow.resource.stockId === id,
    )
    .reduce((sum, flow) => sum + flow.kilogramsPerHour, 0);
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

function plantOf(state: Snapshot): StructureSnapshot {
  const plant = state.structures.find(
    (structure) => structure.structureTypeId === "extraction-plant",
  );
  if (plant === undefined) throw new Error("expected an extraction plant");
  return plant;
}

/** The Campaign with the Components of an extraction plant brought to the base's stock, as a Launch would. */
function withPlantComponents(campaign: Campaign): Campaign {
  return changed(campaign, (state) => {
    for (const need of plantType?.components ?? []) {
      const stock = state.stockpile.components.find(
        (candidate) => candidate.componentId === need.componentId,
      );
      if (stock !== undefined) stock.count += need.count;
    }
  });
}

/** The Campaign as saved, with a bulk resource and the oxygen set as given. */
function withStocks(
  campaign: Campaign,
  stocks: { readonly regolith?: number; readonly oxygen?: number },
): Campaign {
  return changed(campaign, (state) => {
    for (const stock of state.bulkResources) {
      if (stock.resourceId === "regolith" && stocks.regolith !== undefined) {
        stock.kilograms = stocks.regolith;
      }
    }
    for (const stock of state.lifeSupport) {
      if (stock.stockId === "oxygen" && stocks.oxygen !== undefined) {
        stock.kilograms = stocks.oxygen;
      }
    }
  });
}

/** A solar array, and an extraction plant cabled to it, built in the first Daylight. */
function plantBase(): Campaign {
  const game = scenario();
  const campaign = withPlantComponents(game.campaign);
  for (const [structureTypeId, position] of [
    ["solar-array", arraySite],
    ["extraction-plant", plantSite],
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

describe("the extraction plant", () => {
  it("turns Regolith into oxygen, metals and silicon at the recipe's rates while it has power", () => {
    const campaign = withStocks(plantBase(), { regolith: 500 });
    campaign.advance(1);
    const before = campaign.snapshot();
    expect(before.lunation.part).toBe("daylight");

    campaign.advance(60);

    const after = campaign.snapshot();
    expect(plantOf(after)).toMatchObject({
      powered: true,
      plant: { running: true, stoppedFor: undefined },
    });
    const change = (read: (state: Snapshot) => number) =>
      read(after) - read(before);
    expect(change((state) => bulk(state, "regolith"))).toBeCloseTo(
      -perHour(recipe.inputs, "bulk-resource", "regolith"),
      6,
    );
    expect(change((state) => lifeSupport(state, "oxygen"))).toBeCloseTo(
      perHour(recipe.outputs, "life-support", "oxygen"),
      6,
    );
    for (const resourceId of ["metals", "silicon"]) {
      expect(change((state) => bulk(state, resourceId))).toBeCloseTo(
        perHour(recipe.outputs, "bulk-resource", resourceId),
        6,
      );
    }
  });

  it("counts the power it draws while it runs in its network's use", () => {
    const campaign = withStocks(plantBase(), { regolith: 500 });
    const stopped = campaign.snapshot().power.networks[0]?.consumptionKilowatts;
    campaign.advance(2);

    expect(
      campaign.snapshot().power.networks[0]?.consumptionKilowatts,
    ).toBeCloseTo((stopped ?? 0) + recipe.drawKilowatts, 6);
  });

  it("waits with less than a batch's Regolith, taking none, saying so, and wears no further", () => {
    const campaign = withStocks(plantBase(), { regolith: 1 });

    campaign.advance(60);

    const state = campaign.snapshot();
    expect(bulk(state, "regolith")).toBe(1);
    expect(plantOf(state)).toMatchObject({
      powered: false,
      plant: {
        running: false,
        stoppedFor: {
          reason: "no-input",
          resource: { kind: "bulk-resource", resourceId: "regolith" },
          kilograms: 1,
          kilogramsNeeded: perHour(recipe.inputs, "bulk-resource", "regolith"),
        },
        batch: undefined,
      },
    });
    const { conditionPercent } = plantOf(state);
    const oxygen = lifeSupport(state, "oxygen");
    campaign.advance(5 * 60);
    expect(plantOf(campaign.snapshot()).conditionPercent).toBe(
      conditionPercent,
    );
    expect(lifeSupport(campaign.snapshot(), "oxygen")).toBe(oxygen);
  });

  it("stands idle at Night, saying so, with no battery bank to draw on", () => {
    const campaign = withStocks(plantBase(), { regolith: 5000 });
    const { lunation } = campaign.snapshot();
    campaign.advance(lunation.minutesRemaining + 2);
    const before = bulk(campaign.snapshot(), "regolith");

    campaign.advance(60);

    expect(bulk(campaign.snapshot(), "regolith")).toBe(before);
    expect(plantOf(campaign.snapshot()).plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "night" },
    });
  });

  it("stops while it is Broken, saying so", () => {
    const base = plantBase();
    const plantId = plantOf(base.snapshot()).id;
    const campaign = withStocks(worn(base, plantId, 0, 0), { regolith: 500 });

    campaign.advance(60);

    expect(bulk(campaign.snapshot(), "regolith")).toBe(500);
    expect(plantOf(campaign.snapshot()).plant).toEqual({
      running: false,
      stoppedFor: { reason: "broken" },
    });
  });

  it("takes longer over a batch at low Condition, along the Structure performance curve", () => {
    const base = plantBase();
    const plantId = plantOf(base.snapshot()).id;
    const campaign = withStocks(worn(base, plantId, 25, 0), { regolith: 500 });
    const before = campaign.snapshot();
    expect(before.lunation.part).toBe("daylight");

    let minutes = 0;
    while (
      lifeSupport(campaign.snapshot(), "oxygen") ===
      lifeSupport(before, "oxygen")
    ) {
      if (minutes > 10 * 60) throw new Error("The batch never finished.");
      campaign.advance(1);
      minutes += 1;
    }

    // Its performance falls a little more as it wears through the batch.
    const performance =
      (plantOf(before).performance + plantOf(campaign.snapshot()).performance) /
      2;
    expect(performance).toBeLessThan(1);
    expect(Math.abs(minutes - 60 / performance)).toBeLessThan(1.5);
    expect(
      lifeSupport(campaign.snapshot(), "oxygen") -
        lifeSupport(before, "oxygen"),
    ).toBeCloseTo(perHour(recipe.outputs, "life-support", "oxygen"), 6);
  });

  it("wears down by Dust for each hour it runs", () => {
    const campaign = withStocks(plantBase(), { regolith: 500 });
    campaign.advance(1);
    const before = plantOf(campaign.snapshot()).conditionPercent;

    campaign.advance(10 * 60);

    expect(before - plantOf(campaign.snapshot()).conditionPercent).toBeCloseTo(
      10 * plantType.dustWearPercentPerHour,
      6,
    );
  });

  it("wears no further by Dust while it is switched off, once its last batch is done", () => {
    const campaign = withStocks(plantBase(), { regolith: 500 });
    campaign.advance(1);
    const plantId = plantOf(campaign.snapshot()).id;
    expect(campaign.switchPlant(plantId, "off")).toEqual({ ok: true });
    for (
      let minutes = 0;
      plantOf(campaign.snapshot()).plant?.batch;
      minutes++
    ) {
      if (minutes > 2 * 60) throw new Error("The batch never finished.");
      campaign.advance(1);
    }
    campaign.advance(1);
    const { conditionPercent } = plantOf(campaign.snapshot());

    campaign.advance(5 * 60);

    expect(plantOf(campaign.snapshot()).conditionPercent).toBe(
      conditionPercent,
    );
  });

  it("carries on after a save and load exactly as it would have", () => {
    const campaign = withStocks(plantBase(), { regolith: 500 });
    campaign.advance(30);
    const loaded = loadCampaign(campaign.save());
    if (!loaded.ok) throw new Error(loaded.message);

    campaign.advance(3 * 60);
    loaded.campaign.advance(3 * 60);

    expect(loaded.campaign.snapshot()).toEqual(campaign.snapshot());
  });

  it.each([
    ["at Night", 5000, true, { reason: "night" }],
    [
      "short of Regolith",
      1,
      false,
      {
        reason: "no-input",
        resource: { kind: "bulk-resource", resourceId: "regolith" },
      },
    ],
  ] as const)(
    "says why it stands idle %s straight after loading a save from before batches",
    (_, regolith, night, stoppedFor) => {
      const campaign = withStocks(plantBase(), { regolith });
      if (night) {
        campaign.advance(campaign.snapshot().lunation.minutesRemaining + 60);
      }
      campaign.advance(1);
      // As format version 34 saved it, with no batch or reason kept.
      const document = JSON.parse(campaign.save()) as {
        version: number;
        state: { structures: Record<string, unknown>[] };
      };
      document.version = 34;
      for (const structure of document.state.structures) {
        delete structure["batch"];
        delete structure["plantStop"];
      }

      const loaded = loadCampaign(JSON.stringify(document));

      if (!loaded.ok) throw new Error(loaded.message);
      expect(plantOf(loaded.campaign.snapshot()).plant).toMatchObject({
        running: false,
        stoppedFor,
        batch: undefined,
      });
    },
  );
});

describe("a Plant on a network short of power", () => {
  /**
   * A solar array, a battery bank, a Habitat with the Mission Director in it
   * and an extraction plant, all on one network, with Regolith to spare.
   */
  function habitatBase(withPlant: boolean): Campaign {
    const game = scenario();
    const campaign = withPlantComponents(game.campaign);
    const plans: [string, GroundPosition][] = [
      ["solar-array", arraySite],
      ["battery-bank", bankSite],
      ["habitat", habitatSite],
      ...(withPlant
        ? [["extraction-plant", plantSite] as [string, GroundPosition]]
        : []),
    ];
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
    const movedIn = campaign.moveMissionDirectorIn(habitat?.id ?? "");
    if (!movedIn.ok) throw new Error(movedIn.message);
    return withStocks(campaign, { regolith: 5000 });
  }

  it("is the first to lose power, and never shortens the time until the Habitat loses its own", () => {
    const withPlant = habitatBase(true);
    const without = habitatBase(false);
    // An hour into the first Night.
    for (const campaign of [withPlant, without]) {
      campaign.advance(campaign.snapshot().lunation.minutesRemaining + 60);
    }

    expect(plantOf(withPlant.snapshot()).plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "night" },
    });
    const habitatOf = (campaign: Campaign) =>
      campaign
        .snapshot()
        .structures.find(
          (structure) => structure.structureTypeId === "habitat",
        );
    expect(habitatOf(withPlant)?.powered).toBe(true);
    expect(withPlant.forecasts().habitatPower).toEqual(
      without.forecasts().habitatPower,
    );
    expect(withPlant.snapshot().power.networks[0]?.storedKilowattHours).toBe(
      without.snapshot().power.networks[0]?.storedKilowattHours,
    );
  });

  it("only runs on power its battery banks can't store, once they are full", () => {
    const campaign = habitatBase(true);
    const network = () => campaign.snapshot().power.networks[0];

    for (let minutes = 0; minutes < 24 * 60; minutes++) {
      campaign.advance(1);
      const state = network();
      if (plantOf(campaign.snapshot()).plant?.running === true) {
        expect(state?.storedKilowattHours).toBeCloseTo(
          state?.storageCapacityKilowattHours ?? Number.NaN,
          6,
        );
      }
    }
    expect(plantOf(campaign.snapshot()).plant?.running).toBe(true);
  });

  it("waits in Daylight while its battery banks charge, saying it waits for power to spare", () => {
    const campaign = changed(habitatBase(true), (state) => {
      for (const structure of state.structures) {
        structure.storedKilowattHours = 0;
      }
    });

    campaign.advance(1);

    const state = campaign.snapshot();
    expect(state.lunation.part).toBe("daylight");
    const { plant } = plantOf(state);
    expect(plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "no-power" },
    });
    expect(plant === undefined ? "" : formatPlant(plant)).toMatch(
      /^waiting for power to spare/,
    );
  });
});

describe("the oxygen forecast", () => {
  it("shows the stock rising while the Plant makes more than the Mission Director uses, with no warnings", () => {
    const base = habitatBaseForForecast();
    // Little enough oxygen that, without the Plant, warnings would come.
    const campaign = withStocks(base, { oxygen: 2 });
    campaign.advance(1);

    const forecast = campaign
      .forecasts()
      .lifeSupport.find((stock) => stock.stockId === "oxygen");
    expect(forecast?.minutesUntilEmpty).toBeUndefined();
    expect(forecast?.kilogramsPerEarthDay).toBeGreaterThan(0);

    const events = campaign.advance(6 * 60);
    expect(
      events.filter((event) => event.kind === "life-support-warning"),
    ).toEqual([]);
    expect(lifeSupport(campaign.snapshot(), "oxygen")).toBeGreaterThan(2);
  });
});

/**
 * A solar array, a Habitat with the Mission Director in it and an
 * extraction plant, with no battery bank, so that in Daylight the Plant
 * runs on what the Habitat doesn't draw; and Regolith to spare.
 */
function habitatBaseForForecast(): Campaign {
  const game = scenario();
  const campaign = withPlantComponents(game.campaign);
  for (const [structureTypeId, position] of [
    ["solar-array", arraySite],
    ["habitat", habitatSite],
    ["extraction-plant", plantSite],
  ] as const) {
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
  const movedIn = campaign.moveMissionDirectorIn(habitat?.id ?? "");
  if (!movedIn.ok) throw new Error(movedIn.message);
  return withStocks(campaign, { regolith: 5000 });
}
