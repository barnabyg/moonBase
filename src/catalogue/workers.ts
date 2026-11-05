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
    "Carries a Robot off the map on Expeditions, for water ice and, with the Tech Tree, whatever else its Designs offer.",
  footprintRadiusMetres: 1.5,
  drivingSpeedMetresPerHour: 240,
  dustWearPercentPerDrivingHour: 0.1,
  heaterKilowatts: 0.2,
  coldWearPercentPerNightHour: 0.2,
};

export const expeditions: Catalogue["expeditions"] = {
  unloadingHours: 1,
  types: [
    // Three Earth Days away for enough ice to make more water than the
    // Mission Director drinks in a Lunation.
    {
      id: "water-ice",
      label: "Water ice",
      description: "Hauls ice from a shadowed crater.",
      awayEarthDays: 3,
      kind: "bulk-resource",
      resourceId: "water-ice",
      kilograms: 200,
    },
    // These two pay less each Earth Day, even sent without a pause, than the
    // one extraction plant makes (7.2 kg of metals and
    // 4.8 kg of silicon an Earth Day, over a Lunation), and a load of metals
    // sells for a fifth of the Launch fee. Their Design comes early, before
    // the second Launch brings the first extraction plant, so they bridge a
    // base to its Plants, and later top it up, even through a Night and with
    // no power, but can't take the place of the Plants, and they cost the
    // base a Robot for six Earth Days: its only one, until a second lands.
    {
      id: "prospecting-metals",
      label: "Prospecting for metals",
      description: "Picks over a richer site than the base's own Regolith.",
      designId: "prospecting-expeditions",
      awayEarthDays: 6,
      kind: "bulk-resource",
      resourceId: "metals",
      kilograms: 30,
    },
    {
      id: "prospecting-silicon",
      label: "Prospecting for silicon",
      description: "Picks over a richer site than the base's own Regolith.",
      designId: "prospecting-expeditions",
      awayEarthDays: 6,
      kind: "bulk-resource",
      resourceId: "silicon",
      kilograms: 20,
    },
    // 2.5 Science an Earth Day, against about 6 from Research Tasks, so that it
    // adds to research rather than replacing it. Sent without a pause through
    // the whole Campaign it comes to a third of the Science the Tech Tree costs,
    // for a Robot and the Rover gone for good.
    {
      id: "survey",
      label: "Survey",
      description: "Studies a lava tube far from the base.",
      designId: "survey-expeditions",
      awayEarthDays: 10,
      kind: "science",
      science: 25,
    },
  ],
};
