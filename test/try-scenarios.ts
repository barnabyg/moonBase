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
import { keepTheBaseGoing, playLongGame, playOnUntil } from "./long-game";
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

/**
 * The long-game play guide's own base on the Earth Day given, reached by playing
 * the guide and left as it stands, so that a stretch of Act 4 can be played from a
 * base that has really played everything before it. It takes minutes.
 */
function longGameSaveOn(earthDay: number): string {
  let save: string | undefined;
  const { failure } = playLongGame([
    ...referenceSteps,
    {
      milestoneId: undefined,
      description: `Keep the base going as the long-game play guide does, until Earth Day ${earthDay}.`,
      play(play) {
        keepTheBaseGoing(play);
        playOnUntil(play, earthDay);
        save = play.campaign.save();
      },
    },
  ]);
  if (save === undefined) throw new Error(failure ?? "It never got there.");
  return save;
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

/** Where `crewHabitatSave` builds the Large-scale Crew Habitat, in view north-west of the Lander. */
export const CREW_HABITAT_SITE = { x: -24, y: 22 } as const;

/**
 * Early in a Campaign with every Design unlocked and every Milestone reached but
 * the last, and a Large-scale Crew Habitat built as far as its Commissioning
 * in Daylight from the Components and oxygen and water a save was edited to
 * have, so that the last Milestone and its celebration come in a few game-hours. It plays only
 * as far as the Robot's building takes.
 */
export function crewHabitatSave(): string {
  const type = catalogue.structureTypes.find(({ id }) => id === "crew-habitat");
  if (type?.stockedWith === undefined) {
    throw new Error("expected a Large-scale Crew Habitat");
  }
  const { stockedWith } = type;
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      unlockEverything(state);
      reachEveryMilestoneBut(state, "crew-habitat-commissioned");
      addComponents(state, type.components);
      // What it is stocked with, and as much again, beyond what its tanks hold.
      for (const stock of state.lifeSupport) {
        const fill = stockedWith.find(
          ({ stockId }) => stockId === stock.stockId,
        );
        if (fill !== undefined) stock.kilograms = 2 * fill.kilograms;
      }
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  // Planned early enough in a Daylight to be commissioned in it, as its building
  // takes about 9 Earth Days.
  for (
    let hours = 0;
    campaign.snapshot().lunation.part !== "daylight" ||
    campaign.snapshot().lunation.minutesRemaining <
      toGameMinutes({ earthDays: 12 });
    hours++
  ) {
    if (hours > 40 * 24) throw new Error("Daylight never came.");
    campaign.advance(60);
  }
  const planned = campaign.planConstruction({
    structureTypeId: type.id,
    position: CREW_HABITAT_SITE,
  });
  if (!planned.ok) throw new Error(planned.message);
  for (
    let hours = 0;
    campaign.snapshot().constructions[0]?.stage !== "commissioning";
    hours++
  ) {
    if (hours > 40 * 24) throw new Error("It never came to its Commissioning.");
    campaign.advance(60);
  }
  return campaign.save();
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

/** Where `lateGameSave` puts what it builds. */
const LATE_GAME_SITES = [
  ["solar-array", { x: 40, y: 25 }],
  ["solar-array", { x: 40, y: 13 }],
  ["solar-array", { x: 40, y: 1 }],
  ["large-battery-bank", { x: 40, y: 37 }],
  ["large-battery-bank", { x: 52, y: 37 }],
  ["large-battery-bank", { x: 64, y: 37 }],
  ["water-tank", { x: 52, y: 25 }],
  ["water-processing-plant", { x: 64, y: 25 }],
  ["water-processing-plant", { x: 74, y: 25 }],
  ["greenhouse", { x: 62, y: 12 }],
  ["buried-habitat", { x: -18, y: 8 }],
] as const;

/** The Science in `lateGameSave`: all that a vault cistern costs. */
export const LATE_GAME_SCIENCE =
  catalogue.designs.find(({ id }) => id === "vault-cistern")?.scienceCost ?? 0;

/**
 * Late in a Campaign, with the Mission Director in a Buried Habitat at the dose a
 * long Campaign has by then: a Greenhouse growing, a water tank nearly full, Growing
 * halls unlocked, the Science for a Vault cistern, and in stock what a growing hall,
 * a second water tank and a vault cistern are built from. It plays only as far as
 * the Robot's building takes, on a save edited to have what it needs.
 */
function lateGameSave(): string {
  const componentsOf = (id: string) =>
    catalogue.structureTypes.find((type) => type.id === id)?.components ?? [];
  const loaded = loadCampaign(
    freshSaveWith((state) => {
      for (const design of catalogue.designs) {
        if (
          design.id !== "vault-cistern" &&
          !state.unlockedDesignIds.includes(design.id)
        ) {
          state.unlockedDesignIds.push(design.id);
        }
      }
      addComponents(state, [
        ...LATE_GAME_SITES.flatMap(([id]) => componentsOf(id)),
        { componentId: catalogue.maintenance.spareComponentId, count: 60 },
      ]);
      for (const stock of state.lifeSupport) stock.kilograms = 400;
    }),
  );
  if (!loaded.ok) throw new Error(loaded.message);
  const { campaign } = loaded;
  for (const [structureTypeId, position] of LATE_GAME_SITES) {
    const planned = campaign.planConstruction({ structureTypeId, position });
    if (!planned.ok) throw new Error(planned.message);
  }
  for (let hours = 0; campaign.snapshot().constructions.length > 0; hours++) {
    if (hours > 40 * 24) throw new Error("The base was never finished.");
    campaign.advance(60);
  }
  const home = campaign
    .snapshot()
    .structures.find(
      ({ structureTypeId }) => structureTypeId === "buried-habitat",
    );
  for (let hours = 0; home !== undefined; hours++) {
    if (hours > 40 * 24) throw new Error("The Buried Habitat never had power.");
    const now = campaign.snapshot().structures.find(({ id }) => id === home.id);
    if (now?.powered === true) break;
    campaign.advance(60);
  }
  const moved = campaign.moveMissionDirectorIn(home?.id ?? "");
  if (!moved.ok) throw new Error(moved.message);
  for (let hours = 0; ; hours++) {
    const { part, minutesRemaining } = campaign.snapshot().lunation;
    if (
      part === "daylight" &&
      minutesRemaining > toGameMinutes({ earthDays: 15 })
    ) {
      break;
    }
    if (hours > 40 * 24) throw new Error("Daylight never came.");
    campaign.advance(60);
  }
  return saveWith(campaign, (state) => {
    state.science = LATE_GAME_SCIENCE;
    state.fundingMillionDollars = 20000;
    state.radiationDoseMillisieverts = 570;
    addComponents(state, [
      ...componentsOf("growing-hall"),
      ...componentsOf("vault-cistern"),
      ...componentsOf("water-tank"),
    ]);
    stockOf(state, "water-ice", 1500);
    for (const stock of state.lifeSupport) {
      if (stock.stockId === "water") stock.kilograms = 1300;
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

export const tryScenarios: readonly TryScenario[] = [
  {
    id: "everything-unlocked",
    title: "An hour into a Campaign with every Design unlocked and $5,000M",
    steps: [
      "Open the Launch manifest: every item the game has today is listed, under Supplies, then Power, Construction, Protection, Life Support, Industry and Mobility, with a box above them to find one.",
      'Type "telescope" in the box: only the telescope\'s two parts stay, under Industry, and it says "Showing 2 of 67 items".',
      "Press + on one of them: the bars and the box stay in sight, and the rows don't move.",
      "Press Clear: all 67 come back, in the same order.",
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
      'A "Ready for Crew" message opens over everything, as every Milestone is now reached, with the game paused. Press Carry on: the game runs at 20x again.',
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
      "Pick the Propellant plant in the build menu and place it on the power network. Once it runs, the propellant in the status panel, shown now against the limit of 450 kg that the Plant brings, rises by about a kilogram a game-hour.",
    ],
    save: act3Save,
  },
  {
    id: "act-4",
    title:
      "The start of Act 4, on Earth Day 1,400, at the long-game play guide's own base as it played there: 530 mSv, $12,171M and a Buried Habitat unlocked",
    slow: true,
    steps: [
      'Pause the game. The Milestones say "Act 4: Permanence", with Moved into a Buried Habitat as "Now". Radiation says about "529.6 / 600 mSv" with the limit about 470 days off. Funding is about $12,171M, and it is Night. The Lander is at Earth, so what is on the Launch manifest now comes on the next Launch.',
      "The goal: move the Mission Director into a Buried Habitat, which cuts the dose rate tenfold. Its parts come to 5,300 kg, and a Launch carries 2,000 kg, so it takes three Launches.",
      "Open the Launch manifest and, under Protection, add 4 vault sections: 2,000 kg, a full Launch. Set the game to 20x.",
      "Each time the Lander is back and unloaded, open the manifest again: 4 more vault sections on the second Launch, then the deep life support core, under Protection, and an airlock, under Life Support, on the third. Press Send the Lander each time.",
      "Once all the parts are in, pick Buried Habitat in the build menu and place it on clear ground, early in a Daylight if you can. The excavator takes about 5 Earth Days to dig it in.",
      'Once it is commissioned and has power, click it on the map, the low mound with a hatch at one end, and press "Move here" in its pop-up. Radiation now says "+0.015 a day". The guide moved in on about Earth Day 1,592, at 568 mSv. If you like, dismantle the old Habitat to get its power back: its water wall first, then its shielding, then the Habitat itself.',
      "The rest of the base is the guide's, with its choices: its Workshops and propellant plants are switched off while it has enough, and a solar array it planned waits unbuilt for the array works' Components. Note how soon the limit felt pressing, whether the Funding made a Buried Habitat a choice or a given, and whether those Earth Days had enough to do or dragged.",
    ],
    save: () => longGameSaveOn(1400),
  },
  {
    id: "act-4-moved-in",
    title:
      "Act 4 on Earth Day 1,600, at the long-game play guide's base just after it moved into a Buried Habitat: 568 mSv, $11,378M and 1,353 Science",
    slow: true,
    steps: [
      'Pause the game. Living says "in the Buried Habitat", and the old Habitat, its water wall and its shielding are gone. Radiation says about "568.5 / 600 mSv" and "+0.015 a day". Funding is about $11,378M and Science about 1,353.',
      "The limit is years off now. Look at what to aim for next: the Tech Tree, where Precision optics costs 1,800 Science, the Milestones' First precision optics sold, a Greenhouse, a second Robot.",
      "Play on at 20x as you would for 15 minutes, about 75 Earth Days.",
      "Note whether you knew what to aim for, whether waiting for the Science for Precision optics was felt, and whether those Earth Days had enough to do or dragged.",
    ],
    save: () => longGameSaveOn(1600),
  },
  {
    id: "act-4-optics",
    title:
      "Act 4 on Earth Day 1,700, at the long-game play guide's base just after Precision optics was unlocked, with a Greenhouse growing and $12,933M",
    slow: true,
    steps: [
      "Pause the game. Precision optics is unlocked and no optics works is built yet. A Greenhouse stands, and Water is about 149 kg. Funding is about $12,933M.",
      "Open the Launch manifest: the guide has already put an optics works' two optical grinders and metrology bench on it. Keep them or clear them: precision optics sell for $6M a kilogram, twice circuit boards, and an optics works takes 5 kg of water for each kilogram, from the same water as the Greenhouse.",
      "Play on at 20x as you would for 15 minutes, about 75 Earth Days. The guide sold its first precision optics on about Earth Day 1,721.",
      "Note whether water felt like the limit, whether you'd rather it went to optics or to the Greenhouse's Science, and whether those Earth Days had enough to do or dragged.",
    ],
    save: () => longGameSaveOn(1700),
  },
  {
    id: "act-4-late",
    title:
      "Act 4 on Earth Day 2,000, at the long-game play guide's base with an optics works and a Greenhouse, $18,186M and 2,043 Science",
    slow: true,
    steps: [
      "Pause the game. An optics works, a Greenhouse, a water tank and an oxygen tank stand. Water is about 165 kg, so the guide has switched the optics works off, as it does below 320 kg, to leave the Greenhouse a Night's water. Funding is about $18,186M and Science about 2,043. In the Tech Tree, the Optics grinding line comes next, then Growing halls and Vault cistern.",
      "Play on at 20x as you would for 15 minutes, about 75 Earth Days.",
      "Note what you spent Funding on, if anything, whether a Greenhouse's Science felt worth its water, and whether those Earth Days had enough to do or dragged.",
    ],
    save: () => longGameSaveOn(2000),
  },
  {
    id: "act-4-halls",
    title:
      "Act 4 on Earth Day 2,200, at the long-game play guide's base just after Growing halls was unlocked, with $20,012M and 93 kg of water",
    slow: true,
    steps: [
      "Pause the game. Growing halls has just been unlocked. The guide has built a third Workshop and a water-processing plant, and its optics works and grinding line are switched off, as Water is about 93 kg. Funding is about $20,012M. The Launch manifest holds a large battery bank's parts.",
      "Open the Tech Tree and the Guide: a growing hall earns more Science for its water than a Greenhouse, for $5,000M. The guide went on to buy three more water-processing plants, four cold-trap ice lines at $3,000M each and a growing hall, about $18,500M with the rest.",
      "Play on at 20x as you would for 15 to 20 minutes, 75 to 100 Earth Days.",
      "Note whether Funding was worth spending on Science and water, or better left idle, and whether those Earth Days had enough to do or dragged.",
    ],
    save: () => longGameSaveOn(2200),
  },
  {
    id: "act-4-end",
    title:
      "The end of Act 4, on Earth Day 2,850, at the long-game play guide's base with a Large-scale Crew Habitat planned and waiting for water, 557 kg of water and $4,815M",
    slow: true,
    steps: [
      'Pause the game. The Milestones say "Now" is Large-scale Crew Habitat commissioned, the last. The Work panel says the Large-scale Crew Habitat is waiting for about 1,992 kg more water: stocking it must leave the Mission Director a reserve. Water is about 557 of 3,400 kg and Oxygen about 624 kg, enough for its 600 kg. Funding is about $4,815M, and Science about 8,930, 70 short of a Vault cistern. Radiation says about "593.3 / 600 mSv", with the limit after Earth Day 3,000.',
      "The Greenhouse and growing hall are running, and drink the water it waits for; the guide has switched the optics works and grinding line off to save it. Decide: switch the Greenhouse and growing hall off in the Base panel to stock it sooner, which leaves the Vault cistern's Science out of reach, or let them earn it. The guide waits until Vault cistern is unlocked, about 4 Earth Days on, then switches them off, and its habitat was stocked and commissioned on about Earth Day 2,879.",
      'Set the game to 20x. Once there is the water, Water and Oxygen fall by 2,500 kg and 600 kg at once and the Robots assemble it. As it is commissioned, every Milestone is reached and a "Ready for Crew" message opens over everything, with the game paused. Press Carry on.',
      "If you like, then build a vault cistern: unlock it in the Tech Tree, ship its 16 cistern cells, under Protection, over two Launches, and place it on the Buried Habitat's mound. It fills itself once Water passes about 2,050 kg. The guide commissioned one on about Earth Day 2,950.",
      "Play on at 20x to Earth Day 3,000, about 30 minutes, where the Campaign's content runs out. Note whether saving up for the habitat and stocking it felt like a purpose or a wait, whether the celebration landed, and whether those Earth Days had enough to do or dragged.",
    ],
    save: () => longGameSaveOn(2850),
  },
  {
    id: "crew-habitat",
    title:
      "Early in a Campaign with every Milestone reached but the last, and a Large-scale Crew Habitat being commissioned",
    steps: [
      'Pause the game. The Milestones say "Act 4: Permanence", with Large-scale Crew Habitat commissioned as "Now". The Work panel shows the Large-scale Crew Habitat being commissioned. Find it on the map north-west of the Lander: three long white vaults side by side, joined by a lower spine with an airlock at each end.',
      "Click it: the pop-up says it is a Large-scale Crew Habitat. The status panel's Oxygen and Water are lower by the 600 kg and 2,500 kg it was stocked with as its Assembly started.",
      'Set the game to 20x. Within a few real seconds it is commissioned (if Commissioning fails, the Robot tries again), and a "Ready for Crew" message opens over everything, saying the base has moved on to its next phase and that the Campaign goes on. The game speed now shows Pause.',
      'Press "Carry on": the message closes and the game runs at 20x again. A notification says "Milestone reached: Large-scale Crew Habitat commissioned", and the Milestones say every Milestone is reached. The Base panel has no "Move here" button beside it.',
      "Save the game and load the save: the message doesn't open again.",
      "Open the Guide: How it works says what the last Milestone builds towards, and the Structures tab has the Large-scale Crew Habitat under Life Support, saying what it is stocked with.",
    ],
    save: crewHabitatSave,
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
    id: "split-network",
    title:
      "The starting base with the Mission Director moved in, but with the Habitat and one battery bank on a network of their own, apart from the solar array and the other battery banks",
    steps: [
      'Pause the game. Look at the status panel\'s Power: Stored says about "337 / 600 kWh" for the whole base, and the Habitat line below it says how little of that the Habitat can draw on, about "112 / 200 kWh", and "own network, lasts 3d 17h". The Mission Director\'s Habitat power says it "fails in" the same time.',
      'Click the Power title to fold it: beside the title it says the power to spare, how full the base\'s battery banks are, and "Habitat 56%".',
      "Open it again and set the game to 20x: the Habitat line falls while the base's solar array keeps the other battery banks full, and the warnings that Habitat power will fail come as it runs down.",
    ],
    save: splitNetworkSave,
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
    id: "storage-tanks",
    title:
      "A base with a water tank and an oxygen tank half full on a solar array and a battery bank, a few hours before Night, and a second water tank's Components in stock",
    steps: [
      'Pause the game. The status panel says "Water 700.0 of 1400 kg" and "Oxygen 200.0 of 400 kg". In the Base panel the Water tank says "holds 500 of 1000 kg of water, draws 0.05 kW at Night". Find the two tanks on the map: a long capsule on saddles and a gold sphere on legs with a white radiator on top, each with half the lights lit on the post beside it.',
      'Set the game to 5x until Night falls: the tanks say "drawing 0.05 kW" and "drawing 0.15 kW", and the power line uses that much more.',
      "Pick the Water tank in the build menu and place it. Set the game to 20x: once it is commissioned the status panel's limit is 2400 kg, and no water has appeared, as a tank comes empty.",
      "Press Dismantle beside the Oxygen tank. When the Robot starts on it the limit falls to 100 kg, and a notification says 100 kg of oxygen with no room left was lost.",
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
      "Press Dismantle beside the Propellant plant. When the Robot starts on it the limit falls by 450 kg, the stock doesn't, and no notification says anything was lost. Press Dismantle beside a Propellant tank: when the Robot starts on it, a notification says what no longer fits was lost.",
    ],
    save: propellantTanksSave,
  },
  {
    id: "regolith-digger",
    title:
      "A base with a propellant plant, a bucket-wheel digger and a Regolith bin, 4,800 of 5,000 kg of Regolith, a few hours before Night, on three solar arrays and two battery banks, and a second bin's Components in stock",
    steps: [
      'Pause the game. The status panel\'s Bulk resources say "Regolith 4800.0 of 5000 kg". In the Base panel the Regolith bin says "holds 2880 of 3000 kg of Regolith", with nothing about power. Find it on the map: an open square bay of metal walls, filled with Regolith, and the digger, a Plant with a conveyor running back to a skid where it digs.',
      'Set the game to 5x. The digger says "making 30 kg of Regolith an hour from the ground", and the Regolith rises, faster than the propellant plant uses it. The excavator stays where it is: with the bin, digging starts only below 4000 kg.',
      'Carry on until Night falls. The Robot parks the excavator, but once the propellant plant has drawn the Regolith down a batch, the digger runs again on the battery banks\' spare power, and the Regolith stays near full. Once the banks have no more to spare, the digger says "idle at Night: no stored power to spare", and the Regolith falls as it did before.',
      "Pick the Regolith bin in the build menu and place it. Set the game to 20x: once it is commissioned the status panel's limit is 8000 kg, and in Daylight the excavator digs to fill it. The bin needs no cable.",
      "Open the Launch manifest: the digger's head and conveyors and the bin's walls are under Industry, behind Continuous excavation. Open the Guide's Structures for their cards.",
    ],
    save: regolithDiggerSave,
  },
  {
    id: "greenhouse",
    title:
      "A base with a Greenhouse growing on a solar array and a large battery bank, a few hours before Night, on a day's water above the reserve, with a water-processing plant switched off and a second Greenhouse's Components in stock",
    steps: [
      'Pause the game. In the Base panel the Greenhouse says "growing" and how long is left of this round, and "using 1 kg of water an hour, for 20 Science a round". The status panel\'s Water says "Greenhouse using 24 kg a day" and when it will be down to the reserve. Click it on the map: a glass dome over green racks. Its pop-up has a Round line, with how far the round has got.',
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
      'Pause the game and open Research Tasks. Solar wind volatiles survey is running, and says how long it has left "at ×2", and below that "1 automated experiments lab speeding it up". The status panel\'s Research Task line says the same time left at ×2.',
      'Click the lab on the map: two long modules side by side under a radiator, their ports lit. Its pop-up has a Research line with the task and the rate, and the Base panel says "speeding up the Research Task running". The status panel\'s Water and Oxygen fall by 0.5 kg and 0.1 kg an hour.',
      "Pick Automated experiments lab in the build menu and place a second one on clear ground. Once it is commissioned, Research Tasks says ×3, and 2 labs speeding it up.",
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
      "Press Dismantle beside the array: the game refuses, saying its antenna fields join it and must be dismantled first. Dismantle a field and, once the Robot starts taking it apart, the array's count and rate fall again.",
      "Open the Guide: Structures has the array's card and the antenna field's, and Science and technologies says what they need. The Launch manifest has their antenna tiles, correlator and field receiver, under Industry.",
    ],
    save: radioTelescopeArraySave,
  },
  {
    id: "late-game",
    title:
      "Late in a Campaign, with the Mission Director in a Buried Habitat at 570 mSv, a Greenhouse growing, a water tank nearly full, Growing halls unlocked, the Science for a Vault cistern, $20,000M, and in stock what a growing hall, a second water tank and a vault cistern are built from",
    steps: [
      'Pause the game. The status panel\'s Radiation says about "570.0 / 600 mSv" and a limit some 2,000 Earth Days off. Open the Tech Tree: under Life Support, Growing halls is unlocked and says what a growing hall earns, drinks and draws; under Protection, Vault cistern costs all the Science you have and says what it does. Press its Unlock button: Science falls to none.',
      "Open the Guide: Keeping the Mission Director alive and Science and technologies say what these are for. Both have cards under Structures. The Launch manifest has their parts, dear ones, under Life Support and Protection.",
      "In the build menu, pick Vault cistern and move it over the Buried Habitat's low mound: click to place it there. Anywhere else it says it can only be built round a commissioned Buried Habitat. Set the game to 5x. Its Work panel line soon says it is waiting for more water, and that the base can hold only 1400 kg, so build another water tank.",
      "Pick Water tank in the build menu and place it. Once it is commissioned, Water reads against a limit of 2400 kg, and the vault cistern's line no longer speaks of what the base can hold.",
      'Pick Growing hall and place it on clear ground. Once it is commissioned, click it: a long glazed vault with light pipes along its ridge. The Base panel says "growing" and "using 2 kg of water an hour, for 100 Science a round". Its round takes 10 Earth Days, longer than a Night, so a Night short of water loses a whole one. Now choose: with both it and the Greenhouse growing, Water hardly rises.',
      'Press "Switch off" beside the Growing hall and the Greenhouse: within the hour notifications say their rounds were given up. Set the game to 20x: the Water-processing plants bring Water up, and once it passes about 2,050 kg the cistern takes 2,000 kg of it all at once, as its Assembly starts.',
      "Once it is commissioned, click the mound: the Buried Habitat's pop-up says Shielding buried under the Regolith and a vault cistern, and Dose rate 0.003 mSv a day. The status panel's Radiation limit moves thousands of Earth Days off.",
    ],
    save: lateGameSave,
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
