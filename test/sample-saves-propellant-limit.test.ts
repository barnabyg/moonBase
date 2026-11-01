import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCampaign, type Campaign } from "../src/simulation";
import { samples } from "./sample-saves";

interface EditableSample {
  state: {
    bulkResources: { resourceId: string; kilograms: number }[];
    structures: {
      id: string;
      structureTypeId: string;
      recipeId: string | null;
      plantStop: unknown;
      batch: unknown;
      switchedOff: boolean;
    }[];
  };
}

/**
 * The sample of the last format before the limit, as though its base had a
 * propellant plant, and a lot of propellant from when it had no limit: its
 * water-processing plant made a propellant plant, on the same cable.
 */
function oldSaveWith(propellant: number): Campaign {
  const save = JSON.parse(
    readFileSync(new URL("version-44.moonbase", samples), "utf8"),
  ) as EditableSample;
  const plant = save.state.structures.find(
    ({ structureTypeId }) => structureTypeId === "water-processing-plant",
  );
  if (plant === undefined) throw new Error("expected a Plant in the sample");
  plant.structureTypeId = "propellant-plant";
  plant.recipeId = "propellant";
  plant.plantStop = null;
  plant.batch = null;
  plant.switchedOff = false;
  for (const line of save.state.bulkResources) {
    if (line.resourceId === "propellant") line.kilograms = propellant;
    if (line.resourceId === "regolith") line.kilograms = 1500;
  }
  const loaded = loadCampaign(JSON.stringify(save));
  if (!loaded.ok) throw new Error(loaded.message);
  return loaded.campaign;
}

function propellantOf(campaign: Campaign) {
  return campaign
    .snapshot()
    .bulkResources.find(({ resourceId }) => resourceId === "propellant");
}

function plantOf(campaign: Campaign) {
  return campaign
    .snapshot()
    .structures.find(
      ({ structureTypeId }) => structureTypeId === "propellant-plant",
    )?.plant;
}

describe("a save from before the propellant limit", () => {
  it("loads with propellant over the limit as it was, and the Plant waits", () => {
    const campaign = oldSaveWith(5000);

    expect(propellantOf(campaign)).toEqual({
      resourceId: "propellant",
      kilograms: 5000,
      limitKilograms: 450,
    });

    campaign.advance(3 * 60);

    expect(propellantOf(campaign)?.kilograms).toBe(5000);
    expect(plantOf(campaign)?.stoppedFor).toMatchObject({
      reason: "output-full",
      kilograms: 5000,
      limitKilograms: 450,
    });
  });

  it("keeps all of it with no Plant at all, a limit of none taking nothing away", () => {
    const save = JSON.parse(
      readFileSync(new URL("version-44.moonbase", samples), "utf8"),
    ) as EditableSample;
    for (const line of save.state.bulkResources) {
      if (line.resourceId === "propellant") line.kilograms = 700;
    }
    const loaded = loadCampaign(JSON.stringify(save));
    if (!loaded.ok) throw new Error(loaded.message);

    loaded.campaign.advance(60);

    expect(propellantOf(loaded.campaign)).toEqual({
      resourceId: "propellant",
      kilograms: 700,
      limitKilograms: 0,
    });
    expect(loaded.campaign.snapshot().exports.returnMassKilograms).toBe(400);
  });
});
