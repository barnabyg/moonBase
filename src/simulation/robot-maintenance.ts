import type { GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import type { GameEvent } from "./events";
import {
  currentStep,
  findWorn,
  finishMaintenance,
  plannedVisit,
  spares,
  type MaintenanceState,
} from "./maintenance";
import type { RobotActivity, RobotState } from "./robot";
import { besideDriven, walkRobotTo, walkRobotToDriven } from "./robot-walking";
import { robotPerformance } from "./self-repair";
import { recordSpareComponents } from "./self-sufficiency";
import { stockpileSpot, takeFromStock } from "./stockpile";

/**
 * Lets the Robot do one game-minute of Maintenance on a Structure or
 * Machine. To restore its Condition, the Robot takes the spare Components
 * it needs from the base's stock and loads them at the stockpile, then
 * carries them there and works on it until its Condition is back to 100%,
 * using them up. To clean a solar array, it walks straight there; after
 * restoring Condition, it cleans on the same visit.
 */
export function maintain(
  state: CampaignState,
  robot: RobotState,
  maintenance: MaintenanceState,
): GameEvent[] {
  const worn = findWorn(state, maintenance.target);
  if (worn === undefined) {
    robot.workOrder = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  const walkTo = (spot: GroundPosition, destination: "stockpile" | "site") =>
    worn.kind === "structure"
      ? walkRobotTo(state, robot, worn.structure.id, spot, destination)
      : walkRobotToDriven(
          state,
          robot,
          worn,
          spot,
          destination === "site" ? "there" : "stockpile",
        );
  const working = (
    kind: "loading-components" | "maintaining",
  ): RobotActivity => {
    switch (worn.kind) {
      case "structure":
        return { kind, structureId: worn.structure.id };
      case "machine":
        return { kind, machineId: worn.machine.id };
      case "rover":
        return { kind, roverId: worn.rover.id };
    }
  };
  if (maintenance.visit === undefined) {
    // A Machine or Rover stays where it is once it is being maintained.
    if (worn.kind !== "structure") {
      maintenance.workSpot = besideDriven(state, worn);
    }
    let visit = plannedVisit(state, maintenance, worn);
    if (visit.spareComponents > 0) {
      if (!walkTo(stockpileSpot(state, maintenance), "stockpile")) return [];
      if (!takeFromStock(state, spares(visit.spareComponents))) {
        // Another Robot took them first. This Maintenance now waits for
        // more, unless there is an array to clean meanwhile.
        if (!visit.cleaning) {
          robot.workOrder = undefined;
          robot.activity = { kind: "idle" };
          return [];
        }
        visit = { spareComponents: 0, cleaning: true };
      }
    }
    maintenance.visit = visit;
    recordSpareComponents(state, { used: visit.spareComponents });
    robot.carrying = spares(visit.spareComponents);
  }
  const current = currentStep(maintenance.visit, maintenance.workedMinutes);
  if (current?.step === "loading-spare-components") {
    robot.activity = working("loading-components");
    maintenance.workedMinutes += robotPerformance(robot);
    return [];
  }
  if (current !== undefined) {
    if (!walkTo(maintenance.workSpot, "site")) return [];
    robot.activity =
      current.step === "cleaning" && worn.kind === "structure"
        ? { kind: "cleaning", structureId: worn.structure.id }
        : working("maintaining");
    maintenance.workedMinutes += robotPerformance(robot);
    if (
      currentStep(maintenance.visit, maintenance.workedMinutes) !== undefined
    ) {
      return [];
    }
  }
  robot.carrying = [];
  return finishMaintenance(state, maintenance, worn);
}
