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
import { seedRandom, type RandomState } from "./random";
import { workRobot, type RobotActivity, type RobotState } from "./robot";

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
}

/** A commissioned Structure. */
export interface StructureSnapshot {
  readonly id: string;
  readonly structureTypeId: string;
  readonly position: GroundPosition;
}

/** An immutable view of everything the renderer and the interface need. */
export interface Snapshot {
  readonly clock: ClockSnapshot;
  readonly lunation: LunationSnapshot;
  readonly map: MapSnapshot;
  readonly lander: LanderSnapshot;
  readonly robots: readonly RobotSnapshot[];
  /** The Components in the Lander's cargo stock, in catalogue order. */
  readonly cargo: readonly ComponentCount[];
  /** Unfinished Constructions, in the order they were planned. */
  readonly constructions: readonly ConstructionSnapshot[];
  readonly structures: readonly StructureSnapshot[];
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
  cargo: { componentId: string; count: number }[];
  constructions: ConstructionState[];
  structures: StructureState[];
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
    })),
    cargo: catalogue.componentTypes.map((type) => ({
      componentId: type.id,
      count: catalogue.startingCargo
        .filter((stock) => stock.componentId === type.id)
        .reduce((total, stock) => total + stock.count, 0),
    })),
    constructions: [],
    structures: [],
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
    snapshot() {
      return deepFreeze({
        clock: readClock(state.elapsedMinutes),
        lunation: readLunation(state.elapsedMinutes, catalogue.lunation),
        map: { ...catalogue.map },
        lander: copy(state.lander),
        robots: copy(state.robots),
        cargo: copy(state.cargo),
        constructions: state.constructions.map((construction) => ({
          id: construction.id,
          structureTypeId: construction.structureTypeId,
          position: { ...construction.position },
          stage: construction.stage,
          stageProgress: stageProgress(construction),
          componentsTaken: construction.componentsTaken,
          failedCommissionings: construction.failedCommissionings,
        })),
        structures: copy(state.structures),
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
  for (const robot of state.robots) events.push(...workRobot(state, robot));
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
