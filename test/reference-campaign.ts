import { catalogue } from "../src/catalogue";
import {
  createCampaign,
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
// reference-campaign` prints its timeline (see README, "The reference
// Campaign").

/** The seed the reference Campaign always plays. */
export const REFERENCE_SEED = 20261025;

/** One step of the play guide, and the Milestone it serves. */
export interface PlayStep {
  readonly milestoneId: string;
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
    { x: 33, y: -25 },
    { x: 37.5, y: -25 },
    { x: 42, y: -25 },
    { x: 46.5, y: -25 },
  ],
  landingPad: { x: 15, y: -40 },
  secondSolarArray: { x: 36, y: -33 },
  extractionPlant: { x: 44, y: -33 },
  vacuumFabricationPlant: { x: 51, y: -33 },
  waterProcessingPlant: { x: 58, y: -26 },
} as const satisfies Record<string, GroundPosition | readonly GroundPosition[]>;

/** The play guide: what a sensible player does for each Milestone, in order. */
export const referenceSteps: readonly PlayStep[] = [
  {
    milestoneId: "power-storage",
    description:
      "Build the starting solar array and every battery bank in the starting stock east of the landing site, beyond the reach of the Lander's Plume Ejecta.",
    play(play) {
      play.plan("solar-array", site.solarArray);
      for (const position of site.batteryBanks) {
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
      "Put a landing pad, an extraction plant, a vacuum fabrication plant and a second solar array to power them on the Launch manifest, with a tank each of oxygen and water and five spare Components, then send the Lander.",
    play(play) {
      play.setManifest([
        { itemId: "pad-panel", count: 8 },
        { itemId: "pad-beacon", count: 1 },
        { itemId: "extraction-reactor", count: 1 },
        { itemId: "oxygen-separator", count: 1 },
        { itemId: "crystal-furnace", count: 1 },
        { itemId: "wafer-saw", count: 1 },
        { itemId: "solar-panel", count: 2 },
        { itemId: "array-mast", count: 1 },
        { itemId: "oxygen", count: 1 },
        { itemId: "water", count: 1 },
        { itemId: "spare-component", count: 5 },
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
      "Once the Lander is back, plan the landing pad south of the landing site, then the second solar array, the extraction plant and the vacuum fabrication plant beside the base.",
    play(play) {
      play.waitUntil(
        "the Lander back with the first Launch",
        (state) => state.lander.state === "landed-free",
      );
      play.plan("landing-pad", site.landingPad);
      play.plan("solar-array", site.secondSolarArray);
      play.plan("extraction-plant", site.extractionPlant);
      play.plan("vacuum-fabrication-plant", site.vacuumFabricationPlant);
      play.waitForMilestone("landing-pad");
    },
  },
  {
    milestoneId: "first-research-task",
    description:
      "Start the shortest Research Task, and keep one running from then on.",
    play(play) {
      play.keepUp(keepResearching);
      play.waitForMilestone("first-research-task");
    },
  },
  {
    milestoneId: "first-export",
    description:
      "Run the extraction plant for metals and silicon to feed the vacuum fabrication plant until there is a full Return Mass of wafers, load them, send the Lander, and once it is away put a water-processing plant, a tank of oxygen, two of water and five spare Components on the Launch manifest.",
    play(play) {
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
      succeed(play.campaign.sendLander(), "Sending the Lander");
      // What the wafers aboard will sell for counts towards the Funding, so
      // the manifest that spends it is set once they are aboard.
      play.waitUntil(
        "the Lander away with the wafers",
        (state) => state.exports.valueAboardMillionDollars > 0,
      );
      play.setManifest([
        { itemId: "ice-melter", count: 1 },
        { itemId: "water-purifier", count: 1 },
        { itemId: "oxygen", count: 1 },
        { itemId: "water", count: 2 },
        { itemId: "spare-component", count: 5 },
      ]);
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
];

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
function succeed(
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
  return {
    events(events: readonly GameEvent[]) {
      for (const event of events) {
        if (event.kind === "milestone-reached") {
          milestones.push({
            milestoneId: event.milestoneId,
            atMinute: event.atMinute,
          });
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
      funding = lowest(funding, state.fundingMillionDollars, atMinute);
      if (state.radiationDoseMillisieverts > dose.value) {
        dose = { value: state.radiationDoseMillisieverts, atMinute };
      }
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
      };
    },
  };
}

/** The timeline as lines of text, for `npm run reference-campaign`. */
export function formatTimeline(timeline: ReferenceTimeline): string[] {
  const day = (minute: number) =>
    (minute / MINUTES_PER_EARTH_DAY).toFixed(1).padStart(5);
  const on = (extreme: Extreme) =>
    `on Earth Day ${(extreme.atMinute / MINUTES_PER_EARTH_DAY).toFixed(1)}`;
  const money = (millionDollars: number) => `$${millionDollars.toFixed(1)}M`;
  const { margins } = timeline;
  const lines = [
    `Reference Campaign: seed ${timeline.seed}, data catalogue version ${catalogue.version}`,
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
    `The play guide ended on Earth Day ${(timeline.endMinute / MINUTES_PER_EARTH_DAY).toFixed(1)}.`,
  ];
  if (timeline.failure !== undefined) {
    lines.push(`It gave up: ${timeline.failure}`);
  }
  return lines;
}
