import { catalogue, type GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import type { RobotState } from "./robot";
import { stockpileSpot } from "./stockpile";
import { cargoSpot } from "./unloading";

/**
 * A Robot a Launch has just brought, on its way to join the others at
 * work, which it does ahead of everything else: it climbs down from the
 * Lander, then walks to the stockpile. It isn't a Work Order, and it
 * claims none until it is there.
 */
export interface ArrivalState {
  /** Its time so far climbing down from the Lander. */
  workedMinutes: number;
}

/**
 * Puts the Robots a Launch has brought on the base as the Lander lands,
 * each beside the Lander, on the side facing the stockpile, at full
 * Condition, to climb down from it. Each is numbered after every Robot the
 * base already has.
 */
export function deliverRobots(state: CampaignState, count: number): void {
  for (let added = 0; added < count; added++) {
    state.robots.push({
      id: `robot-${nextRobotNumber(state)}`,
      position: cargoSpot(state),
      // It wasn't doing anything the game-minute before it came, so that
      // game-minute wears nothing off it.
      activity: { kind: "idle" },
      carrying: [],
      workOrder: undefined,
      conditionPercent: 100,
      selfRepair: undefined,
      arrival: { workedMinutes: 0 },
    });
  }
}

/** The time a Robot a Launch brings takes to climb down from the Lander, in game-minutes. */
export function climbingDownMinutes(): number {
  return Math.round(catalogue.robot.climbingDownHours * 60);
}

/** Whether a Robot a Launch has brought is still climbing down from the Lander. */
export function isClimbingDown(robot: RobotState): boolean {
  return (
    robot.arrival !== undefined &&
    robot.arrival.workedMinutes < climbingDownMinutes()
  );
}

/** Where a Robot a Launch has brought walks to: beside the stockpile, on the side facing the Lander. */
export function arrivalSpot(state: CampaignState): GroundPosition {
  return stockpileSpot(state, { workSpot: state.lander.position });
}

/** One more than the highest number among the base's Robots' ids. */
function nextRobotNumber(state: CampaignState): number {
  return (
    Math.max(
      0,
      ...state.robots.map((robot) =>
        Number(/^robot-(\d+)$/.exec(robot.id)?.[1] ?? 0),
      ),
    ) + 1
  );
}
