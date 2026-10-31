import { describe, expect, it } from "vitest";
import { catalogue, type StructureType } from "../src/catalogue";
import { shipped } from "./catalogue-helpers";

/**
 * The data catalogue's Power and Construction Designs, in research.ts, and the
 * Structures they bring, in structures.ts.
 */

describe("the data catalogue", () => {
  describe("the large battery bank", () => {
    const structureType = (id: string) => {
      const found = catalogue.structureTypes.find((type) => type.id === id);
      if (found === undefined) throw new Error(`expected a ${id}`);
      return found;
    };
    const large = structureType("large-battery-bank");
    const small = structureType("battery-bank");

    it("belongs to Large battery banks, a Power Design that needs Battery banks first", () => {
      expect(
        catalogue.designs.find((design) => design.id === large.designId),
      ).toMatchObject({
        category: "power",
        starting: false,
        prerequisiteDesignIds: ["battery-banks"],
      });
    });

    it("draws more for its heaters than a battery bank does, but less for each kilowatt-hour it stores", () => {
      const { power: largePower } = large;
      const { power: smallPower } = small;

      expect(largePower.drawKilowatts).toBeGreaterThan(
        smallPower.drawKilowatts,
      );
      expect(
        largePower.drawKilowatts / largePower.storageKilowattHours,
      ).toBeLessThan(
        smallPower.drawKilowatts / smallPower.storageKilowattHours,
      );
    });

    it("stores at least three times what a battery bank does, for less mass and less money for each kilowatt-hour", () => {
      const storage = (type: StructureType) => type.power.storageKilowattHours;

      expect(storage(large)).toBeGreaterThanOrEqual(3 * storage(small));
      expect(shipped(large).kilograms / storage(large)).toBeLessThan(
        shipped(small).kilograms / storage(small),
      );
      expect(shipped(large).millionDollars / storage(large)).toBeLessThan(
        shipped(small).millionDollars / storage(small),
      );
    });

    it("is built from Components of its own, which the starting stock doesn't hold, standing on more ground and taking longer to build than a battery bank", () => {
      for (const need of large.components) {
        expect(
          small.components.some(
            (other) => other.componentId === need.componentId,
          ),
        ).toBe(false);
        expect(
          catalogue.startingStock.some(
            (stock) => stock.componentId === need.componentId,
          ),
        ).toBe(false);
      }
      const hours = (type: StructureType) =>
        Object.values(type.stageHours).reduce((sum, value) => sum + value, 0);
      expect(large.footprintRadiusMetres).toBeGreaterThan(
        small.footprintRadiusMetres,
      );
      expect(hours(large)).toBeGreaterThan(hours(small));
      // Its heaters keep more cells warm.
      expect(large.power.drawKilowatts).toBeGreaterThan(
        small.power.drawKilowatts,
      );
    });
  });

  describe("the Power Designs", () => {
    const structureType = (id: string) => {
      const found = catalogue.structureTypes.find((type) => type.id === id);
      if (found === undefined) throw new Error(`expected a ${id}`);
      return found;
    };
    const designOf = (type: StructureType) => {
      const found = catalogue.designs.find(
        (design) => design.id === type.designId,
      );
      if (found === undefined) throw new Error(`expected a ${type.designId}`);
      return found;
    };
    const power = catalogue.designs.filter(
      (design) => design.category === "power" && !design.starting,
    );

    it("has about five beyond the starting ones, some needing another that isn't a starting one first", () => {
      expect(power.length).toBeGreaterThanOrEqual(3);
      expect(power.length).toBeLessThanOrEqual(6);
      expect(
        power.some((design) =>
          design.prerequisiteDesignIds.some(
            (id) =>
              catalogue.designs.find((other) => other.id === id)?.starting ===
              false,
          ),
        ),
      ).toBe(true);
    });

    it("has a thin-film solar array, behind Thin-film solar cells, which needs Solar arrays and Vacuum fabrication first", () => {
      expect(designOf(structureType("thin-film-solar-array"))).toMatchObject({
        id: "thin-film-solar-cells",
        category: "power",
        starting: false,
        prerequisiteDesignIds: ["solar-arrays", "vacuum-fabrication"],
      });
    });

    it("has the thin-film solar array generate more than a solar array, and more for each kilogram shipped, on the same ground", () => {
      const thinFilm = structureType("thin-film-solar-array");
      const solar = structureType("solar-array");
      const perKilogram = (type: StructureType) =>
        type.power.generationKilowatts / shipped(type).kilograms;

      expect(thinFilm.power.generationKilowatts).toBeGreaterThan(
        solar.power.generationKilowatts,
      );
      expect(perKilogram(thinFilm)).toBeGreaterThanOrEqual(
        1.5 * perKilogram(solar),
      );
      // Dearer, though, for each kilowatt.
      expect(
        shipped(thinFilm).millionDollars / thinFilm.power.generationKilowatts,
      ).toBeGreaterThan(
        shipped(solar).millionDollars / solar.power.generationKilowatts,
      );
      expect(thinFilm).toMatchObject({
        footprintRadiusMetres: solar.footprintRadiusMetres,
        stageHours: solar.stageHours,
        stageMachines: solar.stageMachines,
        hazardMultipliers: solar.hazardMultipliers,
      });
      expect(thinFilm.power.drawKilowatts).toBe(solar.power.drawKilowatts);
    });

    it("has a tall Light Mast, behind Tall Light Masts, which needs Light Masts and Large battery banks first", () => {
      expect(designOf(structureType("tall-light-mast"))).toMatchObject({
        id: "tall-light-masts",
        category: "power",
        starting: false,
        prerequisiteDesignIds: ["light-masts", "large-battery-banks"],
      });
    });

    it("has the tall Light Mast light at least three times the ground a Light Mast does, drawing more at Night but less for each square metre, and no more through a Night than a large battery bank stores", () => {
      const tall = structureType("tall-light-mast");
      const mast = structureType("light-mast");
      const area = (type: StructureType) => type.lightRadiusMetres ** 2;
      const nightHours = catalogue.lunation.nightEarthDays * 24;

      expect(area(tall)).toBeGreaterThanOrEqual(3 * area(mast));
      expect(tall.power.nightDrawKilowatts).toBeGreaterThan(
        mast.power.nightDrawKilowatts,
      );
      expect(tall.power.nightDrawKilowatts / area(tall)).toBeLessThan(
        mast.power.nightDrawKilowatts / area(mast),
      );
      expect(tall.power.nightDrawKilowatts * nightHours).toBeLessThanOrEqual(
        structureType("large-battery-bank").power.storageKilowattHours,
      );
      expect(tall.power.drawKilowatts).toBe(mast.power.drawKilowatts);
      expect(tall.power.generationKilowatts).toBe(0);
    });

    it.each([
      ["thin-film-solar-array", "solar-array"],
      ["tall-light-mast", "light-mast"],
    ])(
      "has the %s built from at least one Component of its own, which neither a %s nor the starting stock has",
      (id, originalId) => {
        const own = structureType(id).components.filter(
          (need) =>
            !structureType(originalId).components.some(
              (other) => other.componentId === need.componentId,
            ),
        );

        expect(own.length).toBeGreaterThan(0);
        for (const need of own) {
          expect(
            catalogue.startingStock.some(
              (stock) => stock.componentId === need.componentId,
            ),
          ).toBe(false);
        }
      },
    );
  });

  describe("the Construction Designs", () => {
    const structureType = (id: string) => {
      const found = catalogue.structureTypes.find((type) => type.id === id);
      if (found === undefined) throw new Error(`expected a ${id}`);
      return found;
    };
    const designOf = (type: StructureType) => {
      const found = catalogue.designs.find(
        (design) => design.id === type.designId,
      );
      if (found === undefined) throw new Error(`expected a ${type.designId}`);
      return found;
    };
    const hours = (type: StructureType) =>
      Object.values(type.stageHours).reduce((sum, value) => sum + value, 0);

    it("has a sintered landing pad, behind Regolith sintering, a Construction Design that needs Regolith shielding first", () => {
      const pad = structureType("sintered-landing-pad");

      expect(designOf(pad)).toMatchObject({
        id: "regolith-sintering",
        category: "construction",
        starting: false,
        prerequisiteDesignIds: ["regolith-shielding"],
      });
    });

    it("has the sintered landing pad printed from Regolith by the regolith printer, with no Components, taking longer to build than a landing pad shipped from Earth", () => {
      const sintered = structureType("sintered-landing-pad");
      const shipped = structureType("landing-pad");

      expect(sintered).toMatchObject({
        landingPad: true,
        components: [],
        stageMachines: {
          sitePreparation: "excavator",
          assembly: "regolith-printer",
        },
        footprintRadiusMetres: shipped.footprintRadiusMetres,
        power: shipped.power,
        hazardMultipliers: shipped.hazardMultipliers,
      });
      expect(sintered.stageHours.componentDelivery).toBe(0);
      expect(hours(sintered)).toBeGreaterThan(hours(shipped));
      expect(
        catalogue.launch.items.filter(
          (item) => item.designId === sintered.designId,
        ),
      ).toEqual([]);
    });

    it("has the excavator dig the Regolith for every Structure the regolith printer prints, spending 6 hours of its Site Preparation on it on top of grading the ground", () => {
      const printed = catalogue.structureTypes.filter(
        (type) => type.stageMachines.assembly === "regolith-printer",
      );

      expect(printed.map((type) => type.id)).toEqual([
        "regolith-shielding",
        "sintered-regolith-shielding",
        "sintered-landing-pad",
      ]);
      // The same ground a landing pad shipped from Earth is laid on.
      expect(structureType("sintered-landing-pad").stageHours).toMatchObject({
        sitePreparation:
          structureType("landing-pad").stageHours.sitePreparation + 6,
      });
      // 3 hours to grade the ground round the Habitat.
      for (const id of ["regolith-shielding", "sintered-regolith-shielding"]) {
        expect(structureType(id).stageHours.sitePreparation).toBe(3 + 6);
      }
    });

    it("has sintered Regolith shielding, behind Microwave sintering, a Construction Design that needs Regolith sintering first", () => {
      expect(designOf(structureType("sintered-regolith-shielding"))).toEqual(
        expect.objectContaining({
          id: "microwave-sintering",
          category: "construction",
          starting: false,
          prerequisiteDesignIds: ["regolith-sintering"],
        }),
      );
    });

    it("has sintered Regolith shielding dug and printed like Regolith shielding, but printed in under half the hours", () => {
      const sintered = structureType("sintered-regolith-shielding");
      const printed = structureType("regolith-shielding");

      expect(sintered).toMatchObject({
        shieldsHabitat: true,
        components: [],
        stageMachines: printed.stageMachines,
        footprintRadiusMetres: printed.footprintRadiusMetres,
        power: printed.power,
        hazardMultipliers: printed.hazardMultipliers,
      });
      expect(sintered.stageHours.sitePreparation).toBe(
        printed.stageHours.sitePreparation,
      );
      expect(sintered.stageHours.assembly).toBeLessThan(
        printed.stageHours.assembly / 2,
      );
    });

    it("has a prefabricated solar array, behind Prefabricated solar arrays, a Construction Design that needs Solar arrays first", () => {
      expect(
        designOf(structureType("prefabricated-solar-array")),
      ).toMatchObject({
        id: "prefabricated-solar-arrays",
        category: "construction",
        starting: false,
        prerequisiteDesignIds: ["solar-arrays"],
      });
    });

    it("has the prefabricated solar array generate as a solar array does, but go up in under half the hours and fail Commissioning less often, from one Component of its own, shipped heavier and dearer", () => {
      const prefabricated = structureType("prefabricated-solar-array");
      const solar = structureType("solar-array");

      expect(prefabricated).toMatchObject({
        footprintRadiusMetres: solar.footprintRadiusMetres,
        stageMachines: solar.stageMachines,
        power: solar.power,
        hazardMultipliers: solar.hazardMultipliers,
        dustWearPercentPerHour: solar.dustWearPercentPerHour,
      });
      for (const stage of [
        "sitePreparation",
        "componentDelivery",
        "assembly",
        "commissioning",
      ] as const) {
        expect(prefabricated.stageHours[stage]).toBeLessThan(
          solar.stageHours[stage],
        );
      }
      expect(hours(prefabricated)).toBeLessThan(hours(solar) / 2);
      expect(prefabricated.commissioningFailureChance).toBeLessThan(
        solar.commissioningFailureChance,
      );
      const [kit, ...rest] = prefabricated.components;
      expect(rest).toEqual([]);
      expect(kit?.count).toBe(1);
      expect(
        catalogue.startingStock.some(
          (stock) => stock.componentId === kit?.componentId,
        ),
      ).toBe(false);
      expect(shipped(prefabricated).kilograms).toBeGreaterThan(
        shipped(solar).kilograms,
      );
      expect(shipped(prefabricated).millionDollars).toBeGreaterThan(
        shipped(solar).millionDollars,
      );
    });

    it("has about three beyond the starting ones, some needing another that isn't a starting one first", () => {
      const construction = catalogue.designs.filter(
        (design) => design.category === "construction" && !design.starting,
      );

      expect(construction.length).toBeGreaterThanOrEqual(3);
      expect(construction.length).toBeLessThanOrEqual(4);
      expect(
        construction.some((design) =>
          design.prerequisiteDesignIds.some(
            (id) =>
              catalogue.designs.find((other) => other.id === id)?.starting ===
              false,
          ),
        ),
      ).toBe(true);
    });
  });
});
