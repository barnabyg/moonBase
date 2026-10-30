import { catalogue, type StructureType } from "../src/catalogue";
import type { PacedCatalogue } from "./pacing-report";

// Small made-up catalogues, for the tests of the figures the pacing report
// calculates and the rules the data catalogue is held to.

export function structure(
  id: string,
  designId: string,
  overrides: Partial<StructureType> = {},
): StructureType {
  return {
    id,
    label: id,
    designId,
    footprintRadiusMetres: 2,
    components: [],
    stageHours: {
      sitePreparation: 1,
      componentDelivery: 1,
      assembly: 1,
      commissioning: 1,
    },
    stageMachines: { sitePreparation: "excavator" },
    commissioningFailureChance: 0.1,
    dustWearPercentPerHour: 0.01,
    hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
    power: {
      generationKilowatts: 0,
      storageKilowattHours: 0,
      drawKilowatts: 0,
      nightDrawKilowatts: 0,
    },
    lightRadiusMetres: 0,
    habitat: false,
    shieldsHabitat: false,
    landingPad: false,
    ...overrides,
  };
}

/** A Design: a starting one if it costs nothing. */
export function design(
  id: string,
  scienceCost: number,
  prerequisiteDesignIds: readonly string[] = [],
) {
  return {
    id,
    label: id,
    description: id,
    category: "power" as const,
    starting: scienceCost === 0,
    scienceCost,
    prerequisiteDesignIds,
  };
}

export function launchItem(
  id: string,
  designId: string,
  priceMillionDollars: number,
  massKilograms: number,
) {
  return {
    id,
    designId,
    brings: { kind: "component" as const, componentId: id },
    massKilograms,
    priceMillionDollars,
  };
}

export const bulk = (resourceId: string) =>
  ({ kind: "bulk-resource", resourceId }) as const;

/**
 * A made-up catalogue: a Lunation of 20 Earth Days of Daylight and 10 of
 * Night, a round trip of 10 Earth Days with a Return Mass of 100 kg, and
 * nothing else in it unless a test puts it there.
 */
export function madeUp(
  overrides: Partial<PacedCatalogue> = {},
): PacedCatalogue {
  return {
    researchTasks: [],
    designs: [],
    structureTypes: [],
    bulkResources: [],
    lifeSupportStocks: [],
    exports: [],
    launch: {
      payloadMassLimitKilograms: 1000,
      feeMillionDollars: 50,
      items: [],
    },
    lander: {
      ...catalogue.lander,
      roundTripEarthDays: { toEarth: 3, turnaround: 4, toMoon: 3 },
      returnMassKilograms: 100,
    },
    lunation: {
      ...catalogue.lunation,
      daylightEarthDays: 20,
      nightEarthDays: 10,
    },
    gameSpeeds: [
      { id: "paused", label: "Pause", gameMinutesPerRealSecond: 0 },
      { id: "slow", label: "1x", gameMinutesPerRealSecond: 6 },
      { id: "fast", label: "20x", gameMinutesPerRealSecond: 120 },
    ],
    observingProgramme: { label: "Survey", lengthHours: 24, science: 10 },
    ...overrides,
  };
}
