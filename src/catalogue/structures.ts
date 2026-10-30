import type { Catalogue } from "./types";

// The Structures that can be planned, and what is lost in dismantling them.

export const structureTypes: Catalogue["structureTypes"] = [
  {
    id: "solar-array",
    label: "Solar array",
    designId: "solar-arrays",
    footprintRadiusMetres: 3,
    components: [
      { componentId: "solar-panel", count: 2 },
      { componentId: "array-mast", count: 1 },
    ],
    stageHours: {
      sitePreparation: 2,
      componentDelivery: 1,
      assembly: 3,
      commissioning: 1,
    },
    stageMachines: { sitePreparation: "excavator" },
    commissioningFailureChance: 0.25,
    // Its tracking drive and panel hinges grind on the Dust.
    dustWearPercentPerHour: 0.05,
    hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
    // The drive that keeps the panel turned to the sun.
    power: {
      generationKilowatts: 10,
      storageKilowattHours: 0,
      drawKilowatts: 0.05,
      nightDrawKilowatts: 0,
    },
    lightRadiusMetres: 0,
    habitat: false,
    shieldsHabitat: false,
    landingPad: false,
  },
  // A solar array whose tracking drive and panel hinges are sealed in a
  // sealed array mast, so that Dust wears it down at 0.02 percentage
  // points an hour rather than 0.05. Otherwise it is a solar array.
  {
    id: "dust-sealed-solar-array",
    label: "Dust-sealed solar array",
    designId: "dust-sealed-solar-arrays",
    footprintRadiusMetres: 3,
    components: [
      { componentId: "solar-panel", count: 2 },
      { componentId: "sealed-array-mast", count: 1 },
    ],
    stageHours: {
      sitePreparation: 2,
      componentDelivery: 1,
      assembly: 3,
      commissioning: 1,
    },
    stageMachines: { sitePreparation: "excavator" },
    commissioningFailureChance: 0.25,
    dustWearPercentPerHour: 0.02,
    hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
    power: {
      generationKilowatts: 10,
      storageKilowattHours: 0,
      drawKilowatts: 0.05,
      nightDrawKilowatts: 0,
    },
    lightRadiusMetres: 0,
    habitat: false,
    shieldsHabitat: false,
    landingPad: false,
  },
  // A dust-sealed solar array whose panels carry an electrodynamic dust
  // screen, which pushes Dust off the cells, so that its coating builds
  // up at a quarter of the rate: past the cleaning threshold in some four
  // Lunations' Daylight rather than one.
  {
    id: "dust-screened-solar-array",
    label: "Dust-screened solar array",
    designId: "electrodynamic-dust-screens",
    footprintRadiusMetres: 3,
    components: [
      { componentId: "screened-solar-panel", count: 2 },
      { componentId: "sealed-array-mast", count: 1 },
    ],
    stageHours: {
      sitePreparation: 2,
      componentDelivery: 1,
      assembly: 3,
      commissioning: 1,
    },
    stageMachines: { sitePreparation: "excavator" },
    commissioningFailureChance: 0.25,
    dustWearPercentPerHour: 0.02,
    hazardMultipliers: {
      dustCoating: 0.25,
      micrometeorites: 1,
      plumeEjecta: 1,
    },
    power: {
      generationKilowatts: 10,
      storageKilowattHours: 0,
      drawKilowatts: 0.05,
      nightDrawKilowatts: 0,
    },
    lightRadiusMetres: 0,
    habitat: false,
    shieldsHabitat: false,
    landingPad: false,
  },
  // A solar array whose panels are thin-film cells on a light, flexible
  // backing, stretched wider and taller on the same mast, so that it
  // generates 15 kW rather than 10 from 150 kg shipped rather than 200:
  // twice as much for each kilogram, though more for each kW in money.
  {
    id: "thin-film-solar-array",
    label: "Thin-film solar array",
    designId: "thin-film-solar-cells",
    footprintRadiusMetres: 3,
    components: [
      { componentId: "thin-film-solar-panel", count: 2 },
      { componentId: "array-mast", count: 1 },
    ],
    stageHours: {
      sitePreparation: 2,
      componentDelivery: 1,
      assembly: 3,
      commissioning: 1,
    },
    stageMachines: { sitePreparation: "excavator" },
    commissioningFailureChance: 0.25,
    dustWearPercentPerHour: 0.05,
    hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
    power: {
      generationKilowatts: 15,
      storageKilowattHours: 0,
      drawKilowatts: 0.05,
      nightDrawKilowatts: 0,
    },
    lightRadiusMetres: 0,
    habitat: false,
    shieldsHabitat: false,
    landingPad: false,
  },
  // A solar array put together and tested on Earth, its panel folded on
  // its mast on a skid, so that it stands on less grading, comes off the
  // stockpile as one Component and only has to be unfolded: 3 hours to
  // build rather than 7, and it fails Commissioning one time in ten rather
  // than one in four. It ships 230 kg for $14M, against 200 kg for $11M.
  {
    id: "prefabricated-solar-array",
    label: "Prefabricated solar array",
    designId: "prefabricated-solar-arrays",
    footprintRadiusMetres: 3,
    components: [{ componentId: "prefabricated-array-pack", count: 1 }],
    stageHours: {
      sitePreparation: 1,
      componentDelivery: 0.5,
      assembly: 1,
      commissioning: 0.5,
    },
    stageMachines: { sitePreparation: "excavator" },
    commissioningFailureChance: 0.1,
    dustWearPercentPerHour: 0.05,
    hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
    power: {
      generationKilowatts: 10,
      storageKilowattHours: 0,
      drawKilowatts: 0.05,
      nightDrawKilowatts: 0,
    },
    lightRadiusMetres: 0,
    habitat: false,
    shieldsHabitat: false,
    landingPad: false,
  },
  {
    id: "battery-bank",
    label: "Battery bank",
    designId: "battery-banks",
    footprintRadiusMetres: 2,
    components: [
      { componentId: "battery-module", count: 3 },
      { componentId: "battery-cabinet", count: 1 },
    ],
    stageHours: {
      sitePreparation: 1,
      componentDelivery: 1,
      assembly: 2,
      commissioning: 1,
    },
    stageMachines: { sitePreparation: "excavator" },
    commissioningFailureChance: 0.2,
    dustWearPercentPerHour: 0.02,
    hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
    // A pack of modern cells, about what a small electric car carries. The
    // heaters that keep them warm enough to work take 16 kWh through a
    // Night, a twelfth of what it stores, so that a battery bank carries
    // most of it through one.
    power: {
      generationKilowatts: 0,
      storageKilowattHours: 200,
      drawKilowatts: 0.07,
      nightDrawKilowatts: 0,
    },
    lightRadiusMetres: 0,
    habitat: false,
    shieldsHabitat: false,
    landingPad: false,
  },
  // A battery bank in a Whipple-shielded cabinet: a thin bumper plate
  // standing clear of it shatters a Micrometeorite before it strikes, so
  // that each strike takes a quarter of the Condition off it. Otherwise
  // it is a battery bank.
  {
    id: "whipple-shielded-battery-bank",
    label: "Whipple-shielded battery bank",
    designId: "whipple-shielding",
    footprintRadiusMetres: 2,
    components: [
      { componentId: "battery-module", count: 3 },
      { componentId: "whipple-cabinet", count: 1 },
    ],
    stageHours: {
      sitePreparation: 1,
      componentDelivery: 1,
      assembly: 2,
      commissioning: 1,
    },
    stageMachines: { sitePreparation: "excavator" },
    commissioningFailureChance: 0.2,
    dustWearPercentPerHour: 0.02,
    hazardMultipliers: {
      dustCoating: 1,
      micrometeorites: 0.25,
      plumeEjecta: 1,
    },
    power: {
      generationKilowatts: 0,
      storageKilowattHours: 200,
      drawKilowatts: 0.07,
      nightDrawKilowatts: 0,
    },
    lightRadiusMetres: 0,
    habitat: false,
    shieldsHabitat: false,
    landingPad: false,
  },
  // Four times a battery bank's storage, in denser cells, so it ships
  // about half the mass and costs about half as much for each kWh. It
  // takes longer to build, and its heaters draw more, if less for each kWh.
  {
    id: "large-battery-bank",
    label: "Large battery bank",
    designId: "large-battery-banks",
    footprintRadiusMetres: 3,
    components: [
      { componentId: "large-battery-module", count: 4 },
      { componentId: "large-battery-cabinet", count: 1 },
    ],
    stageHours: {
      sitePreparation: 2,
      componentDelivery: 1.5,
      assembly: 4,
      commissioning: 1.5,
    },
    stageMachines: { sitePreparation: "excavator" },
    commissioningFailureChance: 0.2,
    dustWearPercentPerHour: 0.02,
    hazardMultipliers: { dustCoating: 1, micrometeorites: 1, plumeEjecta: 1 },
    // The heaters that keep the cells warm enough to work: three times a
    // battery bank's, for four times the storage.
    power: {
      generationKilowatts: 0,
      storageKilowattHours: 800,
      drawKilowatts: 0.2,
      nightDrawKilowatts: 0,
    },
    lightRadiusMetres: 0,
    habitat: false,
    shieldsHabitat: false,
    landingPad: false,
  },
  {
    id: "light-mast",
    label: "Light mast",
    designId: "light-masts",
    footprintRadiusMetres: 0.8,
    components: [
      { componentId: "mast-pole", count: 1 },
      { componentId: "light-head", count: 1 },
    ],
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
  },
  // A Light Mast on a pole twice as tall, with two light heads, lighting
  // a circle twice as wide: four times the ground for two and a half
  // times the power. Through a Night it draws 228 kWh, a little more than
  // a battery bank stores.
  {
    id: "tall-light-mast",
    label: "Tall Light Mast",
    designId: "tall-light-masts",
    footprintRadiusMetres: 1.2,
    components: [
      { componentId: "tall-mast-pole", count: 1 },
      { componentId: "light-head", count: 2 },
    ],
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
  },
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
  {
    id: "telescope",
    label: "Telescope",
    designId: "optical-telescopes",
    footprintRadiusMetres: 1.5,
    components: [
      { componentId: "telescope-optics", count: 1 },
      { componentId: "telescope-mount", count: 1 },
    ],
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
  },
  {
    id: "habitat",
    label: "Inflatable Habitat",
    designId: "inflatable-habitat",
    footprintRadiusMetres: 4,
    components: [
      { componentId: "habitat-core", count: 1 },
      { componentId: "habitat-envelope", count: 1 },
      { componentId: "airlock", count: 1 },
    ],
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
  },
  // An inflatable Habitat whose envelope is layered like a Whipple
  // shield, so that a Micrometeorite strike and a blast of Plume Ejecta
  // each take a quarter of the Condition off it. Otherwise it is a
  // Habitat: the Mission Director can move in, and Regolith shielding
  // goes over it.
  {
    id: "hardened-habitat",
    label: "Hardened Habitat",
    designId: "hardened-habitat",
    footprintRadiusMetres: 4,
    components: [
      { componentId: "habitat-core", count: 1 },
      { componentId: "armoured-habitat-envelope", count: 1 },
      { componentId: "airlock", count: 1 },
    ],
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
  },
  {
    id: "regolith-shielding",
    label: "Regolith shielding",
    designId: "regolith-shielding",
    // The same as the Habitat's, so that the excavator, left beside the
    // Habitat after grading its site, isn't in the way.
    footprintRadiusMetres: 4,
    // The excavator digs the Regolith the printer prints it from, beside
    // the Habitat, as part of Site Preparation: 3 hours of grading, then
    // 6 of digging. No Components.
    components: [],
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
  },
  // Regolith shielding whose every layer is fused by microwaves as the
  // regolith printer lays it, rather than left to settle under the next,
  // so that the printer lays it in 20 hours rather than 48: 31 hours in
  // all rather than 59, under an unshielded Habitat's Radiation Dose. The
  // excavator digs its Regolith just as long.
  {
    id: "sintered-regolith-shielding",
    label: "Sintered Regolith shielding",
    designId: "microwave-sintering",
    footprintRadiusMetres: 4,
    components: [],
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
  },
  // Bladders of water laid over a Habitat's Regolith shielding: water is
  // rich in hydrogen, which stops the protons of the Sun and the cosmic
  // rays that get through Regolith better than Regolith does. The
  // bladders are shipped empty and filled from the base's water as they
  // go up, so a water wall is as much water as it is Components, and
  // making water matters beyond what the Mission Director drinks.
  {
    id: "water-wall",
    label: "Water wall",
    designId: "water-wall-shielding",
    // The same as the Habitat's and its shielding's, which it stands over.
    footprintRadiusMetres: 4,
    components: [{ componentId: "water-wall-bladder", count: 4 }],
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
  },
  {
    id: "landing-pad",
    label: "Landing pad",
    designId: "landing-pads",
    // Wide enough for the Lander to stand on with room round it, and for
    // its engine to blast nothing but the pad.
    footprintRadiusMetres: 7,
    // Interlocking panels laid on graded ground, and a beacon to guide
    // the Lander down.
    components: [
      { componentId: "pad-panel", count: 8 },
      { componentId: "pad-beacon", count: 1 },
    ],
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
  },
  // A landing pad the regolith printer lays from Regolith, fusing it into
  // a hard slab as it goes, so that nothing has to be shipped from Earth
  // for it: the Lander comes down on its own radar, with no beacon. It
  // stands on the same ground as a landing pad shipped from Earth, graded
  // as long, and then the excavator digs the Regolith for 6 hours more.
  // It takes 49 hours to build rather than 17, most of them printing.
  {
    id: "sintered-landing-pad",
    label: "Sintered landing pad",
    designId: "regolith-sintering",
    footprintRadiusMetres: 7,
    components: [],
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
  },
  // A landing pad with a pad light on a short post at each quarter of its
  // edge, which switch on by themselves at Night, so that the Lander can
  // be seen landing and the Robot unloading it. They light 20 m round its
  // centre, a little wider than a Light Mast, for 0.45 kW: about what a
  // Light Mast draws for each square metre, 103 kWh through a Night. A
  // landing pad lands the Lander whether its lights have power or not.
  // It ships 1300 kg for $38M, against 1240 kg for $30M, and takes 2
  // hours longer to assemble.
  {
    id: "lit-landing-pad",
    label: "Lit landing pad",
    designId: "landing-pad-lights",
    footprintRadiusMetres: 7,
    components: [
      { componentId: "pad-panel", count: 8 },
      { componentId: "pad-beacon", count: 1 },
      { componentId: "landing-floodlight", count: 4 },
    ],
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
  },
  // Graded, marked ground with four bays, each with a power socket on a
  // short post, so that idle Machines and the Rover stand together in one
  // tidy place and keep warm through the Night. Each bay holds the
  // largest Machine, the regolith printer, with a little room round it,
  // and two by two they fit a footprint not much wider than a Habitat's.
  // Four bays take both Machines and the Rover with one to spare. It is
  // about as cheap as anything on the base: its sockets ship 60 kg for
  // $4M, against a Light Mast's 40 kg for $3M, and it goes up in 4 hours
  // of work, half of them grading the ground.
  {
    id: "parking-area",
    label: "Parking area",
    designId: "parking-areas",
    footprintRadiusMetres: 5.5,
    components: [{ componentId: "bay-socket", count: 4 }],
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
  },
  {
    id: "extraction-plant",
    label: "Extraction plant",
    designId: "regolith-extraction",
    footprintRadiusMetres: 3,
    // A reactor that melts Regolith and splits it by electrolysis, and
    // the plant that draws the oxygen off.
    components: [
      { componentId: "extraction-reactor", count: 1 },
      { componentId: "oxygen-separator", count: 1 },
    ],
    stageHours: {
      sitePreparation: 3,
      componentDelivery: 1,
      assembly: 6,
      commissioning: 2,
    },
    stageMachines: { sitePreparation: "excavator" },
    commissioningFailureChance: 0.2,
    // Regolith is fed through it, so it wears faster than most.
    dustWearPercentPerHour: 0.05,
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
    // Run for oxygen, a few percent of the Regolith comes out as oxygen,
    // about four times what the Mission Director breathes while it runs,
    // with a little metal and silicon; run for metals and silicon, it
    // reduces much more of it to them, and keeps little of the oxygen.
    // What is left is slag. It runs only in Daylight, 20 of a Lunation's
    // 29.5 Earth Days, so to make the 24.8 kg of oxygen the Mission
    // Director uses in a Lunation it has to run for oxygen for about 30%
    // of the Daylight (0.15 kg an hour for oxygen, 0.01 for metals and
    // silicon). In the rest it makes under 0.3 kg of silicon an hour,
    // averaged over the Daylight: less than the 0.35 kg a vacuum
    // fabrication plant takes. So one extraction plant can't keep the base
    // self-sufficient in oxygen and feed a vacuum fabrication plant too;
    // the player switches between the recipes, or imports a second one.
    recipes: [
      {
        id: "oxygen",
        label: "Oxygen",
        inputs: [
          {
            resource: { kind: "bulk-resource", resourceId: "regolith" },
            kilogramsPerHour: 4,
          },
        ],
        outputs: [
          {
            resource: { kind: "life-support", stockId: "oxygen" },
            kilogramsPerHour: 0.15,
          },
          {
            resource: { kind: "bulk-resource", resourceId: "metals" },
            kilogramsPerHour: 0.04,
          },
          {
            resource: { kind: "bulk-resource", resourceId: "silicon" },
            kilogramsPerHour: 0.02,
          },
        ],
        drawKilowatts: 4,
      },
      {
        id: "metals-and-silicon",
        label: "Metals and silicon",
        inputs: [
          {
            resource: { kind: "bulk-resource", resourceId: "regolith" },
            kilogramsPerHour: 4,
          },
        ],
        outputs: [
          {
            resource: { kind: "life-support", stockId: "oxygen" },
            kilogramsPerHour: 0.01,
          },
          {
            resource: { kind: "bulk-resource", resourceId: "metals" },
            kilogramsPerHour: 0.6,
          },
          {
            resource: { kind: "bulk-resource", resourceId: "silicon" },
            kilogramsPerHour: 0.4,
          },
        ],
        drawKilowatts: 4,
      },
    ],
  },
  // An extraction plant whose reactor is a big molten regolith cell,
  // which melts Regolith through and splits it by electrolysis, rather
  // than reducing what it can at the surface of each grain. It runs the
  // same recipes on 10 kg of Regolith an hour rather than 4, for 8 kW
  // rather than 4, so it makes more of everything for each kW: 0.4 kg of
  // oxygen an hour running for oxygen, enough for the Mission Director in
  // under a seventh of the Daylight, or 1.1 kg of silicon running for
  // metals and silicon, enough for an integrated fabrication plant or
  // three vacuum fabrication plants. With an oxygen separator it ships
  // 1200 kg for $95M, against 1000 kg for $75M: well under half as much
  // for each kilogram of silicon it makes an hour.
  {
    id: "large-extraction-plant",
    label: "Large extraction plant",
    designId: "molten-regolith-electrolysis",
    footprintRadiusMetres: 4,
    components: [
      { componentId: "molten-regolith-cell", count: 1 },
      { componentId: "oxygen-separator", count: 1 },
    ],
    stageHours: {
      sitePreparation: 4,
      componentDelivery: 1,
      assembly: 8,
      commissioning: 3,
    },
    stageMachines: { sitePreparation: "excavator" },
    commissioningFailureChance: 0.25,
    // More Regolith goes through it than through an extraction plant.
    dustWearPercentPerHour: 0.06,
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
            resource: { kind: "bulk-resource", resourceId: "regolith" },
            kilogramsPerHour: 10,
          },
        ],
        outputs: [
          {
            resource: { kind: "life-support", stockId: "oxygen" },
            kilogramsPerHour: 0.4,
          },
          {
            resource: { kind: "bulk-resource", resourceId: "metals" },
            kilogramsPerHour: 0.1,
          },
          {
            resource: { kind: "bulk-resource", resourceId: "silicon" },
            kilogramsPerHour: 0.05,
          },
        ],
        drawKilowatts: 8,
      },
      {
        id: "metals-and-silicon",
        label: "Metals and silicon",
        inputs: [
          {
            resource: { kind: "bulk-resource", resourceId: "regolith" },
            kilogramsPerHour: 10,
          },
        ],
        outputs: [
          {
            resource: { kind: "life-support", stockId: "oxygen" },
            kilogramsPerHour: 0.03,
          },
          {
            resource: { kind: "bulk-resource", resourceId: "metals" },
            kilogramsPerHour: 1.6,
          },
          {
            resource: { kind: "bulk-resource", resourceId: "silicon" },
            kilogramsPerHour: 1.1,
          },
        ],
        drawKilowatts: 8,
      },
    ],
  },
  {
    id: "water-processing-plant",
    label: "Water-processing plant",
    designId: "water-processing",
    footprintRadiusMetres: 2.5,
    // A heated tank that melts the ice, and a still that cleans the water.
    components: [
      { componentId: "ice-melter", count: 1 },
      { componentId: "water-purifier", count: 1 },
    ],
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
  },
  // A water-processing plant's ice melter feeding an electrolyser stack,
  // which splits the water into oxygen and hydrogen; the hydrogen is
  // vented. Water is eight-ninths oxygen by mass, so most of the ice comes
  // out as oxygen: 0.4 kg an hour, well over twice what an extraction
  // plant running for oxygen makes, for 5 kW rather than 4. Running for 62
  // hours, an eighth of a Lunation's Daylight, it makes the 24.8 kg of
  // oxygen the Mission Director uses in a Lunation from 31 kg of ice, a
  // sixth of what an Expedition brings back, and leaves the extraction
  // plant free to run for metals and silicon.
  {
    id: "electrolysis-plant",
    label: "Electrolysis plant",
    designId: "water-electrolysis",
    footprintRadiusMetres: 2.5,
    components: [
      { componentId: "ice-melter", count: 1 },
      { componentId: "electrolyser-stack", count: 1 },
    ],
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
  },
  {
    id: "vacuum-fabrication-plant",
    label: "Vacuum fabrication plant",
    designId: "vacuum-fabrication",
    footprintRadiusMetres: 2.5,
    // A furnace that grows silicon crystals in the Moon's vacuum, and a saw
    // that slices them into wafers.
    components: [
      { componentId: "crystal-furnace", count: 1 },
      { componentId: "wafer-saw", count: 1 },
    ],
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
  },
  {
    id: "circuit-board-plant",
    label: "Circuit board plant",
    designId: "circuit-board-fabrication",
    footprintRadiusMetres: 2.5,
    // An etcher that lays circuits on metal-cored boards, and an oven
    // that solders the chips cut from the wafers onto them.
    components: [
      { componentId: "circuit-etcher", count: 1 },
      { componentId: "reflow-oven", count: 1 },
    ],
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
  },
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
  {
    id: "integrated-fabrication-plant",
    label: "Integrated fabrication plant",
    designId: "integrated-fabrication",
    footprintRadiusMetres: 3,
    components: [
      { componentId: "crystal-furnace", count: 1 },
      { componentId: "board-assembly-line", count: 1 },
    ],
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
  },
];

export const dismantlingLossShare: Catalogue["dismantlingLossShare"] = 0.2;
