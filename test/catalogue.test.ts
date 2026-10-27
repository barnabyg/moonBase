import { describe, expect, it } from "vitest";
import {
  catalogue,
  type GroundPosition,
  type ResourceFlow,
  type StructureType,
} from "../src/catalogue";

const halfWidth = catalogue.map.widthMetres / 2;
const halfDepth = catalogue.map.depthMetres / 2;

/**
 * The Designs that must be unlocked by the time a Design is: the starting
 * ones, the Design itself and every Design it needs first, however far back.
 */
function designsUnlockedWith(designId: string): Set<string> {
  const unlocked = new Set(
    catalogue.designs
      .filter((design) => design.starting)
      .map((design) => design.id),
  );
  const visited = new Set<string>();
  const waiting = [designId];
  for (let id = waiting.pop(); id !== undefined; id = waiting.pop()) {
    if (visited.has(id)) continue;
    visited.add(id);
    unlocked.add(id);
    const design = catalogue.designs.find((candidate) => candidate.id === id);
    waiting.push(...(design?.prerequisiteDesignIds ?? []));
  }
  return unlocked;
}

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

  it("can ship every Component, oxygen and water in set amounts, and a Robot, each with a mass and a price that one Launch on the Programme Grant can carry", () => {
    const { items, payloadMassLimitKilograms, feeMillionDollars } =
      catalogue.launch;

    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    const shipped = items.map(({ brings }) => {
      switch (brings.kind) {
        case "component":
          return brings.componentId;
        case "life-support":
          return brings.stockId;
        case "robot":
          return "a Robot";
      }
    });
    expect(shipped.toSorted()).toEqual(
      [
        ...catalogue.componentTypes.map((type) => type.id),
        ...catalogue.lifeSupportStocks.map((stock) => stock.id),
        "a Robot",
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

  it("gives the Lander a Return Mass well short of a Launch's Payload Mass", () => {
    expect(catalogue.lander.returnMassKilograms).toBeGreaterThan(0);
    expect(catalogue.lander.returnMassKilograms).toBeLessThan(
      catalogue.launch.payloadMassLimitKilograms,
    );
  });

  it("lists the Exports, wafers among them, each a different bulk resource with a price per kilogram", () => {
    const { exports } = catalogue;
    const ids = exports.map((sold) => sold.resourceId);

    expect(ids).toContain("wafers");
    expect(new Set(ids).size).toBe(ids.length);
    for (const sold of exports) {
      expect(catalogue.bulkResources.map((resource) => resource.id)).toContain(
        sold.resourceId,
      );
      expect(sold.priceMillionDollarsPerKilogram).toBeGreaterThan(0);
    }
  });

  it("sells a full Return Mass of wafers for no more than a Launch's fee, so wafers alone never pay for what a Launch brings", () => {
    const wafers = catalogue.exports.find(
      (sold) => sold.resourceId === "wafers",
    );

    expect(
      (wafers?.priceMillionDollarsPerKilogram ?? Infinity) *
        catalogue.lander.returnMassKilograms,
    ).toBeLessThanOrEqual(catalogue.launch.feeMillionDollars);
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

  it("ships exactly one Robot item, a few hundred kilograms, behind a Mobility Design that isn't a starting one, and has it climb down from the Lander in a whole number of game-minutes", () => {
    const robots = catalogue.launch.items.filter(
      (item) => item.brings.kind === "robot",
    );

    expect(robots).toHaveLength(1);
    const [robot] = robots;
    expect(robot?.massKilograms).toBeGreaterThanOrEqual(100);
    expect(robot?.massKilograms).toBeLessThan(1000);
    expect(
      catalogue.designs.find((design) => design.id === robot?.designId),
    ).toMatchObject({ category: "mobility", starting: false });
    const { climbingDownHours } = catalogue.robot;
    expect(climbingDownHours).toBeGreaterThan(0);
    expect(Number.isInteger(climbingDownHours * 60)).toBe(true);
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

  it("has a handful of Research Tasks with unique ids and labels, each lasting a positive, whole number of game-minutes and paying a whole amount of Science", () => {
    const { researchTasks } = catalogue;

    expect(researchTasks.length).toBeGreaterThanOrEqual(4);
    expect(new Set(researchTasks.map((task) => task.id)).size).toBe(
      researchTasks.length,
    );
    expect(new Set(researchTasks.map((task) => task.label)).size).toBe(
      researchTasks.length,
    );
    for (const task of researchTasks) {
      expect(task.lengthHours).toBeGreaterThan(0);
      expect(Number.isInteger(task.lengthHours * 60)).toBe(true);
      expect(Number.isSafeInteger(task.science)).toBe(true);
      expect(task.science).toBeGreaterThan(0);
    }
  });

  it("has some Research Tasks that take hours and some that take Earth Days, the longer ones paying more", () => {
    const lengths = catalogue.researchTasks.map((task) => task.lengthHours);

    expect(lengths.some((hours) => hours < 24)).toBe(true);
    expect(lengths.some((hours) => hours >= 3 * 24)).toBe(true);
    const byLength = [...catalogue.researchTasks].sort(
      (a, b) => a.lengthHours - b.lengthHours,
    );
    for (const [index, task] of byLength.entries()) {
      const shorter = byLength[index - 1];
      if (shorter !== undefined && shorter.lengthHours < task.lengthHours) {
        expect(task.science).toBeGreaterThan(shorter.science);
      }
    }
  });

  it("has Designs with unique ids and labels, each with a description, one of the six categories, a whole Science cost and prerequisites the Tech Tree has", () => {
    const { designs } = catalogue;
    const ids = new Set(designs.map((design) => design.id));

    expect(ids.size).toBe(designs.length);
    expect(new Set(designs.map((design) => design.label)).size).toBe(
      designs.length,
    );
    for (const design of designs) {
      expect(design.description).not.toBe("");
      expect([
        "power",
        "construction",
        "protection",
        "life-support",
        "industry",
        "mobility",
      ]).toContain(design.category);
      expect(Number.isSafeInteger(design.scienceCost)).toBe(true);
      expect(design.scienceCost).toBeGreaterThanOrEqual(0);
      expect(new Set(design.prerequisiteDesignIds).size).toBe(
        design.prerequisiteDesignIds.length,
      );
      for (const id of design.prerequisiteDesignIds) {
        expect(ids).toContain(id);
        expect(id).not.toBe(design.id);
      }
    }
  });

  it("starts with some Designs unlocked, which need nothing first and cost nothing, and has a few more that cost Science to unlock", () => {
    const starting = catalogue.designs.filter((design) => design.starting);
    const others = catalogue.designs.filter((design) => !design.starting);

    expect(starting.length).toBeGreaterThan(0);
    for (const design of starting) {
      expect(design.prerequisiteDesignIds).toEqual([]);
      expect(design.scienceCost).toBe(0);
    }
    expect(others.length).toBeGreaterThanOrEqual(3);
    for (const design of others) expect(design.scienceCost).toBeGreaterThan(0);
  });

  it("puts every Structure type and Launch item in exactly one Design the Tech Tree has", () => {
    const ids = new Set(catalogue.designs.map((design) => design.id));

    for (const { designId } of [
      ...catalogue.structureTypes,
      ...catalogue.launch.items,
    ]) {
      expect(ids).toContain(designId);
    }
  });

  it("has at least one Structure type, with Launch items, behind a Design that isn't a starting one", () => {
    const locked = (designId: string) =>
      catalogue.designs.find((design) => design.id === designId)?.starting ===
      false;

    expect(catalogue.structureTypes.some((type) => locked(type.designId))).toBe(
      true,
    );
    expect(catalogue.launch.items.some((item) => locked(item.designId))).toBe(
      true,
    );
  });

  it("lets a Launch bring every Structure type's Components once its Design is unlocked, a full set within one Launch's Payload Mass", () => {
    for (const type of catalogue.structureTypes) {
      const unlocked = designsUnlockedWith(type.designId);
      let mass = 0;
      for (const need of type.components) {
        const item = catalogue.launch.items.find(
          (candidate) =>
            candidate.brings.kind === "component" &&
            candidate.brings.componentId === need.componentId,
        );
        expect(item).toBeDefined();
        expect(unlocked).toContain(item?.designId);
        mass += (item?.massKilograms ?? Infinity) * need.count;
      }
      expect(mass).toBeLessThanOrEqual(
        catalogue.launch.payloadMassLimitKilograms,
      );
    }
  });

  it("has no cycles in the Tech Tree, and every Design can be reached from the starting Designs", () => {
    // Unlocks in turn every Design whose prerequisites are all unlocked.
    // A Design on a cycle, or after one, is never reached.
    const reached = new Set(
      catalogue.designs
        .filter((design) => design.starting)
        .map((design) => design.id),
    );
    for (let grew = true; grew;) {
      grew = false;
      for (const design of catalogue.designs) {
        if (
          !reached.has(design.id) &&
          design.prerequisiteDesignIds.every((id) => reached.has(id))
        ) {
          reached.add(design.id);
          grew = true;
        }
      }
    }

    expect([...reached].sort()).toEqual(
      catalogue.designs.map((design) => design.id).sort(),
    );
  });

  it("gates some Research Tasks behind a Design the Tech Tree has, so the tree and the research list grow together", () => {
    const ids = new Set(catalogue.designs.map((design) => design.id));
    const gated = catalogue.researchTasks.filter(
      (task) => task.requiresDesignId !== undefined,
    );

    expect(gated.length).toBeGreaterThan(0);
    for (const task of gated) expect(ids).toContain(task.requiresDesignId);
  });

  it("has Research Tasks that pay at least as much Science as every Design beyond the starting ones costs", () => {
    const paid = catalogue.researchTasks.reduce(
      (sum, task) => sum + task.science,
      0,
    );
    const cost = catalogue.designs
      .filter((design) => !design.starting)
      .reduce((sum, design) => sum + design.scienceCost, 0);

    expect(paid).toBeGreaterThanOrEqual(cost);
  });

  it("lets a player unlock every Design and complete every Research Task, completing all the Research Tasks on offer, then unlocking the cheapest Design they can, in turn", () => {
    // A Research Task gated by a Design can only pay for that Design's
    // successors, so the total alone isn't enough: this plays the tree.
    const unlocked = new Set(
      catalogue.designs
        .filter((design) => design.starting)
        .map((design) => design.id),
    );
    const completed = new Set<string>();
    let science = 0;
    for (let progress = true; progress;) {
      progress = false;
      for (const task of catalogue.researchTasks) {
        const offered =
          task.requiresDesignId === undefined ||
          unlocked.has(task.requiresDesignId);
        if (offered && !completed.has(task.id)) {
          completed.add(task.id);
          science += task.science;
          progress = true;
        }
      }
      const next = catalogue.designs
        .filter(
          (design) =>
            !unlocked.has(design.id) &&
            design.scienceCost <= science &&
            design.prerequisiteDesignIds.every((id) => unlocked.has(id)),
        )
        .sort((a, b) => a.scienceCost - b.scienceCost)[0];
      if (next !== undefined) {
        unlocked.add(next.id);
        science -= next.scienceCost;
        progress = true;
      }
    }

    expect(unlocked.size).toBe(catalogue.designs.length);
    expect(completed.size).toBe(catalogue.researchTasks.length);
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

  it("has Regolith shielding, and any other shielding, printed over a Habitat by the regolith printer from no Components", () => {
    const shielding = catalogue.structureTypes.filter(
      (type) => type.shieldsHabitat,
    );
    const habitats = catalogue.structureTypes.filter((type) => type.habitat);

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

  it("gives every Structure type a share, from 0 to 1, of the Hazards the rules set the same for all, the whole of each but for the hardened Structures of the Protection Designs", () => {
    for (const type of catalogue.structureTypes) {
      const category = catalogue.designs.find(
        (design) => design.id === type.designId,
      )?.category;
      for (const share of Object.values(type.hazardMultipliers)) {
        expect(share).toBeGreaterThan(0);
        expect(share).toBeLessThanOrEqual(1);
        if (category !== "protection") expect(share).toBe(1);
      }
    }
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
      recipeOf(id)?.outputs.find((flow) =>
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
        expect(recipe.outputs.map((flow) => flow.resource)).toEqual([
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
    expect(plant?.outputs.map((flow) => flow.resource)).toEqual([
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
      expect(plant?.outputs.map((flow) => flow.resource)).toEqual([
        { kind: "bulk-resource", resourceId: "wafers" },
      ]);
      const ids = catalogue.bulkResources.map((resource) => resource.id);
      expect(ids.indexOf("wafers")).toBe(ids.indexOf("silicon") + 1);
    });

    it("keeps up with roughly one extraction plant's silicon, running for metals and silicon", () => {
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
      expect(plant?.outputs.map((flow) => flow.resource)).toEqual([
        { kind: "bulk-resource", resourceId: "circuit-boards" },
      ]);
      const ids = catalogue.bulkResources.map((resource) => resource.id);
      expect(ids.indexOf("circuit-boards")).toBe(ids.indexOf("wafers") + 1);
    });

    it("keeps up with roughly one vacuum fabrication plant's wafers, and takes less metals than an extraction plant makes running for metals and silicon", () => {
      const wafersMade = rateOf(
        typeOf("vacuum-fabrication-plant")?.recipes?.[0]?.outputs,
        "wafers",
      );
      const wafersTaken = rateOf(plant?.inputs, "wafers");

      expect(wafersTaken).toBeLessThanOrEqual(wafersMade);
      expect(wafersTaken).toBeGreaterThanOrEqual(wafersMade * 0.75);
      expect(rateOf(plant?.inputs, "metals")).toBeLessThanOrEqual(
        rateOf(
          typeOf("extraction-plant")?.recipes?.find(
            (recipe) => recipe.id === "metals-and-silicon",
          )?.outputs,
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
        priceOf("circuit-boards") * rateOf(plant?.outputs, "circuit-boards"),
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
        expect(plant.inputs.length).toBeGreaterThan(0);
        expect(plant.outputs.length).toBeGreaterThan(0);
        for (const flow of [...plant.inputs, ...plant.outputs]) {
          expect(known(flow)).toBe(true);
          expect(flow.kilogramsPerHour).toBeGreaterThan(0);
        }
        const total = (flows: typeof plant.inputs) =>
          flows.reduce((sum, flow) => sum + flow.kilogramsPerHour, 0);
        expect(total(plant.outputs)).toBeLessThanOrEqual(total(plant.inputs));
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

  describe("the large battery bank", () => {
    const structureType = (id: string) => {
      const found = catalogue.structureTypes.find((type) => type.id === id);
      if (found === undefined) throw new Error(`expected a ${id}`);
      return found;
    };
    const large = structureType("large-battery-bank");
    const small = structureType("battery-bank");
    /** The mass and price of a full set of a Structure's Components by Launch. */
    const shipped = (type: StructureType) =>
      type.components.reduce(
        (total, need) => {
          const item = catalogue.launch.items.find(
            (candidate) =>
              candidate.brings.kind === "component" &&
              candidate.brings.componentId === need.componentId,
          );
          return {
            kilograms:
              total.kilograms + (item?.massKilograms ?? Infinity) * need.count,
            millionDollars:
              total.millionDollars +
              (item?.priceMillionDollars ?? Infinity) * need.count,
          };
        },
        { kilograms: 0, millionDollars: 0 },
      );

    it("belongs to Large battery banks, a Power Design that needs Battery banks first", () => {
      expect(
        catalogue.designs.find((design) => design.id === large.designId),
      ).toMatchObject({
        category: "power",
        starting: false,
        prerequisiteDesignIds: ["battery-banks"],
      });
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

    it("has sintered Regolith shielding printed like Regolith shielding, but in under half the hours", () => {
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
      expect(hours(sintered)).toBeLessThan(hours(printed) / 2);
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
    const protection = catalogue.designs.filter(
      (design) => design.category === "protection" && !design.starting,
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

  it("has Habitats the Mission Director can move into: the inflatable Habitat and the hardened one", () => {
    expect(
      catalogue.structureTypes
        .filter((type) => type.habitat)
        .map((type) => type.id),
    ).toEqual(["habitat", "hardened-habitat"]);
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
