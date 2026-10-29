import { catalogue, type GroundPosition } from "../catalogue";
import { addBulk, bulkInStock, setBulk } from "./bulk-resources";
import type { CampaignState } from "./campaign";
import type { GameEvent } from "./events";
import {
  findMachineType,
  isMachineBroken,
  machinePerformance,
  wearMachine,
  type MachineState,
} from "./machines";
import { isUnderMaintenance } from "./maintenance";
import { isBeingParked, isParkingTime } from "./parking";
import { powerSockets } from "./power";

/**
 * A Machine set to dig beside the stockpile, from the Robot claiming the
 * digging Work Order until it stops.
 */
export interface MachineDigging {
  /** Where the Machine stands to dig, beside the stockpile. */
  destination: GroundPosition;
  /** The Robot's working time spent activating it so far. */
  activationMinutes: number;
  /** Whether it has been activated and is digging by itself. */
  working: boolean;
}

/**
 * Whether the base has fallen low enough on the resource the data catalogue
 * has dug for digging to start.
 */
export function needsDigging(state: CampaignState): boolean {
  const { resourceId, refillBelowKilograms } = catalogue.digging;
  return bulkInStock(state, resourceId) < refillBelowKilograms;
}

/** Whether digging under way should carry on: the stock isn't full yet. */
function isShort(state: CampaignState): boolean {
  const { resourceId, fullKilograms } = catalogue.digging;
  return bulkInStock(state, resourceId) < fullKilograms;
}

/**
 * Whether a Machine is free to dig: it is of the type that digs, and isn't
 * carrying out a stage of Construction, Broken, undergoing Maintenance or
 * being parked. Digging always gives way to these.
 */
export function canDig(state: CampaignState, machine: MachineState): boolean {
  return (
    machine.machineTypeId === catalogue.digging.machineTypeId &&
    machine.assignment === undefined &&
    !isMachineBroken(machine) &&
    !isUnderMaintenance(state, { kind: "machine", machineId: machine.id }) &&
    !isBeingParked(state, { kind: "machine", machineId: machine.id })
  );
}

/**
 * Whether a digging Work Order may be carried out for a Machine now: the
 * base needs digging, the Machine is free to dig and isn't digging yet, and
 * it isn't time for Machines to be parked where they can plug in, which
 * would only take it off digging again.
 */
export function isDiggingWanted(
  state: CampaignState,
  machine: MachineState,
): boolean {
  return (
    needsDigging(state) &&
    canDig(state, machine) &&
    machine.digging?.working !== true &&
    !(isParkingTime(state) && powerSockets(state).length > 0)
  );
}

/** Whether a Robot holds the digging Work Order for a Machine. */
function isClaimed(state: CampaignState, machine: MachineState): boolean {
  return state.robots.some(
    (robot) =>
      robot.workOrder?.kind === "dig" &&
      robot.workOrder.machineId === machine.id,
  );
}

/**
 * Lets a Machine with no stage of Construction dig for a game-minute, if it
 * has been set digging: it adds the resource to the base's stock as fast as
 * its Condition allows, wearing down by Dust as it works, until the stock
 * is full. It stops as soon as it is no longer free to dig; cut short that
 * way, it starts again only once the stock falls below the level that
 * starts digging. Returns the event if it broke.
 */
export function dig(state: CampaignState, machine: MachineState): GameEvent[] {
  const { digging } = machine;
  if (
    digging !== undefined &&
    !(
      canDig(state, machine) &&
      (digging.working
        ? isShort(state)
        : needsDigging(state) && isClaimed(state, machine))
    )
  ) {
    machine.digging = undefined;
  }
  if (machine.digging === undefined) {
    machine.activity = { kind: "idle" };
    return [];
  }
  if (!machine.digging.working) {
    machine.activity = { kind: "being-positioned-to-dig" };
    return [];
  }
  machine.activity = { kind: "digging" };
  const { resourceId, fullKilograms, kilogramsPerWorkingHour } =
    catalogue.digging;
  const dug = (kilogramsPerWorkingHour * machinePerformance(machine)) / 60;
  if (bulkInStock(state, resourceId) + dug < fullKilograms) {
    addBulk(state, resourceId, dug);
  } else {
    setBulk(state, resourceId, fullKilograms);
    machine.digging = undefined;
  }
  return wearMachine(
    state,
    machine,
    findMachineType(machine.machineTypeId)?.dustWearPercentPerWorkingHour ?? 0,
  );
}
