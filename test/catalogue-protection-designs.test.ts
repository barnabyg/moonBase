import { describe, expect, it } from "vitest";
import { catalogue, type StructureType } from "../src/catalogue";
import { designsUnlockedWith } from "./catalogue-helpers";

/**
 * The data catalogue's Protection Designs, in research.ts, and the Structures
 * they bring, in structures.ts.
 */

describe("the data catalogue", () => {
  describe("Water-wall shielding", () => {
    const walls = catalogue.structureTypes.filter(
      (type) => type.waterWall !== undefined,
    );
    const [wall] = walls;
    const habitat = catalogue.structureTypes.find((type) => type.habitat);
    const rates = catalogue.radiation.doseRateMillisievertsPerEarthDay;

    it("is a Protection Design beyond the starting ones, needing Regolith shielding first, for the one water wall", () => {
      expect(walls).toHaveLength(1);
      expect(
        catalogue.designs.find((design) => design.id === wall?.designId),
      ).toMatchObject({
        category: "protection",
        starting: false,
        prerequisiteDesignIds: ["regolith-shielding"],
      });
    });

    it("has the water wall stand on the Habitat's footprint, built from Components of its own that a Launch brings and the starting stock doesn't hold, using no power, and not count as Regolith shielding", () => {
      expect(wall?.footprintRadiusMetres).toBe(habitat?.footprintRadiusMetres);
      expect(wall?.shieldsHabitat).toBe(false);
      expect(wall?.habitat).toBe(false);
      expect(
        Object.values(wall?.power ?? {}).every((value) => value === 0),
      ).toBe(true);
      let mass = 0;
      for (const need of wall?.components ?? []) {
        const item = catalogue.launch.items.find(
          (candidate) =>
            candidate.brings.kind === "component" &&
            candidate.brings.componentId === need.componentId,
        );
        expect(item?.designId).toBe(wall?.designId);
        expect(
          catalogue.startingStock.some(
            (stock) => stock.componentId === need.componentId,
          ),
        ).toBe(false);
        mass += (item?.massKilograms ?? Infinity) * need.count;
      }
      expect(wall?.components.length).toBeGreaterThan(0);
      expect(mass).toBeLessThanOrEqual(
        catalogue.launch.payloadMassLimitKilograms,
      );
    });

    it("fills the water wall from a life support stock, with more than the reserve it leaves the Mission Director", () => {
      const rules = wall?.waterWall;
      const stock = catalogue.lifeSupportStocks.find(
        (candidate) => candidate.id === rules?.stockId,
      );

      expect(stock).toBeDefined();
      expect(rules?.reserveEarthDays).toBeGreaterThan(0);
      expect(rules?.kilograms).toBeGreaterThan(
        (rules?.reserveEarthDays ?? Infinity) *
          (stock?.usePerEarthDayKilograms ?? Infinity),
      );
    });

    it("lets less radiation into a water-walled Habitat than a Habitat with Regolith shielding alone, but some", () => {
      expect(rates.waterWalledHabitat).toBeGreaterThan(0);
      expect(rates.waterWalledHabitat).toBeLessThan(rates.shieldedHabitat);
    });
  });

  describe("the Protection Designs", () => {
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
    type Wear = "dustWear" | keyof StructureType["hazardMultipliers"];
    const wearOf = (type: StructureType, wear: Wear) =>
      wear === "dustWear"
        ? type.dustWearPercentPerHour
        : type.hazardMultipliers[wear];
    /** Each hardened Structure, the Structure it replaces, and the wear it takes less of. */
    const hardened: readonly [string, string, readonly Wear[]][] = [
      ["dust-sealed-solar-array", "solar-array", ["dustWear"]],
      ["dust-screened-solar-array", "solar-array", ["dustWear", "dustCoating"]],
      ["whipple-shielded-battery-bank", "battery-bank", ["micrometeorites"]],
      ["hardened-habitat", "habitat", ["micrometeorites", "plumeEjecta"]],
    ];
    // Water-wall shielding hardens nothing: it goes over a Habitat's
    // Regolith shielding, and has tests of its own (below). Nor does a Buried
    // Habitat, in buried-habitat.test.ts: it is a Habitat of its own.
    const protection = catalogue.designs.filter(
      (design) =>
        design.category === "protection" &&
        !design.starting &&
        !catalogue.structureTypes.some(
          (type) =>
            type.designId === design.id &&
            (type.waterWall !== undefined || type.buried === true),
        ),
    );

    it("has three to five, each unlocking a hardened Structure, that together cover more than one Hazard", () => {
      expect(protection.length).toBeGreaterThanOrEqual(3);
      expect(protection.length).toBeLessThanOrEqual(5);
      expect(
        protection.map((design) =>
          catalogue.structureTypes
            .filter((type) => type.designId === design.id)
            .map((type) => type.id),
        ),
      ).toEqual(hardened.map(([id]) => [id]));
      const hazards = new Set(
        hardened.flatMap(([, , wears]) =>
          wears.map((wear) => (wear.startsWith("dust") ? "dust" : wear)),
        ),
      );
      expect(hazards.size).toBeGreaterThanOrEqual(2);
    });

    it("gives the category some depth: some need another Design first that isn't a starting one", () => {
      const needsMore = protection.filter((design) =>
        design.prerequisiteDesignIds.some(
          (id) =>
            catalogue.designs.find((other) => other.id === id)?.starting ===
            false,
        ),
      );

      expect(needsMore.length).toBeGreaterThan(0);
    });

    it.each(hardened)(
      "has the %s wear more slowly than a %s, by the data catalogue",
      (id, originalId, wears) => {
        const type = structureType(id);
        const original = structureType(originalId);

        for (const wear of wears) {
          expect(wearOf(type, wear)).toBeLessThan(wearOf(original, wear));
          expect(wearOf(type, wear)).toBeGreaterThan(0);
        }
        for (const wear of [
          "dustWear",
          "dustCoating",
          "micrometeorites",
          "plumeEjecta",
        ] as const) {
          if (!wears.includes(wear)) {
            expect(wearOf(type, wear)).toBe(wearOf(original, wear));
          }
        }
      },
    );

    it.each(hardened)(
      "has the %s do the same job as a %s, standing on the same ground and built the same way, after its Design is unlocked",
      (id, originalId) => {
        const type = structureType(id);
        const original = structureType(originalId);
        const unlocked = designsUnlockedWith(type.designId);

        expect(designOf(type)).toMatchObject({
          category: "protection",
          starting: false,
        });
        expect(unlocked).toContain(original.designId);
        expect(type).toMatchObject({
          footprintRadiusMetres: original.footprintRadiusMetres,
          stageHours: original.stageHours,
          stageMachines: original.stageMachines,
          commissioningFailureChance: original.commissioningFailureChance,
          power: original.power,
          lightRadiusMetres: original.lightRadiusMetres,
          habitat: original.habitat,
          shieldsHabitat: original.shieldsHabitat,
          landingPad: original.landingPad,
        });
        expect(type.recipes).toEqual(original.recipes);
      },
    );

    it.each(hardened)(
      "has the %s built from at least one Component of its own, which neither a %s nor the starting stock has",
      (id, originalId) => {
        const type = structureType(id);
        const original = structureType(originalId);
        const own = type.components.filter(
          (need) =>
            !original.components.some(
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
        // As many Components in all, so it takes as long to deliver.
        const count = (each: StructureType) =>
          each.components.reduce((sum, need) => sum + need.count, 0);
        expect(count(type)).toBe(count(original));
      },
    );
  });
});
