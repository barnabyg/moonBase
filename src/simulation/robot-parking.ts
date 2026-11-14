import type { CampaignState } from "./campaign";
import {
  bodyOf,
  drivenPerformance,
  drivenSpec,
  findDriven,
  wearDriven,
} from "./driven";
import type { GameEvent } from "./events";
import type { ParkingState } from "./parking";
import type { RobotState } from "./robot";
import { samePlace, walkRobotToDriven } from "./robot-walking";
import { obstaclesFor, stepTowards } from "./walking";

/**
 * Lets the Robot do one game-minute of parking a Machine or Rover: it walks
 * to it, then drives it, as fast as its Condition allows, to its spot
 * beside a powered Structure, where it plugs in.
 */
export function park(
  state: CampaignState,
  robot: RobotState,
  parking: ParkingState,
): GameEvent[] {
  const driven = findDriven(state, parking.target);
  if (driven === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  const body = bodyOf(driven);
  if (samePlace(body.position, parking.destination)) {
    state.parking = state.parking.filter((other) => other !== parking);
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  if (!walkRobotToDriven(state, robot, driven, body.position, "there")) {
    return [];
  }
  const spec = drivenSpec(driven);
  body.position = stepTowards(
    body.position,
    parking.destination,
    obstaclesFor(state, spec.footprintRadiusMetres),
    (spec.drivingSpeedMetresPerHour * drivenPerformance(driven)) / 60,
  );
  robot.position = { ...body.position };
  const { structureId } = parking;
  if (driven.kind === "machine") {
    robot.activity = {
      kind: "driving-machine",
      structureId,
      machineId: driven.machine.id,
    };
    driven.machine.activity = { kind: "being-parked", structureId };
  } else {
    robot.activity = {
      kind: "driving-rover",
      roverId: driven.rover.id,
      structureId,
    };
    driven.rover.activity = { kind: "being-parked", structureId };
  }
  const broken = wearDriven(state, driven, spec.dustWearPercentPerDrivingHour);
  if (broken.length > 0) {
    state.parking = state.parking.filter((other) => other !== parking);
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
  }
  return broken;
}
