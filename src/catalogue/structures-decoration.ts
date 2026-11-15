import type { StructureType } from "./types";

// Decorations: Structures there for how they look and what they mean, not for
// what they make. None draws power, gives light or takes a cable, so being
// Broken stops nothing, though the Robot still repairs them. Those shipped
// from Earth wear by Dust at a fifth of a Light Mast's rate; the rock garden,
// packed Regolith, not at all. structures.ts lists them in catalogue order.

const STANDS_STILL: Pick<
  StructureType,
  | "hazardMultipliers"
  | "power"
  | "lightRadiusMetres"
  | "habitat"
  | "shieldsHabitat"
  | "landingPad"
> = {
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
};

/** A fifth of a Light Mast's rate. */
const SLOW_DUST_WEAR_PERCENT_PER_HOUR = 0.004;

// A flag on a pole, with a rod along its top edge to hold it out in the
// vacuum: the first thing to put up.
export const flagPole: StructureType = {
  id: "flag-pole",
  label: "Flag pole",
  designId: "decorations",
  listGroup: "decoration",
  // Wide enough for the flag, which hangs out to one side of the pole.
  footprintRadiusMetres: 0.8,
  components: [{ componentId: "flag-kit", count: 1 }],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 0.5,
    componentDelivery: 0.5,
    assembly: 0.5,
    commissioning: 0.25,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0,
  dustWearPercentPerHour: SLOW_DUST_WEAR_PERCENT_PER_HOUR,
  ...STANDS_STILL,
};

// A plaque on a plinth marking the founding of the base.
export const foundingMemorial: StructureType = {
  id: "founding-memorial",
  label: "Founding memorial",
  designId: "decorations",
  listGroup: "decoration",
  footprintRadiusMetres: 0.8,
  components: [{ componentId: "memorial-plaque", count: 1 }],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 0.5,
    componentDelivery: 0.5,
    assembly: 1,
    commissioning: 0.25,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0,
  dustWearPercentPerHour: SLOW_DUST_WEAR_PERCENT_PER_HOUR,
  ...STANDS_STILL,
};

// A ring of local rocks round a raked bed of Regolith. The excavator digs the
// rocks out as it grades the ground, and the Robot sets them in place: nothing
// is shipped, so dismantling it gives no spares back.
export const rockGarden: StructureType = {
  id: "rock-garden",
  label: "Rock garden",
  designId: "decorations",
  listGroup: "decoration",
  footprintRadiusMetres: 2.5,
  components: [],
  dismantlingSpareComponents: 0,
  stageHours: {
    sitePreparation: 3,
    componentDelivery: 0,
    assembly: 4,
    commissioning: 0.25,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0,
  // Packed Regolith and rock have nothing for Dust to wear.
  dustWearPercentPerHour: 0,
  ...STANDS_STILL,
};

// A chair behind a windbreak, with a small screen beside it, looking out over
// the base. It is scenery: the Mission Director doesn't come out to it.
export const viewingArea: StructureType = {
  id: "viewing-area",
  label: "Mission Director's viewing area",
  designId: "decorations",
  listGroup: "decoration",
  footprintRadiusMetres: 1.5,
  components: [{ componentId: "viewing-area-kit", count: 1 }],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 0.5,
    componentDelivery: 0.5,
    assembly: 1.5,
    commissioning: 0.25,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0,
  dustWearPercentPerHour: SLOW_DUST_WEAR_PERCENT_PER_HOUR,
  ...STANDS_STILL,
};
