import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
  type MapSize,
} from "../catalogue";
import {
  cancelConstruction,
  unusedComponents,
  type CancelResult,
} from "./cancel";
import { readClock, type ClockSnapshot } from "./clock";
import { structurePerformance, wearStructures } from "./condition";
import { coatSolarArrays } from "./dust-coating";
import {
  dismantleStructure,
  dismantlingStageMinutes,
  type DismantleResult,
  type DismantlingStage,
  type DismantlingState,
} from "./dismantling";
import {
  checkPlacement,
  chooseWorkSpot,
  findStructureType,
  isShielded,
  stageMinutes,
  type ConstructionPlan,
  type ConstructionStage,
  type ConstructionState,
  type PlacementCheck,
  type PlacementRefusal,
  type StructureState,
} from "./construction";
import type { DeathCause, GameEvent } from "./events";
import {
  forecastHabitatPower,
  minutesUntilPowerLostAsMinuteStarts,
  watchHabitatPower,
  type HabitatPowerForecast,
} from "./habitat-power";
import {
  forecastLifeSupport,
  readLifeSupport,
  startingLifeSupport,
  useLifeSupport,
  type LifeSupportForecast,
  type LifeSupportSnapshot,
  type LifeSupportState,
} from "./life-support";
import {
  flyLander,
  readLander,
  sendLander,
  type LanderSnapshot,
  type LanderState,
  type SendLanderResult,
} from "./lander";
import {
  readLaunchManifest,
  setLaunchManifest,
  type LaunchManifestSnapshot,
  type ManifestLine,
  type ManifestResult,
} from "./launch-manifest";
import {
  moveMissionDirectorIn,
  type MissionDirectorResidence,
  type MoveInResult,
} from "./mission-director";
import {
  lunationMinutes,
  readLunation,
  type LunationSnapshot,
} from "./lunation";
import {
  chillMachines,
  machinePerformance,
  workMachines,
  type MachineActivity,
  type MachineState,
} from "./machines";
import {
  consumptionKilowatts,
  minutesUntilEmpty,
  pluggedIn,
  powerNetworks,
  supplyPower,
  type CableState,
} from "./power";
import {
  absorbRadiationDose,
  forecastRadiationDose,
  type RadiationDoseForecast,
} from "./radiation";
import {
  planMaintenance,
  readMaintenance,
  type MaintenanceSnapshot,
  type MaintenanceState,
} from "./maintenance";
import {
  planParking,
  readParking,
  type ParkingSnapshot,
  type ParkingState,
} from "./parking";
import { readPlumeEjecta, type PlumeEjectaSnapshot } from "./plume-ejecta";
import { seedRandom, type RandomState } from "./random";
import { readSaveDocument, writeSaveDocument, type LoadRefusal } from "./save";
import {
  readSolarParticleEvent,
  scheduleSolarParticleEvent,
  watchSolarParticleEvents,
  type SolarParticleEventSnapshot,
  type SolarParticleEventState,
} from "./solar-particle-events";
import { planReconnections, type ReconnectionState } from "./reconnection";
import { startingStockpile, type StockpileState } from "./stockpile";
import { workRobot, type RobotActivity, type RobotState } from "./robot";
import {
  readSelfRepair,
  robotPerformance,
  type SelfRepairSnapshot,
} from "./self-repair";
import {
  planUnloading,
  readUnloading,
  type UnloadingSnapshot,
  type UnloadingState,
} from "./unloading";
import { findWaitingReason, type ConstructionWait } from "./work-orders";

/** Why every command is refused once the Campaign has ended. */
const CAMPAIGN_OVER = "The Campaign is over: the Mission Director has died.";

export interface CampaignOptions {
  /** A whole number from 0 to 2³² − 1. The same seed always plays out the same way. */
  readonly seed: number;
}

export type { ComponentCount, GroundPosition, LanderSnapshot };
export type MapSnapshot = MapSize;

/**
 * The base's stock of Components, kept on the ground beside the landing site.
 * It belongs to the base rather than the Lander.
 */
export interface StockpileSnapshot {
  readonly position: GroundPosition;
  /** How many of each Component are in stock, in catalogue order. */
  readonly components: readonly ComponentCount[];
}

export interface RobotSnapshot {
  readonly id: string;
  readonly position: GroundPosition;
  /** What the Robot did during the latest game-minute. */
  readonly activity: RobotActivity;
  /** The Components the Robot is carrying. */
  readonly carrying: readonly ComponentCount[];
  /**
   * How intact it is, from 100% down to the data catalogue's floor: a
   * Robot is never Broken.
   */
  readonly conditionPercent: number;
  /** How fast it walks and works as its Condition falls, from 1 down. */
  readonly performance: number;
  /** Its repair of itself, while it is under way. */
  readonly selfRepair: SelfRepairSnapshot | undefined;
}

export interface MachineSnapshot {
  readonly id: string;
  readonly machineTypeId: string;
  readonly position: GroundPosition;
  readonly activity: MachineActivity;
  /**
   * How intact it is, from 100% down to 0%, when it is Broken and stops
   * working until it is repaired.
   */
  readonly conditionPercent: number;
  /** How fast it works and drives as its Condition falls, from 1 down to 0 once it is Broken. */
  readonly performance: number;
  /**
   * Whether it stands within plug-in reach of a commissioned Structure on
   * a network with a power source, one that isn't Broken.
   */
  readonly pluggedIn: boolean;
  /**
   * Whether it had power during the latest game-minute: it was plugged in
   * and, at Night, its network supplied its heater. Unpowered at Night, the
   * cold wears it down.
   */
  readonly powered: boolean;
}

export interface ConstructionSnapshot {
  /** The id of the Structure being built, which it keeps once commissioned. */
  readonly id: string;
  readonly structureTypeId: string;
  readonly position: GroundPosition;
  readonly stage: ConstructionStage;
  /** How much of the current stage's work is done, from 0 to 1. */
  readonly stageProgress: number;
  /** Whether the Robot has taken this Construction's Components from the base's stock. */
  readonly componentsTaken: boolean;
  readonly failedCommissionings: number;
  /** The Components that cancelling it now would return to the base's stock. */
  readonly unusedComponents: readonly ComponentCount[];
  /** Why nobody can work on the Construction for now, or undefined if it can be worked on. */
  readonly waiting: ConstructionWait | undefined;
}

/** A commissioned Structure. */
export interface StructureSnapshot {
  readonly id: string;
  readonly structureTypeId: string;
  readonly position: GroundPosition;
  /**
   * Whether it had power during the latest game-minute. A network that can't
   * cover everything supplies Habitats first, then the rest in the order they
   * were commissioned. A Habitat has power only if all it draws is covered.
   */
  readonly powered: boolean;
  /** Whether its light was on during the latest game-minute: only at Night, with power. */
  readonly lit: boolean;
  /** The energy stored in it, if it is a battery bank. */
  readonly storedKilowattHours: number;
  /**
   * Whether it is a Habitat with commissioned Regolith shielding over it,
   * neither of them Broken.
   */
  readonly shielded: boolean;
  /**
   * How intact it is, from 100% down to 0%, when it is Broken and does
   * nothing until it is repaired.
   */
  readonly conditionPercent: number;
  /**
   * How well it does its job as its Condition falls, from 1 down to 0 once
   * it is Broken: how much of its generation, storage capacity or light
   * radius a solar array, battery bank or Light Mast has left. Anything
   * else works fully until it is Broken.
   */
  readonly performance: number;
  /** How far round it its light reaches, as its performance allows, or 0 if it has none. */
  readonly lightRadiusMetres: number;
  /**
   * How thickly Dust coats it, from 0% to 100%, cutting a solar array's
   * output; always 0% for any other Structure.
   */
  readonly dustCoatingPercent: number;
}

/**
 * A Structure being dismantled. It stays among the Structures, working, until
 * the Robot starts taking it apart.
 */
export interface DismantlingSnapshot {
  /** The id of the Structure being dismantled. */
  readonly id: string;
  readonly structureTypeId: string;
  readonly position: GroundPosition;
  readonly stage: DismantlingStage;
  /** How much of the current stage's work is done, from 0 to 1. */
  readonly stageProgress: number;
  /** The Components recovered once it has been taken apart; none before. */
  readonly recovered: readonly ComponentCount[];
  /** Whether the Robot has picked up the recovered Components to carry them away. */
  readonly collected: boolean;
}

/**
 * A power cable, laid or being laid, from a powered Structure to a
 * Construction or to a commissioned Structure cut off from power.
 */
export interface CableSnapshot {
  readonly fromStructureId: string;
  /**
   * The Construction's id, which its Structure keeps once commissioned, or
   * the id of the Structure cut off from power.
   */
  readonly toStructureId: string;
  /** The cable laid so far, as a line of points from the powered Structure. */
  readonly route: readonly GroundPosition[];
  readonly complete: boolean;
}

/** Commissioned Structures joined by cable, which share their power. */
export interface PowerNetworkSnapshot {
  /** In the order they were commissioned. */
  readonly structureIds: readonly string[];
  /**
   * The power its solar arrays are generating now, as their Condition and
   * Dust coating allow: none at Night.
   */
  readonly generationKilowatts: number;
  /** The power its Structures draw now, including any lights at Night. */
  readonly consumptionKilowatts: number;
  readonly storedKilowattHours: number;
  readonly storageCapacityKilowattHours: number;
  /** Whether it covered what its Structures draw during the latest game-minute. */
  readonly powered: boolean;
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

/** An immutable view of everything the renderer and the interface need. */
export interface Snapshot {
  readonly clock: ClockSnapshot;
  readonly lunation: LunationSnapshot;
  readonly map: MapSnapshot;
  readonly lander: LanderSnapshot;
  /** Where the Mission Director lives. They are never shown on screen. */
  readonly missionDirector: MissionDirectorResidence;
  /** The Mission Director's stocks of oxygen and water, in catalogue order. */
  readonly lifeSupport: readonly LifeSupportSnapshot[];
  /**
   * The total radiation the Mission Director has absorbed. The data
   * catalogue sets the limit.
   */
  readonly radiationDoseMillisieverts: number;
  /**
   * The Solar Particle Event the Mission Director knows of: one whose warning
   * has come, until it ends. Undefined otherwise.
   */
  readonly solarParticleEvent: SolarParticleEventSnapshot | undefined;
  /** The money the base programme has to spend. */
  readonly fundingMillionDollars: number;
  /** What the next Launch is to bring from Earth, and what that comes to. */
  readonly launchManifest: LaunchManifestSnapshot;
  /**
   * Where the Lander's next take-off or landing will blast Plume Ejecta,
   * and how far it reaches, for placing Structures clear of it.
   */
  readonly plumeEjecta: PlumeEjectaSnapshot | undefined;
  /**
   * How the Campaign ended, or undefined while it goes on. Once it has
   * ended, the simulation no longer advances and every command is refused.
   */
  readonly ended: CampaignEnd | undefined;
  readonly robots: readonly RobotSnapshot[];
  readonly machines: readonly MachineSnapshot[];
  readonly stockpile: StockpileSnapshot;
  /** Unfinished Constructions, in the order they were planned. */
  readonly constructions: readonly ConstructionSnapshot[];
  readonly structures: readonly StructureSnapshot[];
  /** Structures being dismantled, in the order dismantling was planned. */
  readonly dismantlings: readonly DismantlingSnapshot[];
  /**
   * The Robot's unloading of the Lander's cargo, once it has landed on a
   * landing pad with some, until the cargo is in the base's stock.
   */
  readonly unloading: UnloadingSnapshot | undefined;
  readonly cables: readonly CableSnapshot[];
  readonly power: { readonly networks: readonly PowerNetworkSnapshot[] };
  /**
   * Maintenance Work Orders awaiting the Robot or under way, in the order
   * they were raised, which is the order the Robot takes them in.
   */
  readonly maintenance: readonly MaintenanceSnapshot[];
  /** Machines being parked where they can plug in, or waiting for the Robot to park them. */
  readonly parking: readonly ParkingSnapshot[];
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
  /** Says whether a Structure could be planned there, without planning it. */
  checkPlacement(plan: ConstructionPlan): PlacementCheck;
  /** Plans a Construction, which the Robot then carries out by itself. */
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
   * Moves the Mission Director from the Lander into a commissioned Habitat,
   * at once and for good, freeing the Lander.
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
   * balance can't pay for, is refused with the limit it would go over.
   */
  setLaunchManifest(manifest: readonly ManifestLine[]): ManifestResult;
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
   * Numbers the next plan, for a Construction, dismantling or cable to a
   * Structure cut off from power, so they are worked on in order.
   */
  nextPlanNumber: number;
  lander: LanderState;
  missionDirector: MissionDirectorResidence;
  lifeSupport: LifeSupportState[];
  radiationDoseMillisieverts: number;
  /** The next Solar Particle Event, or the one under way. */
  solarParticleEvent: SolarParticleEventState;
  fundingMillionDollars: number;
  /** What the next Launch is to bring, in catalogue order, each item once with a count from 1 up. */
  launchManifest: { itemId: string; count: number }[];
  ended: CampaignEnd | undefined;
  robots: RobotState[];
  machines: MachineState[];
  stockpile: StockpileState;
  constructions: ConstructionState[];
  structures: StructureState[];
  dismantlings: DismantlingState[];
  /** The planned unloading of the Lander's cargo, once it has landed on a landing pad with some. */
  unloading: UnloadingState | undefined;
  cables: CableState[];
  /** Planned cables to Structures cut off from power. */
  reconnections: ReconnectionState[];
  /** Maintenance Work Orders, in the order they were raised. */
  maintenance: MaintenanceState[];
  /** "Park Machine" Work Orders, in the order they were raised. */
  parking: ParkingState[];
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
    },
    missionDirector: { residence: "lander" },
    lifeSupport: startingLifeSupport(),
    radiationDoseMillisieverts: 0,
    solarParticleEvent: scheduleSolarParticleEvent(random, 0),
    fundingMillionDollars: catalogue.programmeGrantMillionDollars,
    launchManifest: [],
    ended: undefined,
    robots: landingSite.robotPositions.map((position, index) => ({
      id: `robot-${index + 1}`,
      position: { ...position },
      activity: { kind: "idle" },
      carrying: [],
      workOrder: undefined,
      conditionPercent: 100,
      selfRepair: undefined,
    })),
    machines: landingSite.machines.map((machine, index) => ({
      id: `${machine.machineTypeId}-${index + 1}`,
      machineTypeId: machine.machineTypeId,
      position: { ...machine.position },
      activity: { kind: "idle" },
      assignment: undefined,
      conditionPercent: 100,
      powered: false,
    })),
    stockpile: startingStockpile(),
    constructions: [],
    structures: [],
    dismantlings: [],
    unloading: undefined,
    cables: [],
    reconnections: [],
    maintenance: [],
    parking: [],
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
      for (
        let tick = 0;
        tick < gameMinutes && state.ended === undefined;
        tick++
      ) {
        events.push(...advanceOneTick(state));
      }
      return deepFreeze(events);
    },
    advanceToNextEvent() {
      // Daylight or Night always starts within one Lunation, so this ends.
      const { lunation } = lunationMinutes(catalogue.lunation);
      for (let tick = 0; tick < lunation && state.ended === undefined; tick++) {
        const events = advanceOneTick(state);
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
      state.nextStructureNumber += 1;
      const placed = { ...plan, position: check.position };
      state.constructions.push({
        id,
        structureTypeId: plan.structureTypeId,
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
      });
    },
    snapshot() {
      const lunation = readLunation(state.elapsedMinutes, catalogue.lunation);
      const plugs = pluggedIn(state);
      return deepFreeze({
        clock: readClock(state.elapsedMinutes),
        lunation,
        map: { ...catalogue.map },
        lander: readLander(state),
        missionDirector: copy(state.missionDirector),
        lifeSupport: readLifeSupport(state),
        radiationDoseMillisieverts: state.radiationDoseMillisieverts,
        solarParticleEvent: readSolarParticleEvent(state),
        fundingMillionDollars: state.fundingMillionDollars,
        launchManifest: readLaunchManifest(state),
        plumeEjecta: readPlumeEjecta(state),
        ended: copy(state.ended),
        robots: state.robots.map((robot) => ({
          id: robot.id,
          position: { ...robot.position },
          activity: { ...robot.activity },
          carrying: copy(robot.carrying),
          conditionPercent: robot.conditionPercent,
          performance: robotPerformance(robot),
          selfRepair: readSelfRepair(robot),
        })),
        machines: state.machines.map((machine) => ({
          id: machine.id,
          machineTypeId: machine.machineTypeId,
          position: { ...machine.position },
          activity: { ...machine.activity },
          conditionPercent: machine.conditionPercent,
          performance: machinePerformance(machine),
          pluggedIn: plugs.has(machine.id),
          powered: machine.powered,
        })),
        stockpile: copy(state.stockpile),
        constructions: state.constructions.map((construction) => ({
          id: construction.id,
          structureTypeId: construction.structureTypeId,
          position: { ...construction.position },
          stage: construction.stage,
          stageProgress: stageProgress(construction),
          componentsTaken: construction.componentsTaken,
          failedCommissionings: construction.failedCommissionings,
          unusedComponents: unusedComponents(construction),
          waiting: copy(findWaitingReason(state, construction)),
        })),
        structures: state.structures.map((structure) => {
          const performance = structurePerformance(structure);
          return {
            ...copy(structure),
            shielded: isShielded(state, structure),
            performance,
            lightRadiusMetres:
              (findStructureType(structure.structureTypeId)
                ?.lightRadiusMetres ?? 0) * performance,
          };
        }),
        dismantlings: state.dismantlings.map((dismantling) => ({
          id: dismantling.id,
          structureTypeId: dismantling.structureTypeId,
          position: { ...dismantling.position },
          stage: dismantling.stage,
          stageProgress: progressThrough(
            dismantling.workedMinutes,
            dismantlingStageMinutes(dismantling),
          ),
          recovered: copy(dismantling.recovered),
          collected: dismantling.collected,
        })),
        unloading: readUnloading(state),
        cables: state.cables.map((cable) => ({
          fromStructureId: cable.fromStructureId,
          toStructureId: cable.toStructureId,
          route: copy(cable.route),
          complete: cable.complete,
        })),
        power: {
          networks: powerNetworks(state).map((network) => ({
            structureIds: network.structures.map((structure) => structure.id),
            generationKilowatts:
              lunation.part === "daylight"
                ? network.daylightGenerationKilowatts
                : 0,
            consumptionKilowatts: consumptionKilowatts(
              network,
              lunation.part === "daylight",
            ),
            storedKilowattHours: network.storedKilowattHours,
            storageCapacityKilowattHours: network.storageCapacityKilowattHours,
            powered: network.structures.every((structure) => structure.powered),
          })),
        },
        maintenance: readMaintenance(state),
        parking: readParking(state),
      });
    },
    save() {
      return writeSaveDocument(state);
    },
  };
}

/** Advances one 1-game-minute tick and returns the events that happened in it. */
function advanceOneTick(state: CampaignState): GameEvent[] {
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
  const powerLostBefore = minutesUntilPowerLostAsMinuteStarts(state);
  const minutesUntilLimitBefore =
    forecastRadiationDose(state).minutesUntilLimit;
  state.elapsedMinutes += 1;
  // First, before anything changes whether they operate.
  events.push(...wearStructures(state));
  events.push(...chillMachines(state, partSupplied === "night"));
  coatSolarArrays(state, partBefore === "daylight");
  events.push(...flyLander(state));
  planUnloading(state);
  events.push(...planMaintenance(state));
  planParking(state);
  events.push(...workMachines(state));
  for (const robot of state.robots) events.push(...workRobot(state, robot));
  planReconnections(state);
  supplyPower(state, partBefore === "daylight");
  const partAfter = readLunation(state.elapsedMinutes, catalogue.lunation).part;
  if (partAfter !== partBefore) {
    events.push({
      kind: partAfter === "night" ? "night-started" : "daylight-started",
      atMinute: state.elapsedMinutes,
    });
  }
  events.push(...watchSolarParticleEvents(state));
  // Last, so that the Mission Director's death ends the game-minute. It is
  // then the only one of these events, as any warning that minute would come
  // too late to matter.
  const dangers = [
    ...useLifeSupport(state),
    ...watchHabitatPower(state, powerLostBefore),
    ...absorbRadiationDose(state, minutesUntilLimitBefore),
  ];
  const death = dangers.find((event) => event.kind === "mission-director-died");
  events.push(...(death === undefined ? dangers : [death]));
  return events;
}

/** Checks a placement, which is always refused once the Campaign has ended. */
function checkCampaignPlacement(
  state: CampaignState,
  plan: ConstructionPlan,
): PlacementCheck {
  if (state.ended !== undefined) {
    return { ok: false, reason: "campaign-ended", message: CAMPAIGN_OVER };
  }
  return checkPlacement(state, plan);
}

function stageProgress(construction: ConstructionState): number {
  return progressThrough(
    construction.workedMinutes,
    stageMinutes(construction),
  );
}

function progressThrough(workedMinutes: number, required: number): number {
  return required === 0 ? 0 : Math.min(workedMinutes / required, 1);
}

/** Copies plain data, so that a snapshot shares nothing with the live state. */
function copy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copy) as T;
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, copy(child)]),
    ) as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
