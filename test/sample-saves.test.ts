import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import {
  loadCampaign,
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type Snapshot,
} from "../src/simulation";

/**
 * Save files written by released format versions, kept so that every one of
 * them must go on loading (ADR-0006). Never edit or regenerate them: add a
 * new sample for a new format version instead.
 */
const samples = new URL("./saves/", import.meta.url);

/**
 * Runs a loaded sample until its battery banks are full, so that its Plants
 * get power again: they run only on what no battery bank can store, and a
 * battery bank may store more now than when the sample was saved.
 */
function untilBatteriesFull(campaign: Campaign): void {
  for (let hours = 0; ; hours++) {
    const full = campaign
      .snapshot()
      .power.networks.every(
        (network) =>
          network.storedKilowattHours >=
          network.storageCapacityKilowattHours - 1e-6,
      );
    if (full) return;
    if (hours > 3 * 24) throw new Error("The battery banks never filled.");
    campaign.advance(60);
  }
}

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
    "%s loads with the Programme Grant of the time as its Funding, and an empty Launch manifest",
    (name) => {
      const state = loadSample(name).snapshot();

      // The Programme Grant as it was when format version 3 brought in
      // Funding, which the migration names, so that tuning the grant later
      // doesn't change what an old save loads with.
      expect(state.fundingMillionDollars).toBe(400);
      expect(state.launchManifest).toEqual({
        items: [],
        payloadMassKilograms: 0,
        costMillionDollars: 0,
        feeMillionDollars: catalogue.launch.feeMillionDollars,
        locked: false,
        funds: {
          fundingMillionDollars: 400,
          exportsMillionDollars: 0,
          exportsCounted: "none",
          totalMillionDollars: 400,
          overFunding: false,
        },
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
      expect(
        state.stockpile.components.find(
          (stock) => stock.componentId === "spare-component",
        ),
      ).toEqual({ componentId: "spare-component", count: 6 });
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
    expect(
      state.stockpile.components.find(
        (stock) => stock.componentId === "spare-component",
      ),
    ).toEqual({ componentId: "spare-component", count: 4 });
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
        subject: {
          kind: "machine",
          machineId: "regolith-printer-2",
          machineTypeId: "regolith-printer",
        },
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

describe("the sample saves from before bulk resources", () => {
  it.each([
    "version-1.moonbase",
    "version-7.moonbase",
    "version-13.moonbase",
    "version-14.moonbase",
  ])("%s loads with no Regolith, and no Machine digging", (name) => {
    const state = loadSample(name).snapshot();

    expect(state.bulkResources).toEqual(
      catalogue.bulkResources.map((resource) => ({
        resourceId: resource.id,
        kilograms: 0,
      })),
    );
    expect(
      state.machines.filter((machine) => machine.activity.kind === "digging"),
    ).toEqual([]);
  });
});

describe("the sample save of format version 15", () => {
  it("loads with the excavator digging Regolith beside the stockpile", () => {
    const state = loadSample("version-15.moonbase").snapshot();

    expect(
      state.machines.find((machine) => machine.machineTypeId === "excavator")
        ?.activity,
    ).toEqual({ kind: "digging" });
    expect(state.bulkResources[0]?.kilograms).toBeCloseTo(163.3, 1);
  });

  it("plays on from where it was saved, until the Regolith reaches its level", () => {
    const campaign = loadSample("version-15.moonbase");

    campaign.advance(24 * 60);

    expect(campaign.snapshot().bulkResources[0]?.kilograms).toBe(
      catalogue.digging.stockLevelKilograms,
    );
  });
});

describe("the sample saves from before the Rover", () => {
  const footprint = (typeId: string): number =>
    catalogue.structureTypes.find((type) => type.id === typeId)
      ?.footprintRadiusMetres ??
    catalogue.machineTypes.find((type) => type.id === typeId)
      ?.footprintRadiusMetres ??
    0;

  it.each(
    readdirSync(samples).filter(
      (name) =>
        name.endsWith(".moonbase") &&
        Number(/version-(\d+)/.exec(name)?.[1]) < 16,
    ),
  )(
    "%s loads with one Rover at full Condition, parked near the Lander clear of everything else",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.rovers).toHaveLength(1);
      const [rover] = state.rovers;
      expect(rover).toMatchObject({
        id: "rover-1",
        activity: { kind: "idle" },
        conditionPercent: 100,
      });
      if (rover === undefined) return;
      const clearOf = (position: GroundPosition, radius: number) =>
        Math.hypot(
          rover.position.x - position.x,
          rover.position.y - position.y,
        ) >=
        radius + catalogue.rover.footprintRadiusMetres;
      for (const footing of [
        ...state.structures,
        ...state.constructions,
        ...state.dismantlings,
      ]) {
        expect(
          clearOf(footing.position, footprint(footing.structureTypeId)),
        ).toBe(true);
      }
      for (const machine of state.machines) {
        expect(
          clearOf(machine.position, footprint(machine.machineTypeId)),
        ).toBe(true);
      }
      expect(Math.hypot(rover.position.x, rover.position.y)).toBeLessThan(15);
    },
  );
});

describe("the sample save of format version 16", () => {
  it("loads early in the first Night, with the Robot driving the Rover to park it beside the solar array", () => {
    const state = loadSample("version-16.moonbase").snapshot();

    expect(state.lunation.part).toBe("night");
    expect(state.robots[0]?.activity).toEqual({
      kind: "driving-rover",
      roverId: "rover-1",
      structureId: "structure-1",
    });
    expect(state.rovers[0]).toMatchObject({
      activity: { kind: "being-parked", structureId: "structure-1" },
      pluggedIn: false,
    });
  });

  it("plays on from where it was saved, until the Rover is plugged in and powered", () => {
    const campaign = loadSample("version-16.moonbase");

    campaign.advance(2 * 60);

    expect(campaign.snapshot().lunation.part).toBe("night");
    expect(campaign.snapshot().rovers[0]).toMatchObject({
      activity: { kind: "idle" },
      pluggedIn: true,
      powered: true,
    });
  });
});

describe("the sample saves from before Plants", () => {
  it.each(["version-1.moonbase", "version-14.moonbase", "version-16.moonbase"])(
    "%s loads with no metals or silicon, and none of the extraction plant's Components",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(
        state.bulkResources
          .filter((stock) => ["metals", "silicon"].includes(stock.resourceId))
          .map((stock) => stock.kilograms),
      ).toEqual([0, 0]);
      expect(
        state.stockpile.components.filter((stock) =>
          ["extraction-reactor", "oxygen-separator"].includes(
            stock.componentId,
          ),
        ),
      ).toEqual([
        { componentId: "extraction-reactor", count: 0 },
        { componentId: "oxygen-separator", count: 0 },
      ]);
    },
  );
});

describe("the sample save of format version 17", () => {
  const plantOf = (campaign: Campaign) =>
    campaign
      .snapshot()
      .structures.find(
        (structure) => structure.structureTypeId === "extraction-plant",
      );

  it("loads with the extraction plant turning Regolith into oxygen, metals and silicon", () => {
    const campaign = loadSample("version-17.moonbase");

    expect(plantOf(campaign)?.plant).toEqual({
      running: true,
      stoppedFor: undefined,
    });
    expect(
      campaign
        .snapshot()
        .bulkResources.map((s) => s.kilograms)
        .slice(0, 3),
    ).toEqual([
      expect.closeTo(462.3, 1),
      expect.closeTo(6.03, 1),
      expect.closeTo(4.02, 1),
    ]);
  });

  it("plays on from where it was saved, the plant making oxygen until Night stops it", () => {
    const campaign = loadSample("version-17.moonbase");
    const oxygen = () => campaign.snapshot().lifeSupport[0]?.kilograms ?? 0;
    const before = oxygen();

    campaign.advance(campaign.snapshot().lunation.minutesRemaining + 60);

    expect(oxygen()).toBeGreaterThan(before);
    expect(plantOf(campaign)?.plant).toMatchObject({
      running: false,
      stoppedFor: { reason: "night" },
    });
  });
});

describe("the sample saves from before Expeditions", () => {
  it.each(["version-1.moonbase", "version-16.moonbase", "version-17.moonbase"])(
    "%s loads with no Expedition under way, and no water ice",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.expedition).toBeUndefined();
      expect(
        state.bulkResources.find((stock) => stock.resourceId === "water-ice"),
      ).toEqual({ resourceId: "water-ice", kilograms: 0 });
    },
  );
});

describe("the sample save of format version 18", () => {
  it("loads with the Robot and the Rover away on an Expedition", () => {
    const state = loadSample("version-18.moonbase").snapshot();

    expect(state.expedition).toMatchObject({
      stage: "away",
      returnsAtMinute: 4761,
    });
    expect(state.robots[0]?.activity).toEqual({ kind: "on-expedition" });
    expect(state.rovers[0]?.activity).toEqual({ kind: "on-expedition" });
  });

  it("plays on from where it was saved, until the Expedition is back with its water ice", () => {
    const campaign = loadSample("version-18.moonbase");
    const kinds: string[] = [];

    for (let hours = 0; campaign.snapshot().expedition !== undefined; hours++) {
      if (hours > 4 * 24) throw new Error("The Expedition never came back.");
      kinds.push(...campaign.advance(60).map((event) => event.kind));
    }

    expect(kinds).toContain("expedition-returned");
    expect(
      campaign
        .snapshot()
        .bulkResources.find((stock) => stock.resourceId === "water-ice")
        ?.kilograms,
    ).toBe(catalogue.expeditions.kilograms);
  });
});

describe("the sample saves from before the water-processing plant", () => {
  it.each(["version-1.moonbase", "version-17.moonbase", "version-18.moonbase"])(
    "%s loads with none of the water-processing plant's Components",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(
        state.stockpile.components.filter((stock) =>
          ["ice-melter", "water-purifier"].includes(stock.componentId),
        ),
      ).toEqual([
        { componentId: "ice-melter", count: 0 },
        { componentId: "water-purifier", count: 0 },
      ]);
    },
  );
});

describe("the sample save of format version 19", () => {
  const iceOf = (campaign: Campaign) =>
    campaign
      .snapshot()
      .bulkResources.find((stock) => stock.resourceId === "water-ice")
      ?.kilograms ?? Number.NaN;

  it("loads with the water-processing plant turning an Expedition's water ice into water", () => {
    const campaign = loadSample("version-19.moonbase");

    expect(
      campaign
        .snapshot()
        .structures.find(
          (structure) => structure.structureTypeId === "water-processing-plant",
        )?.plant,
    ).toEqual({ running: true, stoppedFor: undefined });
    expect(iceOf(campaign)).toBeCloseTo(196.2, 1);
  });

  it("plays on from where it was saved, the ice falling as the water rises", () => {
    const campaign = loadSample("version-19.moonbase");
    const waterOf = () => campaign.snapshot().lifeSupport[1]?.kilograms ?? 0;
    const ice = iceOf(campaign);
    const water = waterOf();

    campaign.advance(10 * 60);

    expect(iceOf(campaign)).toBeLessThan(ice);
    expect(waterOf()).toBeGreaterThan(water);
  });
});

describe("the sample saves from before self-sufficiency", () => {
  it.each(["version-1.moonbase", "version-17.moonbase", "version-19.moonbase"])(
    "%s loads with no records kept yet, and the base self-sufficient in nothing",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.selfSufficiency).toEqual(
        catalogue.lifeSupportStocks.map((stock) => ({
          stockId: stock.id,
          selfSufficient: false,
          coveredShare: undefined,
          windowComplete: false,
        })),
      );
    },
  );
});

describe("the sample save of format version 20", () => {
  it("loads with two Earth Days of records of the water the plant has made", () => {
    const document = JSON.parse(
      readFileSync(new URL("version-20.moonbase", samples), "utf8"),
    ) as {
      state: {
        selfSufficiency: {
          stockId: string;
          records: { producedKilograms: number }[];
        }[];
      };
    };

    expect(
      document.state.selfSufficiency.map((history) => [
        history.stockId,
        history.records.length,
      ]),
    ).toEqual([
      ["oxygen", 8],
      ["water", 8],
    ]);
    const state = loadSample("version-20.moonbase").snapshot();
    expect(
      state.selfSufficiency.map((judged) => judged.selfSufficient),
    ).toEqual([false, false]);
  });

  it("plays on from where it was saved, never self-sufficient while the Mission Director lives aboard the Lander", () => {
    const campaign = loadSample("version-20.moonbase");

    const kinds = campaign.advance(5 * 24 * 60).map((event) => event.kind);

    expect(kinds).not.toContain("self-sufficiency-gained");
    expect(campaign.snapshot().selfSufficiency[1]).toMatchObject({
      stockId: "water",
      selfSufficient: false,
    });
  });
});

describe("the sample saves from before the vacuum fabrication plant", () => {
  it.each(["version-1.moonbase", "version-17.moonbase", "version-20.moonbase"])(
    "%s loads with no wafers, straight after the silicon, and none of the vacuum fabrication plant's Components",
    (name) => {
      const state = loadSample(name).snapshot();

      const ids = state.bulkResources.map((stock) => stock.resourceId);
      expect(ids.indexOf("wafers")).toBe(ids.indexOf("silicon") + 1);
      expect(
        state.bulkResources.find((stock) => stock.resourceId === "wafers")
          ?.kilograms,
      ).toBe(0);
      expect(
        state.stockpile.components.filter((stock) =>
          ["crystal-furnace", "wafer-saw"].includes(stock.componentId),
        ),
      ).toEqual([
        { componentId: "crystal-furnace", count: 0 },
        { componentId: "wafer-saw", count: 0 },
      ]);
    },
  );
});

describe("the sample save of format version 21", () => {
  const bulkOf = (campaign: Campaign, resourceId: string) =>
    campaign
      .snapshot()
      .bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? Number.NaN;

  it("loads with an extraction plant and a vacuum fabrication plant turning Regolith into wafers", () => {
    const campaign = loadSample("version-21.moonbase");

    expect(
      campaign
        .snapshot()
        .structures.filter((structure) => structure.plant !== undefined)
        .map((structure) => [structure.structureTypeId, structure.plant]),
    ).toEqual([
      ["extraction-plant", { running: true, stoppedFor: undefined }],
      ["vacuum-fabrication-plant", { running: true, stoppedFor: undefined }],
    ]);
    expect(bulkOf(campaign, "wafers")).toBeCloseTo(3.03, 1);
  });

  it("plays on from where it was saved, the wafers rising while the silicon keeps up once the extraction plant runs for metals and silicon", () => {
    const campaign = loadSample("version-21.moonbase");
    const wafers = bulkOf(campaign, "wafers");
    // It loads running the default recipe, for oxygen, which makes too
    // little silicon to keep the vacuum fabrication plant going.
    const extractionPlant = campaign
      .snapshot()
      .structures.find(
        (structure) => structure.structureTypeId === "extraction-plant",
      );
    expect(
      campaign.setPlantRecipe(extractionPlant?.id ?? "", "metals-and-silicon"),
    ).toEqual({ ok: true });

    campaign.advance(10 * 60);

    expect(bulkOf(campaign, "wafers")).toBeGreaterThan(wafers);
    expect(bulkOf(campaign, "silicon")).toBeGreaterThan(0);
  });
});

describe("the sample saves from before Exports", () => {
  it.each(["version-1.moonbase", "version-17.moonbase", "version-21.moonbase"])(
    "%s loads with no Exports to load and none aboard the Lander",
    (name) => {
      expect(loadSample(name).snapshot().exports).toEqual({
        toLoad: [],
        massKilograms: 0,
        valueMillionDollars: 0,
        aboard: [],
        valueAboardMillionDollars: 0,
      });
    },
  );
});

describe("the sample save of format version 22", () => {
  const waferPrice =
    catalogue.exports.find((sold) => sold.resourceId === "wafers")
      ?.priceMillionDollarsPerKilogram ?? Number.NaN;

  it("loads with the Mission Director in the Habitat, wafers in stock and 30 kg of them to load onto the Lander", () => {
    const state = loadSample("version-22.moonbase").snapshot();

    expect(state.missionDirector).toMatchObject({ residence: "habitat" });
    expect(state.lander.state).toBe("landed-free");
    expect(
      state.bulkResources.find((stock) => stock.resourceId === "wafers")
        ?.kilograms,
    ).toBe(46.5);
    expect(state.exports).toEqual({
      toLoad: [{ resourceId: "wafers", kilograms: 30 }],
      massKilograms: 30,
      valueMillionDollars: 30 * waferPrice,
      aboard: [],
      valueAboardMillionDollars: 0,
    });
  });

  it("plays on: the Lander takes the wafers aboard as it takes off, and sells them as it reaches Earth", () => {
    const campaign = loadSample("version-22.moonbase");
    const funding = campaign.snapshot().fundingMillionDollars;
    expect(campaign.sendLander()).toEqual({ ok: true });

    const events: GameEvent[] = [];
    for (
      let skips = 0;
      !events.some((event) => event.kind === "lander-reached-earth");
      skips++
    ) {
      if (skips > 100) throw new Error("The Lander never reached Earth.");
      events.push(...campaign.advanceToNextEvent());
    }

    const wafers = [{ resourceId: "wafers", kilograms: 30 }];
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "lander-took-off", exports: wafers }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        kind: "lander-reached-earth",
        sold: wafers,
        earnedMillionDollars: 30 * waferPrice,
      }),
    );
    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    expect(state.fundingMillionDollars).toBe(funding + 30 * waferPrice);
    expect(
      state.bulkResources.find((stock) => stock.resourceId === "wafers")
        ?.kilograms,
    ).toBe(16.5);
  });
});

describe("the sample saves from before the circuit board plant", () => {
  it.each(["version-1.moonbase", "version-17.moonbase", "version-22.moonbase"])(
    "%s loads with no circuit boards, straight after the wafers, and none of the circuit board plant's Components",
    (name) => {
      const state = loadSample(name).snapshot();

      const ids = state.bulkResources.map((stock) => stock.resourceId);
      expect(ids.indexOf("circuit-boards")).toBe(ids.indexOf("wafers") + 1);
      expect(
        state.bulkResources.find(
          (stock) => stock.resourceId === "circuit-boards",
        )?.kilograms,
      ).toBe(0);
      expect(
        state.stockpile.components.filter((stock) =>
          ["circuit-etcher", "reflow-oven"].includes(stock.componentId),
        ),
      ).toEqual([
        { componentId: "circuit-etcher", count: 0 },
        { componentId: "reflow-oven", count: 0 },
      ]);
    },
  );
});

describe("the sample save of format version 23", () => {
  const bulkOf = (campaign: Campaign, resourceId: string) =>
    campaign
      .snapshot()
      .bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? Number.NaN;

  it("loads with a circuit board plant turning wafers and metals into circuit boards, and some of each to load onto the Lander", () => {
    const campaign = loadSample("version-23.moonbase");

    expect(
      campaign
        .snapshot()
        .structures.filter((structure) => structure.plant !== undefined)
        .map((structure) => [structure.structureTypeId, structure.plant]),
    ).toEqual([
      ["circuit-board-plant", { running: true, stoppedFor: undefined }],
    ]);
    expect(bulkOf(campaign, "circuit-boards")).toBeCloseTo(4.35, 1);
    expect(campaign.snapshot().exports.toLoad).toEqual([
      { resourceId: "wafers", kilograms: 10 },
      { resourceId: "circuit-boards", kilograms: 3 },
    ]);
  });

  it("plays on from where it was saved, the circuit boards rising as the wafers and metals fall", () => {
    const campaign = loadSample("version-23.moonbase");
    const before = Object.fromEntries(
      ["wafers", "metals", "circuit-boards"].map((id) => [
        id,
        bulkOf(campaign, id),
      ]),
    );

    campaign.advance(10 * 60);

    expect(bulkOf(campaign, "circuit-boards")).toBeGreaterThan(
      before["circuit-boards"] ?? Infinity,
    );
    expect(bulkOf(campaign, "wafers")).toBeLessThan(
      before["wafers"] ?? -Infinity,
    );
    expect(bulkOf(campaign, "metals")).toBeLessThan(
      before["metals"] ?? -Infinity,
    );
  });
});

describe("the sample saves from before the Robot loaded Exports", () => {
  it.each(["version-1.moonbase", "version-7.moonbase", "version-23.moonbase"])(
    "%s loads with no loading of Exports onto the Lander",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.exportLoading).toBeUndefined();
      expect(state.robots.map((robot) => robot.carryingExports)).toEqual(
        state.robots.map(() => []),
      );
    },
  );
});

describe("the sample save of format version 24", () => {
  const wafers = [{ resourceId: "wafers", kilograms: 30 }];
  const wafersInStock = (campaign: Campaign) =>
    campaign
      .snapshot()
      .bulkResources.find((stock) => stock.resourceId === "wafers")?.kilograms;

  it("loads with the Lander on the landing pad, and the Robot carrying wafers from the stockpile to it", () => {
    const state = loadSample("version-24.moonbase").snapshot();

    expect(state.lander).toMatchObject({
      state: "landed-free",
      position: { x: 40, y: 25 },
      landingPadId: "structure-4",
    });
    expect(state.exportLoading).toEqual({
      landingPadId: "structure-4",
      collected: true,
      stageProgress: 0,
      exports: wafers,
    });
    expect(state.exports).toMatchObject({ toLoad: wafers, aboard: [] });
    expect(state.robots[0]).toMatchObject({
      activity: { kind: "walking", purpose: "exports", destination: "lander" },
      carryingExports: wafers,
    });
  });

  it("plays on from where it was saved, until the wafers are aboard and the Lander can be sent", () => {
    const campaign = loadSample("version-24.moonbase");
    const before = wafersInStock(campaign);
    expect(campaign.sendLander()).toMatchObject({
      ok: false,
      reason: "exports-loading",
    });
    const kinds: string[] = [];

    for (
      let hours = 0;
      campaign.snapshot().exportLoading !== undefined;
      hours++
    ) {
      if (hours > 24) throw new Error("The wafers never went aboard.");
      kinds.push(...campaign.advance(60).map((event) => event.kind));
    }

    expect(kinds).toContain("lander-loaded");
    expect(campaign.snapshot().ended).toBeUndefined();
    expect(campaign.snapshot().exports.aboard).toEqual(wafers);
    expect(wafersInStock(campaign)).toBe(before);
    expect(campaign.sendLander()).toEqual({ ok: true });
  });
});

describe("the sample saves from before a Plant could choose its recipe", () => {
  it.each([
    "version-17.moonbase",
    "version-19.moonbase",
    "version-21.moonbase",
    "version-23.moonbase",
  ])(
    "%s loads with each Plant running its default recipe, and no other Structure running any",
    (name) => {
      const { structures } = loadSample(name).snapshot();

      expect(
        structures.some((structure) => structure.plant !== undefined),
      ).toBe(true);
      for (const structure of structures) {
        const recipes = catalogue.structureTypes.find(
          (type) => type.id === structure.structureTypeId,
        )?.recipes;
        expect(structure.recipeId).toBe(recipes?.[0]?.id);
      }
    },
  );
});

describe("the sample save of format version 25", () => {
  const plantOf = (campaign: Campaign) => {
    const plant = campaign
      .snapshot()
      .structures.find(
        (structure) => structure.structureTypeId === "extraction-plant",
      );
    if (plant === undefined) throw new Error("expected an extraction plant");
    return plant;
  };
  const bulkOf = (campaign: Campaign, resourceId: string) =>
    campaign
      .snapshot()
      .bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? Number.NaN;
  const oxygenForecast = (campaign: Campaign) =>
    campaign
      .forecasts()
      .lifeSupport.find((forecast) => forecast.stockId === "oxygen");

  it("loads with the Mission Director in the Habitat, and the extraction plant running for metals and silicon", () => {
    const campaign = loadSample("version-25.moonbase");

    expect(campaign.snapshot().missionDirector).toMatchObject({
      residence: "habitat",
    });
    expect(plantOf(campaign)).toMatchObject({
      recipeId: "metals-and-silicon",
      plant: { running: true, stoppedFor: undefined },
    });
    expect(bulkOf(campaign, "silicon")).toBeCloseTo(1.6, 1);
    expect(oxygenForecast(campaign)?.minutesUntilEmpty).toBeDefined();
  });

  it("plays on from where it was saved, the silicon rising and the oxygen falling, until the plant is switched back to oxygen", () => {
    const campaign = loadSample("version-25.moonbase");
    untilBatteriesFull(campaign);
    const silicon = bulkOf(campaign, "silicon");

    campaign.advance(10 * 60);

    expect(bulkOf(campaign, "silicon")).toBeGreaterThan(silicon + 3);
    expect(oxygenForecast(campaign)?.kilogramsPerEarthDay).toBeLessThan(0);
    expect(campaign.setPlantRecipe(plantOf(campaign).id, "oxygen")).toEqual({
      ok: true,
    });
    campaign.advance(60);
    expect(oxygenForecast(campaign)?.kilogramsPerEarthDay).toBeGreaterThan(0);
    expect(campaign.snapshot().ended).toBeUndefined();
  });
});

describe("the sample saves from before Research Tasks", () => {
  it.each([
    "version-1.moonbase",
    "version-1-ended.moonbase",
    "version-18.moonbase",
    "version-25.moonbase",
  ])(
    "%s loads with no Science, no Research Task running and none completed",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.science).toBe(0);
      expect(state.researchTask).toBeUndefined();
      expect(state.completedResearchTaskIds).toEqual([]);
    },
  );

  it("plays on from where it was saved, a Research Task started then completing", () => {
    const campaign = loadSample("version-25.moonbase");
    const [task] = catalogue.researchTasks;
    if (task === undefined) throw new Error("expected a Research Task");

    expect(campaign.startResearchTask(task.id)).toEqual({ ok: true });
    const kinds = campaign
      .advance(task.lengthHours * 60)
      .map((event) => event.kind);

    expect(kinds).toContain("research-task-completed");
    expect(campaign.snapshot().science).toBe(task.science);
  });
});

describe("the sample save of format version 26", () => {
  // Saved 1735 game-minutes in, 1175 of them into Seismic monitoring. Its
  // length and the Science it pays come from the data catalogue as it is.
  const seismic = catalogue.researchTasks.find(
    (task) => task.id === "seismic-monitoring",
  );
  if (seismic === undefined) throw new Error("expected Seismic monitoring");
  const minutesLeft = seismic.lengthHours * 60 - 1175;

  it("loads with Seismic monitoring running, a Regolith sample analysis completed, and the Robot busy with a light mast", () => {
    const state = loadSample("version-26.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 2, hour: 4, minute: 55 });
    expect(state.science).toBe(5);
    expect(state.completedResearchTaskIds).toEqual([
      "regolith-sample-analysis",
    ]);
    expect(state.researchTask).toMatchObject({
      researchTaskId: "seismic-monitoring",
      minutesLeft,
    });
    expect(state.constructions.map((c) => c.structureTypeId)).toEqual([
      "light-mast",
    ]);
    expect(state.robots[0]?.activity.kind).not.toBe("idle");
  });

  it("plays on from where it was saved, until Seismic monitoring completes and pays its Science", () => {
    const campaign = loadSample("version-26.moonbase");
    expect(
      campaign.startResearchTask("regolith-sample-analysis"),
    ).toMatchObject({ ok: false, reason: "already-completed" });

    const completed = campaign
      .advance(minutesLeft)
      .filter((event) => event.kind === "research-task-completed");

    expect(completed).toEqual([
      {
        kind: "research-task-completed",
        atMinute: 1735 + minutesLeft,
        researchTaskId: "seismic-monitoring",
        science: seismic.science,
      },
    ]);
    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    expect(state.science).toBe(5 + seismic.science);
    expect(state.researchTask).toBeUndefined();
    expect(state.completedResearchTaskIds).toEqual([
      "regolith-sample-analysis",
      "seismic-monitoring",
    ]);
  });
});

describe("the sample saves from before the Tech Tree", () => {
  // The starting Designs when format version 27 came in.
  const startingDesignIds = [
    "solar-arrays",
    "battery-banks",
    "light-masts",
    "maintenance-spares",
    "regolith-shielding",
    "inflatable-habitat",
    "life-support-resupply",
    "water-processing",
    "regolith-extraction",
    "vacuum-fabrication",
    "circuit-board-fabrication",
    "landing-pads",
  ];

  it.each([
    "version-1.moonbase",
    "version-1-ended.moonbase",
    "version-18.moonbase",
    "version-25.moonbase",
    "version-26.moonbase",
  ])("%s loads with the starting Designs unlocked, and no others", (name) => {
    expect(loadSample(name).snapshot().unlockedDesignIds).toEqual(
      startingDesignIds,
    );
  });

  it("plays on from where it was saved, until Seismic monitoring completes and its Science unlocks a Design", () => {
    const campaign = loadSample("version-26.moonbase");
    const design = catalogue.designs.find(
      (entry) => entry.id === "large-battery-banks",
    );
    if (design === undefined) throw new Error("expected Large battery banks");

    campaign.advance(3 * 24 * 60);

    expect(campaign.snapshot().researchTask).toBeUndefined();
    expect(campaign.unlockDesign(design.id)).toMatchObject({ ok: true });
    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    expect(state.unlockedDesignIds).toEqual([...startingDesignIds, design.id]);
  });
});

describe("the sample save of format version 27", () => {
  // Saved 6000 game-minutes in, after four Research Tasks paid 45 Science
  // and Regolith sintering was unlocked for 30, with the Sintered block
  // testing it opened up 600 game-minutes in. Its length and the Science it
  // pays come from the data catalogue as it is.
  const sintered = catalogue.researchTasks.find(
    (task) => task.id === "sintered-block-testing",
  );
  if (sintered === undefined)
    throw new Error("expected Sintered block testing");
  const minutesLeft = sintered.lengthHours * 60 - 600;

  it("loads with Regolith sintering unlocked, 15 Science left, and Sintered block testing running", () => {
    const state = loadSample("version-27.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 5, hour: 4, minute: 0 });
    expect(state.science).toBe(15);
    expect(state.unlockedDesignIds).toContain("regolith-sintering");
    expect(state.unlockedDesignIds).not.toContain("large-battery-banks");
    expect(state.researchTask).toMatchObject({
      researchTaskId: "sintered-block-testing",
      minutesLeft,
    });
    expect(state.completedResearchTaskIds).toEqual([
      "regolith-sample-analysis",
      "ice-volatiles-assay",
      "radiation-environment-survey",
      "dust-levitation-study",
    ]);
  });

  it("plays on from where it was saved, Sintered block testing completing and its Science unlocking another Design", () => {
    const campaign = loadSample("version-27.moonbase");
    expect(campaign.unlockDesign("regolith-sintering")).toMatchObject({
      ok: false,
      reason: "already-unlocked",
    });

    const completed = campaign
      .advance(minutesLeft)
      .filter((event) => event.kind === "research-task-completed");

    expect(completed).toEqual([
      {
        kind: "research-task-completed",
        atMinute: 6000 + minutesLeft,
        researchTaskId: "sintered-block-testing",
        science: sintered.science,
      },
    ]);
    expect(campaign.snapshot().science).toBe(15 + sintered.science);
    expect(campaign.unlockDesign("large-battery-banks")).toMatchObject({
      ok: true,
    });
    expect(campaign.snapshot().ended).toBeUndefined();
  });
});

describe("the sample saves from before the large battery bank", () => {
  it.each(["version-1.moonbase", "version-22.moonbase", "version-27.moonbase"])(
    "%s loads with none of the large battery bank's Components, counted after the earlier ones in the base's stock",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.stockpile.components.map((s) => s.componentId)).toEqual(
        catalogue.componentTypes.map((type) => type.id),
      );
      expect(
        state.stockpile.components.filter((stock) =>
          stock.componentId.startsWith("large-battery-"),
        ),
      ).toEqual([
        { componentId: "large-battery-module", count: 0 },
        { componentId: "large-battery-cabinet", count: 0 },
      ]);
    },
  );
});

describe("the sample save of format version 28", () => {
  // Saved 3352 game-minutes in, after three Research Tasks paid 25 Science
  // and Large battery banks was unlocked for all of it, with a large
  // battery bank an hour into its Assembly beside a solar array.
  const storageOf = (structureTypeId: string) =>
    catalogue.structureTypes.find((type) => type.id === structureTypeId)?.power
      .storageKilowattHours ?? Number.NaN;

  it("loads with Large battery banks unlocked, no Science left, and a large battery bank being assembled from its Components", () => {
    const state = loadSample("version-28.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 3, hour: 7, minute: 52 });
    expect(state.science).toBe(0);
    expect(state.unlockedDesignIds).toContain("large-battery-banks");
    expect(state.constructions).toEqual([
      expect.objectContaining({
        structureTypeId: "large-battery-bank",
        stage: "assembly",
        componentsTaken: true,
      }),
    ]);
    expect(state.structures.map((s) => s.structureTypeId)).toEqual([
      "solar-array",
    ]);
  });

  it("plays on from where it was saved, the large battery bank being commissioned and storing more than a battery bank can", () => {
    const campaign = loadSample("version-28.moonbase");
    expect(campaign.unlockDesign("large-battery-banks")).toMatchObject({
      ok: false,
      reason: "already-unlocked",
    });

    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 2 * 24) throw new Error("It was never commissioned.");
      campaign.advance(60);
    }
    campaign.advance(24 * 60);

    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    const network = state.power.networks.find((candidate) =>
      candidate.structureIds.includes("structure-2"),
    );
    expect(network?.storageCapacityKilowattHours).toBe(
      storageOf("large-battery-bank"),
    );
    expect(network?.storedKilowattHours).toBeGreaterThan(
      storageOf("battery-bank"),
    );
  });
});

describe("the sample saves from before a Launch could bring a Robot", () => {
  it.each(["version-1.moonbase", "version-12.moonbase", "version-28.moonbase"])(
    "%s loads with no Robot arriving, each at work as before",
    (name) => {
      const campaign = loadSample(name);
      const before = campaign.snapshot().robots.map((robot) => robot.id);

      campaign.advance(1);

      const { robots } = campaign.snapshot();
      expect(robots.map((robot) => robot.id)).toEqual(before);
      for (const robot of robots) {
        expect(["climbing-down", "walking-to-stockpile"]).not.toContain(
          robot.activity.kind,
        );
      }
    },
  );
});

describe("the sample save of format version 29", () => {
  // Saved 39626 game-minutes in, 25 game-minutes after the Lander landed
  // with a Robot the Robots Design let it bring, two light masts planned
  // as it landed. The Mission Director waited out the first Night aboard
  // the Lander, then moved into the Habitat so that it could fly.
  it("loads with the Robots Design unlocked and the second Robot walking from the Lander to the stockpile, as the first works on a light mast", () => {
    const state = loadSample("version-29.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 28, hour: 12, minute: 26 });
    expect(state.unlockedDesignIds).toContain("robots");
    expect(state.lander).toMatchObject({ state: "landed-free", cargo: [] });
    expect(state.robots).toEqual([
      expect.objectContaining({
        id: "robot-1",
        activity: expect.objectContaining({
          structureId: "structure-4",
        }) as unknown,
      }),
      expect.objectContaining({
        id: "robot-2",
        activity: { kind: "walking-to-stockpile" },
        carrying: [],
      }),
    ]);
    expect(state.constructions.map((c) => c.structureTypeId)).toEqual([
      "light-mast",
      "light-mast",
    ]);
  });

  it("plays on from where it was saved, the second Robot arriving at the stockpile and building a light mast alongside the first", () => {
    const campaign = loadSample("version-29.moonbase");

    const events: GameEvent[] = [];
    const secondRobotOn = new Set<string>();
    for (let minutes = 0; campaign.snapshot().constructions.length > 0;) {
      if (minutes > 3 * 24 * 60) throw new Error("They were never built.");
      events.push(...campaign.advance(1));
      minutes += 1;
      const activity = campaign.snapshot().robots[1]?.activity;
      if (activity !== undefined && "structureId" in activity) {
        secondRobotOn.add(activity.structureId);
      }
    }

    expect(events).toContainEqual(
      expect.objectContaining({ kind: "robot-arrived", robotId: "robot-2" }),
    );
    expect(
      [...secondRobotOn].some((id) =>
        ["structure-4", "structure-5"].includes(id),
      ),
    ).toBe(true);
    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    expect(
      state.structures.filter((s) => s.structureTypeId === "light-mast"),
    ).toHaveLength(2);
  });
});

describe("the sample saves from before the Protection Designs", () => {
  it.each(["version-1.moonbase", "version-22.moonbase", "version-29.moonbase"])(
    "%s loads with none of the hardened Structures' own Components, counted after the earlier ones in the base's stock",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.stockpile.components.map((s) => s.componentId)).toEqual(
        catalogue.componentTypes.map((type) => type.id),
      );
      expect(
        state.stockpile.components.filter((stock) =>
          [
            "sealed-array-mast",
            "screened-solar-panel",
            "whipple-cabinet",
            "armoured-habitat-envelope",
          ].includes(stock.componentId),
        ),
      ).toEqual([
        { componentId: "sealed-array-mast", count: 0 },
        { componentId: "screened-solar-panel", count: 0 },
        { componentId: "whipple-cabinet", count: 0 },
        { componentId: "armoured-habitat-envelope", count: 0 },
      ]);
    },
  );
});

describe("the sample save of format version 30", () => {
  // Saved 40289 game-minutes in, an hour into the Assembly of a
  // dust-sealed solar array, built from two solar panels and a sealed
  // array mast a Launch brought once Dust-sealed solar arrays was
  // unlocked. The Mission Director moved into the Habitat after the first
  // Night, so that the Lander could fly.
  it("loads with Dust-sealed solar arrays unlocked and a dust-sealed solar array being assembled beside the first solar array", () => {
    const state = loadSample("version-30.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 28, hour: 23, minute: 29 });
    expect(state.science).toBe(5);
    expect(state.unlockedDesignIds).toContain("dust-sealed-solar-arrays");
    expect(state.constructions).toEqual([
      expect.objectContaining({
        id: "structure-4",
        structureTypeId: "dust-sealed-solar-array",
        stage: "assembly",
        componentsTaken: true,
      }),
    ]);
    expect(state.structures.map((s) => s.structureTypeId)).toEqual([
      "solar-array",
      "battery-bank",
      "habitat",
    ]);
  });

  it("plays on from where it was saved, the dust-sealed solar array generating like the first and wearing down by Dust more slowly", () => {
    const campaign = loadSample("version-30.moonbase");
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 2 * 24) throw new Error("It was never commissioned.");
      campaign.advance(60);
    }
    const condition = (id: string) =>
      campaign.snapshot().structures.find((s) => s.id === id)
        ?.conditionPercent ?? Number.NaN;
    const before = [condition("structure-1"), condition("structure-4")];

    campaign.advance(24 * 60);

    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    expect(state.lunation.part).toBe("daylight");
    expect(state.structures.find((s) => s.id === "structure-4")).toMatchObject({
      structureTypeId: "dust-sealed-solar-array",
      powered: true,
    });
    const lost = [
      (before[0] ?? 0) - condition("structure-1"),
      (before[1] ?? 0) - condition("structure-4"),
    ];
    expect(lost[0]).toBeCloseTo(24 * 0.05);
    expect(lost[1]).toBeCloseTo(24 * 0.02);
  });
});

describe("the sample saves from before the Power and Construction Designs", () => {
  it.each(["version-1.moonbase", "version-22.moonbase", "version-30.moonbase"])(
    "%s loads with none of the new Power and Construction Structures' own Components, counted after the earlier ones in the base's stock",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.stockpile.components.map((s) => s.componentId)).toEqual(
        catalogue.componentTypes.map((type) => type.id),
      );
      expect(
        state.stockpile.components.filter((stock) =>
          [
            "thin-film-solar-panel",
            "tall-mast-pole",
            "prefabricated-array-pack",
          ].includes(stock.componentId),
        ),
      ).toEqual([
        { componentId: "thin-film-solar-panel", count: 0 },
        { componentId: "tall-mast-pole", count: 0 },
        { componentId: "prefabricated-array-pack", count: 0 },
      ]);
    },
  );
});

describe("the sample save of format version 31", () => {
  // Saved 41420 game-minutes in, half an hour into the Assembly of a
  // prefabricated solar array from one of two prefabricated array packs a
  // Launch brought once Prefabricated solar arrays was unlocked. The
  // Lander brought them down onto a sintered landing pad the regolith
  // printer laid once Regolith sintering was unlocked, after printing
  // Regolith shielding over the Habitat.
  it("loads with Prefabricated solar arrays and Regolith sintering unlocked, the Lander on a sintered landing pad, and a prefabricated solar array being assembled", () => {
    const state = loadSample("version-31.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 29, hour: 18, minute: 20 });
    expect(state.science).toBe(25);
    expect(state.unlockedDesignIds).toEqual(
      expect.arrayContaining([
        "prefabricated-solar-arrays",
        "regolith-sintering",
      ]),
    );
    expect(state.structures.map((s) => s.structureTypeId)).toEqual([
      "solar-array",
      "battery-bank",
      "habitat",
      "regolith-shielding",
      "sintered-landing-pad",
    ]);
    expect(state.lander).toMatchObject({
      state: "landed-free",
      position: { x: -40, y: 30 },
      landingPadId: "structure-5",
    });
    expect(state.constructions).toEqual([
      expect.objectContaining({
        id: "structure-6",
        structureTypeId: "prefabricated-solar-array",
        stage: "assembly",
        componentsTaken: true,
      }),
    ]);
    expect(
      state.stockpile.components.find(
        (stock) => stock.componentId === "prefabricated-array-pack",
      ),
    ).toEqual({ componentId: "prefabricated-array-pack", count: 1 });
  });

  it("plays on from where it was saved, the prefabricated solar array commissioned within the hour, powered and cabled to the first solar array", () => {
    const campaign = loadSample("version-31.moonbase");
    for (let minutes = 0; campaign.snapshot().constructions.length > 0;) {
      if (minutes > 60) throw new Error("It was never commissioned.");
      campaign.advance(1);
      minutes += 1;
    }

    campaign.advance(24 * 60);

    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    expect(state.lunation.part).toBe("daylight");
    expect(state.structures.find((s) => s.id === "structure-6")).toMatchObject({
      structureTypeId: "prefabricated-solar-array",
      powered: true,
    });
    expect(
      state.power.networks.find((network) =>
        network.structureIds.includes("structure-6"),
      )?.structureIds,
    ).toContain("structure-1");
  });
});

describe("the sample saves from before the Life Support, Industry and Mobility Designs", () => {
  it.each(["version-1.moonbase", "version-22.moonbase", "version-31.moonbase"])(
    "%s loads with none of the new Life Support, Industry and Mobility Structures' own Components, counted after the earlier ones in the base's stock",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.stockpile.components.map((s) => s.componentId)).toEqual(
        catalogue.componentTypes.map((type) => type.id),
      );
      expect(
        state.stockpile.components.filter((stock) =>
          [
            "electrolyser-stack",
            "molten-regolith-cell",
            "board-assembly-line",
            "landing-floodlight",
          ].includes(stock.componentId),
        ),
      ).toEqual([
        { componentId: "electrolyser-stack", count: 0 },
        { componentId: "molten-regolith-cell", count: 0 },
        { componentId: "board-assembly-line", count: 0 },
        { componentId: "landing-floodlight", count: 0 },
      ]);
    },
  );
});

describe("the sample save of format version 32", () => {
  // Saved 40297 game-minutes in, an hour into the Assembly of an
  // electrolysis plant from an ice melter and one of two electrolyser
  // stacks a Launch brought once Water electrolysis was unlocked, with the
  // 200 kg of water ice an Expedition brought back in stock.
  it("loads with Water electrolysis unlocked, an electrolysis plant being assembled, an electrolyser stack in stock and an Expedition's water ice", () => {
    const state = loadSample("version-32.moonbase").snapshot();

    expect(state.clock).toMatchObject({ earthDay: 28, hour: 23, minute: 37 });
    expect(state.unlockedDesignIds).toContain("water-electrolysis");
    expect(state.missionDirector).toMatchObject({ residence: "habitat" });
    expect(state.structures.map((s) => s.structureTypeId)).toEqual([
      "solar-array",
      "battery-bank",
      "habitat",
    ]);
    expect(state.constructions).toEqual([
      expect.objectContaining({
        id: "structure-4",
        structureTypeId: "electrolysis-plant",
        stage: "assembly",
        componentsTaken: true,
      }),
    ]);
    expect(
      state.stockpile.components.find(
        (stock) => stock.componentId === "electrolyser-stack",
      ),
    ).toEqual({ componentId: "electrolyser-stack", count: 1 });
    expect(
      state.bulkResources.find((stock) => stock.resourceId === "water-ice"),
    ).toEqual({ resourceId: "water-ice", kilograms: 200 });
  });

  it("plays on from where it was saved, the electrolysis plant commissioned within a day and turning the water ice into oxygen", () => {
    const campaign = loadSample("version-32.moonbase");
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 24) throw new Error("It was never commissioned.");
      campaign.advance(60);
    }
    untilBatteriesFull(campaign);
    const oxygen = (state: Snapshot) =>
      state.lifeSupport.find((stock) => stock.stockId === "oxygen")
        ?.kilograms ?? Number.NaN;
    const ice = (state: Snapshot) =>
      state.bulkResources.find((stock) => stock.resourceId === "water-ice")
        ?.kilograms ?? Number.NaN;
    const before = campaign.snapshot();

    campaign.advance(12 * 60);

    const after = campaign.snapshot();
    expect(after.ended).toBeUndefined();
    expect(after.lunation.part).toBe("daylight");
    expect(after.structures.find((s) => s.id === "structure-4")).toMatchObject({
      structureTypeId: "electrolysis-plant",
    });
    expect(ice(after)).toBeLessThan(ice(before));
    expect(oxygen(after)).toBeGreaterThan(oxygen(before));
  });
});

describe("the sample saves from before the Milestones", () => {
  it.each(["version-4.moonbase", "version-6.moonbase"])(
    "%s, saved with the Lander away, loads with the Lander departing reached",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.lander.legEndsAtMinute).toBeDefined();
      expect(state.milestones.reachedIds).toEqual(["lander-departs"]);
    },
  );

  it.each([
    ["version-1.moonbase", ["power-storage", "moved-in"]],
    ["version-22.moonbase", ["power-storage", "moved-in"]],
    [
      "version-31.moonbase",
      [
        "power-storage",
        "moved-in",
        "habitat-shielded",
        "landing-pad",
        "first-research-task",
      ],
    ],
    [
      "version-32.moonbase",
      ["power-storage", "moved-in", "first-research-task"],
    ],
  ])(
    "%s, saved with the Lander landed, loads with none reached, then reaches those its state meets as play goes on",
    (name, meets) => {
      const campaign = loadSample(name);
      expect(campaign.snapshot().milestones.reachedIds).toEqual([]);

      const events = campaign.advance(1);

      expect(
        events.flatMap((event) =>
          event.kind === "milestone-reached" ? [event.milestoneId] : [],
        ),
      ).toEqual(meets);
      expect(campaign.snapshot().milestones.reachedIds).toEqual(meets);
    },
  );
});

describe("the sample save of format version 33", () => {
  // Saved 3302 game-minutes in, an hour and a half after the Mission
  // Director moved into a Habitat beside a solar array and a battery bank,
  // with the Lander landed and free to fly.
  it("loads with power storage and moving in reached, and the Lander departing current", () => {
    const state = loadSample("version-33.moonbase").snapshot();

    expect(state.clock.elapsedMinutes).toBe(3302);
    expect(state.missionDirector).toMatchObject({ residence: "habitat" });
    expect(state.lander.state).toBe("landed-free");
    expect(state.milestones).toMatchObject({
      reachedIds: ["power-storage", "moved-in"],
      currentId: "lander-departs",
    });
  });

  it("plays on from where it was saved, reaching the Lander departing as it takes off", () => {
    const campaign = loadSample("version-33.moonbase");
    expect(campaign.sendLander()).toEqual({ ok: true });

    const events = campaign.advance(1);

    expect(events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["lander-took-off", "milestone-reached"]),
    );
    expect(campaign.snapshot().milestones.reachedIds).toEqual([
      "power-storage",
      "moved-in",
      "lander-departs",
    ]);
  });
});

describe("the sample saves from before Water-wall shielding", () => {
  it.each(["version-1.moonbase", "version-22.moonbase", "version-33.moonbase"])(
    "%s loads with no water-wall bladders, counted after the earlier Components in the base's stock",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.stockpile.components.map((s) => s.componentId)).toEqual(
        catalogue.componentTypes.map((type) => type.id),
      );
      expect(state.stockpile.components.at(-1)).toEqual({
        componentId: "water-wall-bladder",
        count: 0,
      });
    },
  );
});

describe("the sample save of format version 34", () => {
  // Saved 9970 game-minutes in, an hour into the Assembly of a water wall
  // over the Mission Director's Habitat and its Regolith shielding, once
  // Water-wall shielding was unlocked, its four bladders brought and
  // filled from the water stock as its Assembly started.
  it("loads with Water-wall shielding unlocked and a water wall being assembled over the shielded Habitat", () => {
    const state = loadSample("version-34.moonbase").snapshot();

    expect(state.clock.elapsedMinutes).toBe(9970);
    expect(state.unlockedDesignIds).toContain("water-wall-shielding");
    expect(state.missionDirector).toMatchObject({ residence: "habitat" });
    expect(
      state.structures.find((s) => s.structureTypeId === "habitat"),
    ).toMatchObject({ shielded: true, waterWalled: false });
    expect(state.constructions).toEqual([
      expect.objectContaining({
        structureTypeId: "water-wall",
        stage: "assembly",
        componentsTaken: true,
      }),
    ]);
  });

  it("plays on from where it was saved, the water wall commissioned within a day and cutting the Radiation Dose", () => {
    const campaign = loadSample("version-34.moonbase");
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 24) throw new Error("It was never commissioned.");
      campaign.advance(60);
    }

    const state = campaign.snapshot();
    expect(state.ended).toBeUndefined();
    expect(
      state.structures.find((s) => s.structureTypeId === "habitat"),
    ).toMatchObject({ shielded: true, waterWalled: true });
    expect(campaign.forecasts().radiationDose.millisievertsPerEarthDay).toBe(
      catalogue.radiation.doseRateMillisievertsPerEarthDay.waterWalledHabitat,
    );
  });
});

describe("the sample saves from before Plants worked in batches", () => {
  it.each(["version-17.moonbase", "version-25.moonbase"])(
    "%s loads with no batch started, and the extraction plant starts one as it next runs",
    (name) => {
      const campaign = loadSample(name);
      const plantOf = () =>
        campaign
          .snapshot()
          .structures.find(
            (structure) => structure.structureTypeId === "extraction-plant",
          )?.plant;
      expect(plantOf()).toMatchObject({ running: true, batch: undefined });

      untilBatteriesFull(campaign);
      campaign.advance(1);

      expect(plantOf()).toMatchObject({
        running: true,
        batch: { minutesLeft: expect.any(Number) as number },
      });
    },
  );
});

describe("the sample save of format version 35", () => {
  it("loads with the extraction plant half way through its batch, and the vacuum fabrication plant waiting for silicon", () => {
    const campaign = loadSample("version-35.moonbase");
    const plantOf = (structureTypeId: string) =>
      campaign
        .snapshot()
        .structures.find(
          (structure) => structure.structureTypeId === structureTypeId,
        )?.plant;

    expect(plantOf("extraction-plant")).toEqual({
      running: true,
      stoppedFor: undefined,
      batch: { recipeId: "oxygen", minutesLeft: 30 },
    });
    expect(plantOf("vacuum-fabrication-plant")).toEqual({
      running: false,
      stoppedFor: {
        reason: "no-input",
        resource: { kind: "bulk-resource", resourceId: "silicon" },
        kilograms: 0.2,
        kilogramsNeeded: 0.35,
      },
      batch: undefined,
    });

    campaign.advance(30);

    expect(
      campaign
        .snapshot()
        .bulkResources.find((stock) => stock.resourceId === "silicon")
        ?.kilograms,
    ).toBeCloseTo(0.22, 6);
    expect(plantOf("extraction-plant")?.batch).toBeUndefined();
  });
});

describe("the sample saves from before a Design could cut the Launch fee", () => {
  it("version-5.moonbase loads with its locked manifest paid for at the one Launch fee of the time", () => {
    const state = loadSample("version-5.moonbase").snapshot();

    // The fee as it was when format version 36 came in, which the
    // migration names, so that tuning it later doesn't change what an old
    // save loads with.
    expect(state.launchManifest).toMatchObject({
      locked: true,
      costMillionDollars: 150 + 2 * 4 + 3 + 2 * 2,
      feeMillionDollars: 150,
    });
  });

  it("version-35.moonbase loads with the Lander landed, its manifest at the Launch fee in force", () => {
    const state = loadSample("version-35.moonbase").snapshot();

    expect(state.lander.state).toBe("landed-occupied");
    expect(state.launchManifest.feeMillionDollars).toBe(
      catalogue.launch.feeMillionDollars,
    );
  });
});

describe("the sample save of format version 36", () => {
  // Saved 45900 game-minutes in, an hour after the Lander left Earth with
  // oxygen, water and five spare Components paid for at the full Launch
  // fee, and just after Reusable boosters was unlocked.
  it("loads with the Lander on its way back, its locked manifest at the fee it was paid with, though Reusable boosters is unlocked", () => {
    const state = loadSample("version-36.moonbase").snapshot();

    expect(state.clock.elapsedMinutes).toBe(45900);
    expect(state.unlockedDesignIds).toContain("reusable-boosters");
    expect(state.lander).toMatchObject({
      state: "travelling-to-moon",
      legEndsAtMinute: 50160,
    });
    expect(state.launchManifest).toMatchObject({
      locked: true,
      costMillionDollars: 159,
      feeMillionDollars: 150,
    });
  });

  it("plays on from where it was saved, the next manifest costing the reduced Launch fee once the Lander has landed", () => {
    const campaign = loadSample("version-36.moonbase");
    const funding = campaign.snapshot().fundingMillionDollars;

    campaign.advance(50160 - 45900);

    const state = campaign.snapshot();
    expect(state.lander.state).toBe("landed-free");
    expect(state.fundingMillionDollars).toBe(funding);
    expect(state.launchManifest).toMatchObject({
      items: [],
      locked: false,
      feeMillionDollars: catalogue.launch.reducedFee.feeMillionDollars,
    });
  });
});
