import type { StructureType } from "./types";

// The telescope. structures.ts lists it in catalogue order.

// An optical telescope: a half-metre mirror in an open tube on a
// fork mount, which observes the sky only at Night, when the sun is
// down. Like a light, it is a Night load: its drives, cooled camera and
// the heaters that keep its mirror from frosting draw 0.25 kW while it
// observes, 57 kWh through a whole Night, over a quarter of a battery
// bank and about half of what the starting battery banks have to spare
// once the Habitat and the Machines' heaters have theirs; it switches
// itself off before it would eat into that, and stands parked and
// unpowered in Daylight. Aligning its optics makes Commissioning slow
// and chancy.
export const telescope: StructureType = {
  id: "telescope",
  label: "Telescope",
  designId: "optical-telescopes",
  listGroup: "science",
  footprintRadiusMetres: 1.5,
  components: [
    { componentId: "telescope-optics", count: 1 },
    { componentId: "telescope-mount", count: 1 },
  ],
  dismantlingSpareComponents: 1,
  stageHours: {
    sitePreparation: 1,
    componentDelivery: 0.5,
    assembly: 3,
    commissioning: 2,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.2,
  // Its drives and the mirror's cover grind on the Dust.
  dustWearPercentPerHour: 0.03,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    nightDrawKilowatts: 0.25,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
  telescope: true,
};
