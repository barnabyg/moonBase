import type { StructureType } from "./types";

// The telescope, the automated experiments lab, the infrared telescope, the
// radio telescope array and its antenna fields. structures.ts lists them in
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
// Research Task running advances 2.3 times as fast while it has its power, water
// and oxygen (ADR-0009). It changes no Research Task: it adds 1.3 game-minutes to
// the one running for each game-minute it is supplied, so a lab supplied all
// through a Lunation saves 920 hours of research, and two save twice that. That
// rate is what has the long-game play guide, with one lab, finish Act 4's research
// near Earth Day 2,300 (#265). Each game-hour it runs it takes 0.5 kg of water,
// 0.1 kg of oxygen and 4 kWh, about 0.38 kg, 0.08 kg and 3.1 kWh for each hour
// saved: 354 kg, 71 kg and 2,832 kWh a Lunation. Act 4's Research Tasks pay about
// 0.14 Science an hour, so that comes to about 129 Science a Lunation, a little
// more than a Greenhouse's 118, for half its water, as much oxygen as nearly three
// Mission Directors breathe, and five times its power. What it costs is power:
// 4 kW by day, which a concentrator tower covers, and 4 kW at Night, 912 kWh
// through one, more than a large battery bank stores, so a typical Act 4 base has
// to add a battery bank or a thermal store for it. As a Night load it gives that up before anything else
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
  speedsResearch: { addedMinutesPerMinute: 1.3 },
};

// Act 4: a 2 m segmented mirror on a heavy mount, its near-infrared camera cooled by
// boiling off the base's propellant (ADR-0009). It is a new Structure: the optical
// telescope is unchanged. It observes only at Night, on rounds of its own Deep
// infrared survey, each round 48 hours of Night paying 24 Science, four times the
// Night-sky survey's, so one observing all through the 228 hours of a Night earns
// 4.75 rounds, 114 Science a Lunation, about a Greenhouse's 118. It boils off 2 kg
// of propellant an hour while it observes, 456 kg a Lunation, a small propellant
// plant's Daylight: 4 kg of propellant for each Science, which would sell for
// $4.8M. It takes it a batch at a time, never what the Lander needs for the
// Exports set to load (see `propellantKeptForTheLander`). Its drives, heaters
// and cryocooler's pumps draw 4 kW at Night, 912 kWh through one, more than a
// large battery bank stores, so a typical Act 4 base has to add Night storage for
// it; as a Night load it gives that up before anything else goes without. It
// can't observe while a lit Structure stands within 80 m, its dark radius, so it
// is built away from the base at the end of a long cable. A shortage of
// propellant or power, or a light within its dark radius, loses the round it is
// on; Daylight only pauses it.
export const infraredTelescope: StructureType = {
  id: "infrared-telescope",
  label: "Infrared telescope",
  designId: "infrared-astronomy",
  listGroup: "science",
  footprintRadiusMetres: 4,
  components: [
    { componentId: "infrared-mirror-segment", count: 3 },
    { componentId: "infrared-camera", count: 1 },
    { componentId: "heavy-telescope-mount", count: 1 },
  ],
  dismantlingSpareComponents: 3,
  stageHours: {
    sitePreparation: 6,
    componentDelivery: 3,
    assembly: 24,
    commissioning: 10,
  },
  stageMachines: { sitePreparation: "excavator" },
  // Phasing its mirror's segments makes Commissioning slow and chancy.
  commissioningFailureChance: 0.25,
  dustWearPercentPerHour: 0.03,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0,
    nightDrawKilowatts: 4,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
  // It draws its power as a Night load (above), not as a recipe does.
  recipes: [
    {
      id: "cooling",
      label: "Cooling",
      inputs: [
        {
          resource: { kind: "bulk-resource", resourceId: "propellant" },
          kilogramsPerHour: 2,
        },
      ],
      outputs: [],
      drawKilowatts: 0,
    },
  ],
  keepClear: { of: "lit", radiusMetres: 80 },
  observingRounds: {
    label: "Deep infrared survey",
    lengthHours: 48,
    science: 24,
  },
};

// Act 4: a field of sixteen antenna tiles, whose signals a correlator combines
// (ADR-0009). It works through Daylight and Night alike, on rounds of its own
// Radio sky survey, each round 24 hours paying 3 Science, so one working all
// through the 708 hours of a Lunation earns 29.5 rounds, about 88 Science a
// Lunation, three-quarters of a Greenhouse's 118. It is built with one antenna
// field; each round's work is its performance's share of a game-minute for each
// field it has, so more fields earn faster. What it costs is Components, cable
// and the Robot's time rather than power: its receivers and correlator draw a
// steady 2 kW, by day and at Night, as a Structure does, 456 kWh through a
// Night, a little over half of a large battery bank. It can't work while a Plant
// stands within 120 m of it, its quiet radius, as their pumps, motors and power
// converters drown the sky's faint signals, so it is built away from the base at
// the end of a long cable: 20 hours of the Robot's time at 6 m an hour. It isn't
// a Plant itself, so arrays never stop each other. A shortage of power, or a
// Plant within its quiet radius, loses the round it is on.
export const radioTelescopeArray: StructureType = {
  id: "radio-telescope-array",
  label: "Radio telescope array",
  designId: "radio-astronomy",
  listGroup: "science",
  footprintRadiusMetres: 8,
  components: [
    { componentId: "antenna-tile", count: 16 },
    { componentId: "array-correlator", count: 1 },
  ],
  dismantlingSpareComponents: 3,
  stageHours: {
    sitePreparation: 12,
    componentDelivery: 8,
    // Laying out and connecting sixteen tiles, one at a time.
    assembly: 36,
    commissioning: 6,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.1,
  dustWearPercentPerHour: 0.02,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 2,
    nightDrawKilowatts: 0,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
  keepClear: { of: "plants", radiusMetres: 120 },
  radioArray: {
    label: "Radio sky survey",
    lengthHours: 24,
    science: 3,
  },
};

// Act 4: another antenna field for a radio telescope array, the lever a player
// can keep pulling (#263): sixteen more antenna tiles and a field receiver that
// sends their signals to the array's correlator. It may be placed only beside a
// commissioned array, its footprint within 10 m of the array's or of a field's
// that joins it, and joins that array. Once commissioned, each field adds a whole
// field's work to the array's round, at its own performance, while it has power:
// another 88.5 Science a Lunation, as much as the array earns with its own field,
// for 950 kg and $1,000M by Launch, 52 hours of Construction and a short cable,
// less than the array costs as it needs no correlator. Its receiver draws a
// steady 0.5 kW, by day and at Night, 114 kWh through a Night. A Broken field, or
// one without power, adds nothing, but loses the array no round. It isn't a
// Plant, but a Plant within its quiet radius, as within the array's, stops the
// whole array. The array can't be dismantled while any field joins it.
export const antennaField: StructureType = {
  id: "antenna-field",
  label: "Antenna field",
  designId: "radio-astronomy",
  listGroup: "science",
  footprintRadiusMetres: 8,
  components: [
    { componentId: "antenna-tile", count: 16 },
    { componentId: "field-receiver", count: 1 },
  ],
  dismantlingSpareComponents: 3,
  stageHours: {
    sitePreparation: 10,
    componentDelivery: 8,
    // Laying out and connecting sixteen tiles, one at a time.
    assembly: 30,
    commissioning: 4,
  },
  stageMachines: { sitePreparation: "excavator" },
  commissioningFailureChance: 0.1,
  dustWearPercentPerHour: 0.02,
  hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
  power: {
    generationKilowatts: 0,
    storageKilowattHours: 0,
    drawKilowatts: 0.5,
    nightDrawKilowatts: 0,
  },
  lightRadiusMetres: 0,
  habitat: false,
  shieldsHabitat: false,
  landingPad: false,
  keepClear: { of: "plants", radiusMetres: 120 },
  antennaField: { besideWithinMetres: 10 },
};
