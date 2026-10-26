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
  });
});
