import { catalogue, resourceOutputs } from "../../src/catalogue";
import {
  loadCampaign,
  reserveKilograms,
  type Campaign,
} from "../../src/simulation";
import { toGameMinutes } from "../scenario";
import {
  addComponents,
  fillStocks,
  freshSaveWith,
  saveWith,
  stockOf,
} from "./save-editing";
import type { TryScenario } from "./try-scenario";

/** Where `opticsBase` puts what makes precision optics, and what powers it. */
const OPTICS_BASE_SITES = [
  ["solar-array", { x: 40, y: 25 }],
  ["battery-bank", { x: 40, y: 35 }],
  ["solar-array", { x: 50, y: 35 }],
  ["solar-array", { x: 60, y: 35 }],
  ["habitat", { x: -14, y: 30 }],
  ["optics-works", { x: 50, y: 25 }],
  ["water-processing-plant", { x: 60, y: 25 }],
] as const;

/**
 * A base in Daylight with an optics works running, the Mission Director living
 * in a shielded Habitat, and a water-processing plant switched off with water
 * ice to turn into water. It plays only as far as the Robot's building takes, on
 * a save edited to have what it needs.
 */
function opticsBase(): Campaign {
  const componentsOf = (id: string) =>
    catalogue.structureTypes.find((type) => type.id === id)?.components ?? [];
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      state.unlockedDesignIds.push("precision-optics", "water-processing");
      addComponents(
        state,
        OPTICS_BASE_SITES.flatMap(([id]) => componentsOf(id)),
      );
      addComponents(state, [
        { componentId: catalogue.maintenance.spareComponentId, count: 60 },
      ]);
      for (const stock of state.lifeSupport) stock.kilograms = 2000;
      stockOf(state, "silicon", 500);
      stockOf(state, "metals", 200);
      stockOf(state, "water-ice", 100);
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  const build = (
    plans: readonly (readonly [string, { x: number; y: number }])[],
  ) => {
    for (const [structureTypeId, position] of plans) {
      const planned = campaign.planConstruction({ structureTypeId, position });
      if (!planned.ok) throw new Error(planned.message);
    }
    for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
      if (hours > 40 * 24) throw new Error("The base was never finished.");
      campaign.advance(60);
    }
  };
  const structureOf = (id: string) =>
    campaign
      .snapshot()
      .structures.find(({ structureTypeId }) => structureTypeId === id);
  build(OPTICS_BASE_SITES);
  const switched = campaign.switchPlant(
    structureOf("water-processing-plant")?.id ?? "",
    "off",
  );
  if (!switched.ok) throw new Error(switched.message);
  build([["regolith-shielding", { x: -14, y: 30 }]]);
  // Far enough into a Daylight for the optics works to reach the reserve in it.
  for (let hours = 0; ; hours++) {
    const { lunation, solarParticleEvent } = campaign.snapshot();
    if (
      lunation.part === "daylight" &&
      lunation.minutesRemaining >= toGameMinutes({ earthDays: 5 }) &&
      solarParticleEvent === undefined &&
      structureOf("optics-works")?.plant?.running === true
    ) {
      break;
    }
    if (hours > 40 * 24) throw new Error("The optics works never started.");
    campaign.advance(60);
  }
  const moved = campaign.moveMissionDirectorIn(
    structureOf("habitat")?.id ?? "",
  );
  if (!moved.ok) throw new Error(moved.message);
  return campaign;
}

/**
 * `opticsBase`, with water enough for so many batches of an optics works before
 * the Mission Director's reserve stops it.
 */
export function opticsBaseSave(batches: number): string {
  const batchKilograms =
    catalogue.structureTypes
      .find(({ id }) => id === "optics-works")
      ?.recipes?.[0]?.inputs.find(
        ({ resource }) =>
          resource.kind === "life-support" && resource.stockId === "water",
      )?.kilogramsPerHour ?? 0;
  return saveWith(opticsBase(), (state) => {
    fillStocks(state);
    for (const stock of state.lifeSupport) {
      if (stock.stockId === "water") {
        stock.kilograms = reserveKilograms("water") + batches * batchKilograms;
      }
    }
  });
}

/**
 * `opticsBase`, with its optics works switched off and its water-processing plant
 * on, and water so many of the Plant's batches below what the base can hold.
 */
export function fullStoreSave(batches: number): string {
  const type = catalogue.structureTypes.find(
    ({ id }) => id === "water-processing-plant",
  );
  const batchKilograms =
    resourceOutputs(type?.recipes?.[0])[0]?.kilogramsPerHour ?? 0;
  const campaign = opticsBase();
  const { structures } = campaign.snapshot();
  for (const [id, setting] of [
    ["optics-works", "off"],
    ["water-processing-plant", "on"],
  ] as const) {
    const switched = campaign.switchPlant(
      structures.find(({ structureTypeId }) => structureTypeId === id)?.id ??
        "",
      setting,
    );
    if (!switched.ok) throw new Error(switched.message);
  }
  return saveWith(campaign, (state) => {
    fillStocks(state);
    for (const stock of state.lifeSupport) {
      if (stock.stockId === "water") {
        stock.kilograms -= batches * batchKilograms;
      }
    }
  });
}

/** Where `propellantTanksSave` puts what it builds. */
const PROPELLANT_BASE_SITES = [
  ["solar-array", { x: 40, y: 25 }],
  ["solar-array", { x: 40, y: 13 }],
  ["solar-array", { x: 40, y: 1 }],
  ["battery-bank", { x: 40, y: 37 }],
  ["propellant-plant", { x: 54, y: 25 }],
  ["propellant-tank", { x: 54, y: 37 }],
] as const;

/**
 * A base with a commissioned propellant plant and propellant tank, three batches
 * below what the base can hold, with Regolith for the Plant and a second tank's
 * Components in stock. It stops a few hours before Night, as `storageTanksSave` does.
 */
export function propellantTanksSave(): string {
  const componentsOf = (id: string) =>
    catalogue.structureTypes.find((type) => type.id === id)?.components ?? [];
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      state.unlockedDesignIds.push("propellant-production");
      addComponents(state, [
        ...PROPELLANT_BASE_SITES.flatMap(([id]) => componentsOf(id)),
        ...componentsOf("propellant-tank"),
        { componentId: catalogue.maintenance.spareComponentId, count: 30 },
      ]);
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  for (const [structureTypeId, position] of PROPELLANT_BASE_SITES) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 40 * 24) throw new Error("The base was never finished.");
    campaign.advance(60);
  }
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
  return saveWith(campaign, (state) => {
    stockOf(state, "propellant", 1047);
    stockOf(state, "regolith", 1500);
  });
}

/** Where `regolithDiggerSave` puts what it builds. */
const REGOLITH_BASE_SITES = [
  ["solar-array", { x: 40, y: 25 }],
  ["solar-array", { x: 40, y: 13 }],
  ["solar-array", { x: 40, y: 1 }],
  ["battery-bank", { x: 40, y: 37 }],
  ["battery-bank", { x: 50, y: 37 }],
  ["propellant-plant", { x: 54, y: 25 }],
  ["bucket-wheel-digger", { x: 66, y: 13 }],
  ["regolith-bin", { x: 54, y: 1 }],
] as const;

/**
 * A base with a propellant plant, a bucket-wheel digger and a Regolith bin
 * commissioned, with 4,800 kg of the 5,000 kg of Regolith it can hold and a
 * second bin's Components in stock. It stops a few hours before Night, as
 * `propellantTanksSave` does, so that a player sees the excavator parked and
 * the digger carry on.
 */
export function regolithDiggerSave(): string {
  const componentsOf = (id: string) =>
    catalogue.structureTypes.find((type) => type.id === id)?.components ?? [];
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      state.unlockedDesignIds.push(
        "propellant-production",
        "large-propellant-production",
        "continuous-excavation",
      );
      addComponents(state, [
        ...REGOLITH_BASE_SITES.flatMap(([id]) => componentsOf(id)),
        ...componentsOf("regolith-bin"),
        { componentId: catalogue.maintenance.spareComponentId, count: 30 },
      ]);
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  for (const [structureTypeId, position] of REGOLITH_BASE_SITES) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 40 * 24) throw new Error("The base was never finished.");
    campaign.advance(60);
  }
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
  return saveWith(campaign, (state) => {
    stockOf(state, "regolith", 4800);
  });
}

/** Where `storageTanksSave` puts what it builds. */
const TANKS_BASE_SITES = [
  ["solar-array", { x: 40, y: 25 }],
  ["battery-bank", { x: 40, y: 35 }],
  ["water-tank", { x: 52, y: 25 }],
  ["oxygen-tank", { x: 52, y: 37 }],
] as const;

/**
 * A base with a commissioned water tank and oxygen tank on a solar array and a
 * battery bank, each half full, and a second water tank's Components in stock.
 * It plays only as far as the Robot's building takes, and stops a few hours
 * before Night, so that a player sees the draw come and go, or, with
 * `nearNight` false, as soon as the base is built, while Daylight has longer
 * to run, so that more can be built before Night slows the building down.
 */
export function storageTanksSave({ nearNight = true } = {}): string {
  const componentsOf = (id: string) =>
    catalogue.structureTypes.find((type) => type.id === id)?.components ?? [];
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      state.unlockedDesignIds.push("water-electrolysis", "bulk-supply-tanks");
      addComponents(state, [
        ...TANKS_BASE_SITES.flatMap(([id]) => componentsOf(id)),
        ...componentsOf("water-tank"),
        { componentId: catalogue.maintenance.spareComponentId, count: 30 },
      ]);
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  for (const [structureTypeId, position] of TANKS_BASE_SITES) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 40 * 24) throw new Error("The base was never finished.");
    campaign.advance(60);
  }
  for (let hours = 0; nearNight; hours++) {
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
  return saveWith(campaign, (state) => {
    for (const stock of state.lifeSupport) {
      stock.kilograms = stock.stockId === "water" ? 700 : 200;
    }
  });
}

export const storesScenarios: readonly TryScenario[] = [
  {
    id: "water-reserve",
    title:
      "A base with an optics works running on six batches' water above the Mission Director's reserve, and a water-processing plant switched off with water ice to use",
    steps: [
      'Pause the game. Look at the Base panel\'s Structures: the Optics works says "running", and hovering over that says "making 0.2 kg of precision optics an hour from 0.8 kg of silicon, 0.2 kg of metals and 1 kg of water". The status panel\'s Water says how long it lasts, "optics works using 24 kg a day", and that the water-processing plant is switched off.',
      'Set the game to 20x. In a few real seconds the Optics works says "waiting for Water", how much there is of the 50 kg it needs, and that this is to leave the Mission Director\'s reserve of 49 kg. Water now falls only as they drink: it lasts about 14 days, and says "optics works waiting at the reserve".',
      'Pause. Press "Switch on" beside the Water-processing plant and set the game going: Water rises, and each time there is a batch\'s worth above the reserve, the Optics works runs again.',
      "Open the Guide: the Optics works' card under Structures says it takes water and leaves the reserve, and Power and Night says what the reserve is. Hover over Water beside Self-sufficient: it speaks only of the Mission Director's use, as what the Optics works uses doesn't count against it.",
    ],
    save: () => opticsBaseSave(6),
  },
  {
    id: "full-store",
    title:
      "A base with a water-processing plant running three batches below the limit of 400 kg of water, with water ice to spare, and an optics works switched off",
    steps: [
      "Pause the game. The status panel's Water says \"397.3 of 400 kg\" and that it is rising. The Base panel's Water-processing plant says it is running.",
      'Set the game to 5x. In a few real seconds the Water-processing plant says "waiting for tank space: Water is 400.0 of 400 kg" or a little under, and the status panel\'s Water says "holding full" instead of how fast it is rising. Water ice stops falling.',
      "Leave it running: the Mission Director drinks a little, and about every six game-hours there is room for a batch, so the Plant runs for an hour and waits again. Water stays within a batch of 400 kg.",
      "Open the Launch manifest and add a Water, 50 kg: it warns how much there is room for, and that what doesn't fit is lost on landing. Hover over Water beside Self-sufficient once a whole Lunation has passed: holding full hasn't cost it the title.",
    ],
    save: () => fullStoreSave(3),
  },
  {
    id: "storage-tanks",
    title:
      "A base with a water tank and an oxygen tank half full on a solar array and a battery bank, a few hours before Night, and a second water tank's Components in stock",
    steps: [
      'Pause the game. The status panel says "Water 700.0 of 1400 kg" and "Oxygen 200.0 of 400 kg". In the Base panel the Water tank says "holds 500 of 1000 kg of water, draws 0.05 kW at Night". Find the two tanks on the map: a long capsule on saddles and a gold sphere on legs with a white radiator on top, each with half the lights lit on the post beside it.',
      'Set the game to 5x until Night falls: the tanks say "drawing 0.05 kW" and "drawing 0.15 kW", and the power line uses that much more.',
      "Pick the Water tank in the build menu and place it. Set the game to 20x: once it is commissioned the status panel's limit is 2400 kg, and no water has appeared, as a tank comes empty.",
      "Click the Oxygen tank's name in the Base panel and press Dismantle in its pop-up. When the Robot starts on it the limit falls to 100 kg, and a notification says 100 kg of oxygen with no room left was lost.",
      "Open the Launch manifest and the Guide: a Launch can bring tank parts, under Life Support, but no oxygen or water behind Bulk supply tanks.",
    ],
    save: () => storageTanksSave(),
  },
  {
    id: "propellant-tanks",
    title:
      "A base with a propellant plant and a propellant tank three batches from full, a few hours before Night, on three solar arrays and a battery bank, and a second tank's Components in stock",
    steps: [
      'Pause the game. The status panel\'s Bulk resources say "Propellant 1047.0 of 1050 kg". In the Base panel the Propellant tank says "holds 598.3 of 600 kg of propellant, draws 0.2 kW at Night". Find it on the map: a fat silver capsule on two saddles, with white radiators on top and all its lights lit on the post beside it.',
      'Set the game to 5x. Within a few real seconds the Propellant plant says "waiting for tank space: Propellant is 1050.0 of 1050 kg", and the status panel says "holding full". Its Regolith stops falling.',
      'Carry on until Night falls: the tank says "drawing 0.2 kW", and the power line uses that much more.',
      "Pick the Propellant tank in the build menu and place it. Set the game to 20x: once it is commissioned the status panel's limit is 1650 kg, and in Daylight the Plant starts again by itself, as a tank comes empty.",
      "Open the Launch manifest's Exports tab: the Return Mass is 400 kg, however much more than 600 kg there is. Set 300 kg of propellant to load: it stops being counted, but the 750 kg left is still more than the 600 kg the ceiling takes, so the Return Mass stays at 400 kg. Propellant can't be brought by Launch: there is no such item on the Imports tab, only the tank's parts, under Industry.",
      "Click the Propellant plant's name in the Base panel and press Dismantle in its pop-up. When the Robot starts on it the limit falls by 450 kg, the stock doesn't, and no notification says anything was lost. Do the same for a Propellant tank: when the Robot starts on it, a notification says what no longer fits was lost.",
    ],
    save: propellantTanksSave,
  },
  {
    id: "regolith-digger",
    title:
      "A base with a propellant plant, a bucket-wheel digger and a Regolith bin, 4,800 of 5,000 kg of Regolith, a few hours before Night, on three solar arrays and two battery banks, and a second bin's Components in stock",
    steps: [
      'Pause the game. The status panel\'s Bulk resources say "Regolith 4800.0 of 5000 kg". In the Base panel the Regolith bin says "holds 2880 of 3000 kg of Regolith", with nothing about power. Find it on the map: an open square bay of metal walls, filled with Regolith, and the digger, a Plant with a conveyor running back to a skid where it digs.',
      'Set the game to 5x. The digger says "running", and on hovering over that "making 30 kg of Regolith an hour from the ground", and the Regolith rises, faster than the propellant plant uses it. The excavator stays where it is: with the bin, digging starts only below 4000 kg.',
      'Carry on until Night falls. The Robot parks the excavator, but once the propellant plant has drawn the Regolith down a batch, the digger runs again on the battery banks\' spare power, and the Regolith stays near full. Once the banks have no more to spare, the digger says "idle at Night: no stored power to spare", and the Regolith falls as it did before.',
      "Pick the Regolith bin in the build menu and place it. Set the game to 20x: once it is commissioned the status panel's limit is 8000 kg, and in Daylight the excavator digs to fill it. The bin needs no cable.",
      "Open the Launch manifest: the digger's head and conveyors and the bin's walls are under Industry, behind Continuous excavation. Open the Guide's Structures for their cards.",
    ],
    save: regolithDiggerSave,
  },
];
