import type { StructureType } from "./types";

// Plants and ice lines that make water, oxygen and food. structures.ts lists them in catalogue order.

export const waterProcessingPlant: StructureType = {
  id: "water-processing-plant",
  label: "Water-processing plant",
  designId: "water-processing",
  listGroup: "life-support",
  footprintRadiusMetres: 2.5,
  // A heated tank that melts the ice, and a still that cleans the water.
  components: [
    { componentId: "ice-melter", count: 1 },
    { componentId: "water-purifier", count: 1 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 2,
    componentDelivery: 1,
    assembly: 4,
    commissioning: 1,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.15,
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
  // Most of the ice comes out as water; the rest is the dust and grit
  // frozen in with it. Running, it makes six times what the Mission
  // Director drinks, so an Expedition's ice lasts over a week.
  recipes: [
    {
      id: "water",
      label: "Water",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "water-ice" },
          kilogramsPerHour: 1,
        },
      ],
      outputs: [
        {
          resource: { kind: "life-support", stockId: "water" },
          kilogramsPerHour: 0.9,
        },
      ],
      drawKilowatts: 2,
    },
  ],
};

// A water-processing plant's ice melter feeding an electrolyser stack,
// which splits the water into oxygen and hydrogen; the hydrogen is
// vented. Water is eight-ninths oxygen by mass, so most of the ice comes
// out as oxygen: 0.4 kg an hour, well over twice what an extraction
// plant running for oxygen makes, for 5 kW rather than 4. Running for 62
// hours, an eighth of a Lunation's Daylight, it makes the 24.8 kg of
// oxygen the Mission Director uses in a Lunation from 31 kg of ice, a
// sixth of what an Expedition brings back, and leaves the extraction
// plant free to run for metals and silicon.
export const electrolysisPlant: StructureType = {
  id: "electrolysis-plant",
  label: "Electrolysis plant",
  designId: "water-electrolysis",
  listGroup: "life-support",
  footprintRadiusMetres: 2.5,
  components: [
    { componentId: "ice-melter", count: 1 },
    { componentId: "electrolyser-stack", count: 1 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 2,
    componentDelivery: 1,
    assembly: 5,
    commissioning: 1.5,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
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
      id: "oxygen",
      label: "Oxygen",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "water-ice" },
          kilogramsPerHour: 0.5,
        },
      ],
      outputs: [
        {
          resource: { kind: "life-support", stockId: "oxygen" },
          kilogramsPerHour: 0.4,
        },
      ],
      drawKilowatts: 5,
    },
  ],
};

// Act 3: a dome of growing racks, the one Plant that goes on through the Night,
// so what makes water standing idle then is what makes storing it matter. 1 kg
// of water an hour is 708 kg a Lunation, and 228 kg of it in a Night, which the
// 351 kg the base's own tanks hold above the reserve can carry for one and not for
// two. It takes that water a batch at a time, so a lost round has really cost it.
// Its pumps draw 0.5 kW by day, and its lamps 1.5 kW at Night, 342 kWh through
// one, about half a large battery bank; as a Night load, it gives them up
// before anything else goes without. A round is 5 Earth Days for 20 Science, so
// one earns about 118 Science a Lunation, what Research Tasks pay by then.
export const greenhouse: StructureType = {
  id: "greenhouse",
  label: "Greenhouse",
  designId: "lunar-greenhouses",
  listGroup: "life-support",
  footprintRadiusMetres: 5,
  components: [
    { componentId: "greenhouse-dome", count: 1 },
    { componentId: "growing-rack", count: 2 },
  ],
  dismantlingSpareComponents: 2,
  stageHours: {
    sitePreparation: 4,
    componentDelivery: 2,
    assembly: 12,
    commissioning: 3,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.15,
  dustWearPercentPerHour: 0.03,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    nightDrawKilowatts: 1.5,
    daylightDrawKilowatts: 0.5,
  },
  lightRadiusMetres: 14,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
  // It draws its power as a Structure does (above), not as a recipe does.
  recipes: [
    {
      id: "growing",
      label: "Growing",
      inputs: [
        {
          resource: { kind: "life-support", stockId: "water" },
          kilogramsPerHour: 1,
        },
      ],
      outputs: [],
      drawKilowatts: 0,
    },
  ],
  growing: { lengthHours: 120, science: 20 },
};

// The Greenhouse chain's way to spend Funding on water: 100 Science for 480 kg, a
// fifth less water for each Science than a Greenhouse, for fourteen times the price
// of a dome. Its 10 Earth Day round is longer than a Night, so a Night short of
// water or power always costs one whole, and there is only the one basket. Against
// the two and a half Greenhouses that earn as much, the 354 kg a Lunation it saves
// is about what two cold-trap ice lines bring, at $6000M.
export const growingHall: StructureType = {
  id: "growing-hall",
  label: "Growing hall",
  designId: "growing-halls",
  listGroup: "life-support",
  footprintRadiusMetres: 8,
  components: [
    { componentId: "hall-vault-section", count: 4 },
    { componentId: "light-pipe", count: 6 },
  ],
  dismantlingSpareComponents: 3,
  stageHours: {
    sitePreparation: 12,
    componentDelivery: 4,
    assembly: 36,
    commissioning: 6,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  dustWearPercentPerHour: 0.05,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    // 798 kWh through a Night, about what a large battery bank stores. By day the
    // light pipes bring the sun in, so that it draws about what two domes would.
    nightDrawKilowatts: 3.5,
    daylightDrawKilowatts: 1,
  },
  lightRadiusMetres: 22,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
  // It draws its power as a Structure does (above), not as a recipe does.
  recipes: [
    {
      id: "growing",
      label: "Growing",
      inputs: [
        {
          resource: { kind: "life-support", stockId: "water" },
          kilogramsPerHour: 2,
        },
      ],
      outputs: [],
      drawKilowatts: 0,
    },
  ],
  growing: { lengthHours: 240, science: 100 },
};

// A heated line out to the shadowed crater, whose head scrapes up water ice
// and sends it back along it: 192 kg in a Daylight, about what an Expedition
// brings, so that a Robot and the Rover need never go again. An Expedition
// costs no Funding, but takes a Robot off the map for three Earth Days every
// seven weeks or so, with its Maintenance waiting, and stops if the Rover is
// Broken, which is what makes the Mission Director's water hang on it. This
// costs $3000M to stop that, the dearest thing in Act 2, and it draws 5 kW.
export const coldTrapIceLine: StructureType = {
  id: "cold-trap-ice-line",
  label: "Cold-trap ice line",
  designId: "cold-trap-mining",
  listGroup: "life-support",
  footprintRadiusMetres: 3,
  components: [
    { componentId: "cold-trap-head", count: 1 },
    { componentId: "ice-haul-line", count: 5 },
  ],
  dismantlingSpareComponents: 2,
  stageHours: {
    sitePreparation: 4,
    componentDelivery: 3,
    assembly: 12,
    commissioning: 3,
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
      id: "water-ice",
      label: "Water ice",
      inputs: [],
      outputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "water-ice" },
          kilogramsPerHour: 0.4,
        },
      ],
      drawKilowatts: 5,
    },
  ],
};
