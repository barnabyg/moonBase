import { workingTanks } from "./storage-limits";
import { tanksWithoutPower, watchTanks } from "./storage-tanks";
import { catalogue, inSentence } from "../catalogue";
import { cancelConstruction, type CancelResult } from "./cancel";
import {
  startingBulkResources,
  type BulkResourceState,
} from "./bulk-resources";
import {
  forecastBulkResources,
  type BulkResourceForecast,
} from "./bulk-forecast";
import { planExportLoading, type ExportLoadingState } from "./export-loading";
import {
  loadExports,
  type ExportLine,
  type LoadExportsResult,
} from "./exports";
import { wearStructures } from "./condition";
import { coatSolarArrays } from "./dust-coating";
import {
  dismantleStructure,
  type DismantleResult,
  type DismantlingState,
} from "./dismantling";
import {
  checkPlacement,
  chooseWorkSpot,
  findStructureType,
  type ConstructionPlan,
  type ConstructionState,
  type PlacementCheck,
  type PlacementRefusal,
  type StructureState,
} from "./construction";
import type { DeathCause, GameEvent } from "./events";
import {
  forecastHabitatPower,
  type EndOfMinutePowerForecast,
  minutesUntilPowerLostAsMinuteStarts,
  watchHabitatPower,
  type HabitatPowerForecast,
} from "./habitat-power";
import {
  forecastLifeSupport,
  startingLifeSupport,
  useLifeSupport,
  type LifeSupportForecast,
  type LifeSupportState,
} from "./life-support";
import {
  flyLander,
  sendLander,
  type LanderState,
  type SendLanderResult,
} from "./lander";
import {
  dropRetiredItems,
  setLaunchManifest,
  type ManifestLine,
  type ManifestResult,
} from "./launch-manifest";
import { watchMilestones } from "./milestones";
import {
  moveMissionDirectorIn,
  type MissionDirectorResidence,
  type MoveInResult,
} from "./mission-director";
import { lunationMinutes, readLunation } from "./lunation";
import { chillDriven } from "./driven";
import {
  startExpedition,
  type ExpeditionState,
  type StartExpeditionResult,
} from "./expeditions";
import { workMachines, type MachineState } from "./machines";
import {
  nightLoadsSavingPower,
  minutesUntilEmpty,
  powerNetworks,
  supplyPower,
  watchLights,
  type CableState,
} from "./power";
import {
  absorbRadiationDose,
  forecastRadiationDose,
  minutesUntilLimitAsMinuteStarts,
  type RadiationDoseForecast,
} from "./radiation";
import { planMaintenance, type MaintenanceState } from "./maintenance";
import {
  scheduleMicrometeorite,
  watchMicrometeorites,
  type MicrometeoriteState,
} from "./micrometeorites";
import { planParking, type ParkingState } from "./parking";
import {
  runPlants,
  setPlantRecipe,
  switchPlant,
  type SetRecipeResult,
  type PlantSwitchSetting,
  type SwitchPlantResult,
} from "./plants";
import { seedRandom, type RandomState } from "./random";
import {
  queueResearchTask,
  removeQueuedResearchTask,
  runResearch,
  type ResearchTaskState,
  type QueueResearchTaskResult,
  type RemoveQueuedResearchTaskResult,
} from "./research";
import { runObservingProgramme } from "./observing";
import { runGreenhouses } from "./greenhouses";
import { readSaveDocument, writeSaveDocument, type LoadRefusal } from "./save";
import {
  designLabel,
  isDesignUnlocked,
  startingDesignIds,
  unlockDesign,
  type UnlockDesignResult,
} from "./tech-tree";
import {
  scheduleSolarParticleEvent,
  watchSolarParticleEvents,
  type SolarParticleEventState,
} from "./solar-particle-events";
import { planReconnections, type ReconnectionState } from "./reconnection";
import {
  forecastSpareComponents,
  watchSpareComponents,
  type SpareComponentsForecast,
} from "./spare-forecast";
import {
  readSelfSufficiency,
  startingSelfSufficiency,
  watchSelfSufficiency,
  type SelfSufficiencyState,
  readSpareComponentSufficiency,
  startingSpareComponentSufficiency,
  type SpareComponentSufficiencyState,
} from "./self-sufficiency";
import {
  nextSolarArray,
  rechooseSolarArrays,
  SOLAR_ARRAY_ID,
} from "./solar-arrays";
import { startingStockpile, type StockpileState } from "./stockpile";
import { workRobot, type RobotState } from "./robot";
import { idleRovers, startingRovers, type RoverState } from "./rovers";
import { planUnloading, type UnloadingState } from "./unloading";
import { readSnapshot, type Snapshot } from "./snapshot";

/** Why every command is refused once the Campaign has ended. */
const CAMPAIGN_OVER = "The Campaign is over: the Mission Director has died.";

export interface CampaignOptions {
  /** A whole number from 0 to 2³² − 1. The same seed always plays out the same way. */
  readonly seed: number;
}

export interface Forecasts {
  readonly power: PowerForecast;
  /** When each life support stock runs out, in catalogue order. */
  readonly lifeSupport: readonly LifeSupportForecast[];
  /**
   * When the Habitat the Mission Director lives in loses power, or undefined
   * while they live aboard the Lander, or once they have died.
   */
  readonly habitatPower: HabitatPowerForecast | undefined;
  /** How fast the Mission Director's Radiation Dose is rising, and when it reaches the limit. */
  readonly radiationDose: RadiationDoseForecast;
  /** How long the base's spare Components will last, at the current rate of wear. */
  readonly spareComponents: SpareComponentsForecast;
  /** How long each of the base's bulk resources will last, in catalogue order. */
  readonly bulkResources: readonly BulkResourceForecast[];
}

/** The Mission Director's death, which ends the Campaign. */
export interface CampaignEnd {
  readonly atMinute: number;
  readonly cause: DeathCause;
}

export interface PowerForecast {
  /**
   * Game-minutes until the first network with stored energy runs out of it,
   * or undefined if none does.
   */
  readonly minutesUntilEmpty: number | undefined;
  readonly networks: readonly {
    readonly structureIds: readonly string[];
    /**
     * Game-minutes until its stored energy runs out, following the Daylight
     * and Night ahead; undefined if it has no storage or it doesn't run out.
     */
    readonly minutesUntilEmpty: number | undefined;
  }[];
}

export type LoadResult =
  | { readonly ok: true; readonly campaign: Campaign }
  | {
      readonly ok: false;
      readonly reason: LoadRefusal;
      /** The reason in words the player can read. */
      readonly message: string;
    };

export type PlanResult =
  | { readonly ok: true; readonly constructionId: string }
  | {
      readonly ok: false;
      readonly reason: PlacementRefusal;
      readonly message: string;
    };

export interface Campaign {
  /**
   * Runs the simulation forward by a whole number of game-minutes, one
   * 1-game-minute tick at a time, whatever the game speed, and returns the
   * events that happened, in order. Once the Campaign has ended, it no
   * longer advances.
   */
  advance(gameMinutes: number): readonly GameEvent[];
  /**
   * Runs the simulation forward until the next notable event, such as Night
   * starting or a life support warning, and returns the events that
   * happened on that game-minute. Once the Campaign has ended, it no longer
   * advances and returns none.
   */
  advanceToNextEvent(): readonly GameEvent[];
  /**
   * Says whether a Structure could be planned there, without planning it.
   * One whose Design isn't unlocked can't be planned anywhere.
   */
  checkPlacement(plan: ConstructionPlan): PlacementCheck;
  /**
   * Plans a Construction, which the Robot then carries out by itself. A
   * Structure whose Design isn't unlocked is refused, naming the Design;
   * Constructions already planned carry on whatever is unlocked.
   */
  planConstruction(plan: ConstructionPlan): PlanResult;
  /**
   * Cancels an unfinished Construction at once, returning its unused
   * Components to the base's stock.
   */
  cancelConstruction(constructionId: string): CancelResult;
  /**
   * Plans the dismantling of a commissioned Structure, which the Robot then
   * carries out by itself, returning most of its Components to stock.
   */
  dismantleStructure(structureId: string): DismantleResult;
  /**
   * Moves the Mission Director into a commissioned Habitat that has power,
   * at once: from the Lander, freeing it for good, or from the Habitat they
   * live in.
   */
  moveMissionDirectorIn(habitatId: string): MoveInResult;
  /**
   * Sends the landed Lander on its round trip to Earth and back, which it
   * can't make while the Mission Director lives aboard it, or before the
   * Robot has taken its cargo off.
   */
  sendLander(): SendLanderResult;
  /**
   * Sets what the next Launch is to bring from Earth, in place of the
   * manifest so far. A manifest the Launch can't carry, or the Funding
   * balance can't pay for, is refused with the limit it would go over, and
   * one with an item whose Design isn't unlocked is refused, naming the
   * Design.
   */
  setLaunchManifest(manifest: readonly ManifestLine[]): ManifestResult;
  /**
   * Sets the kilograms of each Export the Lander is to carry when it next
   * takes off, in place of those set before, to be sold when it reaches
   * Earth. They stay in the base's stock until then, or, on a landing pad,
   * until the Robot loads them to carry them aboard. It is refused over the
   * Lander's Return Mass or what the base has in stock, while the Lander is
   * away, and while the Robot is carrying the last ones set to the Lander.
   */
  loadExports(exports: readonly ExportLine[]): LoadExportsResult;
  /**
   * Has a commissioned Plant run another of its recipes, from the next
   * game-minute on. It is a setting, not a Construction, so no Robot works
   * on it. It is refused for a Structure that isn't a commissioned Plant,
   * or a recipe the Plant doesn't have.
   */
  setPlantRecipe(structureId: string, recipeId: string): SetRecipeResult;
  /**
   * Switches a commissioned Plant off, so that it starts no new batch once
   * any it has started is finished, drawing no power and taking no inputs,
   * or back on, from the next game-minute. It is a setting, not a
   * Construction, so no Robot works on it. It is refused for a Structure
   * that isn't a commissioned Plant, and once the Campaign has ended.
   */
  switchPlant(
    structureId: string,
    setting: PlantSwitchSetting,
  ): SwitchPlantResult;
  /**
   * Starts an Expedition with a Robot that is free, if there is one: the
   * Robot finishes the Work Order it holds, then drives the Rover off the
   * map, and comes back some time later with what its type brings, by default
   * water ice. It is refused while one is under way, the Rover is Broken or
   * the type's Design isn't unlocked.
   */
  startExpedition(typeId?: string): StartExpeditionResult;
  /**
   * Starts a Research Task, which runs by itself for its length and then
   * pays its Science. It needs no Robot, power or Components, and carries on
   * through Night, while the Lander is away and while the Robot is busy.
   * Only one runs at a time, and each can be completed only once: while one
   * runs, more can wait in a queue, up to the data catalogue's limit, and each
   * starts by itself as the one before it completes.
   */
  queueResearchTask(researchTaskId: string): QueueResearchTaskResult;
  /**
   * Takes a Research Task out of the queue, leaving the others in order. The
   * one running can't be cancelled.
   */
  removeQueuedResearchTask(
    researchTaskId: string,
  ): RemoveQueuedResearchTaskResult;
  /**
   * Unlocks a Design in the Tech Tree at once, taking its cost off the
   * base's Science, once every Design it needs first is unlocked. It adds
   * nothing to the base. The result carries the notification of it.
   */
  unlockDesign(designId: string): UnlockDesignResult;
  /** Says when things will run out, as things stand. */
  forecasts(): Forecasts;
  snapshot(): Snapshot;
  /**
   * Writes the whole Campaign as the text of a save document, which
   * `loadCampaign` turns back into a Campaign that carries on exactly as
   * this one would. It works once the Campaign has ended, too.
   */
  save(): string;
}

export interface CampaignState {
  /** All randomness in the simulation comes from this one seeded generator. */
  random: RandomState;
  elapsedMinutes: number;
  /** Numbers the next planned Structure. */
  nextStructureNumber: number;
  /**
   * Numbers the next plan, for a Construction, dismantling, unloading or
   * loading of the Lander, or cable to a Structure cut off from power, so
   * they are worked on in order.
   */
  nextPlanNumber: number;
  lander: LanderState;
  missionDirector: MissionDirectorResidence;
  lifeSupport: LifeSupportState[];
  /** What the base's Plants made of each life support stock, and the Mission Director used, lately. */
  selfSufficiency: SelfSufficiencyState[];
  /** What the base's Plants made of spare Components, and repairs used, lately. */
  spareComponentSufficiency: SpareComponentSufficiencyState;
  radiationDoseMillisieverts: number;
  /** The next Solar Particle Event, or the one under way. */
  solarParticleEvent: SolarParticleEventState;
  /** The next Micrometeorite strike. */
  micrometeorite: MicrometeoriteState;
  /**
   * The lowest warning level, in game-minutes left, already given for the
   * spare Components running out, until more arrive in the base's stock or
   * the forecast is back well clear of them all; undefined when none has
   * been.
   */
  spareComponentsWarnedMinutes: number | undefined;
  fundingMillionDollars: number;
  /** What the next Launch is to bring, in catalogue order, each item once with a count from 1 up. */
  launchManifest: { itemId: string; count: number }[];
  /**
   * The Launch fee the Launch manifest was paid with, from the Lander
   * leaving Earth with it until it lands; undefined otherwise.
   */
  launchFeePaidMillionDollars: number | undefined;
  /**
   * What the Lander is to carry when it next takes off, in catalogue order,
   * each Export once with an amount above none, until they are aboard: on a
   * landing pad, once the Robot has loaded them, what it took from the
   * base's stock.
   */
  exportsToLoad: { resourceId: string; kilograms: number }[];
  /** The base's Science, earned by completing Research Tasks. */
  science: number;
  /** The Research Task running, if any. */
  researchTask: ResearchTaskState | undefined;
  /** The ids of the Research Tasks waiting behind it, the next to start first. */
  researchQueue: string[];
  /** The ids of the Research Tasks completed, in the order they were. */
  completedResearchTaskIds: string[];
  /**
   * The game-minutes of observing done on the observing programme's
   * current round, at full performance: a telescope at a lower Condition
   * adds less for each game-minute it observes.
   */
  observingMinutes: number;
  /**
   * The ids of the Designs unlocked in the Tech Tree: the starting ones,
   * then the others in the order they were unlocked.
   */
  unlockedDesignIds: string[];
  /** The ids of the Milestones reached, in the order they were. */
  reachedMilestoneIds: string[];
  ended: CampaignEnd | undefined;
  robots: RobotState[];
  machines: MachineState[];
  rovers: RoverState[];
  stockpile: StockpileState;
  /** One stock for every bulk resource, in catalogue order. */
  bulkResources: BulkResourceState[];
  constructions: ConstructionState[];
  structures: StructureState[];
  dismantlings: DismantlingState[];
  /** The planned unloading of the Lander's cargo, once it has landed on a landing pad with some. */
  unloading: UnloadingState | undefined;
  /** The planned loading of the Exports to load onto the Lander, while it stands on a landing pad. */
  exportLoading: ExportLoadingState | undefined;
  cables: CableState[];
  /** Planned cables to Structures cut off from power. */
  reconnections: ReconnectionState[];
  /** Maintenance Work Orders, in the order they were raised. */
  maintenance: MaintenanceState[];
  /** "Park" Work Orders, for Machines and Rovers, in the order they were raised. */
  parking: ParkingState[];
  /** The Expedition under way, if any. */
  expedition: ExpeditionState | undefined;
}

export function createCampaign(options: CampaignOptions): Campaign {
  const { landingSite } = catalogue;
  const random = seedRandom(options.seed);
  return campaignFrom({
    random,
    elapsedMinutes: 0,
    nextStructureNumber: 1,
    nextPlanNumber: 1,
    lander: {
      position: { ...landingSite.landerPosition },
      trip: undefined,
      cargo: [],
      exports: [],
    },
    missionDirector: { residence: "lander" },
    lifeSupport: startingLifeSupport(),
    selfSufficiency: startingSelfSufficiency(),
    spareComponentSufficiency: startingSpareComponentSufficiency(),
    radiationDoseMillisieverts: 0,
    solarParticleEvent: scheduleSolarParticleEvent(random, 0),
    micrometeorite: scheduleMicrometeorite(random, 0),
    spareComponentsWarnedMinutes: undefined,
    fundingMillionDollars: catalogue.programmeGrantMillionDollars,
    launchManifest: [],
    launchFeePaidMillionDollars: undefined,
    exportsToLoad: [],
    science: 0,
    researchTask: undefined,
    researchQueue: [],
    completedResearchTaskIds: [],
    observingMinutes: 0,
    unlockedDesignIds: startingDesignIds(),
    reachedMilestoneIds: [],
    ended: undefined,
    robots: landingSite.robotPositions.map((position, index) => ({
      id: `robot-${index + 1}`,
      position: { ...position },
      activity: { kind: "idle" },
      carrying: [],
      workOrder: undefined,
      conditionPercent: 100,
      selfRepair: undefined,
      arrival: undefined,
    })),
    machines: landingSite.machines.map((machine, index) => ({
      id: `${machine.machineTypeId}-${index + 1}`,
      machineTypeId: machine.machineTypeId,
      position: { ...machine.position },
      activity: { kind: "idle" },
      assignment: undefined,
      digging: undefined,
      conditionPercent: 100,
      powered: false,
    })),
    rovers: startingRovers(),
    stockpile: startingStockpile(),
    bulkResources: startingBulkResources(),
    constructions: [],
    structures: [],
    dismantlings: [],
    unloading: undefined,
    exportLoading: undefined,
    cables: [],
    reconnections: [],
    maintenance: [],
    parking: [],
    expedition: undefined,
  });
}

/**
 * Starts a Campaign from the text of a save document, of the current format
 * version or an older one, restoring everything as it was saved. A file
 * that isn't a valid save, or comes from a newer format version, is refused
 * with the reason.
 */
export function loadCampaign(text: string): LoadResult {
  const read = readSaveDocument(text);
  return read.ok
    ? { ok: true, campaign: campaignFrom(read.state) }
    : deepFreeze(read);
}

/** The Campaign that plays out from the given state, which it alone keeps. */
function campaignFrom(state: CampaignState): Campaign {
  return {
    advance(gameMinutes) {
      if (!Number.isSafeInteger(gameMinutes) || gameMinutes < 0) {
        throw new RangeError(
          `Can only advance by a whole, non-negative number of game-minutes, not ${gameMinutes}.`,
        );
      }
      const events: GameEvent[] = [];
      // Kept only within this call, as a command may come after it.
      const ticks: TickRun = {};
      for (
        let tick = 0;
        tick < gameMinutes && state.ended === undefined;
        tick++
      ) {
        events.push(...advanceOneTick(state, ticks));
      }
      return deepFreeze(events);
    },
    advanceToNextEvent() {
      // Daylight or Night always starts within one Lunation, so this ends.
      const { lunation } = lunationMinutes(catalogue.lunation);
      const ticks: TickRun = {};
      for (let tick = 0; tick < lunation && state.ended === undefined; tick++) {
        const events = advanceOneTick(state, ticks);
        if (events.length > 0) return deepFreeze(events);
      }
      return [];
    },
    checkPlacement(plan) {
      return deepFreeze(checkCampaignPlacement(state, plan));
    },
    planConstruction(plan) {
      const check = checkCampaignPlacement(state, plan);
      if (!check.ok) return deepFreeze(check);
      const id = `structure-${state.nextStructureNumber}`;
      // A solar array is whatever kind its parts make it.
      const structureTypeId =
        plan.structureTypeId === SOLAR_ARRAY_ID
          ? (nextSolarArray(state, state.launchManifest)?.id ??
            plan.structureTypeId)
          : plan.structureTypeId;
      state.nextStructureNumber += 1;
      const placed = { ...plan, position: check.position };
      state.constructions.push({
        id,
        structureTypeId,
        position: { ...check.position },
        planNumber: state.nextPlanNumber,
        workSpot: chooseWorkSpot(state, placed),
        stage: "site-preparation",
        workedMinutes: 0,
        componentsTaken: false,
        failedCommissionings: 0,
      });
      state.nextPlanNumber += 1;
      return deepFreeze({ ok: true, constructionId: id });
    },
    cancelConstruction(constructionId) {
      if (state.ended !== undefined) {
        return deepFreeze({ ok: false, message: CAMPAIGN_OVER });
      }
      return deepFreeze(cancelConstruction(state, constructionId));
    },
    dismantleStructure(structureId) {
      if (state.ended !== undefined) {
        return deepFreeze({ ok: false, message: CAMPAIGN_OVER });
      }
      return deepFreeze(dismantleStructure(state, structureId));
    },
    moveMissionDirectorIn(habitatId) {
      if (state.ended !== undefined) {
        return deepFreeze({
          ok: false,
          reason: "campaign-ended",
          message: CAMPAIGN_OVER,
        });
      }
      return deepFreeze(moveMissionDirectorIn(state, habitatId));
    },
    sendLander() {
      if (state.ended !== undefined) {
        return deepFreeze({
          ok: false,
          reason: "campaign-ended",
          message: CAMPAIGN_OVER,
        });
      }
      return deepFreeze(sendLander(state));
    },
    setLaunchManifest(manifest) {
      if (state.ended !== undefined) {
        return deepFreeze({
          ok: false,
          reason: "campaign-ended",
          message: CAMPAIGN_OVER,
        });
      }
      return deepFreeze(setLaunchManifest(state, manifest));
    },
    loadExports(exports) {
      if (state.ended !== undefined) {
        return deepFreeze({
          ok: false,
          reason: "campaign-ended",
          message: CAMPAIGN_OVER,
        });
      }
      const result = loadExports(state, exports);
      planExportLoading(state);
      return deepFreeze(result);
    },
    setPlantRecipe(structureId, recipeId) {
      if (state.ended !== undefined) {
        return deepFreeze({
          ok: false,
          reason: "campaign-ended",
          message: CAMPAIGN_OVER,
        });
      }
      return deepFreeze(setPlantRecipe(state, structureId, recipeId));
    },
    switchPlant(structureId, setting) {
      if (state.ended !== undefined) {
        return deepFreeze({
          ok: false,
          reason: "campaign-ended",
          message: CAMPAIGN_OVER,
        });
      }
      return deepFreeze(switchPlant(state, structureId, setting));
    },
    startExpedition(typeId) {
      if (state.ended !== undefined) {
        return deepFreeze({
          ok: false,
          reason: "campaign-ended",
          message: CAMPAIGN_OVER,
        });
      }
      return deepFreeze(startExpedition(state, typeId));
    },
    queueResearchTask(researchTaskId) {
      if (state.ended !== undefined) {
        return deepFreeze({
          ok: false,
          reason: "campaign-ended",
          message: CAMPAIGN_OVER,
        });
      }
      return deepFreeze(queueResearchTask(state, researchTaskId));
    },
    removeQueuedResearchTask(researchTaskId) {
      if (state.ended !== undefined) {
        return deepFreeze({
          ok: false,
          reason: "campaign-ended",
          message: CAMPAIGN_OVER,
        });
      }
      return deepFreeze(removeQueuedResearchTask(state, researchTaskId));
    },
    unlockDesign(designId) {
      if (state.ended !== undefined) {
        return deepFreeze({
          ok: false,
          reason: "campaign-ended",
          message: CAMPAIGN_OVER,
        });
      }
      return deepFreeze(unlockDesign(state, designId));
    },
    forecasts() {
      const networks = powerNetworks(state).map((network) => ({
        structureIds: network.structures.map((structure) => structure.id),
        stored: network.storedKilowattHours,
        minutesUntilEmpty: minutesUntilEmpty(network, state.elapsedMinutes),
      }));
      const running = networks.flatMap((network) =>
        network.stored > 0 && network.minutesUntilEmpty !== undefined
          ? [network.minutesUntilEmpty]
          : [],
      );
      return deepFreeze({
        power: {
          minutesUntilEmpty:
            running.length === 0 ? undefined : Math.min(...running),
          networks: networks.map(({ structureIds, minutesUntilEmpty }) => ({
            structureIds,
            minutesUntilEmpty,
          })),
        },
        lifeSupport: forecastLifeSupport(state),
        habitatPower: forecastHabitatPower(state),
        radiationDose: forecastRadiationDose(state),
        spareComponents: forecastSpareComponents(state),
        bulkResources: forecastBulkResources(state),
      });
    },
    snapshot() {
      return deepFreeze(readSnapshot(state));
    },
    save() {
      return writeSaveDocument(state);
    },
  };
}

/** What one tick leaves for the next, in a run of ticks with no command between them. */
interface TickRun {
  latestPowerForecast?: EndOfMinutePowerForecast;
}

/** Advances one 1-game-minute tick and returns the events that happened in it. */
function advanceOneTick(state: CampaignState, run: TickRun): GameEvent[] {
  const events: GameEvent[] = [];
  const partBefore = readLunation(
    state.elapsedMinutes,
    catalogue.lunation,
  ).part;
  // The part of the Lunation the latest game-minute of power was supplied in.
  const partSupplied =
    state.elapsedMinutes === 0
      ? partBefore
      : readLunation(state.elapsedMinutes - 1, catalogue.lunation).part;
  const powerLostBefore = minutesUntilPowerLostAsMinuteStarts(
    state,
    run.latestPowerForecast,
  );
  const nightLoadsSavingBefore = new Set(
    nightLoadsSavingPower(state, partSupplied === "night").map(
      (load) => load.id,
    ),
  );
  const tanksBefore = workingTanks(state);
  const tanksWithoutPowerBefore = new Set(
    tanksWithoutPower(state, partSupplied === "night").map((tank) => tank.id),
  );
  const minutesUntilLimitBefore = minutesUntilLimitAsMinuteStarts(state);
  const sparesBefore = forecastSpareComponents(state);
  const selfSufficiencyBefore = [
    ...readSelfSufficiency(state),
    readSpareComponentSufficiency(state),
  ];
  state.elapsedMinutes += 1;
  // First, before anything changes whether they operate.
  events.push(...wearStructures(state));
  events.push(...chillDriven(state, partSupplied === "night"));

  coatSolarArrays(state, partBefore === "daylight");
  events.push(...flyLander(state));
  events.push(...watchMicrometeorites(state));
  planUnloading(state);
  planExportLoading(state);
  events.push(...planMaintenance(state));
  planParking(state);
  events.push(...dropRetiredItems(state));
  rechooseSolarArrays(state);
  events.push(...workMachines(state));
  idleRovers(state);
  for (const robot of state.robots) events.push(...workRobot(state, robot));
  planReconnections(state);
  supplyPower(state, partBefore === "daylight");
  events.push(
    ...watchLights(state, partBefore === "night", nightLoadsSavingBefore),
    ...watchTanks(
      state,
      tanksBefore,
      tanksWithoutPowerBefore,
      partBefore === "night",
    ),
  );
  runPlants(state);
  events.push(...runGreenhouses(state));
  events.push(...runResearch(state));
  events.push(...runObservingProgramme(state));
  const partAfter = readLunation(state.elapsedMinutes, catalogue.lunation).part;
  if (partAfter !== partBefore) {
    events.push({
      kind: partAfter === "night" ? "night-started" : "daylight-started",
      atMinute: state.elapsedMinutes,
    });
  }
  events.push(...watchSolarParticleEvents(state));
  events.push(...watchSpareComponents(state, sparesBefore));
  // Last, so that the Mission Director's death ends the game-minute. It is
  // then the only one of these events, as any warning that minute would come
  // too late to matter.
  const lifeSupportDangers = useLifeSupport(state);
  const minutesUntilPowerLost =
    forecastHabitatPower(state)?.minutesUntilPowerLost;
  run.latestPowerForecast = { minutesUntilPowerLost };
  const dangers = [
    ...lifeSupportDangers,
    ...watchHabitatPower(state, powerLostBefore, minutesUntilPowerLost),
    ...absorbRadiationDose(state, minutesUntilLimitBefore),
  ];
  const death = dangers.find((event) => event.kind === "mission-director-died");
  events.push(...(death === undefined ? dangers : [death]));
  if (death === undefined) {
    events.push(...watchSelfSufficiency(state, selfSufficiencyBefore));
    events.push(...watchMilestones(state, events));
  }
  return events;
}

/**
 * Checks a placement, which is always refused once the Campaign has ended,
 * and for a Structure whose Design isn't unlocked.
 */
function checkCampaignPlacement(
  state: CampaignState,
  plan: ConstructionPlan,
): PlacementCheck {
  if (state.ended !== undefined) {
    return { ok: false, reason: "campaign-ended", message: CAMPAIGN_OVER };
  }
  const type = findStructureType(plan.structureTypeId);
  if (type !== undefined && !isDesignUnlocked(state, type.designId)) {
    return {
      ok: false,
      reason: "design-locked",
      message: `The ${inSentence(type.label)} needs the ${designLabel(type.designId)} Design unlocked first.`,
    };
  }
  return checkPlacement(state, plan);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
