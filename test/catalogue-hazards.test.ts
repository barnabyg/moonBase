import { describe, expect, it } from "vitest";
import { catalogue } from "../src/catalogue";

/**
 * The data catalogue's hazards.ts: Plume Ejecta, Maintenance, Dust, the cold,
 * Micrometeorites, power warnings, radiation and Solar Particle Events.
 */

describe("the data catalogue", () => {
  it("blasts Plume Ejecta out past the Lander's footprint, taking a share of a Structure's Condition at a time", () => {
    const { radiusMetres, conditionLossPercent } = catalogue.plumeEjecta;

    expect(radiusMetres).toBeGreaterThan(
      catalogue.lander.footprintRadiusMetres,
    );
    expect(conditionLossPercent).toBeGreaterThan(0);
    expect(conditionLossPercent).toBeLessThanOrEqual(100);
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

  it("has lights and Plants keep back a reserve of power at Night for at least as long as the first Habitat power warning", () => {
    const reserve = catalogue.nightReserveHours;
    expect(reserve).toBeGreaterThan(0);
    expect(Number.isInteger(reserve * 60)).toBe(true);
    expect(reserve).toBeGreaterThanOrEqual(
      Math.max(...catalogue.habitatPowerWarningHoursLeft),
    );
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
});
