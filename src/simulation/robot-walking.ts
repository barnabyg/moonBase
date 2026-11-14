import { catalogue, type GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import { bodyOf, drivenSpec, type Driven } from "./driven";
import type { RobotState, WalkingDestination } from "./robot";
import { robotPerformance } from "./self-repair";
import { spotClearOfHeapAndIceStore } from "./stockpile";
import { obstaclesFor, stepTowards } from "./walking";

/** Whether two spots on the ground are the same. */
export function samePlace(a: GroundPosition, b: GroundPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Where a Robot stands to maintain or park a Machine or Rover: just
 * outside it, on the side facing the stockpile, or turned aside as little
 * as it takes to stand clear of the Regolith heap, which lies between the
 * stockpile and the excavator where it digs, and the ice store.
 */
export function besideDriven(
  state: CampaignState,
  driven: Driven,
): GroundPosition {
  const { position } = bodyOf(driven);
  return spotClearOfHeapAndIceStore(
    state,
    position,
    drivenSpec(driven).footprintRadiusMetres +
      catalogue.robot.workingGapMetres / 2,
    Math.atan2(
      state.stockpile.position.y - position.y,
      state.stockpile.position.x - position.x,
    ),
  );
}

/**
 * Walks the Robot one game-minute towards a spot, round the Lander and the
 * Structures, for Maintenance or parking of a Machine or Rover: to the
 * stockpile, or to the Machine or Rover itself. Says whether it was
 * already there.
 */
export function walkRobotToDriven(
  state: CampaignState,
  robot: RobotState,
  driven: Driven,
  spot: GroundPosition,
  destination: "stockpile" | "there",
): boolean {
  if (samePlace(robot.position, spot)) return true;
  stepRobot(state, robot, spot);
  robot.activity =
    driven.kind === "machine"
      ? {
          kind: "walking",
          machineId: driven.machine.id,
          destination: destination === "there" ? "machine" : "stockpile",
        }
      : {
          kind: "walking",
          roverId: driven.rover.id,
          destination: destination === "there" ? "rover" : "stockpile",
        };
  return false;
}

/**
 * Walks the Robot one game-minute towards a spot, round the Lander and the
 * Structures, for work on a Structure. Says whether it was already there.
 */
export function walkRobotTo(
  state: CampaignState,
  robot: RobotState,
  structureId: string,
  spot: GroundPosition,
  destination: WalkingDestination,
): boolean {
  if (samePlace(robot.position, spot)) return true;
  stepRobot(state, robot, spot);
  robot.activity = { kind: "walking", structureId, destination };
  return false;
}

/**
 * Walks the Robot one game-minute's step towards a spot, round the Lander
 * and the Structures, as fast as its Condition allows.
 */
export function stepRobot(
  state: CampaignState,
  robot: RobotState,
  spot: GroundPosition,
): void {
  robot.position = stepTowards(
    robot.position,
    spot,
    obstaclesFor(state),
    (catalogue.robot.walkingSpeedMetresPerHour * robotPerformance(robot)) / 60,
  );
}
