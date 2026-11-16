import { catalogue } from "../../src/catalogue";
import { loadCampaign, reserveKilograms } from "../../src/simulation";
import { toGameMinutes } from "../scenario";
import {
  addComponents,
  freshSaveWith,
  saveWith,
  stockOf,
  type EditableSaveState,
} from "./save-editing";
import type { TryScenario } from "./try-scenario";

/** Where `greenhouseSave` puts what it builds. */
const GREENHOUSE_BASE_SITES = [
  ["solar-array", { x: 40, y: 25 }],
  ["large-battery-bank", { x: 40, y: 36 }],
  ["water-processing-plant", { x: 52, y: 36 }],
  ["greenhouse", { x: 54, y: 22 }],
] as const;

/** The water above the Mission Director's reserve in `greenhouseSave`: a day's and a bit, into the Night. */
const GREENHOUSE_WATER_ABOVE_RESERVE_KILOGRAMS = 30;

/**
 * A base with a Greenhouse growing on a solar array and a large battery bank, a few
 * hours before Night, with a day's water above the reserve and a water-processing
 * plant switched off with water ice to use. The Habitat is left out, so that the
 * Mission Director's stay aboard the Lander lets a player watch it for as long as
 * they like.
 */
export function greenhouseSave(): string {
  const componentsOf = (id: string) =>
    catalogue.structureTypes.find((type) => type.id === id)?.components ?? [];
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      state.unlockedDesignIds.push(
        "water-electrolysis",
        "molten-regolith-electrolysis",
        "parts-machining",
        "cold-trap-mining",
        "large-battery-banks",
        "lunar-greenhouses",
      );
      addComponents(state, [
        ...GREENHOUSE_BASE_SITES.flatMap(([id]) => componentsOf(id)),
        ...componentsOf("greenhouse"),
        { componentId: catalogue.maintenance.spareComponentId, count: 30 },
      ]);
      stockOf(state, "water-ice", 800);
      // So that it grows from the day it is commissioned, up to the scenario's start.
      for (const stock of state.lifeSupport) {
        if (stock.stockId === "water") stock.kilograms = 400;
      }
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  for (const [structureTypeId, position] of GREENHOUSE_BASE_SITES) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 40 * 24) throw new Error("The base was never finished.");
    campaign.advance(60);
  }
  const plant = campaign
    .snapshot()
    .structures.find(
      ({ structureTypeId }) => structureTypeId === "water-processing-plant",
    );
  const off = campaign.switchPlant(plant?.id ?? "", "off");
  if (!off.ok) throw new Error(off.message);
  for (let hours = 0; ; hours++) {
    const { part, minutesRemaining } = campaign.snapshot().lunation;
    if (
      part === "daylight" &&
      minutesRemaining <= toGameMinutes({ hours: 6 })
    ) {
      break;
    }
    if (hours > 40 * 24) throw new Error("Night never came near.");
    campaign.advance(60);
  }
  const watered = loadCampaign(
    saveWith(campaign, (state) => {
      for (const stock of state.lifeSupport) {
        if (stock.stockId === "water") {
          stock.kilograms =
            reserveKilograms("water") +
            GREENHOUSE_WATER_ABOVE_RESERVE_KILOGRAMS;
        }
      }
    }),
  );
  if (!watered.ok) throw new Error(watered.message);
  // A game-minute, so that it says it is growing again from the moment it loads.
  watered.campaign.advance(1);
  return watered.campaign.save();
}

/** Where `experimentsLabSave` puts what it builds. */
const EXPERIMENTS_LAB_SITES = [
  ["solar-array", { x: 20, y: 12 }],
  ["solar-array", { x: 18, y: 28 }],
  ["large-battery-bank", { x: 30, y: 25 }],
  ["large-battery-bank", { x: 30, y: 36 }],
  ["experiments-lab", { x: 36, y: 8 }],
] as const;

/** The Research Task `experimentsLabSave` runs: a long one that needs no Design. */
export const EXPERIMENTS_LAB_TASK = "solar-wind-volatiles-survey";

/**
 * A base with an automated experiments lab speeding up a long Research Task in
 * Daylight, on two solar arrays and two large battery banks, with water and oxygen
 * to spare and a second lab's Components in stock. The Habitat is left out, so
 * that the Mission Director's stay aboard the Lander leaves the stocks to the lab.
 */
export function experimentsLabSave(): string {
  const componentsOf = (id: string) =>
    catalogue.structureTypes.find((type) => type.id === id)?.components ?? [];
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      state.unlockedDesignIds.push(
        "large-battery-banks",
        "molten-regolith-electrolysis",
        "large-propellant-production",
        "precision-optics",
        "automated-experiments",
      );
      addComponents(state, [
        ...EXPERIMENTS_LAB_SITES.flatMap(([id]) => componentsOf(id)),
        ...componentsOf("experiments-lab"),
        { componentId: catalogue.maintenance.spareComponentId, count: 30 },
      ]);
      for (const stock of state.lifeSupport) {
        if (stock.stockId === "water") stock.kilograms = 380;
        if (stock.stockId === "oxygen") stock.kilograms = 60;
      }
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  for (const [structureTypeId, position] of EXPERIMENTS_LAB_SITES) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 40 * 24) throw new Error("The base was never finished.");
    campaign.advance(60);
  }
  const started = campaign.queueResearchTask(EXPERIMENTS_LAB_TASK);
  if (!started.ok) throw new Error(started.message);
  // An hour, so that it is speeding the task up from the moment it loads.
  campaign.advance(60);
  return campaign.save();
}

/**
 * Where `infraredTelescopeSave` puts what it builds: the telescope out past the
 * dark radius of the Light Mast among the battery banks, at the end of a long cable.
 */
export const INFRARED_TELESCOPE_SITES = [
  ["solar-array", { x: 20, y: 12 }],
  ["solar-array", { x: 18, y: 28 }],
  ["large-battery-bank", { x: 30, y: 25 }],
  ["large-battery-bank", { x: 30, y: 36 }],
  ["light-mast", { x: 40, y: 30 }],
  ["infrared-telescope", { x: 130, y: 25 }],
] as const;

/**
 * A base with an infrared telescope observing an hour into the Night, out past the
 * dark radius of a Light Mast by the battery banks, on two solar arrays and two
 * large battery banks, with 600 kg of propellant and a second telescope's
 * Components in stock. The Habitat is left out, so that the Mission Director's stay
 * aboard the Lander leaves the battery banks to the telescope.
 */
export function infraredTelescopeSave(): string {
  const componentsOf = (id: string) =>
    catalogue.structureTypes.find((type) => type.id === id)?.components ?? [];
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      state.unlockedDesignIds.push(
        "large-battery-banks",
        "molten-regolith-electrolysis",
        "propellant-production",
        "large-propellant-production",
        "precision-optics",
        "optical-telescopes",
        "infrared-astronomy",
      );
      addComponents(state, [
        ...INFRARED_TELESCOPE_SITES.flatMap(([id]) => componentsOf(id)),
        ...componentsOf("infrared-telescope"),
        { componentId: catalogue.maintenance.spareComponentId, count: 30 },
      ]);
      stockOf(state, "propellant", 600);
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  for (const [structureTypeId, position] of INFRARED_TELESCOPE_SITES) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 40 * 24) throw new Error("The base was never finished.");
    campaign.advance(60);
  }
  for (let hours = 0; campaign.snapshot().lunation.part !== "night"; hours++) {
    if (hours > 40 * 24) throw new Error("Night never came.");
    campaign.advance(60);
  }
  // An hour, so that it is observing from the moment it loads.
  campaign.advance(60);
  return campaign.save();
}

/**
 * The infrared telescope's base, as `infraredTelescopeSave` has it, once a Survey
 * sent from it has come back with a dark site found, an hour into the next Night:
 * the telescope observing, propellant, and a second telescope's Components in
 * stock to build on the site.
 */
export function observingSitesSave(): string {
  const save = JSON.parse(infraredTelescopeSave()) as {
    state: EditableSaveState;
  };
  save.state.unlockedDesignIds.push("survey-expeditions");
  const loaded = loadCampaign(JSON.stringify(save));
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  const started = campaign.startExpedition("survey");
  if (!started.ok) throw new Error(started.message);
  for (let hours = 0; campaign.snapshot().expedition !== undefined; hours++) {
    if (hours > 20 * 24) throw new Error("The Survey never came back.");
    campaign.advance(60);
  }
  for (
    let hours = 0;
    campaign.snapshot().lunation.part !== "daylight";
    hours++
  ) {
    if (hours > 40 * 24) throw new Error("Daylight never came.");
    campaign.advance(60);
  }
  for (let hours = 0; campaign.snapshot().lunation.part !== "night"; hours++) {
    if (hours > 40 * 24) throw new Error("Night never came.");
    campaign.advance(60);
  }
  campaign.advance(60);
  return campaign.save();
}

/**
 * Where `radioTelescopeArraySave` puts what it builds: the array out past the
 * quiet radius of the water-processing plant among the battery banks, at the end
 * of a long cable.
 */
export const RADIO_TELESCOPE_ARRAY_SITES = [
  ["solar-array", { x: 20, y: 12 }],
  ["solar-array", { x: 18, y: 28 }],
  ["large-battery-bank", { x: 30, y: 25 }],
  ["large-battery-bank", { x: 30, y: 36 }],
  ["water-processing-plant", { x: 40, y: 12 }],
  ["radio-telescope-array", { x: 175, y: 25 }],
] as const;

/**
 * A base with a radio telescope array working in Daylight, an hour into its
 * round, out past the quiet radius of a water-processing plant by the battery
 * banks, on two solar arrays and two large battery banks, with a second
 * water-processing plant's Components in stock to place within it, and two
 * antenna fields' to grow it. The Habitat is
 * left out, so that the Mission Director's stay aboard the Lander leaves the
 * battery banks to the array.
 */
export function radioTelescopeArraySave(): string {
  const componentsOf = (id: string) =>
    catalogue.structureTypes.find((type) => type.id === id)?.components ?? [];
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      state.unlockedDesignIds.push(
        "large-battery-banks",
        "precision-optics",
        "optical-telescopes",
        "radio-astronomy",
      );
      addComponents(state, [
        ...RADIO_TELESCOPE_ARRAY_SITES.flatMap(([id]) => componentsOf(id)),
        ...componentsOf("water-processing-plant"),
        ...componentsOf("antenna-field"),
        ...componentsOf("antenna-field"),
        { componentId: catalogue.maintenance.spareComponentId, count: 30 },
      ]);
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  for (const [structureTypeId, position] of RADIO_TELESCOPE_ARRAY_SITES) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 40 * 24) throw new Error("The base was never finished.");
    campaign.advance(60);
  }
  for (
    let hours = 0;
    campaign.snapshot().lunation.part !== "daylight";
    hours++
  ) {
    if (hours > 40 * 24) throw new Error("Daylight never came.");
    campaign.advance(60);
  }
  // A round started afresh an hour ago, so that it is working from the moment
  // it loads.
  for (
    let minutes = 0;
    (campaign.snapshot().radioArrays[0]?.progress ?? 0) > 0;
    minutes++
  ) {
    if (minutes > 48 * 60) throw new Error("The round never ended.");
    campaign.advance(1);
  }
  campaign.advance(60);
  return campaign.save();
}

export const scienceScenarios: readonly TryScenario[] = [
  {
    id: "greenhouse",
    title:
      "A base with a Greenhouse growing on a solar array and a large battery bank, a few hours before Night, on a day's water above the reserve, with a water-processing plant switched off and a second Greenhouse's Components in stock",
    steps: [
      'Pause the game. In the Base panel the Greenhouse says "growing" and how long is left of this round, and on hovering over that "using 1 kg of water an hour, for 20 Science a round". The status panel\'s Water says "Greenhouse using 24 kg a day" and when it will be down to the reserve. Click it on the map: a glass dome over green racks. Its pop-up has a Round line, with how far the round has got.',
      "Set the game to 5x until Night falls: the dome lights up from inside and lights the ground round it, and the Greenhouse goes on drinking. The power line uses 1.5 kW more for its lamps, against 0.5 kW by day.",
      'Set the game to 20x. About a day into the Night, a notification says the round of growing was lost for want of water, the Greenhouse says "waiting for Water" and that this is to leave the Mission Director\'s reserve of 49 kg, and Water stops falling, as they are still aboard the Lander.',
      'Press "Switch on" beside the Water-processing plant. It has water ice, but it runs only on power to spare: in the next Daylight, once the large battery bank is full, Water rises, and as soon as there is a batch\'s worth above the reserve the Greenhouse starts a new round by itself. Leave it for 5 Earth Days: a notification says a round is complete, and Science in the top bar is 20 higher.',
      'Press "Switch off" beside the Greenhouse: within the hour a notification says its round was given up, and its lamps and power stop.',
      "Open the Guide: Structures has the Greenhouse's card, and Science and technologies says what it earns and asks for. The Launch manifest has its dome and racks, under Life Support.",
    ],
    save: greenhouseSave,
  },
  {
    id: "experiments-lab",
    title:
      "A base with an automated experiments lab speeding up a long Research Task in Daylight, on two solar arrays and two large battery banks, with a second lab's Components in stock",
    steps: [
      'Pause the game and open Research Tasks. Solar wind volatiles survey is running, and says how long it has left "at ×2.3", and below that "1 automated experiments lab speeding it up". The status panel\'s Research Task line says the same time left at ×2.3.',
      'Click the lab on the map: two long modules side by side under a radiator, their ports lit. Its pop-up has a Research line with the task and the rate, and the Base panel says "speeding up the Research Task running". The status panel\'s Water and Oxygen fall by 0.5 kg and 0.1 kg an hour.',
      "Pick Automated experiments lab in the build menu and place a second one on clear ground. Once it is commissioned, Research Tasks says ×3.6, and 2 labs speeding it up.",
      "Set the game to 20x until Night falls and on into it. The two labs draw 8 kW from the battery banks, more than they hold for a whole Night: once the banks are down to what everything else needs, the labs stop, Research Tasks says they are short of power, and the rate falls back to ×1. Nothing else loses power.",
      'Let the Research Task complete with nothing queued: the labs say "idle: no Research Task running to speed up", and draw no power and take no water or oxygen until you start another.',
      "Open the Guide: Structures has the lab's card, and Science and technologies says what it does and asks for. The Launch manifest has its modules and racks, under Industry.",
    ],
    save: experimentsLabSave,
  },
  {
    id: "infrared-telescope",
    title:
      "A base with an infrared telescope observing an hour into the Night, out past the dark radius of a Light Mast by the battery banks, with propellant and a second telescope's Components in stock",
    steps: [
      "Pause the game. The status panel's Research section has an Infrared line, the Deep infrared survey, with 1 infrared telescope observing and the time left of its round. Its Base panel entry says it is observing, and boiling off 2 kg of propellant an hour.",
      "Click the telescope on the map: a large open-truss telescope leaning over to observe, with a silver dewar beside it. Its pop-up has a Round line, and a Dark radius line saying there is no lit Structure within 80 m.",
      "Pick Infrared telescope in the build menu and move it over the base: a pale blue disc of 80 m radius follows the pointer, the Light Mast gets a red ring, and the hint says it won't work there, naming the light mast. Out past the Light Mast's reach the ring goes and the hint says nothing stops it. Press Esc.",
      "Pick Light Mast and place one within 80 m of the telescope, then set the game to 20x. Once it is commissioned the telescope stops: its Base panel entry says a lit Structure is within its dark radius, a notification says its round was lost to it, and its pop-up names the light mast. Dismantle the new Light Mast and it starts a new round.",
      "Set the propellant to load as an Export on the Launch manifest, nearly all of it: the telescope takes none of what is set to sell, and stops for want of propellant once it reaches it.",
      "Open the Guide: Structures has the telescope's card, and Science and technologies says what it needs. The Launch manifest has its mirror segments, camera and mount, under Industry.",
    ],
    save: infraredTelescopeSave,
  },
  {
    id: "observing-sites",
    title:
      "The infrared telescope's base after a Survey came back with a dark site found, an hour into the Night, with a second telescope's Components in stock",
    steps: [
      "Pause the game. A notification says the Survey came back with 25 Science and found a dark site. Open Expeditions: under Observing sites found is the Dark site, how far it is from the Lander, and that an infrared telescope standing wholly on it works its rounds 50% faster. The Survey's row says nothing more of sites, as the one its Design brings has been found.",
      "Press Show the dark site on the map: the screen closes and the camera moves to a violet circle on the ground, ringed by the pulsing marker. The circle stays on the map when the marker has gone.",
      "Click the telescope by the base: its pop-up has a Site line saying it is not wholly on the dark site, and how far from the Lander that is.",
      "Pick Infrared telescope in the build menu and move it over the violet circle: inside it the hint says it would be on the dark site, working its rounds 50% faster; with any part of it outside, that it is not wholly on it. Place it inside, and set the game to 20x.",
      "Once it is commissioned and observing at Night, its pop-up's Site line says it is on the dark site, working its rounds 50% faster, and its round takes 32 hours of observing where the first telescope's takes 48.",
      "Save, reload the page and load the save: the violet circle is still there, and Expeditions still lists the Dark site.",
    ],
    save: observingSitesSave,
  },
  {
    id: "radio-telescope-array",
    title:
      "A base with a radio telescope array working in Daylight, out past the quiet radius of a water-processing plant by the battery banks, with a second water-processing plant's Components and two antenna fields' in stock",
    steps: [
      "Pause the game. The status panel's Research section has a Radio line, the Radio sky survey, with 1 radio telescope array working and the time left of its round. Its Base panel entry says it is working, with 1 antenna field, about 89 Science a Lunation.",
      "Click the array on the map: a square field of sixteen antenna tiles with crossed dipoles, and a correlator cabinet beside it. Its pop-up has a Round line, an Antenna fields line, and a Quiet radius line saying there is no Plant within 120 m.",
      "Pick Radio telescope array in the build menu and move it over the base: a pale disc of 120 m radius follows the pointer, the water-processing plant gets a red ring, and the hint says it won't work there, naming it. Out past its reach the ring goes and the hint says nothing stops it. Press Esc.",
      "Pick Water-processing plant and place it within 120 m of the array, then set the game to 20x. Once it is commissioned the array stops: its Base panel entry says a Plant is within its quiet radius, a notification says its round was lost to it, and its pop-up names the water-processing plant. Switch the new plant off and the array starts a new round.",
      "Let the game run into the Night: the array goes on working on the battery banks, and completes a round every 24 hours, a notification saying what it earned.",
      "Pick Antenna field in the build menu and move it about near the Lander: the hint says it can only be built beside a commissioned radio telescope array. Move it beside the array, within 10 m of its footprint, and place it, then a second beside that one. Set the game to 20x: once the first is commissioned the array's Base panel entry says 2 antenna fields, about 177 Science a Lunation, and its rounds come twice as fast; the field's pop-up has an Array line saying it adds a field's work.",
      "Click the array's name in the Base panel and press Dismantle in its pop-up: the game refuses, saying its antenna fields join it and must be dismantled first. Dismantle a field and, once the Robot starts taking it apart, the array's count and rate fall again.",
      "Open the Guide: Structures has the array's card and the antenna field's, and Science and technologies says what they need. The Launch manifest has their antenna tiles, correlator and field receiver, under Industry.",
    ],
    save: radioTelescopeArraySave,
  },
];
