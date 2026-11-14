import type { ComponentCount, GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import type { GameEvent } from "./events";
import { spareComponentsFor, spares } from "./maintenance";
import type { RobotState } from "./robot";
import { samePlace, stepRobot } from "./robot-walking";
import {
  finishSelfRepair,
  selfRepairMinutes,
  type SelfRepairState,
} from "./self-repair";
import { recordSpareComponents } from "./self-sufficiency";
import { addCounts, stockpileSpot, takeFromStock } from "./stockpile";

/**
 * Lets the Robot do one game-minute of repairing itself: it fetches the
 * spare Components it needs from the stockpile, if it set off for them,
 * and loads them, then walks to where the Mission Director lives and
 * repairs itself there. Anything it was carrying for its Work Order stays
 * with it.
 */
export function repairItself(
  state: CampaignState,
  robot: RobotState,
  selfRepair: SelfRepairState,
): GameEvent[] {
  const walkTo = (
    spot: GroundPosition,
    destination: "stockpile" | "habitat" | "lander",
  ): boolean => {
    if (samePlace(robot.position, spot)) return true;
    stepRobot(state, robot, spot);
    robot.activity = { kind: "walking-to-repair", destination };
    return false;
  };
  if (selfRepair.spareComponents === undefined) {
    if (
      !walkTo(stockpileSpot(state, { workSpot: selfRepair.spot }), "stockpile")
    ) {
      return [];
    }
    const needed = spareComponentsFor(robot);
    // If they have gone meanwhile, the repair is a makeshift one.
    selfRepair.spareComponents = takeFromStock(state, spares(needed))
      ? needed
      : 0;
    recordSpareComponents(state, { used: selfRepair.spareComponents });
    addCounts(robot.carrying, spares(selfRepair.spareComponents));
  }
  const { loading, total } = selfRepairMinutes(selfRepair.spareComponents);
  if (selfRepair.workedMinutes < loading) {
    robot.activity = { kind: "loading-spare-components" };
    selfRepair.workedMinutes += 1;
    return [];
  }
  if (!walkTo(selfRepair.spot, selfRepair.home)) return [];
  robot.activity = { kind: "repairing-itself" };
  selfRepair.workedMinutes += 1;
  if (selfRepair.workedMinutes < total) return [];
  removeCounts(robot.carrying, spares(selfRepair.spareComponents));
  return finishSelfRepair(state, robot, selfRepair.spareComponents);
}

/** Takes Components out of a list of counts, dropping any count that comes to none. */
function removeCounts(
  counts: ComponentCount[],
  removed: readonly ComponentCount[],
): void {
  for (const { componentId, count } of removed) {
    const index = counts.findIndex(
      (other) => other.componentId === componentId,
    );
    const existing = counts[index];
    if (existing === undefined) continue;
    const left = existing.count - count;
    if (left > 0) counts[index] = { componentId, count: left };
    else counts.splice(index, 1);
  }
}
