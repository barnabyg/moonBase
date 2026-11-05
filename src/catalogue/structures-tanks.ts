import type { StructureType } from "./types";

// Storage tanks. structures.ts lists them in catalogue order.

// The same liquid oxygen as the oxygen tank, in a vessel that holds twice as much
// for a third more cooling, as its surface grows more slowly than what it holds.
// 600 kg is the Lander's whole ceiling, and with a Plant's 450 kg it is more than
// the 1,000 kg one trip can use, burning 600 kg to lift 400 kg of propellant. So
// one tank does what a second Plant does, at about a fifteenth of the price. 0.2
// kW is 46 kWh through a Night, under a quarter of a battery bank. Nobody depends
// on what it holds, so with no power at Night it boils off as the oxygen tank's
// does, and all the way down.
export const propellantTank: StructureType = {
  id: "propellant-tank",
  label: "Propellant tank",
  designId: "propellant-production",
  listGroup: "tanks",
  footprintRadiusMetres: 3.5,
  components: [
    { componentId: "propellant-tank-shell", count: 1 },
    { componentId: "propellant-cooler", count: 1 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 1,
    componentDelivery: 1,
    assembly: 5,
    commissioning: 1,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.15,
  // Its cooler has moving parts for Dust to grind on.
  dustWearPercentPerHour: 0.01,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    nightDrawKilowatts: 0,
    nightUpkeepKilowatts: 0.2,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
  storageTank: {
    resource: { kind: "bulk-resource", resourceId: "propellant" },
    kilograms: 600,
    shareLostPerEarthDayWithoutPower: 0.1,
  },
};

// The storage tanks, for a base that wants more of a stock than its own tanks
// hold. Each is shipped empty and filled from the base's stock, as a water
// wall's bladders are, and a tank for anything else is another entry like these
// (see `StorageTank`), with a shape in storage-tank-models.ts.
//
// An insulated shell with a heater, holding two and a half times what the
// base's own tanks do, for about a fifth of that mass shipped. The heater takes
// 11 kWh through a Night, about a twentieth of a battery bank. Without it water
// freezes and splits the seams, slowly: a sixth of what it holds in a Night.
export const waterTank: StructureType = {
  id: "water-tank",
  label: "Water tank",
  designId: "bulk-supply-tanks",
  listGroup: "tanks",
  footprintRadiusMetres: 3,
  components: [
    { componentId: "water-tank-shell", count: 1 },
    { componentId: "tank-heater", count: 1 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 1,
    componentDelivery: 1,
    assembly: 3,
    commissioning: 1,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.1,
  // Hardly anything moves in it for Dust to wear.
  dustWearPercentPerHour: 0.005,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    nightDrawKilowatts: 0,
    nightUpkeepKilowatts: 0.05,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
  storageTank: {
    resource: { kind: "life-support", stockId: "water" },
    kilograms: 1000,
    shareLostPerEarthDayWithoutPower: 0.02,
  },
};

// The large insulated sphere with a cooler that a lunar base should have,
// holding three times what the base's own tanks do, about a year more of what
// the Mission Director breathes. Its cooler takes 34 kWh through a Night, a
// sixth of a battery bank, and without it oxygen boils away far faster than
// water freezes: over half of what it holds in a Night.
export const oxygenTank: StructureType = {
  id: "oxygen-tank",
  label: "Oxygen tank",
  designId: "bulk-supply-tanks",
  listGroup: "tanks",
  footprintRadiusMetres: 3.5,
  components: [
    { componentId: "oxygen-sphere", count: 1 },
    { componentId: "tank-cooler", count: 1 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 1,
    componentDelivery: 1,
    assembly: 4,
    commissioning: 1,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.15,
  // Its cooler has moving parts for Dust to grind on.
  dustWearPercentPerHour: 0.01,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    nightDrawKilowatts: 0,
    nightUpkeepKilowatts: 0.15,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
  storageTank: {
    resource: { kind: "life-support", stockId: "oxygen" },
    kilograms: 300,
    shareLostPerEarthDayWithoutPower: 0.1,
  },
};
