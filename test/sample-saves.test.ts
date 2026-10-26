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
        locked: false,
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

describe("the sample saves from before the Lander flew", () => {
  it.each([
    "version-1.moonbase",
    "version-1-ended.moonbase",
    "version-2.moonbase",
    "version-3.moonbase",
  ])("%s loads with the Lander landed where the Campaign began", (name) => {
    const { lander } = loadSample(name).snapshot();

    expect(lander).toEqual({
      state: "landed-free",
      position: catalogue.landingSite.landerPosition,
      legStartedAtMinute: undefined,
      legEndsAtMinute: undefined,
    });
  });
});

describe("the sample save of format version 4", () => {
  it("loads with the Lander in turnaround on Earth", () => {
    const state = loadSample("version-4.moonbase").snapshot();

    expect(state.lander).toEqual({
      state: "turnaround",
      position: { x: 0, y: 0 },
      legStartedAtMinute: 29580,
      legEndsAtMinute: 35340,
    });
    expect(state.missionDirector).toMatchObject({ residence: "habitat" });
  });

  it("plays on from where it was saved, until the Lander has flown back and landed", () => {
    const campaign = loadSample("version-4.moonbase");
    const kinds: string[] = [];

    for (
      let skips = 0;
      campaign.snapshot().lander.state !== "landed-free";
      skips++
    ) {
      if (skips > 100) throw new Error("The Lander never landed.");
      kinds.push(...campaign.advanceToNextEvent().map((event) => event.kind));
    }

    expect(kinds).toContain("lander-left-earth");
    expect(kinds).toContain("lander-landed");
    expect(campaign.snapshot().clock.elapsedMinutes).toBe(
      35340 + catalogue.lander.roundTripEarthDays.toMoon * 24 * 60,
    );
  });
});

describe("the sample save of format version 5", () => {
  it("loads with the Lander on its way back from Earth, its manifest paid for and locked", () => {
    const state = loadSample("version-5.moonbase").snapshot();

    expect(state.lander).toMatchObject({
      state: "travelling-to-moon",
      legEndsAtMinute: 39660,
    });
    expect(state.fundingMillionDollars).toBe(235);
    expect(state.launchManifest).toMatchObject({
      items: [
        { itemId: "solar-panel", count: 2 },
        { itemId: "array-mast", count: 1 },
        { itemId: "oxygen", count: 2 },
      ],
      locked: true,
    });
  });

  it("plays on from where it was saved, until the cargo has landed and joined the base's stock", () => {
    const campaign = loadSample("version-5.moonbase");
    const panels = () =>
      campaign
        .snapshot()
        .stockpile.components.find(
          (stock) => stock.componentId === "solar-panel",
        )?.count ?? 0;
    const before = panels();

    campaign.advance(39660 - campaign.snapshot().clock.elapsedMinutes);

    const state = campaign.snapshot();
    expect(state.lander.state).toBe("landed-free");
    expect(panels()).toBe(before + 2);
    expect(state.launchManifest).toMatchObject({ items: [], locked: false });
    expect(state.fundingMillionDollars).toBe(235);
  });
});

describe("the sample saves from before Condition", () => {
  it.each([
    "version-1.moonbase",
    "version-1-ended.moonbase",
    "version-2.moonbase",
    "version-3.moonbase",
    "version-4.moonbase",
    "version-5.moonbase",
  ])("%s loads with every Structure at 100%", (name) => {
    const { structures } = loadSample(name).snapshot();

    expect(structures.length).toBeGreaterThan(0);
    expect(structures.map((s) => s.conditionPercent)).toEqual(
      structures.map(() => 100),
    );
  });
});

describe("the sample save of format version 6", () => {
  it("loads with the Structures near the Lander worn down by its take-off", () => {
    const state = loadSample("version-6.moonbase").snapshot();

    expect(state.lander.state).toBe("turnaround");
    expect(
      state.structures.map((s) => [s.structureTypeId, s.conditionPercent]),
    ).toEqual([
      ["solar-array", 80],
      ["habitat", 80],
    ]);
  });

  it("plays on from where it was saved, until the Lander's landing wears them down again", () => {
    const campaign = loadSample("version-6.moonbase");

    campaign.advance(
      35340 + 3 * 24 * 60 - campaign.snapshot().clock.elapsedMinutes,
    );

    const state = campaign.snapshot();
    expect(state.lander.state).toBe("landed-free");
    expect(
      state.structures
        .filter((s) => s.structureTypeId !== "light-mast")
        .map((s) => s.conditionPercent),
    ).toEqual([60, 60]);
  });
});
