import type { StructureType } from "./types";

// Landing Pads and the parking area. structures.ts lists them in catalogue order.

export const landingPad: StructureType = {
  id: "landing-pad",
  label: "Landing pad",
  designId: "landing-pads",
  listGroup: "landing-and-parking",
  // Wide enough for the Lander to stand on with room round it, and for
  // its engine to blast nothing but the pad.
  footprintRadiusMetres: 7,
  // Interlocking panels laid on graded ground, and a beacon to guide
  // the Lander down.
  components: [
    { componentId: "pad-panel", count: 8 },
    { componentId: "pad-beacon", count: 1 },
  ],
  dismantlingSpareComponents: 2,
  stageHours: {
    sitePreparation: 6,
    componentDelivery: 2,
    assembly: 8,
    commissioning: 1,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.1,
  dustWearPercentPerHour: 0.01,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  // The beacon runs off its own small battery.
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    nightDrawKilowatts: 0,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: false,
  landingPad: true,
};

// A landing pad the regolith printer lays from Regolith, fusing it into
// a hard slab as it goes, so that nothing has to be shipped from Earth
// for it: the Lander comes down on its own radar, with no beacon. It
// stands on the same ground as a landing pad shipped from Earth, graded
// as long, and then the excavator digs the Regolith for 6 hours more.
// It takes 49 hours to build rather than 17, most of them printing.
export const sinteredLandingPad: StructureType = {
  id: "sintered-landing-pad",
  label: "Sintered landing pad",
  designId: "regolith-sintering",
  listGroup: "landing-and-parking",
  footprintRadiusMetres: 7,
  components: [],
  dismantlingSpareComponents: 0,
  stageHours: {
    sitePreparation: 12,
    componentDelivery: 0,
    assembly: 36,
    commissioning: 1,
  },
  stageMachines: {
    sitePreparation: "excavator",
    assembly: "regolith-printer",
  },
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
  landingPad: true,
};

// A landing pad with a pad light on a short post at each quarter of its
// edge, which switch on by themselves at Night, so that the Lander can
// be seen landing and the Robot unloading it. They light 20 m round its
// centre, a little wider than a Light Mast, for 0.45 kW: about what a
// Light Mast draws for each square metre, 103 kWh through a Night. A
// landing pad lands the Lander whether its lights have power or not.
// It ships 1300 kg for $38M, against 1240 kg for $30M, and takes 2
// hours longer to assemble.
export const litLandingPad: StructureType = {
  id: "lit-landing-pad",
  label: "Lit landing pad",
  designId: "landing-pad-lights",
  listGroup: "landing-and-parking",
  footprintRadiusMetres: 7,
  components: [
    { componentId: "pad-panel", count: 8 },
    { componentId: "pad-beacon", count: 1 },
    { componentId: "landing-floodlight", count: 4 },
  ],
  dismantlingSpareComponents: 2,
  stageHours: {
    sitePreparation: 6,
    componentDelivery: 2,
    assembly: 10,
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
    nightDrawKilowatts: 0.45,
  },
  lightRadiusMetres: 20,
  habitat: false,
  shieldsHabitat: false,
  landingPad: true,
};

// Graded, marked ground with four bays, each with a power socket on a
// short post, so that idle Machines and the Rover stand together in one
// tidy place and keep warm through the Night. Each bay holds the
// largest Machine, the regolith printer, with a little room round it,
// and two by two they fit a footprint not much wider than a Habitat's.
// Four bays take both Machines and the Rover with one to spare. It is
// about as cheap as anything on the base: its sockets ship 60 kg for
// $4M, against a Light Mast's 40 kg for $3M, and it goes up in 4 hours
// of work, half of them grading the ground.
export const parkingArea: StructureType = {
  id: "parking-area",
  label: "Parking area",
  designId: "parking-areas",
  listGroup: "landing-and-parking",
  footprintRadiusMetres: 5.5,
  components: [{ componentId: "bay-socket", count: 4 }],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 2,
    componentDelivery: 0.5,
    assembly: 1,
    commissioning: 0.5,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.1,
  dustWearPercentPerHour: 0.01,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  // Its sockets draw nothing but the heaters plugged in to them, but
  // they need a cable.
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    nightDrawKilowatts: 0,
    cabled: true,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
  parking: {
    bayRadiusMetres: 2,
    bayOffsets: [
      { x: -2.25, y: 2.25 },
      { x: 2.25, y: 2.25 },
      { x: -2.25, y: -2.25 },
      { x: 2.25, y: -2.25 },
    ],
  },
};
