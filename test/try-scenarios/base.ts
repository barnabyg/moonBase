import { catalogue } from "../../src/catalogue";
import {
  createCampaign,
  loadCampaign,
  type Campaign,
} from "../../src/simulation";
import { REFERENCE_SEED } from "../reference-campaign";
import { toGameMinutes } from "../scenario";
import {
  addComponents,
  fillStocks,
  freshSaveWith,
  saveWith,
  stockOf,
} from "./save-editing";
import type { TryScenario } from "./try-scenario";
import { findStructureType } from "../../src/simulation/construction";

/**
 * Early in a Campaign with a Workshop running, on a second solar array and a
 * battery bank full of charge, a few batches' metals in stock, the Workshop's
 * Design unlocked and the Components of a second in stock. It plays only as
 * far as the Robot's building takes, on a save edited to have what it needs.
 */
function workshopBaseSave(): string {
  const workshop = catalogue.structureTypes.find(({ id }) => id === "workshop");
  const array = catalogue.structureTypes.find(({ id }) => id === "solar-array");
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      state.unlockedDesignIds.push(
        "molten-regolith-electrolysis",
        workshop?.designId ?? "",
      );
      addComponents(state, [
        ...(array?.components ?? []),
        ...(workshop?.components ?? []),
        ...(workshop?.components ?? []),
      ]);
      stockOf(state, "metals", 12);
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  for (const [structureTypeId, position] of [
    ["solar-array", { x: 40, y: 25 }],
    ["battery-bank", { x: 40, y: 35 }],
    ["solar-array", { x: 50, y: 35 }],
    ["workshop", { x: 50, y: 25 }],
  ] as const) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  const isReady = () => {
    const { constructions, structures } = campaign.snapshot();
    return (
      constructions.length === 0 &&
      structures.some(
        (structure) =>
          structure.structureTypeId === "workshop" &&
          structure.plant?.running === true,
      )
    );
  };
  for (let minutes = 0; !isReady(); minutes += 10) {
    if (minutes > toGameMinutes({ earthDays: 6 })) {
      throw new Error("The Workshop never started.");
    }
    campaign.advance(10);
  }
  return campaign.save();
}

/** Where `buriedHabitatBase` puts what can be lived in, in view north of the Lander. */
export const buriedHabitatSites = {
  waterWalledHabitat: { x: -14, y: 30 },
  bareHabitat: { x: 2, y: 34 },
  buriedHabitat: { x: -18, y: 8 },
} as const;

/**
 * A base with everything a Mission Director could live in commissioned and
 * powered, on enough battery banks to carry them all through a Night: a
 * water-walled Habitat, a bare Habitat and a Buried Habitat, the Mission
 * Director still aboard the Lander. It plays only as far as the Robot's
 * building takes, on a save edited to have what it needs.
 */
export function buriedHabitatBase(): Campaign {
  const typeOf = (id: string) => findStructureType(id);
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      state.unlockedDesignIds.push(
        "water-wall-shielding",
        "large-battery-banks",
        "buried-habitat",
      );
      addComponents(
        state,
        [
          "habitat",
          "water-wall",
          "buried-habitat",
          "large-battery-bank",
          "large-battery-bank",
          "solar-array",
        ].flatMap((id) => typeOf(id)?.components ?? []),
      );
      // Water for the water wall, and to live on and keep the base repaired
      // while the game is tried.
      for (const stock of state.lifeSupport) stock.kilograms = 2000;
      addComponents(state, [
        { componentId: catalogue.maintenance.spareComponentId, count: 60 },
      ]);
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  const sites = buriedHabitatSites;
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
  build([
    ["solar-array", { x: 36, y: 22 }],
    ["solar-array", { x: 36, y: 12 }],
    ["battery-bank", { x: 40, y: 34 }],
    ["large-battery-bank", { x: 48, y: 33 }],
    ["large-battery-bank", { x: 55, y: 33 }],
    ["habitat", sites.waterWalledHabitat],
    ["habitat", sites.bareHabitat],
    ["buried-habitat", sites.buriedHabitat],
  ]);
  build([["regolith-shielding", sites.waterWalledHabitat]]);
  build([["water-wall", sites.waterWalledHabitat]]);
  return campaign;
}

/**
 * The base above in Daylight, with its batteries charged and no Solar Particle
 * Event announced, and the Mission Director living behind the water wall with
 * a dose near where a long Campaign has it, as they come to move.
 */
function buriedHabitatSave(): string {
  const campaign = buriedHabitatBase();
  for (let hours = 0; ; hours++) {
    const { lunation, power } = campaign.snapshot();
    const charged = power.networks.every(
      (network) =>
        network.storedKilowattHours >= network.storageCapacityKilowattHours - 1,
    );
    if (
      lunation.part === "daylight" &&
      charged &&
      campaign.snapshot().solarParticleEvent === undefined
    ) {
      break;
    }
    if (hours > 40 * 24) throw new Error("It never charged in Daylight.");
    campaign.advance(60);
  }
  const home = campaign
    .snapshot()
    .structures.find(
      ({ position }) =>
        position.x === buriedHabitatSites.waterWalledHabitat.x &&
        position.y === buriedHabitatSites.waterWalledHabitat.y,
    );
  const moved = campaign.moveMissionDirectorIn(home?.id ?? "");
  if (!moved.ok) throw new Error(moved.message);
  return saveWith(campaign, (state) => {
    fillStocks(state);
    state.radiationDoseMillisieverts = 568;
  });
}

/** Where `splitNetworkSave` builds the base, in view north-east of the Lander. */
export const SPLIT_NETWORK_SITES = {
  solarArray: { x: 20, y: 12 },
  firstBattery: { x: 30, y: 25 },
  habitat: { x: 40, y: 40 },
  secondBattery: { x: 52, y: 52 },
  thirdBattery: { x: 8, y: 26 },
} as const;

/**
 * The starting base, with the Mission Director moved in, but with the
 * Habitat and one battery bank on a network of their own, and the solar
 * array and the other two battery banks on another: as a save holds it after
 * dismantling a battery bank the Habitat was cabled through, before
 * dismantling joined up the cables it went with. Built in Daylight, then its
 * cable from the first battery bank to the Habitat taken out of the save.
 */
export function splitNetworkSave(): string {
  const campaign = createCampaign({ seed: REFERENCE_SEED });
  const sites = SPLIT_NETWORK_SITES;
  for (const [structureTypeId, position] of [
    ["solar-array", sites.solarArray],
    ["battery-bank", sites.firstBattery],
    ["habitat", sites.habitat],
    ["battery-bank", sites.secondBattery],
    ["battery-bank", sites.thirdBattery],
  ] as const) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 40 * 24) throw new Error("The base was never finished.");
    campaign.advance(60);
  }
  const habitat = campaign
    .snapshot()
    .structures.find(({ structureTypeId }) => structureTypeId === "habitat");
  const moved = campaign.moveMissionDirectorIn(habitat?.id ?? "");
  if (!moved.ok) throw new Error(moved.message);
  const save = JSON.parse(campaign.save()) as {
    state: { cables: { toStructureId: string }[] };
  };
  save.state.cables = save.state.cables.filter(
    ({ toStructureId }) => toStructureId !== habitat?.id,
  );
  return JSON.stringify(save, undefined, 2);
}

export const baseScenarios: readonly TryScenario[] = [
  {
    id: "workshop",
    title:
      "Early in a Campaign with a Workshop running on two solar arrays and a battery bank, with metals for two more batches and the Components of a second Workshop in stock",
    steps: [
      'Look at the Base panel\'s Structures: the Workshop says "running" and how long this batch has left, and hovering over that says "making 1 spare Component every 24 hours from 3.6 kg of metals". Look at the status panel\'s Stock: Spares says how many are in stock and "rising" so many a day.',
      "Click the Workshop on the map, to the north-east of the Lander: the pop-up says the same, with its recipe. Close it.",
      'Press "Switch off" beside it: it says this is its last batch, and Spares now says how long they last and that the Workshop is switched off. Press "Switch on": it says "rising" again.',
      'Set the game to 20x. About every 12 real seconds a batch finishes: Spares goes up by one, and Metals in Bulk resources down by 3.6 kg as the next starts. After two more, there is too little: the Workshop says "waiting for Metals" with how much there is, and Spares says how long they last.',
      "Open the Guide: the Structures tab has the Workshop, with its figures, and Repairs and Maintenance says it can make spares. Open the Launch manifest: a machine tool and a casting furnace are under Industry, and spare Components say a Workshop makes them.",
    ],
    save: workshopBaseSave,
  },
  {
    id: "buried-habitat",
    title:
      "A base with the Mission Director behind a water wall at 568 mSv, a Buried Habitat commissioned to move to, and a bare Habitat beside it",
    steps: [
      'Pause the game. Look at the status panel: Living says "in the Inflatable Habitat" and Radiation says "568.0 / 600 mSv" and "+0.1 a day, limit in", about 200 days. The Base panel shows the Buried Habitat as "buried" and the bare Habitat as "unshielded", each with a "Move here" button.',
      'Click the low mound west of the Lander, with a hatch at its east end: the pop-up says "Buried Habitat", Shielding "buried under the Regolith" and Dose rate "0.015 mSv a day". With it open, pick Regolith shielding in the build menu and move it over the mound: it says a Buried Habitat "needs no shielding over it". Press Esc.',
      'Click the bare Habitat beside it: the pop-up\'s Dose rate says "30.00 mSv a day", and warns that moving here raises it and how soon the limit would come. Close it.',
      'Press "Move here" beside the Buried Habitat. Set the game going: a suited figure walks across to its hatch, which lights up with a flag above. Living says "in the Buried Habitat", Radiation stays at 568.0 and now says "+0.015 a day", with a limit years away. The old Habitat now shows a "Move here" button.',
      'Set the game to 20x and wait for a notification that a Solar Particle Event is under way: Radiation says "+0.1 a day" while it lasts, then "+0.015 a day" again.',
      'Click the old Inflatable Habitat\'s name in the Base panel and press "Dismantle" in its pop-up: it says its Regolith shielding must go first. Dismantle the water wall, then the shielding, then the Habitat, each as the last goes, each from its own pop-up. Press "Dismantle" in the Buried Habitat\'s pop-up: it says to move them first.',
      "Open the Guide: Keeping the Mission Director alive says what a Buried Habitat is for, and the Structures tab has it under Protection. Open the Launch manifest: the vault section and deep life support core are under Protection.",
    ],
    save: buriedHabitatSave,
  },
  {
    id: "split-network",
    title:
      "The starting base with the Mission Director moved in, but with the Habitat and one battery bank on a network of their own, apart from the solar array and the other battery banks",
    steps: [
      'Pause the game. Look at the status panel\'s Power: Stored says about "337 / 600 kWh" for the whole base, and the Habitat line below it says how little of that the Habitat can draw on, about "112 / 200 kWh", and "own network, lasts 3d 17h". The Mission Director\'s Living line says the Habitat\'s "power fails in" the same time.',
      'Click the Power title to fold it: beside the title it says the power to spare, how full the base\'s battery banks are, and "Habitat 56%".',
      "Open it again and set the game to 20x: the Habitat line falls while the base's solar array keeps the other battery banks full, and the warnings that Habitat power will fail come as it runs down.",
    ],
    save: splitNetworkSave,
  },
];
