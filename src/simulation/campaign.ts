import { catalogue, type GroundPosition, type MapSize } from "../catalogue";
import { readClock, type ClockSnapshot } from "./clock";
import { seedRandom, type RandomState } from "./random";

export interface CampaignOptions {
  /** A whole number from 0 to 2³² − 1. The same seed always plays out the same way. */
  readonly seed: number;
}

export type { GroundPosition };
export type MapSnapshot = MapSize;

export interface LanderSnapshot {
  readonly state: "landed";
  readonly position: GroundPosition;
}

export interface RobotSnapshot {
  readonly id: string;
  readonly position: GroundPosition;
}

/** An immutable view of everything the renderer and the interface need. */
export interface Snapshot {
  readonly clock: ClockSnapshot;
  readonly map: MapSnapshot;
  readonly lander: LanderSnapshot;
  readonly robots: readonly RobotSnapshot[];
}

export interface Campaign {
  /**
   * Runs the simulation forward by a whole number of game-minutes, one
   * 1-game-minute tick at a time, whatever the game speed.
   */
  advance(gameMinutes: number): void;
  snapshot(): Snapshot;
}

interface CampaignState {
  /** All randomness in the simulation comes from this one seeded generator. */
  random: RandomState;
  elapsedMinutes: number;
  lander: { state: "landed"; position: GroundPosition };
  robots: { id: string; position: GroundPosition }[];
}

export function createCampaign(options: CampaignOptions): Campaign {
  const { landingSite } = catalogue;
  const state: CampaignState = {
    random: seedRandom(options.seed),
    elapsedMinutes: 0,
    lander: {
      state: "landed",
      position: { ...landingSite.landerPosition },
    },
    robots: landingSite.robotPositions.map((position, index) => ({
      id: `robot-${index + 1}`,
      position: { ...position },
    })),
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
    snapshot() {
      return deepFreeze({
        clock: readClock(state.elapsedMinutes),
        map: { ...catalogue.map },
        lander: { ...state.lander, position: { ...state.lander.position } },
        robots: state.robots.map((robot) => ({
          ...robot,
          position: { ...robot.position },
        })),
      });
    },
  };
}

function advanceOneTick(state: CampaignState): void {
  state.elapsedMinutes += 1;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
