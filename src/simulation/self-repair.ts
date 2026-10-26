import { catalogue, type GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import { performanceAt } from "./condition";
import { chooseWorkSpot } from "./construction";
import type { GameEvent } from "./events";
import { spareComponentsFor } from "./maintenance";
import type { RobotState } from "./robot";
import { inStock } from "./stockpile";
import { cargoSpot } from "./unloading";

/**
 * A Robot repairing itself, which it does ahead of everything else once
 * its Condition falls below the data catalogue's threshold. It isn't a
 * Work Order: the Robot keeps the Work Order it was on, and anything it
 * carries, and takes it up again afterwards. It collects spare Components
 * at the stockpile, if there are enough, then goes to wherever the Mission
 * Director lives and repairs itself there.
 */
export interface SelfRepairState {
  /** Where it repairs itself: the Habitat or the Lander the Mission Director lived in as it set off. */
  home: "habitat" | "lander";
  /** Where it stands there to repair itself. */
  spot: GroundPosition;
  /**
   * The spare Components it has taken from the base's stock for the
   * repair, or undefined while it is on its way to the stockpile for them.
   * With none, the repair is a makeshift one.
   */
  spareComponents: number | undefined;
  /** The Robot's working time so far: loading any spare Components, then repairing itself. */
  workedMinutes: number;
}

/** A Robot repairing itself, for the interface. */
export interface SelfRepairSnapshot {
  readonly home: "habitat" | "lander";
  /**
   * The spare Components it uses: those it has taken from the base's
   * stock, or those it is on its way to the stockpile for.
   */
  readonly spareComponents: number;
  /** Whether it is a makeshift repair, for want of spare Components. */
  readonly makeshift: boolean;
}

/**
 * How fast a Robot walks and works as its Condition falls, from 1 down,
 * along the data catalogue's curve. Its Condition never reaches 0%, so it
 * never stops.
 */
export function robotPerformance(
  robot: Pick<RobotState, "conditionPercent">,
): number {
  return performanceAt(catalogue.robot.performance, robot.conditionPercent);
}

/**
 * Wears a Robot down by Dust for the latest game-minute if it was doing
 * anything but standing idle or repairing itself, at the data catalogue's
 * rate, never below its floor. It comes first in the Robot's game-minute,
 * so a Robot that has just repaired itself ends the game-minute at 100%.
 */
export function wearRobot(robot: RobotState): void {
  if (
    robot.activity.kind === "idle" ||
    robot.activity.kind === "repairing-itself"
  ) {
    return;
  }
  wearRobotDown(robot, catalogue.robot.dustWearPercentPerHour / 60);
}

/** Takes Condition off a Robot, never below the data catalogue's floor. */
export function wearRobotDown(robot: RobotState, percent: number): void {
  robot.conditionPercent = Math.max(
    robot.conditionPercent - percent,
    catalogue.robot.conditionFloorPercent,
  );
}

/**
 * Sets a Robot off to repair itself once its Condition has fallen below the
 * data catalogue's threshold: to the stockpile first if the base's stock
 * has the spare Components it needs, otherwise straight to where the
 * Mission Director lives, for a makeshift repair. Returns the event.
 */
export function startSelfRepair(
  state: CampaignState,
  robot: RobotState,
): GameEvent[] {
  if (
    robot.selfRepair !== undefined ||
    robot.conditionPercent >= catalogue.robot.selfRepairThresholdPercent
  ) {
    return [];
  }
  const needed = spareComponentsFor(robot);
  const enough =
    inStock(state, catalogue.maintenance.spareComponentId) >= needed;
  const { missionDirector } = state;
  const habitat =
    missionDirector.residence === "habitat"
      ? state.structures.find(
          (structure) => structure.id === missionDirector.habitatId,
        )
      : undefined;
  robot.selfRepair = {
    home: habitat === undefined ? "lander" : "habitat",
    spot:
      habitat === undefined ? cargoSpot(state) : chooseWorkSpot(state, habitat),
    spareComponents: enough ? undefined : 0,
    workedMinutes: 0,
  };
  return [
    {
      kind: "robot-self-repair-started",
      atMinute: state.elapsedMinutes,
      robotId: robot.id,
      conditionPercent: robot.conditionPercent,
      home: robot.selfRepair.home,
      makeshift: !enough,
    },
  ];
}

/** The Robot's working time to load the spare Components for its repair, and in all, in game-minutes. */
export function selfRepairMinutes(spareComponents: number): {
  loading: number;
  total: number;
} {
  const loading =
    spareComponents > 0
      ? Math.round(catalogue.maintenance.loadingHours * 60)
      : 0;
  return {
    loading,
    total: loading + Math.round(catalogue.robot.selfRepairHours * 60),
  };
}

/**
 * Ends a Robot's repair of itself: back to 100% with spare Components, or
 * to the data catalogue's makeshift level without, if that is more than it
 * has. Returns the event.
 */
export function finishSelfRepair(
  state: CampaignState,
  robot: RobotState,
  spareComponents: number,
): GameEvent[] {
  robot.conditionPercent =
    spareComponents > 0
      ? 100
      : Math.max(
          robot.conditionPercent,
          catalogue.robot.makeshiftRepairPercent,
        );
  robot.selfRepair = undefined;
  return [
    {
      kind: "robot-repaired",
      atMinute: state.elapsedMinutes,
      robotId: robot.id,
      conditionPercent: robot.conditionPercent,
      spareComponents,
    },
  ];
}

export function readSelfRepair(
  robot: RobotState,
): SelfRepairSnapshot | undefined {
  const { selfRepair } = robot;
  if (selfRepair === undefined) return undefined;
  const spareComponents =
    selfRepair.spareComponents ?? spareComponentsFor(robot);
  return {
    home: selfRepair.home,
    spareComponents,
    makeshift: spareComponents === 0,
  };
}
