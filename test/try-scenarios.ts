import { readFileSync } from "node:fs";
import { catalogue } from "../src/catalogue";
import { createCampaign, loadCampaign, type Campaign } from "../src/simulation";
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
function act2Save(): string {
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
  for (const stock of opened.state.lifeSupport) {
    stock.kilograms = Math.max(stock.kilograms, 400);
  }
  addComponents(opened.state, [
    { componentId: catalogue.maintenance.spareComponentId, count: 40 },
  ]);
  opened.state.science = 400;
  opened.state.fundingMillionDollars = 2500;
  stockOf(opened.state, "metals", 150);
  stockOf(opened.state, "circuit-boards", 60);
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
    state.radiationDoseMillisieverts = 568;
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
      'A notification says "Milestone reached: Power storage before the first Night", and another that Act 2: Independence begins, the last Act there is so far.',
      'The panel now says "Act 2: Independence" and what it asks, with "Everything this Act asks of you is done." Then "Now" says "Every Milestone reached", with a hint that the Campaign carries on, and "Next" still says "none left". None of the lines below has moved up.',
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
      "Leave it running on 20x for about 3 real minutes, a whole Lunation: the Spares chip says whether the Workshop has made as many as repairs have used. If it has, the Milestone is reached and the Milestones section says every Milestone is reached.",
      "Open the Guide: the Structures tab has the Concentrator tower under Power and the Array works under Industry, and Launches and Funding says metals are an Export.",
    ],
    save: act2Save,
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
