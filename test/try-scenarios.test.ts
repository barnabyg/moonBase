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
