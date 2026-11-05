import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { loadCampaign } from "../src/simulation";
import { tryScenarios, type TryScenario } from "./try-scenarios";

/**
 * The save a scenario prepares, prepared once and shared, as a save's text
 * never changes and the tests load it afresh. The act-2 and act-3 scenarios
 * play the reference Campaign to get there, which takes far longer than
 * anything else here.
 */
const saves = new Map<string, string>();
function saveOf(scenario: TryScenario | undefined): string {
  if (scenario === undefined) return "";
  let save = saves.get(scenario.id);
  if (save === undefined) {
    save = scenario.save();
    saves.set(scenario.id, save);
  }
  return save;
}

describe("what npm run try can start the game in", () => {
  // act-2 is slow, and kept: its save comes from playing the reference
  // Campaign to Act 2, and that play still reaching it is the check. The act-4
  // scenarios are left out as slow: they play the long-game play guide for minutes,
  // and CI plays that already.
  it.each(tryScenarios.filter((scenario) => scenario.slow !== true))(
    "$id prepares a Campaign the game can load",
    (scenario) => {
      expect(loadCampaign(saveOf(scenario)).ok).toBe(true);
    },
  );

  it("greenhouse has a Greenhouse growing a few hours before Night, on a day's water above the reserve, with a water-processing plant switched off", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "greenhouse",
    );
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    loaded.campaign.advance(1);
    const state = loaded.campaign.snapshot();

    expect(state.lunation.part).toBe("daylight");
    expect(state.lunation.minutesRemaining).toBeLessThanOrEqual(6 * 60);
    const of = (id: string) =>
      state.structures.find(({ structureTypeId }) => structureTypeId === id);
    expect(of("greenhouse")?.plant).toMatchObject({ running: true });
    expect(of("greenhouse")?.growingMinutes).toBeGreaterThan(60);
    expect(of("water-processing-plant")?.switchedOff).toBe(true);
    expect(
      state.lifeSupport.find(({ stockId }) => stockId === "water")?.kilograms,
    ).toBeGreaterThanOrEqual(78);
  });

  it("late-game has the Mission Director in a Buried Habitat, a Greenhouse growing, and the Science and Components for what comes after", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "late-game",
    );
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    loaded.campaign.advance(1);
    const state = loaded.campaign.snapshot();
    const of = (id: string) =>
      state.structures.find(({ structureTypeId }) => structureTypeId === id);

    expect(state.missionDirector).toMatchObject({
      residence: "habitat",
      habitatId: of("buried-habitat")?.id,
    });
    expect(state.radiationDoseMillisieverts).toBeCloseTo(570, 1);
    expect(state.lunation.part).toBe("daylight");
    expect(state.unlockedDesignIds).toContain("growing-halls");
    expect(state.unlockedDesignIds).not.toContain("vault-cistern");
    expect(of("greenhouse")?.plant).toMatchObject({ running: true });
    expect(state.fundingMillionDollars).toBe(20000);

    const unlocked = loaded.campaign.unlockDesign("vault-cistern");
    expect(unlocked.ok).toBe(true);
    expect(
      loaded.campaign.planConstruction({
        structureTypeId: "growing-hall",
        position: { x: 90, y: 40 },
      }).ok,
    ).toBe(true);
    expect(
      loaded.campaign.planConstruction({
        structureTypeId: "vault-cistern",
        position: of("buried-habitat")?.position ?? { x: 0, y: 0 },
      }).ok,
    ).toBe(true);
  });

  it("buried-habitat has the Mission Director behind a water wall at a high dose, a powered Buried Habitat to move to and a bare Habitat beside it", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "buried-habitat",
    );
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    const state = loaded.campaign.snapshot();
    const habitats = state.structures.filter(({ structureTypeId }) =>
      ["habitat", "buried-habitat"].includes(structureTypeId),
    );

    expect(state.radiationDoseMillisieverts).toBeCloseTo(568, 2);
    expect(state.lunation.part).toBe("daylight");
    expect(
      loaded.campaign.forecasts().radiationDose.millisievertsPerEarthDay,
    ).toBe(
      catalogue.radiation.doseRateMillisievertsPerEarthDay.waterWalledHabitat,
    );
    expect(habitats.map(({ powered }) => powered)).toEqual([true, true, true]);
    expect(habitats.filter(({ buried }) => buried)).toHaveLength(1);
    expect(habitats.filter(({ waterWalled }) => waterWalled)).toHaveLength(1);
  });

  it("water-reserve has an optics works running six batches above the reserve, with the Mission Director living behind Regolith shielding", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "water-reserve",
    );
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    const state = loaded.campaign.snapshot();
    const typed = (id: string) =>
      state.structures.find(({ structureTypeId }) => structureTypeId === id);

    expect(typed("optics-works")?.plant?.running).toBe(true);
    expect(typed("habitat")?.shielded).toBe(true);
    expect(state.missionDirector.residence).toBe("habitat");
    expect(
      state.lifeSupport.find(({ stockId }) => stockId === "water")?.kilograms,
    ).toBeCloseTo(49 + 6, 5);
    expect(state.lunation.part).toBe("daylight");
  });

  it("storage-tanks has each tank commissioned and half full, a few hours before Night, with a second water tank's Components in stock", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "storage-tanks",
    );
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    const state = loaded.campaign.snapshot();

    expect(
      state.lifeSupport.map(({ stockId, kilograms, limitKilograms }) => [
        stockId,
        kilograms,
        limitKilograms,
      ]),
    ).toEqual([
      ["oxygen", 200, 400],
      ["water", 700, 1400],
    ]);
    expect(
      state.structures.find(
        ({ structureTypeId }) => structureTypeId === "water-tank",
      )?.tank?.heldKilograms,
    ).toBe(500);
    expect(state.lunation.part).toBe("daylight");
    expect(state.lunation.minutesRemaining).toBeLessThanOrEqual(6 * 60);
    expect(
      state.stockpile.components.find(
        ({ componentId }) => componentId === "water-tank-shell",
      )?.count,
    ).toBe(1);
  });

  it("full-store has a water-processing plant running three batches below the limit, with the optics works switched off", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "full-store",
    );
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    const state = loaded.campaign.snapshot();
    const typed = (id: string) =>
      state.structures.find(({ structureTypeId }) => structureTypeId === id);

    expect(typed("optics-works")?.switchedOff).toBe(true);
    expect(typed("water-processing-plant")?.switchedOff).toBe(false);
    expect(
      state.lifeSupport.find(({ stockId }) => stockId === "water")?.kilograms,
    ).toBeCloseTo(400 - 3 * 0.9, 5);
    expect(state.lunation.part).toBe("daylight");

    loaded.campaign.advance(4 * 60);

    expect(
      loaded.campaign
        .snapshot()
        .structures.find(
          ({ structureTypeId }) => structureTypeId === "water-processing-plant",
        )?.plant?.stoppedFor?.reason,
    ).toBe("output-full");
  });

  it("propellant-tanks has a Plant and a tank commissioned, three batches from full, with a second tank's Components in stock, and the Plant comes to wait", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "propellant-tanks",
    );
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    const state = loaded.campaign.snapshot();

    expect(
      state.bulkResources.find(({ resourceId }) => resourceId === "propellant"),
    ).toEqual({
      resourceId: "propellant",
      kilograms: 1047,
      limitKilograms: 1050,
    });
    expect(state.lunation.part).toBe("daylight");
    expect(state.lunation.minutesRemaining).toBeLessThanOrEqual(6 * 60);
    expect(
      state.stockpile.components.find(
        ({ componentId }) => componentId === "propellant-tank-shell",
      )?.count,
    ).toBe(1);

    loaded.campaign.advance(4 * 60);

    const later = loaded.campaign.snapshot();
    expect(
      later.bulkResources.find(({ resourceId }) => resourceId === "propellant")
        ?.kilograms,
    ).toBe(1050);
    expect(
      later.structures.find(
        ({ structureTypeId }) => structureTypeId === "propellant-plant",
      )?.plant?.stoppedFor?.reason,
    ).toBe("output-full");
  });

  it("regolith-digger has a digger and a bin commissioned, 4,800 of 5,000 kg of Regolith before Night, and the digger keeps it up at Night", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "regolith-digger",
    );
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    const state = loaded.campaign.snapshot();
    const regolith = (snapshot: typeof state) =>
      snapshot.bulkResources.find(
        ({ resourceId }) => resourceId === "regolith",
      );

    expect(regolith(state)).toEqual({
      resourceId: "regolith",
      kilograms: 4800,
      limitKilograms: 5000,
    });
    expect(state.lunation.part).toBe("daylight");
    expect(state.lunation.minutesRemaining).toBeLessThanOrEqual(6 * 60);
    expect(
      state.stockpile.components.find(
        ({ componentId }) => componentId === "regolith-bin-walls",
      )?.count,
    ).toBe(1);

    // Into the Night, the excavator parked, and a day of it gone: the
    // propellant plant has used more than a batch, and the digger made it up.
    loaded.campaign.advance(6 * 60 + 24 * 60);
    const night = loaded.campaign.snapshot();
    expect(night.lunation.part).toBe("night");
    expect(regolith(night)?.kilograms).toBeGreaterThan(5000 - 2 * 30);
  });

  it("everything-unlocked has every Design unlocked", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "everything-unlocked",
    );
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.campaign.snapshot().unlockedDesignIds).toHaveLength(
      catalogue.designs.length,
    );
  });

  it("act-3 starts with Act 2 done and enough propellant to fly a tripled Return Mass", () => {
    const scenario = tryScenarios.find((candidate) => candidate.id === "act-3");
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    const { campaign } = loaded;
    const state = campaign.snapshot();

    expect(state.milestones).toMatchObject({
      currentActId: "act-3",
      currentId: "first-propellant",
    });
    expect(state.exports.returnMassKilograms).toBe(350);
    expect(
      campaign.loadExports([
        { resourceId: "circuit-boards", kilograms: 150 },
        { resourceId: "metals", kilograms: 150 },
      ]).ok,
    ).toBe(true);
  });

  it("act-2 starts with Act 1 done, Act 2 current, its first Milestone next to reach, and the means to reach it", () => {
    const scenario = tryScenarios.find((candidate) => candidate.id === "act-2");
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    const { campaign } = loaded;
    const state = campaign.snapshot();

    expect(state.milestones).toMatchObject({
      currentActId: "act-2",
      currentId: "workshop-running",
      nextId: "spare-components-self-sufficient",
    });
    expect(state.fundingMillionDollars).toBe(2500);
    expect(campaign.unlockDesign("molten-regolith-electrolysis").ok).toBe(true);
    expect(campaign.unlockDesign("parts-machining").ok).toBe(true);
    expect(
      campaign.setLaunchManifest([
        { itemId: "machine-tool", count: 1 },
        { itemId: "casting-furnace", count: 1 },
      ]).ok,
    ).toBe(true);
    expect(
      campaign.loadExports([
        { resourceId: "circuit-boards", kilograms: 60 },
        { resourceId: "metals", kilograms: 40 },
      ]).ok,
    ).toBe(true);
    // Loading it brings no notification of an Act already under way.
    expect(
      campaign.advance(60).filter(({ kind }) => kind === "act-started"),
    ).toEqual([]);
  });

  it("last-milestone has every Milestone reached but power storage, and building a battery bank reaches it, which opens the last Act", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "last-milestone",
    );
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    const { campaign } = loaded;
    expect(campaign.snapshot().milestones).toMatchObject({
      currentId: "power-storage",
      nextId: undefined,
    });

    expect(
      campaign.planConstruction({
        structureTypeId: "battery-bank",
        position: { x: 28, y: 12 },
      }).ok,
    ).toBe(true);
    const events = [];
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 5 * 24) throw new Error("It was never built.");
      events.push(...campaign.advance(60));
    }
    events.push(...campaign.advance(1));

    const { milestones, ended } = campaign.snapshot();
    expect(milestones.currentId).toBeUndefined();
    expect(milestones.currentActId).toBe(catalogue.acts.at(-1)?.id);
    expect(events.filter(({ kind }) => kind === "act-started")).toHaveLength(1);
    expect(milestones.reachedIds).toContain("power-storage");
    expect(ended).toBeUndefined();
  });

  it("crew-habitat has a stocked Large-scale Crew Habitat being commissioned, whose commissioning reaches the last Milestone", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "crew-habitat",
    );
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    const { campaign } = loaded;
    expect(campaign.snapshot().constructions).toMatchObject([
      { structureTypeId: "crew-habitat", stage: "commissioning" },
    ]);
    expect(campaign.snapshot().milestones.currentId).toBe(
      "crew-habitat-commissioned",
    );

    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 5 * 24) throw new Error("It was never commissioned.");
      campaign.advance(60);
    }
    campaign.advance(1);

    expect(campaign.snapshot().milestones.reachedIds).toContain(
      "crew-habitat-commissioned",
    );
    expect(campaign.snapshot().ended).toBeUndefined();
  });

  it("workshop starts with a Workshop running on metals, and makes a spare Component", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "workshop",
    );
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    const { campaign } = loaded;
    const spares = () =>
      campaign
        .snapshot()
        .stockpile.components.find(
          (stock) =>
            stock.componentId === catalogue.maintenance.spareComponentId,
        )?.count ?? 0;
    const before = spares();
    const workshop = campaign
      .snapshot()
      .structures.find((structure) => structure.structureTypeId === "workshop");

    expect(workshop?.plant?.running).toBe(true);
    expect(campaign.snapshot().lunation.part).toBe("daylight");
    campaign.advance(workshop?.plant?.batch?.minutesLeft ?? 0);
    expect(spares()).toBe(before + 1);
  });

  it("crowded has some of every bulk resource, and silicon about to run out", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "crowded",
    );
    const loaded = loadCampaign(saveOf(scenario));
    if (!loaded.ok) throw new Error(loaded.message);
    const { bulkResources } = loaded.campaign.snapshot();
    expect(bulkResources).toHaveLength(catalogue.bulkResources.length);
    for (const stock of bulkResources) {
      expect(stock.kilograms).toBeGreaterThan(0);
    }
    // The vacuum fabrication plant starts on it as soon as the game runs.
    loaded.campaign.advance(1);
    const silicon = loaded.campaign
      .forecasts()
      .bulkResources.find((forecast) => forecast.resourceId === "silicon");
    expect(silicon?.minutesUntilEmpty).toBeLessThanOrEqual(
      catalogue.bulkResourceWarningEarthDaysLeft * 24 * 60,
    );
  });
});
