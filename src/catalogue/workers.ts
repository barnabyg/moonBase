import type { Catalogue } from "./types";

// What does the work: the Robots, the Machines and the Rover, and the
// Expeditions it goes on.

export const robot: Catalogue["robot"] = {
  description:
    "A humanoid Robot that carries out every Work Order by itself: it fetches Components from the stockpile, drives the Machines into place, assembles and commissions Structures, lays power cable, carries out Maintenance and parks the Machines before Night.",
  walkingSpeedMetresPerHour: 12,
  workingGapMetres: 1,
  cableLayingSpeedMetresPerHour: 6,
  // About five weeks of steady work before it needs to repair itself.
  dustWearPercentPerHour: 0.1,
  // Falling slowly at first, so that a Robot low enough to need repair
  // still gets itself there in hours rather than days.
  performance: { thresholdPercent: 50, exponent: 0.5 },
  selfRepairThresholdPercent: 10,
  selfRepairHours: 3,
  // Enough to keep working, at well under full speed.
  makeshiftRepairPercent: 30,
  conditionFloorPercent: 1,
  // Down the Lander's ladder, one careful rung at a time.
  climbingDownHours: 0.25,
};

export const machineTypes: Catalogue["machineTypes"] = [
  {
    id: "excavator",
    label: "Excavator",
    description:
      "Grades the ground for every Construction's Site Preparation, digs the Regolith for the Structures the regolith printer prints, and digs Regolith into the base's stock when it has nothing else to do.",
    footprintRadiusMetres: 1.6,
    drivingSpeedMetresPerHour: 30,
    activationHours: 0.25,
    // Its tracks and bucket teeth take the worst of the Dust.
    dustWearPercentPerWorkingHour: 0.4,
    dustWearPercentPerDrivingHour: 0.2,
    // Enough to keep its hydraulics and batteries from freezing.
    heaterKilowatts: 0.2,
    coldWearPercentPerNightHour: 0.2,
  },
  {
    id: "regolith-printer",
    label: "Regolith printer",
    description:
      "Prints Structures made of Regolith layer by layer, such as shielding over a Habitat, from Regolith the excavator digs on site.",
    footprintRadiusMetres: 1.8,
    drivingSpeedMetresPerHour: 20,
    activationHours: 0.5,
    dustWearPercentPerWorkingHour: 0.3,
    dustWearPercentPerDrivingHour: 0.2,
    heaterKilowatts: 0.2,
    coldWearPercentPerNightHour: 0.2,
  },
];

// Built to cover ground, so it drives far faster than the Machines and
// wears down less for it.
export const rover: Catalogue["rover"] = {
  label: "Rover",
  description:
    "Carries a Robot off the map on Expeditions, which come back with water ice.",
  footprintRadiusMetres: 1.5,
  drivingSpeedMetresPerHour: 240,
  dustWearPercentPerDrivingHour: 0.1,
  heaterKilowatts: 0.2,
  coldWearPercentPerNightHour: 0.2,
};

// Three Earth Days away for enough ice to make more water than the
// Mission Director drinks in a Lunation.
export const expeditions: Catalogue["expeditions"] = {
  awayEarthDays: 3,
  resourceId: "water-ice",
  kilograms: 200,
  unloadingHours: 1,
};
