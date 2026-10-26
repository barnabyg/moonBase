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

  it("gives the Robot a positive walking speed, working gap and cable laying speed", () => {
    expect(catalogue.robot.walkingSpeedMetresPerHour).toBeGreaterThan(0);
    expect(catalogue.robot.workingGapMetres).toBeGreaterThan(0);
    expect(catalogue.robot.cableLayingSpeedMetresPerHour).toBeGreaterThan(0);
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

  it("only uses known Components, in positive whole numbers, for Structures and the starting cargo", () => {
    const known = new Set(catalogue.componentTypes.map((type) => type.id));
    const counts = [
      ...catalogue.startingCargo,
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

  it("loses less than half of a dismantled Structure's Components", () => {
    expect(catalogue.dismantlingLossShare).toBeGreaterThanOrEqual(0);
    expect(catalogue.dismantlingLossShare).toBeLessThan(0.5);
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

  it.each(["solar-array", "battery-bank", "light-mast", "habitat"])(
    "brings the Components for a %s in the starting cargo",
    (structureTypeId) => {
      const structureType = catalogue.structureTypes.find(
        (type) => type.id === structureTypeId,
      );

      expect(structureType).toBeDefined();
      for (const need of structureType?.components ?? []) {
        const inCargo = catalogue.startingCargo
          .filter((stock) => stock.componentId === need.componentId)
          .reduce((total, stock) => total + stock.count, 0);
        expect(inCargo).toBeGreaterThanOrEqual(need.count);
      }
    },
  );
});
