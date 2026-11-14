import { catalogue } from "../catalogue";
import type { CampaignState } from "./campaign";
import type { GameEvent } from "./events";
import { cableTo, extendRoute } from "./power";
import { findStructureToReconnect } from "./reconnection";
import type { RobotState } from "./robot";
import { samePlace, walkRobotTo } from "./robot-walking";
import { robotPerformance } from "./self-repair";
import { obstaclesFor, stepTowards } from "./walking";

/**
 * Lets the Robot do one game-minute of laying cable to a Construction or to a
 * Structure cut off from power: it walks to the powered Structure, then pays
 * the cable out behind it as it walks to the other one.
 */
export function layCable(
  state: CampaignState,
  robot: RobotState,
  structureId: string,
): GameEvent[] {
  const target =
    state.constructions.find((candidate) => candidate.id === structureId) ??
    findStructureToReconnect(state, structureId);
  const cable = target === undefined ? undefined : cableTo(state, target);
  if (cable === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  if (cable.route.length === 0) {
    if (!walkRobotTo(state, robot, structureId, cable.start, "cable")) {
      return [];
    }
    cable.route.push({ ...cable.start });
  }
  // Back from repairing itself, it goes on from where the cable got to.
  const laid = cable.route.at(-1) ?? cable.start;
  if (!walkRobotTo(state, robot, structureId, laid, "cable")) return [];
  robot.position = stepTowards(
    robot.position,
    cable.end,
    obstaclesFor(state),
    (catalogue.robot.cableLayingSpeedMetresPerHour * robotPerformance(robot)) /
      60,
  );
  extendRoute(cable.route, robot.position);
  robot.activity = { kind: "laying-cable", structureId };
  cable.complete = samePlace(robot.position, cable.end);
  return [];
}
