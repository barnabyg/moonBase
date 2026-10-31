import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type { Campaign, GameEvent } from "../src/simulation";
import { samples, untilBatteriesFull, loadSample } from "./sample-saves";

/**
 * What the sample saves of format versions 15 to 26 hold once loaded, and that
 * each plays on from where it was saved.
 */

describe("the sample save of format version 15", () => {
  it("loads with the excavator digging Regolith beside the stockpile", () => {
    const state = loadSample("version-15.moonbase").snapshot();

    expect(
      state.machines.find((machine) => machine.machineTypeId === "excavator")
        ?.activity,
    ).toEqual({ kind: "digging" });
    expect(state.bulkResources[0]?.kilograms).toBeCloseTo(163.3, 1);
  });

  it("plays on from where it was saved, until the Regolith is full", () => {
    const campaign = loadSample("version-15.moonbase");

    campaign.advance(2 * 24 * 60);

    expect(campaign.snapshot().bulkResources[0]?.kilograms).toBe(
      catalogue.digging.fullKilograms,
    );
  });
});

describe("the sample save of format version 16", () => {
  it("loads early in the first Night, with the Robot driving the Rover to park it beside the solar array", () => {
    const state = loadSample("version-16.moonbase").snapshot();

    expect(state.lunation.part).toBe("night");
    expect(state.robots[0]?.activity).toEqual({
      kind: "driving-rover",
      roverId: "rover-1",
      structureId: "structure-1",
    });
    expect(state.rovers[0]).toMatchObject({
      activity: { kind: "being-parked", structureId: "structure-1" },
      pluggedIn: false,
    });
  });

  it("plays on from where it was saved, until the Rover is plugged in and powered", () => {
    const campaign = loadSample("version-16.moonbase");

    campaign.advance(2 * 60);

    expect(campaign.snapshot().lunation.part).toBe("night");
    expect(campaign.snapshot().rovers[0]).toMatchObject({
      activity: { kind: "idle" },
      pluggedIn: true,
      powered: true,
    });
  });
});

describe("the sample save of format version 17", () => {
  const plantOf = (campaign: Campaign) =>
    campaign
      .snapshot()
      .structures.find(
        (structure) => structure.structureTypeId === "extraction-plant",
      );

  it("loads with the extraction plant turning Regolith into oxygen, metals and silicon", () => {
    const campaign = loadSample("version-17.moonbase");

    expect(plantOf(campaign)?.plant).toEqual({
      running: true,
      stoppedFor: undefined,
    });
    expect(
      campaign
        .snapshot()
        .bulkResources.map((s) => s.kilograms)
        .slice(0, 3),
    ).toEqual([
      expect.closeTo(462.3, 1),
      expect.closeTo(6.03, 1),
      expect.closeTo(4.02, 1),
    ]);
  });

  it("plays on from where it was saved, the plant making oxygen until Night stops it", () => {
    const campaign = loadSample("version-17.moonbase");
    const oxygen = () => campaign.snapshot().lifeSupport[0]?.kilograms ?? 0;
    const before = oxygen();

    campaign.advance(campaign.snapshot().lunation.minutesRemaining + 60);

    expect(oxygen()).toBeGreaterThan(before);
    expect(plantOf(campaign)?.plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "night" },
    });
  });
});

describe("the sample save of format version 18", () => {
  it("loads with the Robot and the Rover away on an Expedition", () => {
    const state = loadSample("version-18.moonbase").snapshot();

    expect(state.expedition).toMatchObject({
      stage: "away",
      returnsAtMinute: 4761,
    });
    expect(state.robots[0]?.activity).toEqual({ kind: "on-expedition" });
    expect(state.rovers[0]?.activity).toEqual({ kind: "on-expedition" });
  });

  it("plays on from where it was saved, until the Expedition is back with its water ice", () => {
    const campaign = loadSample("version-18.moonbase");
    const kinds: string[] = [];

    for (let hours = 0; campaign.snapshot().expedition !== undefined; hours++) {
      if (hours > 4 * 24) throw new Error("The Expedition never came back.");
      kinds.push(...campaign.advance(60).map((event) => event.kind));
    }

    expect(kinds).toContain("expedition-returned");
    expect(
      campaign
        .snapshot()
        .bulkResources.find((stock) => stock.resourceId === "water-ice")
        ?.kilograms,
    ).toBe(catalogue.expeditions.kilograms);
  });
});

describe("the sample save of format version 19", () => {
  const iceOf = (campaign: Campaign) =>
    campaign
      .snapshot()
      .bulkResources.find((stock) => stock.resourceId === "water-ice")
      ?.kilograms ?? Number.NaN;

  it("loads with the water-processing plant turning an Expedition's water ice into water", () => {
    const campaign = loadSample("version-19.moonbase");

    expect(
      campaign
        .snapshot()
        .structures.find(
          (structure) => structure.structureTypeId === "water-processing-plant",
        )?.plant,
    ).toEqual({ running: true, stoppedFor: undefined });
    expect(iceOf(campaign)).toBeCloseTo(196.2, 1);
  });

  it("plays on from where it was saved, the ice falling as the water rises", () => {
    const campaign = loadSample("version-19.moonbase");
    const waterOf = () => campaign.snapshot().lifeSupport[1]?.kilograms ?? 0;
    const ice = iceOf(campaign);
    const water = waterOf();

    campaign.advance(10 * 60);

    expect(iceOf(campaign)).toBeLessThan(ice);
    expect(waterOf()).toBeGreaterThan(water);
  });
});

describe("the sample save of format version 20", () => {
  it("loads with two Earth Days of records of the water the plant has made", () => {
    const document = JSON.parse(
      readFileSync(new URL("version-20.moonbase", samples), "utf8"),
    ) as {
      state: {
        selfSufficiency: {
          stockId: string;
          records: { producedKilograms: number }[];
        }[];
      };
    };

    expect(
      document.state.selfSufficiency.map((history) => [
        history.stockId,
        history.records.length,
      ]),
    ).toEqual([
      ["oxygen", 8],
      ["water", 8],
    ]);
    const state = loadSample("version-20.moonbase").snapshot();
    expect(
      state.selfSufficiency.map((judged) => judged.selfSufficient),
    ).toEqual([false, false]);
  });

  it("plays on from where it was saved, never self-sufficient while the Mission Director lives aboard the Lander", () => {
    const campaign = loadSample("version-20.moonbase");

    const kinds = campaign.advance(5 * 24 * 60).map((event) => event.kind);

    expect(kinds).not.toContain("self-sufficiency-gained");
    expect(campaign.snapshot().selfSufficiency[1]).toMatchObject({
      stockId: "water",
      selfSufficient: false,
    });
  });
});

describe("the sample save of format version 21", () => {
  const bulkOf = (campaign: Campaign, resourceId: string) =>
    campaign
      .snapshot()
      .bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? Number.NaN;

  it("loads with an extraction plant and a vacuum fabrication plant turning Regolith into wafers", () => {
    const campaign = loadSample("version-21.moonbase");

    expect(
      campaign
        .snapshot()
        .structures.filter((structure) => structure.plant !== undefined)
        .map((structure) => [structure.structureTypeId, structure.plant]),
    ).toEqual([
      ["extraction-plant", { running: true, stoppedFor: undefined }],
      ["vacuum-fabrication-plant", { running: true, stoppedFor: undefined }],
    ]);
    expect(bulkOf(campaign, "wafers")).toBeCloseTo(3.03, 1);
  });

  it("plays on from where it was saved, the wafers rising while the silicon keeps up once the extraction plant runs for metals and silicon", () => {
    const campaign = loadSample("version-21.moonbase");
    const wafers = bulkOf(campaign, "wafers");
    // It loads running the default recipe, for oxygen, which makes too
    // little silicon to keep the vacuum fabrication plant going.
    const extractionPlant = campaign
      .snapshot()
      .structures.find(
        (structure) => structure.structureTypeId === "extraction-plant",
      );
    expect(
      campaign.setPlantRecipe(extractionPlant?.id ?? "", "metals-and-silicon"),
    ).toEqual({ ok: true });

    campaign.advance(10 * 60);

    expect(bulkOf(campaign, "wafers")).toBeGreaterThan(wafers);
    expect(bulkOf(campaign, "silicon")).toBeGreaterThan(0);
  });
});

describe("the sample save of format version 22", () => {
  const waferPrice =
    catalogue.exports.find((sold) => sold.resourceId === "wafers")
      ?.priceMillionDollarsPerKilogram ?? Number.NaN;

  it("loads with the Mission Director in the Habitat, wafers in stock and 30 kg of them to load onto the Lander", () => {
    const state = loadSample("version-22.moonbase").snapshot();

    expect(state.missionDirector).toMatchObject({ residence: "habitat" });
    expect(state.lander.state).toBe("landed-free");
    expect(
      state.bulkResources.find((stock) => stock.resourceId === "wafers")
        ?.kilograms,
    ).toBe(46.5);
    expect(state.exports).toEqual({
      toLoad: [{ resourceId: "wafers", kilograms: 30 }],
      massKilograms: 30,
      returnMassKilograms: 100,
      propellantToBurnKilograms: 0,
      valueMillionDollars: 30 * waferPrice,
      aboard: [],
      valueAboardMillionDollars: 0,
    });
  });

  it("plays on: the Lander takes the wafers aboard as it takes off, and sells them as it reaches Earth", () => {
    const campaign = loadSample("version-22.moonbase");
    const funding = campaign.snapshot().fundingMillionDollars;
    expect(campaign.sendLander()).toEqual({ ok: true });

    const events: GameEvent[] = [];
    for (
      let skips = 0;
      !events.some((event) => event.kind === "lander-reached-earth");
      skips++
    ) {
      if (skips > 100) throw new Error("The Lander never reached Earth.");
      events.push(...campaign.advanceToNextEvent());
    }

    const wafers = [{ resourceId: "wafers", kilograms: 30 }];
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "lander-took-off", exports: wafers }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "lander-reached-earth",
        sold: wafers,
        earnedMillionDollars: 30 * waferPrice,
      }),
    );
    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    expect(state.fundingMillionDollars).toBe(funding + 30 * waferPrice);
    expect(
      state.bulkResources.find((stock) => stock.resourceId === "wafers")
        ?.kilograms,
    ).toBe(16.5);
  });
});

describe("the sample save of format version 23", () => {
  const bulkOf = (campaign: Campaign, resourceId: string) =>
    campaign
      .snapshot()
      .bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? Number.NaN;

  it("loads with a circuit board plant turning wafers and metals into circuit boards, and some of each to load onto the Lander", () => {
    const campaign = loadSample("version-23.moonbase");

    expect(
      campaign
        .snapshot()
        .structures.filter((structure) => structure.plant !== undefined)
        .map((structure) => [structure.structureTypeId, structure.plant]),
    ).toEqual([
      ["circuit-board-plant", { running: true, stoppedFor: undefined }],
    ]);
    expect(bulkOf(campaign, "circuit-boards")).toBeCloseTo(4.35, 1);
    expect(campaign.snapshot().exports.toLoad).toEqual([
      { resourceId: "wafers", kilograms: 10 },
      { resourceId: "circuit-boards", kilograms: 3 },
    ]);
  });

  it("plays on from where it was saved, the circuit boards rising as the wafers and metals fall", () => {
    const campaign = loadSample("version-23.moonbase");
    const before = Object.fromEntries(
      ["wafers", "metals", "circuit-boards"].map((id) => [
        id,
        bulkOf(campaign, id),
      ]),
    );

    campaign.advance(10 * 60);

    expect(bulkOf(campaign, "circuit-boards")).toBeGreaterThan(
      before["circuit-boards"] ?? Infinity,
    );
    expect(bulkOf(campaign, "wafers")).toBeLessThan(
      before["wafers"] ?? -Infinity,
    );
    expect(bulkOf(campaign, "metals")).toBeLessThan(
      before["metals"] ?? -Infinity,
    );
  });
});

describe("the sample save of format version 24", () => {
  const wafers = [{ resourceId: "wafers", kilograms: 30 }];
  const wafersInStock = (campaign: Campaign) =>
    campaign
      .snapshot()
      .bulkResources.find((stock) => stock.resourceId === "wafers")?.kilograms;

  it("loads with the Lander on the landing pad, and the Robot carrying wafers from the stockpile to it", () => {
    const state = loadSample("version-24.moonbase").snapshot();

    expect(state.lander).toMatchObject({
      state: "landed-free",
      position: { x: 40, y: 25 },
      landingPadId: "structure-4",
    });
    expect(state.exportLoading).toEqual({
      landingPadId: "structure-4",
      collected: true,
      stageProgress: 0,
      exports: wafers,
    });
    expect(state.exports).toMatchObject({ toLoad: wafers, aboard: [] });
    expect(state.robots[0]).toMatchObject({
      activity: { kind: "walking", purpose: "exports", destination: "lander" },
      carryingExports: wafers,
    });
  });

  it("plays on from where it was saved, until the wafers are aboard and the Lander can be sent", () => {
    const campaign = loadSample("version-24.moonbase");
    const before = wafersInStock(campaign);
    expect(campaign.sendLander()).toMatchObject({
      ok: false,
      reason: "exports-loading",
    });
    const kinds: string[] = [];

    for (
      let hours = 0;
      campaign.snapshot().exportLoading !== undefined;
      hours++
    ) {
      if (hours > 24) throw new Error("The wafers never went aboard.");
      kinds.push(...campaign.advance(60).map((event) => event.kind));
    }

    expect(kinds).toContain("lander-loaded");
    expect(campaign.snapshot().ended).toBeUndefined();
    expect(campaign.snapshot().exports.aboard).toEqual(wafers);
    expect(wafersInStock(campaign)).toBe(before);
    expect(campaign.sendLander()).toEqual({ ok: true });
  });
});

describe("the sample save of format version 25", () => {
  const plantOf = (campaign: Campaign) => {
    const plant = campaign
      .snapshot()
      .structures.find(
        (structure) => structure.structureTypeId === "extraction-plant",
      );
    if (plant === undefined) throw new Error("expected an extraction plant");
    return plant;
  };
  const bulkOf = (campaign: Campaign, resourceId: string) =>
    campaign
      .snapshot()
      .bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? Number.NaN;
  const oxygenForecast = (campaign: Campaign) =>
    campaign
      .forecasts()
      .lifeSupport.find((forecast) => forecast.stockId === "oxygen");

  it("loads with the Mission Director in the Habitat, and the extraction plant running for metals and silicon", () => {
    const campaign = loadSample("version-25.moonbase");

    expect(campaign.snapshot().missionDirector).toMatchObject({
      residence: "habitat",
    });
    expect(plantOf(campaign)).toMatchObject({
      recipeId: "metals-and-silicon",
      plant: { running: true, stoppedFor: undefined },
    });
    expect(bulkOf(campaign, "silicon")).toBeCloseTo(1.6, 1);
    expect(oxygenForecast(campaign)?.minutesUntilEmpty).toBeDefined();
  });

  it("plays on from where it was saved, the silicon rising and the oxygen falling, until the plant is switched back to oxygen", () => {
    const campaign = loadSample("version-25.moonbase");
    untilBatteriesFull(campaign);
    const silicon = bulkOf(campaign, "silicon");

    campaign.advance(10 * 60);

    expect(bulkOf(campaign, "silicon")).toBeGreaterThan(silicon + 3);
    expect(oxygenForecast(campaign)?.kilogramsPerEarthDay).toBeLessThan(0);
    expect(campaign.setPlantRecipe(plantOf(campaign).id, "oxygen")).toEqual({
      ok: true,
    });
    campaign.advance(60);
    expect(oxygenForecast(campaign)?.kilogramsPerEarthDay).toBeGreaterThan(0);
    expect(campaign.snapshot().ended).toBeUndefined();
  });
});

describe("the sample save of format version 26", () => {
  // Saved 1735 game-minutes in, 1175 of them into Seismic monitoring. Its
  // length and the Science it pays come from the data catalogue as it is.
  const seismic = catalogue.researchTasks.find(
    (task) => task.id === "seismic-monitoring",
  );
  if (seismic === undefined) throw new Error("expected Seismic monitoring");
  const minutesLeft = seismic.lengthHours * 60 - 1175;

  it("loads with Seismic monitoring running, a Regolith sample analysis completed, and the Robot busy with a light mast", () => {
    const state = loadSample("version-26.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 2, hour: 4, minute: 55 });
    expect(state.science).toBe(5);
    expect(state.completedResearchTaskIds).toEqual([
      "regolith-sample-analysis",
    ]);
    expect(state.researchTask).toMatchObject({
      researchTaskId: "seismic-monitoring",
      minutesLeft,
    });
    expect(state.constructions.map((c) => c.structureTypeId)).toEqual([
      "light-mast",
    ]);
    expect(state.robots[0]?.activity.kind).not.toBe("idle");
  });

  it("plays on from where it was saved, until Seismic monitoring completes and pays its Science", () => {
    const campaign = loadSample("version-26.moonbase");
    expect(
      campaign.startResearchTask("regolith-sample-analysis"),
    ).toMatchObject({ ok: false, reason: "already-completed" });

    const completed = campaign
      .advance(minutesLeft)
      .filter((event) => event.kind === "research-task-completed");

    expect(completed).toEqual([
      {
        kind: "research-task-completed",
        atMinute: 1735 + minutesLeft,
        researchTaskId: "seismic-monitoring",
        science: seismic.science,
      },
    ]);
    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    expect(state.science).toBe(5 + seismic.science);
    expect(state.researchTask).toBeUndefined();
    expect(state.completedResearchTaskIds).toEqual([
      "regolith-sample-analysis",
      "seismic-monitoring",
    ]);
  });
});
