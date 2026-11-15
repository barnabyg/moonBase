import { catalogue, type GroundPosition } from "../catalogue";
import { findObservingSite } from "./observing-sites";
import { addBulk } from "./bulk-resources";
import type { CampaignState } from "./campaign";
import type { Driven } from "./driven";
import type { GameEvent } from "./events";
import {
  awayMinutes,
  exitPointFrom,
  expeditionTypeOf,
  returnSpot,
  unloadingMinutes,
  wearRoverOnExpedition,
  type ExpeditionState,
} from "./expeditions";
import type { RobotState } from "./robot";
import { besideDriven, samePlace, walkRobotToDriven } from "./robot-walking";
import { isRoverBroken, roverPerformance } from "./rovers";
import { robotPerformance } from "./self-repair";
import { obstaclesFor, stepTowards } from "./walking";

/**
 * Lets the Robot do one game-minute of an Expedition: it walks to the
 * Rover, drives it to the nearest map edge and off the map, is away for the
 * data catalogue's time, then drives back onto the map to the ice store and
 * unloads what it brought back, which joins the base's stock. A Rover
 * Broken before it is driven off calls the Expedition off. Returns any
 * events.
 */
export function goOnExpedition(
  state: CampaignState,
  robot: RobotState,
  expedition: ExpeditionState,
): GameEvent[] {
  const rover = state.rovers.find(
    (candidate) => candidate.id === expedition.roverId,
  );
  if (rover === undefined) {
    state.expedition = undefined;
    robot.activity = { kind: "idle" };
    return [];
  }
  const atMinute = state.elapsedMinutes;
  /** Drives the Rover one game-minute towards a spot, and says whether it is there. */
  const drive = (spot: GroundPosition): boolean => {
    rover.position = stepTowards(
      rover.position,
      spot,
      obstaclesFor(state, catalogue.rover.footprintRadiusMetres),
      (catalogue.rover.drivingSpeedMetresPerHour * roverPerformance(rover)) /
        60,
    );
    robot.position = { ...rover.position };
    robot.activity = {
      kind: "driving-rover",
      roverId: rover.id,
      purpose: "expedition",
    };
    rover.activity = { kind: "on-expedition" };
    wearRoverOnExpedition(rover);
    return samePlace(rover.position, spot);
  };
  /** Drives the Rover back onto the map, beside the ice store, to unload. */
  const driveBack = (): GameEvent[] => {
    if (drive(returnSpot(state, expedition.exitPoint ?? rover.position))) {
      expedition.stage = "unloading";
    }
    return [];
  };
  switch (expedition.stage) {
    case "boarding": {
      if (isRoverBroken(rover)) {
        state.expedition = undefined;
        robot.activity = { kind: "idle" };
        return [{ kind: "expedition-called-off", atMinute }];
      }
      // Another Robot maintaining or parking the Rover finishes first.
      if (
        state.robots.some(
          ({ id, workOrder }) =>
            id !== robot.id &&
            workOrder !== undefined &&
            "roverId" in workOrder &&
            workOrder.roverId === rover.id,
        )
      ) {
        robot.activity = { kind: "idle" };
        return [];
      }
      const driven: Driven = { kind: "rover", rover };
      if (
        !walkRobotToDriven(
          state,
          robot,
          driven,
          besideDriven(state, driven),
          "there",
        )
      ) {
        return [];
      }
      expedition.stage = "driving-out";
      expedition.exitPoint = exitPointFrom(rover.position);
      return [];
    }
    case "driving-out": {
      const exit = expedition.exitPoint ?? exitPointFrom(rover.position);
      if (!drive(exit)) return [];
      expedition.stage = "away";
      expedition.returnsAtMinute = atMinute + awayMinutes(expedition);
      return [
        {
          kind: "expedition-left",
          atMinute,
          returnsAtMinute: expedition.returnsAtMinute,
        },
      ];
    }
    case "away":
      if (atMinute < (expedition.returnsAtMinute ?? atMinute)) {
        robot.activity = { kind: "on-expedition" };
        rover.activity = { kind: "on-expedition" };
        wearRoverOnExpedition(rover);
        return [];
      }
      expedition.stage = "driving-back";
      return driveBack();
    case "driving-back":
      return driveBack();
    case "unloading": {
      robot.activity = { kind: "unloading-expedition" };
      expedition.workedMinutes += robotPerformance(robot);
      if (expedition.workedMinutes < unloadingMinutes()) return [];
      const type = expeditionTypeOf(expedition);
      state.expedition = undefined;
      if (type.kind === "science") {
        state.science += type.science;
        return [
          {
            kind: "survey-returned",
            atMinute,
            science: type.science,
            observingSiteKindId: findObservingSite(state)?.kindId,
          },
        ];
      }
      const { resourceId, kilograms } = type;
      addBulk(state, resourceId, kilograms);
      return [{ kind: "expedition-returned", atMinute, resourceId, kilograms }];
    }
  }
}
