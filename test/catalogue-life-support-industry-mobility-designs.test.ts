import { describe, expect, it } from "vitest";
import {
  catalogue,
  type ResourceFlow,
  type StructureType,
  componentOutputs,
  resourceOutputs,
} from "../src/catalogue";
import { shipped } from "./catalogue-helpers";

/**
 * The data catalogue's Life Support, Industry and Mobility Designs, in
 * research.ts, and the Structures they bring, in structures.ts.
 */

describe("the data catalogue", () => {
  describe("the Industry Designs", () => {
    const structureType = (id: string) => {
      const found = catalogue.structureTypes.find((type) => type.id === id);
      if (found === undefined) throw new Error(`expected a ${id}`);
      return found;
    };
    const designOf = (designId: string) => {
      const found = catalogue.designs.find((design) => design.id === designId);
      if (found === undefined) throw new Error(`expected a ${designId}`);
      return found;
    };
    const recipeOf = (typeId: string, recipeId: string) => {
      const found = structureType(typeId).recipes?.find(
        (recipe) => recipe.id === recipeId,
      );
      if (found === undefined) throw new Error(`expected ${recipeId}`);
      return found;
    };
    const rateOf = (flows: readonly ResourceFlow[], id: string) =>
      flows.find((flow) =>
        flow.resource.kind === "bulk-resource"
          ? flow.resource.resourceId === id
          : flow.resource.stockId === id,
      )?.kilogramsPerHour ?? 0;
    const industry = catalogue.designs.filter(
      (design) => design.category === "industry" && !design.starting,
    );

    it("has a Workshop behind Parts machining, which needs Molten regolith electrolysis first, making about what the long-game base uses of spare Components, running through Daylight", () => {
      const workshop = structureType("workshop");
      expect(designOf(workshop.designId)).toMatchObject({
        id: "parts-machining",
        category: "industry",
        starting: false,
        prerequisiteDesignIds: ["molten-regolith-electrolysis"],
      });
      const [recipe] = workshop.recipes ?? [];
      if (recipe === undefined) throw new Error("expected a recipe");
      const batches =
        (catalogue.lunation.daylightEarthDays * 24) / (recipe.batchHours ?? 1);
      expect(componentOutputs(recipe)).toEqual([
        { componentId: catalogue.maintenance.spareComponentId, count: 1 },
      ]);
      // It uses about 16 a Lunation, with a little over for the Workshop's own
      // wear and the worse Lunations.
      expect(batches).toBeGreaterThanOrEqual(16);
      expect(batches).toBeLessThanOrEqual(24);
      // Most of what the base has to spare in metals, which it would otherwise
      // sell: about 78 kg a Lunation beside its circuit board plant.
      const metals = (recipe.inputs[0]?.kilogramsPerHour ?? 0) * batches * 24;
      expect(metals).toBeGreaterThan(50);
      expect(metals).toBeLessThanOrEqual(78);
      expect(Number.isInteger((recipe.batchHours ?? 1) * 60)).toBe(true);
      for (const item of workshop.components) {
        expect(
          catalogue.launch.items.find(({ id }) => id === item.componentId)
            ?.designId,
        ).toBe("parts-machining");
      }
    });

    it("has nine beyond the starting ones, some needing another that isn't a starting one first", () => {
      expect(industry).toHaveLength(9);
      expect(
        industry.some((design) =>
          design.prerequisiteDesignIds.some((id) => !designOf(id).starting),
        ),
      ).toBe(true);
    });

    it("has a large extraction plant, behind Molten regolith electrolysis, which needs Regolith extraction first", () => {
      expect(
        designOf(structureType("large-extraction-plant").designId),
      ).toMatchObject({
        id: "molten-regolith-electrolysis",
        category: "industry",
        starting: false,
        prerequisiteDesignIds: ["regolith-extraction"],
      });
    });

    it("has the large extraction plant run the extraction plant's recipes on at least twice the Regolith, making more of everything for each hour and each kW", () => {
      const large = structureType("large-extraction-plant").recipes ?? [];
      const original = structureType("extraction-plant").recipes ?? [];

      expect(
        large.map((recipe) => [
          recipe.id,
          recipe.label,
          recipe.inputs.map((flow) => flow.resource),
          resourceOutputs(recipe).map((flow) => flow.resource),
        ]),
      ).toEqual(
        original.map((recipe) => [
          recipe.id,
          recipe.label,
          recipe.inputs.map((flow) => flow.resource),
          resourceOutputs(recipe).map((flow) => flow.resource),
        ]),
      );
      for (const recipe of large) {
        const before = recipeOf("extraction-plant", recipe.id);
        expect(rateOf(recipe.inputs, "regolith")).toBeGreaterThanOrEqual(
          2 * rateOf(before.inputs, "regolith"),
        );
        for (const resource of ["oxygen", "metals", "silicon"]) {
          const made = rateOf(resourceOutputs(recipe), resource);
          const madeBefore = rateOf(resourceOutputs(before), resource);
          expect(made).toBeGreaterThan(madeBefore);
          expect(made / recipe.drawKilowatts).toBeGreaterThan(
            madeBefore / before.drawKilowatts,
          );
        }
      }
    });

    it("has the large extraction plant built from an oxygen separator and a Component of its own, standing on more ground and shipping less for each kilogram of silicon it makes an hour", () => {
      const large = structureType("large-extraction-plant");
      const original = structureType("extraction-plant");
      const silicon = (typeId: string) =>
        rateOf(
          resourceOutputs(recipeOf(typeId, "metals-and-silicon")),
          "silicon",
        );

      expect(large.components).toEqual([
        { componentId: "molten-regolith-cell", count: 1 },
        { componentId: "oxygen-separator", count: 1 },
      ]);
      expect(large.footprintRadiusMetres).toBeGreaterThan(
        original.footprintRadiusMetres,
      );
      expect(
        shipped(large).kilograms / silicon("large-extraction-plant"),
      ).toBeLessThan(shipped(original).kilograms / silicon("extraction-plant"));
    });

    it("has an integrated fabrication plant, behind Integrated fabrication, which needs Molten regolith electrolysis and Circuit board fabrication first", () => {
      expect(
        designOf(structureType("integrated-fabrication-plant").designId),
      ).toMatchObject({
        id: "integrated-fabrication",
        category: "industry",
        starting: false,
        prerequisiteDesignIds: [
          "molten-regolith-electrolysis",
          "circuit-board-fabrication",
        ],
      });
    });

    it("has the integrated fabrication plant make circuit boards straight from silicon and metals by default, or wafers, more of each an hour than the Plants it stands in for, for no more power than both draw together", () => {
      const [boards, wafers] =
        structureType("integrated-fabrication-plant").recipes ?? [];
      if (boards === undefined || wafers === undefined) {
        throw new Error("expected two recipes");
      }
      const fabrication = recipeOf("vacuum-fabrication-plant", "wafers");
      const circuits = recipeOf("circuit-board-plant", "circuit-boards");

      expect([boards.id, wafers.id]).toEqual(["circuit-boards", "wafers"]);
      expect(boards.inputs.map((flow) => flow.resource)).toEqual([
        { kind: "bulk-resource", resourceId: "silicon" },
        { kind: "bulk-resource", resourceId: "metals" },
      ]);
      expect(resourceOutputs(boards).map((flow) => flow.resource)).toEqual([
        { kind: "bulk-resource", resourceId: "circuit-boards" },
      ]);
      expect(wafers.inputs.map((flow) => flow.resource)).toEqual([
        { kind: "bulk-resource", resourceId: "silicon" },
      ]);
      expect(resourceOutputs(wafers).map((flow) => flow.resource)).toEqual([
        { kind: "bulk-resource", resourceId: "wafers" },
      ]);
      expect(rateOf(resourceOutputs(boards), "circuit-boards")).toBeGreaterThan(
        rateOf(resourceOutputs(circuits), "circuit-boards"),
      );
      expect(rateOf(resourceOutputs(wafers), "wafers")).toBeGreaterThan(
        rateOf(resourceOutputs(fabrication), "wafers"),
      );
      for (const recipe of [boards, wafers]) {
        expect(recipe.drawKilowatts).toBeLessThanOrEqual(
          fabrication.drawKilowatts + circuits.drawKilowatts,
        );
      }
    });

    it("has the integrated fabrication plant take more silicon than an extraction plant makes, but no more than a large extraction plant makes, running for metals and silicon", () => {
      const taken = Math.max(
        ...(structureType("integrated-fabrication-plant").recipes ?? []).map(
          (recipe) => rateOf(recipe.inputs, "silicon"),
        ),
      );
      const made = (typeId: string) =>
        rateOf(
          resourceOutputs(recipeOf(typeId, "metals-and-silicon")),
          "silicon",
        );

      expect(taken).toBeGreaterThan(made("extraction-plant"));
      expect(taken).toBeLessThanOrEqual(made("large-extraction-plant"));
    });

    it("has the integrated fabrication plant built from a crystal furnace and a Component of its own, shipped lighter and cheaper than a vacuum fabrication plant and a circuit board plant together", () => {
      const integrated = structureType("integrated-fabrication-plant");
      const pair = [
        shipped(structureType("vacuum-fabrication-plant")),
        shipped(structureType("circuit-board-plant")),
      ];

      expect(integrated.components).toEqual([
        { componentId: "crystal-furnace", count: 1 },
        { componentId: "board-assembly-line", count: 1 },
      ]);
      expect(shipped(integrated).kilograms).toBeLessThan(
        pair.reduce((sum, each) => sum + each.kilograms, 0),
      );
      expect(shipped(integrated).millionDollars).toBeLessThan(
        pair.reduce((sum, each) => sum + each.millionDollars, 0),
      );
    });
  });

  describe("the Mobility Designs", () => {
    const structureType = (id: string) => {
      const found = catalogue.structureTypes.find((type) => type.id === id);
      if (found === undefined) throw new Error(`expected a ${id}`);
      return found;
    };
    const designOf = (designId: string) => {
      const found = catalogue.designs.find((design) => design.id === designId);
      if (found === undefined) throw new Error(`expected a ${designId}`);
      return found;
    };
    const mobility = catalogue.designs.filter(
      (design) => design.category === "mobility" && !design.starting,
    );

    it("has two beyond the starting ones, some needing another that isn't a starting one first", () => {
      expect(mobility).toHaveLength(2);
      expect(
        mobility.some((design) =>
          design.prerequisiteDesignIds.some((id) => !designOf(id).starting),
        ),
      ).toBe(true);
    });

    // The Rover is the only one of its kind, so a Design for another Rover
    // would need a new rule. The Design that held its place unlocks lights
    // round a landing pad instead.
    it("has a lit landing pad, behind Landing pad lights, which needs Landing pads and Tall Light Masts first", () => {
      expect(designOf(structureType("lit-landing-pad").designId)).toMatchObject(
        {
          id: "landing-pad-lights",
          label: "Landing pad lights",
          category: "mobility",
          starting: false,
          prerequisiteDesignIds: ["landing-pads", "tall-light-masts"],
        },
      );
    });

    it("has the lit landing pad stand on a landing pad's ground, built from a landing pad's Components and pad lights of its own, taking longer to assemble", () => {
      const lit = structureType("lit-landing-pad");
      const pad = structureType("landing-pad");
      const own = lit.components.filter(
        (need) =>
          !pad.components.some(
            (other) => other.componentId === need.componentId,
          ),
      );

      expect(lit).toMatchObject({
        landingPad: true,
        footprintRadiusMetres: pad.footprintRadiusMetres,
        stageMachines: pad.stageMachines,
        habitat: false,
        shieldsHabitat: false,
      });
      expect(lit.components).toEqual(
        expect.arrayContaining([...pad.components]),
      );
      expect(own).toEqual([{ componentId: "landing-floodlight", count: 4 }]);
      expect(lit.stageHours.assembly).toBeGreaterThan(pad.stageHours.assembly);
      expect(shipped(lit).kilograms).toBeLessThanOrEqual(
        catalogue.launch.payloadMassLimitKilograms,
      );
    });

    it("has the lit landing pad light wider ground than a Light Mast at Night, drawing no more for each square metre lit, and nothing in Daylight", () => {
      const lit = structureType("lit-landing-pad");
      const mast = structureType("light-mast");
      const perArea = (type: StructureType) =>
        type.power.nightDrawKilowatts / type.lightRadiusMetres ** 2;

      expect(lit.lightRadiusMetres).toBeGreaterThan(mast.lightRadiusMetres);
      expect(perArea(lit)).toBeLessThanOrEqual(perArea(mast));
      expect(lit.power).toMatchObject({
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
      });
      expect(lit.power.nightDrawKilowatts).toBeGreaterThan(0);
    });
  });

  describe("the Life Support Designs", () => {
    const structureType = (id: string) => {
      const found = catalogue.structureTypes.find((type) => type.id === id);
      if (found === undefined) throw new Error(`expected a ${id}`);
      return found;
    };
    const designOf = (designId: string) => {
      const found = catalogue.designs.find((design) => design.id === designId);
      if (found === undefined) throw new Error(`expected a ${designId}`);
      return found;
    };
    const rateOf = (flows: readonly ResourceFlow[], id: string) =>
      flows.find((flow) =>
        flow.resource.kind === "bulk-resource"
          ? flow.resource.resourceId === id
          : flow.resource.stockId === id,
      )?.kilogramsPerHour ?? Number.NaN;
    /** The life support Launch items of a Design: stock id, kilograms brought and kilograms shipped. */
    const tanksOf = (designId: string) =>
      catalogue.launch.items.flatMap((item) =>
        item.designId === designId && item.brings.kind === "life-support"
          ? [
              {
                stockId: item.brings.stockId,
                kilograms: item.brings.kilograms,
                item,
              },
            ]
          : [],
      );
    const lifeSupport = catalogue.designs.filter(
      (design) => design.category === "life-support" && !design.starting,
    );

    it("has two or three beyond the starting ones, some needing another that isn't a starting one first", () => {
      expect(lifeSupport.length).toBeGreaterThanOrEqual(2);
      expect(lifeSupport.length).toBeLessThanOrEqual(3);
      expect(
        lifeSupport.some((design) =>
          design.prerequisiteDesignIds.some((id) => !designOf(id).starting),
        ),
      ).toBe(true);
    });

    it("has an electrolysis plant, behind Water electrolysis, which needs Water processing first", () => {
      expect(
        designOf(structureType("electrolysis-plant").designId),
      ).toMatchObject({
        id: "water-electrolysis",
        category: "life-support",
        starting: false,
        prerequisiteDesignIds: ["water-processing"],
      });
    });

    it("has the electrolysis plant split water ice into oxygen, more for each hour and each kW than an extraction plant running for oxygen, keeping the Mission Director self-sufficient in oxygen in a fifth of the Daylight", () => {
      const electrolysis = structureType("electrolysis-plant").recipes ?? [];
      const extraction = structureType("extraction-plant").recipes?.find(
        (candidate) => candidate.id === "oxygen",
      );
      const [recipe] = electrolysis;
      if (recipe === undefined || extraction === undefined) {
        throw new Error("expected the recipes");
      }
      const oxygen = rateOf(resourceOutputs(recipe), "oxygen");
      const extracted = rateOf(resourceOutputs(extraction), "oxygen");
      const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
      const used =
        (catalogue.lifeSupportStocks.find((stock) => stock.id === "oxygen")
          ?.usePerEarthDayKilograms ?? Number.NaN) *
        (daylightEarthDays + nightEarthDays);

      expect(electrolysis).toHaveLength(1);
      expect(recipe.inputs.map((flow) => flow.resource)).toEqual([
        { kind: "bulk-resource", resourceId: "water-ice" },
      ]);
      expect(resourceOutputs(recipe).map((flow) => flow.resource)).toEqual([
        { kind: "life-support", stockId: "oxygen" },
      ]);
      expect(oxygen).toBeGreaterThan(2 * extracted);
      expect(oxygen / recipe.drawKilowatts).toBeGreaterThan(
        extracted / extraction.drawKilowatts,
      );
      expect(used / oxygen).toBeLessThan((daylightEarthDays * 24) / 5);
    });

    it("has the electrolysis plant built from an ice melter and a Component of its own, shipped lighter and cheaper than an extraction plant", () => {
      const plant = structureType("electrolysis-plant");
      const extraction = structureType("extraction-plant");

      expect(plant.components).toEqual([
        { componentId: "ice-melter", count: 1 },
        { componentId: "electrolyser-stack", count: 1 },
      ]);
      expect(shipped(plant).kilograms).toBeLessThan(
        shipped(extraction).kilograms,
      );
      expect(shipped(plant).millionDollars).toBeLessThan(
        shipped(extraction).millionDollars,
      );
    });

    it("has oxygen and water in bulk tanks, behind Bulk supply tanks, which needs Life support resupply and Water electrolysis first", () => {
      const tanks = tanksOf("bulk-supply-tanks");

      expect(designOf("bulk-supply-tanks")).toMatchObject({
        category: "life-support",
        starting: false,
        prerequisiteDesignIds: ["life-support-resupply", "water-electrolysis"],
      });
      expect(tanks.map((tank) => tank.stockId)).toEqual(["oxygen", "water"]);
    });

    it("has each bulk tank bring at least five times as much as a resupply tank, more for each kilogram shipped and each dollar", () => {
      for (const tank of tanksOf("bulk-supply-tanks")) {
        const resupply = tanksOf("life-support-resupply").find(
          (other) => other.stockId === tank.stockId,
        );
        if (resupply === undefined) throw new Error("expected a resupply");

        expect(tank.kilograms).toBeGreaterThanOrEqual(5 * resupply.kilograms);
        expect(tank.kilograms / tank.item.massKilograms).toBeGreaterThan(
          resupply.kilograms / resupply.item.massKilograms,
        );
        expect(tank.kilograms / tank.item.priceMillionDollars).toBeGreaterThan(
          resupply.kilograms / resupply.item.priceMillionDollars,
        );
      }
    });
  });
});
