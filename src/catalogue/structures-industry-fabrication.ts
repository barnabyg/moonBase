import type { StructureType } from "./types";

// The Industry group's Plants that make parts: wafers, circuit boards, optics,
// solar panels and spare Components. Those that refine Regolith are in
// structures-industry-refining.ts. structures.ts lists them in catalogue order.

export const vacuumFabricationPlant: StructureType = {
  id: "vacuum-fabrication-plant",
  label: "Vacuum fabrication plant",
  designId: "vacuum-fabrication",
  listGroup: "industry",
  footprintRadiusMetres: 2.5,
  // A furnace that grows silicon crystals in the Moon's vacuum, and a saw
  // that slices them into wafers.
  components: [
    { componentId: "crystal-furnace", count: 1 },
    { componentId: "wafer-saw", count: 1 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 2,
    componentDelivery: 1,
    assembly: 5,
    commissioning: 2,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  // Dust in its saw and seals.
  dustWearPercentPerHour: 0.04,
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
  // It takes in a little less silicon than an extraction plant makes
  // running for metals and silicon, so that, running together, the
  // silicon never quite runs out and it keeps up without stopping and
  // starting; the saw turns some of it to dust. Its furnace draws 6 kW: on its own, the starting solar array
  // can spare that beside the Habitat and a battery bank, but the two
  // Plants together draw 10 kW, all that array makes, so earning money
  // from wafers takes a second solar array.
  recipes: [
    {
      id: "wafers",
      label: "Wafers",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "silicon" },
          kilogramsPerHour: 0.35,
        },
      ],
      outputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "wafers" },
          kilogramsPerHour: 0.3,
        },
      ],
      drawKilowatts: 6,
    },
  ],
};

export const circuitBoardPlant: StructureType = {
  id: "circuit-board-plant",
  label: "Circuit board plant",
  designId: "circuit-board-fabrication",
  listGroup: "industry",
  footprintRadiusMetres: 2.5,
  // An etcher that lays circuits on metal-cored boards, and an oven
  // that solders the chips cut from the wafers onto them.
  components: [
    { componentId: "circuit-etcher", count: 1 },
    { componentId: "reflow-oven", count: 1 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 2,
    componentDelivery: 1,
    assembly: 5,
    commissioning: 2,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  // Dust in its etcher and on the conveyor through its oven.
  dustWearPercentPerHour: 0.04,
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
  // It takes in a little less in wafers than a vacuum fabrication plant
  // makes, so that, running together, it keeps up without the wafers
  // running out, and as much metals again, well within what an
  // extraction plant makes running for metals and silicon, for the
  // boards' cores and circuits; offcuts
  // and what is etched away make up the rest. Its oven draws 3 kW, so
  // the three Plants together, at 13 kW, still run on what two solar
  // arrays can spare beside the Habitat and a battery bank.
  recipes: [
    {
      id: "circuit-boards",
      label: "Circuit boards",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "wafers" },
          kilogramsPerHour: 0.25,
        },
        {
          resource: { kind: "bulk-resource", resourceId: "metals" },
          kilogramsPerHour: 0.25,
        },
      ],
      outputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "circuit-boards" },
          kilogramsPerHour: 0.4,
        },
      ],
      drawKilowatts: 3,
    },
  ],
};

// A crystal furnace feeding a board assembly line, which saws the
// crystals into wafers and turns them straight into circuit boards, so
// that the wafers never leave it. By default it makes 0.5 kg of circuit
// boards an hour from 0.45 kg of silicon and 0.3 kg of metals, a
// quarter more than a circuit board plant, for 9 kW, as much as a
// vacuum fabrication plant and a circuit board plant draw together. It
// can run for wafers alone instead: 0.6 kg an hour, twice a vacuum
// fabrication plant's, for 8 kW. Either takes more silicon than an
// extraction plant makes, so it needs a large extraction plant. It
// ships 900 kg for $85M, against 1350 kg for $125M for the two Plants
// it stands in for.
export const integratedFabricationPlant: StructureType = {
  id: "integrated-fabrication-plant",
  label: "Integrated fabrication plant",
  designId: "integrated-fabrication",
  listGroup: "industry",
  footprintRadiusMetres: 3,
  components: [
    { componentId: "crystal-furnace", count: 1 },
    { componentId: "board-assembly-line", count: 1 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 2,
    componentDelivery: 1,
    assembly: 7,
    commissioning: 3,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.25,
  dustWearPercentPerHour: 0.04,
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
      id: "circuit-boards",
      label: "Circuit boards",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "silicon" },
          kilogramsPerHour: 0.45,
        },
        {
          resource: { kind: "bulk-resource", resourceId: "metals" },
          kilogramsPerHour: 0.3,
        },
      ],
      outputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "circuit-boards" },
          kilogramsPerHour: 0.5,
        },
      ],
      drawKilowatts: 9,
    },
    {
      id: "wafers",
      label: "Wafers",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "silicon" },
          kilogramsPerHour: 0.7,
        },
      ],
      outputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "wafers" },
          kilogramsPerHour: 0.6,
        },
      ],
      drawKilowatts: 8,
    },
  ],
};

// Act 4: the dearest thing the base can sell for its mass, for space telescopes
// that can't be made in a gravity well. 96 kg in a Daylight.
export const opticsWorks: StructureType = {
  id: "optics-works",
  label: "Optics works",
  designId: "precision-optics",
  listGroup: "industry",
  footprintRadiusMetres: 3.5,
  components: [
    { componentId: "optical-grinder", count: 2 },
    { componentId: "metrology-bench", count: 1 },
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
  dustWearPercentPerHour: 0.03,
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
      id: "precision-optics",
      label: "Precision optics",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "silicon" },
          kilogramsPerHour: 0.8,
        },
        {
          resource: { kind: "bulk-resource", resourceId: "metals" },
          kilogramsPerHour: 0.2,
        },
        // Coolant for the grinders: the Mission Director's water, which it
        // never takes below their reserve.
        {
          resource: { kind: "life-support", stockId: "water" },
          kilogramsPerHour: 1,
        },
      ],
      outputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "precision-optics" },
          kilogramsPerHour: 0.2,
        },
      ],
      drawKilowatts: 12,
    },
  ],
};

// Two and a half times an optics works' rate, the last big purchase there is.
// With a tripled Return Mass, it makes the Plant rather than the Lander the limit
// to the very end.
export const grindingLine: StructureType = {
  id: "grinding-line",
  label: "Grinding line",
  designId: "optics-grinding-line",
  listGroup: "industry",
  footprintRadiusMetres: 4.5,
  components: [
    { componentId: "optical-grinder", count: 3 },
    { componentId: "metrology-bench", count: 1 },
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
      id: "precision-optics",
      label: "Precision optics",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "silicon" },
          kilogramsPerHour: 2,
        },
        {
          resource: { kind: "bulk-resource", resourceId: "metals" },
          kilogramsPerHour: 0.5,
        },
        {
          resource: { kind: "life-support", stockId: "water" },
          kilogramsPerHour: 2.5,
        },
      ],
      outputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "precision-optics" },
          kilogramsPerHour: 0.5,
        },
      ],
      drawKilowatts: 28,
    },
  ],
};

// A panel line and a casting furnace, which make what a solar array is built
// from at the base, so that power no longer needs a Launch: a Launch's fee is
// the dear part of a $22M pair of arrays. A panel takes 2.4 kg of silicon and
// as much of metals, a mast 6 kg of metals, a batch an Earth Day each, so an
// array's worth is 3 Earth Days, 4.8 kg of silicon that would have been
// wafers, and 10.8 kg of metals that could have been sold or made into spare
// Components. So it turns Exports into power, where a concentrator tower
// turns Funding into it, and it can make more than the base can use: switch
// it off once there are enough.
export const arrayWorks: StructureType = {
  id: "array-works",
  label: "Array works",
  designId: "array-fabrication",
  listGroup: "industry",
  footprintRadiusMetres: 3.5,
  components: [
    { componentId: "panel-line", count: 2 },
    { componentId: "casting-furnace", count: 1 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 2,
    componentDelivery: 1,
    assembly: 7,
    commissioning: 2,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  dustWearPercentPerHour: 0.04,
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
  recipes: [
    {
      id: "solar-panels",
      label: "Solar panels",
      batchHours: 24,
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "silicon" },
          kilogramsPerHour: 0.1,
        },
        {
          resource: { kind: "bulk-resource", resourceId: "metals" },
          kilogramsPerHour: 0.1,
        },
      ],
      outputs: [{ componentId: "solar-panel", count: 1 }],
      drawKilowatts: 4,
    },
    {
      id: "array-masts",
      label: "Array masts",
      batchHours: 24,
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "metals" },
          kilogramsPerHour: 0.25,
        },
      ],
      outputs: [{ componentId: "array-mast", count: 1 }],
      drawKilowatts: 4,
    },
  ],
};

// A casting furnace and a machine tool, which turn what Maintenance brings
// back, with a little fresh metal, into spare Components, so that a growing
// base can stop spending Payload Mass on them. The long-game base uses about
// 16 of them a Lunation (from 8 to 25) and keeps 30 in stock. A Plant's
// Components come in whole numbers, and a game-hour's batch would make at
// least one an hour, 480 in a Lunation's 480 hours of Daylight, about thirty
// times what is needed. So a batch here is a whole Earth Day, and a Workshop
// running through Daylight makes 20 a Lunation: what the base uses with a
// little over, for its own wear and the worse Lunations. It takes 3.6 kg of
// metals for each, 72 kg a Lunation. That is most of the 78 kg a Lunation
// the long-game base has to spare beside its circuit board plant, so a base
// running one has little left over to sell. It draws 2 kW, well within what
// two solar arrays spare beside an extraction plant, a vacuum fabrication
// plant and a circuit board plant.
export const workshop: StructureType = {
  id: "workshop",
  label: "Workshop",
  designId: "parts-machining",
  listGroup: "industry",
  footprintRadiusMetres: 3,
  components: [
    { componentId: "machine-tool", count: 1 },
    { componentId: "casting-furnace", count: 1 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 2,
    componentDelivery: 1,
    assembly: 5,
    commissioning: 2,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  // Grit in its slides and spindle, about a spare Component's worth of wear
  // for each Lunation it runs through the Daylight.
  dustWearPercentPerHour: 0.03,
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
      id: "spare-components",
      label: "Spare Components",
      batchHours: 24,
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "metals" },
          kilogramsPerHour: 0.15,
        },
      ],
      outputs: [{ componentId: "spare-component", count: 1 }],
      drawKilowatts: 2,
    },
  ],
};
