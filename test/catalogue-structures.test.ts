import { describe, expect, it } from "vitest";
import {
  catalogue,
  type ResourceFlow,
  resourceOutputs,
} from "../src/catalogue";
import { shipped } from "./catalogue-helpers";

/**
 * The data catalogue's structures.ts: Structure types and how they are built,
 * Plants among them. Those that belong to a category's later Designs are in the
 * catalogue-*-designs.test.ts files.
 */

describe("the data catalogue", () => {
  it("only names known Machine types to carry out stages of Construction", () => {
    const known = new Set(catalogue.machineTypes.map((type) => type.id));

    for (const type of catalogue.structureTypes) {
      for (const machineTypeId of Object.values(type.stageMachines)) {
        expect(known).toContain(machineTypeId);
      }
    }
  });

  it.each(["solar-array", "battery-bank", "light-mast", "habitat"])(
    "has the excavator do a %s's Site Preparation, and the Robot the rest",
    (structureTypeId) => {
      const structureType = catalogue.structureTypes.find(
        (type) => type.id === structureTypeId,
      );

      expect(structureType?.stageMachines).toEqual({
        sitePreparation: "excavator",
      });
    },
  );

  it("describes Structures that can be constructed", () => {
    const { structureTypes } = catalogue;
    expect(new Set(structureTypes.map((type) => type.id)).size).toBe(
      structureTypes.length,
    );

    for (const type of structureTypes) {
      expect(type.footprintRadiusMetres).toBeGreaterThan(0);
      const { componentDelivery, ...otherStages } = type.stageHours;
      for (const hours of Object.values(otherStages)) {
        expect(hours).toBeGreaterThan(0);
        expect(Number.isInteger(hours * 60)).toBe(true);
      }
      // Only a Structure with Components has them delivered.
      expect(componentDelivery > 0).toBe(type.components.length > 0);
      expect(Number.isInteger(componentDelivery * 60)).toBe(true);
      expect(type.commissioningFailureChance).toBeGreaterThanOrEqual(0);
      expect(type.commissioningFailureChance).toBeLessThan(1);
      const { cabled, ...figures } = type.power;
      expect(cabled === undefined || typeof cabled === "boolean").toBe(true);
      for (const value of Object.values(figures)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(type.lightRadiusMetres).toBeGreaterThanOrEqual(0);
      // A light needs power to shine, a telescope power to observe, and
      // only these Night loads draw power at Night only.
      expect(type.lightRadiusMetres > 0 || type.telescope === true).toBe(
        type.power.nightDrawKilowatts > 0,
      );
    }
  });

  it("has Regolith shielding, and any other shielding, printed over a Habitat by the regolith printer from no Components", () => {
    const shielding = catalogue.structureTypes.filter(
      (type) => type.shieldsHabitat,
    );
    // A Buried Habitat takes no shielding over it.
    const habitats = catalogue.structureTypes.filter(
      (type) => type.habitat && type.buried !== true,
    );

    expect(shielding[0]?.id).toBe("regolith-shielding");
    for (const type of shielding) {
      expect(type.components).toEqual([]);
      expect(type.stageMachines).toEqual({
        sitePreparation: "excavator",
        assembly: "regolith-printer",
      });
      expect(type.habitat).toBe(false);
      // It covers any Habitat it goes over.
      expect(habitats.length).toBeGreaterThan(0);
      for (const habitat of habitats) {
        expect(type.footprintRadiusMetres).toBeGreaterThanOrEqual(
          habitat.footprintRadiusMetres,
        );
      }
      for (const value of Object.values(type.power)) expect(value).toBe(0);
    }
  });

  it("loses less than half of a dismantled Structure's Components", () => {
    expect(catalogue.dismantlingLossShare).toBeGreaterThanOrEqual(0);
    expect(catalogue.dismantlingLossShare).toBeLessThan(0.5);
  });

  it("has a landing pad behind a starting Design, built by the Robot from Components a Launch can bring but the starting stock doesn't hold", () => {
    const pads = catalogue.structureTypes.filter(
      (type) =>
        type.landingPad &&
        catalogue.designs.find((design) => design.id === type.designId)
          ?.starting === true,
    );

    expect(pads).toHaveLength(1);
    // The first, so that it is the one the build menu offers first.
    expect(catalogue.structureTypes.find((type) => type.landingPad)).toBe(
      pads[0],
    );
    const [pad] = pads;
    expect(pad?.footprintRadiusMetres).toBeGreaterThan(
      catalogue.lander.footprintRadiusMetres,
    );
    expect(pad?.components.length).toBeGreaterThan(0);
    for (const need of pad?.components ?? []) {
      expect(
        catalogue.launch.items.some(
          (item) =>
            item.brings.kind === "component" &&
            item.brings.componentId === need.componentId,
        ),
      ).toBe(true);
      expect(
        catalogue.startingStock.some(
          (stock) => stock.componentId === need.componentId,
        ),
      ).toBe(false);
    }
    expect(pad?.stageMachines.sitePreparation).toBeDefined();
    expect(catalogue.lander.cargoHandlingHours).toBeGreaterThan(0);
    expect(Number.isInteger(catalogue.lander.cargoHandlingHours * 60)).toBe(
      true,
    );
    expect(catalogue.lander.exportHandlingHours).toBeGreaterThan(0);
    expect(Number.isInteger(catalogue.lander.exportHandlingHours * 60)).toBe(
      true,
    );
  });

  describe("the extraction plant", () => {
    const recipes =
      catalogue.structureTypes.find((type) => type.id === "extraction-plant")
        ?.recipes ?? [];
    const recipeOf = (id: string) => recipes.find((recipe) => recipe.id === id);
    const rateOf = (id: string, resource: string) =>
      resourceOutputs(recipeOf(id)).find((flow) =>
        flow.resource.kind === "bulk-resource"
          ? flow.resource.resourceId === resource
          : flow.resource.stockId === resource,
      )?.kilogramsPerHour ?? Number.NaN;
    const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
    const daylightHours = daylightEarthDays * 24;
    // What the Mission Director breathes in a Lunation, which the plant has
    // to make in its Daylight, the only time it runs.
    const oxygenUsed =
      (catalogue.lifeSupportStocks.find((stock) => stock.id === "oxygen")
        ?.usePerEarthDayKilograms ?? Number.NaN) *
      (daylightEarthDays + nightEarthDays);
    const siliconTaken =
      catalogue.structureTypes.find(
        (type) => type.id === "vacuum-fabrication-plant",
      )?.recipes?.[0]?.inputs[0]?.kilogramsPerHour ?? Number.NaN;

    it("turns Regolith into oxygen, metals and silicon, by default mostly oxygen, or mostly metals and silicon", () => {
      expect(recipes.map((recipe) => [recipe.id, recipe.label])).toEqual([
        ["oxygen", "Oxygen"],
        ["metals-and-silicon", "Metals and silicon"],
      ]);
      for (const recipe of recipes) {
        expect(recipe.inputs.map((flow) => flow.resource)).toEqual([
          { kind: "bulk-resource", resourceId: "regolith" },
        ]);
        expect(resourceOutputs(recipe).map((flow) => flow.resource)).toEqual([
          { kind: "life-support", stockId: "oxygen" },
          { kind: "bulk-resource", resourceId: "metals" },
          { kind: "bulk-resource", resourceId: "silicon" },
        ]);
      }
      for (const resource of ["metals", "silicon"]) {
        expect(rateOf("oxygen", "oxygen")).toBeGreaterThan(
          rateOf("oxygen", resource),
        );
        expect(rateOf("metals-and-silicon", resource)).toBeGreaterThan(
          rateOf("metals-and-silicon", "oxygen"),
        );
      }
    });

    it("keeps the Mission Director self-sufficient in oxygen running for oxygen, but not for metals and silicon", () => {
      expect(rateOf("oxygen", "oxygen") * daylightHours).toBeGreaterThan(
        oxygenUsed,
      );
      expect(
        rateOf("metals-and-silicon", "oxygen") * daylightHours,
      ).toBeLessThan(oxygenUsed);
    });

    it("feeds a vacuum fabrication plant running for metals and silicon, but not for oxygen", () => {
      expect(rateOf("metals-and-silicon", "silicon")).toBeGreaterThanOrEqual(
        siliconTaken,
      );
      expect(rateOf("oxygen", "silicon")).toBeLessThan(siliconTaken);
    });

    it("can't do both: running for oxygen just long enough for self-sufficiency leaves too little Daylight for a vacuum fabrication plant's silicon", () => {
      const oxygenRate = rateOf("oxygen", "oxygen");
      const otherRate = rateOf("metals-and-silicon", "oxygen");
      // The share of the Daylight it must run for oxygen.
      const share =
        (oxygenUsed / daylightHours - otherRate) / (oxygenRate - otherRate);
      const silicon =
        share * rateOf("oxygen", "silicon") +
        (1 - share) * rateOf("metals-and-silicon", "silicon");

      expect(share).toBeGreaterThan(0);
      expect(share).toBeLessThan(1);
      expect(silicon).toBeLessThan(siliconTaken * 0.9);
    });
  });

  it("has a water-processing plant that turns water ice into water", () => {
    const plant = catalogue.structureTypes.find(
      (type) => type.id === "water-processing-plant",
    )?.recipes?.[0];

    expect(plant?.inputs.map((flow) => flow.resource)).toEqual([
      { kind: "bulk-resource", resourceId: "water-ice" },
    ]);
    expect(resourceOutputs(plant).map((flow) => flow.resource)).toEqual([
      { kind: "life-support", stockId: "water" },
    ]);
  });

  describe("the vacuum fabrication plant", () => {
    const typeOf = (id: string) =>
      catalogue.structureTypes.find((type) => type.id === id);
    const plant = typeOf("vacuum-fabrication-plant")?.recipes?.[0];
    const extraction = typeOf("extraction-plant")?.recipes?.find(
      (recipe) => recipe.id === "metals-and-silicon",
    );

    it("turns silicon into wafers, a bulk resource straight after silicon", () => {
      expect(plant?.inputs.map((flow) => flow.resource)).toEqual([
        { kind: "bulk-resource", resourceId: "silicon" },
      ]);
      expect(resourceOutputs(plant).map((flow) => flow.resource)).toEqual([
        { kind: "bulk-resource", resourceId: "wafers" },
      ]);
      const ids = catalogue.bulkResources.map((resource) => resource.id);
      expect(ids.indexOf("wafers")).toBe(ids.indexOf("silicon") + 1);
    });

    it("keeps up with roughly one extraction plant's silicon, running for metals and silicon", () => {
      const made =
        resourceOutputs(extraction).find(
          (flow) =>
            flow.resource.kind === "bulk-resource" &&
            flow.resource.resourceId === "silicon",
        )?.kilogramsPerHour ?? 0;
      const taken = plant?.inputs[0]?.kilogramsPerHour ?? Infinity;

      expect(taken).toBeLessThanOrEqual(made);
      expect(taken).toBeGreaterThanOrEqual(made * 0.75);
    });

    it("runs on what the starting solar array can spare, but not with an extraction plant too", () => {
      const draw = (id: string) => typeOf(id)?.power.drawKilowatts ?? 0;
      const spare =
        (typeOf("solar-array")?.power.generationKilowatts ?? 0) -
        draw("solar-array") -
        draw("battery-bank") -
        draw("habitat");

      expect(plant?.drawKilowatts).toBeLessThanOrEqual(spare);
      for (const recipe of typeOf("extraction-plant")?.recipes ?? []) {
        expect(
          (plant?.drawKilowatts ?? 0) + recipe.drawKilowatts,
        ).toBeGreaterThan(spare);
      }
    });
  });

  describe("the circuit board plant", () => {
    const typeOf = (id: string) =>
      catalogue.structureTypes.find((type) => type.id === id);
    const plant = typeOf("circuit-board-plant")?.recipes?.[0];
    const rateOf = (
      flows: readonly ResourceFlow[] | undefined,
      resourceId: string,
    ) =>
      flows?.find(
        (flow) =>
          flow.resource.kind === "bulk-resource" &&
          flow.resource.resourceId === resourceId,
      )?.kilogramsPerHour ?? Number.NaN;
    const priceOf = (resourceId: string) =>
      catalogue.exports.find((sold) => sold.resourceId === resourceId)
        ?.priceMillionDollarsPerKilogram ?? Number.NaN;

    it("turns wafers and metals into circuit boards, a bulk resource straight after wafers", () => {
      expect(plant?.inputs.map((flow) => flow.resource)).toEqual([
        { kind: "bulk-resource", resourceId: "wafers" },
        { kind: "bulk-resource", resourceId: "metals" },
      ]);
      expect(resourceOutputs(plant).map((flow) => flow.resource)).toEqual([
        { kind: "bulk-resource", resourceId: "circuit-boards" },
      ]);
      const ids = catalogue.bulkResources.map((resource) => resource.id);
      expect(ids.indexOf("circuit-boards")).toBe(ids.indexOf("wafers") + 1);
    });

    it("keeps up with roughly one vacuum fabrication plant's wafers, and takes less metals than an extraction plant makes running for metals and silicon", () => {
      const wafersMade = rateOf(
        resourceOutputs(typeOf("vacuum-fabrication-plant")?.recipes?.[0]),
        "wafers",
      );
      const wafersTaken = rateOf(plant?.inputs, "wafers");

      expect(wafersTaken).toBeLessThanOrEqual(wafersMade);
      expect(wafersTaken).toBeGreaterThanOrEqual(wafersMade * 0.75);
      expect(rateOf(plant?.inputs, "metals")).toBeLessThanOrEqual(
        rateOf(
          resourceOutputs(
            typeOf("extraction-plant")?.recipes?.find(
              (recipe) => recipe.id === "metals-and-silicon",
            ),
          ),
          "metals",
        ),
      );
    });

    it("runs with an extraction plant and a vacuum fabrication plant on what two solar arrays can spare", () => {
      const draw = (id: string) => typeOf(id)?.power.drawKilowatts ?? 0;
      const spare =
        2 * (typeOf("solar-array")?.power.generationKilowatts ?? 0) -
        2 * draw("solar-array") -
        draw("battery-bank") -
        draw("habitat");
      const plants = [
        "extraction-plant",
        "vacuum-fabrication-plant",
        "circuit-board-plant",
      ].reduce(
        (sum, id) =>
          sum +
          Math.max(
            ...(typeOf(id)?.recipes ?? []).map(
              (recipe) => recipe.drawKilowatts,
            ),
          ),
        0,
      );

      expect(plants).toBeLessThanOrEqual(spare);
    });

    it("makes circuit boards, an Export that sells a full Return Mass for clearly more than one of wafers", () => {
      const returnMass = catalogue.lander.returnMassKilograms;

      expect(priceOf("circuit-boards") * returnMass).toBeGreaterThanOrEqual(
        1.5 * priceOf("wafers") * returnMass,
      );
    });

    it("earns more from the wafers it takes in, as circuit boards, than they would sell for as wafers", () => {
      expect(
        priceOf("circuit-boards") *
          rateOf(resourceOutputs(plant), "circuit-boards"),
      ).toBeGreaterThan(priceOf("wafers") * rateOf(plant?.inputs, "wafers"));
    });
  });

  describe.each(
    catalogue.structureTypes.flatMap((type) =>
      type.recipes === undefined ? [] : [[type.label, type] as const],
    ),
  )("the Plant %s", (_, type) => {
    const recipes = type.recipes ?? [];

    it("has at least one recipe, each with an id of its own and a label", () => {
      expect(recipes.length).toBeGreaterThan(0);
      expect(new Set(recipes.map((recipe) => recipe.id)).size).toBe(
        recipes.length,
      );
      expect(new Set(recipes.map((recipe) => recipe.label)).size).toBe(
        recipes.length,
      );
      for (const recipe of recipes) {
        expect(recipe.id).not.toBe("");
        expect(recipe.label).not.toBe("");
      }
    });

    it.each(recipes.map((recipe) => [recipe.label, recipe] as const))(
      "has a recipe %s of known resources, at positive rates, putting out less than it takes in, and drawing power",
      (_label, plant) => {
        const known = (flow: (typeof plant.inputs)[number]) =>
          flow.resource.kind === "bulk-resource"
            ? catalogue.bulkResources.some(
                (resource) =>
                  flow.resource.kind === "bulk-resource" &&
                  resource.id === flow.resource.resourceId,
              )
            : catalogue.lifeSupportStocks.some(
                (stock) =>
                  flow.resource.kind === "life-support" &&
                  stock.id === flow.resource.stockId,
              );
        // Only what comes straight from the ground takes nothing in.
        if (plant.id !== "water-ice") {
          expect(plant.inputs.length).toBeGreaterThan(0);
        }
        expect(plant.outputs.length).toBeGreaterThan(0);
        for (const flow of [...plant.inputs, ...resourceOutputs(plant)]) {
          expect(known(flow)).toBe(true);
          expect(flow.kilogramsPerHour).toBeGreaterThan(0);
        }
        const total = (flows: typeof plant.inputs) =>
          flows.reduce((sum, flow) => sum + flow.kilogramsPerHour, 0);
        if (plant.inputs.length > 0) {
          expect(total(resourceOutputs(plant))).toBeLessThanOrEqual(
            total(plant.inputs),
          );
        }
        expect(plant.drawKilowatts).toBeGreaterThan(0);
      },
    );

    it("draws power only while it runs, and wears down by Dust while it operates", () => {
      expect(type.power).toEqual({
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
      });
      expect(type.dustWearPercentPerHour).toBeGreaterThan(0);
    });

    it("is built from Components a Launch can bring, a full set within one Launch's Payload Mass, that the starting stock doesn't hold", () => {
      expect(type.components.length).toBeGreaterThan(0);
      let mass = 0;
      for (const need of type.components) {
        const item = catalogue.launch.items.find(
          (candidate) =>
            candidate.brings.kind === "component" &&
            candidate.brings.componentId === need.componentId,
        );
        expect(item).toBeDefined();
        mass += (item?.massKilograms ?? Infinity) * need.count;
        expect(
          catalogue.startingStock.some(
            (stock) => stock.componentId === need.componentId,
          ),
        ).toBe(false);
      }
      expect(mass).toBeLessThanOrEqual(
        catalogue.launch.payloadMassLimitKilograms,
      );
      expect(type.stageMachines.sitePreparation).toBeDefined();
    });
  });

  describe("the parking area", () => {
    const area = catalogue.structureTypes.find(
      (type) => type.id === "parking-area",
    );
    if (area?.parking === undefined) {
      throw new Error("expected a parking area with bays");
    }
    const { bayRadiusMetres, bayOffsets } = area.parking;
    const largest = Math.max(
      catalogue.rover.footprintRadiusMetres,
      ...catalogue.machineTypes.map((type) => type.footprintRadiusMetres),
    );

    it("is the only Structure cabled though it generates, stores and draws nothing", () => {
      expect(
        catalogue.structureTypes.filter((type) => type.power.cabled === true),
      ).toEqual([area]);
    });

    it("is the only Structure with bays, behind a Mobility Design there from the start", () => {
      expect(
        catalogue.structureTypes.filter((type) => type.parking !== undefined),
      ).toEqual([area]);
      expect(
        catalogue.designs.find((design) => design.id === area.designId),
      ).toMatchObject({
        id: "parking-areas",
        category: "mobility",
        starting: true,
        scienceCost: 0,
      });
    });

    it("has a bay for every Machine and the Rover, each holding the largest of them, inside its footprint and clear of the others", () => {
      expect(bayOffsets.length).toBeGreaterThanOrEqual(
        catalogue.landingSite.machines.length +
          catalogue.landingSite.roverPositions.length,
      );
      expect(bayRadiusMetres).toBeGreaterThanOrEqual(largest);
      for (const [index, bay] of bayOffsets.entries()) {
        expect(Math.hypot(bay.x, bay.y) + bayRadiusMetres).toBeLessThanOrEqual(
          area.footprintRadiusMetres,
        );
        for (const other of bayOffsets.slice(index + 1)) {
          expect(
            Math.hypot(bay.x - other.x, bay.y - other.y),
          ).toBeGreaterThanOrEqual(2 * bayRadiusMetres);
        }
      }
    });

    it("is used only within a detour of the nearest powered Structure that the slowest Machine can drive, and the Robot walk back, in the lead time before Night", () => {
      const { bayDetourMetres, parkingLeadHours } = catalogue.cold;
      const slowest = Math.min(
        catalogue.rover.drivingSpeedMetresPerHour,
        ...catalogue.machineTypes.map((type) => type.drivingSpeedMetresPerHour),
      );

      expect(bayDetourMetres).toBeGreaterThan(0);
      expect(
        bayDetourMetres / slowest +
          bayDetourMetres / catalogue.robot.walkingSpeedMetresPerHour,
      ).toBeLessThanOrEqual(parkingLeadHours);
    });

    it("draws no power itself but is cabled for its sockets, and is cheap: built by the Robot from a socket for each bay, which a Launch brings for about what a Light Mast costs, in a few hours", () => {
      expect(area.power).toEqual({
        generationKilowatts: 0,
        storageKilowattHours: 0,
        drawKilowatts: 0,
        nightDrawKilowatts: 0,
        cabled: true,
      });
      expect(area.components).toEqual([
        { componentId: "bay-socket", count: bayOffsets.length },
      ]);
      expect(area.stageMachines.assembly).toBeUndefined();
      const mast = catalogue.structureTypes.find(
        (type) => type.id === "light-mast",
      );
      if (mast === undefined) throw new Error("expected a Light Mast");
      const cost = shipped(area);
      const mastCost = shipped(mast);
      expect(cost.kilograms).toBeLessThanOrEqual(2 * mastCost.kilograms);
      expect(cost.millionDollars).toBeLessThanOrEqual(
        2 * mastCost.millionDollars,
      );
      const hours = Object.values(area.stageHours).reduce((a, b) => a + b, 0);
      expect(hours).toBeLessThanOrEqual(6);
    });
  });

  it("has Habitats the Mission Director can move into: the inflatable Habitat, the hardened one and the Buried one", () => {
    expect(
      catalogue.structureTypes
        .filter((type) => type.habitat)
        .map((type) => type.id),
    ).toEqual(["habitat", "hardened-habitat", "buried-habitat"]);
  });
});
