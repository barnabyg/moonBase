import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";

/**
 * The data catalogue's workers.ts: the Robot, the Machines, the Rover and
 * Expeditions.
 */

describe("the data catalogue", () => {
  it("gives the Rover a positive size and driving speed, Dust wear as it is driven, a heater and wear from the cold", () => {
    const { rover } = catalogue;

    expect(rover.label).toBe("Rover");
    expect(rover.footprintRadiusMetres).toBeGreaterThan(0);
    expect(rover.drivingSpeedMetresPerHour).toBeGreaterThan(0);
    expect(rover.dustWearPercentPerDrivingHour).toBeGreaterThan(0);
    expect(rover.heaterKilowatts).toBeGreaterThan(0);
    expect(rover.coldWearPercentPerNightHour).toBeGreaterThan(0);
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
});
