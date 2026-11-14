import type { GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import type { GameEvent } from "./events";
import {
  collectExports,
  exportHandlingMinutes,
  finishExportLoading,
} from "./export-loading";
import type { RobotState } from "./robot";
import { samePlace, stepRobot, walkRobotTo } from "./robot-walking";
import { robotPerformance } from "./self-repair";
import { stockpileSpot } from "./stockpile";
import {
  cargoHandlingMinutes,
  cargoSpot,
  collectCargo,
  finishUnloading,
} from "./unloading";

/**
 * Lets the Robot do one game-minute of unloading the Lander, landed on a
 * landing pad: it walks to the Lander and takes the cargo off, then carries
 * it to the stockpile, where it joins the base's stock.
 */
export function unloadLander(
  state: CampaignState,
  robot: RobotState,
): GameEvent[] {
  const { unloading } = state;
  if (unloading === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  const id = unloading.landingPadId;
  const { loading, total } = cargoHandlingMinutes();
  if (!unloading.collected) {
    if (!walkRobotTo(state, robot, id, cargoSpot(state), "lander")) return [];
    robot.activity = { kind: "loading-cargo", structureId: id };
    unloading.workedMinutes += robotPerformance(robot);
    if (unloading.workedMinutes >= loading) {
      robot.carrying = collectCargo(state, unloading);
    }
    return [];
  }
  const spot = stockpileSpot(state, { workSpot: cargoSpot(state) });
  if (!walkRobotTo(state, robot, id, spot, "stockpile")) return [];
  robot.activity = { kind: "unloading-cargo", structureId: id };
  unloading.workedMinutes += robotPerformance(robot);
  if (unloading.workedMinutes < total - loading) return [];
  const components = unloading.cargo.map((count) => ({ ...count }));
  finishUnloading(state, unloading);
  robot.carrying = [];
  return [
    { kind: "lander-unloaded", atMinute: state.elapsedMinutes, components },
  ];
}

/**
 * Lets the Robot do one game-minute of loading the Exports to load onto
 * the Lander, standing on a landing pad: it walks to the stockpile and
 * loads them, taking them out of the base's stock, then carries them to the
 * Lander and puts them aboard.
 */
export function loadLander(
  state: CampaignState,
  robot: RobotState,
): GameEvent[] {
  const loading = state.exportLoading;
  if (loading === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  const walkTo = (
    spot: GroundPosition,
    destination: "stockpile" | "lander",
  ): boolean => {
    if (samePlace(robot.position, spot)) return true;
    stepRobot(state, robot, spot);
    robot.activity = { kind: "walking", purpose: "exports", destination };
    return false;
  };
  const { loading: loadingMinutes, total } = exportHandlingMinutes();
  if (!loading.collected) {
    const spot = stockpileSpot(state, { workSpot: cargoSpot(state) });
    if (!walkTo(spot, "stockpile")) return [];
    robot.activity = { kind: "loading-exports" };
    loading.workedMinutes += robotPerformance(robot);
    // Only now do they leave the base's stock: as much of each as is left.
    if (loading.workedMinutes >= loadingMinutes) collectExports(state, loading);
    return [];
  }
  if (!walkTo(cargoSpot(state), "lander")) return [];
  robot.activity = { kind: "putting-exports-aboard" };
  loading.workedMinutes += robotPerformance(robot);
  if (loading.workedMinutes < total - loadingMinutes) return [];
  const exports = finishExportLoading(state);
  return [{ kind: "lander-loaded", atMinute: state.elapsedMinutes, exports }];
}
