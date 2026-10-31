import { catalogue } from "../catalogue";
import type {
  ExpeditionSnapshot,
  MachineSnapshot,
  MaintenanceSnapshot,
  RobotSnapshot,
  RoverSnapshot,
} from "../simulation";
import { formatPerformance } from "./format";
import { resourceLabel } from "./labels";
import type { Stat } from "./stat";

// What the base's Robots, Machines and Rover are doing, in words, for the
// Base panel.

/**
 * Says what a Machine is doing, and whether it is plugged in and powered,
 * working below par or due Maintenance, for the status panel, for example
 * "idle" and "plugged in and powered", or "Broken" and "awaiting
 * Maintenance". Its Condition is shown beside it.
 */
export function formatMachine(
  machine: MachineSnapshot,
  maintenance: readonly MaintenanceSnapshot[],
): Stat {
  const broken = machine.conditionPercent <= 0;
  const doing = broken
    ? "Broken"
    : machine.activity.kind === "working"
      ? "working"
      : machine.activity.kind === "being-positioned"
        ? "being driven to a site"
        : machine.activity.kind === "being-parked"
          ? "being parked"
          : machine.activity.kind === "being-positioned-to-dig"
            ? "being set digging"
            : machine.activity.kind === "digging"
              ? `digging ${resourceLabel(catalogue.digging.resourceId)}`
              : "idle";
  const order = maintenance.find(
    ({ target }) =>
      target.kind === "machine" && target.machineId === machine.id,
  );
  return {
    value: doing,
    ...notes([
      broken ? undefined : plugState(machine),
      formatPerformance(machine.performance),
      maintenanceState(order),
    ]),
  };
}

/** Whether a Machine or Rover is plugged in to charge, and whether it has power. */
function plugState(driven: {
  readonly pluggedIn: boolean;
  readonly powered: boolean;
}): string {
  return !driven.pluggedIn
    ? "not plugged in"
    : driven.powered
      ? "plugged in and powered"
      : "plugged in, no power";
}

/**
 * Says how something is repaired, which the Robot always does by itself:
 * Maintenance for a Structure, Machine or Rover, or a Robot's repair of
 * itself.
 */
export function describeRepair(kind: "maintained" | "robot"): string {
  return kind === "maintained"
    ? `Repairs are automatic: the Robot repairs anything below ${catalogue.maintenance.thresholdPercent}% Condition, or Broken, using spare Components from the base's stock. Ship more on the Launch manifest, or make them in a Workshop.`
    : `A Robot below ${catalogue.robot.selfRepairThresholdPercent}% repairs itself, using spare Components too.`;
}

/** Whether a Maintenance Work Order is waiting or under way, if there is one. */
export function maintenanceState(
  order: MaintenanceSnapshot | undefined,
): string | undefined {
  if (order === undefined) return undefined;
  return order.underWay ? "undergoing Maintenance" : "awaiting Maintenance";
}

/** Joins the notes that apply into one, or leaves the note out if none do. */
function notes(parts: readonly (string | undefined)[]): { note?: string } {
  const present = parts.filter((part) => part !== undefined);
  return present.length === 0 ? {} : { note: present.join(", ") };
}

/**
 * Says what a Robot is doing, and whether it works below par, for the
 * status panel, for example "working", "repairing itself at the Habitat"
 * and "working at 18%", or, for one a Launch has just brought, "climbing
 * down from the Lander". Its Condition is shown beside it.
 */
export function formatRobot(
  robot: RobotSnapshot,
  expedition?: ExpeditionSnapshot,
): Stat {
  const { activity, selfRepair } = robot;
  const performance = notes([formatPerformance(robot.performance)]);
  if (isOnExpedition(robot.id, expedition)) {
    return { value: "on an Expedition", ...performance };
  }
  if (activity.kind === "climbing-down") {
    return { value: "climbing down from the Lander", ...performance };
  }
  if (activity.kind === "walking-to-stockpile") {
    return { value: "walking to the stockpile, just arrived", ...performance };
  }
  const where =
    selfRepair === undefined
      ? ""
      : ` at the ${selfRepair.home === "habitat" ? "Habitat" : "Lander"}`;
  const doing =
    selfRepair === undefined
      ? activity.kind === "idle"
        ? "idle"
        : "working"
      : activity.kind === "repairing-itself"
        ? `${selfRepair.makeshift ? "making a makeshift repair" : "repairing itself"}${where}`
        : `going to repair itself${where}`;
  return { value: doing, ...performance };
}

/**
 * Whether a Robot has set off on an Expedition, so that every Work Order
 * waits for it: from walking to the Rover until it has unloaded what it
 * brought back.
 */
export function isOnExpedition(
  robotId: string,
  expedition: ExpeditionSnapshot | undefined,
): boolean {
  return (
    expedition !== undefined &&
    expedition.robotId === robotId &&
    expedition.stage !== "boarding"
  );
}

/**
 * Whether every Robot has set off on an Expedition, so that every Work
 * Order waits until one is back.
 */
export function isEveryRobotOnExpedition(
  robots: readonly Pick<RobotSnapshot, "id">[],
  expedition: ExpeditionSnapshot | undefined,
): boolean {
  return (
    robots.length > 0 &&
    robots.every((robot) => isOnExpedition(robot.id, expedition))
  );
}

/**
 * Says what the Rover is doing, and whether it is plugged in and powered,
 * working below par or due Maintenance, for the status panel, for example
 * "parked" and "not plugged in", or "Broken" and "awaiting Maintenance".
 * Its Condition is shown beside it.
 */
export function formatRover(
  rover: RoverSnapshot,
  maintenance: readonly MaintenanceSnapshot[],
): Stat {
  const broken = rover.conditionPercent <= 0;
  const doing = broken
    ? "Broken"
    : rover.activity.kind === "being-parked"
      ? "being parked"
      : rover.activity.kind === "on-expedition"
        ? "on an Expedition"
        : "parked";
  const order = maintenance.find(
    ({ target }) => target.kind === "rover" && target.roverId === rover.id,
  );
  return {
    value: doing,
    ...notes([
      broken ? undefined : plugState(rover),
      formatPerformance(rover.performance),
      maintenanceState(order),
    ]),
  };
}
