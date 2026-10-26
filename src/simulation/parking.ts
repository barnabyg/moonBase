import { catalogue, type GroundPosition } from "../catalogue";
import type { CampaignState } from "./campaign";
import { chooseParkingSpot } from "./construction";
import { readLunation } from "./lunation";
import { isMachineBroken, machineFootprintRadius } from "./machines";
import { isUnderMaintenance } from "./maintenance";
import { nearestPoweredStructure, pluggedIn, powerSockets } from "./power";

/**
 * A "park Machine" Work Order: the Robot drives an idle Machine that isn't
 * plugged in to a free spot beside the nearest powered Structure, where it
 * plugs in and its heater keeps the cold of Night off it.
 */
export interface ParkingState {
  machineId: string;
  /** The Structure it is parked beside, on a network with a power source. */
  structureId: string;
  /** Where the Machine is to stand, within plug-in reach of the Structure. */
  destination: GroundPosition;
}

/** A Machine being parked, or waiting for the Robot to park it. */
export interface ParkingSnapshot {
  readonly machineId: string;
  readonly machineTypeId: string;
  /** The Structure it is to be parked beside. */
  readonly structureId: string;
  readonly structureTypeId: string;
  /** Whether a Robot has claimed it and is carrying it out. */
  readonly underWay: boolean;
}

/**
 * Raises a "park Machine" Work Order, once in the data catalogue's lead
 * time before Night falls and all through Night, for every idle Machine
 * that isn't plugged in, isn't Broken and isn't being maintained, as long
 * as there is a powered Structure to park it beside. A Work Order that
 * nobody has claimed goes once its Machine no longer needs parking, or is
 * given other work; one a Robot has claimed goes only if its Machine
 * breaks or its Structure can no longer take a plug.
 */
export function planParking(state: CampaignState): void {
  const plugs = pluggedIn(state);
  const parkingTime = isParkingTime(state);
  const needsParking = (machineId: string) => {
    const machine = state.machines.find(
      (candidate) => candidate.id === machineId,
    );
    return (
      machine !== undefined &&
      parkingTime &&
      machine.assignment === undefined &&
      !isMachineBroken(machine) &&
      !plugs.has(machine.id) &&
      !isUnderMaintenance(state, machine.id)
    );
  };
  const sockets = powerSockets(state);
  const stillPowered = (parking: ParkingState) =>
    sockets.some((structure) => structure.id === parking.structureId);
  state.parking = state.parking.filter((parking) => {
    const machine = state.machines.find(
      (candidate) => candidate.id === parking.machineId,
    );
    if (machine === undefined || isMachineBroken(machine)) return false;
    if (!stillPowered(parking)) return false;
    return isBeingParked(state, parking.machineId)
      ? true
      : needsParking(parking.machineId);
  });
  for (const machine of state.machines) {
    if (
      !needsParking(machine.id) ||
      state.parking.some((parking) => parking.machineId === machine.id)
    ) {
      continue;
    }
    const structure = nearestPoweredStructure(state, machine.position);
    if (structure === undefined) continue;
    state.parking.push({
      machineId: machine.id,
      structureId: structure.id,
      destination: chooseParkingSpot(
        state,
        structure,
        machine,
        state.parking.map((other) => ({
          position: other.destination,
          radius: machineFootprintRadius(
            state.machines.find((candidate) => candidate.id === other.machineId)
              ?.machineTypeId ?? "",
          ),
        })),
      ),
    });
  }
}

/**
 * Whether Machines are parked now: from the data catalogue's lead time
 * before Night falls until Night ends.
 */
export function isParkingTime(state: CampaignState): boolean {
  const lunation = readLunation(state.elapsedMinutes, catalogue.lunation);
  return (
    lunation.part === "night" ||
    lunation.minutesRemaining <=
      Math.round(catalogue.cold.parkingLeadHours * 60)
  );
}

/** Whether a Robot has claimed the Work Order to park a Machine, and is parking it. */
export function isBeingParked(
  state: CampaignState,
  machineId: string,
): boolean {
  return state.robots.some(
    (robot) =>
      robot.workOrder?.kind === "park-machine" &&
      robot.workOrder.machineId === machineId,
  );
}

export function readParking(state: CampaignState): ParkingSnapshot[] {
  return state.parking.flatMap((parking) => {
    const machine = state.machines.find(
      (candidate) => candidate.id === parking.machineId,
    );
    const structure = state.structures.find(
      (candidate) => candidate.id === parking.structureId,
    );
    if (machine === undefined || structure === undefined) return [];
    return [
      {
        machineId: machine.id,
        machineTypeId: machine.machineTypeId,
        structureId: structure.id,
        structureTypeId: structure.structureTypeId,
        underWay: isBeingParked(state, machine.id),
      },
    ];
  });
}
