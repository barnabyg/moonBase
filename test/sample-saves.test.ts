import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { loadCampaign, type Campaign } from "../src/simulation";

/**
 * Save files written by released format versions, kept so that every one of
 * them must go on loading (ADR-0006). Never edit or regenerate them: add a
 * new sample for a new format version instead.
 */
const samples = new URL("./saves/", import.meta.url);

function loadSample(name: string): Campaign {
  const result = loadCampaign(readFileSync(new URL(name, samples), "utf8"));
  if (!result.ok) throw new Error(`${name}: ${result.message}`);
  return result.campaign;
}

describe("the sample saves", () => {
  it.each(readdirSync(samples).filter((name) => name.endsWith(".moonbase")))(
    "%s loads",
    (name) => {
      expect(() => loadSample(name)).not.toThrow();
    },
  );
});

describe("the sample saves from before Funding", () => {
  it.each(["version-1.moonbase", "version-2.moonbase"])(
    "%s loads with the Programme Grant as its Funding, and an empty Launch manifest",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.fundingMillionDollars).toBe(
        catalogue.programmeGrantMillionDollars,
      );
      expect(state.launchManifest).toEqual({
        items: [],
        payloadMassKilograms: 0,
        costMillionDollars: 0,
      });
    },
  );
});

describe("the sample save of format version 1", () => {
  it("loads with the Mission Director in the Habitat, and the printer building its shielding", () => {
    const state = loadSample("version-1.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 3, hour: 18, minute: 50 });
    expect(state.missionDirector).toEqual({
      residence: "habitat",
      habitatId: "structure-3",
      movedInAtMinute: 3280,
    });
    expect(state.ended).toBeUndefined();
    expect(
      state.constructions.map((c) => [c.structureTypeId, c.stage]),
    ).toEqual([
      ["regolith-shielding", "assembly"],
      ["light-mast", "component-delivery"],
    ]);
    expect(state.machines).toContainEqual(
      expect.objectContaining({
        machineTypeId: "regolith-printer",
        activity: { kind: "working", constructionId: "structure-4" },
      }),
    );
  });

  it("loads the Lander's cargo stock as the base's stock at the stockpile, with the Robot walking there for the light mast's Components", () => {
    const state = loadSample("version-1.moonbase").snapshot();

    expect(state.stockpile.position).toEqual(
      catalogue.landingSite.stockpilePosition,
    );
    expect(
      state.stockpile.components.filter((stock) => stock.count > 0),
    ).toEqual([
      { componentId: "mast-pole", count: 4 },
      { componentId: "light-head", count: 4 },
    ]);
    expect(state.robots[0]?.activity).toEqual({
      kind: "walking",
      structureId: "structure-5",
      destination: "stockpile",
    });
  });

  it("plays on from where it was saved, until the Habitat is shielded", () => {
    const campaign = loadSample("version-1.moonbase");
    const habitat = () =>
      campaign
        .snapshot()
        .structures.find((structure) => structure.id === "structure-3");

    for (let hours = 0; habitat()?.shielded !== true; hours++) {
      if (hours > 5 * 24) throw new Error("The Habitat was never shielded.");
      campaign.advance(60);
    }

    expect(habitat()).toMatchObject({ shielded: true });
  });

  it("loads an ended Campaign as ended, refusing every command", () => {
    const campaign = loadSample("version-1-ended.moonbase");

    expect(campaign.snapshot().ended).toEqual({
      atMinute: 13416,
      cause: { kind: "habitat-power-failed", habitatId: "structure-3" },
    });
    expect(campaign.advance(60)).toEqual([]);
    expect(campaign.dismantleStructure("structure-1")).toMatchObject({
      ok: false,
    });
    expect(campaign.setLaunchManifest([{ itemId: "water", count: 1 }])).toEqual(
      {
        ok: false,
        reason: "campaign-ended",
        message: "The Campaign is over: the Mission Director has died.",
      },
    );
  });
});

describe("the sample save of format version 2", () => {
  it("loads with the Mission Director in the Habitat, the printer building its shielding, and the Robot walking to the stockpile for a light mast's Components", () => {
    const state = loadSample("version-2.moonbase").snapshot();

    expect(state.missionDirector).toEqual({
      residence: "habitat",
      habitatId: "structure-2",
      movedInAtMinute: 2400,
    });
    expect(
      state.constructions.map((c) => [c.structureTypeId, c.stage]),
    ).toEqual([
      ["regolith-shielding", "assembly"],
      ["light-mast", "component-delivery"],
    ]);
    expect(state.robots[0]?.activity).toEqual({
      kind: "walking",
      structureId: "structure-4",
      destination: "stockpile",
    });
    expect(
      state.stockpile.components.filter((stock) => stock.count > 0),
    ).toEqual([
      { componentId: "battery-module", count: 3 },
      { componentId: "battery-cabinet", count: 1 },
      { componentId: "mast-pole", count: 4 },
      { componentId: "light-head", count: 4 },
    ]);
  });

  it("plays on from where it was saved, until the light mast is commissioned and the Habitat shielded", () => {
    const campaign = loadSample("version-2.moonbase");

    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 5 * 24) throw new Error("The Constructions never finished.");
      campaign.advance(60);
    }

    const { structures } = campaign.snapshot();
    expect(structures.map((s) => s.structureTypeId)).toContain("light-mast");
    expect(structures.find((s) => s.id === "structure-2")).toMatchObject({
      shielded: true,
    });
  });
});

describe("the sample save of format version 3", () => {
  it("loads with its Funding and its Launch manifest", () => {
    const state = loadSample("version-3.moonbase").snapshot();

    expect(state.fundingMillionDollars).toBe(400);
    expect(state.launchManifest.items).toEqual([
      { itemId: "habitat-envelope", count: 1 },
      { itemId: "oxygen", count: 4 },
      { itemId: "water", count: 2 },
    ]);
    expect(state.robots[0]?.activity).toEqual({
      kind: "walking",
      structureId: "structure-4",
      destination: "stockpile",
    });
  });
});
