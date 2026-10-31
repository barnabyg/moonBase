import { readFileSync } from "node:fs";
import { catalogue, resourceOutputs } from "../src/catalogue";
import {
  createCampaign,
  loadCampaign,
  reserveKilograms,
  type Campaign,
} from "../src/simulation";
import {
  playReferenceCampaign,
  REFERENCE_SEED,
  referenceSteps,
} from "./reference-campaign";
import { toGameMinutes } from "./scenario";

// What `npm run try` can start the game in, so that a change can be tried by
// hand without playing up to it (see docs/trying-things.md). A scenario may
// play the Campaign through the simulation interface, or edit the save's text
// to get there faster: this is a way to look at something, not a test of the
// game's balance.

export interface TryScenario {
  /** What to type after `npm run try --`. */
  readonly id: string;
  /** What state the game starts in. */
  readonly title: string;
  /** What to do, and what should happen, in words the player knows. */
  readonly steps: readonly string[];
  /** Runs on a catalogue crowded with made-up items (`crowded-catalogue.ts`). */
  readonly crowded?: boolean;
  /** Plays too far to prepare in the tests. */
  readonly slow?: boolean;
  /** Prepares the Campaign, and returns it as the text of a save. */
  save(): string;
}

/** The parts of a save's state that scenarios edit. */
export interface EditableSaveState {
  unlockedDesignIds: string[];
  science: number;
  fundingMillionDollars: number;
  bulkResources: { resourceId: string; kilograms: number }[];
  reachedMilestoneIds: string[];
  stockpile: { components: { componentId: string; count: number }[] };
  radiationDoseMillisieverts: number;
  lifeSupport: { stockId: string; kilograms: number }[];
}

/** The Campaign as a save's text, with its state changed as the edit says. */
function saveWith(
  campaign: Campaign,
  edit: (state: EditableSaveState) => void,
): string {
  const save = JSON.parse(campaign.save()) as { state: EditableSaveState };
  edit(save.state);
  return JSON.stringify(save, undefined, 2);
}

/** A Campaign an hour in, with the save's state changed as the edit says. */
export function freshSaveWith(
  edit: (state: EditableSaveState) => void,
): string {
  const campaign = createCampaign({ seed: REFERENCE_SEED });
  campaign.advance(toGameMinutes({ hours: 1 }));
  return saveWith(campaign, edit);
}

/**
 * A base in Daylight with an extraction plant and a vacuum fabrication plant
 * running, from a sample save, with the state changed as the edit says.
 */
function plantBaseSaveWith(edit: (state: EditableSaveState) => void): string {
  const loaded = loadCampaign(
    readFileSync(new URL("saves/version-35.moonbase", import.meta.url), "utf8"),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  return saveWith(loaded.campaign, edit);
}

/** Every Design unlocked, and Funding enough to fill a manifest with anything. */
function unlockEverything(state: EditableSaveState): void {
  state.unlockedDesignIds = catalogue.designs.map((design) => design.id);
  state.fundingMillionDollars = 5000;
}

/** Some of every bulk resource, so that they all show in the status panel. */
function stockEveryBulkResource(state: EditableSaveState): void {
  state.bulkResources = catalogue.bulkResources.map((resource, index) => ({
    resourceId: resource.id,
    kilograms: 40 + index * 25,
  }));
}

/** Sets the stock of one bulk resource. */
function stockOf(
  state: EditableSaveState,
  resourceId: string,
  kilograms: number,
): void {
  for (const stock of state.bulkResources) {
    if (stock.resourceId === resourceId) stock.kilograms = kilograms;
  }
}

/** Every Milestone reached but one. */
function reachEveryMilestoneBut(
  state: EditableSaveState,
  milestoneId: string,
): void {
  state.reachedMilestoneIds = catalogue.milestones
    .map((milestone) => milestone.id)
    .filter((id) => id !== milestoneId);
}

/** Adds Components to the base's stock, as a Launch would have brought. */
function addComponents(
  state: EditableSaveState,
  counts: readonly { componentId: string; count: number }[],
): void {
  for (const { componentId, count } of counts) {
    for (const stock of state.stockpile.components) {
      if (stock.componentId === componentId) stock.count += count;
    }
  }
}

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

/**
 * The reference Campaign's base as Act 2 opens, the moment the base is
 * self-sufficient in water, reached by playing it, with the Design and Funding
 * for a Workshop and more metals to hand, so that Act 2 can be tried without
 * waiting for Science. It plays about 83 Earth Days.
 */
function playAct2Save(): string {
  let save: string | undefined;
  const { failure } = playReferenceCampaign([
    ...referenceSteps.filter(({ milestoneId }) => milestoneId !== undefined),
    {
      milestoneId: undefined,
      description: "Keep the Campaign as Act 2 opens.",
      play(play) {
        play.waitUntil(
          "the Lander free to fly",
          (state) => state.lander.state === "landed-free",
        );
        save = play.campaign.save();
      },
    },
  ]);
  if (save === undefined) throw new Error(failure ?? "It never got there.");
  const opened = JSON.parse(save) as { state: EditableSaveState };
  // Enough to live on and keep the base repaired while the game is tried.
  fillStocks(opened.state);
  addComponents(opened.state, [
    { componentId: catalogue.maintenance.spareComponentId, count: 40 },
  ]);
  opened.state.science = 400;
  opened.state.fundingMillionDollars = 2500;
  stockOf(opened.state, "metals", 150);
  stockOf(opened.state, "circuit-boards", 60);
  return JSON.stringify(opened, undefined, 2);
}

/** The save `playAct2Save` prepares, played once, as Act 3's is made from it too. */
let act2Text: string | undefined;
function act2Save(): string {
  act2Text ??= playAct2Save();
  return act2Text;
}

/**
 * Act 2's base with all of Act 2's Milestones reached, so that Act 3 is current,
 * with a propellant plant's Components, the Design for it and enough propellant
 * and Exports to fly a tripled Return Mass.
 */
function act3Save(): string {
  const opened = JSON.parse(act2Save()) as {
    state: EditableSaveState & {
      reachedMilestoneIds: string[];
      unlockedDesignIds: string[];
    };
  };
  opened.state.reachedMilestoneIds.push(
    ...catalogue.milestones
      .filter(
        ({ actId, id }) =>
          actId === "act-2" && !opened.state.reachedMilestoneIds.includes(id),
      )
      .map(({ id }) => id),
  );
  for (const id of [
    "molten-regolith-electrolysis",
    "cold-trap-mining",
    "propellant-production",
  ]) {
    if (!opened.state.unlockedDesignIds.includes(id)) {
      opened.state.unlockedDesignIds.push(id);
    }
  }
  addComponents(opened.state, [
    { componentId: "oxygen-liquefier", count: 2 },
    { componentId: "cryogenic-tank", count: 2 },
  ]);
  opened.state.fundingMillionDollars = 5000;
  stockOf(opened.state, "propellant", 500);
  stockOf(opened.state, "metals", 400);
  stockOf(opened.state, "circuit-boards", 150);
  return JSON.stringify(opened, undefined, 2);
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
  const typeOf = (id: string) =>
    catalogue.structureTypes.find((type) => type.id === id);
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
 * Fills every life support stock to its storage limit, whatever it held: a
 * scenario's way of living on while it is tried, and of ending with no more than
 * the base can hold after building on more.
 */
function fillStocks(state: EditableSaveState): void {
  for (const stock of state.lifeSupport) {
    stock.kilograms =
      catalogue.lifeSupportStocks.find(({ id }) => id === stock.stockId)
        ?.storageLimitKilograms ?? stock.kilograms;
  }
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

export const tryScenarios: readonly TryScenario[] = [
  {
    id: "everything-unlocked",
    title: "An hour into a Campaign with every Design unlocked and $5,000M",
    steps: [
      "Open the Launch manifest: every item the game has today is listed, under Supplies, then Power, Construction, Protection, Life Support, Industry and Mobility, with a box above them to find one.",
      'Type "telescope" in the box: only the telescope\'s two parts stay, under Industry, and it says "Showing 2 of 53 items".',
      "Press + on one of them: the bars and the box stay in sight, and the rows don't move.",
      "Press Clear: all 53 come back, in the same order.",
    ],
    save: () => freshSaveWith(unlockEverything),
  },
  {
    id: "last-milestone",
    title:
      "An hour into a Campaign with every Milestone reached but power storage, the quickest to reach",
    steps: [
      'Look at the status panel\'s Milestones: it says "Act 1" and what the Act asks, then "Now" with Power storage before the first Night and its hint, then "Next" with "none left".',
      "Pick the Battery bank in the build menu, place it on clear ground beside the Lander, and set the game to 20x. In a few real seconds the Robot has built it.",
      'A notification says "Milestone reached: Power storage before the first Night", and another that Act 4: Permanence begins, the last Act there is.',
      'The panel now says "Act 4: Permanence" and what it asks, with "Everything this Act asks of you is done." Then "Now" says "Every Milestone reached", with a hint that the Campaign carries on, and "Next" still says "none left". None of the lines below has moved up.',
      "Leave the game running: it carries on, and nothing ends.",
      'Click the Milestones title to fold it: beside the title it says "every Milestone reached".',
    ],
    save: () =>
      freshSaveWith((state) => {
        reachEveryMilestoneBut(state, "power-storage");
      }),
  },
  {
    id: "act-2",
    title:
      "The start of Act 2, at the reference Campaign's base with $2,500M, 400 Science, 150 kg of metals and 60 kg of circuit boards",
    steps: [
      'Look at the status panel\'s Milestones: it says "Act 2: Independence" and what it asks, then "Now" with Workshop running and its hint, then "Next" with Self-sufficiency in spare Components.',
      "Press Tech Tree and, under Industry, unlock Molten regolith electrolysis, then Parts machining. The new Designs of Act 2 are there too: Array fabrication, Concentrator towers, Thermal storage and Cold-trap mining, each saying what it brings, and for now too dear in Science.",
      "Press Launch manifest. Under Industry, add a machine tool and a casting furnace: the cost bar shows $1,150M with the Launch fee, of $2,500M. Open the Exports tab: Metals are there at $1 a kilogram. Set 60 kg of circuit boards and 40 kg of metals: Return Mass says 100 of 100 kg, and it won't take more.",
      'Press Send the Lander and set the game to 20x. As the Lander reaches Earth a notification says the Exports sold, and "Milestone reached: Metals sold", though the Milestones section still has Workshop running as "Now": Milestones can be reached in any order.',
      'When the Lander is back and unloaded, pick the Workshop in the build menu and place it near the other Plants. Once it is running, a notification says "Milestone reached: Workshop running", "Now" moves on to Self-sufficiency in spare Components, and Self-sufficient has a new chip, Spares.',
      "Leave it running on 20x for about 3 real minutes, a whole Lunation: the Spares chip says whether the Workshop has made as many as repairs have used. If it has, the Milestone is reached and, with the others reached, the Milestones section moves on to Act 3.",
      "Open the Guide: the Structures tab has the Concentrator tower under Power and the Array works under Industry, and Launches and Funding says metals are an Export.",
    ],
    save: act2Save,
  },
  {
    id: "act-3",
    title:
      "The start of Act 3, with a propellant plant's Components in stock, 500 kg of propellant, 150 kg of circuit boards, 400 kg of metals and $5,000M",
    steps: [
      'Look at the status panel\'s Milestones: it says "Act 3: Scale" and what it asks, then "Now" with First propellant made.',
      'Set the game to 5x. Within a game-minute the Milestone is reached, as propellant is in stock, and "Now" moves on to Oxygen sold as propellant.',
      "Press Launch manifest and open the Exports tab. Return Mass says 0 of 350 kg, as 500 kg of propellant adds 250 kg. Set 150 kg of circuit boards and 150 kg of metals: it says 300 of 350 kg, burning 400 kg of propellant. Try 250 kg of metals: it is refused, naming the Return Mass.",
      'Press Send the Lander. A notification says "Milestone reached: Return Mass tripled", and the status panel shows 100 kg of propellant left.',
      "When the Lander reaches Earth the Funding rises by $600M. When it is back, load the last of the propellant on the Exports tab, and send it again: Oxygen sold as propellant is reached as it reaches Earth, and the Milestones section moves on to Act 4.",
      "Pick the Propellant plant in the build menu and place it on the power network. Once it runs, the propellant in the status panel rises by about a kilogram a game-hour.",
    ],
    save: act3Save,
  },
  {
    id: "workshop",
    title:
      "Early in a Campaign with a Workshop running on two solar arrays and a battery bank, with metals for two more batches and the Components of a second Workshop in stock",
    steps: [
      'Look at the Base panel\'s Structures: the Workshop says "running", how long this batch has left, and "making 1 spare Component every 24 hours from 3.6 kg of metals". Look at the status panel\'s Stock: Spares says how many are in stock and "rising" so many a day.',
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
      'Press "Dismantle" beside the old Inflatable Habitat: it says its Regolith shielding must go first. Dismantle the water wall, then the shielding, then the Habitat, each as the last goes. Press "Dismantle" beside the Buried Habitat: it says to move them first.',
      "Open the Guide: Keeping the Mission Director alive says what a Buried Habitat is for, and the Structures tab has it under Protection. Open the Launch manifest: the vault section and deep life support core are under Protection.",
    ],
    save: buriedHabitatSave,
  },
  {
    id: "water-reserve",
    title:
      "A base with an optics works running on six batches' water above the Mission Director's reserve, and a water-processing plant switched off with water ice to use",
    steps: [
      'Pause the game. Look at the Base panel\'s Structures: the Optics works says "running" and "making 0.2 kg of precision optics an hour from 0.8 kg of silicon, 0.2 kg of metals and 1 kg of water". The status panel\'s Water says how long it lasts, "optics works using 24 kg a day", and that the water-processing plant is switched off.',
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
    id: "crowded",
    title:
      "A base with two Plants running, every Design unlocked and $5,000M, on a catalogue crowded with made-up items: 80 Launch items and 15 bulk resources, all in stock",
    crowded: true,
    steps: [
      'Set the game to 20x and open the Launch manifest: it says "80 items", in groups. Scroll to the end: the Payload Mass and cost bars and the box to find an item stay in sight at the top.',
      'Type "solar array" in the box, slowly, with the game running: nothing you type is lost or moved, and only what goes into a solar array stays, even an Array mast, which doesn\'t say "solar" in its name.',
      "Press + on an item a dozen times, then − as many: its count and the bars change, and no row moves.",
      "Open the Exports tab and come back: what you typed is still there. Press Clear: all 80 come back, in the same order.",
      "Look down the status panel's Bulk resources: 15 lines, one each, in columns, all readable. Those changing say how fast a day, and those falling roughly how long they last.",
      "Silicon is in the warning colour, with a dot beside the section's title, as it will run out in under 3 Earth Days.",
      'Click the Bulk resources title to fold it: beside the title it says how long silicon lasts and how much Regolith there is, for example "Silicon 2d · Regolith 1500 kg", and the dot stays.',
      "Reload the page: the section is still folded. Open it again, reload, and set the game to 20x: as the silicon runs down, no line below moves up and down.",
    ],
    save: () =>
      plantBaseSaveWith((state) => {
        unlockEverything(state);
        stockEveryBulkResource(state);
        stockOf(state, "regolith", 1500);
        stockOf(state, "silicon", 18);
      }),
  },
];
