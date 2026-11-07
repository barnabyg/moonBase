import type { StructureType } from "./types";

// The telescope and the automated experiments lab. structures.ts lists them in
// catalogue order.

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

// Act 4: a pressure module of experiment racks that robotic arms tend, so that the
// Research Task running advances twice as fast while it has its power, water and
// oxygen (ADR-0009). It changes no Research Task: it adds a game-minute to the one
// running for each game-minute it is supplied, so a lab supplied all through a
// Lunation saves 708 hours of research, and two save twice that. For each hour
// saved it takes 0.5 kg of water, 0.1 kg of oxygen and 4 kWh: 354 kg, 71 kg and
// 2,832 kWh a Lunation. Act 4's Research Tasks pay about 0.14 Science an hour, so
// that comes to about 100 Science a Lunation, a little less than a Greenhouse's
// 118, for half its water, as much oxygen as nearly three Mission Directors
// breathe, and five times its power. What it costs is power: 4 kW by day, which a
// concentrator tower covers, and 4 kW at Night, 912 kWh through one, more than a
// large battery bank stores, so a typical Act 4 base has to add a battery bank or
// a thermal store for it. As a Night load it gives that up before anything else
// goes without, and it takes its water and oxygen a batch at a time, never below
// the reserve. A shortage only stops the speed-up, as no Research Task is lost.
export const experimentsLab: StructureType = {
  id: "experiments-lab",
  label: "Automated experiments lab",
  designId: "automated-experiments",
  listGroup: "science",
  footprintRadiusMetres: 6,
  components: [
    { componentId: "lab-module", count: 2 },
    { componentId: "experiment-rack", count: 4 },
  ],
  dismantlingSpareComponents: 3,
  stageHours: {
    sitePreparation: 8,
    componentDelivery: 3,
    assembly: 30,
    commissioning: 8,
  },
  stageMachines: { sitePreparation: "excavator" },
  // Its arms have to be taught every rack, so Commissioning is slow and chancy.
  commissioningFailureChance: 0.2,
  dustWearPercentPerHour: 0.04,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    nightDrawKilowatts: 4,
    daylightDrawKilowatts: 4,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
  // It draws its power as a Structure does (above), not as a recipe does.
  recipes: [
    {
      id: "experimenting",
      label: "Experimenting",
      inputs: [
        {
          resource: { kind: "life-support", stockId: "water" },
          kilogramsPerHour: 0.5,
        },
        {
          resource: { kind: "life-support", stockId: "oxygen" },
          kilogramsPerHour: 0.1,
        },
      ],
      outputs: [],
      drawKilowatts: 0,
    },
  ],
  speedsResearch: { addedMinutesPerMinute: 1 },
};
