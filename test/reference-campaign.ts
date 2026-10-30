import { catalogue } from "../src/catalogue";
import {
  createCampaign,
  lunationMinutes,
  milestoneLabel,
  type Campaign,
  type GameEvent,
  type GroundPosition,
  type ManifestLine,
  type Snapshot,
} from "../src/simulation";
import { toGameMinutes, type Duration } from "./scenario";

// The reference Campaign: a scripted playthrough of the whole first version,
// from the landing to a self-sufficient, export-funded base, through the
// simulation interface alone. It follows only the Milestone guidance, taking
// each Milestone in catalogue order and sending the commands a sensible
// player would, with the upkeep such a player gives the base on the way. It
// plays the real data catalogue from a fixed seed, so it plays out the same
// way every time, and its timeline is what the balancing pass measures the
// numbers by. `reference-campaign.test.ts` checks it; `npm run
// reference-campaign` prints its timeline (see
// docs/reference-campaign.md).

/** The seed the reference Campaign always plays. */
export const REFERENCE_SEED = 20261025;

/** One step of the play guide, and the Milestone it serves. */
export interface PlayStep {
  /** Undefined for keeping the base going after the last Milestone. */
  readonly milestoneId: string | undefined;
  /** What the player does, in the game's words. */
  readonly description: string;
  play(play: Play): void;
}

/** What a step of the play guide sees and does: the Campaign, and a few habits of a player. */
export interface Play {
  readonly campaign: Campaign;
  readonly state: Snapshot;
  /** Plans a Construction, giving up on the Campaign if the placement is refused, and returns its id. */
  plan(structureTypeId: string, position: GroundPosition): string;
  /** Sets the Launch manifest, giving up on the Campaign if it is refused. */
  setManifest(manifest: readonly ManifestLine[]): void;
  /** Lets the game run, an hour at a time, until the condition holds, giving up past the limit. */
  waitUntil(
    what: string,
    done: (state: Snapshot) => boolean,
    limit?: Duration,
  ): void;
  /** Lets the game run until a Milestone is reached. */
  waitForMilestone(milestoneId: string): void;
  /** Lets the game run until a Structure of the type is commissioned, and returns its id. */
  waitForStructure(structureTypeId: string): string;
  /** Something the player does every game-hour from now on, such as keeping a Research Task running. */
  keepUp(habit: (play: Play) => void): void;
}

/** How many Lunations the play guide keeps the base going after the last Milestone. */
export const PLAY_ON_LUNATIONS = 3;

/**
 * The most Lunations the play guide keeps the base going after the last
 * Milestone, waiting for the water wall to have stood a whole Lunation.
 */
const LONGEST_PLAY_ON_LUNATIONS = 8;

/** How long the play guide waits for anything before it gives up. */
const LONGEST_WAIT: Duration = { earthDays: 60 };

/** The game-minutes the play guide lets the game run between looks at it. */
const LOOK_EVERY_MINUTES = 60;

/**
 * Where the base stands: east of the landing site, beyond the reach of the
 * Lander's Plume Ejecta, and the landing pad south of the landing site.
 */
const site = {
  solarArray: { x: 36, y: -12 },
  habitat: { x: 46, y: -12 },
  batteryBanks: [
    { x: 33, y: -20 },
    { x: 37.5, y: -20 },
    { x: 42, y: -20 },
    { x: 46.5, y: -20 },
    { x: 51, y: -20 },
  ],
  landingPad: { x: 15, y: -40 },
  secondSolarArray: { x: 36, y: -33 },
  extractionPlant: { x: 44, y: -33 },
  vacuumFabricationPlant: { x: 51, y: -33 },
  waterProcessingPlant: { x: 58, y: -26 },
  circuitBoardPlant: { x: 58, y: -33 },
} as const satisfies Record<string, GroundPosition | readonly GroundPosition[]>;

/** The play guide: what a sensible player does for each Milestone, in order. */
export const referenceSteps: readonly PlayStep[] = [
  {
    milestoneId: "power-storage",
    description:
      "Build the starting solar array and every battery bank in the starting stock east of the landing site, beyond the reach of the Lander's Plume Ejecta.",
    play(play) {
      play.plan("solar-array", site.solarArray);
      for (const position of site.batteryBanks.slice(
        0,
        batteryBanksInStartingStock(),
      )) {
        play.plan("battery-bank", position);
      }
      play.waitForMilestone("power-storage");
    },
  },
  {
    milestoneId: "moved-in",
    description:
      "Build the inflatable Habitat beside the solar array, wait until every battery bank is commissioned and charged for the Night, then move the Mission Director in.",
    play(play) {
      const habitatId = play.plan("habitat", site.habitat);
      play.waitUntil(
        "the Habitat and battery banks commissioned and charged",
        (state) =>
          state.constructions.length === 0 &&
          state.power.networks.some(
            (network) =>
              network.structureIds.includes(habitatId) &&
              network.storedKilowattHours >=
                network.storageCapacityKilowattHours - 1,
          ),
      );
      succeed(
        play.campaign.moveMissionDirectorIn(habitatId),
        "Moving the Mission Director in",
      );
      play.waitForMilestone("moved-in");
    },
  },
  {
    milestoneId: "lander-departs",
    description:
      "Put a landing pad on the Launch manifest, with two tanks of oxygen, three of water and ten spare Components, then send the Lander.",
    play(play) {
      play.setManifest([
        { itemId: "pad-panel", count: 8 },
        { itemId: "pad-beacon", count: 1 },
        { itemId: "oxygen", count: 2 },
        { itemId: "water", count: 3 },
        { itemId: "spare-component", count: 10 },
      ]);
      succeed(play.campaign.sendLander(), "Sending the Lander");
      play.waitForMilestone("lander-departs");
    },
  },
  {
    milestoneId: "habitat-shielded",
    description:
      "Plan Regolith shielding over the Mission Director's Habitat, and wait for it to be commissioned.",
    play(play) {
      play.plan("regolith-shielding", site.habitat);
      play.waitForMilestone("habitat-shielded");
    },
  },
  {
    milestoneId: "landing-pad",
    description:
      "Once the Lander is back, plan the landing pad south of the landing site.",
    play(play) {
      play.waitUntil(
        "the Lander back with the first Launch",
        (state) => state.lander.state === "landed-free",
      );
      play.plan("landing-pad", site.landingPad);
      play.waitForMilestone("landing-pad");
    },
  },
  {
    milestoneId: "first-research-task",
    description:
      "Start the shortest Research Task, and keep one running from then on; unlock Water-wall shielding once they have paid for it.",
    play(play) {
      play.keepUp(keepResearching);
      play.keepUp(unlockWaterWall);
      play.waitForMilestone("first-research-task");
    },
  },
  {
    milestoneId: "first-export",
    description:
      "Send the Lander for an extraction plant, a vacuum fabrication plant and a second solar array, and plan them beside the base. Run the extraction plant for metals and silicon to feed the vacuum fabrication plant until there is a full Return Mass of wafers, load them, send the Lander, and once it is away put a water-processing plant, a circuit board plant, a tank of oxygen, two of water and fifteen spare Components on the Launch manifest, and water-wall bladders once Water-wall shielding is unlocked, leaving out what the Funding can't run to; build each once it comes.",
    play(play) {
      play.setManifest([
        { itemId: "extraction-reactor", count: 1 },
        { itemId: "oxygen-separator", count: 1 },
        { itemId: "crystal-furnace", count: 1 },
        { itemId: "wafer-saw", count: 1 },
        { itemId: "solar-panel", count: 2 },
        { itemId: "array-mast", count: 1 },
      ]);
      succeed(play.campaign.sendLander(), "Sending the Lander");
      play.plan("solar-array", site.secondSolarArray);
      play.plan("extraction-plant", site.extractionPlant);
      play.plan("vacuum-fabrication-plant", site.vacuumFabricationPlant);
      const extractionId = play.waitForStructure("extraction-plant");
      succeed(
        play.campaign.setPlantRecipe(extractionId, "metals-and-silicon"),
        "Switching the extraction plant to metals and silicon",
      );
      const returnMass = catalogue.lander.returnMassKilograms;
      play.waitUntil(
        "a full Return Mass of wafers",
        (state) =>
          bulkInStock(state, "wafers") >= returnMass &&
          state.lander.state === "landed-free",
      );
      succeed(
        play.campaign.loadExports([
          { resourceId: "wafers", kilograms: returnMass },
        ]),
        "Loading the wafers",
      );
      // On a landing pad, the Robot carries them aboard first.
      play.waitUntil(
        "the wafers aboard the Lander",
        (state) => state.exportLoading === undefined,
      );
      succeed(play.campaign.sendLander(), "Sending the Lander");
      // What the wafers aboard will sell for counts towards the Funding, so
      // the manifest that spends it is set once they are aboard.
      play.waitUntil(
        "the Lander away with the wafers",
        (state) => state.exports.valueAboardMillionDollars > 0,
      );
      const needed: ManifestLine[] = [
        { itemId: "ice-melter", count: 1 },
        { itemId: "water-purifier", count: 1 },
        { itemId: "oxygen", count: 1 },
        { itemId: "water", count: 2 },
        { itemId: "spare-component", count: 15 },
      ];
      setAffordableManifest(play, needed, wantedFromEarth(play.state));
      play.keepUp(buildCircuitBoardPlant);
      play.keepUp(buildWaterWall);
      play.waitForMilestone("first-export");
    },
  },
  {
    milestoneId: "oxygen-self-sufficient",
    description:
      "Switch the extraction plant back to oxygen, and wait until the Plants have made as much oxygen as the Mission Director breathes over a Lunation.",
    play(play) {
      const extractionId = play.waitForStructure("extraction-plant");
      succeed(
        play.campaign.setPlantRecipe(extractionId, "oxygen"),
        "Switching the extraction plant to oxygen",
      );
      play.waitForMilestone("oxygen-self-sufficient");
    },
  },
  {
    milestoneId: "water-self-sufficient",
    description:
      "Once the Lander has brought it, plan the water-processing plant beside the base, send the Rover on an Expedition for water ice, and wait until the Plants have made as much water as the Mission Director drinks over a Lunation.",
    play(play) {
      play.waitUntil(
        "the Lander back with the water-processing plant",
        (state) => state.lander.state === "landed-free",
      );
      play.plan("water-processing-plant", site.waterProcessingPlant);
      succeed(play.campaign.startExpedition(), "Starting an Expedition");
      play.waitForMilestone("water-self-sufficient");
    },
  },
  {
    milestoneId: undefined,
    description: `Keep the base going for at least ${PLAY_ON_LUNATIONS} Lunations, and until a water wall has stood over the Habitat for a whole Lunation: run the extraction plant for oxygen whenever the oxygen runs low and for metals and silicon otherwise; send the Rover for water ice once the ice is used up and the water is getting low, or short of what the water wall needs; send the Lander whenever there is a full Return Mass of circuit boards (or of wafers, before there is a circuit board plant), with oxygen, water and spare Components on the Launch manifest as they are needed, and, as the Funding allows, a circuit board plant if the base has none, then water-wall bladders.`,
    play(play) {
      play.keepUp(balanceOxygen);
      play.keepUp(fetchWaterIce);
      play.keepUp(tradeWithEarth());
      const start = play.state.clock.elapsedMinutes;
      const lunation = lunationMinutes(catalogue.lunation).lunation;
      let walledAt: number | undefined;
      play.waitUntil(
        `${PLAY_ON_LUNATIONS} more Lunations, with a water wall standing for the last`,
        (state) => {
          if (
            walledAt === undefined &&
            habitatOf(state)?.waterWalled === true
          ) {
            walledAt = state.clock.elapsedMinutes;
          }
          const now = state.clock.elapsedMinutes;
          return (
            now >= start + PLAY_ON_LUNATIONS * lunation &&
            walledAt !== undefined &&
            now >= walledAt + lunation
          );
        },
        { earthDays: LONGEST_PLAY_ON_LUNATIONS * 30 },
      );
    },
  },
];

/** How many battery banks the starting stock holds the Components for. */
function batteryBanksInStartingStock(): number {
  const bank = catalogue.structureTypes.find(
    (type) => type.id === "battery-bank",
  );
  return Math.min(
    ...(bank?.components ?? []).map((need) =>
      Math.floor(
        (catalogue.startingStock.find(
          (stock) => stock.componentId === need.componentId,
        )?.count ?? 0) / need.count,
      ),
    ),
  );
}

function habitatOf(
  state: Snapshot,
): Snapshot["structures"][number] | undefined {
  return state.structures.find(
    (structure) =>
      structure.structureTypeId === "habitat" ||
      structure.structureTypeId === "hardened-habitat",
  );
}

/** The water wall, as the data catalogue has it. */
const waterWall = catalogue.structureTypes.find(
  (type) => type.waterWall !== undefined,
);

/** The Launch items that make a water wall: its bladders. */
const waterWallBladders: readonly ManifestLine[] = (
  waterWall?.components ?? []
).map((need) => ({ itemId: need.componentId, count: need.count }));

/** Unlocks the water wall's Design once the Research Tasks have paid for it. */
function unlockWaterWall(play: Play): void {
  const design = catalogue.designs.find(
    (candidate) => candidate.id === waterWall?.designId,
  );
  const { state } = play;
  if (
    design === undefined ||
    state.unlockedDesignIds.includes(design.id) ||
    state.science < design.scienceCost
  ) {
    return;
  }
  succeed(play.campaign.unlockDesign(design.id), `Unlocking ${design.label}`);
}

/** Plans the water wall over the Habitat once its bladders are in stock. */
function buildWaterWall(play: Play): void {
  const { state } = play;
  if (
    waterWall === undefined ||
    isPlannedOrBuilt(state, waterWall.id) ||
    !hasInStock(state, waterWallBladders)
  ) {
    return;
  }
  play.plan(waterWall.id, site.habitat);
}

/**
 * What the base still wants to ship, most wanted first, as the Funding
 * allows: a circuit board plant, then a water wall's bladders once its
 * Design is unlocked.
 */
function wantedFromEarth(state: Snapshot): (readonly ManifestLine[])[] {
  const wanted: (readonly ManifestLine[])[] = [];
  if (!isPlannedOrBuilt(state, "circuit-board-plant")) {
    wanted.push(circuitBoardPlant);
  }
  if (
    waterWall !== undefined &&
    state.unlockedDesignIds.includes(waterWall.designId) &&
    !isPlannedOrBuilt(state, waterWall.id) &&
    !hasInStock(state, waterWallBladders)
  ) {
    wanted.push(waterWallBladders);
  }
  return wanted;
}

function hasInStock(state: Snapshot, lines: readonly ManifestLine[]): boolean {
  return lines.every(
    (line) =>
      (state.stockpile.components.find(
        (stock) => stock.componentId === line.itemId,
      )?.count ?? 0) >= line.count,
  );
}

/**
 * The water the base keeps on hand: enough, once the water ice is used up,
 * to send the Rover for more; more while a water wall waits to be filled.
 */
function waterWanted(state: Snapshot): number {
  const rules = waterWall?.waterWall;
  const fillingWall =
    rules !== undefined &&
    state.constructions.some(
      (construction) => construction.structureTypeId === waterWall?.id,
    );
  if (!fillingWall) return WATER_LOW_KILOGRAMS;
  const use =
    catalogue.lifeSupportStocks.find((stock) => stock.id === rules.stockId)
      ?.usePerEarthDayKilograms ?? 0;
  return WATER_LOW_KILOGRAMS + rules.kilograms + rules.reserveEarthDays * use;
}

/** The Launch items that make a circuit board plant. */
const circuitBoardPlant: readonly ManifestLine[] = [
  { itemId: "circuit-etcher", count: 1 },
  { itemId: "reflow-oven", count: 1 },
];

/**
 * Sets the Launch manifest to what is needed and as much of what is wanted,
 * most wanted first, as the Funding runs to.
 */
function setAffordableManifest(
  play: Play,
  needed: readonly ManifestLine[],
  wanted: readonly (readonly ManifestLine[])[],
): void {
  for (let count = wanted.length; count > 0; count--) {
    const manifest = [...needed, ...wanted.slice(0, count).flat()];
    if (play.campaign.setLaunchManifest(manifest).ok) return;
  }
  play.setManifest(needed);
}

function isPlannedOrBuilt(state: Snapshot, structureTypeId: string): boolean {
  return [...state.constructions, ...state.structures].some(
    (structure) => structure.structureTypeId === structureTypeId,
  );
}

/** Builds the circuit board plant beside the base once its Components are in stock. */
function buildCircuitBoardPlant(play: Play): void {
  const { state } = play;
  if (
    isPlannedOrBuilt(state, "circuit-board-plant") ||
    !hasInStock(state, circuitBoardPlant)
  ) {
    return;
  }
  play.plan("circuit-board-plant", site.circuitBoardPlant);
}

/**
 * The oxygen in stock below which the extraction plant runs for oxygen, and
 * above which it goes back to metals and silicon.
 */
const OXYGEN_LOW_KILOGRAMS = 30;
const OXYGEN_HIGH_KILOGRAMS = 45;

/**
 * Runs the extraction plant for oxygen while the oxygen is low, and for
 * metals and silicon, for the wafers and circuit boards, once there is
 * plenty again.
 */
function balanceOxygen(play: Play): void {
  const { state } = play;
  const plant = state.structures.find(
    (structure) => structure.structureTypeId === "extraction-plant",
  );
  if (plant === undefined) return;
  const oxygen = lifeSupportInStock(state, "oxygen");
  const recipeId =
    oxygen < OXYGEN_LOW_KILOGRAMS
      ? "oxygen"
      : oxygen > OXYGEN_HIGH_KILOGRAMS
        ? "metals-and-silicon"
        : plant.recipeId;
  if (recipeId === undefined || recipeId === plant.recipeId) return;
  succeed(
    play.campaign.setPlantRecipe(plant.id, recipeId),
    "Switching the extraction plant's recipe",
  );
}

/** The water in stock below which, with the water ice used up, the Rover goes for more. */
const WATER_LOW_KILOGRAMS = 120;

/** Sends the Rover for water ice once the last is used up and the water is getting low. */
function fetchWaterIce(play: Play): void {
  const { state } = play;
  if (
    state.expedition !== undefined ||
    bulkInStock(state, "water-ice") > 0 ||
    lifeSupportInStock(state, "water") >= waterWanted(state) ||
    state.rovers.every((rover) => rover.conditionPercent <= 0)
  ) {
    return;
  }
  succeed(play.campaign.startExpedition(), "Starting an Expedition");
}

/** The spare Components the player keeps in stock, topping them up by Launch. */
const SPARES_KEPT = 30;

/**
 * Sends the Lander with a full Return Mass of the most valuable Export the
 * base makes, and once it is away sets the Launch manifest: oxygen and water
 * if they are low, spare Components up to the number kept, and a circuit
 * board plant if the base has none and the Funding runs to it.
 */
function tradeWithEarth(): (play: Play) => void {
  let manifestSetOnTrip: number | undefined;
  return (play) => {
    const { state } = play;
    const returnMass = catalogue.lander.returnMassKilograms;
    const boards = isPlannedOrBuilt(state, "circuit-board-plant");
    const exportId = boards ? "circuit-boards" : "wafers";
    if (state.lander.state === "landed-free") {
      const loading =
        state.exports.toLoad.length > 0 || state.exports.aboard.length > 0;
      if (!loading && bulkInStock(state, exportId) >= returnMass) {
        succeed(
          play.campaign.loadExports([
            { resourceId: exportId, kilograms: returnMass },
          ]),
          "Loading the Exports",
        );
        return;
      }
      if (loading && state.exportLoading === undefined) {
        succeed(play.campaign.sendLander(), "Sending the Lander");
      }
      return;
    }
    const trip = state.lander.legStartedAtMinute;
    if (
      state.lander.state !== "travelling-to-earth" ||
      trip === undefined ||
      manifestSetOnTrip === trip
    ) {
      return;
    }
    manifestSetOnTrip = trip;
    const needed: ManifestLine[] = [];
    if (lifeSupportInStock(state, "oxygen") < OXYGEN_LOW_KILOGRAMS) {
      needed.push({ itemId: "oxygen", count: 1 });
    }
    if (lifeSupportInStock(state, "water") < WATER_LOW_KILOGRAMS) {
      needed.push({ itemId: "water", count: 2 });
    }
    const spares =
      state.stockpile.components.find(
        (stock) => stock.componentId === catalogue.maintenance.spareComponentId,
      )?.count ?? 0;
    if (spares < SPARES_KEPT) {
      needed.push({
        itemId: catalogue.maintenance.spareComponentId,
        count: SPARES_KEPT - spares,
      });
    }
    setAffordableManifest(play, needed, wantedFromEarth(state));
  };
}

function lifeSupportInStock(state: Snapshot, stockId: string): number {
  return (
    state.lifeSupport.find((stock) => stock.stockId === stockId)?.kilograms ?? 0
  );
}

/** Keeps a Research Task running: the shortest on offer that isn't done yet. */
function keepResearching(play: Play): void {
  const { state } = play;
  if (state.researchTask !== undefined) return;
  const next = catalogue.researchTasks
    .filter(
      (task) =>
        !state.completedResearchTaskIds.includes(task.id) &&
        (task.requiresDesignId === undefined ||
          state.unlockedDesignIds.includes(task.requiresDesignId)),
    )
    .sort((a, b) => a.lengthHours - b.lengthHours)[0];
  if (next === undefined) return;
  succeed(
    play.campaign.startResearchTask(next.id),
    `Starting the ${next.label}`,
  );
}

/** Gives up on the Campaign if a command was refused, saying what was refused and why. */
export function succeed(
  result: { readonly ok: true } | { readonly ok: false; message: string },
  what: string,
): void {
  if (!result.ok) throw new Error(`${what} was refused: ${result.message}`);
}

function bulkInStock(state: Snapshot, resourceId: string): number {
  return (
    state.bulkResources.find((stock) => stock.resourceId === resourceId)
      ?.kilograms ?? 0
  );
}

/** The lowest or highest a quantity came to, and the game-minute it did. */
export interface Extreme {
  readonly value: number;
  readonly atMinute: number;
}

/** When each Milestone was reached, the money in and out, and how close the Campaign came to the edge. */
export interface ReferenceTimeline {
  readonly seed: number;
  /** The Milestones reached, in the order they were. */
  readonly milestones: readonly {
    readonly milestoneId: string;
    readonly atMinute: number;
  }[];
  /** The game-minute the play guide finished, or gave up. */
  readonly endMinute: number;
  /** Why the play guide gave up, if it did. */
  readonly failure: string | undefined;
  /** How the Campaign ended, if the Mission Director died. */
  readonly ended: Snapshot["ended"];
  /** Every Launch, as the Lander left Earth, and what it cost. */
  readonly launches: readonly {
    readonly atMinute: number;
    readonly chargedMillionDollars: number;
  }[];
  /** Every sale of Exports, as the Lander reached Earth with some aboard. */
  readonly sales: readonly {
    readonly atMinute: number;
    readonly earnedMillionDollars: number;
  }[];
  readonly margins: {
    /**
     * For each life support stock, in catalogue order: the least there was,
     * and the fewest Earth Days it would have lasted at the rate it was
     * falling, by the forecast, while the Mission Director lived in the
     * Habitat.
     */
    readonly lifeSupport: readonly {
      readonly stockId: string;
      readonly lowestKilograms: Extreme;
      readonly fewestEarthDaysLeft: Extreme | undefined;
    }[];
    /**
     * While the Mission Director lived in the Habitat: the shortest time
     * until it would lose power, by the forecast, which looks a few
     * Lunations ahead (none if it never foresaw a loss), and the least
     * energy stored on its power network, which comes as a Night ends.
     */
    readonly habitatPower: {
      readonly fewestHoursLeft: Extreme | undefined;
      readonly lowestStoredKilowattHours: Extreme | undefined;
    };
    readonly lowestFundingMillionDollars: Extreme;
    /** The Radiation Dose only ever rises, so the highest is the last. */
    readonly highestRadiationDoseMillisieverts: Extreme;
  };
  /**
   * How fast the Radiation Dose rose over the last Lunation played, Solar
   * Particle Events and all, and how many Earth Days it would take at that
   * rate to reach the limit from where it ended.
   */
  readonly radiationDoseAtEnd: DoseRate;
  /** The game-minute the water wall over the Habitat was commissioned, if it was. */
  readonly waterWallAtMinute: number | undefined;
  /**
   * How fast the Radiation Dose rose over the Lunation before the water
   * wall was commissioned, under Regolith shielding alone, and how many
   * Earth Days it would take at that rate to reach the limit from where it
   * ended: what the Mission Director would face without the water wall.
   * Undefined if there was no water wall.
   */
  readonly radiationDoseWithoutWaterWall: DoseRate | undefined;
  /** The Funding balance as the play guide ended. */
  readonly fundingAtEndMillionDollars: number;
  /** Each Research Task completed, in the order they were. */
  readonly researchTasksCompleted: readonly {
    readonly researchTaskId: string;
    readonly atMinute: number;
  }[];
  /** Each Design unlocked, in the order they were. */
  readonly designsUnlocked: readonly {
    readonly designId: string;
    readonly atMinute: number;
  }[];
  /** Each Launch item ever put on the Launch manifest. */
  readonly launchItemsManifested: readonly string[];
  /** Each Structure type commissioned at least once, the first time it was. */
  readonly structureTypesBuilt: readonly {
    readonly structureTypeId: string;
    readonly atMinute: number;
  }[];
  /**
   * The game's own forecast, as the play guide ended, of the game-minutes
   * until the Radiation Dose reaches the limit: undefined if it isn't rising.
   */
  readonly minutesUntilDoseLimit: number | undefined;
}

/**
 * A rate the Radiation Dose rose at, in millisieverts an Earth Day, and the
 * Earth Days it would take at that rate to reach the limit from where the
 * Campaign ended: undefined if it didn't rise.
 */
export interface DoseRate {
  readonly millisievertsPerEarthDay: number;
  readonly earthDaysUntilLimit: number | undefined;
}

/** Plays the reference Campaign from a fresh Campaign to the end of the play guide, or until it gives up. */
export function playReferenceCampaign(
  steps: readonly PlayStep[] = referenceSteps,
): ReferenceTimeline {
  const campaign = createCampaign({ seed: REFERENCE_SEED });
  const record = recorder(campaign);
  const habits: ((play: Play) => void)[] = [];
  const play: Play = {
    campaign,
    get state() {
      return campaign.snapshot();
    },
    plan(structureTypeId, position) {
      const result = campaign.planConstruction({ structureTypeId, position });
      succeed(result, `Planning a ${structureTypeId}`);
      return result.ok ? result.constructionId : "";
    },
    setManifest(manifest) {
      succeed(campaign.setLaunchManifest(manifest), "The Launch manifest");
    },
    waitUntil(what, done, limit = LONGEST_WAIT) {
      const until =
        campaign.snapshot().clock.elapsedMinutes + toGameMinutes(limit);
      for (;;) {
        for (const habit of habits) habit(play);
        const state = campaign.snapshot();
        if (done(state)) return;
        if (state.clock.elapsedMinutes >= until) {
          throw new Error(`Waited too long for ${what}.`);
        }
        record.events(campaign.advance(LOOK_EVERY_MINUTES));
        const after = campaign.snapshot();
        if (after.ended !== undefined) {
          throw new Error(
            `The Mission Director died waiting for ${what}: ${after.ended.cause.kind}.`,
          );
        }
        record.margins(after);
      }
    },
    waitForMilestone(milestoneId) {
      play.waitUntil(
        `the Milestone "${milestoneLabel(milestoneId)}"`,
        (state) => state.milestones.reachedIds.includes(milestoneId),
      );
    },
    waitForStructure(structureTypeId) {
      let id: string | undefined;
      play.waitUntil(`a ${structureTypeId} commissioned`, (state) => {
        id = state.structures.find(
          (structure) => structure.structureTypeId === structureTypeId,
        )?.id;
        return id !== undefined;
      });
      return id ?? "";
    },
    keepUp(habit) {
      habits.push(habit);
    },
  };
  let failure: string | undefined;
  try {
    for (const step of steps) step.play(play);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  return record.timeline(failure);
}

const MINUTES_PER_EARTH_DAY = toGameMinutes({ earthDays: 1 });

/** Keeps the timeline as the Campaign plays out. */
function recorder(campaign: Campaign) {
  const milestones: { milestoneId: string; atMinute: number }[] = [];
  const launches: { atMinute: number; chargedMillionDollars: number }[] = [];
  const sales: { atMinute: number; earnedMillionDollars: number }[] = [];
  const lowest = (
    current: Extreme | undefined,
    value: number,
    atMinute: number,
  ): Extreme =>
    current === undefined || value < current.value
      ? { value, atMinute }
      : current;
  const start = campaign.snapshot();
  const lifeSupport = new Map<
    string,
    { kilograms: Extreme; earthDaysLeft: Extreme | undefined }
  >(
    start.lifeSupport.map((stock) => [
      stock.stockId,
      {
        kilograms: { value: stock.kilograms, atMinute: 0 },
        earthDaysLeft: undefined,
      },
    ]),
  );
  let hoursLeft: Extreme | undefined;
  let stored: Extreme | undefined;
  let funding: Extreme = { value: start.fundingMillionDollars, atMinute: 0 };
  let dose: Extreme = { value: start.radiationDoseMillisieverts, atMinute: 0 };
  const doses: Extreme[] = [dose];
  let waterWallAtMinute: number | undefined;
  const researchTasksCompleted: {
    researchTaskId: string;
    atMinute: number;
  }[] = [];
  const designsUnlocked: { designId: string; atMinute: number }[] = [];
  const launchItemsManifested = new Set<string>();
  const structureTypesBuilt: { structureTypeId: string; atMinute: number }[] =
    [];
  return {
    events(events: readonly GameEvent[]) {
      for (const event of events) {
        if (event.kind === "research-task-completed") {
          researchTasksCompleted.push({
            researchTaskId: event.researchTaskId,
            atMinute: event.atMinute,
          });
        }
        if (
          event.kind === "construction-completed" &&
          !structureTypesBuilt.some(
            (built) => built.structureTypeId === event.structureTypeId,
          )
        ) {
          structureTypesBuilt.push({
            structureTypeId: event.structureTypeId,
            atMinute: event.atMinute,
          });
        }
        if (event.kind === "milestone-reached") {
          milestones.push({
            milestoneId: event.milestoneId,
            atMinute: event.atMinute,
          });
        } else if (
          event.kind === "construction-completed" &&
          event.structureTypeId === waterWall?.id
        ) {
          waterWallAtMinute ??= event.atMinute;
        } else if (event.kind === "lander-left-earth") {
          launches.push({
            atMinute: event.atMinute,
            chargedMillionDollars: event.chargedMillionDollars,
          });
        } else if (
          event.kind === "lander-reached-earth" &&
          event.sold.length > 0
        ) {
          sales.push({
            atMinute: event.atMinute,
            earnedMillionDollars: event.earnedMillionDollars,
          });
        }
      }
    },
    margins(state: Snapshot) {
      const atMinute = state.clock.elapsedMinutes;
      for (const { itemId } of state.launchManifest.items) {
        launchItemsManifested.add(itemId);
      }
      // Unlocking is a command, which brings no event from advancing the game.
      for (const designId of state.unlockedDesignIds) {
        if (
          !start.unlockedDesignIds.includes(designId) &&
          !designsUnlocked.some((unlocked) => unlocked.designId === designId)
        ) {
          designsUnlocked.push({ designId, atMinute });
        }
      }
      funding = lowest(funding, state.fundingMillionDollars, atMinute);
      if (state.radiationDoseMillisieverts > dose.value) {
        dose = { value: state.radiationDoseMillisieverts, atMinute };
      }
      doses.push({ value: state.radiationDoseMillisieverts, atMinute });
      const { missionDirector } = state;
      if (missionDirector.residence !== "habitat") return;
      const forecasts = campaign.forecasts();
      for (const stock of state.lifeSupport) {
        const kept = lifeSupport.get(stock.stockId);
        if (kept === undefined) continue;
        kept.kilograms = lowest(kept.kilograms, stock.kilograms, atMinute);
        const left = forecasts.lifeSupport.find(
          (forecast) => forecast.stockId === stock.stockId,
        )?.minutesUntilEmpty;
        if (left !== undefined) {
          kept.earthDaysLeft = lowest(
            kept.earthDaysLeft,
            left / MINUTES_PER_EARTH_DAY,
            atMinute,
          );
        }
      }
      const lost = forecasts.habitatPower?.minutesUntilPowerLost;
      if (lost !== undefined)
        hoursLeft = lowest(hoursLeft, lost / 60, atMinute);
      const network = state.power.networks.find((candidate) =>
        candidate.structureIds.includes(missionDirector.habitatId),
      );
      if (network !== undefined) {
        stored = lowest(stored, network.storedKilowattHours, atMinute);
      }
    },
    timeline(failure: string | undefined): ReferenceTimeline {
      const state = campaign.snapshot();
      const end = state.clock.elapsedMinutes;
      const lunation = lunationMinutes(catalogue.lunation).lunation;
      /** The dose rate over the Lunation up to a game-minute, and the limit at that rate from where the Campaign ended. */
      const rateUpTo = (until: number): DoseRate => {
        const from =
          doses.find((sample) => sample.atMinute >= until - lunation) ?? dose;
        const to =
          [...doses].reverse().find((sample) => sample.atMinute <= until) ??
          dose;
        const perEarthDay =
          to.atMinute > from.atMinute
            ? ((to.value - from.value) / (to.atMinute - from.atMinute)) *
              MINUTES_PER_EARTH_DAY
            : 0;
        return {
          millisievertsPerEarthDay: perEarthDay,
          earthDaysUntilLimit:
            perEarthDay > 0
              ? (catalogue.radiation.doseLimitMillisieverts -
                  state.radiationDoseMillisieverts) /
                perEarthDay
              : undefined,
        };
      };
      return {
        seed: REFERENCE_SEED,
        milestones,
        endMinute: state.clock.elapsedMinutes,
        failure,
        ended: state.ended,
        launches,
        sales,
        margins: {
          lifeSupport: [...lifeSupport].map(([stockId, kept]) => ({
            stockId,
            lowestKilograms: kept.kilograms,
            fewestEarthDaysLeft: kept.earthDaysLeft,
          })),
          habitatPower: {
            fewestHoursLeft: hoursLeft,
            lowestStoredKilowattHours: stored,
          },
          lowestFundingMillionDollars: funding,
          highestRadiationDoseMillisieverts: dose,
        },
        radiationDoseAtEnd: rateUpTo(end),
        waterWallAtMinute,
        radiationDoseWithoutWaterWall:
          waterWallAtMinute === undefined
            ? undefined
            : rateUpTo(waterWallAtMinute),
        fundingAtEndMillionDollars: state.fundingMillionDollars,
        researchTasksCompleted,
        designsUnlocked,
        launchItemsManifested: [...launchItemsManifested],
        structureTypesBuilt,
        minutesUntilDoseLimit:
          campaign.forecasts().radiationDose.minutesUntilLimit,
      };
    },
  };
}

/** Says how fast the Radiation Dose rose, and how soon it would reach the limit from where the Campaign ended at that rate. */
function describeRate(over: string, rate: DoseRate): string {
  const { millisievertsPerEarthDay, earthDaysUntilLimit } = rate;
  return earthDaysUntilLimit === undefined
    ? `${over} the Radiation Dose didn't rise.`
    : `${over} the Radiation Dose rose ${millisievertsPerEarthDay.toFixed(2)} mSv an Earth Day; at that rate it would reach the limit from where it ended in ${earthDaysUntilLimit.toFixed(0)} Earth Days (${(earthDaysUntilLimit / 365.25).toFixed(1)} years).`;
}

/** The timeline as lines of text, for `npm run reference-campaign`. */
export function formatTimeline(
  timeline: ReferenceTimeline,
  title = "Reference Campaign",
): string[] {
  const day = (minute: number) =>
    (minute / MINUTES_PER_EARTH_DAY).toFixed(1).padStart(5);
  const on = (extreme: Extreme) =>
    `on Earth Day ${(extreme.atMinute / MINUTES_PER_EARTH_DAY).toFixed(1)}`;
  const money = (millionDollars: number) => `$${millionDollars.toFixed(1)}M`;
  const { margins } = timeline;
  const lines = [
    `${title}: seed ${timeline.seed}, data catalogue version ${catalogue.version}`,
    "",
    "Milestones, by the Earth Day they were reached (game time since the landing):",
    ...catalogue.milestones.map((milestone) => {
      const reached = timeline.milestones.find(
        (candidate) => candidate.milestoneId === milestone.id,
      );
      return reached === undefined
        ? `  ${"-".padStart(5)}  ${milestone.label} (not reached)`
        : `  ${day(reached.atMinute)}  ${milestone.label}`;
    }),
    "",
    "Launches, as the Lander left Earth, and Export sales, as it reached Earth:",
    ...[
      ...timeline.launches.map((launch) => ({
        atMinute: launch.atMinute,
        text: `Launch paid for  ${money(launch.chargedMillionDollars)}`,
      })),
      ...timeline.sales.map((sale) => ({
        atMinute: sale.atMinute,
        text: `Exports sold for ${money(sale.earnedMillionDollars)}`,
      })),
    ]
      .sort((a, b) => a.atMinute - b.atMinute)
      .map((line) => `  ${day(line.atMinute)}  ${line.text}`),
    "",
    "Margins, the closest the Campaign came to the edge:",
    ...margins.lifeSupport.map((stock) => {
      const label =
        catalogue.lifeSupportStocks.find((entry) => entry.id === stock.stockId)
          ?.label ?? stock.stockId;
      const daysLeft = stock.fewestEarthDaysLeft;
      return `  ${label}: lowest stock ${stock.lowestKilograms.value.toFixed(1)} kg ${on(stock.lowestKilograms)}; ${
        daysLeft === undefined
          ? "never falling"
          : `fewest Earth Days left at the rate it was falling ${daysLeft.value.toFixed(1)}, ${on(daysLeft)}`
      }.`;
    }),
    (() => {
      const { fewestHoursLeft, lowestStoredKilowattHours } =
        margins.habitatPower;
      const forecast =
        fewestHoursLeft === undefined
          ? "never forecast to fail within the forecast's few Lunations"
          : `shortest forecast time until it would fail ${fewestHoursLeft.value.toFixed(1)} hours, ${on(fewestHoursLeft)}`;
      const storedText =
        lowestStoredKilowattHours === undefined
          ? "no stored energy"
          : `least energy stored on its network ${lowestStoredKilowattHours.value.toFixed(1)} kWh, ${on(lowestStoredKilowattHours)}`;
      return `  Habitat power: ${forecast}; ${storedText}.`;
    })(),
    `  Funding: lowest balance ${money(margins.lowestFundingMillionDollars.value)} ${on(margins.lowestFundingMillionDollars)}.`,
    `  Radiation Dose: highest ${margins.highestRadiationDoseMillisieverts.value.toFixed(1)} mSv of the ${catalogue.radiation.doseLimitMillisieverts} mSv limit, ${on(margins.highestRadiationDoseMillisieverts)}.`,
    "  (Oxygen, water and Habitat power count only while the Mission Director lives in the Habitat.)",
    "",
    `The play guide ended on Earth Day ${(timeline.endMinute / MINUTES_PER_EARTH_DAY).toFixed(1)}, with ${money(timeline.fundingAtEndMillionDollars)} of Funding.`,
    timeline.waterWallAtMinute === undefined
      ? "No water wall was built."
      : `The water wall over the Habitat was commissioned on Earth Day ${(timeline.waterWallAtMinute / MINUTES_PER_EARTH_DAY).toFixed(1)}.`,
    describeRate(
      "Over the play guide's last Lunation",
      timeline.radiationDoseAtEnd,
    ),
    ...(timeline.radiationDoseWithoutWaterWall === undefined
      ? []
      : [
          describeRate(
            "Over the Lunation before the water wall, under Regolith shielding alone,",
            timeline.radiationDoseWithoutWaterWall,
          ),
        ]),
  ];
  if (timeline.failure !== undefined) {
    lines.push(`It gave up: ${timeline.failure}`);
  }
  return lines;
}
