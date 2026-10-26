import { catalogue, type GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import { performanceAt } from "./condition";
import type { GameEvent } from "./events";

/** What a Rover did during the latest game-minute. */
export type RoverActivity =
  | { readonly kind: "idle" }
  | {
      /** A Robot is driving it to park beside a powered Structure, to plug in. */
      readonly kind: "being-parked";
      readonly structureId: string;
    };

/**
 * A vehicle a Robot drives. Like a Machine, it wears down, feels the cold
 * of Night unless it is plugged in, and is maintained with spare Components.
 */
export interface RoverState {
  id: string;
  position: GroundPosition;
  activity: RoverActivity;
  /** How intact it is, from 100% down to 0%, when it is Broken and can't be driven. */
  conditionPercent: number;
  /**
   * Whether it had power during the latest game-minute: it was plugged in
   * and, at Night, its network supplied its heater.
   */
  powered: boolean;
}

/** The Rovers a Campaign begins with, parked near the Lander. */
export function startingRovers(): RoverState[] {
  return catalogue.landingSite.roverPositions.map((position, index) => ({
    id: `rover-${index + 1}`,
    position: { ...position },
    activity: { kind: "idle" },
    conditionPercent: 100,
    powered: false,
  }));
}

/**
 * Sets every Rover idle as a game-minute starts; a Robot driving one sets
 * what it is doing again as it drives it.
 */
export function idleRovers(state: CampaignState): void {
  for (const rover of state.rovers) rover.activity = { kind: "idle" };
}

/** Whether a Rover is Broken, its Condition worn down to 0%: it can't be driven until it is repaired. */
export function isRoverBroken(
  rover: Pick<RoverState, "conditionPercent">,
): boolean {
  return rover.conditionPercent <= 0;
}

/**
 * How fast a Rover drives as its Condition falls, from 1 down to 0 once it
 * is Broken, along the same curve as a Machine.
 */
export function roverPerformance(
  rover: Pick<RoverState, "conditionPercent">,
): number {
  return performanceAt(catalogue.machinePerformance, rover.conditionPercent);
}

/**
 * Takes Condition off a Rover, in percentage points. At 0% it is Broken:
 * it stops where it stands. Returns the event if it broke.
 */
export function damageRover(
  state: CampaignState,
  rover: RoverState,
  percent: number,
): GameEvent[] {
  if (isRoverBroken(rover)) return [];
  rover.conditionPercent = Math.max(rover.conditionPercent - percent, 0);
  if (!isRoverBroken(rover)) return [];
  rover.activity = { kind: "idle" };
  return [
    { kind: "rover-broken", atMinute: state.elapsedMinutes, roverId: rover.id },
  ];
}
