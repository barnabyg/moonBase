import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { loadCampaign, type Campaign, type GameEvent } from "../src/simulation";

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
      { componentId: "spare-component", count: 6 },
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
      { componentId: "spare-component", count: 6 },
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
      landingPadId: undefined,
      cargo: [],
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
      landingPadId: undefined,
      cargo: [],
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
    const conditions = () =>
      campaign
        .snapshot()
        .structures.filter((s) => s.structureTypeId !== "light-mast")
        .map((s) => s.conditionPercent);
    campaign.advance(
      35340 + 3 * 24 * 60 - 1 - campaign.snapshot().clock.elapsedMinutes,
    );
    const before = conditions();

    campaign.advance(1);

    expect(campaign.snapshot().lander.state).toBe("landed-free");
    // Dust has worn them down a little more since the take-off, too.
    expect(before.every((condition) => condition < 80)).toBe(true);
    const lost = conditions().map(
      (after, index) => (before[index] ?? 0) - after,
    );
    expect(lost).toHaveLength(2);
    for (const each of lost) expect(each).toBeCloseTo(20, 1);
  });
});

describe("the sample saves from before the landing pad", () => {
  it.each([
    "version-1.moonbase",
    "version-2.moonbase",
    "version-3.moonbase",
    "version-4.moonbase",
    "version-5.moonbase",
    "version-6.moonbase",
  ])(
    "%s loads with nothing aboard the Lander or being unloaded, and none of a landing pad's Components in stock",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.lander.cargo).toEqual([]);
      expect(state.unloading).toBeUndefined();
      expect(state.stockpile.components.map((s) => s.componentId)).toEqual(
        catalogue.componentTypes.map((type) => type.id),
      );
      expect(
        state.stockpile.components.filter((s) =>
          s.componentId.startsWith("pad-"),
        ),
      ).toEqual([
        { componentId: "pad-panel", count: 0 },
        { componentId: "pad-beacon", count: 0 },
      ]);
    },
  );
});

describe("the sample save of format version 7", () => {
  it("loads with the Lander landed on the landing pad, and the Robot taking its cargo off", () => {
    const state = loadSample("version-7.moonbase").snapshot();

    expect(state.lander).toMatchObject({
      state: "landed-free",
      position: { x: 40, y: 25 },
      landingPadId: "structure-4",
      cargo: [{ componentId: "battery-module", count: 3 }],
    });
    expect(state.plumeEjecta).toBeUndefined();
    expect(state.robots[0]?.activity).toEqual({
      kind: "loading-cargo",
      structureId: "structure-4",
    });
  });

  it("plays on from where it was saved, until the cargo is in the base's stock", () => {
    const campaign = loadSample("version-7.moonbase");
    const modules = () =>
      campaign
        .snapshot()
        .stockpile.components.find((s) => s.componentId === "battery-module")
        ?.count ?? 0;
    const before = modules();
    const kinds: string[] = [];

    for (let hours = 0; campaign.snapshot().unloading !== undefined; hours++) {
      if (hours > 24) throw new Error("The Lander was never unloaded.");
      kinds.push(...campaign.advance(60).map((event) => event.kind));
    }

    expect(kinds).toContain("lander-unloaded");
    expect(modules()).toBe(before + 3);
    expect(campaign.snapshot().lander.cargo).toEqual([]);
  });
});

describe("the sample saves from before Maintenance", () => {
  it.each([
    "version-1.moonbase",
    "version-1-ended.moonbase",
    "version-2.moonbase",
    "version-3.moonbase",
    "version-4.moonbase",
    "version-5.moonbase",
    "version-6.moonbase",
    "version-7.moonbase",
  ])(
    "%s loads with the starting amount of spare Components added to the base's stock, and no Maintenance",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.stockpile.components.map((s) => s.componentId)).toEqual(
        catalogue.componentTypes.map((type) => type.id),
      );
      expect(state.stockpile.components.at(-1)).toEqual({
        componentId: "spare-component",
        count: 6,
      });
      expect(state.maintenance).toEqual([]);
    },
  );

  it("raises Maintenance for a Structure already worn down below the threshold as play goes on", () => {
    const campaign = loadSample("version-6.moonbase");
    campaign.advance(
      35340 + 3 * 24 * 60 - campaign.snapshot().clock.elapsedMinutes,
    );

    campaign.advance(1);

    expect(
      campaign
        .snapshot()
        .maintenance.map((m) =>
          m.target.kind === "structure" ? m.target.structureTypeId : undefined,
        ),
    ).toEqual(["solar-array", "habitat"]);
  });
});

describe("the sample save of format version 8", () => {
  it("loads with the Robot carrying spare Components to the solar array worn down by Plume Ejecta", () => {
    const state = loadSample("version-8.moonbase").snapshot();

    expect(state.structures.map((s) => [s.id, s.conditionPercent])).toEqual([
      ["structure-1", 60],
      ["structure-2", 100],
    ]);
    expect(state.maintenance).toEqual([
      {
        target: {
          kind: "structure",
          structureId: "structure-1",
          structureTypeId: "solar-array",
        },
        spareComponents: 2,
        cleaning: false,
        underWay: true,
        step: "restoring-condition",
        stageProgress: 0,
        waiting: undefined,
      },
    ]);
    expect(state.robots[0]).toMatchObject({
      activity: {
        kind: "walking",
        structureId: "structure-1",
        destination: "site",
      },
      carrying: [{ componentId: "spare-component", count: 2 }],
    });
    expect(state.stockpile.components.at(-1)).toEqual({
      componentId: "spare-component",
      count: 4,
    });
  });

  it("plays on from where it was saved, until the solar array is back to 100%", () => {
    const campaign = loadSample("version-8.moonbase");
    const kinds: string[] = [];

    for (
      let minutes = 0;
      campaign.snapshot().maintenance.length > 0;
      minutes++
    ) {
      if (minutes > 24 * 60) throw new Error("Maintenance never finished.");
      kinds.push(...campaign.advance(1).map((event) => event.kind));
    }

    expect(kinds).toContain("maintenance-completed");
    expect(campaign.snapshot().structures[0]?.conditionPercent).toBe(100);
  });
});

describe("the sample saves from before Dust coating", () => {
  it.each([
    "version-1.moonbase",
    "version-1-ended.moonbase",
    "version-2.moonbase",
    "version-3.moonbase",
    "version-4.moonbase",
    "version-5.moonbase",
    "version-6.moonbase",
    "version-7.moonbase",
    "version-8.moonbase",
  ])("%s loads with no Dust coating on anything", (name) => {
    const { structures } = loadSample(name).snapshot();

    expect(structures.length).toBeGreaterThan(0);
    expect(structures.map((s) => s.dustCoatingPercent)).toEqual(
      structures.map(() => 0),
    );
  });

  it("loads the Maintenance under way in version-8.moonbase as a visit that restores Condition and doesn't clean", () => {
    const campaign = loadSample("version-8.moonbase");
    const events: GameEvent[] = [];

    for (
      let minutes = 0;
      campaign.snapshot().maintenance.length > 0;
      minutes++
    ) {
      if (minutes > 24 * 60) throw new Error("Maintenance never finished.");
      events.push(...campaign.advance(1));
    }

    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "maintenance-completed",
        spareComponents: 2,
        cleaned: false,
      }),
    );
  });
});

describe("the sample save of format version 9", () => {
  it("loads with the Robot cleaning the Dust off the solar array", () => {
    const state = loadSample("version-9.moonbase").snapshot();

    expect(state.structures[0]).toMatchObject({
      structureTypeId: "solar-array",
      dustCoatingPercent: expect.closeTo(30, 0) as number,
    });
    expect(state.maintenance).toEqual([
      expect.objectContaining({
        spareComponents: 0,
        cleaning: true,
        step: "cleaning",
      }),
    ]);
    expect(state.robots[0]?.activity).toEqual({
      kind: "cleaning",
      structureId: "structure-1",
    });
  });

  it("plays on from where it was saved, until the solar array is clean", () => {
    const campaign = loadSample("version-9.moonbase");

    for (
      let minutes = 0;
      campaign.snapshot().maintenance.length > 0;
      minutes++
    ) {
      if (minutes > 24 * 60) throw new Error("Cleaning never finished.");
      campaign.advance(1);
    }

    expect(campaign.snapshot().structures[0]?.dustCoatingPercent).toBe(0);
  });
});

describe("the sample saves from before Machines had a Condition", () => {
  it.each([
    "version-1.moonbase",
    "version-1-ended.moonbase",
    "version-2.moonbase",
    "version-3.moonbase",
    "version-4.moonbase",
    "version-5.moonbase",
    "version-6.moonbase",
    "version-7.moonbase",
    "version-8.moonbase",
    "version-9.moonbase",
  ])("%s loads with every Machine at 100%", (name) => {
    const { machines } = loadSample(name).snapshot();

    expect(machines.length).toBeGreaterThan(0);
    expect(machines.map((m) => m.conditionPercent)).toEqual(
      machines.map(() => 100),
    );
  });
});

describe("the sample save of format version 10", () => {
  it("loads with the regolith printer worn down as it prints the Habitat's shielding", () => {
    const state = loadSample("version-10.moonbase").snapshot();

    expect(
      state.machines.map((m) => [
        m.machineTypeId,
        Math.round(m.conditionPercent),
      ]),
    ).toEqual([
      ["excavator", 97],
      ["regolith-printer", 92],
    ]);
    expect(state.machines[1]?.activity).toEqual({
      kind: "working",
      constructionId: "structure-2",
    });
  });

  it("plays on from where it was saved, the printer wearing down further until the shielding is printed", () => {
    const campaign = loadSample("version-10.moonbase");
    const printer = () => campaign.snapshot().machines[1];
    const before = printer()?.conditionPercent ?? 0;

    for (
      let hours = 0;
      campaign.snapshot().constructions[0]?.stage === "assembly";
      hours++
    ) {
      if (hours > 48) throw new Error("The shielding was never printed.");
      campaign.advance(60);
    }

    expect(printer()?.conditionPercent).toBeLessThan(before);
    expect(printer()?.activity).toEqual({ kind: "idle" });
  });
});

describe("the sample saves from before Machines plugged in", () => {
  it.each([
    "version-1.moonbase",
    "version-2.moonbase",
    "version-6.moonbase",
    "version-8.moonbase",
    "version-10.moonbase",
  ])(
    "%s loads with no Machine being parked, and plays on through the next game-minute's power",
    (name) => {
      const campaign = loadSample(name);

      expect(campaign.snapshot().parking).toEqual([]);
      expect(campaign.snapshot().machines.map((m) => m.powered)).toEqual(
        campaign.snapshot().machines.map(() => false),
      );
      expect(() => campaign.advance(60)).not.toThrow();
    },
  );
});

describe("the sample save of format version 11", () => {
  it("loads with the Robot parking the regolith printer beside the battery bank before Night", () => {
    const state = loadSample("version-11.moonbase").snapshot();

    expect(state.lunation.part).toBe("daylight");
    expect(state.parking).toEqual([
      {
        machineId: "regolith-printer-2",
        machineTypeId: "regolith-printer",
        structureId: "structure-2",
        structureTypeId: "battery-bank",
        underWay: true,
      },
    ]);
    expect(state.machines.map((m) => m.pluggedIn)).toEqual([true, false]);
  });

  it("plays on from where it was saved, until both Machines are plugged in and powered at Night", () => {
    const campaign = loadSample("version-11.moonbase");

    campaign.advance(campaign.snapshot().lunation.minutesRemaining + 1);

    const state = campaign.snapshot();
    expect(state.lunation.part).toBe("night");
    expect(state.machines.map((m) => [m.pluggedIn, m.powered])).toEqual([
      [true, true],
      [true, true],
    ]);
  });
});

describe("the sample saves from before the Robot had a Condition", () => {
  it.each([
    "version-1.moonbase",
    "version-1-ended.moonbase",
    "version-3.moonbase",
    "version-5.moonbase",
    "version-7.moonbase",
    "version-9.moonbase",
    "version-11.moonbase",
  ])("%s loads with the Robot at 100%, repairing nothing", (name) => {
    const [robot] = loadSample(name).snapshot().robots;

    expect(robot).toMatchObject({
      conditionPercent: 100,
      performance: 1,
      selfRepair: undefined,
    });
  });
});

describe("the sample save of format version 12", () => {
  it("loads with the Robot carrying a light mast's Components and spare Components to the Lander, to repair itself", () => {
    const [robot] = loadSample("version-12.moonbase").snapshot().robots;

    expect(robot).toMatchObject({
      activity: { kind: "walking-to-repair", destination: "lander" },
      carrying: [
        { componentId: "mast-pole", count: 1 },
        { componentId: "light-head", count: 1 },
        { componentId: "spare-component", count: 5 },
      ],
      selfRepair: { home: "lander", spareComponents: 5, makeshift: false },
    });
    expect(robot?.conditionPercent).toBeLessThan(
      catalogue.robot.selfRepairThresholdPercent,
    );
  });

  it("plays on from where it was saved, until the Robot has repaired itself and built the light mast", () => {
    const campaign = loadSample("version-12.moonbase");
    const kinds: string[] = [];

    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 48) throw new Error("The light mast was never built.");
      kinds.push(...campaign.advance(60).map((event) => event.kind));
    }

    expect(kinds).toContain("robot-repaired");
    expect(kinds).toContain("construction-completed");
    expect(campaign.snapshot().robots[0]?.conditionPercent).toBeGreaterThan(99);
  });
});

describe("the sample saves from before Micrometeorites", () => {
  /** The Micrometeorite strikes in the next given Earth Days of play. */
  const strikesAhead = (campaign: Campaign, earthDays: number) =>
    campaign
      .advance(earthDays * 24 * 60)
      .filter((event) => event.kind === "micrometeorite-strike");

  // Samples in which the Mission Director lives through the next 20 Earth
  // Days, so that play goes on.
  it.each([
    "version-4.moonbase",
    "version-9.moonbase",
    "version-11.moonbase",
    "version-12.moonbase",
  ])(
    "%s loads with a first strike scheduled from its saved generator, 4 to 20 Earth Days on, the same every time",
    (name) => {
      const saved = loadSample(name);
      const savedAt = saved.snapshot().clock.elapsedMinutes;

      const first = strikesAhead(saved, 21)[0];

      expect(first).toBeDefined();
      expect(first?.atMinute).toBeGreaterThanOrEqual(savedAt + 4 * 24 * 60);
      expect(first?.atMinute).toBeLessThanOrEqual(savedAt + 20 * 24 * 60);
      expect(strikesAhead(loadSample(name), 21)[0]).toEqual(first);
    },
  );
});

describe("the sample save of format version 13", () => {
  it("loads with the Robot just struck by a Micrometeorite", () => {
    const state = loadSample("version-13.moonbase").snapshot();

    expect(state.robots[0]?.conditionPercent).toBeCloseTo(74.5, 0);
    expect(state.structures.map((s) => s.structureTypeId)).toEqual([
      "solar-array",
      "light-mast",
    ]);
  });

  it("plays on from where it was saved, with more strikes to come", () => {
    const campaign = loadSample("version-13.moonbase");

    const kinds = campaign.advance(30 * 24 * 60).map((event) => event.kind);

    expect(kinds).toContain("micrometeorite-strike");
  });
});

describe("the sample save of format version 14", () => {
  it("loads with one spare Component left, and the warning that it will run out within 7 Earth Days given", () => {
    const campaign = loadSample("version-14.moonbase");

    expect(campaign.forecasts().spareComponents).toMatchObject({
      inStock: 1,
      forPendingRepairs: 0,
    });
    expect(
      campaign.forecasts().spareComponents.minutesUntilEmpty,
    ).toBeLessThanOrEqual(7 * 24 * 60);
  });

  it("plays on from where it was saved, warning again only as the time left falls to a lower level", () => {
    const campaign = loadSample("version-14.moonbase");

    const warnings = campaign
      .advance(2 * 24 * 60)
      .filter((event) => event.kind === "spare-components-warning");

    for (const warning of warnings) {
      expect(warning.minutesUntilEmpty).toBeLessThanOrEqual(3 * 24 * 60);
    }
  });
});
