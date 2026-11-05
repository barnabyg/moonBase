import type { StructureType } from "./types";

// The Industry group's Plants that refine Regolith into oxygen, metals and
// silicon, make propellant, and dig Regolith. Those that make parts are in
// structures-industry-fabrication.ts. structures.ts lists them in catalogue
// order.

export const extractionPlant: StructureType = {
  id: "extraction-plant",
  label: "Extraction plant",
  designId: "regolith-extraction",
  listGroup: "industry",
  footprintRadiusMetres: 3,
  // A reactor that melts Regolith and splits it by electrolysis, and
  // the plant that draws the oxygen off.
  components: [
    { componentId: "extraction-reactor", count: 1 },
    { componentId: "oxygen-separator", count: 1 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 3,
    componentDelivery: 1,
    assembly: 6,
    commissioning: 2,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  // Regolith is fed through it, so it wears faster than most.
  dustWearPercentPerHour: 0.05,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  // It draws power only while it runs (see its recipes).
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
  // Run for oxygen, a few percent of the Regolith comes out as oxygen,
  // about four times what the Mission Director breathes while it runs,
  // with a little metal and silicon; run for metals and silicon, it
  // reduces much more of it to them, and keeps little of the oxygen.
  // What is left is slag. It runs only in Daylight, 20 of a Lunation's
  // 29.5 Earth Days, so to make the 24.8 kg of oxygen the Mission
  // Director uses in a Lunation it has to run for oxygen for about 30%
  // of the Daylight (0.15 kg an hour for oxygen, 0.01 for metals and
  // silicon). In the rest it makes under 0.3 kg of silicon an hour,
  // averaged over the Daylight: less than the 0.35 kg a vacuum
  // fabrication plant takes. So one extraction plant can't keep the base
  // self-sufficient in oxygen and feed a vacuum fabrication plant too;
  // the player switches between the recipes, or imports a second one.
  recipes: [
    {
      id: "oxygen",
      label: "Oxygen",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "regolith" },
          kilogramsPerHour: 4,
        },
      ],
      outputs: [
        {
          resource: { kind: "life-support", stockId: "oxygen" },
          kilogramsPerHour: 0.15,
        },
        {
          resource: { kind: "bulk-resource", resourceId: "metals" },
          kilogramsPerHour: 0.04,
        },
        {
          resource: { kind: "bulk-resource", resourceId: "silicon" },
          kilogramsPerHour: 0.02,
        },
      ],
      drawKilowatts: 4,
    },
    {
      id: "metals-and-silicon",
      label: "Metals and silicon",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "regolith" },
          kilogramsPerHour: 4,
        },
      ],
      outputs: [
        {
          resource: { kind: "life-support", stockId: "oxygen" },
          kilogramsPerHour: 0.01,
        },
        {
          resource: { kind: "bulk-resource", resourceId: "metals" },
          kilogramsPerHour: 0.6,
        },
        {
          resource: { kind: "bulk-resource", resourceId: "silicon" },
          kilogramsPerHour: 0.4,
        },
      ],
      drawKilowatts: 4,
    },
  ],
};

// An extraction plant whose reactor is a big molten regolith cell,
// which melts Regolith through and splits it by electrolysis, rather
// than reducing what it can at the surface of each grain. It runs the
// same recipes on 10 kg of Regolith an hour rather than 4, for 8 kW
// rather than 4, so it makes more of everything for each kW: 0.4 kg of
// oxygen an hour running for oxygen, enough for the Mission Director in
// under a seventh of the Daylight, or 1.1 kg of silicon running for
// metals and silicon, enough for an integrated fabrication plant or
// three vacuum fabrication plants. With an oxygen separator it ships
// 1200 kg for $95M, against 1000 kg for $75M: well under half as much
// for each kilogram of silicon it makes an hour.
export const largeExtractionPlant: StructureType = {
  id: "large-extraction-plant",
  label: "Large extraction plant",
  designId: "molten-regolith-electrolysis",
  listGroup: "industry",
  footprintRadiusMetres: 4,
  components: [
    { componentId: "molten-regolith-cell", count: 1 },
    { componentId: "oxygen-separator", count: 1 },
  ],
  dismantlingSpareComponents: 2,
  stageHours: {
    sitePreparation: 4,
    componentDelivery: 1,
    assembly: 8,
    commissioning: 3,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.25,
  // More Regolith goes through it than through an extraction plant.
  dustWearPercentPerHour: 0.06,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  // It draws power only while it runs (see its recipes).
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
  recipes: [
    {
      id: "oxygen",
      label: "Oxygen",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "regolith" },
          kilogramsPerHour: 10,
        },
      ],
      outputs: [
        {
          resource: { kind: "life-support", stockId: "oxygen" },
          kilogramsPerHour: 0.4,
        },
        {
          resource: { kind: "bulk-resource", resourceId: "metals" },
          kilogramsPerHour: 0.1,
        },
        {
          resource: { kind: "bulk-resource", resourceId: "silicon" },
          kilogramsPerHour: 0.05,
        },
      ],
      drawKilowatts: 8,
    },
    {
      id: "metals-and-silicon",
      label: "Metals and silicon",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "regolith" },
          kilogramsPerHour: 10,
        },
      ],
      outputs: [
        {
          resource: { kind: "life-support", stockId: "oxygen" },
          kilogramsPerHour: 0.03,
        },
        {
          resource: { kind: "bulk-resource", resourceId: "metals" },
          kilogramsPerHour: 1.6,
        },
        {
          resource: { kind: "bulk-resource", resourceId: "silicon" },
          kilogramsPerHour: 1.1,
        },
      ],
      drawKilowatts: 8,
    },
  ],
};

// Act 3: liquid oxygen for the Lander, or to sell. 480 kg in a Daylight lifts
// 240 kg more of Exports a Lunation, so one is enough to raise the Return Mass
// but not to triple it every trip. Its two cryogenic tanks hold 450 kg, a
// tripled Return Mass's 400 kg and some to spare, and not the 600 kg of the
// Lander's ceiling: that takes a propellant tank, or a second Plant.
export const propellantPlant: StructureType = {
  id: "propellant-plant",
  label: "Propellant plant",
  designId: "propellant-production",
  listGroup: "industry",
  footprintRadiusMetres: 4,
  ownStorage: {
    resource: { kind: "bulk-resource", resourceId: "propellant" },
    kilograms: 450,
  },
  components: [
    { componentId: "oxygen-liquefier", count: 2 },
    { componentId: "cryogenic-tank", count: 2 },
  ],
  dismantlingSpareComponents: 2,
  stageHours: {
    sitePreparation: 4,
    componentDelivery: 2,
    assembly: 10,
    commissioning: 3,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  dustWearPercentPerHour: 0.05,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  // It draws power only while it runs (see its recipe).
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
  recipes: [
    {
      id: "propellant",
      label: "Propellant",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "regolith" },
          kilogramsPerHour: 15,
        },
      ],
      outputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "propellant" },
          kilogramsPerHour: 1,
        },
      ],
      drawKilowatts: 8,
    },
  ],
};

// Three times the rate for under one and a half times the price, and enough Regolith to keep an
// excavator busy, which is what a base pays for every trip at a tripled Return
// Mass. It has the same two cryogenic tanks, so holds no more than the small one.
export const largePropellantPlant: StructureType = {
  id: "large-propellant-plant",
  label: "Large propellant plant",
  designId: "large-propellant-production",
  listGroup: "industry",
  footprintRadiusMetres: 5,
  ownStorage: {
    resource: { kind: "bulk-resource", resourceId: "propellant" },
    kilograms: 450,
  },
  components: [
    { componentId: "oxygen-liquefier", count: 2 },
    { componentId: "cryogenic-tank", count: 2 },
    { componentId: "propellant-reactor", count: 1 },
  ],
  dismantlingSpareComponents: 2,
  stageHours: {
    sitePreparation: 4,
    componentDelivery: 2,
    assembly: 10,
    commissioning: 3,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  dustWearPercentPerHour: 0.08,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  // It draws power only while it runs (see its recipe).
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
  recipes: [
    {
      id: "propellant",
      label: "Propellant",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "regolith" },
          kilogramsPerHour: 35,
        },
      ],
      outputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "propellant" },
          kilogramsPerHour: 3,
        },
      ],
      drawKilowatts: 20,
    },
  ],
};

// A bucket wheel on a skid at the end of a conveyor, which digs a strip of
// Regolith and sends it back to the stockpile: 30 kg an hour, three fifths of
// the excavator's rate, but by itself and at Night too, so that the stock
// needn't run out while a large propellant plant (35 kg an hour) runs through
// the Night. At 4 kW that is 912 kWh through a Night, over a large battery
// bank, which is the price of digging in the dark. The Regolith goes in with
// the excavator's, so it waits once the stock is full.
export const bucketWheelDigger: StructureType = {
  id: "bucket-wheel-digger",
  label: "Bucket-wheel digger",
  designId: "continuous-excavation",
  listGroup: "industry",
  footprintRadiusMetres: 3,
  components: [
    { componentId: "bucket-wheel-head", count: 1 },
    { componentId: "regolith-conveyor", count: 3 },
  ],
  dismantlingSpareComponents: 2,
  stageHours: {
    sitePreparation: 3,
    componentDelivery: 2,
    assembly: 10,
    commissioning: 2,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  // Its teeth and belt are in the Regolith all the time it runs.
  dustWearPercentPerHour: 0.08,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  // It draws power only while it runs (see its recipe).
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
  recipes: [
    {
      id: "regolith",
      label: "Regolith",
      inputs: [],
      outputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "regolith" },
          kilogramsPerHour: 30,
        },
      ],
      drawKilowatts: 4,
    },
  ],
};
