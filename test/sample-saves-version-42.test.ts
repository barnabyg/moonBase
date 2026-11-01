import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCampaign, type Campaign, type Snapshot } from "../src/simulation";
import { loadSample, samples } from "./sample-saves";

function water(state: Snapshot): number {
  return (
    state.lifeSupport.find(({ stockId }) => stockId === "water")?.kilograms ??
    Number.NaN
  );
}

function waterPlant(state: Snapshot) {
  return state.structures.find(
    ({ structureTypeId }) => structureTypeId === "water-processing-plant",
  );
}

describe("the sample save of format version 42", () => {
  // A base with an optics works switched off and a water-processing plant,
  // saved in Daylight four game-hours after it was three batches below the
  // limit of 400 kg, waiting for tank space with water ice to spare.
  it("loads with the water-processing plant waiting for tank space", () => {
    const state = loadSample("version-42.moonbase").snapshot();

    expect(waterPlant(state)?.plant?.stoppedFor).toMatchObject({
      reason: "output-full",
      resource: { kind: "life-support", stockId: "water" },
      limitKilograms: 400,
    });
    expect(water(state)).toBeGreaterThan(399);
  });

  it("plays on from where it was saved, the Plant running again once a batch fits", () => {
    const campaign = loadSample("version-42.moonbase");
    let ran = false;
    for (let hours = 0; hours < 24 && !ran; hours++) {
      campaign.advance(60);
      ran = waterPlant(campaign.snapshot())?.powered === true;
    }

    expect(ran).toBe(true);
    expect(water(campaign.snapshot())).toBeLessThanOrEqual(400);
  });
});

describe("a save from before the storage limits, with a stock over one", () => {
  /** The latest sample from before them, with far more than the limits hold. */
  function overLimits(): Campaign {
    const document = JSON.parse(
      readFileSync(new URL("version-41.moonbase", samples), "utf8"),
    ) as {
      version: number;
      state: { lifeSupport: { stockId: string; kilograms: number }[] };
    };
    expect(document.version).toBe(41);
    for (const stock of document.state.lifeSupport) stock.kilograms = 900;
    const loaded = loadCampaign(JSON.stringify(document));
    if (!loaded.ok) throw new Error(loaded.message);
    return loaded.campaign;
  }

  it("loads with the stock as it was, against the limit", () => {
    const state = overLimits().snapshot();

    expect(
      state.lifeSupport.map(({ stockId, kilograms, limitKilograms }) => [
        stockId,
        kilograms,
        limitKilograms,
      ]),
    ).toEqual([
      ["oxygen", 900, 100],
      ["water", 900, 400],
    ]);
  });

  it("keeps it as the game goes on, taking away only what is used", () => {
    const campaign = overLimits();

    campaign.advance(24 * 60);

    for (const { kilograms } of campaign.snapshot().lifeSupport) {
      expect(kilograms).toBeGreaterThan(890);
      expect(kilograms).toBeLessThanOrEqual(900);
    }
  });
});
