import type { StructureType } from "./types";

// Light masts. structures.ts lists them in catalogue order.

export const lightMast: StructureType = {
  id: "light-mast",
  label: "Light mast",
  designId: "light-masts",
  listGroup: "lights",
  footprintRadiusMetres: 0.8,
  components: [
    { componentId: "mast-pole", count: 1 },
    { componentId: "light-head", count: 1 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 0.5,
    componentDelivery: 0.5,
    assembly: 1,
    commissioning: 0.5,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.1,
  dustWearPercentPerHour: 0.02,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  // Its light switches on by itself at Night, and draws nothing in Daylight.
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    nightDrawKilowatts: 0.4,
  },
  lightRadiusMetres: 18,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
};

// A Light Mast on a pole twice as tall, with two light heads, lighting
// a circle twice as wide: four times the ground for two and a half
// times the power. Through a Night it draws 228 kWh, a little more than
// a battery bank stores.
export const tallLightMast: StructureType = {
  id: "tall-light-mast",
  label: "Tall Light Mast",
  designId: "tall-light-masts",
  listGroup: "lights",
  footprintRadiusMetres: 1.2,
  components: [
    { componentId: "tall-mast-pole", count: 1 },
    { componentId: "light-head", count: 2 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 1,
    componentDelivery: 0.5,
    assembly: 2,
    commissioning: 0.5,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.1,
  dustWearPercentPerHour: 0.02,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    nightDrawKilowatts: 1,
  },
  lightRadiusMetres: 36,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
};
