import type { StructureType } from "./types";

// Habitats, and the shielding, water walls and vault cisterns that protect
// them. structures.ts lists them in catalogue order.

export const habitat: StructureType = {
  id: "habitat",
  label: "Inflatable Habitat",
  designId: "inflatable-habitat",
  listGroup: "habitats",
  footprintRadiusMetres: 4,
  components: [
    { componentId: "habitat-core", count: 1 },
    { componentId: "habitat-envelope", count: 1 },
    { componentId: "airlock", count: 1 },
  ],
  dismantlingSpareComponents: 2,
  stageHours: {
    sitePreparation: 4,
    componentDelivery: 2,
    assembly: 8,
    commissioning: 3,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  dustWearPercentPerHour: 0.01,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  // Its life support, heaters and controls.
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 1.2,
    nightDrawKilowatts: 0,
  },
  lightRadiusMetres: 0,
  habitat: true,
  shieldsHabitat: false,
  landingPad: false,
};

// An inflatable Habitat whose envelope is layered like a Whipple
// shield, so that a Micrometeorite strike and a blast of Plume Ejecta
// each take a quarter of the Condition off it. Otherwise it is a
// Habitat: the Mission Director can move in, and Regolith shielding
// goes over it.
export const hardenedHabitat: StructureType = {
  id: "hardened-habitat",
  label: "Hardened Habitat",
  designId: "hardened-habitat",
  listGroup: "habitats",
  footprintRadiusMetres: 4,
  components: [
    { componentId: "habitat-core", count: 1 },
    { componentId: "armoured-habitat-envelope", count: 1 },
    { componentId: "airlock", count: 1 },
  ],
  dismantlingSpareComponents: 2,
  stageHours: {
    sitePreparation: 4,
    componentDelivery: 2,
    assembly: 8,
    commissioning: 3,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  dustWearPercentPerHour: 0.01,
  hazardMultipliers: {
    dustCoating: 1,
    micrometeorites: 0.25,
    plumeEjecta: 0.25,
  },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 1.2,
    nightDrawKilowatts: 0,
  },
  lightRadiusMetres: 0,
  habitat: true,
  shieldsHabitat: false,
  landingPad: false,
};

export const regolithShielding: StructureType = {
  id: "regolith-shielding",
  label: "Regolith shielding",
  designId: "regolith-shielding",
  listGroup: "habitats",
  // The same as the Habitat's, so that the excavator, left beside the
  // Habitat after grading its site, isn't in the way.
  footprintRadiusMetres: 4,
  // The excavator digs the Regolith the printer prints it from, beside
  // the Habitat, as part of Site Preparation: 3 hours of grading, then
  // 6 of digging. No Components.
  components: [],
  dismantlingSpareComponents: 0,
  stageHours: {
    sitePreparation: 9,
    componentDelivery: 0,
    assembly: 48,
    commissioning: 2,
  },
  stageMachines: {
    sitePreparation: "excavator",
    assembly: "regolith-printer",
  },
  commissioningFailureChance: 0.1,
  // Packed Regolith has nothing for Dust to wear.
  dustWearPercentPerHour: 0,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    nightDrawKilowatts: 0,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: true,
  landingPad: false,
};

// Regolith shielding whose every layer is fused by microwaves as the
// regolith printer lays it, rather than left to settle under the next,
// so that the printer lays it in 20 hours rather than 48: 31 hours in
// all rather than 59, under an unshielded Habitat's Radiation Dose. The
// excavator digs its Regolith just as long.
export const sinteredRegolithShielding: StructureType = {
  id: "sintered-regolith-shielding",
  label: "Sintered Regolith shielding",
  designId: "microwave-sintering",
  listGroup: "habitats",
  footprintRadiusMetres: 4,
  components: [],
  dismantlingSpareComponents: 0,
  stageHours: {
    sitePreparation: 9,
    componentDelivery: 0,
    assembly: 20,
    commissioning: 2,
  },
  stageMachines: {
    sitePreparation: "excavator",
    assembly: "regolith-printer",
  },
  commissioningFailureChance: 0.1,
  dustWearPercentPerHour: 0,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    nightDrawKilowatts: 0,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: true,
  landingPad: false,
};

// Bladders of water laid over a Habitat's Regolith shielding: water is
// rich in hydrogen, which stops the protons of the Sun and the cosmic
// rays that get through Regolith better than Regolith does. The
// bladders are shipped empty and filled from the base's water as they
// go up, so a water wall is as much water as it is Components, and
// making water matters beyond what the Mission Director drinks.
export const waterWall: StructureType = {
  id: "water-wall",
  label: "Water wall",
  designId: "water-wall-shielding",
  listGroup: "habitats",
  // The same as the Habitat's and its shielding's, which it stands over.
  footprintRadiusMetres: 4,
  components: [{ componentId: "water-wall-bladder", count: 4 }],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 1,
    componentDelivery: 1,
    assembly: 6,
    commissioning: 1,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.1,
  // Nothing moves in it for Dust to wear.
  dustWearPercentPerHour: 0,
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
  // About 12 Earth Days of what a water-processing plant makes, or most
  // of what an Expedition's water ice gives, on top of a fortnight's
  // drinking water kept back for the Mission Director.
  waterWall: { stockId: "water", kilograms: 300, reserveEarthDays: 14 },
};

// The end of what can be done about the Radiation Dose: cells of water sunk round a
// Buried Habitat's vault, filled all at once, so that the base must first hold more
// water than its own tanks and one water tank can: 2,000 kg is 400 kg of precision
// optics, or 16 rounds of a Greenhouse. See the Greenhouse chain in
// docs/balancing.md.
export const vaultCistern: StructureType = {
  id: "vault-cistern",
  label: "Vault cistern",
  designId: "vault-cistern",
  listGroup: "habitats",
  // The same as the Buried Habitat's, which it stands round.
  footprintRadiusMetres: 6,
  components: [{ componentId: "cistern-cell", count: 16 }],
  dismantlingSpareComponents: 3,
  stageHours: {
    sitePreparation: 12,
    componentDelivery: 8,
    assembly: 24,
    commissioning: 6,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.1,
  // Under the Regolith with the vault, with nothing moving for Dust to wear.
  dustWearPercentPerHour: 0,
  hazardMultipliers: {
    dustCoating: 1,
    micrometeorites: 0.1,
    plumeEjecta: 0.1,
  },
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
  waterWall: {
    stockId: "water",
    kilograms: 2000,
    reserveEarthDays: 14,
    overBuriedHabitat: true,
  },
};

// A pressure vault sunk in a trench and heaped over with Regolith, so that
// nothing goes over it and the Mission Director's dose rate falls to a
// tenth of a water wall's. It is the way past the Radiation Dose limit, and
// priced as the Campaign's biggest single purchase: $4510M, and $450M for the
// three Launch fees it takes. That is about what 17 Launches of circuit
// boards sell for, 255 Earth Days of everything a base earns at a trip every
// 15.4 Earth Days by the pacing report, and about a quarter of the $18,000M the
// long-game base holds by Earth Day 1,530 with nothing else to buy, after Act 2
// and before Act 3 brings more. A base that skips the water wall reaches the
// limit around Earth Day 260, and could afford it around Earth Day 335 at
// the soonest. The excavator takes 5 Earth Days to dig it in, at about half
// its Condition in Dust's wear on its bucket: much more would have it wear
// out and stop part-way. It draws what any Habitat draws, so that a base
// keeping its old Habitat as well has to carry both through the Night.
export const buriedHabitat: StructureType = {
  id: "buried-habitat",
  label: "Buried Habitat",
  designId: "buried-habitat",
  listGroup: "habitats",
  footprintRadiusMetres: 6,
  components: [
    { componentId: "vault-section", count: 8 },
    { componentId: "deep-life-support-core", count: 1 },
    { componentId: "airlock", count: 1 },
  ],
  dismantlingSpareComponents: 4,
  stageHours: {
    sitePreparation: 120,
    componentDelivery: 8,
    assembly: 48,
    commissioning: 6,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  dustWearPercentPerHour: 0.01,
  // Only the airlock stands in the open: a Micrometeorite or a blast of
  // Plume Ejecta takes a tenth of what it takes off the Habitat above ground.
  hazardMultipliers: {
    dustCoating: 1,
    micrometeorites: 0.1,
    plumeEjecta: 0.1,
  },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 1.2,
    nightDrawKilowatts: 0,
  },
  lightRadiusMetres: 0,
  habitat: true,
  shieldsHabitat: false,
  landingPad: false,
  buried: true,
};

// What the Campaign builds towards: a pressure vault for two dozen Crew, built from three Buried
// Habitats' worth of vault sections and four of their life support cores, and
// stocked with a Lunation of what two dozen people breathe and drink before it
// is sealed. Nobody moves in, as Crew are still to come (ADR-0001), so it is not
// a Habitat the Mission Director can live in, and it stands cold and draws
// nothing. Its Components cost $13,920M and weigh 16,400 kg, nine Launches'
// worth: about $15,270M with their fees, two thirds of what the long-game base
// had left idle at the end before it. Its 600 kg of oxygen takes more tanks
// than the base's own and one oxygen tank, and its 2,500 kg of water more than
// two water tanks, so it asks for the Plants, ice and tanks of a base at scale
// as well as Funding. See "What the last hours are for" in docs/balancing.md.
export const crewHabitat: StructureType = {
  id: "crew-habitat",
  label: "Large-scale Crew Habitat",
  designId: "crew-habitats",
  listGroup: "habitats",
  footprintRadiusMetres: 10,
  components: [
    { componentId: "vault-section", count: 24 },
    { componentId: "deep-life-support-core", count: 4 },
    { componentId: "airlock", count: 2 },
  ],
  dismantlingSpareComponents: 6,
  stageHours: {
    // Grading a wide site, not digging a vault in as a Buried Habitat is.
    sitePreparation: 24,
    componentDelivery: 24,
    assembly: 160,
    commissioning: 12,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
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
  // A Lunation of what 24 people use, at the Mission Director's 0.84 kg of
  // oxygen and 3.5 kg of water an Earth Day.
  stockedWith: [
    { stockId: "oxygen", kilograms: 600, reserveEarthDays: 14 },
    { stockId: "water", kilograms: 2500, reserveEarthDays: 14 },
  ],
};
