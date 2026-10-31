import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import { loadSample } from "./sample-saves";

/**
 * What an older sample save gets once it loads into rules that came after it:
 * Funding, Launches, Exports, research, the Tech Tree and the Milestones.
 */

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
    // Parking areas, a starting Design since format version 38, comes after
    // them.
    expect(loadSample(name).snapshot().unlockedDesignIds).toEqual([
      ...startingDesignIds,
      "parking-areas",
    ]);
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
    expect(state.unlockedDesignIds).toEqual([
      ...startingDesignIds,
      "parking-areas",
      design.id,
    ]);
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
