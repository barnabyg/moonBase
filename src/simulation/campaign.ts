import {
  catalogue,
  type ComponentCount,
  type GroundPosition,
  type MapSize,
} from "../catalogue";
import { readClock, type ClockSnapshot } from "./clock";
import {
  checkPlacement,
  chooseWorkSpot,
  stageMinutes,
  type ConstructionPlan,
  type ConstructionStage,
  type ConstructionState,
  type PlacementCheck,
  type PlacementRefusal,
  type StructureState,
} from "./construction";
import type { GameEvent } from "./events";
import {
  lunationMinutes,
  readLunation,
  type LunationSnapshot,
} from "./lunation";
import {
  workMachines,
  type MachineActivity,
  type MachineState,
} from "./machines";
import {
  consumptionKilowatts,
  minutesUntilEmpty,
  powerNetworks,
  supplyPower,
  type CableState,
} from "./power";
import { seedRandom, type RandomState } from "./random";
import { workRobot, type RobotActivity, type RobotState } from "./robot";
import { findWaitingReason, type ConstructionWait } from "./work-orders";

export interface CampaignOptions {
  /** A whole number from 0 to 2³² − 1. The same seed always plays out the same way. */
  readonly seed: number;
}

export type { ComponentCount, GroundPosition };
export type MapSnapshot = MapSize;

export interface LanderSnapshot {
  readonly state: "landed";
  readonly position: GroundPosition;
}

export interface RobotSnapshot {
  readonly id: string;
  readonly position: GroundPosition;
  /** What the Robot did during the latest game-minute. */
  readonly activity: RobotActivity;
  /** The Components the Robot is carrying. */
  readonly carrying: readonly ComponentCount[];
}

export interface MachineSnapshot {
  readonly id: string;
  readonly machineTypeId: string;
  readonly position: GroundPosition;
  readonly activity: MachineActivity;
}

export interface ConstructionSnapshot {
  /** The id of the Structure being built, which it keeps once commissioned. */
  readonly id: string;
  readonly structureTypeId: string;
  readonly position: GroundPosition;
  readonly stage: ConstructionStage;
  /** How much of the current stage's work is done, from 0 to 1. */
  readonly stageProgress: number;
  /** Whether the Robot has taken this Construction's Components from the cargo stock. */
  readonly componentsTaken: boolean;
  readonly failedCommissionings: number;
  /** Why nobody can work on the Construction for now, or undefined if it can be worked on. */
  readonly waiting: ConstructionWait | undefined;
}

/** A commissioned Structure. */
export interface StructureSnapshot {
  readonly id: string;
  readonly structureTypeId: string;
  readonly position: GroundPosition;
  /** Whether its power network covered what it draws during the latest game-minute. */
  readonly powered: boolean;
  /** Whether its light was on during the latest game-minute: only at Night, with power. */
  readonly lit: boolean;
  /** The energy stored in it, if it is a battery bank. */
  readonly storedKilowattHours: number;
}

/** A power cable, laid or being laid, from a powered Structure to a Construction. */
export interface CableSnapshot {
  readonly fromStructureId: string;
  /** The Construction's id, which its Structure keeps once commissioned. */
  readonly toStructureId: string;
  /** The cable laid so far, as a line of points from the powered Structure. */
  readonly route: readonly GroundPosition[];
  readonly complete: boolean;
}

/** Commissioned Structures joined by cable, which share their power. */
export interface PowerNetworkSnapshot {
  /** In the order they were commissioned. */
  readonly structureIds: readonly string[];
  /** The power its solar arrays are generating now: none at Night. */
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
  readonly robots: readonly RobotSnapshot[];
  readonly machines: readonly MachineSnapshot[];
  /** The Components in the Lander's cargo stock, in catalogue order. */
  readonly cargo: readonly ComponentCount[];
  /** Unfinished Constructions, in the order they were planned. */
  readonly constructions: readonly ConstructionSnapshot[];
  readonly structures: readonly StructureSnapshot[];
  readonly cables: readonly CableSnapshot[];
  readonly power: { readonly networks: readonly PowerNetworkSnapshot[] };
}

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
   * 1-game-minute tick at a time, whatever the game speed.
   */
  advance(gameMinutes: number): void;
  /**
   * Runs the simulation forward until the next notable event, such as Night
   * starting, and returns the events that happened on that game-minute.
   */
  advanceToNextEvent(): readonly GameEvent[];
  /** Says whether a Structure could be planned there, without planning it. */
  checkPlacement(plan: ConstructionPlan): PlacementCheck;
  /** Plans a Construction, which the Robot then carries out by itself. */
  planConstruction(plan: ConstructionPlan): PlanResult;
  /** Says when things will run out, as things stand. */
  forecasts(): Forecasts;
  snapshot(): Snapshot;
}

export interface CampaignState {
  /** All randomness in the simulation comes from this one seeded generator. */
  random: RandomState;
  elapsedMinutes: number;
  /** Numbers the next planned Structure. */
  nextStructureNumber: number;
  lander: { state: "landed"; position: GroundPosition };
  robots: RobotState[];
  machines: MachineState[];
  cargo: { componentId: string; count: number }[];
  constructions: ConstructionState[];
  structures: StructureState[];
  cables: CableState[];
}

export function createCampaign(options: CampaignOptions): Campaign {
  const { landingSite } = catalogue;
  const state: CampaignState = {
    random: seedRandom(options.seed),
    elapsedMinutes: 0,
    nextStructureNumber: 1,
    lander: {
      state: "landed",
      position: { ...landingSite.landerPosition },
    },
    robots: landingSite.robotPositions.map((position, index) => ({
      id: `robot-${index + 1}`,
      position: { ...position },
      activity: { kind: "idle" },
      carrying: [],
      workOrder: undefined,
    })),
    machines: landingSite.machines.map((machine, index) => ({
      id: `${machine.machineTypeId}-${index + 1}`,
      machineTypeId: machine.machineTypeId,
      position: { ...machine.position },
      activity: { kind: "idle" },
      assignment: undefined,
    })),
    cargo: catalogue.componentTypes.map((type) => ({
      componentId: type.id,
      count: catalogue.startingCargo
        .filter((stock) => stock.componentId === type.id)
        .reduce((total, stock) => total + stock.count, 0),
    })),
    constructions: [],
    structures: [],
    cables: [],
  };

  return {
    advance(gameMinutes) {
      if (!Number.isSafeInteger(gameMinutes) || gameMinutes < 0) {
        throw new RangeError(
          `Can only advance by a whole, non-negative number of game-minutes, not ${gameMinutes}.`,
        );
      }
      for (let tick = 0; tick < gameMinutes; tick++) {
        advanceOneTick(state);
      }
    },
    advanceToNextEvent() {
      // Daylight or Night always starts within one Lunation, so this ends.
      const { lunation } = lunationMinutes(catalogue.lunation);
      for (let tick = 0; tick < lunation; tick++) {
        const events = advanceOneTick(state);
        if (events.length > 0) return deepFreeze(events);
      }
      return [];
    },
    checkPlacement(plan) {
      return deepFreeze(checkPlacement(state, plan));
    },
    planConstruction(plan) {
      const check = checkPlacement(state, plan);
      if (!check.ok) return deepFreeze(check);
      const id = `structure-${state.nextStructureNumber}`;
      state.nextStructureNumber += 1;
      state.constructions.push({
        id,
        structureTypeId: plan.structureTypeId,
        position: { x: plan.position.x, y: plan.position.y },
        workSpot: chooseWorkSpot(state, plan),
        stage: "site-preparation",
        workedMinutes: 0,
        componentsTaken: false,
        failedCommissionings: 0,
      });
      return deepFreeze({ ok: true, constructionId: id });
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
      });
    },
    snapshot() {
      const lunation = readLunation(state.elapsedMinutes, catalogue.lunation);
      return deepFreeze({
        clock: readClock(state.elapsedMinutes),
        lunation,
        map: { ...catalogue.map },
        lander: copy(state.lander),
        robots: state.robots.map((robot) => ({
          id: robot.id,
          position: { ...robot.position },
          activity: { ...robot.activity },
          carrying: copy(robot.carrying),
        })),
        machines: state.machines.map((machine) => ({
          id: machine.id,
          machineTypeId: machine.machineTypeId,
          position: { ...machine.position },
          activity: { ...machine.activity },
        })),
        cargo: copy(state.cargo),
        constructions: state.constructions.map((construction) => ({
          id: construction.id,
          structureTypeId: construction.structureTypeId,
          position: { ...construction.position },
          stage: construction.stage,
          stageProgress: stageProgress(construction),
          componentsTaken: construction.componentsTaken,
          failedCommissionings: construction.failedCommissionings,
          waiting: copy(findWaitingReason(state, construction)),
        })),
        structures: copy(state.structures),
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
      });
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
  state.elapsedMinutes += 1;
  workMachines(state);
  for (const robot of state.robots) events.push(...workRobot(state, robot));
  supplyPower(state, partBefore === "daylight");
  const partAfter = readLunation(state.elapsedMinutes, catalogue.lunation).part;
  if (partAfter !== partBefore) {
    events.push({
      kind: partAfter === "night" ? "night-started" : "daylight-started",
      atMinute: state.elapsedMinutes,
    });
  }
  return events;
}

function stageProgress(construction: ConstructionState): number {
  const required = stageMinutes(construction);
  return required === 0
    ? 0
    : Math.min(construction.workedMinutes / required, 1);
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
