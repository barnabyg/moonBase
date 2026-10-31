import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { loadCampaign } from "../src/simulation";
import { tryScenarios, type TryScenario } from "./try-scenarios";

/**
 * The save a scenario prepares, prepared once and shared, as a save's text
 * never changes and the tests load it afresh. The act-2 scenario plays the
 * reference Campaign to get there, which takes far longer than anything else
 * here.
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
  it.each(tryScenarios.filter((scenario) => scenario.slow !== true))(
    "$id prepares a Campaign the game can load",
    (scenario) => {
      expect(loadCampaign(saveOf(scenario)).ok).toBe(true);
    },
  );

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
