import { catalogue } from "../src/catalogue";
import {
  formatTimeline,
  playReferenceCampaign,
  referenceSteps,
  succeed,
  type Play,
  type PlayStep,
  type ReferenceTimeline,
} from "./reference-campaign";
import { catalogueUpToAct, exportEconomics, labelOf } from "./pacing-report";
import { toGameMinutes } from "./scenario";
import type { GroundPosition, ManifestLine, Snapshot } from "../src/simulation";

// The long-game play guide: plays on well past the end of the reference
// Campaign, through the simulation interface alone, with the same seed and
// every Hazard, real Solar Particle Events and all, as far as the Campaign's
// content is meant to last, so that the late game's balance can be seen. It takes minutes,
// so no test plays it: `npm run long-game` does, on demand (see
// docs/reference-campaign.md).
//
// A later Act adds its steps to `longGameSteps`, and whatever Designs they use
// to `designsTheLongGameUses`.

/**
 * The Earth Day the long-game play guide ends: the end of the last Act, the
 * length the Campaign's content is meant to last, which a Buried Habitat lets
 * the Mission Director live to.
 */
export const LONG_GAME_END_EARTH_DAY = 3000;

/** The most the last step waits for the Campaign to get there, as it does nothing else. */
const LONGEST_PLAY_ON = { earthDays: LONG_GAME_END_EARTH_DAY };

/**
 * The Designs whose Structures or Launch items the long-game play guide
 * builds or sends for. It checks this as it ends; the data catalogue's
 * consistency rules read it, as they can't play the game to find out.
 */
export const designsTheLongGameUses: readonly string[] = [
  "solar-arrays",
  "battery-banks",
  "inflatable-habitat",
  "regolith-shielding",
  "water-wall-shielding",
  "landing-pads",
  "regolith-extraction",
  "vacuum-fabrication",
  "circuit-board-fabrication",
  "water-processing",
  "life-support-resupply",
  "maintenance-spares",
  "molten-regolith-electrolysis",
  "parts-machining",
  "array-fabrication",
  "concentrator-towers",
  "cold-trap-mining",
  "buried-habitat",
  "propellant-production",
  "large-propellant-production",
  "precision-optics",
  "optics-grinding-line",
];

/** The Earth Day Act 2 opens, when the guide turns to making its own spare Components. */
const ACT_2_EARTH_DAY = 350;

/** The Earth Day Act 2 is meant to last until. */
const ACT_2_END_EARTH_DAY = 900;

/** Act 2's pacing targets, in Earth Days (docs/balancing.md). */
export const act2Targets = {
  workshopRunningBy: 500,
  sparesNeedNoLaunchBy: 800,
  designsStillToBuyAt: 700,
  researchLastsUntilAbout: ACT_2_END_EARTH_DAY,
  /** How far from that it may finish and still count as about then. */
  researchWithin: 50,
  /** How many Launches' profit one of every Launch item takes, at least. */
  launchesToBuyEverything: 20,
  metalsSoldBy: ACT_2_END_EARTH_DAY,
} as const;

/** Act 3's and Act 4's pacing targets, in Earth Days (docs/reference-campaign.md). */
export const laterActTargets = {
  propellantMadeBy: 1050,
  returnMassTripledBy: 1250,
  /** When research lasts until, for each of the two Acts. */
  act3ResearchUntilAbout: 1400,
  act4ResearchUntilAbout: LONG_GAME_END_EARTH_DAY,
  researchWithin: 50,
  opticsSoldBy: 2000,
} as const;

/** What the guide keeps in stock: it switches the Workshop off above this many, and back on below it. */
const SPARES_HELD = 40;

/**
 * The Earth Day the guide sends for a Buried Habitat, in good time to move in by
 * the Act's target of Earth Day 1,600: three Launches at a trip every 15 Earth
 * Days or so, then about 9 Earth Days to build it in the Daylight after the last.
 */
const BURIED_HABITAT_EARTH_DAY = 1530;

/** The latest Earth Day the guide should be moved in by, the Act's target. */
const BURIED_HABITAT_MOVED_IN_BY_EARTH_DAY = 1600;

/** Where a Buried Habitat stands: north of the old Habitat. */
const BURIED_HABITAT_SITE = { x: 46, y: 8 } as const;

/**
 * The Earth Days of Daylight the guide wants left as it plans a Buried Habitat:
 * about 9 to build it and 3 to dismantle the old Habitat, as this base's battery
 * banks can't carry both through a Night, and with both drawing power by day the
 * Workshop, last in line for it, makes too few spare Components.
 */
const DAYLIGHT_TO_BUILD_AND_MOVE = { earthDays: 12 };

/** The Components a type of Structure takes, as Launch manifest lines. */
function manifestLinesOf(structureTypeId: string): readonly ManifestLine[] {
  return (
    catalogue.structureTypes.find(({ id }) => id === structureTypeId)
      ?.components ?? []
  ).map(({ componentId, count }) => ({ itemId: componentId, count }));
}

/** What of these Launch manifest lines the base lacks in its stock. */
function missingFromStock(
  state: Snapshot,
  lines: readonly ManifestLine[],
): ManifestLine[] {
  return lines.flatMap(({ itemId, count }) => {
    const inStock =
      state.stockpile.components.find((stock) => stock.componentId === itemId)
        ?.count ?? 0;
    return count > inStock ? [{ itemId, count: count - inStock }] : [];
  });
}

/**
 * Sends for what a Buried Habitat needs, as much on each Launch as its Payload
 * Mass leaves room for beside the supplies already on the manifest, and plans
 * it early in a Daylight once it has all come.
 */
function shipBuriedHabitat(play: Play): void {
  const { state } = play;
  const buried = "buried-habitat";
  if (
    state.clock.elapsedMinutes <
      toGameMinutes({ earthDays: BURIED_HABITAT_EARTH_DAY }) ||
    !state.unlockedDesignIds.includes(buried) ||
    [...state.constructions, ...state.structures].some(
      ({ structureTypeId }) => structureTypeId === buried,
    )
  ) {
    return;
  }
  const missing = missingFromStock(state, manifestLinesOf(buried));
  if (missing.length === 0) {
    if (
      state.lunation.part === "daylight" &&
      state.lunation.minutesRemaining >=
        toGameMinutes(DAYLIGHT_TO_BUILD_AND_MOVE)
    ) {
      play.plan(buried, BURIED_HABITAT_SITE);
    }
    return;
  }
  // The manifest can change until the Lander leaves Earth, and the trip before
  // has been unloaded, so all the base lacks has yet to be sent for.
  if (state.lander.state !== "travelling-to-earth") return;
  const massOf = (itemId: string) =>
    catalogue.launch.items.find(({ id }) => id === itemId)?.massKilograms ?? 0;
  const manifest = new Map(
    state.launchManifest.items.map(({ itemId, count }) => [itemId, count]),
  );
  let room = catalogue.launch.payloadMassLimitKilograms;
  for (const [itemId, count] of manifest) room -= massOf(itemId) * count;
  let added = false;
  for (const { itemId, count } of missing) {
    const already = manifest.get(itemId) ?? 0;
    const more = Math.min(count - already, Math.floor(room / massOf(itemId)));
    if (more <= 0) continue;
    room -= more * massOf(itemId);
    manifest.set(itemId, already + more);
    added = true;
  }
  if (added) {
    succeed(
      play.campaign.setLaunchManifest(
        [...manifest].map(([itemId, count]) => ({ itemId, count })),
      ),
      "Putting the Buried Habitat on the Launch manifest",
    );
  }
}

/**
 * Moves the Mission Director into a Buried Habitat as soon as it stands and has
 * power, then dismantles the old Habitat and what is over it, one by one.
 */
function moveIntoBuriedHabitat(play: Play): void {
  const { state } = play;
  const buried = state.structures.find(
    (structure) => structure.structureTypeId === "buried-habitat",
  );
  if (buried?.powered !== true) return;
  const { missionDirector } = state;
  if (
    missionDirector.residence !== "habitat" ||
    missionDirector.habitatId !== buried.id
  ) {
    succeed(
      play.campaign.moveMissionDirectorIn(buried.id),
      "Moving the Mission Director into the Buried Habitat",
    );
    return;
  }
  if (state.dismantlings.length > 0) return;
  for (const structureTypeId of [
    "water-wall",
    "regolith-shielding",
    "habitat",
  ]) {
    const next = state.structures.find(
      (structure) => structure.structureTypeId === structureTypeId,
    );
    if (next !== undefined) {
      succeed(
        play.campaign.dismantleStructure(next.id),
        `Dismantling the old ${structureTypeId}`,
      );
      return;
    }
  }
}

/**
 * What Funding buys from Act 2 on, in the order the guide wants it, each once its
 * Design is unlocked and its Components have come. It holds a good deal more
 * than a base can buy at once, so that it waits for Funding as well as Science.
 */
const PURCHASES: readonly {
  readonly structureTypeId: string;
  readonly site: GroundPosition;
}[] = [
  { structureTypeId: "workshop", site: { x: 66, y: -33 } },
  // The Workshop and what makes its metals want more than two solar arrays.
  { structureTypeId: "solar-array", site: { x: 28, y: -33 } },
  // Metals to spare, to sell, and for the Workshop whatever the first runs for.
  { structureTypeId: "large-extraction-plant", site: { x: 44, y: -44 } },
  // One Workshop's 20 spare Components a Lunation fall short of what this base
  // uses once it grows: with only the one it ran out by Earth Day 530, and its
  // solar arrays wearing out unrepaired killed the Mission Director on 935.
  { structureTypeId: "workshop", site: { x: 74, y: -33 } },
  { structureTypeId: "array-works", site: { x: 54, y: -44 } },
  { structureTypeId: "concentrator-tower", site: { x: 66, y: -14 } },
  { structureTypeId: "cold-trap-ice-line", site: { x: 82, y: -33 } },
  // Act 3's and Act 4's Plants need no more power: the one tower's 100 kW covers
  // them all. A second and third tower drew 0.2 kW each through the Night, which
  // this base's battery banks couldn't carry: the Mission Director died on 1,255.
  { structureTypeId: "propellant-plant", site: { x: 92, y: -33 } },
  { structureTypeId: "large-propellant-plant", site: { x: 104, y: -33 } },
  { structureTypeId: "optics-works", site: { x: 54, y: -56 } },
  { structureTypeId: "grinding-line", site: { x: 44, y: -56 } },
];

/** What the array works makes the guide before it switches it off, and where those arrays go. */
const ARRAYS_FROM_THE_WORKS: readonly GroundPosition[] = [
  { x: 26, y: -24 },
  { x: 26, y: -14 },
];

/** The Funding the guide keeps back, so that supplies can always be paid for. */
const FUNDING_KEPT_MILLION_DOLLARS = 300;

/** The metals the guide keeps from what it sells, for the Workshop and the circuit boards. */
const METALS_KEPT_KILOGRAMS = 40;

/** What a tripled Return Mass comes to. */
const TRIPLED_RETURN_MASS_KILOGRAMS = 300;

/** The propellant the guide keeps from what it sells, to burn. */
const PROPELLANT_KEPT_KILOGRAMS = 400;

/** The propellant it wants in stock, above which the Plants stop making it. */
const PROPELLANT_HELD_KILOGRAMS = 1200;

/** The fewest circuit boards it is worth sending the Lander with. */
const BOARDS_WORTH_A_TRIP_KILOGRAMS = 30;

/** What a Launch manifest line costs, and weighs. */
function launchItem(itemId: string): { price: number; mass: number } {
  const item = catalogue.launch.items.find(({ id }) => id === itemId);
  return {
    price: item?.priceMillionDollars ?? 0,
    mass: item?.massKilograms ?? 0,
  };
}

/**
 * Adds what the base lacks of a Structure to the Launch manifest, as much as its
 * Payload Mass leaves room for beside what is on it, once the Lander is away, if
 * the Funding runs to all of that and the supplies. Otherwise it waits.
 */
function sendForAsFundingAllows(
  play: Play,
  missing: readonly ManifestLine[],
  what: string,
): void {
  const { state } = play;
  if (state.lander.state !== "travelling-to-earth") return;
  const manifest = new Map(
    state.launchManifest.items.map(({ itemId, count }) => [itemId, count]),
  );
  let room = catalogue.launch.payloadMassLimitKilograms;
  for (const [itemId, count] of manifest) {
    room -= launchItem(itemId).mass * count;
  }
  let cost = 0;
  for (const { itemId, count } of missing) {
    const { price, mass } = launchItem(itemId);
    const already = manifest.get(itemId) ?? 0;
    const more = Math.min(count - already, Math.floor(room / mass));
    if (more <= 0) continue;
    room -= more * mass;
    cost += more * price;
    manifest.set(itemId, already + more);
  }
  if (cost === 0) return;
  const paid =
    (state.launchManifest.items.length === 0
      ? catalogue.launch.feeMillionDollars
      : state.launchManifest.costMillionDollars) + cost;
  const funds =
    state.fundingMillionDollars + state.exports.valueAboardMillionDollars;
  if (paid > funds - FUNDING_KEPT_MILLION_DOLLARS) return;
  succeed(
    play.campaign.setLaunchManifest(
      [...manifest].map(([itemId, count]) => ({ itemId, count })),
    ),
    `Putting ${what} on the Launch manifest`,
  );
}

/** Sees to the next of the purchases coming, and builds it once it has. */
function buyInTurn(play: Play): void {
  const { state } = play;
  if (
    state.clock.elapsedMinutes < toGameMinutes({ earthDays: ACT_2_EARTH_DAY })
  ) {
    return;
  }
  const next = PURCHASES.find(({ structureTypeId, site }) => {
    const type = catalogue.structureTypes.find(
      ({ id }) => id === structureTypeId,
    );
    return (
      type !== undefined &&
      state.unlockedDesignIds.includes(type.designId) &&
      ![...state.constructions, ...state.structures].some(
        ({ position }) => position.x === site.x && position.y === site.y,
      )
    );
  });
  if (next === undefined) return;
  const lines = manifestLinesOf(next.structureTypeId);
  const missing = missingFromStock(state, lines);
  if (missing.length === 0) {
    // A Machine or Rover may be standing there for now: it tries again.
    play.campaign.planConstruction({
      structureTypeId: next.structureTypeId,
      position: next.site,
    });
    return;
  }
  sendForAsFundingAllows(play, missing, `a ${next.structureTypeId}`);
}

/** Sets a large extraction plant to metals and silicon, as what the base has it for. */
function runLargeExtractionPlant(play: Play): void {
  const plant = play.state.structures.find(
    ({ structureTypeId }) => structureTypeId === "large-extraction-plant",
  );
  if (plant === undefined || plant.recipeId === "metals-and-silicon") return;
  succeed(
    play.campaign.setPlantRecipe(plant.id, "metals-and-silicon"),
    "Setting the large extraction plant to metals and silicon",
  );
}

/**
 * Has the array works make what two more solar arrays are built from, plans them
 * once it has, and switches it off, as the base then has power enough.
 */
function runArrayWorks(play: Play): void {
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
function loadTheLander(play: Play): void {
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
function runPropellantPlants(play: Play): void {
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
 * Runs the Workshops only as far as the spare Components need them, so that
 * they don't spend metals on more than the base will use for a long time.
 */
function runWorkshops(play: Play): void {
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

/** Unlocks the cheapest Design it can, once the Science is there. */
function unlockEveryDesign(play: Play): void {
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
function checkEverythingResearched(play: Play): void {
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

/** The long-game play guide: the reference Campaign, then each Act's steps in turn. */
export const longGameSteps: readonly PlayStep[] = [
  ...referenceSteps,
  {
    milestoneId: undefined,
    description: `Keep the base going as the reference Campaign's last step does, with a Research Task always running and the cheapest Design unlocked as soon as it can be, until Earth Day ${LONG_GAME_END_EARTH_DAY}. From Earth Day ${ACT_2_EARTH_DAY}, ship and build in turn, as the Science and Funding allow, a Workshop, a third solar array, a large extraction plant set to metals and silicon, a second Workshop, an array works that makes two more solar arrays, a concentrator tower and a cold-trap ice line. Once the Workshop runs stop bringing spare Components by Launch, switching them off while more than ${SPARES_HELD} are in stock, and fill what the circuit boards leave of each Return Mass with metals, or with propellant once it has more than it means to burn. As their Designs are unlocked, ship and build a propellant plant, a large propellant plant, an optics works and a grinding line, and load the optics and circuit boards first, burning propellant to lift all there are. Once, make up a tripled Return Mass with metals. From Earth Day ${BURIED_HABITAT_EARTH_DAY}, send for a Buried Habitat over several Launches, build it early in a Daylight, move the Mission Director in as soon as it has power, and dismantle the old Habitat, with its water wall and shielding, before Night falls.`,
    play(play) {
      play.keepUp(unlockEveryDesign);
      play.keepUp(buyInTurn);
      play.keepUp(runWorkshops);
      play.keepUp(runLargeExtractionPlant);
      play.keepUp(runArrayWorks);
      play.keepUp(loadTheLander);
      play.keepUp(runPropellantPlants);
      play.keepUp(shipBuriedHabitat);
      play.keepUp(moveIntoBuriedHabitat);
      const end = toGameMinutes({ earthDays: LONG_GAME_END_EARTH_DAY });
      play.waitUntil(
        `Earth Day ${LONG_GAME_END_EARTH_DAY}`,
        (state) => state.clock.elapsedMinutes >= end,
        LONGEST_PLAY_ON,
      );
      checkEverythingResearched(play);
    },
  },
];

/** Plays the long-game play guide, as far as it goes. */
export function playLongGame(
  steps: readonly PlayStep[] = longGameSteps,
): ReferenceTimeline {
  return playReferenceCampaign(steps);
}

const MINUTES_PER_EARTH_DAY = toGameMinutes({ earthDays: 1 });

/** The Designs the long-game play guide says it uses, but built nothing of and sent for nothing of. */
export function designsNotUsed(timeline: ReferenceTimeline): string[] {
  const used = new Set([
    ...timeline.structureTypesBuilt.flatMap(
      ({ structureTypeId }) =>
        catalogue.structureTypes.find((type) => type.id === structureTypeId)
          ?.designId ?? [],
    ),
    ...timeline.launchItemsManifested.flatMap(
      (itemId) =>
        catalogue.launch.items.find((item) => item.id === itemId)?.designId ??
        [],
    ),
  ]);
  return designsTheLongGameUses.filter((designId) => !used.has(designId));
}

/**
 * What a Workshop did for the spare Components: when it was commissioned, how
 * many were in stock Lunation by Lunation, and what Launches brought before and
 * after it, as lines of text.
 */
function formatSpares(timeline: ReferenceTimeline): string[] {
  const day = (minute: number) => (minute / MINUTES_PER_EARTH_DAY).toFixed(0);
  const built = timeline.structureTypesBuilt.find(
    ({ structureTypeId }) => structureTypeId === "workshop",
  )?.atMinute;
  const shipped = (
    from: number,
    to: number,
  ): { launches: number; spares: number } => {
    const trips = timeline.sparesShipped.filter(
      ({ atMinute }) => atMinute >= from && atMinute < to,
    );
    return {
      launches: trips.length,
      spares: trips.reduce((total, { count }) => total + count, 0),
    };
  };
  const before = shipped(0, built ?? Infinity);
  const after = shipped(built ?? Infinity, Infinity);
  const since = timeline.sparesInStock.filter(
    ({ atMinute }) => built !== undefined && atMinute > built,
  );
  return [
    "Spare Components, Lunation by Lunation: Earth Day, then in stock (the fewest since the last line):",
    ...timeline.sparesInStock.map(
      ({ atMinute, inStock, fewest }) =>
        `  ${day(atMinute).padStart(6)}  ${inStock} (${fewest})`,
    ),
    built === undefined
      ? "No Workshop was commissioned."
      : `A Workshop was commissioned on Earth Day ${(built / MINUTES_PER_EARTH_DAY).toFixed(1)}. After it the stock was never below ${Math.min(...since.map(({ fewest }) => fewest))}.`,
    `Launches bringing spare Components: ${before.launches}, with ${before.spares}, before a Workshop; ${after.launches}, with ${after.spares}, after it.`,
  ];
}

/**
 * How the Buried Habitat came about, what the Radiation Dose stood at each
 * step, and how fast it rose behind the water wall and after, Solar Particle
 * Events and all, as lines of text.
 */
function formatBuriedHabitat(timeline: ReferenceTimeline): string[] {
  const day = (minute: number) => (minute / MINUTES_PER_EARTH_DAY).toFixed(1);
  const lookAt = (minute: number) =>
    timeline.looks.find(({ atMinute }) => atMinute >= minute) ??
    timeline.looks.at(-1);
  const dose = (minute: number) =>
    `${(lookAt(minute)?.radiationDoseMillisieverts ?? 0).toFixed(1)} mSv`;
  const rate = (from: number, to: number) =>
    (((lookAt(to)?.radiationDoseMillisieverts ?? 0) -
      (lookAt(from)?.radiationDoseMillisieverts ?? 0)) /
      (to - from)) *
    MINUTES_PER_EARTH_DAY;
  const kit = manifestLinesOf("buried-habitat").map(({ itemId }) => itemId);
  const launches = timeline.launchManifests.filter(({ items }) =>
    items.some(({ itemId }) => kit.includes(itemId) && itemId !== "airlock"),
  );
  const built = timeline.structureTypesBuilt.find(
    ({ structureTypeId }) => structureTypeId === "buried-habitat",
  )?.atMinute;
  const moved = timeline.moves.find(
    ({ structureTypeId }) => structureTypeId === "buried-habitat",
  )?.atMinute;
  const rates = catalogue.radiation.doseRateMillisievertsPerEarthDay;
  const { waterWallAtMinute, endMinute } = timeline;
  const firstSent = launches[0]?.atMinute;
  return [
    "The Buried Habitat, and the Radiation Dose at each step:",
    ...launches.map(
      ({ atMinute, items }) =>
        `  Earth Day ${day(atMinute)}, at ${dose(atMinute)}: the Lander left for Earth to bring ${items
          .filter(({ itemId }) => kit.includes(itemId))
          .map(({ itemId, count }) => `${count} ${itemId}`)
          .join(", ")}.`,
    ),
    ...(firstSent === undefined
      ? ["  It was never sent for."]
      : [
          `  Funding as it was first sent for: $${(lookAt(firstSent)?.fundingMillionDollars ?? 0).toFixed(0)}M.`,
        ]),
    built === undefined
      ? "  It was never commissioned."
      : `  Earth Day ${day(built)}, at ${dose(built)}: commissioned.`,
    ...(moved === undefined
      ? ["  The Mission Director never moved in."]
      : [
          `  Earth Day ${day(moved)}, at ${dose(moved)}: the Mission Director moved in.`,
          `  Earth Day ${day(endMinute)}, at ${dose(endMinute)}: the end, the Radiation Dose having risen ${rate(moved, endMinute).toFixed(4)} mSv an Earth Day since they moved in (${(rate(moved, endMinute) / rates.buriedHabitat).toFixed(2)} times the usual rate, for Solar Particle Events).`,
        ]),
    ...(waterWallAtMinute === undefined
      ? []
      : [
          `  Behind the water wall it rose ${rate(waterWallAtMinute, moved ?? endMinute).toFixed(3)} mSv an Earth Day (${(rate(waterWallAtMinute, moved ?? endMinute) / rates.waterWalledHabitat).toFixed(2)} times the usual rate).`,
        ]),
  ];
}

/** The timeline as lines of text, for `npm run long-game`. */
export function formatLongGame(timeline: ReferenceTimeline): string[] {
  const day = (minute: number) =>
    (minute / MINUTES_PER_EARTH_DAY).toFixed(1).padStart(6);
  const { minutesUntilDoseLimit, endMinute } = timeline;
  const limitAt =
    minutesUntilDoseLimit === undefined
      ? undefined
      : endMinute + minutesUntilDoseLimit;
  const notUsed = designsNotUsed(timeline);
  return [
    ...formatTimeline(timeline, "Long-game play guide"),
    "",
    "Research Tasks, by the Earth Day each was completed:",
    ...timeline.researchTasksCompleted.map(
      ({ researchTaskId, atMinute }) =>
        `  ${day(atMinute)}  ${labelOf(catalogue.researchTasks, researchTaskId)}`,
    ),
    "",
    "Designs, by the Earth Day each was unlocked:",
    ...timeline.designsUnlocked.map(
      ({ designId, atMinute }) =>
        `  ${day(atMinute)}  ${labelOf(catalogue.designs, designId)}`,
    ),
    "",
    ...formatSpares(timeline),
    "",
    ...formatAct2(timeline),
    "",
    ...formatFunding(timeline),
    "",
    ...formatBuriedHabitat(timeline),
    "",
    limitAt === undefined
      ? "Forecast: the Radiation Dose isn't rising, so it never reaches the limit."
      : `Forecast: at the rate it was rising as the play guide ended, the Radiation Dose reaches the limit on Earth Day ${(limitAt / MINUTES_PER_EARTH_DAY).toFixed(0)}.`,
    ...(notUsed.length > 0
      ? [
          `The play guide says it uses these Designs, but built and sent for nothing of them: ${notUsed.join(", ")}.`,
        ]
      : []),
  ];
}

/** What the guide's Exports came to in each Act's stretch of game time, by Export. */
function exportsSoldBetween(
  timeline: ReferenceTimeline,
  fromEarthDay: number,
  toEarthDay: number,
): { kilograms: Map<string, number>; earned: number; trips: number } {
  const kilograms = new Map<string, number>();
  let earned = 0;
  let trips = 0;
  for (const sale of timeline.sales) {
    const earthDay = sale.atMinute / MINUTES_PER_EARTH_DAY;
    if (earthDay < fromEarthDay || earthDay >= toEarthDay) continue;
    earned += sale.earnedMillionDollars;
    trips += 1;
    for (const line of sale.sold) {
      kilograms.set(
        line.resourceId,
        (kilograms.get(line.resourceId) ?? 0) + line.kilograms,
      );
    }
  }
  return { kilograms, earned, trips };
}

/** The Funding every 100 Earth Days, and the lowest and highest in Act 2, as lines of text. */
function formatFunding(timeline: ReferenceTimeline): string[] {
  const at = (earthDay: number) =>
    timeline.looks.find(
      ({ atMinute }) => atMinute >= earthDay * MINUTES_PER_EARTH_DAY,
    )?.fundingMillionDollars;
  const curve: string[] = [];
  for (
    let earthDay = 100;
    earthDay <= LONG_GAME_END_EARTH_DAY;
    earthDay += 100
  ) {
    const funding = at(earthDay);
    if (funding !== undefined) {
      curve.push(`  ${String(earthDay).padStart(6)}  $${funding.toFixed(0)}M`);
    }
  }
  const inAct2 = timeline.looks.filter(({ atMinute }) => {
    const earthDay = atMinute / MINUTES_PER_EARTH_DAY;
    return earthDay >= ACT_2_EARTH_DAY && earthDay < ACT_2_END_EARTH_DAY;
  });
  const lowest = inAct2.reduce(
    (low, look) =>
      look.fundingMillionDollars < low.fundingMillionDollars ? look : low,
    inAct2[0] ?? { atMinute: 0, fundingMillionDollars: 0 },
  );
  const sold = exportsSoldBetween(
    timeline,
    ACT_2_EARTH_DAY,
    ACT_2_END_EARTH_DAY,
  );
  const rate = (name: string) => (sold.kilograms.get(name) ?? 0).toFixed(0);
  return [
    "Funding, every 100 Earth Days:",
    ...curve,
    `In Act 2 (Earth Days ${ACT_2_EARTH_DAY} to ${ACT_2_END_EARTH_DAY}) it was lowest at $${lowest.fundingMillionDollars.toFixed(0)}M on Earth Day ${(lowest.atMinute / MINUTES_PER_EARTH_DAY).toFixed(1)}. Exports earned $${sold.earned.toFixed(0)}M over ${sold.trips} trips: ${rate("circuit-boards")} kg of circuit boards and ${rate("metals")} kg of metals.`,
  ];
}

const ACT_2_STRUCTURE_TYPE_IDS: readonly string[] = [
  "workshop",
  "large-extraction-plant",
  "array-works",
  "concentrator-tower",
  "cold-trap-ice-line",
];

/** When each of the Structures Act 2 brings first came. */
function formatAct2(timeline: ReferenceTimeline): string[] {
  const dates = timeline.structureTypesBuilt
    .filter(({ structureTypeId }) =>
      ACT_2_STRUCTURE_TYPE_IDS.includes(structureTypeId),
    )
    .map(
      ({ structureTypeId, atMinute }) =>
        `  ${(atMinute / MINUTES_PER_EARTH_DAY).toFixed(1).padStart(6)}  ${labelOf(catalogue.structureTypes, structureTypeId)}`,
    );
  const missed = act2TargetsMissed(timeline);
  const laterMissed = laterActTargetsMissed(timeline);
  return [
    "Act 2's Structures, by the Earth Day the first of each was commissioned:",
    ...dates,
    ...(missed.length === 0
      ? ["Act 2's pacing targets were all met."]
      : missed.map((target) => `Act 2's pacing target missed: ${target}`)),
    ...(laterMissed.length === 0
      ? ["Act 3's and Act 4's pacing targets were all met."]
      : laterMissed.map(
          (target) => `Later Act's pacing target missed: ${target}`,
        )),
  ];
}

/** Which of Act 2's pacing targets the guide missed, in words. */
export function act2TargetsMissed(timeline: ReferenceTimeline): string[] {
  const reachedOn = (milestoneId: string) => {
    const reached = timeline.milestones.find(
      (milestone) => milestone.milestoneId === milestoneId,
    );
    return reached === undefined
      ? Infinity
      : reached.atMinute / MINUTES_PER_EARTH_DAY;
  };
  const {
    workshopRunningBy,
    sparesNeedNoLaunchBy,
    designsStillToBuyAt,
    researchLastsUntilAbout,
    researchWithin,
    launchesToBuyEverything,
    metalsSoldBy,
  } = act2Targets;
  const lastSpares = Math.max(
    0,
    ...timeline.sparesShipped.map(({ atMinute }) => atMinute),
  );
  const upToAct2 = catalogueUpToAct(catalogue, 2);
  const lastResearch =
    Math.max(
      0,
      ...timeline.researchTasksCompleted
        .filter(({ researchTaskId }) =>
          upToAct2.researchTasks.some(({ id }) => id === researchTaskId),
        )
        .map(({ atMinute }) => atMinute),
    ) / MINUTES_PER_EARTH_DAY;
  const lastDesign =
    Math.max(
      0,
      ...timeline.designsUnlocked
        .filter(({ designId }) =>
          upToAct2.designs.some(({ id }) => id === designId),
        )
        .map(({ atMinute }) => atMinute),
    ) / MINUTES_PER_EARTH_DAY;
  const built = timeline.structureTypesBuilt.find(
    ({ structureTypeId }) => structureTypeId === "workshop",
  )?.atMinute;
  const fewestSpares = Math.min(
    Infinity,
    ...timeline.sparesInStock
      .filter(({ atMinute }) => built !== undefined && atMinute > built)
      .map(({ fewest }) => fewest),
  );
  const launches = launchesToBuyOneOfEverything();
  return [
    ...(reachedOn("workshop-running") <= workshopRunningBy
      ? []
      : [`a Workshop running by Earth Day ${workshopRunningBy}.`]),
    ...(reachedOn("spare-components-self-sufficient") <= sparesNeedNoLaunchBy &&
    lastSpares <= sparesNeedNoLaunchBy * MINUTES_PER_EARTH_DAY
      ? []
      : [
          `spare Components needing no Launch by Earth Day ${sparesNeedNoLaunchBy}.`,
        ]),
    ...(reachedOn("metals-sold") <= metalsSoldBy
      ? []
      : [`metals sold by Earth Day ${metalsSoldBy}.`]),
    ...(lastDesign > designsStillToBuyAt
      ? []
      : [`Designs still to buy at Earth Day ${designsStillToBuyAt}.`]),
    ...(Math.abs(lastResearch - researchLastsUntilAbout) <= researchWithin
      ? []
      : [
          `research lasting until about Earth Day ${researchLastsUntilAbout} (it ended on ${lastResearch.toFixed(0)}).`,
        ]),
    ...(fewestSpares > 0 ? [] : ["spare Components never running out."]),
    ...(launches !== undefined && launches >= launchesToBuyEverything
      ? []
      : [
          `one of every Launch item taking at least ${launchesToBuyEverything} Launches' profit (it takes ${launches ?? "no number of"}).`,
        ]),
  ];
}

/** Which of Act 3's and Act 4's pacing targets the guide missed, in words. */
export function laterActTargetsMissed(timeline: ReferenceTimeline): string[] {
  const reachedOn = (milestoneId: string) => {
    const reached = timeline.milestones.find(
      (milestone) => milestone.milestoneId === milestoneId,
    );
    return reached === undefined
      ? Infinity
      : reached.atMinute / MINUTES_PER_EARTH_DAY;
  };
  const researchEnded = (act: number) =>
    Math.max(
      0,
      ...timeline.researchTasksCompleted
        .filter(({ researchTaskId }) =>
          catalogueUpToAct(catalogue, act).researchTasks.some(
            ({ id }) => id === researchTaskId,
          ),
        )
        .map(({ atMinute }) => atMinute),
    ) / MINUTES_PER_EARTH_DAY;
  const {
    propellantMadeBy,
    returnMassTripledBy,
    act3ResearchUntilAbout,
    act4ResearchUntilAbout,
    researchWithin,
    opticsSoldBy,
  } = laterActTargets;
  const near = (earthDay: number, target: number) =>
    Math.abs(earthDay - target) <= researchWithin;
  return [
    ...(reachedOn("first-propellant") <= propellantMadeBy
      ? []
      : [`propellant made by Earth Day ${propellantMadeBy}.`]),
    ...(reachedOn("return-mass-tripled") <= returnMassTripledBy
      ? []
      : [`Return Mass tripled by Earth Day ${returnMassTripledBy}.`]),
    ...(reachedOn("precision-optics-sold") <= opticsSoldBy
      ? []
      : [`precision optics sold by Earth Day ${opticsSoldBy}.`]),
    ...(near(researchEnded(3), act3ResearchUntilAbout)
      ? []
      : [
          `Act 3's research lasting until about Earth Day ${act3ResearchUntilAbout} (it ended on ${researchEnded(3).toFixed(0)}).`,
        ]),
    ...(near(researchEnded(4), act4ResearchUntilAbout)
      ? []
      : [
          `Act 4's research lasting until about Earth Day ${act4ResearchUntilAbout} (it ended on ${researchEnded(4).toFixed(0)}).`,
        ]),
  ];
}

/** How many Launches' profit, of the Export that makes the most, one of every Launch item takes. */
function launchesToBuyOneOfEverything(): number | undefined {
  const { exports: sold } = exportEconomics(catalogueUpToAct(catalogue, 2));
  return [...sold].sort(
    (a, b) => b.profitMillionDollars - a.profitMillionDollars,
  )[0]?.launchesToBuyEverything;
}

/** Whether the Mission Director moved into a Buried Habitat by the Act's target. */
function movedInByTheTarget(timeline: ReferenceTimeline): boolean {
  return timeline.moves.some(
    ({ atMinute, structureTypeId }) =>
      structureTypeId === "buried-habitat" &&
      atMinute <=
        toGameMinutes({ earthDays: BURIED_HABITAT_MOVED_IN_BY_EARTH_DAY }),
  );
}

/**
 * Whether the long game went as it should, so that the command can fail if it
 * didn't: to the end with the Mission Director alive, having moved in by the
 * Act's target and met Act 2's. Alive at the end, their Radiation Dose's limit
 * is still ahead.
 */
export function longGameSucceeded(timeline: ReferenceTimeline): boolean {
  return (
    timeline.failure === undefined &&
    timeline.ended === undefined &&
    designsNotUsed(timeline).length === 0 &&
    movedInByTheTarget(timeline) &&
    act2TargetsMissed(timeline).length === 0 &&
    laterActTargetsMissed(timeline).length === 0
  );
}
