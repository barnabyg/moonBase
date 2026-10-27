import { describe, expect, it } from "vitest";
import { catalogue, type GroundPosition } from "../src/catalogue";

const halfWidth = catalogue.map.widthMetres / 2;
const halfDepth = catalogue.map.depthMetres / 2;

function isOnMap(position: GroundPosition, margin = 0): boolean {
  return (
    Math.abs(position.x) + margin <= halfWidth &&
    Math.abs(position.y) + margin <= halfDepth
  );
}

describe("the data catalogue", () => {
  it("has a whole-number version from 1 upwards", () => {
    expect(Number.isInteger(catalogue.version)).toBe(true);
    expect(catalogue.version).toBeGreaterThanOrEqual(1);
  });

  it("describes a base map with a positive size", () => {
    expect(catalogue.map.widthMetres).toBeGreaterThan(0);
    expect(catalogue.map.depthMetres).toBeGreaterThan(0);
  });

  it("offers game speeds with unique ids and labels, including a pause", () => {
    const { gameSpeeds } = catalogue;

    expect(new Set(gameSpeeds.map((speed) => speed.id)).size).toBe(
      gameSpeeds.length,
    );
    expect(new Set(gameSpeeds.map((speed) => speed.label)).size).toBe(
      gameSpeeds.length,
    );
    expect(
      gameSpeeds.filter((speed) => speed.gameMinutesPerRealSecond === 0),
    ).toHaveLength(1);
    for (const speed of gameSpeeds) {
      expect(Number.isFinite(speed.gameMinutesPerRealSecond)).toBe(true);
      expect(speed.gameMinutesPerRealSecond).toBeGreaterThanOrEqual(0);
    }
  });

  it("schedules Lunations whose parts last a positive, whole number of game-minutes", () => {
    const {
      daylightEarthDays,
      nightEarthDays,
      initialDaylightRemainingEarthDays,
    } = catalogue.lunation;

    for (const earthDays of [
      daylightEarthDays,
      nightEarthDays,
      initialDaylightRemainingEarthDays,
    ]) {
      expect(earthDays).toBeGreaterThan(0);
      expect(Number.isInteger(earthDays * 24 * 60)).toBe(true);
    }
    expect(initialDaylightRemainingEarthDays).toBeLessThanOrEqual(
      daylightEarthDays,
    );
  });

  it("lands the Lander with its whole footprint on the map", () => {
    const { footprintRadiusMetres } = catalogue.lander;

    expect(footprintRadiusMetres).toBeGreaterThan(0);
    expect(
      isOnMap(catalogue.landingSite.landerPosition, footprintRadiusMetres),
    ).toBe(true);
  });

  it("flies the Lander's round trip in legs that each last a positive, whole number of game-minutes", () => {
    for (const earthDays of Object.values(
      catalogue.lander.roundTripEarthDays,
    )) {
      expect(earthDays).toBeGreaterThan(0);
      expect(Number.isInteger(earthDays * 24 * 60)).toBe(true);
    }
  });

  it("blasts Plume Ejecta out past the Lander's footprint, taking a share of a Structure's Condition at a time", () => {
    const { radiusMetres, conditionLossPercent } = catalogue.plumeEjecta;

    expect(radiusMetres).toBeGreaterThan(
      catalogue.lander.footprintRadiusMetres,
    );
    expect(conditionLossPercent).toBeGreaterThan(0);
    expect(conditionLossPercent).toBeLessThanOrEqual(100);
  });

  it("places at least one Robot on the map, outside the Lander's footprint", () => {
    const { landerPosition, robotPositions } = catalogue.landingSite;

    expect(robotPositions.length).toBeGreaterThanOrEqual(1);
    for (const robot of robotPositions) {
      expect(isOnMap(robot)).toBe(true);
      expect(
        Math.hypot(robot.x - landerPosition.x, robot.y - landerPosition.y),
      ).toBeGreaterThan(catalogue.lander.footprintRadiusMetres);
    }
  });

  it("parks one Rover near the Lander, on the map and clear of the Lander, the stockpile, the Robots and the Machines", () => {
    const { landerPosition, stockpilePosition, robotPositions, machines } =
      catalogue.landingSite;
    const { rover } = catalogue;
    const distance = (a: GroundPosition, b: GroundPosition) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    expect(catalogue.landingSite.roverPositions).toHaveLength(1);
    for (const position of catalogue.landingSite.roverPositions) {
      expect(isOnMap(position, rover.footprintRadiusMetres)).toBe(true);
      // Near the Lander, but clear of it.
      expect(distance(position, landerPosition)).toBeGreaterThan(
        catalogue.lander.footprintRadiusMetres + rover.footprintRadiusMetres,
      );
      expect(distance(position, landerPosition)).toBeLessThan(15);
      expect(distance(position, stockpilePosition)).toBeGreaterThan(
        catalogue.stockpile.footprintRadiusMetres + rover.footprintRadiusMetres,
      );
      for (const robot of robotPositions) {
        expect(distance(position, robot)).toBeGreaterThan(
          rover.footprintRadiusMetres,
        );
      }
      for (const machine of machines) {
        const type = catalogue.machineTypes.find(
          (candidate) => candidate.id === machine.machineTypeId,
        );
        expect(distance(position, machine.position)).toBeGreaterThan(
          rover.footprintRadiusMetres + (type?.footprintRadiusMetres ?? 0),
        );
      }
    }
  });

  it("gives the Rover a positive size and driving speed, Dust wear as it is driven, a heater and wear from the cold", () => {
    const { rover } = catalogue;

    expect(rover.label).toBe("Rover");
    expect(rover.footprintRadiusMetres).toBeGreaterThan(0);
    expect(rover.drivingSpeedMetresPerHour).toBeGreaterThan(0);
    expect(rover.dustWearPercentPerDrivingHour).toBeGreaterThan(0);
    expect(rover.heaterKilowatts).toBeGreaterThan(0);
    expect(rover.coldWearPercentPerNightHour).toBeGreaterThan(0);
  });

  it("keeps the base's stock at a stockpile on the map, clear of the Lander, Robots and Machines, with room to walk round it", () => {
    const { landerPosition, stockpilePosition, robotPositions, machines } =
      catalogue.landingSite;
    const radius = catalogue.stockpile.footprintRadiusMetres;
    const distance = (a: GroundPosition, b: GroundPosition) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    expect(radius).toBeGreaterThan(0);
    expect(isOnMap(stockpilePosition, radius)).toBe(true);
    // Room for the Robot to stand between it and the Lander.
    expect(distance(stockpilePosition, landerPosition)).toBeGreaterThan(
      radius +
        catalogue.lander.footprintRadiusMetres +
        catalogue.robot.workingGapMetres * 2,
    );
    for (const robot of robotPositions) {
      expect(distance(stockpilePosition, robot)).toBeGreaterThan(radius);
    }
    for (const machine of machines) {
      const type = catalogue.machineTypes.find(
        (candidate) => candidate.id === machine.machineTypeId,
      );
      expect(distance(stockpilePosition, machine.position)).toBeGreaterThan(
        radius + (type?.footprintRadiusMetres ?? 0),
      );
    }
  });

  it("starts the Campaign with a Programme Grant, and sets a Payload Mass limit and a Launch fee", () => {
    expect(catalogue.programmeGrantMillionDollars).toBeGreaterThan(0);
    expect(catalogue.launch.payloadMassLimitKilograms).toBeGreaterThan(0);
    expect(catalogue.launch.feeMillionDollars).toBeGreaterThan(0);
    expect(catalogue.launch.feeMillionDollars).toBeLessThan(
      catalogue.programmeGrantMillionDollars,
    );
  });

  it("can ship every Component, and oxygen and water in set amounts, each with a mass and a price that one Launch on the Programme Grant can carry", () => {
    const { items, payloadMassLimitKilograms, feeMillionDollars } =
      catalogue.launch;

    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    const shipped = items.map(({ brings }) =>
      brings.kind === "component" ? brings.componentId : brings.stockId,
    );
    expect(shipped.toSorted()).toEqual(
      [
        ...catalogue.componentTypes.map((type) => type.id),
        ...catalogue.lifeSupportStocks.map((stock) => stock.id),
      ].toSorted(),
    );
    for (const item of items) {
      if (item.brings.kind === "life-support") {
        expect(item.brings.kilograms).toBeGreaterThan(0);
        expect(item.massKilograms).toBeGreaterThanOrEqual(
          item.brings.kilograms,
        );
      }
      expect(item.massKilograms).toBeGreaterThan(0);
      expect(item.massKilograms).toBeLessThanOrEqual(payloadMassLimitKilograms);
      expect(item.priceMillionDollars).toBeGreaterThan(0);
      expect(feeMillionDollars + item.priceMillionDollars).toBeLessThanOrEqual(
        catalogue.programmeGrantMillionDollars,
      );
    }
  });

  it("gives the Robot a positive walking speed, working gap and cable laying speed", () => {
    expect(catalogue.robot.walkingSpeedMetresPerHour).toBeGreaterThan(0);
    expect(catalogue.robot.workingGapMetres).toBeGreaterThan(0);
    expect(catalogue.robot.cableLayingSpeedMetresPerHour).toBeGreaterThan(0);
  });

  it("wears the Robot down by Dust, has it repair itself below a threshold, to a makeshift level above it without spares, and never lets it be Broken", () => {
    const {
      dustWearPercentPerHour,
      performance,
      selfRepairThresholdPercent,
      selfRepairHours,
      makeshiftRepairPercent,
      conditionFloorPercent,
    } = catalogue.robot;

    expect(dustWearPercentPerHour).toBeGreaterThanOrEqual(0);
    expect(performance.thresholdPercent).toBeGreaterThan(0);
    expect(performance.exponent).toBeGreaterThan(0);
    expect(conditionFloorPercent).toBeGreaterThan(0);
    expect(selfRepairThresholdPercent).toBeGreaterThan(conditionFloorPercent);
    expect(makeshiftRepairPercent).toBeGreaterThan(selfRepairThresholdPercent);
    // A makeshift repair leaves it working slowly.
    expect(makeshiftRepairPercent).toBeLessThan(performance.thresholdPercent);
    expect(selfRepairHours).toBeGreaterThan(0);
    expect(Number.isInteger(selfRepairHours * 60)).toBe(true);
  });

  it("describes Machines that a Robot can drive and activate", () => {
    const { machineTypes } = catalogue;
    expect(new Set(machineTypes.map((type) => type.id)).size).toBe(
      machineTypes.length,
    );

    for (const type of machineTypes) {
      expect(type.footprintRadiusMetres).toBeGreaterThan(0);
      expect(type.drivingSpeedMetresPerHour).toBeGreaterThan(0);
      expect(type.activationHours).toBeGreaterThan(0);
      expect(Number.isInteger(type.activationHours * 60)).toBe(true);
    }
  });

  it("sends Expeditions away for a positive, whole number of game-minutes, bringing back water ice, which the Robot unloads", () => {
    const { expeditions } = catalogue;

    expect(expeditions.resourceId).toBe("water-ice");
    expect(catalogue.bulkResources.map((resource) => resource.id)).toContain(
      expeditions.resourceId,
    );
    expect(expeditions.kilograms).toBeGreaterThan(0);
    expect(expeditions.awayEarthDays).toBeGreaterThan(0);
    expect(Number.isInteger(expeditions.awayEarthDays * 24 * 60)).toBe(true);
    expect(expeditions.unloadingHours).toBeGreaterThan(0);
    expect(Number.isInteger(expeditions.unloadingHours * 60)).toBe(true);
    expect(catalogue.rover.dustWearPercentPerDrivingHour).toBeGreaterThan(0);
  });

  it("has bulk resources with unique ids and labels, Regolith first", () => {
    const { bulkResources } = catalogue;

    expect(bulkResources[0]).toEqual({ id: "regolith", label: "Regolith" });
    expect(new Set(bulkResources.map((resource) => resource.id)).size).toBe(
      bulkResources.length,
    );
    expect(new Set(bulkResources.map((resource) => resource.label)).size).toBe(
      bulkResources.length,
    );
  });

  it("has the excavator, which lands with the Lander, dig Regolith up to a level at a positive rate", () => {
    const { digging } = catalogue;

    expect(digging).toMatchObject({
      machineTypeId: "excavator",
      resourceId: "regolith",
    });
    expect(
      catalogue.landingSite.machines.map((machine) => machine.machineTypeId),
    ).toContain(digging.machineTypeId);
    expect(digging.stockLevelKilograms).toBeGreaterThan(0);
    expect(digging.kilogramsPerWorkingHour).toBeGreaterThan(0);
  });

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

  it("lands every Machine a Structure needs, on the map and clear of the Lander", () => {
    const { landerPosition, machines } = catalogue.landingSite;

    const landed = machines.map((machine) => machine.machineTypeId);
    for (const type of catalogue.structureTypes) {
      for (const machineTypeId of Object.values(type.stageMachines)) {
        expect(landed).toContain(machineTypeId);
      }
    }
    for (const machine of machines) {
      const type = catalogue.machineTypes.find(
        (candidate) => candidate.id === machine.machineTypeId,
      );
      if (type === undefined) throw new Error("expected a known Machine");
      expect(isOnMap(machine.position, type.footprintRadiusMetres)).toBe(true);
      expect(
        Math.hypot(
          machine.position.x - landerPosition.x,
          machine.position.y - landerPosition.y,
        ),
      ).toBeGreaterThan(
        catalogue.lander.footprintRadiusMetres + type.footprintRadiusMetres,
      );
    }
  });

  it("has Components with unique ids and labels", () => {
    const { componentTypes } = catalogue;

    expect(new Set(componentTypes.map((type) => type.id)).size).toBe(
      componentTypes.length,
    );
    expect(new Set(componentTypes.map((type) => type.label)).size).toBe(
      componentTypes.length,
    );
  });

  it("only uses known Components, in positive whole numbers, for Structures and the starting stock", () => {
    const known = new Set(catalogue.componentTypes.map((type) => type.id));
    const counts = [
      ...catalogue.startingStock,
      ...catalogue.structureTypes.flatMap((type) => type.components),
    ];

    for (const { componentId, count } of counts) {
      expect(known).toContain(componentId);
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThan(0);
    }
  });

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
      for (const value of Object.values(type.power)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(type.lightRadiusMetres).toBeGreaterThanOrEqual(0);
      // A light needs power to shine, and only a light draws power at Night only.
      expect(type.lightRadiusMetres > 0).toBe(
        type.power.nightDrawKilowatts > 0,
      );
    }
  });

  it("has Regolith shielding, printed over a Habitat by the regolith printer from no Components", () => {
    const shielding = catalogue.structureTypes.filter(
      (type) => type.shieldsHabitat,
    );
    const habitat = catalogue.structureTypes.find((type) => type.habitat);

    expect(shielding.map((type) => type.id)).toEqual(["regolith-shielding"]);
    for (const type of shielding) {
      expect(type.components).toEqual([]);
      expect(type.stageMachines).toEqual({
        sitePreparation: "excavator",
        assembly: "regolith-printer",
      });
      expect(type.habitat).toBe(false);
      // It covers the Habitat it goes over.
      expect(type.footprintRadiusMetres).toBeGreaterThanOrEqual(
        habitat?.footprintRadiusMetres ?? Infinity,
      );
      for (const value of Object.values(type.power)) expect(value).toBe(0);
    }
  });

  it("raises Maintenance below a threshold, using spare Components that are in the starting stock and that a Launch can bring", () => {
    const {
      thresholdPercent,
      spareComponentId,
      conditionPercentPerSpareComponent,
      loadingHours,
      workHours,
    } = catalogue.maintenance;

    expect(thresholdPercent).toBeGreaterThan(0);
    expect(thresholdPercent).toBeLessThan(100);
    expect(catalogue.componentTypes.map((type) => type.id)).toContain(
      spareComponentId,
    );
    expect(
      catalogue.startingStock.find(
        (stock) => stock.componentId === spareComponentId,
      )?.count,
    ).toBeGreaterThan(0);
    expect(
      catalogue.launch.items.some(
        (item) =>
          item.brings.kind === "component" &&
          item.brings.componentId === spareComponentId,
      ),
    ).toBe(true);
    // No Structure is built from them.
    for (const type of catalogue.structureTypes) {
      expect(type.components.map((need) => need.componentId)).not.toContain(
        spareComponentId,
      );
    }
    expect(conditionPercentPerSpareComponent).toBeGreaterThan(0);
    expect(conditionPercentPerSpareComponent).toBeLessThanOrEqual(100);
    for (const hours of [loadingHours, workHours]) {
      expect(hours).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(hours * 60)).toBe(true);
    }
    expect(workHours).toBeGreaterThan(0);
  });

  it("wears every Structure down by Dust at a rate that can be 0, and cuts output below a performance threshold", () => {
    for (const type of catalogue.structureTypes) {
      expect(type.dustWearPercentPerHour).toBeGreaterThanOrEqual(0);
      expect(type.dustWearPercentPerHour).toBeLessThan(100);
    }
    const solarArray = catalogue.structureTypes.find(
      (type) => type.id === "solar-array",
    );
    expect(solarArray?.dustWearPercentPerHour).toBeGreaterThan(0);
    const { thresholdPercent, exponent } = catalogue.structurePerformance;
    expect(thresholdPercent).toBeGreaterThan(0);
    expect(thresholdPercent).toBeLessThanOrEqual(100);
    expect(exponent).toBeGreaterThan(0);
  });

  it("coats solar arrays with Dust in Daylight, cutting their output, until they are cleaned past a threshold", () => {
    const {
      percentPerDaylightHour,
      outputLossAtFullCoating,
      cleaningThresholdPercent,
      cleaningHours,
    } = catalogue.dustCoating;

    expect(percentPerDaylightHour).toBeGreaterThan(0);
    expect(outputLossAtFullCoating).toBeGreaterThan(0);
    expect(outputLossAtFullCoating).toBeLessThanOrEqual(1);
    expect(cleaningThresholdPercent).toBeGreaterThan(0);
    expect(cleaningThresholdPercent).toBeLessThan(100);
    expect(cleaningHours).toBeGreaterThan(0);
    expect(Number.isInteger(cleaningHours * 60)).toBe(true);
  });

  it("wears every Machine down by Dust as it works and is driven, and slows it below a performance threshold", () => {
    for (const type of catalogue.machineTypes) {
      expect(type.dustWearPercentPerWorkingHour).toBeGreaterThanOrEqual(0);
      expect(type.dustWearPercentPerDrivingHour).toBeGreaterThanOrEqual(0);
    }
    const { thresholdPercent, exponent } = catalogue.machinePerformance;
    expect(thresholdPercent).toBeGreaterThan(0);
    expect(thresholdPercent).toBeLessThanOrEqual(100);
    expect(exponent).toBeGreaterThan(0);
  });

  it("gives every Machine a heater it draws at Night while plugged in, and a rate the cold wears it down at without power", () => {
    for (const type of catalogue.machineTypes) {
      expect(type.heaterKilowatts).toBeGreaterThan(0);
      expect(type.coldWearPercentPerNightHour).toBeGreaterThanOrEqual(0);
    }
    const { plugInReachMetres, parkingLeadHours } = catalogue.cold;
    expect(plugInReachMetres).toBeGreaterThan(0);
    expect(parkingLeadHours).toBeGreaterThan(0);
    expect(Number.isInteger(parkingLeadHours * 60)).toBe(true);
    expect(parkingLeadHours).toBeLessThan(
      catalogue.lunation.daylightEarthDays * 24,
    );
  });

  it("schedules Micrometeorite strikes some Earth Days apart, each taking off some Condition", () => {
    const { earthDaysBetween, conditionLossPercent } =
      catalogue.micrometeorites;

    expect(earthDaysBetween.min).toBeGreaterThan(0);
    expect(earthDaysBetween.max).toBeGreaterThanOrEqual(earthDaysBetween.min);
    expect(conditionLossPercent.min).toBeGreaterThan(0);
    expect(conditionLossPercent.max).toBeGreaterThanOrEqual(
      conditionLossPercent.min,
    );
    expect(conditionLossPercent.max).toBeLessThanOrEqual(100);
  });

  it("warns as the spare Components near running out, at levels largest first, each a whole number of game-minutes", () => {
    const levels = catalogue.spareComponentWarningEarthDaysLeft;

    expect(levels.length).toBeGreaterThan(0);
    expect(levels).toEqual(levels.toSorted((a, b) => b - a));
    for (const earthDays of levels) {
      expect(earthDays).toBeGreaterThan(0);
      expect(Number.isInteger(earthDays * 24 * 60)).toBe(true);
    }
  });

  it("loses less than half of a dismantled Structure's Components", () => {
    expect(catalogue.dismantlingLossShare).toBeGreaterThanOrEqual(0);
    expect(catalogue.dismantlingLossShare).toBeLessThan(0.5);
  });

  it("has a landing pad, built by the Robot from Components a Launch can bring but the starting stock doesn't hold", () => {
    const pads = catalogue.structureTypes.filter((type) => type.landingPad);

    expect(pads).toHaveLength(1);
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
  });

  it("has an extraction plant that turns Regolith into oxygen, metals and silicon", () => {
    const plant = catalogue.structureTypes.find(
      (type) => type.id === "extraction-plant",
    )?.plant;

    expect(plant?.inputs.map((flow) => flow.resource)).toEqual([
      { kind: "bulk-resource", resourceId: "regolith" },
    ]);
    expect(plant?.outputs.map((flow) => flow.resource)).toEqual([
      { kind: "life-support", stockId: "oxygen" },
      { kind: "bulk-resource", resourceId: "metals" },
      { kind: "bulk-resource", resourceId: "silicon" },
    ]);
  });

  it("has a water-processing plant that turns water ice into water", () => {
    const plant = catalogue.structureTypes.find(
      (type) => type.id === "water-processing-plant",
    )?.plant;

    expect(plant?.inputs.map((flow) => flow.resource)).toEqual([
      { kind: "bulk-resource", resourceId: "water-ice" },
    ]);
    expect(plant?.outputs.map((flow) => flow.resource)).toEqual([
      { kind: "life-support", stockId: "water" },
    ]);
  });

  describe("the vacuum fabrication plant", () => {
    const typeOf = (id: string) =>
      catalogue.structureTypes.find((type) => type.id === id);
    const plant = typeOf("vacuum-fabrication-plant")?.plant;
    const extraction = typeOf("extraction-plant")?.plant;

    it("turns silicon into wafers, a bulk resource straight after silicon", () => {
      expect(plant?.inputs.map((flow) => flow.resource)).toEqual([
        { kind: "bulk-resource", resourceId: "silicon" },
      ]);
      expect(plant?.outputs.map((flow) => flow.resource)).toEqual([
        { kind: "bulk-resource", resourceId: "wafers" },
      ]);
      const ids = catalogue.bulkResources.map((resource) => resource.id);
      expect(ids.indexOf("wafers")).toBe(ids.indexOf("silicon") + 1);
    });

    it("keeps up with roughly one extraction plant's silicon", () => {
      const made =
        extraction?.outputs.find(
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
      expect(
        (plant?.drawKilowatts ?? 0) + (extraction?.drawKilowatts ?? 0),
      ).toBeGreaterThan(spare);
    });
  });

  describe.each(
    catalogue.structureTypes.flatMap((type) =>
      type.plant === undefined ? [] : [[type.label, type] as const],
    ),
  )("the Plant %s", (_, type) => {
    const plant = type.plant;

    it("has a recipe of known resources, at positive rates, putting out less than it takes in", () => {
      if (plant === undefined) throw new Error("expected a Plant");
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
      expect(plant.inputs.length).toBeGreaterThan(0);
      expect(plant.outputs.length).toBeGreaterThan(0);
      for (const flow of [...plant.inputs, ...plant.outputs]) {
        expect(known(flow)).toBe(true);
        expect(flow.kilogramsPerHour).toBeGreaterThan(0);
      }
      const total = (flows: typeof plant.inputs) =>
        flows.reduce((sum, flow) => sum + flow.kilogramsPerHour, 0);
      expect(total(plant.outputs)).toBeLessThanOrEqual(total(plant.inputs));
    });

    it("draws power only while it runs, and wears down by Dust while it operates", () => {
      expect(plant?.drawKilowatts).toBeGreaterThan(0);
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

  it("counts self-sufficiency over a window of a whole number of records, one Lunation by default", () => {
    const { windowLunations, recordHours } = catalogue.selfSufficiency;
    const { daylightEarthDays, nightEarthDays } = catalogue.lunation;
    const windowHours =
      windowLunations * (daylightEarthDays + nightEarthDays) * 24;

    expect(windowLunations).toBe(1);
    expect(recordHours).toBeGreaterThan(0);
    expect(Number.isInteger(recordHours * 60)).toBe(true);
    expect(Number.isInteger(windowHours / recordHours)).toBe(true);
  });

  it("has a Habitat the Mission Director can move into", () => {
    expect(
      catalogue.structureTypes
        .filter((type) => type.habitat)
        .map((type) => type.id),
    ).toEqual(["habitat"]);
  });

  it("has oxygen and water stocks that are used up, with warnings before they run out", () => {
    const stocks = catalogue.lifeSupportStocks;

    expect(stocks.map((stock) => stock.id)).toEqual(["oxygen", "water"]);
    expect(new Set(stocks.map((stock) => stock.label)).size).toBe(
      stocks.length,
    );
    for (const stock of stocks) {
      expect(stock.startingKilograms).toBeGreaterThan(0);
      expect(stock.usePerEarthDayKilograms).toBeGreaterThan(0);
      const lastsEarthDays =
        stock.startingKilograms / stock.usePerEarthDayKilograms;
      const warnings = stock.warningEarthDaysLeft;
      expect(warnings.length).toBeGreaterThan(0);
      expect([...warnings].sort((a, b) => b - a)).toEqual(warnings);
      expect(new Set(warnings).size).toBe(warnings.length);
      for (const earthDays of warnings) {
        expect(earthDays).toBeGreaterThan(0);
        expect(earthDays).toBeLessThan(lastsEarthDays);
        expect(Number.isInteger(earthDays * 24 * 60)).toBe(true);
      }
    }
  });

  it("has a Habitat that draws power, with warnings before it loses it", () => {
    for (const type of catalogue.structureTypes.filter(
      (each) => each.habitat,
    )) {
      expect(type.power.drawKilowatts).toBeGreaterThan(0);
    }
    const warnings = catalogue.habitatPowerWarningHoursLeft;
    expect(warnings.length).toBeGreaterThan(0);
    expect([...warnings].sort((a, b) => b - a)).toEqual(warnings);
    expect(new Set(warnings).size).toBe(warnings.length);
    for (const hours of warnings) {
      expect(hours).toBeGreaterThan(0);
      expect(Number.isInteger(hours * 60)).toBe(true);
    }
  });

  it("has no Radiation Dose aboard the Lander, less in a shielded Habitat than an unshielded one, and warnings before an unshielded Habitat's dose reaches the limit", () => {
    const { radiation } = catalogue;

    expect(radiation.doseRateMillisievertsPerEarthDay.lander).toBe(0);
    expect(radiation.doseRateMillisievertsPerEarthDay.habitat).toBeGreaterThan(
      0,
    );
    expect(
      radiation.doseRateMillisievertsPerEarthDay.shieldedHabitat,
    ).toBeGreaterThan(0);
    expect(
      radiation.doseRateMillisievertsPerEarthDay.shieldedHabitat,
    ).toBeLessThan(radiation.doseRateMillisievertsPerEarthDay.habitat);
    expect(radiation.doseLimitMillisieverts).toBeGreaterThan(0);
    const reachedInEarthDays =
      radiation.doseLimitMillisieverts /
      radiation.doseRateMillisievertsPerEarthDay.habitat;
    const warnings = radiation.warningEarthDaysLeft;
    expect(warnings.length).toBeGreaterThan(0);
    expect([...warnings].sort((a, b) => b - a)).toEqual(warnings);
    expect(new Set(warnings).size).toBe(warnings.length);
    for (const earthDays of warnings) {
      expect(earthDays).toBeGreaterThan(0);
      expect(earthDays).toBeLessThan(reachedInEarthDays);
      expect(Number.isInteger(earthDays * 24 * 60)).toBe(true);
    }
  });

  it("schedules Solar Particle Events that are warned of a few hours ahead, one at a time, and multiply the dose rate", () => {
    const {
      earthDaysBetween,
      durationHours,
      warningHours,
      doseRateMultiplier,
    } = catalogue.solarParticleEvents;

    for (const [min, max, minutesPerUnit] of [
      [earthDaysBetween.min, earthDaysBetween.max, 24 * 60],
      [durationHours.min, durationHours.max, 60],
    ] as const) {
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThanOrEqual(min);
      expect(Number.isInteger(min * minutesPerUnit)).toBe(true);
      expect(Number.isInteger(max * minutesPerUnit)).toBe(true);
    }
    expect(warningHours).toBeGreaterThan(0);
    expect(Number.isInteger(warningHours * 60)).toBe(true);
    // The next event's warning comes only after the last has ended.
    expect(earthDaysBetween.min * 24).toBeGreaterThan(warningHours);
    expect(doseRateMultiplier).toBeGreaterThan(1);
  });

  it.each(["solar-array", "battery-bank", "light-mast", "habitat"])(
    "brings the Components for a %s in the starting stock",
    (structureTypeId) => {
      const structureType = catalogue.structureTypes.find(
        (type) => type.id === structureTypeId,
      );

      expect(structureType).toBeDefined();
      for (const need of structureType?.components ?? []) {
        const inCargo = catalogue.startingStock
          .filter((stock) => stock.componentId === need.componentId)
          .reduce((total, stock) => total + stock.count, 0);
        expect(inCargo).toBeGreaterThanOrEqual(need.count);
      }
    },
  );
});
