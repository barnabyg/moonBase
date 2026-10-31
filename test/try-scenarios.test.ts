import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { loadCampaign } from "../src/simulation";
import { tryScenarios } from "./try-scenarios";

describe("what npm run try can start the game in", () => {
  it.each(tryScenarios.filter((scenario) => scenario.slow !== true))(
    "$id prepares a Campaign the game can load",
    (scenario) => {
      expect(loadCampaign(scenario.save()).ok).toBe(true);
    },
  );

  it("everything-unlocked has every Design unlocked", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "everything-unlocked",
    );
    const loaded = loadCampaign(scenario?.save() ?? "");
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.campaign.snapshot().unlockedDesignIds).toHaveLength(
      catalogue.designs.length,
    );
  });

  it("last-milestone has every Milestone reached but power storage, and building a battery bank reaches it", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "last-milestone",
    );
    const loaded = loadCampaign(scenario?.save() ?? "");
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
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 5 * 24) throw new Error("It was never built.");
      campaign.advance(60);
    }
    campaign.advance(1);

    const { milestones, ended } = campaign.snapshot();
    expect(milestones.currentId).toBeUndefined();
    expect(milestones.reachedIds).toContain("power-storage");
    expect(ended).toBeUndefined();
  });

  it("workshop starts with a Workshop running on metals, and makes a spare Component", () => {
    const scenario = tryScenarios.find(
      (candidate) => candidate.id === "workshop",
    );
    const loaded = loadCampaign(scenario?.save() ?? "");
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
    const loaded = loadCampaign(scenario?.save() ?? "");
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
