// How the long-game play guide runs the base at each step.
import { catalogue } from "../../src/catalogue";
import type { Snapshot } from "../../src/simulation";
import { ACT_2_EARTH_DAY, type Play, succeed } from "../reference-campaign";
import { toGameMinutes } from "../scenario";
import { manifestLinesOf, missingFromStock } from "./buried-habitat";
import {
  ARRAYS_FROM_THE_WORKS,
  BOARDS_WORTH_A_TRIP_KILOGRAMS,
  METALS_KEPT_KILOGRAMS,
  PROPELLANT_HELD_KILOGRAMS,
  PROPELLANT_KEPT_KILOGRAMS,
  sendForAsFundingAllows,
  TRIPLED_RETURN_MASS_KILOGRAMS,
} from "./purchases";
import {
  GREENHOUSE_EARTH_DAY,
  ICE_HELD_KILOGRAMS,
  OXYGEN_FOR_THE_CREW_HABITAT_KILOGRAMS,
  SPARES_HELD,
  WATER_FOR_THE_CISTERN_KILOGRAMS,
  WATER_FOR_THE_CREW_HABITAT_KILOGRAMS,
  WATER_FOR_THE_LAB_AT_NIGHT_KILOGRAMS,
  WATER_FOR_THE_NIGHT_KILOGRAMS,
  WATER_FOR_THE_NIGHT_WITH_A_HALL_KILOGRAMS,
  WATER_TO_SPARE_KILOGRAMS,
} from "./settings";

/**
 * The oxygen below which, while an automated experiments lab runs, the guide sets
 * its large extraction plant to oxygen, and above which it sets it back. The lab
 * takes 2.4 kg an Earth Day down to the reserve, about 12 kg, nearly three times
 * what the Mission Director breathes, more than the first extraction plant makes
 * running all Daylight: with only that plant, the stock fell to 4.7 kg on Earth
 * Day 1,800.6 at version 88, under six Earth Days of breathing.
 */
export const OXYGEN_FOR_THE_LAB_KILOGRAMS = { low: 40, high: 80 } as const;

/**
 * Sets a large extraction plant to metals and silicon, as what the base has it for,
 * but to oxygen while a Large-scale Crew Habitat is to be stocked and the base has
 * the tanks to hold it and too little, or while an automated experiments lab runs
 * and the oxygen is short of what it and the Mission Director take.
 */
export function runLargeExtractionPlant(play: Play): void {
  const { state } = play;
  const plant = state.structures.find(
    ({ structureTypeId }) => structureTypeId === "large-extraction-plant",
  );
  if (plant === undefined) return;
  const oxygenTanks = state.structures.filter(
    ({ structureTypeId }) => structureTypeId === "oxygen-tank",
  ).length;
  const oxygen =
    state.lifeSupport.find(({ stockId }) => stockId === "oxygen")?.kilograms ??
    0;
  const labWanted =
    !everythingResearched(state) &&
    state.structures.some(
      ({ structureTypeId }) => structureTypeId === "experiments-lab",
    );
  const forTheLab =
    labWanted &&
    oxygen <
      (plant.recipeId === "oxygen"
        ? OXYGEN_FOR_THE_LAB_KILOGRAMS.high
        : OXYGEN_FOR_THE_LAB_KILOGRAMS.low);
  const recipeId =
    (crewHabitatToStock(state) &&
      oxygenTanks >= 2 &&
      oxygen < OXYGEN_FOR_THE_CREW_HABITAT_KILOGRAMS) ||
    forTheLab
      ? "oxygen"
      : "metals-and-silicon";
  if (plant.recipeId === recipeId) return;
  succeed(
    play.campaign.setPlantRecipe(plant.id, recipeId),
    `Setting the large extraction plant to ${recipeId}`,
  );
}

/**
 * Whether the guide means to stock a Large-scale Crew Habitat that isn't stocked
 * yet: its Design is unlocked, and none stands nor has started its Assembly.
 */
function crewHabitatToStock(state: Snapshot): boolean {
  return (
    state.unlockedDesignIds.includes("crew-habitats") &&
    !state.structures.some(
      ({ structureTypeId }) => structureTypeId === "crew-habitat",
    ) &&
    !state.constructions.some(
      ({ structureTypeId, stage, stageProgress }) =>
        structureTypeId === "crew-habitat" &&
        (stage === "commissioning" ||
          (stage === "assembly" && stageProgress > 0)),
    )
  );
}

/**
 * Has the array works make what two more solar arrays are built from, plans them
 * once it has, and switches it off, as the base then has power enough.
 */
export function runArrayWorks(play: Play): void {
  const { state } = play;
  const works = state.structures.find(
    ({ structureTypeId }) => structureTypeId === "array-works",
  );
  if (works === undefined) return;
  const planned = ARRAYS_FROM_THE_WORKS.filter(({ x, y }) =>
    [...state.constructions, ...state.structures].some(
      ({ position }) => position.x === x && position.y === y,
    ),
  );
  const site = ARRAYS_FROM_THE_WORKS[planned.length];
  if (site === undefined) {
    if (!works.switchedOff) {
      succeed(
        play.campaign.switchPlant(works.id, "off"),
        "Switching the array works off",
      );
    }
    return;
  }
  const lines = manifestLinesOf("solar-array");
  const missing = missingFromStock(state, lines);
  if (missing.length === 0) {
    // A Machine or Rover may be standing there for now: it tries again.
    play.campaign.planConstruction({
      structureTypeId: "solar-array",
      position: site,
    });
    return;
  }
  const recipeId = missing.some(({ itemId }) => itemId === "solar-panel")
    ? "solar-panels"
    : "array-masts";
  if (works.recipeId !== recipeId) {
    succeed(
      play.campaign.setPlantRecipe(works.id, recipeId),
      "Switching the array works' recipe",
    );
  }
}

/**
 * Loads the Lander whenever it is free and there is something worth a trip: all
 * the precision optics and circuit boards that its Return Mass will take, as they
 * are worth the propellant to lift them, then propellant if there is plenty and
 * metals if not, up to the 100 kg it can carry for nothing. Once, it loads metals
 * as well to make up a tripled Return Mass, to see that it can be done.
 */
export function loadTheLander(play: Play): void {
  const { state } = play;
  if (
    state.clock.elapsedMinutes <
      toGameMinutes({ earthDays: ACT_2_EARTH_DAY }) ||
    state.lander.state !== "landed-free" ||
    state.exports.toLoad.length > 0 ||
    state.exports.aboard.length > 0
  ) {
    return;
  }
  const amount = (resourceId: string) =>
    state.bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? 0;
  const freeMass = catalogue.lander.returnMassKilograms;
  const limit = Math.floor(state.exports.returnMassKilograms);
  const optics = Math.floor(amount("precision-optics"));
  const boards = Math.floor(amount("circuit-boards"));
  if (optics + boards < BOARDS_WORTH_A_TRIP_KILOGRAMS) return;
  const opticsLoaded = Math.min(optics, limit);
  const boardsLoaded = Math.min(boards, limit - opticsLoaded);
  let loaded = opticsLoaded + boardsLoaded;
  const metalsSpare = Math.max(
    0,
    Math.floor(amount("metals") - METALS_KEPT_KILOGRAMS),
  );
  const tripling =
    limit >= TRIPLED_RETURN_MASS_KILOGRAMS &&
    !state.milestones.reachedIds.includes("return-mass-tripled") &&
    metalsSpare >= TRIPLED_RETURN_MASS_KILOGRAMS - loaded;
  let metals = 0;
  let propellant = 0;
  if (tripling) {
    metals = TRIPLED_RETURN_MASS_KILOGRAMS - loaded;
  } else if (loaded < freeMass) {
    // Selling it leaves less to burn, so only what the Lander won't need.
    const propellantSpare = Math.floor(
      amount("propellant") - PROPELLANT_KEPT_KILOGRAMS,
    );
    propellant = Math.min(freeMass - loaded, Math.max(0, propellantSpare));
    loaded += propellant;
    metals = Math.min(freeMass - loaded, metalsSpare);
  }
  const lines = [
    { resourceId: "precision-optics", kilograms: opticsLoaded },
    { resourceId: "circuit-boards", kilograms: boardsLoaded },
    { resourceId: "metals", kilograms: metals },
    { resourceId: "propellant", kilograms: propellant },
  ].filter(({ kilograms }) => kilograms > 0);
  // It waits for a Plant rather than send a Lander with no propellant or metals to fill it.
  if (
    lines.reduce((total, { kilograms }) => total + kilograms, 0) < freeMass &&
    boards < freeMass
  ) {
    return;
  }
  succeed(play.campaign.loadExports(lines), "Loading the Exports");
}

/**
 * Keeps the propellant plants running only while the stock is short of a few
 * trips' worth, so that they don't take all the Regolith.
 */
export function runPropellantPlants(play: Play): void {
  const { state } = play;
  const inStock =
    state.bulkResources.find(({ resourceId }) => resourceId === "propellant")
      ?.kilograms ?? 0;
  const setting =
    inStock > PROPELLANT_HELD_KILOGRAMS
      ? "off"
      : inStock < PROPELLANT_HELD_KILOGRAMS / 2
        ? "on"
        : undefined;
  if (setting === undefined) return;
  for (const plant of state.structures) {
    if (
      (plant.structureTypeId === "propellant-plant" ||
        plant.structureTypeId === "large-propellant-plant") &&
      (setting === "off") !== plant.switchedOff
    ) {
      succeed(
        play.campaign.switchPlant(plant.id, setting),
        "Switching a propellant plant",
      );
    }
  }
}

/**
 * Runs the bucket-wheel digger only at Night, when the excavator is parked and
 * can dig nothing. In Daylight it would only dig what the excavator digs for
 * nothing, and as a Plant built before the water-processing plants and the
 * later cold-trap ice lines it takes the power they run on first: running all
 * day, it left the base short of water, and the optics switched off for it.
 */
export function runDigger(play: Play): void {
  const { state } = play;
  const setting = state.lunation.part === "night" ? "on" : "off";
  for (const digger of state.structures) {
    if (
      digger.structureTypeId === "bucket-wheel-digger" &&
      (setting === "off") !== digger.switchedOff
    ) {
      succeed(
        play.campaign.switchPlant(digger.id, setting),
        "Switching the bucket-wheel digger",
      );
    }
  }
}

/**
 * Runs the Workshops only as far as the spare Components need them, so that
 * they don't spend metals on more than the base will use for a long time.
 */
export function runWorkshops(play: Play): void {
  const { state } = play;
  const spares =
    state.stockpile.components.find(
      (stock) => stock.componentId === catalogue.maintenance.spareComponentId,
    )?.count ?? 0;
  const setting =
    spares > SPARES_HELD ? "off" : spares < SPARES_HELD ? "on" : undefined;
  if (setting === undefined) return;
  for (const workshop of state.structures) {
    if (
      workshop.structureTypeId === "workshop" &&
      (setting === "off") !== workshop.switchedOff
    ) {
      succeed(
        play.campaign.switchPlant(workshop.id, setting),
        "Switching the Workshop",
      );
    }
  }
}

/**
 * Sends for a second Robot, so that one can be off on an Expedition with
 * Maintenance still seen to.
 */
export function shipASecondRobot(play: Play): void {
  const { state } = play;
  if (
    state.clock.elapsedMinutes <
      toGameMinutes({ earthDays: GREENHOUSE_EARTH_DAY }) ||
    state.robots.length > 1 ||
    !state.unlockedDesignIds.includes("robots")
  ) {
    return;
  }
  sendForAsFundingAllows(play, [{ itemId: "robot", count: 1 }], "a Robot");
}

/**
 * Once there is a Greenhouse: keeps the Rover going for water ice whenever it is
 * free and there is too little in stock, and holds the optics back, which would
 * otherwise drink what it needs to last the Night. Once the last Design is unlocked,
 * Science has nothing left to buy, so it switches its Greenhouses and growing hall
 * off, as it does the optics until a vault cistern is filled, and lets the optics
 * have the water after that.
 */
export function waterTheGreenhouse(play: Play): void {
  const { state } = play;
  if (
    !state.structures.some(
      ({ structureTypeId }) => structureTypeId === "greenhouse",
    )
  ) {
    return;
  }
  const ice =
    state.bulkResources.find(({ resourceId }) => resourceId === "water-ice")
      ?.kilograms ?? 0;
  if (
    state.expedition === undefined &&
    ice < ICE_HELD_KILOGRAMS &&
    state.rovers.some(({ conditionPercent }) => conditionPercent > 0)
  ) {
    // It may be refused for now, if no Robot is free: it tries again.
    play.campaign.startExpedition();
  }
  const water =
    state.lifeSupport.find(({ stockId }) => stockId === "water")?.kilograms ??
    0;
  const cisternToFill =
    state.unlockedDesignIds.includes("vault-cistern") &&
    !state.structures.some(
      ({ structureTypeId }) => structureTypeId === "vault-cistern",
    );
  if (state.unlockedDesignIds.includes("vault-cistern")) {
    for (const plant of state.structures) {
      if (
        (plant.structureTypeId === "greenhouse" ||
          plant.structureTypeId === "growing-hall") &&
        !plant.switchedOff
      ) {
        succeed(
          play.campaign.switchPlant(plant.id, "off"),
          "Switching off what earns Science, with nothing left to buy",
        );
      }
    }
  }
  const crewHabitatPlanned =
    crewHabitatToStock(state) &&
    state.constructions.some(
      ({ structureTypeId }) => structureTypeId === "crew-habitat",
    );
  const running = (structureTypeId: string) =>
    state.structures.some(
      (structure) =>
        structure.structureTypeId === structureTypeId && !structure.switchedOff,
    );
  const held = crewHabitatPlanned
    ? WATER_FOR_THE_CREW_HABITAT_KILOGRAMS
    : cisternToFill
      ? WATER_FOR_THE_CISTERN_KILOGRAMS
      : (running("growing-hall")
          ? WATER_FOR_THE_NIGHT_WITH_A_HALL_KILOGRAMS
          : WATER_FOR_THE_NIGHT_KILOGRAMS) +
        (running("experiments-lab") ? WATER_FOR_THE_LAB_AT_NIGHT_KILOGRAMS : 0);
  const setting =
    water < held
      ? "off"
      : water > held + WATER_TO_SPARE_KILOGRAMS - WATER_FOR_THE_NIGHT_KILOGRAMS
        ? "on"
        : undefined;
  if (setting === undefined) return;
  for (const plant of state.structures) {
    if (
      (plant.structureTypeId === "optics-works" ||
        plant.structureTypeId === "grinding-line") &&
      (setting === "off") !== plant.switchedOff
    ) {
      succeed(
        play.campaign.switchPlant(plant.id, setting),
        "Switching the optics",
      );
    }
  }
}

/** Whether every Research Task is completed, so that an automated experiments lab has nothing to speed up. */
function everythingResearched(state: Snapshot): boolean {
  return catalogue.researchTasks.every(({ id }) =>
    state.completedResearchTaskIds.includes(id),
  );
}

/**
 * The oxygen below which the guide switches its automated experiments lab off,
 * and above which it switches it on again, so that the lab doesn't leave the
 * Mission Director living on the reserve: at version 88, with the lab taking
 * the stock down to it, a gap in what the Plants made took it to 7.6 kg on
 * Earth Day 2,063, under the reserve of about 12 kg.
 */
export const LAB_OXYGEN_KILOGRAMS = { off: 25, on: 40 } as const;

/**
 * Runs the late science: the automated experiments lab while there is research
 * left and oxygen enough to spare, and the infrared telescope until Vault cistern
 * is unlocked, when it is switched off with the Greenhouses, so that it boils
 * off no more propellant for Science with nothing left to buy. The radio
 * telescope array isn't a Plant, so it can't be switched off, and goes on
 * earning what it costs only power.
 */
export function runLateScience(play: Play): void {
  const { state } = play;
  const researched = everythingResearched(state);
  const nothingToBuy = state.unlockedDesignIds.includes("vault-cistern");
  const oxygen =
    state.lifeSupport.find(({ stockId }) => stockId === "oxygen")?.kilograms ??
    0;
  for (const plant of state.structures) {
    const setting =
      plant.structureTypeId === "experiments-lab"
        ? researched || oxygen < LAB_OXYGEN_KILOGRAMS.off
          ? "off"
          : oxygen > LAB_OXYGEN_KILOGRAMS.on
            ? "on"
            : undefined
        : plant.structureTypeId === "infrared-telescope" && nothingToBuy
          ? "off"
          : undefined;
    if (setting !== undefined && (setting === "off") !== plant.switchedOff) {
      succeed(
        play.campaign.switchPlant(plant.id, setting),
        `Switching the ${plant.structureTypeId} ${setting}`,
      );
    }
  }
}

/** Unlocks the cheapest Design it can, once the Science is there. */
export function unlockEveryDesign(play: Play): void {
  const { state } = play;
  const next = catalogue.designs
    .filter(
      (design) =>
        !state.unlockedDesignIds.includes(design.id) &&
        design.scienceCost <= state.science &&
        design.prerequisiteDesignIds.every((id) =>
          state.unlockedDesignIds.includes(id),
        ),
    )
    .sort((a, b) => a.scienceCost - b.scienceCost)[0];
  if (next === undefined) return;
  succeed(play.campaign.unlockDesign(next.id), `Unlocking ${next.label}`);
}

/** Gives up on the Campaign if the guide has left any research undone. */
export function checkEverythingResearched(play: Play): void {
  const { state } = play;
  const tasksLeft = catalogue.researchTasks.filter(
    (task) => !state.completedResearchTaskIds.includes(task.id),
  );
  if (tasksLeft.length > 0) {
    throw new Error(
      `Research Tasks not completed: ${tasksLeft.map((task) => task.label).join(", ")}.`,
    );
  }
  const designsLeft = catalogue.designs.filter(
    (design) => !state.unlockedDesignIds.includes(design.id),
  );
  if (designsLeft.length > 0) {
    throw new Error(
      `Designs not unlocked: ${designsLeft.map((design) => design.label).join(", ")}.`,
    );
  }
}
