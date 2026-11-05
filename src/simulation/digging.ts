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
import { readLunation } from "./lunation";
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
 * has dug for digging to start: below the level that starts it, or, in the
 * data catalogue's hours before Machines are parked for Night, below the
 * level that tops it up, so that the stock goes into the Night full.
 */
export function needsDigging(state: CampaignState): boolean {
  const { resourceId, refillBelowKilograms, topUpBelowKilograms } =
    catalogue.digging;
  const kilograms = bulkInStock(state, resourceId);
  return (
    kilograms < refillBelowKilograms ||
    (kilograms < topUpBelowKilograms && isTopUpTime(state))
  );
}

/**
 * Whether it is the data catalogue's hours of topping up the stock before
 * Machines are parked for Night: from that many hours before parking starts
 * until it does.
 */
export function isTopUpTime(state: CampaignState): boolean {
  const lunation = readLunation(state.elapsedMinutes, catalogue.lunation);
  if (lunation.part !== "daylight") return false;
  const untilParking =
    lunation.minutesRemaining -
    Math.round(catalogue.cold.parkingLeadHours * 60);
  return (
    untilParking > 0 &&
    untilParking <= Math.round(catalogue.digging.topUpHoursBeforeParking * 60)
  );
}

/** What keeps the Machine that digs from digging (see `diggingHold`). */
export type DiggingHold =
  "broken" | "maintenance" | "construction" | "parked-for-night";

/**
 * Why the Machine that digs isn't digging while the base needs digging:
 * it is Broken, undergoing Maintenance, carrying out a stage of
 * Construction, or parked for Night (being parked, or it is time for
 * Machines to be parked where they can plug in, when digging waits for
 * Daylight). Undefined while it is set digging or is free to be, or while
 * the base doesn't need digging.
 */
export function diggingHold(state: CampaignState): DiggingHold | undefined {
  if (!needsDigging(state)) return undefined;
  const digger = state.machines.find(
    (machine) => machine.machineTypeId === catalogue.digging.machineTypeId,
  );
  if (digger === undefined || digger.digging !== undefined) return undefined;
  return (
    whatKeepsFromDigging(state, digger) ??
    (isNightDiggingHeld(state) ? "parked-for-night" : undefined)
  );
}

/**
 * What digging gives way to on a Machine, if anything: it is Broken,
 * undergoing Maintenance, carrying out a stage of Construction or being
 * parked. The one list of them, for `canDig` and `diggingHold`.
 */
function whatKeepsFromDigging(
  state: CampaignState,
  machine: MachineState,
): DiggingHold | undefined {
  const target = { kind: "machine", machineId: machine.id } as const;
  if (isMachineBroken(machine)) return "broken";
  if (isUnderMaintenance(state, target)) return "maintenance";
  if (machine.assignment !== undefined) return "construction";
  if (isBeingParked(state, target)) return "parked-for-night";
  return undefined;
}

/**
 * Whether digging waits for Daylight: it is time for Machines to be parked
 * where they can plug in, which would only take it off digging again.
 */
function isNightDiggingHeld(state: CampaignState): boolean {
  return isParkingTime(state) && powerSockets(state).length > 0;
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
    whatKeepsFromDigging(state, machine) === undefined
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
    !isNightDiggingHeld(state)
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
