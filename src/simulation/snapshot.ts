import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
  type MapSize,
} from "../catalogue";
import { readBulkResources, type BulkResourceSnapshot } from "./bulk-resources";
import type { CampaignEnd, CampaignState } from "./campaign";
import { unusedComponents } from "./cancel";
import { readClock, type ClockSnapshot } from "./clock";
import { structurePerformance } from "./condition";
import {
  findStructureType,
  isBuried,
  isShielded,
  isWaterWalled,
  stageMinutes,
  type ConstructionStage,
  type ConstructionState,
} from "./construction";
import { dismantlingStageMinutes, type DismantlingStage } from "./dismantling";
import { readExpedition, type ExpeditionSnapshot } from "./expeditions";
import {
  exportsCarriedBy,
  readExportLoading,
  type ExportLoadingSnapshot,
} from "./export-loading";
import { readExports, type ExportLine, type ExportsSnapshot } from "./exports";
import { readLander, type LanderSnapshot } from "./lander";
import {
  readLaunchManifest,
  type LaunchManifestSnapshot,
} from "./launch-manifest";
import { readLifeSupport, type LifeSupportSnapshot } from "./life-support";
import { readLunation, type LunationSnapshot } from "./lunation";
import { machinePerformance, type MachineActivity } from "./machines";
import { readMaintenance, type MaintenanceSnapshot } from "./maintenance";
import { readMilestones, type MilestonesSnapshot } from "./milestones";
import type { MissionDirectorResidence } from "./mission-director";
import {
  observes,
  readObservingProgramme,
  type ObservingProgrammeSnapshot,
} from "./observing";
import { isParkedForNight, readParking, type ParkingSnapshot } from "./parking";
import { isPlant, readPlant, type PlantSnapshot } from "./plants";
import { readPlumeEjecta, type PlumeEjectaSnapshot } from "./plume-ejecta";
import {
  consumptionKilowatts,
  nightLoadsSavingPower,
  plantConsumptionKilowatts,
  plantsRunningOnAndOff,
  pluggedIn,
  powerNetworks,
} from "./power";
import { readResearchTask, type ResearchTaskSnapshot } from "./research";
import type { RobotActivity } from "./robot";
import { roverPerformance, type RoverActivity } from "./rovers";
import {
  readSelfRepair,
  robotPerformance,
  type SelfRepairSnapshot,
} from "./self-repair";
import {
  readSelfSufficiency,
  readSpareComponentSufficiency,
  type SelfSufficiencySnapshot,
} from "./self-sufficiency";
import {
  readSolarParticleEvent,
  type SolarParticleEventSnapshot,
} from "./solar-particle-events";
import { readTank, type TankSnapshot } from "./storage-tanks";
import { readUnloading, type UnloadingSnapshot } from "./unloading";
import { findWaitingReason, type ConstructionWait } from "./work-orders";

export type {
  BulkResourceSnapshot,
  ComponentCount,
  GroundPosition,
  LanderSnapshot,
};
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
  /** The Exports the Robot is carrying to the Lander on a landing pad. */
  readonly carryingExports: readonly ExportLine[];
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
  /**
   * Whether it is parked for Night: idle and plugged in, with no work and no
   * park Work Order to move it, while Machines are parked (see
   * `isParkedForNight`). It stays there until Daylight, unless a stage of
   * Construction or Maintenance needs it.
   */
  readonly parkedForNight: boolean;
}

export interface RoverSnapshot {
  readonly id: string;
  readonly position: GroundPosition;
  readonly activity: RoverActivity;
  /**
   * How intact it is, from 100% down to 0%, when it is Broken and can't be
   * driven until it is repaired.
   */
  readonly conditionPercent: number;
  /** How fast it drives as its Condition falls, from 1 down to 0 once it is Broken. */
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
  /**
   * Whether it is a Night load, a light or a telescope, that switched
   * itself off during the latest game-minute of Night to save power, so
   * that the energy stored on its network carries everything else through
   * to Daylight.
   */
  readonly savingPower: boolean;
  /** The energy stored in it, if it is a battery bank. */
  readonly storedKilowattHours: number;
  /** What it holds, if it is a storage tank; undefined for any other Structure. */
  readonly tank: TankSnapshot | undefined;
  /**
   * Whether it is a Habitat with commissioned Regolith shielding over it,
   * neither of them Broken, or a Buried Habitat, not Broken, which needs none.
   */
  readonly shielded: boolean;
  /**
   * Whether it is a shielded Habitat with a commissioned water wall over
   * its shielding, none of them Broken.
   */
  readonly waterWalled: boolean;
  /** Whether it is a Buried Habitat that isn't Broken. */
  readonly buried: boolean;
  /**
   * How intact it is, from 100% down to 0%, when it is Broken and does
   * nothing until it is repaired.
   */
  readonly conditionPercent: number;
  /**
   * How well it does its job as its Condition falls, from 1 down to 0 once
   * it is Broken: how much of its generation, storage capacity or light
   * radius a solar array, battery bank or Light Mast has left, and how
   * fast a Plant runs or a telescope observes. Anything else works fully
   * until it is Broken.
   */
  readonly performance: number;
  /** How far round it its light reaches, as its performance allows, or 0 if it has none. */
  readonly lightRadiusMetres: number;
  /**
   * How thickly Dust coats it, from 0% to 100%, cutting a solar array's
   * output; always 0% for any other Structure.
   */
  readonly dustCoatingPercent: number;
  /**
   * Whether it is running its recipe, and why not, if it is a Plant;
   * undefined for any other Structure. A Plant has power only while it
   * runs.
   */
  readonly plant: PlantSnapshot | undefined;
  /**
   * Whether it is a telescope that observed during the latest game-minute,
   * for the observing programme: only at Night, with power, and not Broken.
   */
  readonly observing: boolean;
  /**
   * The id of the recipe it runs, if it is a Plant: one of its type's
   * recipes in the data catalogue. Undefined for any other Structure.
   */
  readonly recipeId: string | undefined;
  /**
   * Whether the player has switched it off, if it is a Plant: it then
   * starts no new batch. Always false for any other Structure.
   */
  readonly switchedOff: boolean;
  /**
   * The game-minutes grown on its current round, if it is a Greenhouse, at full
   * performance. Always 0 for any other Structure.
   */
  readonly growingMinutes: number;
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
  /**
   * The power its Structures draw now, including any lights at Night, and
   * any Plants that ran during the latest game-minute.
   */
  readonly consumptionKilowatts: number;
  readonly storedKilowattHours: number;
  readonly storageCapacityKilowattHours: number;
  /**
   * Whether it covered what its Structures draw during the latest
   * game-minute, leaving out its Plants, which only run on power to spare.
   */

  readonly powered: boolean;
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
   * Whether the base is self-sufficient in each life support stock, and how
   * much of what the Mission Director used its Plants made over the data
   * catalogue's window, in catalogue order.
   */
  readonly selfSufficiency: readonly SelfSufficiencySnapshot[];
  /**
   * The same for spare Components: how many of those used over the window the
   * base's Plants made.
   */
  readonly spareComponentSufficiency: SelfSufficiencySnapshot;
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
  /** The base's Science, earned by completing Research Tasks. */
  readonly science: number;
  /** The Research Task running, or undefined if there is none. */
  readonly researchTask: ResearchTaskSnapshot | undefined;
  /** The ids of the Research Tasks waiting behind it, the next to start first. */
  readonly researchQueue: readonly string[];
  /** The ids of the Research Tasks completed, in the order they were. */
  readonly completedResearchTaskIds: readonly string[];
  /** The observing programme, the standing Research Task the base's telescopes work on at Night. */
  readonly observingProgramme: ObservingProgrammeSnapshot;
  /**
   * The ids of the Designs unlocked in the Tech Tree: the starting ones,
   * then the others in the order they were unlocked.
   */
  readonly unlockedDesignIds: readonly string[];
  /** The Milestones reached, and the ones to aim for now and next. */
  readonly milestones: MilestonesSnapshot;
  /** The Exports to load onto the Lander, those aboard it, and what they come to. */
  readonly exports: ExportsSnapshot;
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
  readonly rovers: readonly RoverSnapshot[];
  readonly stockpile: StockpileSnapshot;
  /**
   * The base's stock of bulk resources, such as Regolith, kept at the
   * stockpile, in kilograms, in catalogue order.
   */
  readonly bulkResources: readonly BulkResourceSnapshot[];
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
  /**
   * The Robot's loading of the Exports to load onto the Lander, while it
   * stands on a landing pad, until they are aboard.
   */
  readonly exportLoading: ExportLoadingSnapshot | undefined;
  readonly cables: readonly CableSnapshot[];
  readonly power: { readonly networks: readonly PowerNetworkSnapshot[] };
  /**
   * Maintenance Work Orders awaiting the Robot or under way, in the order
   * they were raised, which is the order the Robot takes them in.
   */
  readonly maintenance: readonly MaintenanceSnapshot[];
  /**
   * The Expedition under way, from the player starting it until what it
   * brought back is in the base's stock, or undefined if there is none.
   */
  readonly expedition: ExpeditionSnapshot | undefined;
  /** Machines and Rovers being parked where they can plug in, or waiting for the Robot to park them. */
  readonly parking: readonly ParkingSnapshot[];
}

/** Reads everything the renderer and the interface need from the state, sharing nothing with it. */
export function readSnapshot(state: CampaignState): Snapshot {
  const lunation = readLunation(state.elapsedMinutes, catalogue.lunation);
  const plugs = pluggedIn(state);
  const suppliedAtNight =
    state.elapsedMinutes > 0 &&
    readLunation(state.elapsedMinutes - 1, catalogue.lunation).part === "night";
  const savingPower = nightLoadsSavingPower(state, suppliedAtNight);
  const runningOnAndOff = plantsRunningOnAndOff(state, suppliedAtNight);
  return {
    clock: readClock(state.elapsedMinutes),
    lunation,
    map: { ...catalogue.map },
    lander: readLander(state),
    missionDirector: copy(state.missionDirector),
    lifeSupport: readLifeSupport(state),
    selfSufficiency: readSelfSufficiency(state),
    spareComponentSufficiency: readSpareComponentSufficiency(state),
    radiationDoseMillisieverts: state.radiationDoseMillisieverts,
    solarParticleEvent: readSolarParticleEvent(state),
    fundingMillionDollars: state.fundingMillionDollars,
    launchManifest: readLaunchManifest(state),
    science: state.science,
    researchTask: readResearchTask(state),
    researchQueue: [...state.researchQueue],
    completedResearchTaskIds: [...state.completedResearchTaskIds],
    observingProgramme: readObservingProgramme(state),
    unlockedDesignIds: [...state.unlockedDesignIds],
    milestones: readMilestones(state),
    exports: readExports(state),
    plumeEjecta: readPlumeEjecta(state),
    ended: copy(state.ended),
    robots: state.robots.map((robot) => ({
      id: robot.id,
      position: { ...robot.position },
      activity: { ...robot.activity },
      carrying: copy(robot.carrying),
      carryingExports: exportsCarriedBy(state, robot),
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
      parkedForNight: isParkedForNight(state, machine, plugs),
    })),
    rovers: state.rovers.map((rover) => ({
      id: rover.id,
      position: { ...rover.position },
      activity: { ...rover.activity },
      conditionPercent: rover.conditionPercent,
      performance: roverPerformance(rover),
      pluggedIn: plugs.has(rover.id),
      powered: rover.powered,
    })),
    stockpile: copy(state.stockpile),
    bulkResources: readBulkResources(state),
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
      const plant = readPlant(state, structure);
      const lightRadiusMetres =
        findStructureType(structure.structureTypeId)?.lightRadiusMetres ?? 0;
      return {
        ...copy(structure),
        // The state keeps whether any Night load was on; only a light's
        // is a light.
        lit: structure.lit && lightRadiusMetres > 0,
        savingPower: savingPower.includes(structure),
        tank: readTank(state, structure, suppliedAtNight),
        shielded: isShielded(state, structure),
        waterWalled: isWaterWalled(state, structure),
        buried: isBuried(structure),
        performance,
        plant:
          plant !== undefined && runningOnAndOff.has(structure)
            ? { ...plant, runningOnAndOff: true as const }
            : plant,
        observing: observes(structure),
        lightRadiusMetres: lightRadiusMetres * performance,
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
    exportLoading: readExportLoading(state),
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
        consumptionKilowatts:
          consumptionKilowatts(network, lunation.part === "daylight") +
          plantConsumptionKilowatts(network),
        storedKilowattHours: network.storedKilowattHours,
        storageCapacityKilowattHours: network.storageCapacityKilowattHours,
        powered: network.structures
          .filter((structure) => !isPlant(structure))
          .every((structure) => structure.powered),
      })),
    },
    maintenance: readMaintenance(state),
    parking: readParking(state),
    expedition: readExpedition(state),
  };
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
