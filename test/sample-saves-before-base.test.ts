import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";
import type { GroundPosition } from "../src/simulation";
import { samples, untilBatteriesFull, loadSample } from "./sample-saves";

/**
 * What an older sample save gets once it loads into rules that came after it:
 * the Structures, Plants, Machines and bulk resources that were new to the
 * base.
 */

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

describe("the sample saves from before Water-wall shielding", () => {
  it.each(["version-1.moonbase", "version-22.moonbase", "version-33.moonbase"])(
    "%s loads with no water-wall bladders, counted after the earlier Components in the base's stock",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.stockpile.components.map((s) => s.componentId)).toEqual(
        catalogue.componentTypes.map((type) => type.id),
      );
      // Before the parking area's bay socket and the telescope's two
      // Components, which came after it.
      expect(state.stockpile.components.at(-4)).toEqual({
        componentId: "water-wall-bladder",
        count: 0,
      });
    },
  );
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

describe("the sample saves from before a Plant could be switched off", () => {
  it.each(["version-25.moonbase", "version-35.moonbase"])(
    "%s loads with every Structure switched on, and its extraction plant runs on",
    (name) => {
      const campaign = loadSample(name);
      const extraction = () =>
        campaign
          .snapshot()
          .structures.find(
            (structure) => structure.structureTypeId === "extraction-plant",
          );

      expect(
        campaign
          .snapshot()
          .structures.map((structure) => structure.switchedOff),
      ).not.toContain(true);
      untilBatteriesFull(campaign);
      campaign.advance(60);
      expect(extraction()?.plant).toMatchObject({
        running: true,
        stoppedFor: undefined,
      });
    },
  );
});

describe("the sample saves from before Parking areas", () => {
  it.each(["version-1.moonbase", "version-22.moonbase", "version-37.moonbase"])(
    "%s loads with Parking areas unlocked, and no bay sockets, counted after the earlier Components in the base's stock",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.unlockedDesignIds).toContain("parking-areas");
      expect(state.stockpile.components.map((s) => s.componentId)).toEqual(
        catalogue.componentTypes.map((type) => type.id),
      );
      // Before the telescope's two Components, which came after it.
      expect(state.stockpile.components.at(-3)).toEqual({
        componentId: "bay-socket",
        count: 0,
      });
    },
  );
});

describe("the sample saves from before Optical telescopes", () => {
  it.each(["version-1.moonbase", "version-27.moonbase", "version-38.moonbase"])(
    "%s loads with no telescope Components, counted after the earlier ones in the base's stock, and nothing observed",
    (name) => {
      const state = loadSample(name).snapshot();

      expect(state.stockpile.components.map((s) => s.componentId)).toEqual(
        catalogue.componentTypes.map((type) => type.id),
      );
      expect(state.stockpile.components.slice(-2)).toEqual([
        { componentId: "telescope-optics", count: 0 },
        { componentId: "telescope-mount", count: 0 },
      ]);
      expect(state.unlockedDesignIds).not.toContain("optical-telescopes");
      expect(state.observingProgramme).toMatchObject({
        progress: 0,
        telescopes: 0,
      });
    },
  );
});
